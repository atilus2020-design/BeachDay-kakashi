// Build gate (security.md R7): fail if secrets could reach dist/ or the build env is unsafe.
// Also pins CSP connect-src to the exact Supabase origin via dist/_headers (security.md B4).
// Usage: node scripts/check-secrets.mjs [distDir]   |   node scripts/check-secrets.mjs --self-test
import { readdirSync, readFileSync, statSync, existsSync, appendFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const FORBIDDEN_ENV = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const ALLOWED_VITE = new Set(["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
const SECRET_ENV_NAMES = ["ANTHROPIC_API_KEY", "GITHUB_TOKEN", "JOB_SIGNING_SECRET"];
const VALUE_CHECK_ENV = [...SECRET_ENV_NAMES, ...FORBIDDEN_ENV];
// Real key shapes, not bare prefixes (docs and supabase-js legitimately mention the prefixes).
const KEY_SHAPES = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["GitHub fine-grained token", /github_pat_[A-Za-z0-9_]{20,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
];
const JWT_RE = /eyJ[A-Za-z0-9_-]{5,}\.(eyJ[A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]{5,}/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function scanDist(dist, env) {
  const problems = [];
  for (const n of FORBIDDEN_ENV) if (env[n]) problems.push(`build env defines forbidden variable ${n}`);
  for (const n of Object.keys(env)) {
    if (n.startsWith("VITE_") && !ALLOWED_VITE.has(n)) problems.push(`build env defines disallowed ${n} (only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY may be VITE_*)`);
  }
  if (env.CONTEXT === "production" && env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_URL.startsWith("https://")) {
    problems.push("VITE_SUPABASE_URL must be https in production");
  }
  if (!existsSync(dist)) return [...problems, `dist directory not found: ${dist}`];

  const values = VALUE_CHECK_ENV.map((n) => [n, env[n]]).filter(([, v]) => v && v.length >= 16);
  for (const file of walk(dist)) {
    const rel = relative(dist, file).split(sep).join("/");
    const text = readFileSync(file).toString("latin1");
    for (const [label, re] of KEY_SHAPES) if (re.test(text)) problems.push(`${rel} contains a ${label}`);
    for (const m of text.matchAll(JWT_RE)) {
      try {
        const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
        if (payload && payload.role === "service_role") problems.push(`${rel} contains a service_role JWT`);
      } catch { /* not a JWT */ }
    }
    if (/^assets\/.*\.js$/.test(rel)) {
      for (const n of SECRET_ENV_NAMES) if (text.includes(n)) problems.push(`${rel} references secret env name ${n}`);
    }
    for (const [n, v] of values) if (text.includes(v)) problems.push(`${rel} contains the value of ${n}`);
  }
  return problems;
}

function pinCsp(dist, env) {
  const url = env.VITE_SUPABASE_URL;
  if (!url) return console.warn("check-secrets: VITE_SUPABASE_URL unset; CSP left at netlify.toml default");
  let origin;
  try { origin = new URL(url).origin; } catch { return console.warn("check-secrets: VITE_SUPABASE_URL invalid; CSP left at default"); }
  if (!origin.startsWith("https://")) return console.warn("check-secrets: VITE_SUPABASE_URL is not https; CSP left at default");
  const csp = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${origin}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; worker-src 'self'`;
  appendFileSync(join(dist, "_headers"), `\n/*\n  Content-Security-Policy: ${csp}\n`);
  console.log(`check-secrets: CSP connect-src pinned to ${origin}`);
}

function selfTest() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (role) => `${b64({ alg: "HS256" })}.${b64({ role })}.c2lnbmF0dXJlc2ln`;
  const cases = [
    ["anthropic key", "x='sk-ant-api03-abcdefghijklmnopqrstuvwx'", {}],
    ["github pat", "x='github_pat_11ABCDEFG0abcdefghijklmnop'", {}],
    ["supabase secret", "x='sb_secret_abcdefghijklmnopqrst'", {}],
    ["service_role jwt", `x='${jwt("service_role")}'`, {}],
    ["env name in js", "x=process.env.ANTHROPIC_API_KEY", {}],
    ["env value", "x='hunter2-hunter2-hunter2'", { GITHUB_TOKEN: "hunter2-hunter2-hunter2" }],
    ["forbidden env", "ok", { SUPABASE_SECRET_KEY: "x" }],
    ["extra VITE var", "ok", { VITE_OTHER: "1" }],
  ];
  let failed = 0;
  const root = mkdtempSync(join(tmpdir(), "check-secrets-"));
  try {
    for (const [name, content, env] of cases) {
      const d = join(root, name.replace(/\W/g, "_"));
      mkdirSync(join(d, "assets"), { recursive: true });
      writeFileSync(join(d, "assets", "a.js"), content);
      const p = scanDist(d, env);
      if (!p.length) { console.error(`self-test FAIL: "${name}" was not detected`); failed++; }
    }
    const clean = join(root, "clean");
    mkdirSync(join(clean, "assets"), { recursive: true });
    writeFileSync(join(clean, "assets", "a.js"), `if(k.startsWith("sb_secret_"))throw 1; const p='${jwt("anon")}'`);
    writeFileSync(join(clean, "guide.html"), "<p>Keys look like sk-ant-..., github_pat_..., service_role; set ANTHROPIC_API_KEY and GITHUB_TOKEN.</p>");
    const p = scanDist(clean, { VITE_SUPABASE_URL: "https://abcd.supabase.co" });
    if (p.length) { console.error("self-test FAIL: clean dist flagged:", p); failed++; }
  } finally { rmSync(root, { recursive: true, force: true }); }
  if (failed) process.exit(1);
  console.log(`check-secrets self-test: OK (${cases.length} planted cases detected, clean dist passes)`);
}

if (process.argv[2] === "--self-test") {
  selfTest();
} else {
  const dist = resolve(process.argv[2] ?? "dist");
  const problems = scanDist(dist, process.env);
  if (problems.length) {
    console.error("check-secrets FAILED:\n" + problems.map((p) => "  - " + p).join("\n"));
    process.exit(1);
  }
  pinCsp(dist, process.env);
  console.log("check-secrets: OK");
}
