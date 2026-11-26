# Build plan

Owner: software-architect (Ines) · Reviewer: orchestrator · Date: 2026-11-26 · Updated: 2026-11-26 (Wave 3 drift check)

**Status:** Wave 0 ✅ done · Wave 1 ✅ done · Wave 2 ✅ done · Wave 3 🔄 in progress (QA run, security review, README, this drift check; fix wave follows) · Wave 4 ⏳ not started. §3, §5 and §6 now describe the code **as built**; deliberate differences from the first contract are listed in §10.

This plan covers how the expert team builds the whole app, in waves. Each expert runs in parallel with the others in its wave. A task waits only for a **true dependency**, marked **⛓ needs**. Everything else starts as soon as its wave starts. The contracts in §3 are fixed **before** Wave 1, so the front end, the Functions and the tests can be written at the same time.

Security rules come from [`docs/security.md`](security.md), which is authoritative. If this plan and security.md disagree, security.md wins, and this plan gets fixed.

Constraints: D-001 (static front end + Netlify Functions + Blobs, no servers of our own), D-002 (no rip proxy), D-003 (Approve → `main`), D-004 (Netlify Free), D-005 (fine-grained token), D-006 (Supabase Auth), D-007 (`profiles` + RLS, `super_admin` only), D-008 (URL + publishable key only, token and role checked in every Function).

## 1. What we are building

| Area | Pages / endpoints | Summary |
|---|---|---|
| Beach Day | `/` | Pick a South Florida beach. See today's score, best window, reasons, the week ahead and the NWS rip-current link (D-002). Works offline from the last forecast |
| PWA | manifest, `public/sw.js` (+ `scripts/inject-sw.mjs`), `offline.html` | Installable on iPhone and Android, with the offline shell and the "New version, reload" prompt (doc 02) |
| Login | `/login/`, `/login/reset/` | Supabase email + password (sign up, log in, log out, forgot password) and Continue with Google (D-006). `/login/reset/` sets a new password after the recovery link (security.md R13, R15) |
| Agents page | `/agents/` | `super_admin` only (D-007): agent grid, chat (SSE), proposals list, proposal diff, Approve and deploy, Reject |
| How it works | `/how-it-works/` | How the score works, what the app does **not** do, how agents propose and humans approve |
| Resources | `/resources/` | Every external link: Open-Meteo docs + terms, Netlify, Claude API, GitHub REST, Supabase, MDN PWA, Apple HIG, WCAG, NWS rip pages, the repo, https://mcp-api.netlify.app/ and `/guide/` |
| Guide | `/guide/` | A step-by-step guide to set up and deploy your own copy |
| Config | `netlify.toml`, `README.md` | Build, headers/CSP, Functions; the README covers setup, environment variables, Supabase + Google setup, tests and secret rotation |

**Not in v1:** background jobs (`/api/jobs`, doc 04 §4.7). Chat with tool calls and `propose_change` fits in one streamed turn under 60 s. Jobs can be added later under a new decision record (see D-008 consequences).

## 2. System diagram

```
 Browser (PWA)                                Netlify                                         External (managed)
 ─────────────                                ───────                                         ──────────────────
 /, /how-it-works/, /resources/, /guide/  ─▶  CDN static (dist/)
 /login/, /login/reset/, /agents/ (shells)─▶  CDN static, /agents/* no-store + noindex
 src/lib/auth.ts (supabase-js) ───────────────── HTTPS (publishable key) ──────────────────▶  Supabase Auth  (sign up / in / out,
                                                                                                reset, Google OAuth → accounts.google.com)
 src/lib/auth.ts → profiles (own row, RLS) ──────────────────────────────────────────────▶  Supabase Postgres (profiles)

 GET  /api/forecast?beach=id   (public)   ─▶  fn forecast ──── CDN-cached ──────────────▶  api.open-meteo.com, marine-api.open-meteo.com
 Bearer <access token> on every call below:
 GET  /api/agents                         ─▶  fn agents      ┐
 POST /api/agent/chat (SSE)               ─▶  fn agent-chat  │  _lib/auth.requireRole("super_admin")
 GET  /api/proposals[/:id]                ─▶  fn proposals   │    1. GET {SUPABASE_URL}/auth/v1/user          ─▶ Supabase Auth
 POST /api/proposals/:id/reject           ─▶  fn proposals   │    2. GET {SUPABASE_URL}/rest/v1/profiles (RLS) ─▶ Supabase Postgres
 POST /api/proposals/:id/approve          ─▶  fn approve     ┘    3. role === "super_admin" else 403
                                                agent-chat ─────────────────────────────▶  api.anthropic.com
                                                proposals, budgets, audit ─▶ Netlify Blobs
                                                approve ────────────────────────────────▶  api.github.com (one commit to main)
                                                                                                   │
                                              Netlify Git deploy ◀──────────────────────────────────┘
```

## 3. Contracts

### 3.1 Common rules for every protected endpoint

These follow `docs/security.md` §3 (R1, R2, R10, R16) and §5 (guard contract).

| Item | Rule |
|---|---|
| Auth | `Authorization: Bearer <Supabase access token>`. `const g = await requireRole(req, ctx, "super_admin"); if (!g.ok) return g.response;` is the **first line** of every protected handler, on every request, before parsing the body or touching Blobs, Claude or GitHub (D-008) |
| CSRF (non-GET) | Checked **inside** the guard: `Origin` must equal `new URL(req.url).origin`; `Sec-Fetch-Site`, if present, must be `same-origin`; `X-Requested-With: beachday` is required. Any failure → 403 |
| Content type | Requests `application/json`; responses `application/json` (or `text/event-stream` for chat); always `Cache-Control: no-store` |
| Body | A fixed schema per endpoint. A `role`, `userId` or `isAdmin` field is never trusted (R5) |
| Error body | `{ "error": "<generic message>" }`. Never upstream bodies, stack traces, tokens or headers |
| Status codes and messages | 400 "Invalid request" · 401 "Sign in required" (missing, malformed, invalid, expired or signed-out token) · 403 "Forbidden" (CSRF) or "Not allowed" (role) · 404 · 405 "Method not allowed" (with `Allow`) · 409 conflict · 413 "Request too large" · 429 "Too many requests" · 502 "GitHub is unavailable, try again later" (approve only, nothing committed) · 503 "Sign-in service unavailable" (Supabase down; fail closed) or "Approve is disabled on this deploy" · 500 "Something went wrong" |
| Guard order (as built) | method (405) → Origin / Sec-Fetch-Site / `X-Requested-With` on non-GET (403) → Bearer format (401) → Supabase config (503) → `auth.getUser` (401/503) → own `profiles` row (403/503) → role (403). So a POST with a foreign Origin and no token gets 403, not 401 |
| Client behaviour | On 401: call `supabase.auth.refreshSession()` once and retry; if it is still 401, go to `/login/?next=<path>`. On 403: show "You don't have access". On 503: show "Sign-in service unavailable, try again later" |

