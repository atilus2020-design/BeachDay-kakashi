# Netlify Functions — reference notes

Sources (read 2026-11-26): https://docs.netlify.com/build/functions/api/ · https://docs.netlify.com/build/functions/configuration/ · https://docs.netlify.com/build/functions/background-functions/ · https://docs.netlify.com/build/functions/scheduled-functions/ · https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/

## Syntax
```ts
import type { Config, Context } from "@netlify/functions";
export default async (req: Request, context: Context) => new Response("Hello, world!");
export const config: Config = { path: "/hello" };
```
- `config`: `path` (string or string[], must start with `/`), `method`, `preferStatic`, `rateLimit`, `background`, `memory`.
- `context`: `ip`, `geo`, `cookies.get/set/delete`, `requestId`, `site { id, name, url }`, `deploy { context, id, published }`, `waitUntil(promise)`.

## Limits
| Kind | Limit |
|---|---|
| Synchronous | **60 s**, not configurable |
| Streaming (`ReadableStream` body) | **60 s**, **20 MB** response |
| Background (`config.background = true` or `-background` filename) | **15 min**; caller gets an empty **202**; on error, retried after 1 min, then 2 min later; no streaming. Available on credit-based Free, Personal, Pro and Enterprise plans |
| Scheduled | **30 s** |
| Memory | 1024 MB default |

## Rate limiting (functions)
```ts
export const config: Config = { path: "/api/x", rateLimit: { windowLimit: 100, windowSize: 60, aggregateBy: ["ip", "domain"] } };
```
- `windowSize` is in seconds, max 180. `action: "rewrite"` with `to` lets you rewrite instead of returning 429.
- "rate limits for functions cannot be defined in the `netlify.toml` configuration file."
- Free plan: targeting by path and blocking/rewriting are available; aggregation is per domain and IP.
