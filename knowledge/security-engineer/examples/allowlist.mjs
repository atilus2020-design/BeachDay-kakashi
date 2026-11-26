// Example 1 — the write path allow-list (path-allowlist skill) with its fuzz tests. Run: node allowlist.mjs
import path from "node:path";
const ALLOW = ["src/app/", "src/pages/", "src/lib/", "src/styles/", "src/scoring/", "src/data/", "public/", "tests/", "docs/", "knowledge/"];
const DENY_PREFIX = [".github/", ".claude/", "netlify/", "scripts/"];
const DENY_EXACT = ["netlify.toml", "package.json", "package-lock.json"];
const DENY_RE = [/(^|\/)\.env/i, /\.(pem|key)$/i, /^vite\.config\./i];

export function assertWritablePath(p) {
  const bad = (why) => { throw new Error(`rejected ${JSON.stringify(p)}: ${why}`); };
  if (typeof p !== "string" || !p || p.length > 200) bad("length");
  if (/[\\\0]/.test(p) || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) bad("absolute or illegal char");
  if (/[^\x20-\x7E]/.test(p)) bad("non-ASCII");                 // blocks Unicode look-alikes
  if (path.posix.normalize(p) !== p || p.split("/").some((s) => s === "" || s === "." || s === "..")) bad("not normalized");
  const lower = p.toLowerCase();                                // case tricks against deny rules
  if (DENY_EXACT.includes(lower) || DENY_PREFIX.some((d) => lower.startsWith(d)) || DENY_RE.some((r) => r.test(p))) bad("denied");
  if (!ALLOW.some((a) => p.startsWith(a))) bad("not in allow-list");
  return p;
}
const mustReject = ["../netlify.toml", "src/../netlify.toml", "/etc/passwd", "src\\app.ts", "src/app/./x.ts", "src//x.ts",
  "SRC/app.ts", "NETLIFY.TOML", ".github/workflows/x.yml", "netlify/functions/approve.mts", ".claude/agents/x.md",
  "package.json", "a".repeat(201), "", "src/app/\0x.ts", "src/app/ｘ.ts", "public/.env", "src/data/key.pem", "README.md"];
const mustAllow = ["src/pages/home.ts", "public/manifest.webmanifest", "docs/notes.md", "tests/score.test.ts"];
let fail = 0;
for (const p of mustReject) { try { assertWritablePath(p); console.log("FAIL allowed", JSON.stringify(p)); fail++; } catch {} }
for (const p of mustAllow) { try { assertWritablePath(p); } catch (e) { console.log("FAIL", e.message); fail++; } }
console.log(`${mustReject.length} rejected, ${mustAllow.length} allowed, failures: ${fail}`);
process.exit(fail ? 1 : 0);
