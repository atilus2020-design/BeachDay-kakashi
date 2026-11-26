# Vite, env variables and safe DOM — reference notes

Sources (read 2026-11-26): https://vite.dev/guide/env-and-mode · https://vite.dev/guide/build (Multi-Page App section) · MDN textContent https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent

- **Env:** "Variables prefixed with `VITE_` will be exposed in client-side source code after Vite bundling." "`VITE_*` variables should _not_ contain sensitive information such as API keys." Read them with `import.meta.env.VITE_X`. `.env.local` is git-ignored.
- **Multi-page:** list every HTML entry in `build.rollupOptions.input` (for example `{ main: 'index.html', agents: 'agents/index.html' }`). Nested `dir/index.html` is served at `/dir/`. Files in `public/` are copied as-is to the output root (manifest, icons, `sw.js`, `offline.html`).
- **Safe rendering:** set API and model text with `textContent` (it is never parsed as HTML). Build elements with `createElement`. Never use `innerHTML` with remote data.
- **Streaming:** read `response.body.getReader()` with a `TextDecoder`, split on blank lines, and parse `event:` and `data:` lines (see the example).
- **Budgets:** forecast page JS < 150 KB gzip; the Agents page is its own entry, so beachgoers never load it.
