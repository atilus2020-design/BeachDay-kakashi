# Example 1 — a wave plan (feature: "show water temperature on day buttons")

| Wave | Expert (parallel within a wave) | Task | Inputs | Outputs | Reviewer |
|---|---|---|---|---|---|
| 1 | open-meteo-integrator | Add `waterF` to `DayScore` + tests | fixtures | `src/scoring/*`, contract note | qa-engineer |
| 1 | ux-designer-apple-hig | Copy and placement for water temp | flow spec | `docs/ux/copy.md` diff | ui-designer |
| 2 | frontend-engineer | Render `waterF` on day buttons | wave-1 packets | `src/pages/home.ts` | ux + ui designers |
| 3 | qa-engineer · ux-designer · ui-designer (parallel reviews) | Test + review | wave-2 packet | verdicts | — |
| 4 | orchestrator | Run tests, commit, push, report | verdicts | commit | — |

Wave 1 runs **two experts at once**. Wave 2 waits only because it needs both wave-1 outputs.
