# Decision records

Short records of decisions the project lead has made. A new decision that replaces an old one gets a new entry; the old entry is marked "Superseded".

| ID | Date | Decision | Status |
|---|---|---|---|
| D-001 | 2026-11-26 | Beach Day is a **PWA on Netlify**: a static front end and Netlify Functions for the Claude and GitHub calls, with **no other servers** | Accepted |
| D-002 | 2026-11-26 | **No rip-current proxy** in the score. Link out to the National Weather Service Surf Zone Forecast and rip current pages instead | Accepted |
| D-003 | 2026-11-26 | **Approve commits straight to `main`.** Netlify's Git-based continuous deployment redeploys the site | Accepted |
| D-004 | 2026-11-26 | Stay on the **Netlify Free plan** for now | Accepted |
| D-005 | 2026-11-26 | Use a **fine-grained personal access token** limited to this one repository for GitHub commits | Accepted |
| D-006 | 2026-11-26 | **Supabase Auth replaces the shared console password**: email + password (sign up, log in, log out, forgot password) and Continue with Google. Supersedes the password gate in doc 04 §4.5.2 | Accepted |
| D-007 | 2026-11-26 | **Roles live in a `profiles` table** with Row Level Security. Default role `user`; only `super_admin` may open the Agents page, chat with agents or Approve. `super_admin` is assigned by hand | Accepted |
| D-008 | 2026-11-26 | **Only the Supabase project URL and publishable key** are used, never the secret key. Every protected Netlify Function verifies the Supabase access token and the role on every request | Accepted |

## D-001 — PWA on Netlify, no other servers

- **Context:** A beach forecast is read-mostly, mobile and outdoors. The Agent Console needs secret-holding server code, but only a little of it.
- **Decision:** Static assets go on the Netlify CDN. All server logic lives in Netlify Functions (`netlify/functions/`), and state lives in Netlify Blobs. No VPS, container or separate database server.
- **Consequences:** Every server task must fit Netlify Function limits: 60 s for synchronous and streaming functions, 15 min for background functions (doc 03). A native wrapper (Capacitor) is out of scope unless App Store presence becomes a requirement (doc 02 §2.5).

## D-002 — No rip-current proxy

- **Context:** Open-Meteo has no rip-current risk. Doc 01 had proposed deducting points for long-period swell as a proxy.
- **Decision:** **Remove the wave-period rip proxy.** Wave height still affects comfort and swim-ability, and very high surf (≥ 6 ft) still caps the score. Rip-current risk is shown only as a prominent link to the official NWS sources:
  - NWS Miami Surf Zone Forecast: https://forecast.weather.gov/product.php?site=MFL&issuedby=MFL&product=SRF
  - Florida rip-current risk map: https://www.weather.gov/beach/florida
  - Rip current safety: https://www.weather.gov/safety/ripcurrent
- **Consequences:** The score never claims to assess rip currents. The UI copy says "Check today's rip current risk (National Weather Service)" on every day view.

## D-003 — Approve commits straight to `main`

- **Context:** Doc 04 offered committing to `main` or opening a pull request with a Deploy Preview.
- **Decision:** On Approve, the `approve` Function makes **one atomic commit to `main`** through the Git Data API (blobs → tree → commit → fast-forward ref update). There is no pull-request mode for now.
- **Consequences:** The human review in the Console is the only gate, so it must show the full diff, check the base commit for staleness and confirm before committing. The path allow-list and the token's missing Workflows permission are the safety net. Each approval causes one Netlify build, which counts toward Free plan build minutes.

## D-004 — Netlify Free plan

- **Context:** Cost should be zero until the app proves itself.
- **Decision:** Use the Netlify **Free** plan.
- **Consequences:**
  - Background functions (15 min) are available on credit-based Free plans (Netlify docs), so long agent jobs still work.
  - Function rate limits support per-IP and per-domain aggregation on Free (doc 03 §3.3).
  - Team-level rate-limit enforcement and other Enterprise features are not available.
  - Keep builds small and rare: there are monthly credit and build limits, so check the Netlify pricing page before heavy use.
  - Netlify Identity is not used.

## D-005 — Fine-grained personal access token

- **Decision:** `GITHUB_TOKEN` is a fine-grained personal access token with:
  - **only this repository** selected;
  - **Contents: Read and write** and **Metadata: Read**, and **nothing else** (in particular no Workflows permission);
  - **an expiry** (for example 90 days), with a rotation reminder in the README.

  It is stored only in Netlify environment variables (Functions scope, Production context), never in the repository or the browser.