### 3.2 Endpoints

| Method + path | Function | Auth | Request | Response 200 | Errors | Rate limit (per IP) |
|---|---|---|---|---|---|---|
| `GET /api/forecast?beach=<id>` | `forecast.mts` | **Public** | `beach` = an `id` from `src/data/beaches.json` | `ForecastResponse`. Full: `Cache-Control: public, max-age=300` + `Netlify-CDN-Cache-Control: public, s-maxage=1800, stale-while-revalidate=600`. `partial: true`: CDN `s-maxage=60` only. Errors: `no-store` | 400 missing, 404 unknown beach, 405, 502 both upstreams failed | 60 / 60 s |
| `GET /api/agents` | `agents.mts` | super_admin | — | `{ "agents": AgentSummary[] }` | 401, 403, 503 | 60 / 60 s |
| `POST /api/agent/chat` | `agent-chat.mts` (streaming) | super_admin + CSRF | `ChatRequest` (≤ 30 messages, ≤ 100 KB; first and last message `user`; no extra keys) | `text/event-stream`, see §3.4 | 400, 401, 403, 404 unknown agent, 413, 429 budget, 500 budget store error, 503 | 10 / 60 s |
| `GET /api/proposals?status=pending\|approved\|rejected\|all` | `proposals.mts` | super_admin | default `pending` | `{ "proposals": ProposalSummary[] }` (newest first, ≤ 50) | 400, 401, 403, 503 | 60 / 60 s |
| `GET /api/proposals/:id` | `proposals.mts` | super_admin | — | `Proposal` | 401, 403, 404, 503 | 60 / 60 s |
| `POST /api/proposals/:id/approve` | `approve.mts` | super_admin + CSRF + title confirm | `{ "confirmTitle": "<exact proposal title>" }` (≤ 4 KB) | `{ "status": "approved", "commit": { "sha": "…", "url": "…" }, "deploy": "started" }` | 400 invalid body or title mismatch, 401, 403, 404, 409 stale / already decided / another approval in progress, 413, 422 path re-check failed, **502 GitHub failed (nothing committed, claim undone)**, 503 approve disabled (no `GITHUB_TOKEN` or `GITHUB_REPO`, e.g. Deploy Previews), 500 | 5 / 60 s |
| `POST /api/proposals/:id/reject` | `proposals.mts` | super_admin + CSRF | `{ "reason"?: string ≤ 500 }` (≤ 4 KB; empty body allowed) | `{ "status": "rejected" }` | 400 invalid body or reason, 401, 403, 404, 405, 409 already decided or approval in progress, 413, 500 | **60 / 60 s, shared with the GETs** (see below) |

`proposals.mts` uses `config.path: ["/api/proposals", "/api/proposals/:id", "/api/proposals/:id/reject"]` and `method: ["GET", "POST"]`; it returns 405 for POST on a GET path and GET on `/reject`. Netlify allows **one `rateLimit` per Function**, so Reject shares the 60 / 60 s limit of the proposal GETs (accepted: Reject needs CSRF + `super_admin` and changes nothing outside Blobs). `approve.mts` is separate so it can have its own, stricter rate limit and its own review.

Netlify's own rate-limit 429 is not our JSON body; clients must not depend on the `error` text of a 429.

There are no `/api/auth/*` endpoints (D-006). Sign-in talks straight to Supabase from the browser. The front end reads its own role with `supabase.from("profiles").select("role").single()`, which RLS limits to the person's own row. That read only decides what the UI shows. The Functions enforce access.

### 3.3 JSON shapes (TypeScript, to live in `src/shared/contracts.ts`)

```ts
export type Role = "user" | "super_admin";

export interface Beach { id: string; name: string; city: string; county: string; lat: number; lon: number; nwsOffice: string; nwsUrl: string; coast?: "atlantic" | "gulf" }
// nwsUrl: the beach's NWS Surf Zone Forecast page; the home page's rip-current link uses it (D-002)
export interface ForecastResponse {
  beach: Beach;
  forecast: unknown | null;        // Open-Meteo Forecast JSON as returned (doc 01 §1.2)
  marine: unknown | null;          // Open-Meteo Marine JSON as returned; null if it failed
  partial: boolean;                // true when one of the two is null
  fetchedAt: string;               // ISO 8601
}
// Scoring runs in the browser: scoreWeek({ forecast, marine }) → DayScore[] (doc 01 §1.3)

export interface AgentSummary {
  name: string;                    // "open-meteo-integrator"
  displayName: string;             // "Kai"
  description: string;
  model: string;                   // "claude-sonnet-5-5" (resolved API model ID)
  modelAlias: "opus" | "sonnet" | "haiku" | "custom";
  personality: string;             // short excerpt, plain text
  color?: string;
  knowledge: { path: string; title: string }[];   // files under knowledge/<agent>/docs and examples (§9.3)
}

export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatRequest { agent: string; messages: ChatMessage[] }

export type ProposalStatus = "pending" | "approved" | "rejected";
export interface Actor { id: string; email: string | null }   // Supabase user id + email
export interface ProposalSummary {
  id: string; agent: string; title: string; status: ProposalStatus;
  fileCount: number; createdAt: string; createdBy: Actor;
}
export interface Proposal extends ProposalSummary {
  summary: string;
  baseSha: string;
  files: { path: string; action: "create" | "update" | "delete" }[];
  diff: string;                    // unified diff, rendered with textContent only
  decidedAt?: string; decidedBy?: Actor; rejectReason?: string;
  commit?: { sha: string; url: string };
}
export interface ApiError { error: string }
```

