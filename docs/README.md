# Beach Day — research docs

Background research for **Beach Day**: an installable, mobile-first web app (a PWA) hosted on Netlify. You pick a South Florida beach and it tells you whether today and the next few days are good beach days. The data comes from the free Open-Meteo Forecast and Marine APIs. The app also has an **Agents page** (the Agent Console), where the team's Claude agents (`.claude/agents/*.md`) can chat and propose code changes. A change is committed to GitHub only after a human clicks Approve. Sign-in uses **Supabase Auth** (email + password or Google), and only a `super_admin` can open the Agents page, chat or Approve.

These docs give context to the expert agents who will build the app. Each file covers one topic, cites official sources, and ends with open questions or decisions.

| # | Doc | What it answers |
|---|-----|-----------------|
| 1 | [01-beach-day-scoring.md](01-beach-day-scoring.md) | The use case, which Open-Meteo fields to request, how to turn them into a 0–100 "beach score" with hard safety vetoes, plus the beach list and API terms |
| 2 | [02-pwa-installability.md](02-pwa-installability.md) | What makes a PWA installable on iPhone and Android, the manifest and service worker plan, and when a native wrapper (Capacitor) would be needed instead |
| 3 | [03-architecture.md](03-architecture.md) | A static Netlify site plus Netlify Functions and Supabase Auth: diagram, folder layout, caching, environment variables and platform limits |
| 4 | [04-agent-console.md](04-agent-console.md) | The Agent Console: listing agents, chat through a function, propose → approve → commit → redeploy, the security model, and long jobs within Netlify's time limits. Its password gate (§4.5.2) is superseded by D-006 |
| 5 | [05-testing-accessibility.md](05-testing-accessibility.md) | Test strategy (unit, contract, function, end-to-end, PWA) and accessibility requirements (WCAG 2.2 AA) |
| — | [decisions.md](decisions.md) | **Decision records** D-001 to D-008: PWA on Netlify, no rip proxy, Approve → `main`, Free plan, fine-grained token, Supabase Auth, roles in `profiles` with RLS, URL + publishable key only with token and role checked in every Function |
| — | [build-plan.md](build-plan.md) | **The build plan:** waves of parallel experts, handoff inputs and outputs, peer reviewers, the endpoint contracts and JSON shapes, the final file tree, local testing with mock upstreams, and risks |
| — | [security.md](security.md) | Security model and threat model for Supabase Auth, roles, secrets, the allow-list and Approve (owned by security-engineer) |
| — | [expert-roster.md](expert-roster.md) | The agent team: roles, skills, which agents share each skill, and the ownership map |
| — | [agent-brains.md](agent-brains.md) | Each agent's model, name and personality, and why that model |

## Decisions at a glance

- **Ship a PWA, not a native app.** Nothing in the feature set needs a native wrapper. Capacitor is the fallback if App Store presence or background native features become requirements (doc 2).
- **Static frontend plus thin Netlify Functions.** The browser never holds a secret. Forecast calls go through a caching proxy function, so we stay well inside Open-Meteo's free limits (docs 1 and 3).
- **The score is advisory, not a safety device.** Thunderstorms veto a day outright. Rip-current risk is not in Open-Meteo, so the app links to the official NWS Surf Zone Forecast (doc 1).
- **Real accounts, one powerful role.** Supabase Auth handles sign-up, login, logout, password reset and Google sign-in. Roles live in a `profiles` table protected by RLS, so nobody can change their own role. Only a hand-assigned `super_admin` passes the token and role check that every protected Function runs. Only the Supabase URL and publishable key are used, never the secret key (D-006 to D-008).
- **Agents propose and humans dispose.** The Claude key and the GitHub token live only in Function environment variables. Proposals are checked against a path allow-list on the server before they are stored and again before they are committed. A commit to `main` triggers Netlify's normal Git-based deploy (doc 4).
- **Interactive chat streams within the 60-second limit** for synchronous functions. Long agent work in background functions (up to 15 minutes, job state in Blobs) is designed in doc 4 but deferred for v1 (build-plan §1).

## Key platform numbers (checked November 2026)

| Platform | Limit | Source |
|----------|-------|--------|
| Open-Meteo (free, non-commercial) | 600 calls/min, 5,000/hour, 10,000/day, 300,000/month; CC BY 4.0 attribution required | https://open-meteo.com/en/terms |
| Open-Meteo Forecast | `forecast_days` default 7, max 16 | https://open-meteo.com/en/docs |
| Open-Meteo Marine | `forecast_days` default 5, max 8 per the parameter table | https://open-meteo.com/en/docs/marine-weather-api |
| Netlify synchronous function | 60 s, not configurable | https://docs.netlify.com/build/functions/configuration/ |
| Netlify streaming function | 60 s, 20 MB response | https://docs.netlify.com/build/functions/api/ |
| Netlify background function | 15 min; empty 202 returned at once; retries after 1 min, then 2 min | https://docs.netlify.com/build/functions/background-functions/ |
| Netlify scheduled function | 30 s | https://docs.netlify.com/build/functions/scheduled-functions/ |
| Netlify Blobs | Eventually consistent by default (up to 60 s); `consistency: "strong"` available | https://docs.netlify.com/build/data-and-storage/netlify-blobs/ |
| Supabase Free plan | Projects are paused after 1 week of inactivity; 2 active projects | https://supabase.com/pricing |
| Supabase Auth email (built-in provider) | 2 emails per hour; raise it with custom SMTP | https://supabase.com/docs/guides/auth/rate-limits |
| Claude API default model | `claude-opus-5-5` ($4 / $20 per million tokens), adaptive thinking always on, default effort `medium` | https://platform.claude.com/docs/en/about-claude/models/overview.md |

## Source note

The Open-Meteo listing came from the "Vibe Coding API Directory" (https://mcp-api.netlify.app/). Every fact in these docs comes from the providers' own documentation, linked in each file. The directory itself is not cited as a source.
