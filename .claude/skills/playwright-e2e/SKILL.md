---
name: playwright-e2e
description: "Test Beach Day in real browsers with Playwright: phone viewports, offline/service worker, network mocking, the Approve flow and axe accessibility checks. Use for end-to-end or browser testing."
---
# Playwright end-to-end

- Projects: `devices['iPhone 13']`-style and `devices['Pixel 7']`; plus desktop Chromium. Chromium is pre-installed here; do not run `playwright install`.
- `webServer` in config starts the local server (`netlify dev` or the test server) before tests.
- Mock upstreams: `page.route()` for browser calls (e.g. Supabase auth), and env-overridden base URLs pointing to a local mock server for Functions (Open-Meteo, Anthropic, GitHub, Supabase).
- Offline: load once, `context.setOffline(true)`, reload → cached forecast + stale banner or `/offline.html`.
- Approve flow: log in as super_admin (mocked), open Agents, open a proposal, see the diff, click Approve, assert the mock GitHub received tree → commit → ref PATCH.
- Assert no horizontal scroll at 375px: `document.documentElement.scrollWidth <= innerWidth`.
- axe: `new AxeBuilder({ page }).analyze()`; fail on serious/critical.
- Run with `--trace off`; screenshots on failure only.
