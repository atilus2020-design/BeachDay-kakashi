---
name: team-orchestration
description: "Plan and run the Beach Day expert team: split work into waves, launch independent experts in parallel, route handoffs, run peer reviews and accept work. Use when coordinating more than one expert."
---
# Team orchestration

## Wave planning
1. List deliverables. For each one, name its **owner** (see `docs/expert-roster.md` → Ownership map), **inputs** and **outputs**.
2. Build a dependency graph. A wave is every task whose inputs are ready.
3. **Launch every task in a wave at the same time** (several Agent calls in one message). Wait only for a task whose output another task needs.
4. After each wave, run **peer reviews in parallel**: each output goes to one or more reviewers who hold the matching skill. Security reviews anything touching auth, secrets, Functions or Approve.
5. Fix wave: send review findings back to the owner and re-review only what changed.

## Handoff packet (always pass this to the next expert)
```
FROM: <agent>   TO: <agent>   WAVE: n
DELIVERED: files created/changed (paths)
CONTRACTS: function signatures, endpoints, JSON shapes, CSS tokens
DECISIONS: anything decided, with doc reference
OPEN: questions or risks for the receiver
```

## Rules
- Experts never call each other directly; every handoff goes through you.
- Give each expert: its goal, owned paths, the handoff packets it depends on, and "read knowledge/<agent>/ first".
- Experts must not commit or push; you commit after reviews pass.
- Accept work only with: tests passing, review verdict APPROVE (or nits only), and docs updated.
- End with a report: who did what, which ran in parallel, and the handoffs.
