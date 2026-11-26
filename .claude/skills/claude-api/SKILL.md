---
name: claude-api
description: "Call the Claude Messages API from Netlify Functions for the Agent Console: models, streaming, tool use, refusals, rate limits and cost. Use for any Claude API code or model choice."
---
# Claude API (from Functions only)

- SDK: `@anthropic-ai/sdk`; `new Anthropic()` reads `ANTHROPIC_API_KEY` (and `ANTHROPIC_BASE_URL` for test mocks).
- Models: `claude-opus-5-5` (default, $4/$20 per MTok), `claude-sonnet-5-5` ($2/$10), `claude-haiku-5-5`. Map agent frontmatter `opus|sonnet|haiku` to these; `inherit`/missing → opus.
- Opus/Sonnet 5.5: omit `thinking` (never `disabled`); use `output_config: { effort: "low"|"medium"|"high" }`; forced `tool_choice` any/tool returns 400 → `auto` + `strict: true`; no prefill; no temperature/top_p/top_k.
- Stream: `client.messages.stream({...}).on("text", fn)`; `await stream.finalMessage()`; errors mid-stream arrive as exceptions.
- Tool loop: on `stop_reason === "tool_use"`, run tools, return all `tool_result` blocks (with `tool_use_id`, `is_error` on failure) in one user message.
- Check `stop_reason === "refusal"`. 429 → honour `retry-after`. Set a workspace spend limit.
- Bound `max_tokens` so a chat turn ends within Netlify's 60 s.
