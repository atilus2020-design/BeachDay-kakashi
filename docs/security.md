# Security model

**Owner:** Rook (`security-engineer`). This is the authoritative security model for Beach Day and its Agent Console. If another document disagrees with it, this one wins. Change it only through the security engineer, and record a change of direction as a decision in `docs/decisions.md`.

**Scope:** sign-in with Supabase Auth (email and password, and Continue with Google), the `profiles` table and its roles, every Netlify Function under `/api/`, the Approve → commit flow, secrets and environment variables.

**Implements:** decisions D-006 (Supabase Auth), D-007 (roles in `profiles` with RLS) and D-008 (URL + publishable key only; token and role checked in every Function). **Replaces:** the shared-password gate and HMAC session cookie in `docs/04-agent-console.md` §4.5.2. `CONSOLE_PASSWORD_HASH`, `SESSION_SECRET`, the `bd_session` cookie and `/api/auth/login` and `/api/auth/logout` are retired.

Facts below were checked against the official pages listed in §9 on 2026-11-26.

---

## 1. How it fits together

```
Browser (static PWA)                              Supabase (Auth + Postgres)
  supabase-js, created with                         auth.users
  VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY public.profiles (RLS on)
     │  sign up / log in / Google / reset ───────────▶ │
     │  ◀─────────────── session (access token JWT) ───┘
     │
     │  fetch /api/...  Authorization: Bearer <access token>
     │                  X-Requested-With: beachday
     ▼
Netlify Function ── requireRole(): verify token with Supabase Auth (getUser)
                  ── read role from public.profiles AS THE CALLER (their JWT, under RLS)
                  ── role !== 'super_admin' → 403
                  ── then Claude / GitHub work with ANTHROPIC_API_KEY / GITHUB_TOKEN
```

- The browser talks to Supabase directly for sign-in. Our Functions never see a password.
- Functions use only the **project URL and the publishable key**, plus the caller's own access token. With that combination Postgres runs the query as the `authenticated` role for that user, so RLS applies to our server code exactly as it applies to the browser.
- **The secret key (`sb_secret_…`) and the legacy `service_role` key are never used anywhere in this project.** Supabase: a secret key "bypasses every Row Level Security policy you have". We have no task that needs it.

## 2. Threats

| # | Threat | Impact | Main controls (rule numbers in §3) |
|---|---|---|---|
| T1 | A stranger or ordinary signed-up user calls the Agent Functions to burn Claude credits | Money | R1, R2, R11, R12 |
| T2 | A stranger or ordinary user gets a commit onto `main` | Site defacement, malicious code shipped to every visitor | R1, R2, R9, R10 |
| T3 | A user promotes themselves to `super_admin` (edits their `profiles.role`, forges a JWT claim, sets user metadata, sends `role` in a request body) | Full console access | R2, R3, R4, R5 |
| T4 | Publishable key copied from the bundle and used directly against the Supabase Data API | Read or write of other people's rows | R6, R4 |
| T5 | Secret key, `GITHUB_TOKEN` or `ANTHROPIC_API_KEY` leaks (bundle, repo, logs, error bodies) | Full database bypass / repo write / spend | R7, R8, R16 |
| T6 | OAuth or password-reset redirect sent to an attacker's site, leaking tokens or codes | Account takeover | R13, R14 |
| T7 | Account takeover of the owner (weak password, unconfirmed email squatting, phishing) | Full console access | R15, R14, R13 |
| T8 | CSRF: another site makes the owner's browser call `/api/...` | Unwanted chat, job or Approve | R1 (bearer header), R10 |
| T9 | XSS steals the access token from browser storage | Session hijack for up to the token lifetime | CSP `script-src 'self'`, model output rendered with `textContent` (doc 04), short JWT lifetime, R2 (role re-read each request) |
| T10 | Prompt injection steers an agent into a harmful proposal | Malicious commit | R9, human review of the full diff, deny-list for security code (doc 04 §4.5.4) |
| T11 | An agent or proposal changes CI, build or Function code to escape | Secret theft, persistent backdoor | R8 (no Workflows permission), R9 (deny `netlify/**`, `.github/**`, `package*.json`, `scripts/**`, `.claude/**`) |
| T12 | A demoted or deleted admin keeps using an old token | Continued access | R2 (role read from the database on every request, not from the JWT), `on delete cascade` on `profiles` |
| T13 | Information leakage through error messages | Recon, token or header echo | R16 |
| T14 | Nobody notices abuse | Damage grows | R17 |

