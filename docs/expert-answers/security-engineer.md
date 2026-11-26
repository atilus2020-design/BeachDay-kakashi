# Locking down the Agent Console: rules and environment variables

*Rook (security engineer), 2026-11-26. Answers the project lead: "How do we stop strangers from changing our code or spending our API credits?"*

**Assumed auth model (replaces the shared password in doc 04 §4.5.2):**

- Supabase Auth with email/password and Continue with Google.
- A `profiles` table linked to `auth.users`, with a `role` column that defaults to `'user'`.
- RLS lets each user read only their own row and never change their role.
- Only `super_admin` may open the Agents page, chat with agents or Approve.
- Every Function checks the token and the role.
- Only the Supabase project URL and publishable key are used, never the secret or service-role key.

The decisions still stand: D-003 (Approve commits to `main`), D-004 (Netlify Free plan) and D-005 (fine-grained token).

**Short answer:** the Agents page is static and the browser holds no secrets, so hiding the page protects nothing. All the protection sits on the server, in two places. Every Netlify Function refuses work unless the caller proves they are `super_admin`. Every outside system (Anthropic, GitHub, Supabase) gets the least power we can give it, so if a check fails anyway, the damage has a ceiling.

---

## Rules, in order of importance

### 1. Every protected Function checks who is calling and their role, on every request, before doing any work
**Stops:** strangers or ordinary signed-in users chatting with agents (spending credits), starting jobs, reading proposals or system prompts, and clicking Approve by calling the API directly with `curl`, which skips the UI.

- Use one shared guard (`netlify/functions/_lib/auth.ts`, the pattern in `knowledge/security-engineer/examples/guard-request.mjs`). **Every** Function calls it first: `agents`, `agent-chat`, `jobs`, `job-status`, `proposals`, `approve` and `reject`. Only the public forecast Function skips it.
- The guard runs these checks in order:
  1. Read `Authorization: Bearer <access token>`. If it is missing, return 401.
  2. Verify the token **with Supabase on the server**. `supabase.auth.getUser(token)` asks Supabase Auth, so a signed-out or deleted user fails too. Never just decode the JWT, and never trust a `user_id` sent in the request.
  3. Read the role from `profiles` **using the caller's own token** (a Supabase client built from the publishable key plus `Authorization: Bearer <token>`, so RLS applies). If it is not `super_admin`, return 403.
  4. Only now touch Claude, GitHub or Blobs.
- **Default deny.** Any error, a timeout reaching Supabase, or a missing profile row means 401 or 403, never "let it through".
- Don't cache the role, or cache it for 60 seconds at most, so a demotion takes effect immediately.
- **Never read the role** from `user_metadata`, a client header or a JWT claim the user can influence. Users can edit their own `user_metadata`.
- The background function (`agent-job`) has a public URL too. It accepts only calls signed with `JOB_SIGNING_SECRET`: an HMAC over job ID and timestamp, rejected if older than 60 seconds. The compare-and-swap claim on the job (`queued` → `running`) stops replays. The `jobs` endpoint that signs the call runs the full guard first.
- Tests (QA): no token gives 401, a `user`-role token gives 403, an expired or forged token gives 401, `super_admin` gives 200, all against every route.

### 2. Nobody can make themselves `super_admin`, and every Supabase table has RLS on
**Stops:** privilege escalation. The publishable key is public by design, so anyone can call Supabase's REST API directly with it. A table without RLS can be read and written by the whole internet. A role column a user can update hands out the keys to the repository.

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'super_admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Users may read their own row only. There are deliberately NO insert/update/delete policies.
create policy "read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
revoke insert, update, delete on public.profiles from anon, authenticated;

-- The profile row is created by the database, always as 'user'.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

- **Promote someone** only by hand in the Supabase dashboard SQL editor, as the project lead: `update public.profiles set role = 'super_admin' where id = '<uuid>';`. No API, Function or agent can do this, because we hold no service-role key (rule 3).
- **RLS on every table** in `public` (and any other schema the API exposes), now and in future. Run the Supabase Security Advisor after every schema change; "RLS disabled" is a blocker.
- `profiles` holds no email or other personal data beyond what the guard needs.

