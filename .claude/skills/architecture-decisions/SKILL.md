---
name: architecture-decisions
description: "Write decision records, module boundaries, API contracts and the build plan for Beach Day. Use when choosing structure, adding a component, or recording a decision."
---
# Architecture decisions

- Decisions live in `docs/decisions.md` as `D-NNN` (context, decision, consequences). Never rewrite an accepted decision; supersede it.
- Hard constraints (D-001): static front end + Netlify Functions + Netlify Blobs; **no other servers**. Free plan (D-004).
- Contracts are written before parallel work starts: endpoint, method, auth, request JSON, response JSON, errors.
- Keep pure logic (scoring, allow-list, diff) in modules with no I/O so they are unit-testable.
- Front end never imports from `netlify/functions/`; shared pure code lives in `src/shared/`.
- Each risk gets: likelihood, impact, mitigation, owner.
- The build plan (`docs/build-plan.md`) lists waves, owners, inputs, outputs and reviewers.
