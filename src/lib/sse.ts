// Read a POST server-sent-event stream (EventSource cannot POST). Contract: build-plan §3.5 / §3.4.
// Works on a fetch Response; parses `event:` and `data:` lines, tolerates events split across chunks and CRLF.

export type SseHandler = (event: string, data: unknown) => void;

function parseBlock(block: string, onEvent: SseHandler): void {
  let event = "message";
  const data: string[] = [];
  for (const raw of block.split("\n")) {
    if (!raw || raw.startsWith(":")) continue; // blank or comment (keep-alive)
    const i = raw.indexOf(":");
    const field = i < 0 ? raw : raw.slice(0, i);
    let value = i < 0 ? "" : raw.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value.trim() || "message";
    else if (field === "data") data.push(value);
  }
  if (!data.length) return;
  const joined = data.join("\n");
  let parsed: unknown = joined;
  try { parsed = JSON.parse(joined); } catch { /* non-JSON payload: pass the raw string */ }
  onEvent(event, parsed);
}

/** Resolves when the stream ends. Rejects (AbortError) when the request's signal aborts. */
export async function readSse(res: Response, onEvent: SseHandler): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        parseBlock(block, onEvent);
      }
    }
    buf += decoder.decode();
    if (buf.trim()) parseBlock(buf.replace(/\r\n/g, "\n"), onEvent);
  } finally {
    reader.releaseLock();
  }
}
