---
name: vanilla-frontend
description: "Build Beach Day UI code with vanilla TypeScript/JavaScript ES modules and Vite multi-page builds, no framework. Use when writing front-end code, pages or fetch/stream helpers."
---
# Vanilla front end

- Vite multi-page: `index.html`, `agents/index.html`, `how-it-works/index.html`, `resources/index.html`, `guide/index.html`, `login/index.html`; entries listed in `vite.config` `build.rollupOptions.input`.
- One module per screen in `src/pages/`; shared helpers in `src/lib/` (`api.ts` fetch wrapper with timeout and JSON errors, `sse.ts` stream reader).
- DOM: build with `document.createElement`/`textContent`; **never** `innerHTML` with API or model text.
- Streaming: `fetch(url,{method:'POST'})` → `res.body.getReader()` → parse `event:`/`data:` lines.
- State: small module-level stores; `localStorage` only for preferences, wrapped in try/catch.
- Budgets: forecast page < 150 KB JS gzip; Agent Console loaded as its own entry.
- No secrets in front-end code; only `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` style public config.
