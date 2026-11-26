# Example 1 — a well-formed ADR

## D-006 — Score on the client, fetch through a caching proxy

- **Status:** Proposed
- **Context:** Open-Meteo's free tier allows fewer than 10,000 calls a day. Beachgoers often have weak signal. The scoring logic is pure and small (≈ 3 KB). The service worker can re-run code offline but can't call a Function offline.
- **Decision:** We will fetch raw forecast and marine JSON through `/api/forecast` (CDN-cached per beach for 30 minutes), and we will compute the score in the browser with the same `src/scoring` module the tests use.
- **Consequences:** Open-Meteo calls scale with the number of beaches, not users (positive). Offline re-scoring works from cached JSON (positive). Scoring changes ship with each front-end deploy, and old cached clients may run an older algorithm until they update (negative, mitigated by the service worker update prompt). The Function stays trivial (neutral).
