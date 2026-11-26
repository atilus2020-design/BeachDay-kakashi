---
name: netlify-functions
description: "Write and configure Netlify Functions for Beach Day: modern syntax, routes, time limits, streaming, background functions, rate limits and Blobs. Use for any server-side code."
---
# Netlify Functions

- File: `netlify/functions/<name>.mts`; `export default async (req: Request, context: Context) => Response`; `export const config: Config = { path: "/api/...", method, rateLimit }`.
- Limits: synchronous **60 s**; streaming **60 s / 20 MB**; background (`config.background = true`) **15 min**, empty 202, retries after 1 min then 2 min (make idempotent); scheduled 30 s.
- Streaming: return `new Response(readableStream, { headers: { "Content-Type": "text/event-stream" } })`.
- `rateLimit: { windowLimit, windowSize (≤180 s), aggregateBy: ["ip","domain"] }` — cannot be set in netlify.toml.
- Env: `Netlify.env.get("NAME")` or `process.env.NAME`; secrets only with Functions scope. netlify.toml vars are **not** visible to Functions.
- Blobs: `import { getStore } from "@netlify/blobs"`; `getStore({ name, consistency: "strong" })` for status/counters; `setJSON(key, v, { onlyIfNew | onlyIfMatch })`.
- Return JSON errors `{ error: "message" }` with correct status; never echo upstream bodies or stack traces.
- Allow upstream base URLs to be overridden by env (`OPEN_METEO_BASE`, `GITHUB_API_URL`, `ANTHROPIC_BASE_URL`, `SUPABASE_URL`) so tests can mock them.