The file also exports helper names for the bodies above (`AgentsResponse`, `ProposalsResponse`, `ProposalStatusFilter`, `ProposalFile`, `ProposalFileAction`, `AgentKnowledgeFile`, `ApproveRequest`/`ApproveResponse`, `RejectRequest`/`RejectResponse`, `CommitRef`) and the §3.4 stream types (`ChatEventMap`, `ChatEventName`, `ChatEvent`). It holds types only; `DayScore` lives in `src/scoring`.

Server-only fields of the stored proposal (`files[].content`, `fileShas`, the transient `approving` claim) are never returned by `GET /api/proposals/:id`.

### 3.4 Chat stream (`POST /api/agent/chat`)

Validation errors (400/401/403/404/413/429/503) come back as normal JSON before the stream starts. After a 200, events arrive in this order:

```
event: text      data: "<text chunk>"                         (0..n)
event: tool      data: {"name":"read_file","path":"src/…"}     (0..n, shown as a collapsible row)
event: proposal  data: {"id":"p_…","title":"…"}                (0..1, links to /agents/#proposal/<id>)
event: done      data: {"stop_reason":"end_turn"}              (exactly one of done | error, last)
event: error     data: {"message":"Agent unavailable, please retry.","retryAfter"?:<s>}
```

As built: `stop_reason` is the model's (`end_turn`, `max_tokens`, `refusal`, …) or one of ours: `time_limit` (under 5 s left), `tool_limit` (more than 4 tool rounds). `error` carries an optional `retryAfter` (seconds) when Claude rate-limits; messages are fixed strings (timeout, busy, unavailable). The `tool` event for `propose_change` has no `path`.

The turn must end in under 60 s: a 50 s internal deadline, `max_tokens` 8000 per round, `effort: "low"`, at most 4 tool rounds, one proposal per reply. The transcript stays in the browser's `sessionStorage` (doc 04 §4.3).

### 3.5 Module contracts (the seams between experts)

