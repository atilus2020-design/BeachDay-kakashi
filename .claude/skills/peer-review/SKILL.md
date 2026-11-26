---
name: peer-review
description: "Review another expert's work for Beach Day and return a verdict. Use whenever the orchestrator asks you to review a deliverable."
---
# Peer review

## Checklist
1. **Correct:** does it do what the handoff says? Run the tests or examples if you can.
2. **Contracts:** matches the agreed file paths, JSON shapes, endpoints and tokens.
3. **Decisions:** consistent with `docs/decisions.md` (D-001…), and with `docs/` 01–05.
4. **Security:** no secret in front-end code; auth checked in every protected Function; inputs validated.
5. **Accessibility and mobile:** text labels with colour; 44 px targets; works at 375 px wide.
6. **Simple:** no needless dependency or abstraction.

## Verdict format
```
REVIEWER: <agent>   SUBJECT: <deliverable>
VERDICT: APPROVE | APPROVE WITH NITS | CHANGES REQUIRED
FINDINGS:
- [blocker|major|nit] path:line — problem → suggested fix
```
Only blockers and majors stop acceptance. Never edit the files under review; report findings.
