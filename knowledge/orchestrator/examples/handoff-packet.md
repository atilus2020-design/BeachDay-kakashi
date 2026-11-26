# Example 2 — a handoff packet (passed by the orchestrator, never expert-to-expert)

```
FROM: open-meteo-integrator   TO: frontend-engineer   WAVE: 1 → 2
DELIVERED: src/scoring/score.ts (scoreWeek now returns waterF), tests/scoring.test.ts (+3 cases, all passing)
CONTRACTS: DayScore.waterF: number | null  (°F, rounded; null when marine data missing)
DECISIONS: SST arrives in °C from the Marine API; converted in scoring (knowledge/open-meteo-integrator/docs/marine-api.md)
OPEN: Should water temp show on days 4–7 (lower confidence)? → ux-designer to decide
```