## 3. Rules, in priority order

Each rule names the threat it stops. "Must" is mandatory; the build or QA fails without it.

### R1. Every protected Function authenticates every request server-side (T1, T2, T8)

Every Function under `/api/` except the public forecast endpoints runs the shared guard `requireRole(req, ctx, "super_admin")` (`netlify/functions/_lib/auth.ts`, §5) **first**, before parsing the body, touching Blobs, or calling Claude or GitHub. Default deny: if any step fails or throws, the request is refused.

- The token comes **only** from the `Authorization: Bearer <access token>` header. Never from a cookie, query string or body.
- The token is verified **by Supabase**, not by decoding it: `supabase.auth.getUser(jwt)`. Supabase's reference says `getUser` "validates the user's access token JWT on the server" and "should always be used when checking for user authorization on the server"; `getSession` "is insecure on the server". `getUser` asks the Auth server, which also rejects tokens whose session no longer exists (`session_not_found`, e.g. after sign-out). `getClaims(jwt)` (local JWKS verification) is allowed later only once the project uses asymmetric signing keys, and then the JWT expiry must stay short, because local verification accepts a signed-out token until it expires (D-008). A shared JWT secret is never used.
- Never hand-roll JWT verification and never read claims from an unverified token.

### R2. The role is read from `public.profiles` with the caller's JWT, under RLS, on every request (T3, T12)

- After R1 succeeds, the guard runs `select role from public.profiles where id = <user.id>` using a Supabase client created with the **publishable key** and the header `Authorization: Bearer <caller's access token>`. RLS limits that query to the caller's own row.
- Allow only if exactly one row comes back, its `id` equals the verified user id, and `role === 'super_admin'`. Zero rows or any other value → **403**. Supabase unreachable or 5xx → **503** (fail closed; never "allowed").
- **Never** trust a role from: the request body or headers, the JWT's `role` claim (that is the Postgres role, `authenticated`, used for RLS, not our app role), `user_metadata` / `raw_user_meta_data` (users can edit it), or browser state.
- Reading the role per request (rather than baking it into a custom JWT claim) means a demotion takes effect on the next request, not when the token expires.
- The UI may also read the user's own profile row to decide whether to show the Agents link. That is **cosmetic only**; the Functions decide.

### R3. `super_admin` is assigned only by the owner, by hand, in the Supabase SQL editor (T3)

- No Function, page, API or agent can grant a role. There is no "promote user" endpoint, and none may be added without a new decision record.
- The owner signs up normally, confirms the email, then runs in the Supabase Dashboard SQL editor (which runs as the database owner, outside RLS):

  ```sql
  update public.profiles set role = 'super_admin'
  where email = 'owner@example.com';
  ```

  Demote with `set role = 'user'`. Keep the number of `super_admin` rows at one unless the lead decides otherwise.

### R4. `profiles` is readable only by its owner, and no user can ever change `role` (T3, T4)

Migration (`supabase/migrations/<timestamp>_profiles.sql`, applied by the owner; the file is reviewed by the security engineer):

