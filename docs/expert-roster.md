# Beach Day — expert roster

**Context:** Beach Day is a PWA on Netlify with a static front end, Netlify Functions for the Claude, GitHub (and later Supabase) calls, and **no other servers**. This roster lists the experts (Claude Code subagents in `.claude/agents/`) needed to design, build, test and deploy it, and to run its Agent Console.

## Roles

### Required roles

| # | Agent (`.claude/agents/<name>.md`) | One-line job description |
|---|---|---|
| 1 | `orchestrator` | Runs the team. Splits a request into waves, launches independent experts in parallel, routes every handoff, runs peer reviews and accepts or rejects work. |
| 2 | `agent-builder` | The meta agent. Creates, tests and improves the agents, their skills and their knowledge folders, following the official Claude Code subagent and skill formats. |
| 3 | `software-architect` | Owns the system shape: folder layout, module boundaries, API contracts between front end and Functions, decision records and the build plan. |
| 4 | `open-meteo-integrator` | Owns the Open-Meteo forecast and marine integration, the forecast proxy Function and the pure beach-score algorithm. |
| 5 | `pwa-mobile-engineer` | Makes Beach Day installable and reliable on iPhone and Android: manifest, icons, service worker, offline fallback and install UX. |
| 6 | `security-engineer` | Threat-models the app and the Agent Console, sets the auth, secret, allow-list and rate-limit rules, and reviews every change that touches them. |
| 7 | `agent-console-engineer` | Builds the Agent Console back end: agent listing, Claude chat through Netlify Functions, propose → diff → Approve → GitHub commit. |
| 8 | `ui-designer-apple-liquid-glass` (**Sable**) | Owns the look: Apple-style Liquid Glass visual language, design tokens, typography, colour, materials and light/dark themes. |
| 9 | `ux-designer-apple-hig` (**Wren**) | Owns the flow: information architecture, screens, navigation, copy and interaction patterns, following Apple's Human Interface Guidelines. |
| 10 | `qa-engineer` | Proves the app works: unit, function and Playwright browser tests (phone layouts, offline, Approve flow against a mocked GitHub API) and accessibility checks. |
| 11 | `netlify-engineer` | Owns `netlify.toml`, the build, Functions configuration, environment variables, Blobs, headers, rate limits and the deploy pipeline on the Free plan. |

### Added roles (each one fills a gap no required role covers)

| # | Agent | One-line job description | Why it is needed |
|---|---|---|---|
| 12 | `frontend-engineer` | Implements the screens in vanilla TypeScript + Vite from Sable's tokens and Wren's flows, and wires them to the Functions. | Designers specify and engineers own platforms, but somebody has to write the UI code. Without this role the designers would be coding or the integrator would be building screens. |
| 13 | `technical-writer` | Writes the README and deploy steps, the How it works page, the Resources page and the step-by-step `/guide/`. | The app ships three content pages and a deploy guide. Accurate, plain-language docs are a distinct skill, and wrong deploy steps are a common failure. |

**Roles deliberately not added:**

- **Accessibility specialist:** shared `accessibility-wcag` skill held by Wren, Sable, the frontend engineer and QA.
- **DevOps / SRE:** the Netlify engineer, since there are no other servers.
- **Data scientist:** the scoring is a small, explainable rule set owned by the integrator.
- **Product manager:** the user leads the project, and the orchestrator manages the work.

## Skills

Each skill is a project skill in `.claude/skills/<skill>/SKILL.md`. Each agent lists its skills in its `skills:` frontmatter field, and Claude Code injects the full skill content into the agent at startup.

### Skill → agents matrix

| Skill | What it covers | Agents that share it |
|---|---|---|
| `team-orchestration` | Wave planning, parallel launch, handoff packets, review gates, acceptance | orchestrator |
| `agent-authoring` | Subagent and skill file formats, descriptions that delegate well, knowledge folders, evaluating agents | agent-builder, orchestrator |
| `peer-review` | A structured review checklist and verdict format used when one expert reviews another | **all agents** |
| `architecture-decisions` | Decision records, module boundaries, contracts, the build plan | software-architect, orchestrator, technical-writer |
| `open-meteo-forecast` | Forecast and marine endpoints, fields, units, time zones, caching, terms | open-meteo-integrator, frontend-engineer, qa-engineer |
| `beach-scoring` | Beach window, vetoes, weighted components, labels, reasons, NWS link-out | open-meteo-integrator, frontend-engineer, ux-designer-apple-hig, qa-engineer |
| `pwa-installability` | Manifest, icons, service worker strategies, offline fallback, iOS and Android install UX | pwa-mobile-engineer, frontend-engineer, netlify-engineer, qa-engineer |
| `vanilla-frontend` | Vite multi-page build, ES modules, small bundles, fetch/stream helpers, no framework | frontend-engineer, pwa-mobile-engineer, ui-designer-apple-liquid-glass |
| `apple-hig-ux` | HIG navigation, layout, touch targets, feedback, writing | ux-designer-apple-hig, ui-designer-apple-liquid-glass, frontend-engineer |
| `liquid-glass-ui` | Translucent materials, depth, tokens, typography, dark mode, legibility over glass | ui-designer-apple-liquid-glass, frontend-engineer |
| `accessibility-wcag` | WCAG 2.2 AA rules applied to this app (contrast, targets, live regions, reduced motion) | ux-designer-apple-hig, ui-designer-apple-liquid-glass, frontend-engineer, pwa-mobile-engineer, qa-engineer |
| `netlify-functions` | Modern Function syntax, 60 s / 15 min limits, streaming, background functions, `rateLimit`, Blobs | netlify-engineer, agent-console-engineer, open-meteo-integrator, security-engineer, software-architect |
| `netlify-deploy-config` | `netlify.toml`, build, headers and CSP, environment variables per context, Free plan limits, Git deploys | netlify-engineer, software-architect, technical-writer, orchestrator |
| `claude-api` | Messages API, model IDs, streaming, tool use, refusals, rate limits, cost | agent-console-engineer, agent-builder, security-engineer |
| `github-commits` | Fine-grained token, Contents API, Git Data API atomic commits, stale checks | agent-console-engineer, security-engineer, qa-engineer |
| `secrets-and-auth` | Environment-variable secrets, sessions/tokens, CSRF, login rate limits, no secrets in the browser | security-engineer, agent-console-engineer, netlify-engineer |
| `path-allowlist` | Write allow/deny lists, path normalization, size caps, the fuzz tests that prove them | security-engineer, agent-console-engineer, qa-engineer |
| `playwright-e2e` | Playwright projects for phones, offline tests, network mocking, axe checks | qa-engineer, frontend-engineer, pwa-mobile-engineer |
| `docs-writing` | Plain-language docs, deploy READMEs, link hygiene, the Resources page | technical-writer, software-architect, orchestrator |

