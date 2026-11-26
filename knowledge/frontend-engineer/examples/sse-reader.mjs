// Example 1 — read a POST server-sent-event stream (EventSource can't POST). Works in browsers and Node 18+.
// Run: node sse-reader.mjs
export async function readSSE(response, onEvent) {
  const reader = response.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2);
      let event = "message", data = "";
      for (const line of raw.split("\n")) { if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
      onEvent(event, data ? JSON.parse(data) : null);
    }
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const chunks = ['event: text\ndata: "Sunny "\n\nevent: te', 'xt\ndata: "today."\n\n', 'event: done\ndata: {"stop_reason":"end_turn"}\n\n'];
  const body = new ReadableStream({ start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); } });
  let text = ""; let done = null;
  await readSSE(new Response(body), (e, d) => { if (e === "text") text += d; if (e === "done") done = d; });
  console.log(JSON.stringify({ text, done }));               // event split across chunks is reassembled
  if (text !== "Sunny today." || done?.stop_reason !== "end_turn") process.exit(1);
}