```sql
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  role       text not null default 'user' check (role in ('user', 'super_admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- New tables in "public" start with every privilege granted to anon and authenticated (Supabase RLS guide).
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;          -- read only; no insert, update or delete

create policy "profiles: read own row"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

-- Create the profile when a user signs up. Role is never taken from user input.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);  -- role gets its default, 'user'
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Why the role cannot change: `authenticated` has **no UPDATE privilege** on the table and there is **no UPDATE policy** (D-007), so Postgres refuses at the privilege check before RLS is even consulted. `anon` has no privileges at all. If editable profile fields are added later (needs a new decision record), grant column-level update on those columns only (`grant update (display_name) on public.profiles to authenticated;`) with an `update` policy whose `using` and `with check` are both `(select auth.uid()) = id`, and add a `before update` trigger that raises if `new.role is distinct from old.role` and `current_user in ('anon', 'authenticated')` as a second lock. **Never** grant update on `role`, and never grant table-wide update.

The trigger must **not** copy anything from `raw_user_meta_data` into `role`. Supabase's RLS guide notes user metadata "is not a good place to store authorization data".

### R5. The client never sends a role, and the server ignores any it sends (T3)

Request bodies are validated against a fixed schema per endpoint. Unknown fields, including `role`, `user`, `userId`, `isAdmin`, are rejected (400) or ignored; identity comes only from R1 and R2.

### R6. RLS is on for every table in every exposed schema; the publishable key is public by design (T4)

- Supabase: the publishable key (`sb_publishable_…`) is "safe to expose online" and "only reaches what Row Level Security allows". It is safe **only because** RLS is enabled, with deliberate grants, on every table in `public` (and any other exposed schema).
- Every future table follows the same recipe as R4: enable RLS, `revoke all … from anon, authenticated`, grant back only what is needed, write policies scoped `to authenticated` with `(select auth.uid())`.
- Before each release, the Supabase Dashboard **Security Advisor** must show no "RLS disabled" findings.

### R7. Secrets only in Netlify environment variables, Functions scope (T5)

- `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `JOB_SIGNING_SECRET` live only in Netlify env with **Functions** scope and "Contains secret values" ticked. Never in `netlify.toml`, the repository, a `VITE_*` variable, logs, model prompts or responses.
- Only the two `VITE_SUPABASE_*` values (both public) are build-time variables. Vite: "`VITE_*` variables should _not_ contain sensitive information".
- **Build check (must):** the build fails if `dist/` contains `sk-ant-`, `github_pat_`, `sb_secret_`, the strings `service_role`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` or `JOB_SIGNING_SECRET`, or if the build environment defines `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or any `VITE_*` variable other than the two allowed ones.
- **Never** create `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` in Netlify at all. Supabase deprecates the legacy `anon` and `service_role` keys in early 2027; use the publishable key, not the legacy `anon` JWT.

### R8. GitHub: fine-grained token, this repository only, no Workflows (T2, T5, T11)

Decision D-005: Contents read/write and Metadata read only, an expiry (about 90 days) with a rotation reminder, Functions scope, Production context only. The target repository comes from `GITHUB_REPO`, never from the request. Details: `docs/04-agent-console.md` §4.5.3.

### R9. Path allow-list enforced at propose AND at approve (T2, T10, T11)

`netlify/functions/_lib/allowlist.ts` is the single policy (`path-allowlist` skill; doc 04 §4.5.4). Per D-007 the deny-list also covers the auth code and migrations: `supabase/**`, `login/**`, `src/lib/auth.*`. The `propose_change` tool handler validates every path, size and encoding; the `approve` Function **re-validates the stored proposal from scratch** before building the tree. Deny wins; any violation rejects the whole proposal. Tree entries are mode `100644` only.

### R10. CSRF defence in depth on every non-GET request (T8)

1. The access token travels in the `Authorization` header, which browsers never attach automatically. This alone defeats classic CSRF.
2. Require `X-Requested-With: beachday` (a custom header forces a CORS preflight, which we never approve: no `Access-Control-Allow-*` headers are ever sent).
3. Require `Origin` to equal the request's own origin (`new URL(req.url).origin`) exactly, and if `Sec-Fetch-Site` is present it must be `same-origin`.

