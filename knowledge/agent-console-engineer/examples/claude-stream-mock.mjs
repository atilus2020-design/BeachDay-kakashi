// Example 1 — stream a Claude reply with the official SDK, relayed as SSE lines,
// against a local mock of POST /v1/messages (no API key or network needed).
// Run: npm install && node claude-stream-mock.mjs
import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const events = [
  ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Sunny with " } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "light winds." } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 6 } }],
  ["message_stop", { type: "message_stop" }],
];
const server = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const r = JSON.parse(body);
    if (req.url !== "/v1/messages" || !r.stream || !r.system) { res.writeHead(400).end(); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const [e, d] of events) res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
    res.end();
  });
});
await new Promise((r) => server.listen(0, r));
const client = new Anthropic({ apiKey: "test-key", baseURL: `http://127.0.0.1:${server.address().port}` });

const out = [];                                   // what the Netlify Function would send to the browser
const send = (event, data) => out.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const stream = client.messages.stream({
  model: "claude-opus-5-5", max_tokens: 1024, system: "You are Kai, the Open-Meteo expert.",
  messages: [{ role: "user", content: "Beach weather?" }], output_config: { effort: "low" },
});
stream.on("text", (t) => send("text", t));
const final = await stream.finalMessage();
send("done", { stop_reason: final.stop_reason, usage: final.usage });
console.log(out.join(""));
server.close();
if (final.stop_reason !== "end_turn" || out.length !== 3) process.exit(1);
