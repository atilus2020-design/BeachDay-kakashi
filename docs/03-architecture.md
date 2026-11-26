# 3. Architecture: static Netlify site plus Netlify Functions

## 3.1 Overview

```
 Phone / browser (PWA)                     Netlify                                   External
 ─────────────────────                     ───────                                   ────────
 index.html, app JS, sw.js  ── HTTPS ──▶  CDN: static assets (dist/)
                                          │
 /api/forecast?beach=id     ───────────▶  fn forecast  ── cached ──▶  api.open-meteo.com
                                          │                          marine-api.open-meteo.com
 /console (password gate)   ───────────▶  static page (no secrets)
 /api/auth/login|logout     ───────────▶  fn auth  ──────────▶  Blobs (login attempts)
 /api/agents                ───────────▶  fn agents (reads build-time agents.json)
 /api/agent/chat (stream)   ───────────▶  fn agent-chat ──────▶  api.anthropic.com
 /api/jobs (start)          ───────────▶  fn agent-job (background, 15 min) ─▶ Anthropic + Blobs
 /api/jobs/:id (poll)       ───────────▶  fn job-status ─────▶  Blobs
 /api/proposals/:id/approve ───────────▶  fn approve ────────▶  api.github.com (commit to main)
                                                                      │
                                          Netlify auto-deploy ◀───────┘  (Git push → build → deploy)
```

**Principles:**

- **Static first.** The public forecast UI is plain static files on the CDN. One function (`forecast`) adds caching and shapes the data.
- **Secrets live only in Functions.** `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `SESSION_SECRET` and `CONSOLE_PASSWORD_HASH` are Netlify environment variables scoped to **Functions**. None of them are exposed to the client bundle.
- **No database.** Netlify Blobs holds job state, proposals, rate-limit counters and the audit log.
- **Git is the deploy pipeline.** Approved agent changes become commits, and Netlify's continuous deployment builds them ("Connect a Git repository for automatic continuous deployment on every push": https://docs.netlify.com/deploy/create-deploys/).

## 3.2 Repository layout (proposed)

```
/
├─ netlify.toml                 # build command, publish dir, headers, redirects
├─ package.json
├─ public/                      # copied as-is: manifest, icons, robots.txt
│  ├─ manifest.webmanifest
│  └─ icons/…
├─ src/
│  ├─ app/                      # forecast UI (vanilla TS or a light framework)
│  ├─ console/                  # Agent Console UI
│  ├─ scoring/score.ts          # pure scoring (doc 1)
│  ├─ data/beaches.json
│  └─ sw.ts                     # service worker
├─ netlify/
│  └─ functions/
│     ├─ forecast.mts
│     ├─ auth.mts
│     ├─ agents.mts
│     ├─ agent-chat.mts         # streaming
│     ├─ agent-job.mts          # config.background = true
│     ├─ job-status.mts
│     ├─ proposals.mts          # list / get / reject
│     ├─ approve.mts
│     └─ _lib/                  # shared: session.ts, allowlist.ts, github.ts, claude.ts, blobs.ts
├─ scripts/build-agents.mjs     # parses .claude/agents/*.md → dist/agents.json
├─ .claude/agents/*.md          # the agent team (source of truth)
├─ tests/                       # unit, function, e2e (doc 5)
└─ docs/                        # this folder
```

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

### Netlify Blobs

Source: https://docs.netlify.com/build/data-and-storage/netlify-blobs/

- Install with `npm i @netlify/blobs`. Open a store with `getStore({ name, consistency })`, then use `set` / `setJSON` / `get(key, { type: "json" })` / `delete` / `list({ prefix })` and `getWithMetadata`.
- **Consistency:** eventual by default ("propagated to all edge locations within 60 seconds"). Use `consistency: "strong"` for job status, proposal status and rate counters, which are read right after a write.
- **Conditional writes:** `onlyIfNew` and `onlyIfMatch` (ETag) give compare-and-swap. Use them for idempotent job starts and the pending → approved status change.
- Stores created with `getStore` are **site-wide, shared across deploys**. That is what we want for proposals and jobs.
- Inside Functions, `siteID` and `token` are injected automatically. Keys are at most 600 bytes and can't start with `/`. Objects can be up to 5 GB, with metadata up to 2 KB.
- `netlify dev` uses a sandboxed local store (production data is not readable locally).

**Stores:** `jobs` (`job/<id>` → status, events, result), `proposals` (`proposal/<id>`), `ratelimit` (`rl/<bucket>/<window>`), `audit` (`audit/<yyyy-mm-dd>/<ts>-<id>`) and `auth` (`login-fail/<ip>`).

## 3.4 The forecast function

```ts
// netlify/functions/forecast.mts (sketch)
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

## 3.5 `netlify.toml` (starting point)

```toml
[build]
  command = "npm run build"        # builds app + console, runs scripts/build-agents.mjs
  publish = "dist"

[functions]
  node_bundler = "esbuild"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(self), camera=(), microphone=()"
    Content-Security-Policy = "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

[[headers]]
  for = "/console/*"
  [headers.values]
    Cache-Control = "no-store"
    X-Robots-Tag = "noindex"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"
```

Because Open-Meteo is reached only through `/api/forecast`, the CSP can keep `connect-src 'self'`.

## 3.6 Build-time agent manifest

`scripts/build-agents.mjs` reads `.claude/agents/*.md`, parses the YAML frontmatter (`name`, `description`, `model`, `tools`, …) and the Markdown body (the system prompt and personality), and writes two files:

- `dist/agents.json` holds the **public** fields only: `name`, `description`, `model`, `personality` (a short summary or the first paragraph) and `color`/`emoji` if present. The Console lists agents from this file.
- `netlify/functions/_generated/agents-private.json` holds the **full system prompts**. It is bundled into the functions only (via `included_files` or a direct import), so the server, not the browser, decides which prompt an agent runs with.

Agent file changes go through Git like everything else, so the list updates on every deploy.

## 3.7 Local development

- `npm i -g netlify-cli`, then `netlify dev` runs the static site, the functions and local Blobs together.
- Put local secrets in `.env` (git-ignored) or `netlify env:set` with the Local development context.
- Use separate low-limit keys for development: a Claude workspace with a small spend limit, and a GitHub token for a **fork or sandbox repository**.

## 3.8 Decisions to confirm

- Framework: vanilla TS plus Vite is suggested (small bundle, simple service worker). Preact or Svelte are fine if the UI grows.
- **Decided (D-003):** Approve commits straight to `main`; there is no pull-request mode.
- **Decided (D-004):** Netlify Free plan. Background functions are available on credit-based Free plans.
