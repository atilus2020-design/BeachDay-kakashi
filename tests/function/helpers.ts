// Shared helpers for function tests: call handlers directly with new Request(...).
export const ORIGIN = "http://localhost:8888";
let ipCounter = 0;

export const base = () => process.env.MOCK_BASE as string;

export async function mock(method: string, path: string, body?: unknown) {
  const r = await fetch(base() + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
}
export const resetMocks = () => mock("DELETE", "/__calls");
export const setState = (s: Record<string, unknown>) => mock("POST", "/__state", s);
export const calls = (): Promise<any[]> => mock("GET", "/__calls");

export async function load(mod: string): Promise<(req: Request, ctx: any) => Promise<Response> | Response> {
  const m = await import(/* @vite-ignore */ `../../netlify/functions/${mod}`);
  return m.default;
}

export interface CallOpts {
  token?: string | null;
  json?: unknown;
  csrf?: boolean;            // default true for non-GET
  origin?: string | null;    // default same origin for non-GET
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

export async function call(handler: (req: Request, ctx: any) => Promise<Response> | Response, method: string, path: string, o: CallOpts = {}) {
  const headers: Record<string, string> = { ...(o.headers || {}) };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const write = method !== "GET";
  if (o.json !== undefined) headers["content-type"] = "application/json";
  if (write) {
    if (o.csrf !== false) headers["x-requested-with"] = "beachday";
    if (o.origin !== null) headers.origin = o.origin ?? ORIGIN;
  }
  const req = new Request(ORIGIN + path, { method, headers, body: o.json === undefined ? undefined : JSON.stringify(o.json) });
  const ctx = { ip: `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, params: o.params ?? {}, deploy: { context: "dev" }, geo: {}, requestId: `req-${ipCounter}` };
  return handler(req, ctx);
}

export interface SseEvent { event: string; data: any }
export function parseSse(text: string): SseEvent[] {
  return text.split("\n\n").filter(Boolean).map((chunk) => {
    let event = "message"; const data: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    const raw = data.join("\n");
    let parsed: any = raw; try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
    return { event, data: parsed };
  });
}

/** Chat "propose ..." as super_admin; returns the stored proposal id (from the SSE `proposal` event). */
export async function createProposal(): Promise<{ id: string; title: string }> {
  const chat = await load("agent-chat.mts");
  const res = await call(chat, "POST", "/api/agent/chat", {
    token: "tok_super_admin",
    json: { agent: "open-meteo-integrator", messages: [{ role: "user", content: "Please propose a note in docs/notes.md" }] },
  });
  if (res.status !== 200) throw new Error(`chat returned ${res.status}`);
  const ev = parseSse(await res.text()).find((e) => e.event === "proposal");
  if (!ev) throw new Error("no proposal event in chat stream");
  return ev.data;
}
