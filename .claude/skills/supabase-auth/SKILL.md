---
name: supabase-auth
description: "Supabase Auth for Beach Day: email+password and Continue with Google, a profiles table with a role under RLS, and Netlify Functions that verify the access token and role on every request. Use for any login, session, role or super_admin work."
---
# Supabase Auth (URL + publishable key only)

Sources: `knowledge/supabase-auth-engineer/docs/`; runnable versions in its `examples/`.

## Keys and env
- Browser (Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`, safe to expose).
- Functions: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. **Never use or store the secret key** (`sb_secret_...`, bypasses RLS). The Google client secret lives only in the Supabase dashboard.
- Publishable key goes in the `apikey` header; the user's access token goes in `Authorization: Bearer`.

## Browser (`src/lib/auth.ts`, imported only by login, login/reset and agents pages)
- Exports: `supabase` (client or null), `isAuthConfigured`, `AuthFlowError` (codes: `not_configured`, `invalid_credentials`, `email_not_confirmed`, `weak_password`, `rate_limited`, `network`, `unknown`), `safeNext`, `takeNext`, `signUp(email, password, next?)`, `signIn`, `signInWithGoogle(next?)`, `signOut`, `sendPasswordReset(email)`, `updatePassword`, `getAccessToken`, `getRole`, `onAuthChange(cb)` (returns unsubscribe), `requireSuperAdmin(next)`.
- Redirect URLs are exactly `${origin}/login/` (sign-up confirmation, Google) and `${origin}/login/reset/` (password reset); `next` travels via `sessionStorage`, never the URL.
- `sendPasswordReset` resolves the same whether or not the account exists. Missing `VITE_*` vars never throw at import; calls reject with `not_configured`.
- `getRole` and `requireSuperAdmin` are cosmetic; the Function decides. Send `Authorization: Bearer <getAccessToken()>` on every `/api` call.

## Server (`netlify/functions/_lib/auth.ts`)
`const g = await requireRole(req, ctx, "super_admin", opts?); if (!g.ok) return g.response;` gives `g.user = { id, email }` and `g.supabase` (client carrying the caller's JWT). `opts.methods` defaults to GET and POST.
1. Method not allowed → 405. Non-GET also needs same `Origin`, `Sec-Fetch-Site` same-origin if present, and `X-Requested-With: beachday` → else 403.
2. `Authorization: Bearer <jwt>` missing or malformed → 401.
3. Missing config or non-https `SUPABASE_URL` (except `netlify dev`/test) → 503.
4. `GET {SUPABASE_URL}/auth/v1/user` with `apikey` + Bearer; 4xx → 401.
5. `GET {SUPABASE_URL}/rest/v1/profiles?select=id,role&id=eq.<uuid>` with `apikey` + the caller's Bearer, so RLS applies. Exactly one row with matching id and `role === "super_admin"`, else 403 (missing row = deny).
6. Supabase unreachable, timeout (5 s), 5xx, 408 or 429 → **503** (not 502), fail closed. Generic messages; never log tokens.
7. Never trust a role, id or email from the client or `user_metadata`. Guard `agents`, `agent-chat`, `proposals` and `approve` identically.

## Database (`supabase/migrations/**`, docs/security.md R4, D-007)
- `public.profiles(id uuid pk references auth.users on delete cascade, email, role text not null default 'user' check (role in ('user','super_admin')))`.
- Enable RLS; `revoke all` from `anon, authenticated`; `grant select` to `authenticated` only. **No UPDATE, INSERT or DELETE grants or policies** on `profiles`; one select policy for the own row: `(select auth.uid()) = id`. No role-protect trigger needed.
- `security definer set search_path = ''` trigger `on auth.users after insert` creates the profile with `role = 'user'`.
- Promote only in the SQL editor: `update public.profiles set role = 'super_admin' where email = '...';`

## Dashboard setup (document for the deployer)
- Authentication → URL Configuration: **Site URL** = production URL; **Redirect URLs** = exact URLs only in production: `https://<site>/login/` and `https://<site>/login/reset/` (docs/security.md R13). Localhost and Deploy Previews use a **separate dev Supabase project**.
- Google Cloud: OAuth client type **Web application**; Authorized JavaScript origins = the site (and localhost for dev); Authorized redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`; paste Client ID and Secret into Supabase → Providers → Google.
- Review the password minimum length and email confirmation settings.

## Test before accepting
Run the schema and token examples in `knowledge/supabase-auth-engineer/examples/`: 401 no/bad token, 403 role `user`, 200 `super_admin`, a user reads only their own row and cannot change `role`.
