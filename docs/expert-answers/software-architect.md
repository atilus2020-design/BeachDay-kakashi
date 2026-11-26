# Beach Day architecture: Ines (software-architect)

**Question from the project lead:** draw the Beach Day architecture as a simple text diagram, list the folders and files to create, and name the three biggest risks with how to reduce each one.

**Constraints I honoured:** D-001 (static front end + Netlify Functions + Netlify Blobs, no other servers), D-002 (no rip proxy, NWS link-out only), D-003 (Approve makes one atomic commit to `main`), D-004 (Netlify Free plan), D-005 (fine-grained PAT, this repository only, Contents read/write + Metadata read, no Workflows).

**Sources:** `docs/01`–`05`, `docs/decisions.md`, `docs/expert-roster.md`, `knowledge/software-architect/`. Platform limits come from the Netlify docs cited in `docs/03-architecture.md` §3.3: 60 s for synchronous and streaming functions, 15 min for background functions, Blobs eventually consistent unless you ask for `strong`.

---

## 1. Diagram

```
 PHONE / BROWSER (PWA)                 NETLIFY (Free plan, D-004)                      EXTERNAL
 ═════════════════════                 ══════════════════════════                      ════════

 ┌───────────────────────┐   HTTPS    ┌──────────────────────────┐
 │ index.html + app JS   │──────────▶│ CDN: static dist/         │
 │ src/scoring (runs     │            │ (app, /agents/, /login/,  │
 │  here, also offline)  │            │  manifest, icons, sw.js)  │
 └──────────┬────────────┘            └──────────────────────────┘
            │ every fetch
 ┌──────────▼────────────┐
 │ SERVICE WORKER sw.js  │  shell: precache, cache-first
 │                       │  /api/forecast: network-first → cache ("Last updated 2 h ago")
 │                       │  /api/agent*, /api/jobs*, /api/proposals*, /agents/*: NEVER cached
 └──────────┬────────────┘
            │
            │ GET /api/forecast?beach=id ─▶ fn forecast ── CDN-cached 30 min/beach ──▶ api.open-meteo.com
            │                                                                        marine-api.open-meteo.com
            │
            │  ┌ Supabase Auth (added later) ───────────────────────────────────────▶ SUPABASE (hosted)
            │  │ supabase-js: sign in (email/password or Google OAuth)                Auth + Postgres
            │  │ → access token (JWT) kept in the browser                             profiles(id, role)
            │  └──────────────────────────────────────────────────────────────────    RLS: read own row only
            │                                                                              ▲
            │ Authorization: Bearer <Supabase access token>                               │ verify token (JWKS)
            │ X-Requested-With: beachday                                                   │ + read role
            ▼                                                                              │
     ┌───────────────────────────────────────────────────────────────────────────┐        │
     │ EVERY protected Function first calls _lib/auth.requireSuperAdmin(req) ────┼────────┘
     │   401 no/invalid token · 403 role ≠ super_admin or bad Origin/CSRF        │
     ├───────────────────────────────────────────────────────────────────────────┤
     │ GET  /api/agents               fn agents      (reads build-time agents.json)
     │ POST /api/agent/chat (SSE)     fn agent-chat  ─── streams, < 60 s ─────────────────▶ api.anthropic.com
     │ POST /api/jobs                 fn jobs  ─HMAC─▶ fn agent-job (background, 15 min) ──▶ api.anthropic.com
     │ GET  /api/jobs/:id             fn jobs (poll)                                         (+ GitHub reads)
     │ GET/POST /api/proposals[/:id]  fn proposals (list, view diff, reject)
     │ POST /api/proposals/:id/approve fn approve ─ allow-list again + stale check ────────▶ api.github.com
     └───────────────┬───────────────────────────────────────────────────────────┘        Git Data API:
                     │                                                                     blob→tree→commit
              ┌──────▼──────────────────────────┐                                          →update refs/heads/main
              │ NETLIFY BLOBS (strong for state) │                                               │
              │ jobs · proposals · ratelimit ·   │                                               │ push to main
              │ budget · audit                   │                                               ▼
              └──────────────────────────────────┘                                       GITHUB repo (main)
                                                                                                │ webhook
     ┌──────────────────────────────────────────────────────────────────────┐                  │
     │ NETLIFY BUILD: npm run build = test + build-agents + vite build      │◀─────────────────┘
     │ pass → new deploy goes live · fail → previous deploy stays live      │
     └──────────────────────────────────────────────────────────────────────┘

 Secrets (Netlify env vars, Functions scope only): ANTHROPIC_API_KEY, GITHUB_TOKEN (Production only),
 JOB_SIGNING_SECRET. Not secret: GITHUB_REPO, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (also exposed to the build as VITE_*).
 No other servers: Supabase, Open-Meteo, Anthropic and GitHub are hosted third-party APIs, not servers we run.
```

**Where Supabase fits:**

