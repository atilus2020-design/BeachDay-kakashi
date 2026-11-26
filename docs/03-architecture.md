# 3. Architecture: static Netlify site plus Netlify Functions

## 3.1 Overview

```
 Phone / browser (PWA)                      Netlify                                    External (managed services)
 ─────────────────────                      ───────                                    ───────────────────────────
 index.html, app JS, sw.js  ── HTTPS ──▶  CDN: static assets (dist/)
 /login/, /agents/ (static shells)  ────▶  CDN (no secrets; /agents/* no-store, noindex)
 src/lib/auth.ts (supabase-js, publishable key) ─────────────────────────────────▶  Supabase Auth (email+password, reset,
                                                                                     Google OAuth) + Postgres `profiles` (RLS)
 /api/forecast?beach=id  (public) ──────▶  fn forecast  ── cached ──▶  api.open-meteo.com, marine-api.open-meteo.com

 Authorization: Bearer <Supabase access token> on every call below
 /api/agents                ───────────▶  fn agents       ┐  _lib/auth.requireRole("super_admin"), every request:
 /api/agent/chat (stream)   ───────────▶  fn agent-chat   │   GET /auth/v1/user  ─────────────────▶  Supabase Auth
 /api/proposals[/:id]       ───────────▶  fn proposals    │   GET /rest/v1/profiles (user token) ─▶  Supabase Postgres
 /api/proposals/:id/reject  ───────────▶  fn proposals    │   role !== super_admin → 403
 /api/proposals/:id/approve ───────────▶  fn approve      ┘
                                          agent-chat ──────────────────────▶  api.anthropic.com
                                          proposals, budget, audit ──▶ Netlify Blobs
                                          approve ─────────────────────────▶  api.github.com (one commit to main)
                                                                                     │
                                          Netlify auto-deploy ◀──────────────────────┘  (Git push → build → deploy)
```

**Principles:**

- **Static first.** The public forecast UI is plain static files on the CDN. One function (`forecast`) adds caching and shapes the data. It is public and never touches Supabase.
- **Secrets live only in Functions.** `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` are Netlify environment variables scoped to **Functions**. Neither is exposed to the client bundle.
- **Supabase Auth for identity, `profiles` for roles (D-006, D-007).** The browser signs in directly with Supabase using the project URL and the **publishable** key, which is public by design. **No Supabase secret key is used anywhere (D-008).** Every protected Function verifies the access token and reads the role from `profiles` with the user's own token on every request. Only `super_admin` passes.
- **No database server of our own (D-001).** Supabase is a managed service that holds identity and roles only. Netlify Blobs holds proposals, budget counters, locks and the audit log.
- **Git is the deploy pipeline.** Approved agent changes become commits, and Netlify's continuous deployment builds them ("Connect a Git repository for automatic continuous deployment on every push": https://docs.netlify.com/deploy/create-deploys/).

Contracts (endpoints, JSON shapes, auth rules) and the build waves are in [build-plan.md](build-plan.md).

## 3.2 Repository layout