- **Consequences:** GitHub itself rejects writes to `.github/workflows/**`. A leaked token can only touch this one repository's contents until it expires or is revoked.

## D-006 — Supabase Auth replaces the shared console password

- **Context:** Doc 04 §4.5.2 planned a single shared password (`CONSOLE_PASSWORD_HASH`), an HMAC-signed `bd_session` cookie (`SESSION_SECRET`), `/api/auth/login|logout` and a login-failure counter in Blobs. That gives one anonymous owner, no password reset, no way to tell people apart and two more secrets to manage. The lead wants real accounts: email + password with sign up, log in, log out and forgot password, plus "Continue with Google". Supabase Auth is a managed service that provides all of these. Its browser client needs only the project URL and the publishable key. Source: https://supabase.com/docs/guides/getting-started/api-keys
- **Decision:** We will use **Supabase Auth** for every sign-in.
  - **Email + password:** `signUp`, `signInWithPassword`, `signOut`, and `resetPasswordForEmail` followed by `updateUser({ password })` on the recovery page.
  - **Google:** `signInWithOAuth({ provider: "google", options: { redirectTo: <site>/login/ } })` with the PKCE flow. Password recovery returns to `<site>/login/reset/`. Google and the exact-path Supabase redirect allow-list are set up by hand in the two dashboards (`docs/security.md` R13, R14).
  - The `login/` page and `src/lib/auth.*` own this flow. The browser keeps the Supabase session (supabase-js default storage) and sends `Authorization: Bearer <access token>` to our Functions.
  - **Removed from the plan:** `CONSOLE_PASSWORD_HASH`, `SESSION_SECRET`, the `bd_session` cookie, `POST /api/auth/login`, `POST /api/auth/logout`, the `auth` Blobs store and `_lib/session.*`.
  - **Kept from doc 04 §4.5.2:** the CSRF checks on every POST (`X-Requested-With: beachday` plus an `Origin` that matches the site), a "type the title to confirm" step before Approve, and `noindex` / `no-store` on the Agents page.
