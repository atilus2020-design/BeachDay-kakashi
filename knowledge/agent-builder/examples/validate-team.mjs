// Example 1 — validate the whole team: frontmatter parses, required fields, allowed model/colour,
// every skills: entry exists, every agent has a knowledge folder with docs/ and examples/,
// and the "Before you answer" section is present. Run from repo root: node knowledge/agent-builder/examples/validate-team.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
const fm = (txt) => { const m = /^---\n([\s\S]*?)\n---/.exec(txt); if (!m) throw new Error("no frontmatter");
  const o = {}; let key = null;
  for (const line of m[1].split("\n")) {
    const li = /^\s+-\s+(.+)$/.exec(line); if (li && key) { (o[key] ||= []).push(li[1].trim()); continue; }
    const kv = /^([\w-]+):\s*(.*)$/.exec(line); if (kv) { key = kv[1]; let v = kv[2].trim();
      if (v.startsWith('"')) v = JSON.parse(v); else if (/:\s/.test(v)) throw new Error(`unquoted ': ' in ${key}`); o[key] = v || undefined; }
  } return o; };
const skills = new Set(readdirSync(".claude/skills"));
const MODELS = new Set(["opus", "sonnet", "haiku", "fable", "inherit"]), COLORS = new Set(["red","blue","green","yellow","purple","orange","pink","cyan"]);
let errors = 0; const err = (f, m) => { console.log(`FAIL ${f}: ${m}`); errors++; };
for (const s of skills) { try { const f = fm(readFileSync(`.claude/skills/${s}/SKILL.md`, "utf8")); if (!f.description) err(s, "skill missing description"); if (f.description?.length > 1536) err(s, "description > 1536"); } catch (e) { err(s, e.message); } }
const agents = readdirSync(".claude/agents").filter((f) => f.endsWith(".md"));
for (const file of agents) {
  const txt = readFileSync(`.claude/agents/${file}`, "utf8"); let f;
  try { f = fm(txt); } catch (e) { err(file, e.message); continue; }
  if (f.name + ".md" !== file) err(file, "name must match filename");
  if (!f.description) err(file, "missing description");
  if (!MODELS.has(f.model) && !/^claude-/.test(f.model || "")) err(file, `bad model ${f.model}`);
  if (f.color && !COLORS.has(f.color)) err(file, `bad color ${f.color}`);
  for (const s of f.skills || []) if (!skills.has(s)) err(file, `unknown skill ${s}`);
  if (!txt.includes("## Before you answer") || !txt.includes(`knowledge/${f.name}/`)) err(file, "missing Before you answer section");
  for (const d of ["docs", "examples"]) if (!existsSync(`knowledge/${f.name}/${d}`) || !readdirSync(`knowledge/${f.name}/${d}`).length) err(file, `knowledge/${f.name}/${d} empty`);
}
console.log(`${agents.length} agents, ${skills.size} skills checked, ${errors} errors`);
process.exit(errors ? 1 : 0);
