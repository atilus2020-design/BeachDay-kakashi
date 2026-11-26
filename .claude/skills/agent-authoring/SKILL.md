---
name: agent-authoring
description: "Create or improve Claude Code subagents (.claude/agents/*.md), project skills (.claude/skills/*/SKILL.md) and knowledge folders. Use when adding a new expert, changing an agent's model, skills or persona, or auditing the team."
---
# Agent authoring (official Claude Code formats)

Source: https://code.claude.com/docs/en/sub-agents and https://code.claude.com/docs/en/skills

## Subagent file: `.claude/agents/<name>.md`
YAML frontmatter, then a Markdown body that becomes the system prompt.
- `name` (required; lowercase-hyphen; no `:`), `description` (required: **when** to delegate; put trigger words first)
- `model`: `opus` | `sonnet` | `haiku` | `fable` | full ID | `inherit`
- `skills`: list of skill names; **full skill content is injected at startup** (first 32 names)
- optional: `tools`, `disallowedTools`, `color` (red, blue, green, yellow, purple, orange, pink, cyan), `effort`, `maxTurns`, `memory`, `isolation: worktree`
- Edits are picked up within seconds; no restart needed.

## Skill: `.claude/skills/<skill-name>/SKILL.md`
- frontmatter `name`, `description` (key use case first; description + when_to_use is capped at 1,536 chars)
- keep under 500 lines; move detail to sibling files linked relatively
- state what to do, not the history of why

## Beach Day agent body template
1. `# <First name> — <role>` + personality paragraph
2. `## Before you answer` — read every file in `knowledge/<name>/` first; prefer it over memory
3. `## Your job` / `## You own` / `## You do not own`
4. `## How you work with the team` — handoffs go through the orchestrator
5. `## Output format`

## Knowledge folder: `knowledge/<name>/`
- `docs/`: notes from official docs, **each with its source URL**
- `examples/`: 2–3 small, correct, runnable examples. Run them before committing.

## After any change
Update `docs/expert-roster.md` and `docs/agent-brains.md` and the agent's `skills:` list together.