- **Consequences:**
  - **D-001 still holds, but now has a qualification, stated openly.** Supabase is a managed service we call over HTTPS, like Open-Meteo, Anthropic and GitHub. We run no server, container or database server ourselves. Supabase is still a hosted Postgres database, though, so we now depend on a third party for sign-in. To keep that dependency small, Supabase holds **identity and roles only**. Proposals, jobs, budgets and the audit log stay in Netlify Blobs.
  - **New failure mode:** if Supabase is down or paused, nobody can sign in and every protected Function returns 503. These calls fail closed. The public Beach Day pages and `/api/forecast` do not touch Supabase, so they keep working.
  - **Supabase Free plan limits apply on top of D-004.** Free projects "are paused after 1 week of inactivity" (https://supabase.com/pricing; https://supabase.com/docs/guides/platform/free-project-pausing). A sporadically used Agents page can find the project paused, and it has to be restored from the Supabase dashboard. The built-in email provider sends only **2 emails per hour** (https://supabase.com/docs/guides/auth/rate-limits). Sign-up confirmations and password resets will hit that limit unless custom SMTP is configured; the SMTP password then lives in the Supabase dashboard, never in this repository.
  - Brute-force protection for login moves to Supabase Auth's own rate limits. Our Functions keep their per-IP `rateLimit`.
  - D-004's "Netlify Identity is not used" is unchanged.
  - The access token is readable by page JavaScript (it is not an HttpOnly cookie). That makes XSS the main way to steal a token. The strict CSP (`script-src 'self'`), the no-`innerHTML` rule, a short JWT expiry and the path deny-list for auth files are the mitigations (see `docs/build-plan.md` §8).
  - Doc 04 §4.5.2 now describes a superseded design. Its owner (security-engineer) updates doc 04 and `docs/security.md` to match.

## D-007 — Roles in a `profiles` table with RLS; only `super_admin` reaches the Agents page

- **Context:** Anyone can create an account (D-006), so having an account must grant nothing on its own. Role data must sit where users cannot write it. `user_metadata` on a Supabase user can be edited by that user, so it must never carry a role. RLS is how Supabase limits rows when a request uses the publishable key plus a user token (Postgres role `authenticated`). Source: https://supabase.com/docs/guides/getting-started/api-keys
- **Decision:**
  - Table `public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text, role text not null default 'user' check (role in ('user','super_admin')), created_at timestamptz not null default now())`.
  - A `security definer` trigger on `auth.users` insert creates the profile row with the default role.
  - **RLS is on.** The only policy is SELECT for `authenticated` where `(select auth.uid()) = id`. There are no INSERT, UPDATE or DELETE policies. All privileges are revoked from `anon` and `authenticated`, and only SELECT is granted back to `authenticated` (exact SQL in `docs/security.md` R4). A signed-in person can read only their own row and can never change any role, their own included.
  - **`super_admin` is assigned by hand** by the project owner in the Supabase SQL editor (`update public.profiles set role = 'super_admin' where email = '…';`). No endpoint, UI or agent can grant it.
  - **Only `super_admin`** may use the Agents page and its APIs: list agents, chat, view proposals, Approve and Reject. A `user` can sign in and use the public pages, which are public anyway.
  - The migration lives in `supabase/migrations/`.
- **Consequences:**
  - The Agents page HTML is a static shell with no data and no secrets. Its script sends signed-out visitors to `/login/` and shows "You don't have access" to a `user`. **The real gate is in the Functions (D-008)**, so hiding the page is only a convenience. A Netlify Edge Function could not gate the HTML anyway, because the token lives in browser storage, not in a cookie the edge would see.
  - The agent list is no longer published as a static `dist/agents.json` (doc 03 §3.6). `GET /api/agents` serves it to `super_admin` from a file bundled into the Function.
  - Adding a second admin is a manual SQL step, which is deliberate. Revoking access means setting the role back to `user`. Because every request re-reads the role, the change takes effect on that person's next request.
  - Agents must not be able to propose changes to the auth code or the migrations. The path deny-list adds `supabase/**`, `login/**` and `src/lib/auth.*` (owner: security-engineer).

## D-008 — Only the URL and publishable key; token and role verified in every Function

- **Context:** Supabase secret keys "provide full access to your project's data, bypassing Row Level Security" (https://supabase.com/docs/guides/getting-started/api-keys). Beach Day never needs to bypass RLS: a person's own token is enough to read their own role. Holding a secret key would add one more high-value secret to the Functions environment for no gain.
- **Decision:**
  - The only Supabase values are `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (Functions), plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (build, public). **No `sb_secret_…` key, no `service_role` key and no legacy JWT secret exist anywhere in the project.** The secret scan fails the build if it finds `sb_secret_` or `service_role`.
  - Every protected Function calls `requireRole(req, ctx, "super_admin")` from `netlify/functions/_lib/auth.*` **before doing any work, on every request**, with no caching between requests:
    1. Read `Authorization: Bearer <token>`. If it is missing or malformed → **401**.
    2. Verify the token with Supabase Auth: `GET {SUPABASE_URL}/auth/v1/user` with `apikey: <publishable key>` and the bearer token (what `supabase.auth.getUser(token)` does). If it is invalid or expired → **401**. Switching to local JWKS verification (`/auth/v1/.well-known/jwks.json`, `getClaims`) is allowed later, once the project uses asymmetric signing keys (https://supabase.com/docs/guides/auth/jwts). A shared JWT secret is never allowed.
    3. Read the role: `GET {SUPABASE_URL}/rest/v1/profiles?select=id,role&id=eq.<user id>` with the publishable key and **the user's own bearer token**, so RLS applies. It must return exactly one row whose `id` equals the verified user id. If `role !== "super_admin"` → **403**.
    4. If Supabase is unreachable or answers 5xx → **503** (fail closed). Never treat an error as "allowed".
  - The role always comes from the `profiles` row, never from JWT claims, `user_metadata` or the request body.
  - POST endpoints also check CSRF (D-006). `GET /api/forecast` stays public.
- **Consequences:**
  - Each protected call makes about two extra HTTPS round-trips to Supabase. That is acceptable inside the 60 s limit and at the Agents page's low volume.
  - Revoked roles take effect on the next request. Step 2 asks the Auth server, which rejects tokens whose session no longer exists (error code `session_not_found`, for example after sign-out: https://supabase.com/docs/guides/auth/debugging/error-codes). Local JWKS verification would accept such a token until it expires. If we switch to JWKS, keep the JWT expiry short.
  - Anyone can read the publishable key from the bundle. That is safe by design, because it maps to the `anon` or `authenticated` role under RLS.
  - Tests point `SUPABASE_URL` at a local mock (`docs/build-plan.md` §7). To stop a misconfigured production site from trusting a mock, `_lib/auth.*` accepts a non-`https://` `SUPABASE_URL` only when `context.deploy.context === "dev"`.
  - If background jobs (doc 04 §4.7) are added later, the background function cannot re-check a user token for 15 minutes. It verifies the internal HMAC signature (`JOB_SIGNING_SECRET`) instead, and `POST /api/jobs` performs the full token and role check. That is the only allowed exception, and it needs a new record when it is built.