### Agent → skills (the same data, by agent)

| Agent | Skills |
|---|---|
| orchestrator | team-orchestration, agent-authoring, architecture-decisions, netlify-deploy-config, docs-writing, peer-review |
| agent-builder | agent-authoring, claude-api, peer-review |
| software-architect | architecture-decisions, netlify-functions, netlify-deploy-config, docs-writing, peer-review |
| open-meteo-integrator | open-meteo-forecast, beach-scoring, netlify-functions, peer-review |
| pwa-mobile-engineer | pwa-installability, vanilla-frontend, accessibility-wcag, playwright-e2e, peer-review |
| security-engineer | secrets-and-auth, path-allowlist, github-commits, claude-api, netlify-functions, peer-review |
| agent-console-engineer | claude-api, github-commits, netlify-functions, secrets-and-auth, path-allowlist, peer-review |
| ui-designer-apple-liquid-glass | liquid-glass-ui, apple-hig-ux, accessibility-wcag, vanilla-frontend, peer-review |
| ux-designer-apple-hig | apple-hig-ux, accessibility-wcag, beach-scoring, peer-review |
| qa-engineer | playwright-e2e, accessibility-wcag, beach-scoring, open-meteo-forecast, pwa-installability, github-commits, path-allowlist, peer-review |
| netlify-engineer | netlify-functions, netlify-deploy-config, secrets-and-auth, pwa-installability, peer-review |
| frontend-engineer | vanilla-frontend, apple-hig-ux, liquid-glass-ui, accessibility-wcag, pwa-installability, open-meteo-forecast, beach-scoring, playwright-e2e, peer-review |
| technical-writer | docs-writing, architecture-decisions, netlify-deploy-config, peer-review |

## How the team works

- **The orchestrator is the only agent that talks to the user** during a build. Experts hand work to each other **through the orchestrator**: the orchestrator passes each expert's output (files changed, contracts, open questions) to the next one.
- **Independent experts run in parallel.** The orchestrator waits only when one expert needs another's output.
- **Nothing is accepted without a peer review** by at least one other expert who holds the relevant skill. The security engineer must review auth, secrets, Functions and the Approve flow.

## Ownership map (who may edit what)

| Area | Owner | Required reviewer |
|---|---|---|
| `docs/decisions.md`, `docs/build-plan.md`, folder layout | software-architect | orchestrator |
| `src/scoring/**`, `src/data/beaches.json`, `netlify/functions/forecast.mts` | open-meteo-integrator | qa-engineer |
| `public/manifest.webmanifest`, `public/icons/**`, `src/sw.*`, offline page | pwa-mobile-engineer | qa-engineer, frontend-engineer |
| `netlify/functions/_lib/{session,allowlist,auth}.*`, security headers | security-engineer | agent-console-engineer |
| `netlify/functions/{agents,agent-chat,proposals,approve}.*`, `netlify/functions/_lib/{claude,github}.*`, `scripts/build-agents.*` | agent-console-engineer | security-engineer |
| `src/styles/**` (tokens, materials) | ui-designer-apple-liquid-glass | ux-designer-apple-hig |
| Flow specs, copy (`docs/ux/**`) | ux-designer-apple-hig | ui-designer-apple-liquid-glass |
| `src/**/*.ts` UI code, HTML pages | frontend-engineer | ux-designer-apple-hig, ui-designer-apple-liquid-glass |
| `tests/**`, `playwright.config.*` | qa-engineer | the owner of the code under test |
| `netlify.toml`, `package.json`, build scripts, environment variable docs | netlify-engineer | security-engineer |
| `README.md`, How it works, Resources, `/guide/` | technical-writer | software-architect |
| `.claude/agents/**`, `.claude/skills/**`, `knowledge/**`, `CLAUDE.md` | agent-builder | orchestrator |
