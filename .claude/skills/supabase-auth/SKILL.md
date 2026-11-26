---
name: supabase-auth
description: "Supabase Auth for Beach Day: email+password and Continue with Google, a profiles table with a role under RLS, and Netlify Functions that verify the access token and role on every request. Use for any login, session, role or super_admin work."
---
# Supabase Auth (URL + publishable key only)

Details and sources: `knowledge/supabase-auth-engineer/docs/`; runnable versions in `examples/`.

## Keys and env
- Browser (Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`, safe to expose).
- Functions: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. **Never use or store the secret key** (`sb_secret_...`, bypasses RLS). The Google client secret lives only in the Supabase dashboard.
- Publishable key goes in the `apikey` header; the user's access token goes in `Authorization: Bearer`.

## Client (`src/lib/auth.*`)
1. `createClient(URL, PUBLISHABLE_KEY)` once.
2. `signUp({ email, password, options: { emailRedirectTo } })`: with Confirm email on, `session` is null; show "check your email".
3. `signInWithPassword({ email, password })`; `signOut()`.
4. Forgot password: `resetPasswordForEmail(email, { redirectTo: <site>/login/reset/ })`; always show the same message (no account enumeration). On that page, after the `PASSWORD_RECOVERY` event, call `updateUser({ password })`.
5. Google: `signInWithOAuth({ provider: 'google', options: { redirectTo } })`.
6. `onAuthStateChange`: keep the callback fast, store `session.access_token` in memory (`TOKEN_REFRESHED` updates it), unsubscribe on teardown.
7. Every Function call sends `Authorization: Bearer <access_token>`. Hiding the Agents page for non-admins is cosmetic; the Function decides.

## Server (`netlify/functions/_lib/auth.*`), on every request
1. Parse `Authorization: Bearer`; none or malformed → 401.
2. Verify with Supabase: `GET {SUPABASE_URL}/auth/v1/user` with `apikey` + the Bearer token (or `auth.getUser(token)`); non-200 → 401. `getClaims` is allowed if the project uses asymmetric signing keys.
3. Read the role from `profiles` with the **caller's JWT** (`/rest/v1/profiles?select=role&id=eq.<id>`, `apikey` = publishable key) so RLS applies. Role must equal `super_admin` → else 403. Missing row = deny.
4. Never trust a role, id or email sent by the client or stored in `user_metadata`.
5. Auth service error → fail closed (502). Generic error messages; never log tokens.
6. Only `super_admin` may open the Agents page, chat with agents or Approve; guard `agents`, `agent-chat`, `proposals` and `approve` identically, then keep the CSRF and rate-limit checks from `secrets-and-auth`.

## Database (`supabase/migrations/**`, see `examples/schema.sql`)
- `public.profiles(id uuid pk references auth.users on delete cascade, email, role text not null default 'user' check (role in ('user','super_admin')))`.
- `alter table ... enable row level security`; `revoke all` from `anon, authenticated`; `grant select` to `authenticated` only. **No INSERT/UPDATE/DELETE grants or policies** (docs/security.md, D-007); users can never edit `role`.
- Policies: select and update own row with `(select auth.uid()) = id`. No insert or delete policy.
- Role changes impossible from the API: column privilege (no `update(role)`) plus a `before update` trigger that raises when `current_user in ('anon','authenticated')`.
- `security definer set search_path = ''` trigger `on auth.users after insert` creates the profile (`role = 'user'`).
- Promote manually in the SQL editor only: `update public.profiles set role = 'super_admin' where email = '...';`

## Dashboard setup (document for the deployer)
- Authentication → URL Configuration: **Site URL** = production URL; **Redirect URLs** = exact URLs only in production: `https://<site>/login/` and `https://<site>/login/reset/` (docs/security.md R13). Localhost and Deploy Previews use a **separate dev Supabase project**.
- Google Cloud: OAuth client type **Web application**; Authorized JavaScript origins = the site (and localhost for dev); Authorized redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`; paste Client ID and Secret into Supabase → Providers → Google.
- Review the password minimum length and email confirmation settings.

## Test before accepting
Run `examples/test-schema.mjs` and `examples/verify-token.mjs`: 401 no/bad token, 403 role `user`, 200 `super_admin`, a user reads only their own row and cannot change `role`.
