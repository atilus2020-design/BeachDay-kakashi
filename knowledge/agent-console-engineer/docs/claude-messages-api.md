# Claude Messages API — reference notes

Sources (read 2026-11-26):
- https://platform.claude.com/docs/en/api/messages/create.md
- https://platform.claude.com/docs/en/about-claude/models/overview.md
- https://platform.claude.com/docs/en/api/rate-limits.md

## Request
- `POST /v1/messages`. The SDK `@anthropic-ai/sdk` sets the auth and `anthropic-version` headers. `new Anthropic()` reads `ANTHROPIC_API_KEY`, and `baseURL` / `ANTHROPIC_BASE_URL` can point it at a mock.
- Required: `model`, `max_tokens`, `messages` (`[{role: "user"|"assistant", content}]`). Optional: `system` (string or text blocks), `tools`, `tool_choice`, `output_config: { effort, format }`.
- Stop reasons: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `model_context_window_exceeded`.
- `usage` fields: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and others.

## Models (overview page)
| Model | API ID | $/MTok in/out | Default effort | Thinking |
|---|---|---|---|---|
| Claude Fable 5.2 | `claude-fable-5-2` | 8 / 40 | high | adaptive, always on |
| Claude Opus 5.5 | `claude-opus-5-5` | 4 / 20 | medium | adaptive, always on |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 / 10 | high | adaptive |
| Claude Haiku 5.5 | `claude-haiku-5-5` | from 0.10 / 0.50 | medium | adaptive |

All have a 1M-token context window and 128K max output. "If you're unsure which model to use, start with Claude Opus 5.5."

Beach Day mapping of agent `model:` values: `opus`/`inherit` → `claude-opus-5-5`, `sonnet` → `claude-sonnet-5-5`, `haiku` → `claude-haiku-5-5`.

## Gotchas for Opus 5.5 and Sonnet 5.5
- Don't send `thinking: {type:"disabled"}` (400 on Opus 5.5). Control depth with `output_config.effort`.
- Forced `tool_choice` `{type:"any"}` or `{type:"tool"}` returns 400. Use `auto` + `strict: true` + prompt instructions.
- No assistant prefill; no `temperature`/`top_p`/`top_k`.
- Always check `stop_reason === "refusal"` before reading content.

## Rate limits
- Measured as RPM, ITPM and OTPM. A 429 says which limit was hit; wait `retry-after` seconds when present ("Not every 429 carries it; the spend-cap 429 never does").
- Headers: `anthropic-ratelimit-requests-remaining`, `-tokens-remaining`, `-input-tokens-*`, `-output-tokens-*`.