Any failure → 403. Approve additionally needs the explicit "Approve and deploy" confirmation in the UI and a compare-and-swap on the proposal status (doc 04 §4.6).

### R11. Rate limits, daily budget and spend limit (T1)

| Layer | Setting |
|---|---|
| Netlify `config.rateLimit` per IP (`aggregateBy: ["ip", "domain"]`) | chat 10/60 s; jobs 3/60 s; approve 5/60 s; reads (agents, proposals, job status) 60/60 s |
| App budget in Blobs (strong consistency), counted per user `id` **and** globally per day | `DAILY_CHAT_LIMIT`, `DAILY_JOB_LIMIT`, `DAILY_TOKEN_LIMIT` |
| Claude Console | Separate key and workspace for this app, with a monthly **spend limit** |
| Supabase Auth | Keep the built-in Auth rate limits on (sign-up, sign-in, password-reset emails); do not raise them |

Budget is checked after the guard, so unauthenticated traffic never touches the counters.

### R12. Only `super_admin` reaches the Agent Console (T1, T2)

Every Agent Console Function requires `super_admin`: list agents, chat, start a job, job status, list/view proposals, approve, reject. A signed-in `user` gets 403 from all of them. The public parts of Beach Day (forecast, scoring) need no sign-in.

### R13. Redirect allow-list in Supabase Auth (T6, T7)

In Supabase Dashboard → Authentication → **URL Configuration**:

- **Site URL** = the production origin, for example `https://beachday.netlify.app` (it is the default redirect for confirmation and reset emails).
- **Redirect URLs** = exact paths only: `https://<site>/login/` (OAuth and email-confirmation return, D-006) and `https://<site>/login/reset/` (password recovery). Supabase recommends "setting the exact redirect URL path for your site URL in production". No `**` wildcards in the production project. `http://localhost:*` entries belong in a separate development Supabase project, not production.
- Every `signInWithOAuth`, `signUp` (`emailRedirectTo`) and `resetPasswordForEmail` call passes an explicit `redirectTo` that is on this list.
- Create the browser client with `auth: { flowType: 'pkce' }` so OAuth and email links return a one-time code, not tokens in the URL fragment.

### R14. Google OAuth client restricted to our origin and the Supabase callback (T6, T7)

In Google Cloud Console → OAuth client (type "Web application"):

- **Authorized JavaScript origins:** the production site origin only.
- **Authorized redirect URIs:** only the Supabase callback, `https://<project-ref>.supabase.co/auth/v1/callback`. The site's own return page (`/login/`) is controlled by R13, not by Google.
- Scopes: `openid`, `email`, `profile` only.
- The Google **client secret** is entered only in Supabase Dashboard → Authentication → Providers → Google. It never goes in Netlify, the repo or the browser.

### R15. Email and password hygiene (T7)

- **Confirm email: on** (the hosted default). Unconfirmed users cannot sign in, so nobody can pre-register the owner's address.
- Minimum password length 12 in Auth settings; turn on leaked-password protection if the plan offers it.
- Forgot password uses `resetPasswordForEmail(email, { redirectTo: '<site>/login/reset/' })`; after the `PASSWORD_RECOVERY` event the reset page calls `updateUser({ password })`. The UI always says "If that address has an account, we've sent a link", whether or not it exists.
- Log out calls `supabase.auth.signOut()`. JWT expiry stays at the Supabase default (1 hour) or shorter; never longer.
- The built-in Supabase email sender allows only a few emails per hour (D-006); configure custom SMTP before real sign-ups. The SMTP password lives only in the Supabase dashboard.
- Recommend MFA (TOTP) for the owner account once the UI supports it (OPEN, §8).

### R16. Safe errors (T5, T13)

