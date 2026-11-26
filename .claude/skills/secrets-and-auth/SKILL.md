---
name: secrets-and-auth
description: "Protect Beach Day's secrets and authenticated endpoints: Supabase Auth token verification, super_admin role checks via profiles under RLS, env-only secrets, CSRF, rate and spend limits. Use for any auth, secret or access-control work."
---
# Secrets and auth

Authoritative model: `docs/security.md` (rules R1–R17, guard contract §5, QA checklist §6).

- **Sign-in is Supabase Auth in the browser** (email+password with confirmation, forgot password, Google via `signInWithOAuth`). No password gate, no session cookie, no `/api/auth/*`.
- **Every protected Function runs `requireRole(req, ctx, "super_admin")` (`_lib/auth.ts`) first, on every request; default deny.** Order: method → (non-GET) `Origin` === request origin and `Sec-Fetch-Site` same-origin → `X-Requested-With: beachday` → `Authorization: Bearer <jwt>` → `supabase.auth.getUser(jwt)` (server-side verification; never decode or trust unverified claims; `getSession` is insecure on the server) → `profiles.role` read with the caller's JWT under RLS → exactly one row, `id` matches, `role === 'super_admin'`. 401 token problems; 403 CSRF or role; 503 if Supabase is down (fail closed).
- Supabase client in Functions: `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` + the caller's `Authorization` header, created per request, `persistSession: false`.
- **Role never comes from the client, the request body, the JWT `role` claim (that is the Postgres role) or user metadata.** `super_admin` is set only by the owner in the Supabase SQL editor. `authenticated` has SELECT only on `profiles` (own row); no UPDATE grant or policy, so `role` can't change.
- **Never use the secret key (`sb_secret_…`) or legacy `service_role` key**; never set `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. The publishable key is public and safe only because RLS is on for every table.
- Secrets only in Netlify env, Functions scope, marked secret: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `JOB_SIGNING_SECRET`. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may be `VITE_*`.
- Build check: fail if `dist/` contains `sk-ant-`, `github_pat_`, `sb_secret_`, `service_role` or secret env names.
- Supabase Auth settings: Confirm email on; exact Redirect URLs (no `**` in production); Google client limited to our origin and the Supabase `/auth/v1/callback`; PKCE flow.
- Rate limit per IP with `config.rateLimit`; daily budget per user and global in Blobs (strong); Anthropic workspace spend limit.
- Errors: generic `{error}` to clients; never echo upstream bodies; redact tokens from logs. Audit chat, jobs, proposals, approvals and denials with the Supabase user id.
