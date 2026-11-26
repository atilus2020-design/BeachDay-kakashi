---
name: path-allowlist
description: "Enforce and test which repository paths agents may change in Beach Day proposals. Use when writing, reviewing or testing proposal validation or the Approve commit."
---
# Path allow-list

- WRITE_ALLOW: `src/app/**`, `src/pages/**`, `src/lib/**`, `src/styles/**`, `src/scoring/**`, `src/data/**`, `public/**`, `tests/**`, `docs/**`, and exactly `index.html`, `how-it-works/index.html`, `resources/index.html`, `guide/index.html`. **Source of truth: `netlify/functions/_lib/allowlist.ts`.**
- WRITE_DENY (wins): `.github/**`, `.claude/**`, `netlify/**`, `netlify.toml`, `package.json`, `package-lock.json`, `scripts/**`, `vite.config.*`, `supabase/**`, `login/**`, `src/lib/auth.*`, `agents/**`, `src/pages/agents.*`, `src/pages/login*`, `src/lib/api.*`, `public/sw.js`, `public/_headers`, `public/_redirects`, `knowledge/**`, `**/.env*`, `**/*.pem`, `**/*.key`.
- Reject: empty, >200 chars, backslash, NUL, leading `/`, drive letters, `.`/`..`/empty segments, non-normalized paths, case tricks against deny rules.
- Limits: ≤20 files, ≤200 KB each, ≤1 MB total, UTF-8 text only; tree mode always `100644`.
- Validate at **propose** and again at **approve**.
- Tests: fuzz list in `docs/05-testing-accessibility.md` §5.1 must all be rejected; `src/pages/home.ts` must pass.