| Module | Owner | Exports |
|---|---|---|
| `netlify/functions/_lib/auth.ts` | supabase-auth-engineer | `requireRole(req, ctx, role: "super_admin", opts?: { methods?: readonly string[] }): Promise<{ ok: true; user: { id: string; email: string \| null }; supabase: SupabaseClient } \| { ok: false; response: Response }>`. It runs the steps in security.md §5 in order: method → Origin/Sec-Fetch-Site → X-Requested-With (non-GET) → Bearer format → `auth.getUser(jwt)` → own `profiles` row → role. It uses a per-request client and one 5 s deadline for both Supabase calls, and fails closed with 503. The optional 4th argument sets the allowed methods (default GET + POST; 405 with `Allow` otherwise); every Function passes its own list |
| `src/lib/auth.ts` | supabase-auth-engineer | `supabase` (client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`, `flowType: "pkce"`) · `signUp(email, pw)` (`emailRedirectTo` = `<site>/login/`) · `signIn(email, pw)` · `signInWithGoogle(next?)` (`redirectTo` = `<site>/login/`) · `signOut()` · `sendPasswordReset(email)` (`redirectTo` = `<site>/login/reset/`) · `updatePassword(pw)` · `getAccessToken(): Promise<string \| null>` · `getRole(): Promise<Role \| null>` · `onAuthChange(cb)` · `requireSuperAdmin(next): Promise<"ok" \| "forbidden">` (redirects to `/login/?next=` when signed out). As built it also exports `isAuthConfigured()`, `safeNext(raw)`, `takeNext()`, `AuthFlowError`/`AuthErrorCode`, and `signUp` takes an optional `next` |
| `src/lib/api.ts` | frontend-engineer | `configureApi({ getToken, onUnauthorized? })` (the Agents page injects `getAccessToken`, so `api.ts` never imports supabase-js), `apiGet<T>(path)`, `apiPost<T>(path, body)`, `publicGet<T>(path)` (no token), `apiStream(path, body)` (returns the raw `Response` for SSE), `isApiFailure(e)`: add the bearer token and, on POST, the `X-Requested-With: beachday` header, time out after 15 s, retry once on 401 after a refresh, and throw `{ status, error }` |
| `src/lib/sse.ts` | frontend-engineer | `readSse(res, onEvent: (event, data) => void): Promise<void>` |
| `src/scoring/score.ts` | open-meteo-integrator | `scoreWeek(input): DayScore[]` (doc 01 §1.3), with no I/O |
| `netlify/functions/_lib/allowlist.ts` | security-engineer | `assertWritablePath(p): string`, `assertProposalLimits(files)`, `isReadablePath(p): boolean`, `LIMITS`, `AllowlistError`. **This file is the source of truth for which paths agents may read and change**; docs summarise it. As built the deny list also covers `knowledge/**`, `agents/**`, `src/pages/agents.*`, `src/pages/login*`, `src/lib/api.*`, `public/sw.js`, `public/_headers`, `public/_redirects`, package files and `vite.config.*` |
| `netlify/functions/_lib/{claude,github,diff,agents,blobs,budget,audit}.ts` | agent-console-engineer | Claude client wrapper (`setClaudeClient` for tests, `runChatTurn`, `createProposal`), Git Data API commit (`commitToMain`, `StaleError`, `hasWriteToken`), diff builder, agent registry (`listAgents`, `getAgent`), Blobs helpers (`store(name)`, §9.6), daily budget (`checkAndReserveTurn`, `recordTokens`), audit append (`audit`, `auditDenied`) |

**`next` parameter:** `/login/?next=/agents/` accepts only same-origin paths that start with `/` and not `//`. Anything else goes to `/`.

**Page bundles:** only `login/`, `login/reset/` and `agents/` import `src/lib/auth.ts` (supabase-js). The home page keeps its < 150 KB JS budget and shows a plain "Sign in" link.

### 3.6 Supabase schema (contract; the migration is written by supabase-auth-engineer)

`supabase/migrations/20261126000000_profiles.sql` must produce:

- `public.profiles(id uuid pk → auth.users(id) on delete cascade, email text, role text not null default 'user' check (role in ('user','super_admin')), created_at timestamptz not null default now())`.
- `alter table public.profiles enable row level security;` with **one** policy: `for select to authenticated using ((select auth.uid()) = id)`.
- `revoke all on table public.profiles from anon, authenticated;` then `grant select on table public.profiles to authenticated;`, with no write policies (security.md R4).
- Function `public.handle_new_user()` (`security definer`, `set search_path = ''`) and trigger `on_auth_user_created after insert on auth.users`, which inserts `(id, email)` only. It never copies anything from `raw_user_meta_data`.
- A comment block at the end with the manual promotion SQL: `update public.profiles set role = 'super_admin' where email = '<owner email>';`.

### 3.7 Environment variables

| Name | Where (Netlify UI → Site configuration → Environment variables) | Secret? | Example format |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Functions; all contexts (low-limit key for previews/dev) | **Yes** | `sk-ant-…` |
| `GITHUB_TOKEN` | Functions; **Production only** | **Yes** | `github_pat_…` |
| `GITHUB_REPO` | Functions | No | `owner/name` |
| `SUPABASE_URL` | Functions | No | `https://<ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Functions | No (public by design) | `sb_publishable_…` |
| `VITE_SUPABASE_URL` | Builds | No | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Builds | No | `sb_publishable_…` |
| `DAILY_CHAT_LIMIT`, `DAILY_TOKEN_LIMIT` | Functions | No | Optional. Each limit applies per user **and** globally (security.md R11). **Defaults when unset (`_lib/budget.ts`): 100 turns and 1,000,000 tokens per day** |
| `OPEN_METEO_BASE`, `OPEN_METEO_MARINE_BASE`, `ANTHROPIC_BASE_URL`, `GITHUB_API_URL` | **Local/test only**; unset in production | No | `http://127.0.0.1:9100/open-meteo`, `…/marine` |

`JOB_SIGNING_SECRET` and `DAILY_JOB_LIMIT` (security.md §4) are needed only once background jobs are built. They are not set in v1.

**Never present anywhere:** a Supabase secret key (`sb_secret_…`), the `service_role` key, the Supabase JWT secret, `CONSOLE_PASSWORD_HASH` or `SESSION_SECRET` (D-006, D-008). `scripts/check-secrets.mjs` fails the build if `dist/` contains `sk-ant-`, `github_pat_`, `sb_secret_`, `service_role`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` or `JOB_SIGNING_SECRET`, or if the build environment defines a Supabase secret or service-role key, or any `VITE_*` variable other than the two above (security.md R7). It also appends a `dist/_headers` CSP override that pins `connect-src` to the exact `VITE_SUPABASE_URL` origin (security.md B4).

## 4. Waves

Legend: **∥** = runs in parallel with every other task in the wave. **⛓ needs** = a true dependency (waits for that output). Reviews in each wave also run in parallel.

### Wave 0 — plan and team ✅ done

| Expert | Task | Output |
|---|---|---|
| software-architect ∥ | This plan, D-006…D-008, doc 03 update | `docs/build-plan.md`, `docs/decisions.md`, `docs/03-architecture.md`, `docs/README.md` |
| security-engineer ∥ | Threat model for Supabase Auth and roles; update doc 04 §4.5 | `docs/security.md`, `docs/04-agent-console.md` |
| agent-builder ∥ | Add `supabase-auth-engineer` (agent, skill, knowledge); update roster and ownership map | `.claude/agents/supabase-auth-engineer.md`, `.claude/skills/supabase-auth/…`, `knowledge/supabase-auth-engineer/…`, `docs/expert-roster.md`, `docs/agent-brains.md` |
| **Human (lead), any time before Wave 4** | Create the Supabase project, the Google OAuth client and the Netlify site (not needed to build or test, because tests use mocks) | — |

Reviews: orchestrator reviews the plan; security-engineer reviews D-006…D-008; software-architect reviews `docs/security.md` for consistency with the contracts.

### Wave 1 — foundations (all ∥, inputs = Wave 0 packets) ✅ done

| Expert | Task | Inputs (handoff packets) | Outputs | Peer reviewer(s) |
|---|---|---|---|---|
| ux-designer-apple-hig | Flows, states and copy for every screen: home (picker, today, week, day detail, stale banner, install prompt), login (sign up, log in, Google, forgot, set new password, errors), Agents (no access, grid, chat, proposals, diff, approve confirm, reject), How it works, Resources | This plan §1, §3.1 client behaviour; doc 01, 02, 05 | `docs/ux/flows.md`, `docs/ux/copy.md` | ui-designer |
| ui-designer-apple-liquid-glass | Liquid Glass tokens, materials, type, light/dark themes and a token name list | This plan §1; doc 05 contrast rules | `src/styles/tokens.css`, `src/styles/materials.css`, `src/styles/base.css`, `docs/ux/visual.md` | ux-designer |
| open-meteo-integrator | Pure scoring module, beach list, forecast Function with `OPEN_METEO_BASE` override and `partial` handling | Contract §3.2–3.3 `ForecastResponse`; doc 01 | `src/scoring/*.ts`, `src/data/beaches.json`, `netlify/functions/forecast.mts` | qa-engineer |
| supabase-auth-engineer | Migration; browser auth module; Function auth module (token + role check, CSRF, fail closed, https-only outside dev) | D-006…D-008; contracts §3.5–3.6; `docs/security.md` | `supabase/migrations/20261126000000_profiles.sql`, `src/lib/auth.ts`, `netlify/functions/_lib/auth.ts` | **security-engineer** |
| agent-console-engineer | Agent manifest build script; Claude/GitHub/diff/Blobs/budget/audit libs; `agents`, `agent-chat`, `proposals`, `approve` Functions written against the `_lib/auth.ts` **interface** (§3.5) | Contracts §3.1–3.5; doc 04 §4.3–4.6; D-003, D-005, D-008 | `scripts/build-agents.mjs`, `netlify/functions/{agents,agent-chat,proposals,approve}.mts`, `netlify/functions/_lib/{claude,github,diff,agents,blobs,budget,audit}.ts` | **security-engineer** |
| security-engineer | Allow-list with the new deny entries (`supabase/**`, `login/**`, `src/lib/auth.*`); final CSP values | D-007; path-allowlist skill | `netlify/functions/_lib/allowlist.ts` | agent-console-engineer |
| netlify-engineer | Build config, CSP with the Supabase origin, `/agents/*` no-store, Vite multi-page config, secret scan, `.env.example` | §3.7; netlify-deploy-config skill | `netlify.toml`, `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example`, `scripts/check-secrets.mjs` | security-engineer |
| pwa-mobile-engineer | Manifest, icons, service worker (precache shell; network-first `/api/forecast`; **never cache** `/api/agent*`, `/api/proposals*`, `/agents/`, `/login/`, any request with `Authorization`, or any other origin), offline page, install prompt module | Doc 02; §3.2 | `public/manifest.webmanifest`, `public/icons/**`, `public/offline.html`, `public/offline.css`, `public/sw.js` (§9.7; was `src/sw.ts`), `src/pwa/{register,install}.ts` | qa-engineer, frontend-engineer |
| qa-engineer | Test harness, upstream mock server, fixtures, and unit + function tests written **from the contracts** (they go green as code lands) | Contracts §3; doc 05; §7 of this plan | `vitest.config.ts`, `playwright.config.ts`, `tests/mocks/upstreams.mjs`, `tests/mocks/test.env`, `tests/fixtures/{open-meteo,anthropic,github,supabase}/**`, `tests/unit/**`, `tests/function/**` | open-meteo-integrator, agent-console-engineer, supabase-auth-engineer (each for their area) |
| technical-writer | Content pages written against the page-shell contract (`<main>` content plus `<script type="module" src="/src/pages/content.ts">`) | Doc 01 §1.6, D-002, skill docs-writing link list | `how-it-works/index.html`, `resources/index.html`, `guide/index.html` | software-architect |
| software-architect | Shared contract types (types only, no logic) | §3.3 | `src/shared/contracts.ts` | agent-console-engineer, frontend-engineer |

No Wave 1 task waits for another. The Functions code against `_lib/auth.ts` by its signature. The writer codes against the shell contract. QA codes against the JSON shapes.

### Wave 2 — screens and integration (all ∥) ✅ done

| Expert | Task | ⛓ needs | Outputs | Peer reviewer(s) |
|---|---|---|---|---|
| frontend-engineer | Home page (picker, today, week, day detail, stale banner, NWS link, attribution); Agents page (access check, grid, chat with SSE, proposals list, diff view with +/− text markers, Approve dialog with title confirm, Reject); shared shell/nav; API + SSE helpers | ⛓ UX flows + copy, ⛓ tokens (W1); ⛓ `src/lib/auth.ts` (W1, Agents page only); ⛓ `src/scoring` (W1) | `index.html`, `agents/index.html`, `src/pages/{home,agents,content}.ts`, `src/lib/{api,sse,dom,shell}.ts` | ux-designer, ui-designer; security-engineer (Agents page: token handling, no `innerHTML`) |
| supabase-auth-engineer | Login page: sign up, log in, Google, forgot password (same message for known and unknown emails), sign out, safe `next` redirect. Reset page: `PASSWORD_RECOVERY` → `updatePassword` | ⛓ UX login flow + copy, ⛓ tokens (W1) | `login/index.html`, `login/reset/index.html`, `src/pages/login.ts`, `src/pages/login-reset.ts` | **security-engineer**, ux-designer |
| agent-console-engineer | Integrate the real `_lib/auth.ts` and `_lib/allowlist.ts`; make the function tests pass | ⛓ `_lib/auth.ts`, `_lib/allowlist.ts`, QA function tests (W1) | Fixes in its W1 files | **security-engineer** |
| pwa-mobile-engineer | Register the SW from page entries; wire the precache list to the Vite build output; place the install prompt | ⛓ page entries from frontend (this wave, small hand-off at the end) | `src/pwa/*`, `public/sw.js`, `scripts/inject-sw.mjs` | qa-engineer |
| qa-engineer | Playwright e2e specs (§7) against the mock server | ⛓ UX flows (W1) for selectors and copy | `tests/e2e/**` | frontend-engineer, supabase-auth-engineer |

### Wave 3 — prove it, document it (all ∥) 🔄 in progress (drift check done 2026-11-26; see §10)

| Expert | Task | ⛓ needs | Outputs | Peer reviewer(s) |
|---|---|---|---|---|
| qa-engineer | Run everything: unit, function, e2e on iPhone/Pixel/desktop, offline, axe, 375 px, Approve vs mock GitHub, role checks, secret scan; file findings | ⛓ Wave 2 code | Test report in handoff; test fixes | owners of failing code |
| security-engineer | Full security review: every protected Function calls `requireRole` first; CSRF; no secret keys; RLS migration; allow-list; CSP; SW never caches auth traffic | ⛓ Wave 2 code | Review verdicts | — |
| technical-writer | `README.md`: what it is, run locally (with mocks), deploy to Netlify, environment variables (§3.7), Supabase + Google setup, making the first `super_admin`, tests, rotating secrets, Supabase Free pausing + 2 emails/hour note | ⛓ final env list (netlify-engineer W1), ⛓ setup steps from supabase-auth-engineer (W1/W2 packets) | `README.md` | software-architect, netlify-engineer |
| software-architect | Check the tree and contracts against what was built; update this plan and doc 03 if anything drifted | ⛓ Wave 2 code | Doc updates | orchestrator |

**Fix wave:** findings go back to their owners in parallel. Only the changed files are re-reviewed.

### Wave 4 — deploy (orchestrator + netlify-engineer + human) ⏳ not started

1. Human: follow security.md §7. Create the Supabase project. Turn on Email with **Confirm email** and a minimum password length of 12. Set the Site URL and the exact redirect URLs (`https://<site>/login/`, `https://<site>/login/reset/`). Turn on Google; its client secret goes only in the Supabase dashboard, and the Google client allows only the site origin and the Supabase callback. Keep the JWT expiry at 1 hour or less. Run the migration. Set up custom SMTP before real sign-ups.
2. Human: set the Netlify environment variables (§3.7) in the UI.
3. Orchestrator commits and pushes after all reviews pass, and Netlify builds.
4. Human: sign up on the live site, then run the promotion SQL (§3.6) to become `super_admin`.
5. Smoke test: `/api/forecast?beach=south-beach` returns 200; as a `user`, `/agents/` shows "no access" and `GET /api/agents` returns 403; as `super_admin`, chat works and a test proposal can be rejected.

### Dependency summary (true dependencies only)

```
W0 plan/contracts ─┬─▶ W1 (11 tasks in parallel)
                   │
UX flows + tokens ─┼─▶ W2 frontend screens, W2 login page, W2 e2e specs
src/lib/auth.ts ───┼─▶ W2 Agents page, W2 login page
_lib/auth.ts + allowlist + QA function tests ─▶ W2 console integration
page entries (W2 frontend) ─▶ W2 SW precache wiring
W2 code ─▶ W3 QA run, security review, README ─▶ fix wave ─▶ W4 deploy
```

## 5. Final file tree

```
/
├─ index.html                        # Beach Day home                         frontend-engineer
├─ agents/index.html                 # Agents page (super_admin)              frontend-engineer
├─ login/index.html                  # Supabase login                         supabase-auth-engineer
├─ login/reset/index.html            # set new password after recovery link   supabase-auth-engineer
├─ how-it-works/index.html           #                                        technical-writer
├─ resources/index.html              # all external links                     technical-writer
├─ guide/index.html                  # step-by-step setup guide               technical-writer
├─ netlify.toml                      # build, functions, headers/CSP          netlify-engineer
├─ package.json, package-lock.json   #                                        netlify-engineer
├─ vite.config.ts, tsconfig.json     #                                        netlify-engineer
├─ vitest.config.ts, playwright.config.ts                                     qa-engineer
├─ .env.example                      # names + fake formats only              netlify-engineer
├─ README.md                         #                                        technical-writer
├─ public/
│  ├─ manifest.webmanifest           #                                        pwa-mobile-engineer
│  ├─ icons/…                        #                                        pwa-mobile-engineer
│  ├─ offline.html, offline.css      #                                        pwa-mobile-engineer
│  ├─ sw.js                          # plain JS, placeholders filled by inject-sw   pwa-mobile-engineer
│  └─ robots.txt
├─ src/
│  ├─ pages/home.ts, agents.ts, content.ts                                    frontend-engineer
│  ├─ pages/login.ts, login-reset.ts                                          supabase-auth-engineer
│  ├─ lib/api.ts, sse.ts, dom.ts, shell.ts                                    frontend-engineer
│  ├─ lib/auth.ts                    # supabase-js client + helpers           supabase-auth-engineer
│  ├─ pwa/register.ts, install.ts                                             pwa-mobile-engineer
│  ├─ scoring/index.ts, score.ts, window.ts, units.ts                         open-meteo-integrator
│  ├─ shared/contracts.ts            # types only                             software-architect
│  ├─ data/beaches.json                                                       open-meteo-integrator
│  └─ styles/tokens.css, materials.css, base.css                              ui-designer-apple-liquid-glass
├─ netlify/functions/
│  ├─ forecast.mts                   # public                                 open-meteo-integrator
│  ├─ agents.mts, agent-chat.mts, proposals.mts, approve.mts                  agent-console-engineer
│  ├─ _lib/auth.ts                   # requireRole (token, role, CSRF)        supabase-auth-engineer
│  ├─ _lib/allowlist.ts                                                       security-engineer
│  ├─ _lib/claude.ts, github.ts, diff.ts, agents.ts, blobs.ts, budget.ts, audit.ts   agent-console-engineer
│  └─ _generated/agents.json, agents-private.json   # build output, git-ignored (scripts/build-agents.mjs)
├─ supabase/
│  └─ migrations/20261126000000_profiles.sql                                  supabase-auth-engineer
├─ scripts/build-agents.mjs                                                   agent-console-engineer
├─ scripts/check-secrets.mjs                                                  netlify-engineer
├─ scripts/inject-sw.mjs             # writes version + precache into dist/sw.js   pwa-mobile-engineer
├─ tests/
│  ├─ unit/**, function/**, e2e/**                                            qa-engineer
│  ├─ fixtures/open-meteo/**         # Anthropic, GitHub, Supabase replies are inline in upstreams.mjs   qa-engineer
│  └─ mocks/upstreams.mjs, test.env, load-env.mjs, global-setup.ts            qa-engineer
├─ docs/
│  ├─ ux/flows.md, copy.md, visual.md                                         ux / ui designers
│  └─ 01…05, decisions.md, build-plan.md, security.md, …
├─ .claude/agents/**, .claude/skills/**, knowledge/**, CLAUDE.md              agent-builder
```

**Removed relative to doc 03's first layout:** `netlify/functions/auth.mts`, `_lib/session.ts`, `agent-job.mts`, `job-status.mts` (deferred), `src/console/` (now the `agents/` page), the static `dist/agents.json` (D-007) and `src/sw.ts` (replaced by `public/sw.js` + `scripts/inject-sw.mjs`, §9.7).

## 6. Blobs stores

| Store | Keys | Consistency |
|---|---|---|
| `proposals` | `proposal/<id>`, id = `p_` + base36 time + 10 random chars (time-sortable). Record = `Proposal` + server-only `files[].content`, `fileShas`, transient `approving: { by, at }` (expires after 120 s) | strong; `onlyIfNew` on create, `onlyIfMatch` on claim and decide |
| `budget` | `chat/<yyyy-mm-dd>/global` and `chat/<yyyy-mm-dd>/user/<userId>` → `{ turns, tokens }` | strong; CAS with retries |
| `audit` | `audit/<yyyy-mm-dd>/<epoch-ms>-<requestId>-<rand>` → `{ t, userId, email, action, target, ip, requestId, …small scalars }` | strong (all stores use `store(name)`, §9.6) |
| `locks` | `approve` → `{ owner, at }` (serializes approvals; taken over after 90 s) | strong |

The old `auth` store (`login-fail/<ip>`) is gone. Supabase rate-limits logins (D-006).

## 7. Testing locally without real secrets

Goal: every unit, function and e2e test runs with **no real key, token or Supabase project**. QA owns this harness.

**Mock server:** `tests/mocks/upstreams.mjs` is one dependency-free Node `http` server on `127.0.0.1:9100`, with one path prefix per upstream. It serves recorded fixtures from `tests/fixtures/<upstream>/` and records every request it receives, so tests can assert on them. As built (§9.4): `GET /__calls`, `DELETE /__calls` (resets calls and state), `POST /__state`, `POST /__role`, `POST /__mode`. Only Open-Meteo has fixture files; the Anthropic, GitHub and Supabase replies are scripted inside `upstreams.mjs`.

| Upstream | Env var pointing at the mock | Mock behaviour |
|---|---|---|
| Open-Meteo | `OPEN_METEO_BASE=http://127.0.0.1:9100/open-meteo` (overrides both the forecast and the marine host) | `/v1/forecast`, `/v1/marine` serve fixtures (calm day, thunderstorm, front, big swell, marine 500 for `partial`) |
| Anthropic | `ANTHROPIC_BASE_URL=http://127.0.0.1:9100/anthropic` (the SDK reads it) | `/v1/messages` streams scripted SSE: text chunks → optional `tool_use propose_change` → `end_turn`; can also return 429 or `overloaded_error` |
| GitHub | `GITHUB_API_URL=http://127.0.0.1:9100/github` | Git Data API: ref, commit, trees, commits, ref PATCH; can return a moved HEAD (409 path) or a non-fast-forward |
| Supabase | `SUPABASE_URL=http://127.0.0.1:9100/supabase` | `/auth/v1/user` (what `auth.getUser(jwt)` calls): `Bearer tok_super_admin` → admin user, `tok_user` → normal user, `tok_expired` → 401, `tok_signed_out` → 403 `session_not_found`, anything else → 401. `/rest/v1/profiles?select=id,role&id=eq.<id>` returns only the caller's row (RLS imitated). `POST /__role {id, role}` demotes a user (security.md F6). `POST /__mode supabase-down` → 503 |

**Fake values** in `tests/mocks/test.env` (committed; deliberately unlike real formats so the secret scan stays clean): `ANTHROPIC_API_KEY=test-anthropic-key`, `GITHUB_TOKEN=test-github-token`, `GITHUB_REPO=test-owner/test-repo`, `SUPABASE_PUBLISHABLE_KEY=test-publishable-key`.

**Browser side (Playwright):** `page.route("https://beachday-test.supabase.co/**", …)` fulfils supabase-js calls (`/auth/v1/token?grant_type=password` returns a session whose `access_token` is `tok_super_admin` or `tok_user`; `/auth/v1/recover`, `/auth/v1/signup`, `/rest/v1/profiles`). The test build uses `VITE_SUPABASE_URL=https://beachday-test.supabase.co`. The token the browser gets is the same one the Function-side mock accepts, so the full path is exercised: login → Bearer → `_lib/auth` → mock Supabase → role. Google OAuth is tested only up to the redirect (assert that the `authorize?provider=google` navigation is requested). The real Google round trip is a manual check.

**Running:** Playwright `webServer` is an array: the mock server, then `netlify dev` with `tests/mocks/test.env` loaded. Function tests (Vitest) call the handlers directly with `fetch` pointed at the mock and an in-memory Blobs fake.

**Must-have auth tests** (the full list is security.md §6: F1–F14, A1–A6, B1–B4):

- Every protected route returns 401 with no token, a junk token or `tok_expired`.
- It returns 403 with `tok_user`.
- It returns 503 when the Supabase mock is down, and never 200.
- POST without `X-Requested-With`, or with a foreign `Origin`, returns 403.
- `GET /api/forecast` works with no token.
- A non-https `SUPABASE_URL` is rejected outside `dev`.
- The Agents page shows "no access" for `tok_user`.
- Approve as admin sends tree → commit → ref PATCH to the GitHub mock exactly once, even with a double click.
- The secret scan fails on a planted `sb_secret_` string.
- **RLS checks S1–S6 (security.md §6) need a real Postgres**, and the mock cannot prove them. They run as an opt-in suite (`RUN_LIVE_SUPABASE=1`) against a **separate test Supabase project**, using only its URL and publishable key and two test accounts. They never run on forks or by default. The security engineer also reviews the migration by hand.

## 8. Risks

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Supabase Free project pauses after a week of low activity, so login and the Agents page fail | High | Medium (public pages unaffected) | Functions fail closed with 503 and a clear message; the README explains how to restore the project from the dashboard; an optional weekly keep-alive is an open question | supabase-auth-engineer, technical-writer |
| Built-in email sends only 2 emails/hour, so sign-up confirmations and resets fail | High | Low–Medium | Single owner at first; document custom SMTP (its password stays in the Supabase dashboard) | supabase-auth-engineer |
| Role escalation (user edits `profiles`, or a role read from `user_metadata`) | Low | High | No write policies plus revoked privileges; role read only from `profiles` with the user's token; security review of the migration; manual check with a non-admin account | supabase-auth-engineer, security-engineer |
| A Function forgets `requireRole` | Medium | High | `requireRole` is the first line of every protected handler; a function test loops over every protected route; security review checklist | agent-console-engineer, qa-engineer |
| Token theft through XSS (token in browser storage) | Low | High | CSP `script-src 'self'`, no `innerHTML` with remote or model text, short JWT expiry, auth files on the deny-list | security-engineer, frontend-engineer |
| Mock base URL left set in production, so fake tokens are trusted | Low | High | Non-https base URLs accepted only when `context.deploy.context === "dev"`; mocks live in `tests/`, which is never bundled | supabase-auth-engineer, netlify-engineer |
| Supabase outage | Low | Medium | Fail closed (503); the forecast path has no Supabase dependency | supabase-auth-engineer |
| An agent proposes a change to auth code, migrations, the console or its own prompts | Medium | High | Deny list in `_lib/allowlist.ts` (source of truth: `supabase/**`, `login/**`, `agents/**`, `knowledge/**`, `src/lib/auth.*`, `src/lib/api.*`, `src/pages/agents.*`, `src/pages/login*`, `public/sw.js`, build files) checked at propose and again at approve; human reviews the diff | security-engineer |
| Open sign-up attracts spam accounts | Medium | Low | Accounts get role `user` (nothing to gain); Supabase rate limits; CAPTCHA or disabling sign-up later if needed | supabase-auth-engineer |
| Two Supabase round-trips per protected call add latency | High | Low | Acceptable at this volume; JWKS verification can drop one round-trip later (D-008) | supabase-auth-engineer |

## 9. Orchestrator decisions for the build (binding for every expert)

1. **Dependencies are frozen.** The orchestrator installed `package.json` (vite 8, vitest 5, @playwright/test 1.63.0 matching the pre-installed Chromium, @netlify/functions 6, @netlify/blobs 11, @anthropic-ai/sdk, @supabase/supabase-js 2, diff 9, @axe-core/playwright, netlify-cli 27, typescript 5). **Don't run `npm install` or edit `package.json`.** If you need something new, say so under OPEN in your handoff. The `scripts` in `package.json` are fixed: `build` = `build:agents` → `vite build` → `node scripts/inject-sw.mjs` → `node scripts/check-secrets.mjs`.
2. **TypeScript and imports.** Front end in `src/**/*.ts`, Functions in `netlify/functions/*.mts` with helpers in `netlify/functions/_lib/*.ts`. Import local files **with the `.ts` extension** (`import { requireRole } from "./_lib/auth.ts"`); tsconfig sets `allowImportingTsExtensions` and `noEmit`. No framework.
3. **Agent knowledge (lead's requirement).** `AgentSummary` gains `knowledge: { path: string; title: string }[]`, listing the files under `knowledge/<agent>/docs` and `examples`. `scripts/build-agents.mjs` writes:
   - `netlify/functions/_generated/agents.json`: public summaries;
   - `agents-private.json`: per agent, `{ model, system }`, where `system` = the agent body + every skill in its `skills:` list (`.claude/skills/<s>/SKILL.md`) + the text of its knowledge files (skip fixtures over 20 KB and binary files; cap at about 120,000 characters total, truncating examples first).

   Each agent therefore answers with **its own instructions, knowledge and model** (opus→`claude-opus-5-5`, sonnet→`claude-sonnet-5-5`, haiku→`claude-haiku-5-5`). Functions import the JSON; `_generated/` is git-ignored and built before `vite build` and before tests (`npm run build:agents`).
4. **Upstream base URLs (mockable).**
   - Forecast: `OPEN_METEO_BASE` (default `https://api.open-meteo.com`, path `/v1/forecast`).
   - Marine: `OPEN_METEO_MARINE_BASE` (default `https://marine-api.open-meteo.com`, path `/v1/marine`).
   - Claude: `ANTHROPIC_BASE_URL` (the SDK reads it; it appends `/v1/messages`).
   - GitHub: `GITHUB_API_URL` (default `https://api.github.com`).
   - Supabase: `SUPABASE_URL`.

   The mock server `tests/mocks/upstreams.mjs` listens on `127.0.0.1:9100` with prefixes `/open-meteo`, `/marine`, `/anthropic`, `/github` and `/supabase`, and records requests at `GET /__calls` (`DELETE` to reset). `tests/mocks/test.env` sets all of these, plus `GITHUB_REPO=atilus2020-design/BeachDay-kakashi`, `GITHUB_TOKEN=test-token`, `ANTHROPIC_API_KEY=test-key` and `SUPABASE_PUBLISHABLE_KEY=sb_publishable_test`. Mock tokens: `tok_super_admin`, `tok_user`, `tok_expired`.
5. **http Supabase URL** is accepted only when `context?.deploy?.context === "dev"` (`netlify dev`) or `process.env.NODE_ENV === "test"` (vitest). Everywhere else it must be https.
6. **Blobs in tests.** `_lib/blobs.ts` exports `store(name)`. It uses `getStore({ name, consistency: "strong" })` normally, and an in-memory implementation with the same subset (`get(key,{type:"json"})`, `getWithMetadata`, `setJSON(key,v,{onlyIfNew,onlyIfMatch})` returning `{modified, etag}`, `delete`, `list({prefix})`) when `NODE_ENV === "test"`. Under `netlify dev` the real local sandbox is used.
7. **Service worker** is plain JS at `public/sw.js`, with `__VERSION__` and `__PRECACHE__` placeholders. `scripts/inject-sw.mjs` (pwa-mobile-engineer) rewrites `dist/sw.js` after `vite build` with the build hash and the list of built shell assets. There is no `src/sw.ts`.
8. **Page shell.** Every HTML page has `<header class="site-header" data-shell></header>` … `<footer class="site-footer" data-shell></footer>`. `src/lib/shell.ts` (frontend) exports `mountShell()`, which fills them:
   - nav: Beach Day (home), Agents, How it works, Resources;
   - footer: Resources · Guide (`/guide/`) · GitHub repo (`https://github.com/atilus2020-design/BeachDay-kakashi`) · API directory (`https://mcp-api.netlify.app/`) · "Weather data by Open-Meteo.com" · "A planning aid, not a safety service."

   Content pages load `/src/pages/content.ts`, which calls `mountShell()`. Each page also includes a `<noscript>` fallback with the same links.
9. **Ports.** Vite dev runs on 5173. `netlify dev` runs on 8888 and proxies Vite and runs the Functions. Playwright starts the mocks plus `netlify dev` with `tests/mocks/test.env`.
10. **Experts never commit or push.** Each one returns a handoff packet of 400 words or fewer: DELIVERED, CONTRACTS, TESTS RUN (with results), OPEN.

## 10. As-built differences (Wave 3 drift check, 2026-11-26)

These are **deliberate** and accepted by the orchestrator. §3–§7 above already reflect them. None of them changes an accepted decision, so no new D-record was needed.

| # | Area | First contract | As built | Why |
|---|---|---|---|---|
| 1 | Approve, GitHub failure | not specified | **502** "GitHub is unavailable, try again later"; the `approving` claim is undone and nothing is committed | Tells "upstream failed" apart from our own 500 |
| 2 | Reject rate limit | 10 / 60 s | 60 / 60 s, shared with the proposal GETs | One `rateLimit` per Function; Reject lives in `proposals.mts` |
| 3 | Forecast caching | 1800 s CDN for every 200 | `partial: true` answers get CDN `s-maxage=60` | A half-broken answer should not stick for 30 min |
| 4 | NWS link | per-office link | each beach's `nwsUrl` in `beaches.json` (added to `Beach` in §3.3) | Exact Surf Zone Forecast page per beach (D-002) |
| 5 | Allow-list | `supabase/**`, `login/**`, `src/lib/auth.*` added | also `knowledge/**`, `agents/**`, `src/pages/agents.*`, `src/pages/login*`, `src/lib/api.*`, `public/sw.js`, `public/_headers`, `public/_redirects` | `_lib/allowlist.ts` is the source of truth |
| 6 | Service worker | `src/sw.ts` | `public/sw.js` + `scripts/inject-sw.mjs` (§9.7) | No SW bundler needed |
| 7 | `requireRole` | 3 arguments | optional 4th `opts: { methods? }` | Each Function sets its allowed methods; the guard answers 405 |
| 8 | Budget defaults | 200 turns, 2,000,000 tokens | 100 turns, 1,000,000 tokens per day, per user and global, when the env vars are unset | Security review: lower default spend |
| 9 | Chat stream | `done` / `error` with message only | extra `stop_reason` values `time_limit`, `tool_limit`; optional `error.retryAfter` | Additive; clients ignore unknown fields |
| 10 | CSP | as doc 03 §3.5 draft | adds `object-src 'none'`, `manifest-src 'self'`, `worker-src 'self'`; `connect-src` pinned at build via `dist/_headers` | Security review (security.md B4) |
