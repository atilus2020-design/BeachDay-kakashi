# Beach Day — project guide for Claude

Beach Day is a **PWA on Netlify**: a static front end and Netlify Functions for the Claude and GitHub calls, with **no other servers** (decision D-001). You pick a South Florida beach and it scores today and the next few days from the Open-Meteo forecast and marine APIs. A password- or role-protected **Agent Console** lets the agent team chat and propose code changes. A change is committed to `main` only when the user clicks Approve, which triggers a Netlify redeploy.

## Read first

- `docs/README.md`: research index (scoring, PWA, architecture, Agent Console, testing)
- `docs/decisions.md`: accepted decisions D-001 and onward. Follow them; propose a new record to change one
- `docs/expert-roster.md`: who does what, the skills matrix and the ownership map
- `docs/agent-brains.md`: each agent's model, name and personality

## The team

The experts are project subagents in `.claude/agents/`. Their skills are in `.claude/skills/<skill>/SKILL.md`, wired through each agent's `skills:` field. Each agent's own reference notes and worked examples are in `knowledge/<agent>/`.

| Agent | Name | Role |
|---|---|---|
| `orchestrator` | Marlow | Runs the team; the only agent that talks to the user during a build |
| `agent-builder` | Tessa | Meta agent: builds and improves the agents, skills and knowledge |
| `software-architect` | Ines | Structure, contracts, decisions, build plan |
| `open-meteo-integrator` | Kai | Open-Meteo APIs, the forecast Function, the beach score |
| `pwa-mobile-engineer` | Juno | Manifest, service worker, offline, install on iOS and Android |
| `security-engineer` | Rook | Auth, secrets, allow-list, rate limits; reviews all security-relevant work |
| `agent-console-engineer` | Ada | Claude chat and GitHub commits from Netlify Functions |
| `ui-designer-apple-liquid-glass` | Sable | Visual design: Liquid Glass tokens, type, colour, dark mode |
| `ux-designer-apple-hig` | Wren | Flows, navigation, copy, states (Apple HIG) |
| `qa-engineer` | Pike | Unit, function and Playwright tests, accessibility checks |
| `netlify-engineer` | Dex | `netlify.toml`, build, environment variables, Blobs, headers, deploys |
| `frontend-engineer` | Milo | Implements the screens in vanilla TypeScript and Vite |
| `technical-writer` | Nell | README, How it works, Resources, `/guide/` |

## How the team works

1. **The orchestrator runs experts in parallel.** It plans work in waves. Every expert whose inputs are ready launches at the same time (several Agent calls in one message). It waits only when one expert needs another's output, and it runs peer reviews in parallel too.
2. **Agents hand work to each other through the orchestrator.** Experts never call each other directly. Each expert returns a handoff packet (files delivered, contracts, decisions, open questions), and the orchestrator passes it to whoever needs it next.
3. **Peer review before acceptance.** Every deliverable is reviewed by at least one other expert who holds the relevant skill (`peer-review` skill format). The security engineer reviews anything touching auth, secrets, Functions or Approve.
4. **Only the orchestrator commits and pushes**, after the reviews pass and the tests run.
5. Every agent **reads its knowledge folder first** and prefers it over memory.

## Hard rules for everyone

- No secrets in the front end, in `netlify.toml` or in the repository. `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` exist only as Netlify environment variables (Functions scope).
- No rip-current proxy. Link to the National Weather Service instead (D-002).
- Approve commits straight to `main` with a fine-grained token limited to this repository (D-003, D-005). Stay within Netlify Free plan limits (D-004).
- The app is a planning aid, not a safety service. Say so in the UI.
