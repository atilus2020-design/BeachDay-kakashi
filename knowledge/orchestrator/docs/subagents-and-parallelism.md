# Running a subagent team — reference notes

Source: Claude Code docs, Create custom subagents — https://code.claude.com/docs/en/sub-agents (read 2026-11-26)

- "Claude uses each subagent's description to decide when to delegate tasks." Explicit invocation: `@agent-<name>`.
- Project subagents live in `.claude/agents/` (priority 3, above user agents). "Claude Code detects the change within a few seconds and the next delegation uses the updated definition, with no restart needed."
- `skills:` — "The full content of each listed skill is injected into the subagent's context at startup." Without it, a subagent can still discover skills via the Skill tool.
- "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation."
- `background: true` keeps a subagent in the background; `isolation: worktree` gives it its own git worktree (useful when two experts must edit overlapping files).
- Each subagent starts with a fresh context, so the handoff packet must carry everything it needs (paths, contracts, decisions).

## Parallelism rules for Beach Day
- Launch independent experts **in one message with several Agent calls**. That is what makes them run at the same time.
- Never give two concurrent experts the same file. Use the ownership map in `docs/expert-roster.md`.
- Wait only on true dependencies (for example, the frontend needs Sable's tokens and Wren's flow spec).
- Run reviews in parallel too: security reviews Functions while Wren and Sable review screens.
