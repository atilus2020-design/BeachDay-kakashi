// Example 1 — the write path allow-list (path-allowlist skill) with its fuzz tests. Run: node allowlist.mjs
// Mirrors netlify/functions/_lib/allowlist.ts (the source of truth; if they differ, the module wins).
const ALLOW_PREFIX = ["src/app/", "src/pages/", "src/lib/", "src/styles/", "src/scoring/", "src/data/", "public/", "tests/", "docs/"];
const ALLOW_EXACT = ["index.html", "how-it-works/index.html", "resources/index.html", "guide/index.html"];
const DENY_PREFIX = [".github/", ".claude/", "netlify/", "scripts/", "supabase/", "login/", "agents/", "node_modules/", "dist/", ".netlify/",
  "knowledge/", "src/pages/agents.", "src/pages/login"];
const DENY_EXACT = ["netlify.toml", "public/sw.js", "public/_headers", "public/_redirects"];
const DENY_RE = [/^package[^/]*\.json$/, /^vite\.config\./, /^src\/lib\/auth\./, /^src\/lib\/api\./];
const SECRET_RE = [/(^|\/)\.env/, /\.env$/, /\.(pem|key|p12|pfx|jks|keystore)$/, /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /(^|\/)\.npmrc$/, /(^|\/)\.git(\/|$|attributes$|ignore$|modules$)/];

export function assertWritablePath(p) {
  const bad = (why) => { throw new Error(`Path rejected (${why})`); };   // fixed message: never echoes the path
  if (typeof p !== "string" || !p || p.length > 200) bad("length");
  if (!/^[A-Za-z0-9._\/-]+$/.test(p)) bad("chars");                   // ASCII only: NUL, `\`, `:`, spaces, look-alikes
  if (p.startsWith("/")) bad("absolute");
  if (p.split("/").some((s) => s === "" || s === "." || s === "..")) bad("not-normalized");
  const lower = p.toLowerCase();                                      // deny rules see the lower-cased path
  if (SECRET_RE.some((r) => r.test(lower)) || DENY_EXACT.includes(lower) ||
      DENY_PREFIX.some((d) => lower.startsWith(d)) || DENY_RE.some((r) => r.test(lower))) bad("denied");
  if (!ALLOW_EXACT.includes(p) && !ALLOW_PREFIX.some((a) => p.startsWith(a) && p.length > a.length)) bad("not in allow-list");
  return p;
}

const mustReject = ["../netlify.toml", "src/../netlify.toml", "/etc/passwd", "src\\app.ts", "src/app/./x.ts", "src//x.ts",
  "SRC/app.ts", "NETLIFY.TOML", ".github/workflows/x.yml", "netlify/functions/approve.mts", ".claude/agents/x.md",
  "package.json", "Package-Lock.json", "a".repeat(201), "", "src/app/\0x.ts", "src/app/ｘ.ts", "public/.env", "src/data/key.pem",
  "README.md", "knowledge/security-engineer/docs/x.md", "supabase/migrations/x.sql", "login/index.html", "agents/index.html",
  "src/lib/auth.ts", "src/lib/API.ts", "src/pages/agents.ts", "src/pages/login-reset.ts", "public/sw.js", "public/_headers",
  "vite.config.ts", "tests/mocks/test.env", "docs/id_rsa", "public/.npmrc", "src/app/", "about/index.html", "C:/x.ts", "src/app/a b.ts"];
const mustAllow = ["src/pages/home.ts", "public/manifest.webmanifest", "docs/notes.md", "tests/score.test.ts",
  "index.html", "how-it-works/index.html", "resources/index.html", "guide/index.html", "src/lib/shell.ts"];
let fail = 0;
for (const p of mustReject) { try { assertWritablePath(p); console.log("FAIL allowed", JSON.stringify(p)); fail++; } catch {} }
for (const p of mustAllow) { try { assertWritablePath(p); } catch (e) { console.log("FAIL", JSON.stringify(p), e.message); fail++; } }
console.log(`${mustReject.length} rejected, ${mustAllow.length} allowed, failures: ${fail}`);
process.exit(fail ? 1 : 0);