- Clients get only `{ "error": "<generic message>" }`: 401 "Sign in required", 403 "Not allowed" or "Forbidden", 429 "Too many requests", 400 "Invalid request", 409 for stale proposals, 503 "Sign-in service unavailable", 500 "Something went wrong".
- Never echo upstream bodies (Supabase, Claude, GitHub), stack traces, tokens or headers. Logs are redacted: no `Authorization` header, no token, no key.
- 401 and 403 responses look the same whether the user does not exist, the token expired, or the role is wrong (beyond the 401/403 split).

### R17. Audit log (T14)

Append to Blobs (`audit/<yyyy-mm-dd>/<ts>-<requestId>`) for every chat turn (agent, tokens), job start and end, proposal, approval (commit SHA), rejection, and every **denied** request (401/403/429) with path and reason code. Each entry has time, user `id` (from R1, never from the client), IP and request ID; never tokens. Sign-ins, sign-ups and password resets are recorded by Supabase in the Auth logs. The Console "Activity" tab shows the last 50 entries.

## 4. Environment variables

Netlify scopes: **Builds** (visible during `vite build`), **Functions** (visible to Functions at runtime). Netlify `netlify.toml` variables are not visible to Functions, and secrets never go there.

| Name | Scope / context | Secret or public | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Builds; all contexts | Public (inlined into the bundle) | Supabase project URL for the browser client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Builds; all contexts | Public by design (`sb_publishable_…`), safe only with R6 | Browser Supabase client |
| `SUPABASE_URL` | Functions; all contexts | Public | Supabase project URL for the guard. Must be `https://` except when `context.deploy.context === "dev"` (tests may point it at a local mock, D-008) |
| `SUPABASE_PUBLISHABLE_KEY` | Functions; all contexts | Public | Guard's Supabase client (always combined with the caller's JWT) |
| `ANTHROPIC_API_KEY` | Functions; Production (a separate low-limit key for previews and dev) | **Secret** | Claude API |
| `GITHUB_TOKEN` | Functions; **Production only** | **Secret** | Fine-grained PAT (D-005) |
| `GITHUB_REPO` | Functions | Public (not secret, but server-only) | `owner/name`, the only repository ever written |
| `JOB_SIGNING_SECRET` | Functions | **Secret** (32+ random bytes) | HMAC on the internal call that starts a background job (doc 04 §4.7) |
| `DAILY_CHAT_LIMIT` | Functions | Public | Chat turns per day (per user and global) |
| `DAILY_JOB_LIMIT` | Functions | Public | Background jobs per day |
| `DAILY_TOKEN_LIMIT` | Functions | Public | Claude tokens per day, summed from `usage` |

