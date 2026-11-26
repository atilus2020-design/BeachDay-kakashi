# Claude Code subagent and skill formats — reference notes

Sources (read 2026-11-26): https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/skills

## Subagents (`.claude/agents/<name>.md`)
- YAML frontmatter, then a Markdown body (the system prompt).
- Fields:
  - `name` (≤ 256 chars, no `:`, can't start with `-`)
  - `description` ("When Claude should delegate to this subagent")
  - `tools` / `disallowedTools`
  - `model` (`sonnet` | `opus` | `haiku` | `fable` | a full ID like `claude-opus-5-5` | `inherit`)
  - `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory` (`user|project|local`), `background`, `effort`, `isolation: worktree`
  - `color` (`red, blue, green, yellow, purple, orange, pink, cyan`), `initialPrompt`
- `skills`: "The full content of each listed skill is injected into the subagent's context at startup, up to the first 32 distinct names."
- Priority: managed > `--agents` flag > `.claude/agents/` > `~/.claude/agents/` > plugin. Edits are picked up "within a few seconds".

## Skills (`.claude/skills/<skill-name>/SKILL.md`)
- Frontmatter: `name` (defaults to the directory name), `description` (key use case first; description + `when_to_use` is truncated at **1,536 chars**), optional `when_to_use`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `context: fork` + `agent`, `paths`.
- "Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files." Link them relatively, as in `[reference.md](reference.md)`.
- Descriptions load into context; the body loads only when invoked (progressive disclosure). For preloaded subagent skills, the full body loads at startup, so keep it tight.
- Quote YAML values that contain `: ` (a colon followed by a space), or the frontmatter won't parse.
