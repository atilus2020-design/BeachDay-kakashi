// Build gate (security.md R7): fail if secrets could reach dist/ or the build env is unsafe.
// Also pins CSP connect-src to the exact Supabase origin via dist/_headers (security.md B4).
import { readdirSync, readFileSync, statSync, existsSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const env = process.env;
const problems = [];

const FORBIDDEN_ENV = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const ALLOWED_VITE = new Set(["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
const PATTERNS = ["sk-ant-", "github_pat_", "sb_secret_", "service_role", "ANTHROPIC_API_KEY", "GITHUB_TOKEN", "JOB_SIGNING_SECRET"];

for (const n of FORBIDDEN_ENV) if (env[n]) problems.push(`build env defines forbidden variable ${n}`);
for (const n of Object.keys(env)) if (n.startsWith("VITE_") && !ALLOWED_VITE.has(n)) problems.push(`build env defines disallowed ${n} (only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY may be VITE_*)`);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

if (!existsSync(dist)) {
  problems.push(`dist directory not found: ${dist}`);
} else {
  for (const file of walk(dist)) {
    const text = readFileSync(file).toString("latin1");
    for (const pat of PATTERNS) {
      if (text.includes(pat)) problems.push(`${file.slice(dist.length + 1)} contains "${pat}"`);
    }
  }
}

if (problems.length) {
  console.error("check-secrets FAILED:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}

// Tighten CSP connect-src to the exact Supabase origin (overrides netlify.toml's https://*.supabase.co).
const url = env.VITE_SUPABASE_URL;
if (url) {
  try {
    const origin = new URL(url).origin;
    if (origin.startsWith("https://")) {
      const csp = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${origin}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; worker-src 'self'`;
      appendFileSync(join(dist, "_headers"), `\n/*\n  Content-Security-Policy: ${csp}\n`);
      console.log(`check-secrets: CSP connect-src pinned to ${origin}`);
    } else {
      console.warn("check-secrets: VITE_SUPABASE_URL is not https; CSP left at netlify.toml default");
    }
  } catch {
    console.warn("check-secrets: VITE_SUPABASE_URL is not a valid URL; CSP left at default");
  }
} else {
  console.warn("check-secrets: VITE_SUPABASE_URL unset; CSP left at netlify.toml default");
}
console.log("check-secrets: OK");
