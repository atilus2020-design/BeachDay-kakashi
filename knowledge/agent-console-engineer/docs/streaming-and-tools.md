# Streaming and tool use — reference notes

Sources: https://platform.claude.com/docs/en/build-with-claude/streaming.md · https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md

## Streaming (server-sent events)
- Order: `message_start` → for each block, `content_block_start`, then `content_block_delta` (`text_delta` | `input_json_delta` | `thinking_delta`), then `content_block_stop` → `message_delta` (`stop_reason`, `usage`) → `message_stop`. `ping` can appear anywhere.
- Errors can arrive mid-stream: `event: error` / `{"type":"error","error":{"type":"overloaded_error"}}`. "If you use the SDK… the code that reads the stream gets an error instead."
- TypeScript SDK:
  ```ts
  const stream = client.messages.stream({ model, max_tokens, messages });
  stream.on("text", (t) => send(t));
  const final = await stream.finalMessage();
  ```

## Tool use
- Tool definition: `{ name, description, input_schema, strict? }`. "Add `strict: true` … to ensure Claude's tool calls always match your schema exactly."
- Loop: the response has `stop_reason: "tool_use"` and `tool_use` blocks → run the tools → send **one** user message containing every `tool_result` (`tool_use_id`, `content`, and `is_error: true` on failure).
- Client tools run in your code; server tools (`web_search`, `code_execution`…) run at Anthropic.
- Pricing: the tools' definitions count as input tokens, and the API adds a tool-use system prompt (about 286 tokens on Opus 5.5 with auto/none).

## Beach Day usage
- Chat: `/api/agent/chat` streams text only, at low effort, with `max_tokens` bounded so a turn finishes well under Netlify's 60 s.
- Proposals: a `propose_change` tool (strict schema: title, summary, files[{path, action, content}]). The server validates paths and stores the proposal, and nothing is committed until a human clicks Approve.