The full tree, with an owner for each path, is in [build-plan.md §5](build-plan.md#5-final-file-tree). In short:

```
/
├─ index.html, agents/, login/, how-it-works/, resources/, guide/   # Vite multi-page entries (each dir has index.html)
├─ netlify.toml, package.json, vite.config.ts, tsconfig.json, .env.example, README.md
├─ public/                      # copied as-is: manifest.webmanifest, icons/, offline.html, offline.css, robots.txt,
│                               # sw.js (placeholders filled by scripts/inject-sw.mjs after vite build)
├─ src/
│  ├─ pages/                    # one module per screen: home, agents, login, content
│  ├─ lib/                      # api.ts, sse.ts, dom.ts, shell.ts; auth.ts (supabase-js client + helpers)
│  ├─ pwa/                      # SW registration, install prompt
│  ├─ scoring/                  # pure scoring (doc 1)
│  ├─ shared/contracts.ts       # request/response types shared with Functions (types only)
│  ├─ data/beaches.json
│  └─ styles/                   # Liquid Glass tokens and materials
├─ netlify/functions/
│  ├─ forecast.mts              # public
│  ├─ agents.mts, agent-chat.mts (streaming), proposals.mts, approve.mts   # super_admin only
│  ├─ _lib/                     # auth.ts (Supabase token + role, CSRF), allowlist.ts, claude.ts, github.ts,
│  │                            # diff.ts, agents.ts, blobs.ts, budget.ts, audit.ts
│  └─ _generated/agents-private.json   # build output, git-ignored
├─ supabase/migrations/         # profiles table, RLS policy, new-user trigger (D-007)
├─ scripts/                     # build-agents.mjs, inject-sw.mjs, check-secrets.mjs
├─ tests/                       # unit, function, e2e, fixtures, mocks/upstreams.mjs
├─ .claude/agents/*.md          # the agent team (source of truth)
└─ docs/
```

Removed from the first draft: `auth.mts` and `_lib/session.ts` (D-006 replaced the password gate), `agent-job.mts` / `job-status.mts` (background jobs deferred, see build-plan §1), and `src/sw.ts` (the service worker is plain `public/sw.js`, build-plan §9.7).

## 3.3 Netlify Functions: platform facts

| Topic | Fact | Source |
|---|---|---|
| Modern syntax | `export default async (req: Request, context: Context) => new Response(...)`, plus `export const config: Config = { path: "/api/…" }` | https://docs.netlify.com/build/functions/api/ |
| Package | `npm install @netlify/functions` (types: `Config`, `Context`) | same |
| Context | `context.ip`, `context.geo`, `context.cookies.get/set/delete`, `context.requestId`, `context.site`, `context.deploy`, `context.waitUntil()` | same |
| Config | `path`, `method`, `preferStatic`, `rateLimit`, `background`, `memory` | same; https://docs.netlify.com/build/functions/configuration/ |
| **Synchronous limit** | **60 seconds, not configurable** | https://docs.netlify.com/build/functions/configuration/ |
| **Streaming** | Return a `ReadableStream` body. **60-second** execution limit, **20 MB** response | https://docs.netlify.com/build/functions/api/ |
| **Background** | `config.background = true` (or a `-background` filename suffix). Client gets an empty **202** at once. Runs up to **15 minutes**. **Retries on error after 1 minute, then again 2 minutes later.** No streaming. Available on credit-based Free, Personal and Pro plans, and on Enterprise | https://docs.netlify.com/build/functions/background-functions/ |
| Scheduled | 30-second limit | https://docs.netlify.com/build/functions/scheduled-functions/ |
| Memory | Default 1024 MB | https://docs.netlify.com/build/functions/usage-and-billing/ |
| Rate limiting | `config.rateLimit = { windowLimit, windowSize (s, max 180), aggregateBy: ["ip","domain"], action: "rate_limit" \| "rewrite", to }`. Function rate limits **cannot** be set in `netlify.toml` | https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/ |

### Environment variables

Source: https://docs.netlify.com/build/environment-variables/overview/

- Set them in the Netlify UI, the CLI or the API, with the **Functions** scope. The docs describe this scope as the place "to securely provide sensitive values for your functions to use while they run – values such as API keys and tokens".
- **Variables set in `netlify.toml` are not available to Functions**, only to builds. They also live in the repository, so **never put secrets in `netlify.toml`**.
- Mark secrets as **"Contains secret values"** (Secrets Controller) for extra access restrictions.
- Deploy contexts are Production, Deploy Previews, Branch deploys, Preview server and Local development. Give Deploy Previews **no `GITHUB_TOKEN`**, or a no-op value, so preview builds can never commit.
- Function values must fit within AWS Lambda's environment size limits, so keep them short.

**Beach Day's variables** (also in build-plan §3.7):

| Name | Scope / context | Secret? | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Functions; all contexts (low-limit key for previews/dev) | **Yes** | Claude API |
| `GITHUB_TOKEN` | Functions; **Production only** | **Yes** | Fine-grained token for this repository (D-005) |
| `GITHUB_REPO` | Functions | No | `owner/name`, hard-coded target |
| `SUPABASE_URL` | Functions | No | `https://<ref>.supabase.co`, for token and role checks |
| `SUPABASE_PUBLISHABLE_KEY` | Functions | No (public by design) | `sb_publishable_…`, sent as `apikey` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Builds | No | Bundled into `login/` and `agents/` for supabase-js |
| `DAILY_CHAT_LIMIT`, `DAILY_TOKEN_LIMIT` | Functions | No | Optional budget knobs, per user and global. Defaults when unset: 100 turns, 1,000,000 tokens per day (`_lib/budget.ts`) |
| `OPEN_METEO_BASE`, `OPEN_METEO_MARINE_BASE`, `ANTHROPIC_BASE_URL`, `GITHUB_API_URL` | Local/test only; unset in production | No | Point upstreams at the local mock server (build-plan §7, §9.4) |

**Never set:** a Supabase secret key (`sb_secret_…`), the `service_role` key or the Supabase JWT secret (D-008). `CONSOLE_PASSWORD_HASH` and `SESSION_SECRET` are no longer used (D-006).

### Netlify Blobs

Source: https://docs.netlify.com/build/data-and-storage/netlify-blobs/

- Install with `npm i @netlify/blobs`. Open a store with `getStore({ name, consistency })`, then use `set` / `setJSON` / `get(key, { type: "json" })` / `delete` / `list({ prefix })` and `getWithMetadata`.
- **Consistency:** eventual by default ("propagated to all edge locations within 60 seconds"). Use `consistency: "strong"` for job status, proposal status and rate counters, which are read right after a write.
- **Conditional writes:** `onlyIfNew` and `onlyIfMatch` (ETag) give compare-and-swap. Use them for idempotent job starts and the pending → approved status change.
- Stores created with `getStore` are **site-wide, shared across deploys**. That is what we want for proposals and jobs.
- Inside Functions, `siteID` and `token` are injected automatically. Keys are at most 600 bytes and can't start with `/`. Objects can be up to 5 GB, with metadata up to 2 KB.
- `netlify dev` uses a sandboxed local store (production data is not readable locally).

**Stores** (all opened strong through `_lib/blobs.ts` `store(name)`; exact keys in build-plan §6): `proposals` (`proposal/<id>`), `budget` (`chat/<yyyy-mm-dd>/global`, `chat/<yyyy-mm-dd>/user/<userId>`), `locks` (`approve`) and `audit` (`audit/<yyyy-mm-dd>/<ts>-<requestId>-<rand>`, including the Supabase user id). There is no `auth` store: Supabase rate-limits logins (D-006). A `jobs` store returns only if background jobs are added later.

## 3.4 The forecast function

The sketch below was the starting point. The built Function (`netlify/functions/forecast.mts`) differs in the ways listed after it.

```ts
// netlify/functions/forecast.mts (original sketch)
import type { Config, Context } from "@netlify/functions";
import beaches from "../../src/data/beaches.json" with { type: "json" };

export default async (req: Request, _ctx: Context) => {
  const id = new URL(req.url).searchParams.get("beach");
  const beach = beaches.find((b) => b.id === id);
  if (!beach) return Response.json({ error: "unknown beach" }, { status: 404 });

  const [forecast, marine] = await Promise.all([
    fetch(forecastUrl(beach)).then(ok),   // URLs as in doc 1 §1.2
    fetch(marineUrl(beach)).then(ok),
  ]);
  return Response.json(
    { beach, forecast, marine, fetchedAt: new Date().toISOString() },
    // Let the CDN share one response per beach for ~30 min; browsers revalidate sooner.
    // Verify the exact cache-header names in Netlify's caching docs during implementation.
    { headers: { "Cache-Control": "public, max-age=300", "Netlify-CDN-Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" } },
  );
};

export const config: Config = {
  path: "/api/forecast",
  method: "GET",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
```

Why use a proxy instead of calling Open-Meteo from the browser?

1. The CDN cache makes the number of Open-Meteo calls depend on the number of beaches, not the number of users (doc 1 §1.5).
2. There is one place to add a paid key later.
3. The beach list is validated on the server.
4. Scoring can run on the client (it is pure and the same code), or on the server if we later want pre-computed scores.

**Recommendation:** score on the client, so the service worker can re-score cached data offline.

**Error handling:** if one of the two APIs fails, return the other with `partial: true`. The UI then shows the score with a "wave data unavailable" note instead of failing completely.

**As built:**

- Base URLs come from `OPEN_METEO_BASE` and `OPEN_METEO_MARINE_BASE` (build-plan §9.4); each upstream call has an 8 s timeout, and upstream bodies are never echoed.
- 400 when `beach` is missing, 404 for an unknown beach, 405 for non-GET, **502 only when both upstreams fail**. Errors are `Cache-Control: no-store`.
- Full answers: `Cache-Control: public, max-age=300` and `Netlify-CDN-Cache-Control: public, s-maxage=1800, stale-while-revalidate=600`. **Partial answers are CDN-cached for 60 s only** (`s-maxage=60`), so a short outage does not stick for 30 minutes.
- The Function sets its own `X-Content-Type-Options: nosniff`, because Netlify headers don't apply to Function responses.
- Each beach in `src/data/beaches.json` carries an `nwsUrl` (its NWS Surf Zone Forecast page). The home page's rip-current link uses it (D-002).

## 3.5 `netlify.toml` (as built, abridged)

```toml
[build]
  command = "npm run build"        # build:agents → vite build → scripts/inject-sw.mjs → scripts/check-secrets.mjs
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
  included_files = ["netlify/functions/_generated/*.json"]

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    X-Frame-Options = "DENY"
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; worker-src 'self'"

[[headers]]
  for = "/agents/*"
  [headers.values]
    Cache-Control = "no-store"
    X-Robots-Tag = "noindex"

[[headers]]
  for = "/login/*"
  [headers.values]
    Cache-Control = "no-store"
    X-Robots-Tag = "noindex"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"
```

`netlify.toml` itself is the source of truth; this copy only shows the shape. `geolocation=()` is off because the app never asks for location.

Open-Meteo, Claude and GitHub are reached only through our Functions. The browser talks to one other origin, the Supabase project, so `connect-src` is `'self'` plus that exact origin. Google sign-in is a top-level redirect to Supabase and Google, so it needs no `connect-src` entry. **Decided:** `netlify.toml` ships `https://*.supabase.co`, and `scripts/check-secrets.mjs` appends a `dist/_headers` override that pins `connect-src` to the exact `VITE_SUPABASE_URL` origin at build time (security.md B4). `object-src 'none'` blocks plugin content. Netlify headers don't apply to Function responses, so Functions set their own `Cache-Control: no-store`.

## 3.6 Build-time agent manifest

`scripts/build-agents.mjs` reads `.claude/agents/*.md`, parses the YAML frontmatter (`name`, `description`, `model`, `tools`, …) and the Markdown body (the system prompt and personality), and writes two files, both bundled into the Functions only:

- `netlify/functions/_generated/agents.json` holds the summary fields only: `name`, `description`, `model`, `personality` (a short summary or the first paragraph) and `color`/`emoji` if present. `GET /api/agents` serves it to `super_admin` only. It is **not** published as a static file in `dist/` (D-007).
- `netlify/functions/_generated/agents-private.json` holds, per agent, `{ model, system }`: the **full system prompt** (agent body + its skills + its knowledge text, capped at about 120,000 characters, build-plan §9.3). It is bundled into the functions only (direct JSON import plus `included_files`), so the server, not the browser, decides which prompt and model an agent runs with. Models are checked against an allow-list at build time and again at runtime.
- `knowledge/**` is compiled into these prompts, so it is on the proposal deny-list (`_lib/allowlist.ts`). Only a human edits it.

Agent file changes go through Git like everything else, so the list updates on every deploy.

## 3.7 Local development

- `npm i -g netlify-cli`, then `netlify dev` runs the static site, the functions and local Blobs together.
- Put local secrets in `.env` (git-ignored) or `netlify env:set` with the Local development context.
- Use separate low-limit keys for development: a Claude workspace with a small spend limit, and a GitHub token for a **fork or sandbox repository**.
- **Tests need no real secrets.** `tests/mocks/upstreams.mjs` imitates Open-Meteo, Anthropic, GitHub and Supabase. The Functions are pointed at it with `OPEN_METEO_BASE`, `OPEN_METEO_MARINE_BASE`, `ANTHROPIC_BASE_URL`, `GITHUB_API_URL` and `SUPABASE_URL`. Playwright fulfils the browser's supabase-js calls with `page.route` (build-plan §7). `_lib/auth.ts` accepts a non-https `SUPABASE_URL` only for a loopback host, and only in the `dev` context or under vitest (`NODE_ENV=test`, build-plan §9.5).

## 3.8 Decisions to confirm

- Framework: vanilla TS plus Vite is suggested (small bundle, simple service worker). Preact or Svelte are fine if the UI grows.
- **Decided (D-003):** Approve commits straight to `main`; there is no pull-request mode.
- **Decided (D-004):** Netlify Free plan. Background functions are available on credit-based Free plans.
- **Decided (D-006, D-007, D-008):** Supabase Auth (email + password, Google). Roles come from `profiles` with RLS, and only `super_admin` reaches the Agents APIs. Only the URL and the publishable key are used, and the token and role are verified in every protected Function.
