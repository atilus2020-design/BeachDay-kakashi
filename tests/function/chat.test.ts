import { describe, it, expect, beforeEach } from "vitest";
import { load, call, resetMocks, parseSse, calls, setState } from "./helpers.ts";

const msg = (content: string) => ({ agent: "open-meteo-integrator", messages: [{ role: "user", content }] });

describe("POST /api/agent/chat", () => {
  beforeEach(resetMocks);

  it("streams text events and ends with done", async () => {
    const h = await load("agent-chat.mts");
    const res = await call(h, "POST", "/api/agent/chat", { token: "tok_super_admin", json: msg("How is the beach?") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const ev = parseSse(await res.text());
    expect(ev.some((e) => e.event === "text")).toBe(true);
    expect(ev.at(-1)!.event).toBe("done");
    expect(ev.at(-1)!.data.stop_reason).toBe("end_turn");
    expect(ev.filter((e) => e.event === "done" || e.event === "error")).toHaveLength(1);
    const c = (await calls()).filter((x) => x.path === "/anthropic/v1/messages");
    expect(c).toHaveLength(1);
    expect(c[0].body.system).toBeTruthy();
    expect(c[0].body.model).toMatch(/^claude-/);
  });
  it("a propose request stores a proposal and emits a proposal event", async () => {
    const h = await load("agent-chat.mts");
    const res = await call(h, "POST", "/api/agent/chat", { token: "tok_super_admin", json: msg("Please propose a note") });
    const ev = parseSse(await res.text());
    const p = ev.find((e) => e.event === "proposal");
    expect(p?.data.id).toMatch(/^p_/);
    expect(ev.at(-1)!.event).toBe("done");
    // tool loop: first request, then a follow-up carrying the tool_result
    const c = (await calls()).filter((x) => x.path === "/anthropic/v1/messages");
    expect(c).toHaveLength(2);
    expect(JSON.stringify(c[1].body.messages.at(-1))).toContain("tool_result");
  });
  it("404 for an unknown agent", async () => {
    const h = await load("agent-chat.mts");
    const res = await call(h, "POST", "/api/agent/chat", { token: "tok_super_admin", json: { agent: "nobody", messages: [{ role: "user", content: "hi" }] } });
    expect(res.status).toBe(404);
  });
  it("400 for an invalid body", async () => {
    const h = await load("agent-chat.mts");
    for (const json of [{}, { agent: "qa-engineer", messages: [] }, { agent: "qa-engineer", messages: [{ role: "system", content: "x" }] }]) {
      const res = await call(h, "POST", "/api/agent/chat", { token: "tok_super_admin", json });
      expect(res.status).toBe(400);
    }
  });
  it("413 for an oversized body", async () => {
    const h = await load("agent-chat.mts");
    const res = await call(h, "POST", "/api/agent/chat", { token: "tok_super_admin", json: msg("a".repeat(120 * 1024)) });
    expect(res.status).toBe(413);
  });
  it("does not call Anthropic when auth fails", async () => {
    const h = await load("agent-chat.mts");
    await call(h, "POST", "/api/agent/chat", { token: "tok_user", json: msg("hi") });
    expect((await calls()).filter((x) => x.path.startsWith("/anthropic"))).toHaveLength(0);
  });
  it("upstream 429 gives an error event or generic error, never the upstream body", async () => {
    const h = await load("agent-chat.mts");
    await setState({ anthropicStatus: 429 });
    const res = await call(h, "POST", "/api/agent/chat", { token: "tok_super_admin", json: msg("hi") });
    const t = await res.text();
    expect(t).not.toContain("rate_limit_error");
    expect(t).not.toContain("test-key");
  });
});