### 3. No secret ever reaches the browser or the repository, and the service-role key is never used at all
**Stops:** key theft. Anything in the front-end bundle, `netlify.toml`, git history or a log is public. A Supabase secret or service-role key would skip RLS and let its holder promote themselves. A leaked Anthropic key spends our credits. A leaked GitHub token commits to `main`.

- `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` and `JOB_SIGNING_SECRET` live only in Netlify environment variables, with **Functions scope only** and **"Contains secret values"** ticked. They never go in `netlify.toml` (Functions can't read those values anyway), in `VITE_*` variables, in logs or in responses.
- **Don't create a Supabase secret or service-role variable at all.** Nothing needs it: profiles are created by the trigger, roles are read through RLS, and promotion is done by hand.
- Only two Supabase values are public: the project URL and the publishable key (`sb_publishable_…`). They are safe *because* of rule 2.
- A build check fails the deploy if `dist/` contains any secret variable name, or the patterns `sk-ant-`, `github_pat_`, `sb_secret_`, `service_role` or `JOB_SIGNING_SECRET`.
- Add a pre-commit or CI secret scan, and turn on GitHub secret scanning and push protection for the repository.

### 4. Agents can only *propose*. Writes are narrow, checked twice and approved by a human
**Stops:** prompt injection, meaning a repository file, chat message or tool result that steers an agent into a harmful change. Also stops a stolen admin session turning into lasting control of CI, the build or the Functions that hold our secrets (OWASP LLM01 and LLM06).

- The agent has three tools: `read_file`, `list_files` and `propose_change`. It never holds a GitHub credential, and nothing is written without a human clicking Approve.
- Apply the path allow-list (`path-allowlist` skill, `_lib/allowlist.ts`) at **propose time and again at approve time**. The deny list wins: `.github/**`, `.claude/**`, `netlify/**`, `netlify.toml`, `package*.json`, `scripts/**`, `vite.config.*`, `**/.env*`, `**/*.pem`, `**/*.key`.
  - Normalise paths and reject anything strange.
  - At most 20 files, 200 KB each and 1 MB in total, text only.
  - Every tree entry uses mode `100644`.
  - Agents can never edit the auth, allow-list or Function code that guards them.
- D-005 token: **this repository only**, Contents read/write plus Metadata read, **no Workflows**, with an expiry. GitHub itself then refuses writes to `.github/workflows/**`.
- The target repository comes from `GITHUB_REPO`, **never from the request** (fine-grained tokens can read any public repository).
- Approve (D-003):
  - show the full diff and the base SHA;
  - require an explicit confirmation;
  - **reject stale proposals** with 409 when `main` has moved and a touched file changed;
  - run **one approval at a time** (a lock in Blobs with strong consistency).
- Render model output with `textContent` only. Escape diffs.

### 5. Put a hard ceiling on spending, then layer softer limits under it
**Stops:** credit burn from any cause: a stranger who gets past rule 1, a compromised admin account, a runaway tool loop or a bug. The spend limit is the one control that still holds when every other one has failed.

| Layer | Setting |
|---|---|
| **Anthropic workspace spend limit** (Claude Console) | A dedicated workspace and key for Beach Day, with a monthly limit you can afford to lose entirely, such as $50. Turn on usage alerts at 50% and 80% |
| Separate keys | The production key differs from the local-development key, and each has its own small limit |
| Netlify `rateLimit` per IP (Free plan supports it, D-004) | chat 10 per 60 s, jobs 3 per 60 s, approve 5 per 60 s, and a modest limit on any Function that verifies tokens |
| App budget in Blobs (strong consistency), **per user ID and in total** | `DAILY_CHAT_LIMIT` (200), `DAILY_JOB_LIMIT` (20), `DAILY_TOKEN_LIMIT` (summed from `usage`). Checked *before* the Claude call and recorded after it |
| Per call | Bounded `max_tokens`; chat at `effort: "low"`; transcripts capped at about 30 turns or 100 KB; job continuations capped at 3; model IDs only from the allow-list (no surprise Fable at $8/$40 per million tokens) |
| Claude 429 | Respect `retry-after`, never retry in a tight loop |

### 6. Make the `super_admin` account hard to take over
**Stops:** account takeover, the shortest route around rules 1 to 5. Whoever controls the admin login can chat and Approve.

- **Turn on multi-factor authentication (MFA) for every `super_admin`.** Supabase supports TOTP authenticator apps. Have the guard require the session's `aal2` assurance level for chat, jobs and Approve, and return 403 "Verify with your authenticator" otherwise.
- **Require email confirmation** for email/password sign-ups. This stops someone pre-registering the lead's address before the lead signs in with Google.
- **Restrict redirect URLs** in Supabase Auth to the production site URL (and `http://localhost:<port>` for development). Never use wildcards that match `*.netlify.app`, or a look-alike or preview URL could receive login tokens.
- **Decide about open sign-ups.** Strangers signing up get role `user` and can do nothing, so open sign-ups are safe *if* rules 1 and 2 hold. Since only the lead uses anything that needs login, I recommend turning off "Allow new users to sign up" once the lead's account exists. That is the smallest attack surface.
- Apply Supabase's built-in rate limits on sign-in and sign-up, and keep the default short access-token lifetime (about an hour) with refresh tokens.
- Use a strong, unique password on the admin's Google and Supabase accounts, with MFA on both dashboards. The same applies to Netlify, GitHub and the Claude Console, because anyone who can edit env vars owns everything.

### 7. Protect the token in the browser: no XSS, defence-in-depth CSRF checks
**Stops:** session theft. supabase-js keeps the access and refresh tokens in `localStorage`, so one cross-site scripting (XSS) bug lets an attacker read them and act as `super_admin`. Also stops cross-site requests made in the admin's name.

- Strict Content Security Policy (CSP):
  - `script-src 'self'` with no inline script and no third-party scripts or tag managers;
  - `connect-src 'self' https://<project>.supabase.co`;
  - `frame-ancestors 'none'`.
- Render everything with `textContent`, never `innerHTML`.
- The token travels in an `Authorization` header, never a cookie, so the browser doesn't attach it automatically.
- Every POST still requires `X-Requested-With: beachday`, and `Origin` (and `Sec-Fetch-Site`, when present) must match the site. Otherwise return 403.
- Agents page: `noindex`, `Cache-Control: no-store`. Sign-out calls `supabase.auth.signOut()` and clears the transcripts in `sessionStorage`.

### 8. Secrets live in Production only. Previews and branch deploys get no write power
**Stops:** a Deploy Preview, branch deploy or forked pull request running Functions that hold our real keys, which would be a backdoor around the reviewed `main`. Also stops test-only overrides sending real keys to a fake server.

- `GITHUB_TOKEN` is set for the **Production** context only. Only Production can commit.
- `ANTHROPIC_API_KEY` is set for Production only. If previews must chat, give them a separate key with a tiny spend limit.
- In Netlify, set deploy previews from forks to **not** receive sensitive variables (or to require approval first).
- `ANTHROPIC_BASE_URL`, `GITHUB_API_URL` and `SUPABASE_URL` overrides are **for tests only**. They must be **unset in Production**, or a changed value would send real keys to whoever owns that URL.

### 9. Safe errors, an audit trail and rotation
**Stops:** information leaks from error bodies, abuse nobody notices, and leaked credentials that stay valid for ever.

- Clients get generic `{ error }` messages only: no stack traces, no upstream bodies, no tokens. Logs are redacted.
- Append an audit entry to Blobs for every chat turn (user ID, agent, tokens), job, proposal, approval, rejection and 401/403 denial, with time, IP and request ID. Show it on the Activity tab.
- Rotation:
  - `GITHUB_TOKEN` expires after 90 days or less; put a reminder in the README.
  - Rotate `ANTHROPIC_API_KEY` and `JOB_SIGNING_SECRET` at once on any suspicion.
  - Demote a user with one SQL `update` (rule 2). Revoke their sessions from the Supabase dashboard.

---

## Environment variables

Set them in the Netlify UI (Site configuration → Environment variables), never in `netlify.toml` or the repository. "Builds" scope means Vite can put the value into the front end. Only public values may have it.

| Name | Where set / scope / context | Secret? | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Netlify; **Functions** scope only; **Production** context (optionally a separate tiny-limit key for Deploy Previews); "Contains secret values" | **Secret** | Calls the Claude API from `agent-chat` and `agent-job`. A dedicated Claude Console workspace with a spend limit |
| `GITHUB_TOKEN` | Netlify; **Functions** only; **Production only**; secret values | **Secret** | D-005 fine-grained token (this repository only, Contents read/write plus Metadata read, no Workflows, with expiry). Used for `read_file`/`list_files` and the Approve commit |
| `GITHUB_REPO` | Netlify; Functions; all contexts | Not secret (but must be fixed) | `owner/name` of the only repository the Functions read or commit to. Never taken from the request |
| `JOB_SIGNING_SECRET` | Netlify; **Functions** only; Production (another value elsewhere); secret values | **Secret** | HMAC key so only our `jobs` Function can start the publicly reachable background `agent-job` Function. 32+ random bytes |
| `VITE_SUPABASE_URL` | Netlify; **Builds** scope; all contexts | Public | Supabase project URL that the front-end supabase-js client uses for sign-in |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Netlify; **Builds**; all contexts | Public (by design, safe only because of RLS) | Publishable key (`sb_publishable_…`) for browser sign-in, sessions and reading the user's own profile |
| `SUPABASE_URL` | Netlify; **Functions**; all contexts | Public | Same project URL, used by the guard to verify tokens and read `profiles`. Tests may point it at a mock; never change it in Production |
| `SUPABASE_PUBLISHABLE_KEY` | Netlify; **Functions**; all contexts | Public | Same publishable key, for the guard's Supabase client (always combined with the caller's own access token, so RLS applies) |
| `DAILY_CHAT_LIMIT` | Netlify; Functions | Not secret | App budget: chat turns per day (per user and in total). Default 200 |
| `DAILY_JOB_LIMIT` | Netlify; Functions | Not secret | App budget: background jobs per day. Default 20 |
| `DAILY_TOKEN_LIMIT` | Netlify; Functions | Not secret | App budget: Claude tokens per day, summed from `usage`. The Functions stop before the Anthropic spend limit is reached |
| `ANTHROPIC_BASE_URL`, `GITHUB_API_URL` | Local and CI test runs only; **never set in Production** | Not secret | Point the SDK or GitHub calls at mocks during tests |
| `URL` | Set automatically by Netlify (read-only) | Public | The site's main URL, used for the `Origin` check (or use `context.site.url`) |