**Must never exist:** `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (legacy), `CONSOLE_PASSWORD_HASH`, `SESSION_SECRET` (retired), any other `VITE_*` variable.

Test-only overrides (never set in Production): `GITHUB_API_URL`, `ANTHROPIC_BASE_URL`, and `SUPABASE_URL` pointed at a mock.

## 5. The guard contract (`netlify/functions/_lib/auth.ts`)

Every protected Function starts with `const g = await requireRole(req, ctx, "super_admin"); if (!g.ok) return g.response;` (name per D-008). It runs these steps in this order, with no caching between requests, and stops at the first failure:

| Step | Check | On failure |
|---|---|---|
| 1 | Method is one the route allows | 405 `{error:"Method not allowed"}` |
| 2 | Non-GET only: `Origin` === `new URL(req.url).origin`; `Sec-Fetch-Site`, if present, === `same-origin` | 403 `{error:"Forbidden"}` |
| 3 | Non-GET only: `X-Requested-With` === `beachday` | 403 `{error:"Forbidden"}` |
| 4 | `Authorization` matches `^Bearer ([A-Za-z0-9._-]+)$` and is at most 4096 characters | 401 `{error:"Sign in required"}` |
| 5 | `createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`, then `auth.getUser(jwt)` returns a user with no error (equivalent raw call: `GET {SUPABASE_URL}/auth/v1/user` with `apikey: <publishable key>` and the bearer token) | invalid or expired → 401 `{error:"Sign in required"}` |
| 6 | With the same client: `from("profiles").select("id, role").eq("id", user.id)` returns exactly one row and `row.id === user.id` | 403 `{error:"Not allowed"}` |
| 7 | `row.role === requiredRole` (`"super_admin"`) | 403 `{error:"Not allowed"}` |
| 8 | Returns `{ ok: true, user: { id: user.id, email: user.email }, supabase }` | — |

- Supabase unreachable, timed out (set a 5 s timeout) or answering 5xx in steps 5–7 → **503** `{error:"Sign-in service unavailable"}` (fail closed, D-008). Never 500 with details, never allow.
- Create the Supabase client **per request** (it carries this caller's JWT); never share one across requests.
- Rate limiting (`config.rateLimit`) runs at the edge before the Function; budget checks run after the guard.
- A worked, runnable version of this order is in `knowledge/security-engineer/examples/guard-request.mjs`.

**Per-endpoint requirements**

| Endpoint | Guard | Extra checks |
|---|---|---|
| `GET /api/agents` | token + super_admin | — |
| `POST /api/agent/chat` | token + super_admin + CSRF | budget; body schema |
| `POST /api/jobs` | token + super_admin + CSRF | budget; signs internal call with `JOB_SIGNING_SECRET` |
| `agent-job` (background) | not public: HMAC signature from `JOB_SIGNING_SECRET` | job claimed by compare-and-swap; records the starting user `id` |
| `GET /api/jobs/:id` | token + super_admin | — |
| `GET /api/proposals`, `/:id` | token + super_admin | — |
| `POST /api/proposals/:id/approve` | token + super_admin + CSRF | re-validate allow-list (R9), stale check, status CAS, approval lock |
| `POST /api/proposals/:id/reject` | token + super_admin + CSRF | status CAS |
| Forecast endpoints | none (public) | rate limit only |

## 6. Test checklist (QA must pass all)

Supabase and RLS (run against a test project with the publishable key, as a signed-in `user`):

- [ ] S1 `select * from profiles` returns only the caller's row; another user's id returns nothing.
- [ ] S2 `update profiles set role='super_admin' where id = auth.uid()` via the Data API fails (permission denied), for both `user` and `super_admin` callers.
- [ ] S3 `insert` and `delete` on `profiles` fail for `authenticated`; every operation fails for `anon`.
- [ ] S4 A new sign-up gets a profile row with `role = 'user'`, even if `options.data` (user metadata) contains `role: 'super_admin'`.
- [ ] S5 Security Advisor shows no table in `public` with RLS disabled.
- [ ] S6 Deleting a user in Auth deletes their profile row.

Guard and Functions (each protected endpoint, using mocks or the test project):

- [ ] F1 No `Authorization` header → 401.
- [ ] F2 Malformed, expired, wrong-project or tampered token (one byte changed) → 401.
- [ ] F3 Valid token for a `user` → 403 on every Agent Console endpoint.
- [ ] F4 Valid token for `super_admin` → success.
- [ ] F5 Body containing `role: "super_admin"` from a `user` → still 403.
- [ ] F6 Demote the owner in SQL → the next request with the same, unexpired token → 403.
- [ ] F7 POST without `X-Requested-With: beachday` → 403; with `Origin: https://evil.example` → 403; with `Sec-Fetch-Site: cross-site` → 403.
- [ ] F8 Supabase unreachable or 5xx (mock) → 503, never success, never a stack trace.
- [ ] F8b A non-`https://` `SUPABASE_URL` outside the `dev` context → every protected request refused.
- [ ] F8c A token whose session was signed out (`signOut`) → 401 (Auth returns `session_not_found`).
- [ ] F9 Error bodies contain only `{error}`; no upstream text, token or header.
- [ ] F10 `agent-job` called directly without a valid HMAC → rejected, no work done.
- [ ] F11 Rate limit: the 11th chat request in 60 s → 429. Daily budget exhausted → 429.
- [ ] F12 Approve re-validates paths: a stored proposal edited to include `netlify.toml` or `supabase/migrations/x.sql` is rejected at approve. Allow-list fuzz list (doc 05 §5.1) all rejected at propose and approve.
- [ ] F13 Double-click Approve → exactly one commit.
- [ ] F14 Audit entries exist for chat, job, proposal, approve, reject and for 401/403 denials, with user id and no token.