- The browser talks to Supabase Auth directly, through supabase-js, to sign in and refresh the session. Google OAuth is configured in Supabase.
- The browser sends the Supabase access token to our Functions as a Bearer token.
- Every protected Function verifies that token itself: signature through Supabase's JWKS, plus `exp`, `iss` and `aud`. It then reads `profiles.role` and allows only `super_admin`.
- The forecast stays public, so `/api/forecast` needs no auth.
- The Agents page (`/agents/`) is a static shell with no secrets. It only checks the role to decide what to show; the Functions do the real check.

**Contracts (summary; full shapes go in `docs/03-architecture.md` before work runs in parallel):**

| Endpoint | Auth | Request → response | Errors |
|---|---|---|---|
| `GET /api/forecast?beach=<id>` | none; `rateLimit` 60/60 s per IP | → `{ beach, forecast, marine, fetchedAt, partial? }` | 400, 404 unknown beach, 502 upstream |
| `GET /api/agents` | super_admin | → `[{ name, description, model, personality, color }]` | 401, 403 |
| `POST /api/agent/chat` | super_admin + CSRF; 10/60 s | `{ agent, messages[] }` → SSE `text` … `proposal?` → `done` \| `error` | 400, 401, 403, 404, 429 |
| `POST /api/jobs` · `GET /api/jobs/:id` | super_admin + CSRF | `{ agent, task }` → `{ jobId }` · → `{ status, events[], proposalId? }` | 401, 403, 429 |
| `GET /api/proposals[/:id]`, `POST …/:id/reject` | super_admin (+ CSRF on POST) | → `{ id, title, baseSha, files[{path, diff}], status }` | 401, 403, 404 |
| `POST /api/proposals/:id/approve` | super_admin + CSRF | `{ confirm: true }` → `{ commitSha, url }` | 401, 403, 404, 409 stale, 422 path not allowed |

---

## 2. Folders and files

```
/
├─ netlify.toml                       # build, publish=dist, functions dir, headers/CSP (+ SUPABASE_URL in connect-src), sw.js no-cache, /agents/* no-store   [netlify-engineer]
├─ package.json  · package-lock.json  # build = "npm test && node scripts/build-agents.mjs && vite build"                                                  [netlify-engineer]
├─ vite.config.ts · tsconfig.json
├─ .env.example                       # names only, never values
├─ index.html                         # forecast home (beach picker + days)
├─ agents/index.html                  # Agents page: chat, jobs, proposals, diff, Approve (super_admin only)
├─ login/index.html                   # Supabase sign-in: email/password + Google            ← Supabase
├─ how-it-works/index.html · resources/index.html · guide/index.html
├─ offline.html
├─ public/
│  ├─ manifest.webmanifest
│  ├─ icons/ (192, 512, maskable, apple-touch-icon)
│  └─ robots.txt
├─ src/
│  ├─ app/            main.ts, beach-picker.ts, day-view.ts, nws-link.ts      # forecast UI           [frontend-engineer]
│  ├─ agents/         main.ts, chat.ts, jobs.ts, proposals.ts, diff-view.ts   # Agents page UI        [frontend-engineer]
│  ├─ auth/           supabase-client.ts, session.ts, guard.ts                # ← Supabase (browser side; publishable key only)
│  ├─ lib/            api.ts (fetch + bearer), sse.ts                         # fetch/stream helpers
│  ├─ scoring/        score.ts, window.ts, vetoes.ts, components.ts, labels.ts   # pure, no I/O       [open-meteo-integrator]
│  ├─ shared/         api-types.ts                                            # contract types used by UI and Functions (pure)
│  ├─ data/           beaches.json
│  ├─ styles/         tokens.css, glass.css, base.css                         # [ui-designer]
│  └─ sw.ts                                                                   # service worker → dist/sw.js   [pwa-mobile-engineer]
├─ netlify/functions/
│  ├─ forecast.mts                    # public, CDN-cached proxy to Open-Meteo
│  ├─ agents.mts                      # super_admin
│  ├─ agent-chat.mts                  # super_admin, streaming SSE
│  ├─ jobs.mts                        # super_admin: start (HMAC-signed call to background) + poll
│  ├─ agent-job.mts                   # config.background = true; verifies HMAC; idempotent (onlyIfNew)
│  ├─ proposals.mts                   # super_admin: list / get / reject
│  ├─ approve.mts                     # super_admin + CSRF: allow-list, stale check, atomic commit to main
│  ├─ _lib/
│  │  ├─ auth.ts                      # ← Supabase: verifyToken (JWKS), getRole, requireSuperAdmin, checkCsrf   [security-engineer]
│  │  ├─ allowlist.ts                 # pure path policy (propose + approve)                                   [security-engineer]
│  │  ├─ claude.ts · github.ts        # upstream clients; base URLs overridable by env for tests              [agent-console-engineer]
│  │  ├─ blobs.ts · budget.ts · audit.ts · http.ts (JSON errors)
│  │  └─ agents.ts                    # loads _generated/agents-private.json
│  └─ _generated/agents-private.json  # build output, git-ignored; full system prompts, Functions only
├─ supabase/
│  └─ migrations/0001_profiles.sql    # ← Supabase: profiles(id uuid → auth.users, role text default 'user'),
│                                     #   RLS: select own row; NO update policy on role; new-user trigger
├─ scripts/build-agents.mjs           # .claude/agents/*.md → dist/agents.json (public) + _generated (private)
├─ tests/
│  ├─ unit/        scoring.test.ts, allowlist.test.ts (+ fuzz), auth.test.ts, diff.test.ts
│  ├─ functions/   forecast.test.ts, approve.test.ts (mock GitHub), every-function-requires-auth.test.ts
│  └─ e2e/         forecast.spec.ts, offline.spec.ts, agents-approve.spec.ts, a11y.spec.ts
├─ playwright.config.ts
├─ docs/  (research 01–05, decisions.md, build-plan.md, ux/, expert-answers/)
├─ .claude/agents/*.md · .claude/skills/*/SKILL.md · knowledge/**
└─ README.md
```

