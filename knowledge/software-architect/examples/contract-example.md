# Example 2 — an API contract written before parallel work starts

### `POST /api/agent/chat` (streaming)
| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <Supabase access token>`; role must be `super_admin` (checked server-side every request) |
| CSRF | `X-Requested-With: beachday`; `Origin` must equal the site URL |
| Request JSON | `{ "agent": "open-meteo-integrator", "messages": [{ "role": "user", "content": "…" }] }` (≤ 30 turns, ≤ 100 KB) |
| Response | `text/event-stream`: `event: text` `data: "<chunk>"` … then `event: proposal` `data: {"id":"…","title":"…"}` (optional) then `event: done` `data: {"stop_reason":"end_turn"}` or `event: error` `data: {"message":"…"}` |
| Errors (non-stream) | 400 invalid body · 401 no/invalid token · 403 wrong role or failed CSRF · 404 unknown agent · 429 rate limited |
| Limits | Netlify `rateLimit` 10/60 s per IP; `max_tokens` bounded so the turn ends < 60 s |
| Owner / reviewer | agent-console-engineer / security-engineer |
