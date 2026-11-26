---
name: secrets-and-auth
description: "Protect Beach Day's secrets and authenticated endpoints: env-only secrets, token/session verification, CSRF, login and spend limits. Use for any auth, secret or access-control work."
---
# Secrets and auth

- Secrets only in Netlify env (Functions scope): `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`. Never in `netlify.toml`, the repo, `VITE_*` vars, logs or responses.
- Build check: fail if `dist/` contains secret names or `sk-ant-` / `github_pat_` patterns.
- Every protected Function verifies the caller **on every request** (session or bearer token) and its role before doing work; default deny.
- POST endpoints: check `Origin` matches the site and require a custom header (`X-Requested-With: beachday`) as CSRF defence.
- Rate limit per IP with `config.rateLimit`; daily budget counters in Blobs (strong consistency); Anthropic workspace spend limit.
- Errors: generic messages to clients; redacted logs.
- See `docs/04-agent-console.md` §4.5 and the security engineer's knowledge folder.