**Deliberately absent:**

- **No Supabase secret or service-role key, anywhere.**
- `CONSOLE_PASSWORD_HASH` and `SESSION_SECRET` from doc 04 §4.9 are replaced by Supabase Auth. Delete them.
- The **Google OAuth client secret** is entered in the Supabase dashboard (Auth → Providers → Google), not in Netlify, because Supabase handles the OAuth exchange.

---

## Open items for the orchestrator

1. **Write a decision record (D-006)** for "Supabase Auth with `profiles.role`; only `super_admin` uses the Console". It replaces the password gate. Doc 04 §4.2, §4.5.2, §4.5.5, §4.8, §4.9 and `CLAUDE.md` ("password- or role-protected") then need updating.
2. **Lead decisions:**
   - Require MFA (`aal2`) for `super_admin`? I recommend yes.
   - Turn off new sign-ups after the lead's account exists? I recommend yes.
3. **Knowledge gap:** `knowledge/security-engineer/` has no Supabase notes yet. The Supabase details above (the `getUser` check, RLS patterns, publishable keys, `aal2`, redirect allow-list) come from my general knowledge, not the folder. The agent builder should add notes taken from the official Supabase Auth, RLS and API-keys docs, and I will re-check these rules against them.
4. `docs/04-agent-console.md` §4.5.4 lists an older allow-list (`src/console/**`). The `path-allowlist` skill is the newer one and should be treated as the source of truth.
