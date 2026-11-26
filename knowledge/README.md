# Agent knowledge folders

Each agent in `.claude/agents/` has `knowledge/<agent>/` with:
- `docs/`: reference notes taken from official documentation, each with its source link and read date.
- `examples/`: small worked examples that show what good looks like. Every runnable example was run on 2026-11-26 and passed.

Every agent's file has a **"Before you answer"** section: read every file here first and prefer it over memory.

| Agent | Sources | Runnable examples (verified) |
|---|---|---|
| open-meteo-integrator | open-meteo.com docs (forecast, marine, terms) + **live API responses** recorded for Miami Beach | `build-urls.mjs`, `score-day.mjs` (scores the live fixtures) |
| agent-console-engineer | Claude API docs (Messages, models, streaming, tool use, rate limits), GitHub REST (contents, trees, tokens) | `claude-stream-mock.mjs` (official SDK against a mock server), `github-atomic-commit.mjs` (mock GitHub, stale check) |
| security-engineer | OWASP LLM Top 10, Secrets Management, CSRF cheat sheets; GitHub fine-grained tokens; Vite env | `allowlist.mjs` (23 fuzz cases), `guard-request.mjs` (auth/role/CSRF order) |
| pwa-mobile-engineer | MDN PWA guides, web.dev install criteria and offline cookbook, WebKit blog | `check-manifest.mjs`, `sw.js` (syntax-checked) |
| netlify-engineer | Netlify docs: functions, limits, rate limiting, env vars, Blobs, headers, deploys | `hello-function.mjs`, `netlify.toml` (parsed) |
| qa-engineer | Playwright docs: emulation, mocking, web server, accessibility | `mobile-and-mock.spec.mjs` (Chromium, iPhone 13 + Pixel 7 profiles) |
| ui-designer-apple-liquid-glass (Sable) | Apple HIG: materials, colour, typography, accessibility | `contrast-check.mjs` over `tokens.css` (16 pairs ≥ 4.5:1) |
| ux-designer-apple-hig (Wren) | Apple HIG: layout, writing, accessibility | flow spec and copy deck (Markdown) |
| frontend-engineer | Vite env and multi-page, MDN textContent | `sse-reader.mjs`, `render-day.mjs` |
| technical-writer | Google developer docs style guide (procedures), Apple HIG writing | deploy procedure, resources list (Markdown) |
| software-architect | Nygard ADR format; Netlify and Open-Meteo constraints | ADR and API contract examples |
| orchestrator | Claude Code subagents docs | wave plan, handoff packet |
| agent-builder | Claude Code subagent and skill docs | `validate-team.mjs` (validates the whole team), agent template |

Re-run all runnable examples:
```bash
for f in knowledge/*/examples/*.mjs; do (cd "$(dirname "$f")" && node "$(basename "$f")" >/dev/null && echo "ok $f") || echo "FAIL $f"; done
```
(Run `npm install` in `knowledge/agent-console-engineer/examples` first. `validate-team.mjs` must run from the repo root.)