**Boundaries:**

- The front end never imports from `netlify/functions/`.
- Pure code lives in `src/scoring/` and `src/shared/`, which both sides may import.
- The agents' write allow-list must also deny `supabase/**` and `src/auth/**`. Agents must not be able to change who is an admin.

**New decision to record (proposed D-006, needs the lead's sign-off):**

- Supabase Auth replaces the password gate from doc 04 §4.5.2. That removes `auth.mts`, `_lib/session.ts`, `SESSION_SECRET` and `CONSOLE_PASSWORD_HASH`.
- Supabase is a hosted third-party API, like Open-Meteo, Anthropic and GitHub. It holds only identity and role. It is **not** our own server or database server, so D-001 still holds: app state stays in Blobs.

---

## 3. The three biggest risks

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | **An approved change breaks or weakens production.** Approve commits straight to `main` with no pull request (D-003). An agent could be steered by prompt injection, or a proposal could be stale or simply broken. | Medium | High | **(a)** The server checks the path allow-list twice, on propose and on approve. Deny always wins. Denied paths include `netlify/**`, `netlify.toml`, `package*.json`, `scripts/**`, `.github/**`, `.claude/**`, `supabase/**` and `src/auth/**`. Only file mode `100644` is written. **(b)** The stale check compares `baseSha` and per-file SHAs and returns 409 on a mismatch. **(c)** The full diff is shown, followed by a confirm step. **(d)** The build command runs the tests first. A failing commit then fails the Netlify build, and the previous deploy stays live. **(e)** Rollback is one click in the Netlify deploy list, and every approval is written to the audit log in Blobs. The token has no Workflows permission (D-005). | agent-console-engineer, security-engineer |
| 2 | **A Function that holds a secret gets called without a valid super_admin.** That could burn Claude credits or commit to the repository. It can happen if one Function forgets the check, if a user promotes their own role, or if a token is stolen through XSS. | Medium | High | **(a)** One shared `requireSuperAdmin(req)` in `_lib/auth.ts` runs first in every protected Function. It verifies the signature through JWKS plus `exp`, `iss` and `aud`. It then reads the role from `profiles` on every request, so a demotion takes effect at once. **(b)** A test lists every file in `netlify/functions/` except `forecast` and asserts each one returns 401 with no token and 403 with a `user` token. **(c)** RLS: users can read their own profile row but can never update `role`. Admins are set by hand in the Supabase dashboard. **(d)** A strict CSP (`script-src 'self'`) limits XSS, and the service worker never caches authenticated responses. **(e)** Defence in depth: per-IP `rateLimit`, a daily budget in Blobs (strong consistency), an Anthropic workspace spend limit, and no `GITHUB_TOKEN` on Deploy Previews. | security-engineer |
| 3 | **Platform limits cause silent failures.** Chat is cut off at 60 s. A background job retries and does the same work twice. A status read straight after a write sees stale Blobs data. Approvals use up Free-plan build credits. | High | Medium | **(a)** Bound `max_tokens` so a chat turn ends well under 60 s. Anything longer becomes a background job (15 min) that the browser polls. **(b)** Make jobs idempotent: create with `onlyIfNew`, and move a proposal from pending to approved with `onlyIfMatch`, so retries after 1 and 2 min are harmless. **(c)** Use `consistency: "strong"` for jobs, proposals, rate limits and the budget. **(d)** One approval makes one atomic commit and one build. Batch related edits into one proposal, keep the build small and fast, and check credit usage on the Netlify pricing page each month. **(e)** The forecast is CDN-cached per beach, so Open-Meteo calls grow with the number of beaches, not users (well under 10,000 a day). | netlify-engineer, agent-console-engineer |

**Smaller items to watch, not top three:**

- A Supabase free project may pause after a period of inactivity. Check the current Supabase pricing page; if it pauses, sign-in to the Agents page fails, but the public forecast is unaffected.
- The token-verification method (JWKS versus calling `/auth/v1/user`) is the security engineer's call. I recommend JWKS plus a profiles read with the user's own token, which means no Supabase service-role key in Functions.

## Open questions for the lead

1. Do you accept proposed D-006 (Supabase Auth replaces the password gate; Supabase holds identity only)?
2. Should the page be called `/agents/` (as in the deploy-config skill) or `/console/` (as in docs 03 and 04)? I used `/agents/`.
3. Should the build fail on test failure (my recommendation, so a broken Approve never goes live)? It adds a little build time against Free-plan credits.
