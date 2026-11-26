// POST /api/agent/chat → text/event-stream (build-plan §3.2, §3.4; doc 04 §4.3).
// Events: text (string) · tool {name, path?} · proposal {id, title} · done {stop_reason} | error {message}.
import Anthropic from "@anthropic-ai/sdk";
import type { Config, Context } from "@netlify/functions";
import { requireRole } from "./_lib/auth.ts";
import { getAgent } from "./_lib/agents.ts";
import { audit, auditDenied } from "./_lib/audit.ts";
import { checkAndReserveTurn, recordTokens } from "./_lib/budget.ts";
import { runChatTurn } from "./_lib/claude.ts";

const MAX_BODY_BYTES = 100 * 1024;
const MAX_MESSAGES = 30;
const DEADLINE_MS = 50_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const bad = () => json(400, { error: "Invalid request" });

type Msg = { role: "user" | "assistant"; content: string };
function validMessages(m: unknown): m is Msg[] {
  if (!Array.isArray(m) || m.length === 0 || m.length > MAX_MESSAGES) return false;
  for (const x of m) {
    if (!x || typeof x !== "object") return false;
    const { role, content } = x as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.trim() === "") return false;
    if (Object.keys(x).some((k) => k !== "role" && k !== "content")) return false;
  }
  return m[0].role === "user" && m[m.length - 1].role === "user";
}

export default async (req: Request, ctx: Context) => {
  const g = await requireRole(req, ctx, "super_admin", { methods: ["POST"] });
  if (!g.ok) {
    await auditDenied(ctx, req, g.response.status);
    return g.response;
  }
  const user = g.user;

  // Body: ≤ 100 KB, JSON, fixed schema. Any role/userId fields are ignored (R5).
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: "Request too large" });
  let raw: ArrayBuffer;
  try {
    raw = await req.arrayBuffer();
  } catch {
    return bad();
  }
  if (raw.byteLength > MAX_BODY_BYTES) return json(413, { error: "Request too large" });
  let body: any;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return bad();
  }
  if (!body || typeof body !== "object" || typeof body.agent !== "string" || !validMessages(body.messages)) return bad();
  const agent = getAgent(body.agent);
  if (!agent) return json(404, { error: "Unknown agent" });
  const messages: Msg[] = body.messages.map((m: Msg) => ({ role: m.role, content: m.content }));

  try {
    if (!(await checkAndReserveTurn(user.id))) {
      await audit(ctx, user, "denied", "/api/agent/chat", { status: 429, reason: "budget" });
      return json(429, { error: "Too many requests" });
    }
  } catch {
    return json(500, { error: "Something went wrong" });
  }

  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), DEADLINE_MS);
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      const usage = { tokens: 0 }; // filled by every round, even one cut off by abort or an error
      let outcome = "error";
      try {
        const r = await runChatTurn(messages, { agent, user, ctx, signal: abort.signal, deadline: started + DEADLINE_MS, usage }, {
          text: (t) => send("text", t),
          tool: (info) => send("tool", info),
          proposal: (p) => send("proposal", p),
        });
        outcome = r.stop_reason;
        send("done", { stop_reason: r.stop_reason });
      } catch (e) {
        if (abort.signal.aborted) {
          outcome = "timeout";
          send("error", { message: "The agent ran out of time. Try a narrower question." });
        } else if (e instanceof Anthropic.RateLimitError) {
          outcome = "rate_limited";
          const ra = Number(e.headers?.get?.("retry-after"));
          send("error", { message: "The agent is busy, please retry.", ...(Number.isFinite(ra) && ra > 0 ? { retryAfter: Math.ceil(ra) } : {}) });
        } else {
          console.error("agent-chat failed", e instanceof Anthropic.APIError ? `status ${e.status}` : (e as Error)?.name ?? "error");
          send("error", { message: "Agent unavailable, please retry." });
        }
      } finally {
        clearTimeout(timer);
        try {
          await recordTokens(user.id, usage.tokens);
        } catch {
          /* budget write failure must not break the stream */
        }
        await audit(ctx, user, "chat", agent.name, { tokens: usage.tokens, outcome, ms: Date.now() - started });
        open = false;
        try {
          controller.close(); // close last, so the bookkeeping runs before the platform freezes the Function
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort(); // browser went away: stop calling Claude
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
};

export const config: Config = {
  path: "/api/agent/chat",
  method: ["POST"],
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