Auth flows (Playwright, against a test Supabase project):

- [ ] A1 Sign up → must confirm email before sign-in works.
- [ ] A2 Log in, log out (`signOut`), and the Agents page then disappears and its APIs return 401.
- [ ] A3 Forgot password: same message for existing and unknown emails; the link lands on `/login/reset/` and `updateUser({ password })` works.
- [ ] A4 Continue with Google redirects to Google and back to `/login/` (mock or manual check on staging).
- [ ] A5 A `redirectTo` not on the allow-list is not honoured (Supabase falls back to the Site URL).
- [ ] A6 Signed-in `user` cannot see the Agents link; opening the Agents page directly shows "You don't have access", and all data calls are 403.

Secrets and build:

- [ ] B1 Build check passes on a clean build and fails when a planted `sb_secret_`, `sk-ant-` or `github_pat_` string is in `dist/`.
- [ ] B2 `dist/` contains the publishable key and URL only; no other env values.
- [ ] B3 Netlify env has no `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`; secrets are Functions-scoped and marked secret.
- [ ] B4 CSP `connect-src` lists only `'self'` and the Supabase project origin.

## 7. Owner setup steps (one-off, by the project lead)

1. Create the Supabase project. Under Project Settings → API Keys, copy the **publishable** key and the project URL. Do not copy the secret key anywhere.
2. Authentication → Providers: Email on, **Confirm email** on, minimum password length 12. Google on, with the client ID and secret from step 4.
3. Authentication → URL Configuration: Site URL and exact Redirect URLs (R13).
4. Google Cloud Console: Web OAuth client with the origin and Supabase callback only (R14).
5. Run the `profiles` migration (R4) in the SQL editor.
6. Sign up as the owner, confirm the email, then run the `super_admin` update (R3).
7. Netlify: set the variables in §4 with the scopes shown.

## 8. Open items

- CSP in `docs/03-architecture.md` §3.5 must add the Supabase project origin to `connect-src` (owner: netlify-engineer / software-architect).
- MFA for the `super_admin` account, and whether Functions should then also require the `aal2` assurance level.
- Whether Netlify Deploy Previews get their own Supabase project (recommended) instead of preview URLs on the production allow-list.

## 9. Sources

- Supabase, API keys: https://supabase.com/docs/guides/api/api-keys
- Supabase, Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, User management (profiles table and trigger): https://supabase.com/docs/guides/auth/managing-user-data
- Supabase, JWTs and JWKS: https://supabase.com/docs/guides/auth/jwts
- Supabase JS reference, `getUser` / `getClaims`: https://supabase.com/docs/reference/javascript/auth-getuser · https://supabase.com/docs/reference/javascript/auth-getclaims
- Supabase, Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase, Password-based auth: https://supabase.com/docs/guides/auth/passwords
- Supabase, Auth error codes (`session_not_found`): https://supabase.com/docs/guides/auth/debugging/error-codes
- Supabase, Sign in with Google: https://supabase.com/docs/guides/auth/social-login/auth-google
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- OWASP Top 10 for LLM Applications: https://genai.owasp.org/llm-top-10/
- GitHub, fine-grained personal access tokens: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- Vite, env variables: https://vite.dev/guide/env-and-mode
