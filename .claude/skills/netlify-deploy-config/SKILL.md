---
name: netlify-deploy-config
description: "Configure Beach Day's Netlify build and deploy: netlify.toml, headers/CSP, redirects, environment variables per context, Git deploys, Free plan limits. Use for build, deploy or hosting configuration."
---
# Netlify deploy config

- `netlify.toml`: `[build] command = "npm run build"`, `publish = "dist"`, `[functions] directory = "netlify/functions"`, `node_bundler = "esbuild"`.
- Security headers on `/*`: CSP (`default-src 'self'`; `connect-src 'self'` + the Supabase URL), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- `/sw.js` → `Cache-Control: no-cache`; `/agents/*` → `no-store`, `X-Robots-Tag: noindex`.
- Env vars (UI/CLI, Functions scope): `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (Production only), `GITHUB_REPO`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, budget knobs. Public build vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Deploys: Git-connected continuous deployment on `main`; an Approve commit triggers a build (counts toward Free plan credits).
- Local: `netlify dev` (functions + local Blobs) on http://localhost:8888.
