#!/usr/bin/env node
// Build the Agent Console manifest from .claude/agents/*.md (build-plan §9.3, doc 04 §4.1).
//
// Writes (git-ignored):
//   netlify/functions/_generated/agents.json          public AgentSummary[] (no prompts)
//   netlify/functions/_generated/agents-private.json  { [name]: { model, system } }, server-only
//
// system = agent body + every skill in its `skills:` list + its knowledge files,
// capped at ~120,000 characters (examples are truncated first, then docs, then skills).
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_DIR = path.join(ROOT, ".claude/agents");
const SKILLS_DIR = path.join(ROOT, ".claude/skills");
const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");
const OUT_DIR = path.join(ROOT, "netlify/functions/_generated");

const SYSTEM_CAP = 120_000;
const MAX_KNOWLEDGE_FILE = 20_000; // skip larger fixtures/files from the prompt text (still listed)
const ALIASES = { opus: "claude-opus-5-5", inherit: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" };
const MODEL_ALLOW = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"]);
const TEXT_EXT = new Set([".md", ".mjs", ".js", ".ts", ".mts", ".json", ".sql", ".txt", ".css", ".html", ".yml", ".yaml", ".toml", ".svg"]);
const SKIP_NAMES = new Set(["package-lock.json", "node_modules", ".DS_Store"]);

function fail(msg) {
  console.error(`build-agents: ${msg}`);
  process.exit(1);
}

/** Minimal YAML-frontmatter parser for the subset used in .claude/agents (scalars, quoted strings, lists). */
export function parseFrontmatter(src, file = "agent") {
  const text = src.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) fail(`${file}: missing YAML frontmatter`);
  const data = {};
  let listKey = null;
  for (const raw of m[1].split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && listKey) {
      data[listKey].push(unquote(item[1].trim(), file));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (!kv) fail(`${file}: cannot parse frontmatter line: ${raw}`);
    const [, key, value] = kv;
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = unquote(/^["']/.test(value) ? value.trim() : value.replace(/\s+#.*$/, "").trim(), file);
      listKey = null;
    }
  }
  return { data, body: m[2] };
}

function unquote(v, file) {
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      fail(`${file}: bad double-quoted string: ${v}`);
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function resolveModel(raw, file) {
  const v = (raw ?? "inherit").trim();
  if (ALIASES[v]) return { model: ALIASES[v], modelAlias: v === "inherit" ? "opus" : v };
  if (MODEL_ALLOW.has(v)) return { model: v, modelAlias: "custom" };
  fail(`${file}: model "${v}" is not an alias or an allowed model ID`);
}

function plain(md) {
  return md
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isBinary(buf) {
  if (buf.includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return false;
  } catch {
    return true;
  }
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_NAMES.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

function knowledgeFiles(agent) {
  const files = [];
  for (const kind of ["docs", "examples"]) {
    for (const full of walk(path.join(KNOWLEDGE_DIR, agent, kind))) {
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      const ext = path.extname(full).toLowerCase();
      const buf = readFileSync(full);
      const text = TEXT_EXT.has(ext) && !isBinary(buf) ? buf.toString("utf8") : null;
      const heading = text && ext === ".md" ? /^#\s+(.+)$/m.exec(text)?.[1] : null;
      files.push({ kind, path: rel, title: heading ? plain(heading) : path.basename(full), text, size: buf.length });
    }
  }
  return files;
}

/** Assemble sections in priority order; when over the cap, cut lowest-priority sections first. */
function assemble(sections, cap) {
  // priority: 0 = body (never cut), 1 = skills, 2 = docs, 3 = examples
  let total = sections.reduce((n, s) => n + s.text.length, 0);
  for (const prio of [3, 2, 1]) {
    for (let i = sections.length - 1; i >= 0 && total > cap; i--) {
      const s = sections[i];
      if (s.prio !== prio || s.text.length === 0) continue;
      const keep = Math.max(0, s.text.length - (total - cap));
      const note = `\n[…truncated to fit the prompt budget]\n`;
      const next = keep > 400 ? s.text.slice(0, keep - note.length) + note : "";
      total -= s.text.length - next.length;
      s.text = next;
    }
  }
  return sections.map((s) => s.text).filter(Boolean).join("\n\n");
}

function build() {
  if (!existsSync(AGENTS_DIR)) fail(".claude/agents not found");
  const summaries = [];
  const priv = {};
  for (const fname of readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).sort()) {
    const file = `.claude/agents/${fname}`;
    const { data, body } = parseFrontmatter(readFileSync(path.join(AGENTS_DIR, fname), "utf8"), file);
    const name = data.name;
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) fail(`${file}: invalid name`);
    if (summaries.some((a) => a.name === name)) fail(`${file}: duplicate agent name ${name}`);
    const { model, modelAlias } = resolveModel(data.model, file);

    const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? name;
    const displayName = plain(heading.split(/\s+[—–-]\s+/)[0]).split(/\s+/)[0] || name;
    const afterHeading = body.slice(body.indexOf(heading) + heading.length);
    const firstPara = afterHeading.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("#")) ?? "";
    const personality = plain(firstPara.replace(/^\*\*Personality:\*\*\s*/i, "")).slice(0, 600);

    const skills = Array.isArray(data.skills) ? data.skills : [];
    const knowledge = knowledgeFiles(name);

    const sections = [{ prio: 0, text: body.trim() }];
    for (const s of skills) {
      if (!/^[a-z0-9-]+$/.test(s)) fail(`${file}: bad skill name ${s}`);
      const p = path.join(SKILLS_DIR, s, "SKILL.md");
      if (!existsSync(p)) fail(`${file}: skill ${s} not found (${path.relative(ROOT, p)})`);
      sections.push({ prio: 1, text: `<skill name="${s}">\n${readFileSync(p, "utf8").trim()}\n</skill>` });
    }
    for (const k of knowledge) {
      if (k.text === null || k.size > MAX_KNOWLEDGE_FILE) continue;
      sections.push({ prio: k.kind === "docs" ? 2 : 3, text: `<knowledge path="${k.path}">\n${k.text.trim()}\n</knowledge>` });
    }
    const system = assemble(sections, SYSTEM_CAP);

    summaries.push({
      name,
      displayName,
      description: typeof data.description === "string" ? data.description : "",
      model,
      modelAlias,
      personality,
      ...(typeof data.color === "string" ? { color: data.color } : {}),
      knowledge: knowledge.map((k) => ({ path: k.path, title: k.title })),
    });
    priv[name] = { model, system };
  }
  if (summaries.length === 0) fail("no agents found");

  mkdirSync(OUT_DIR, { recursive: true });
  const pub = JSON.stringify(summaries, null, 2) + "\n";
  const sec = JSON.stringify(priv) + "\n";
  writeFileSync(path.join(OUT_DIR, "agents.json"), pub);
  writeFileSync(path.join(OUT_DIR, "agents-private.json"), sec);
  console.log(`build-agents: ${summaries.length} agents → agents.json ${pub.length} B, agents-private.json ${sec.length} B`);
  for (const a of summaries) console.log(`  ${a.name.padEnd(32)} ${a.displayName.padEnd(7)} ${a.model.padEnd(18)} system ${priv[a.name].system.length} chars, ${a.knowledge.length} knowledge files`);
}

build();
