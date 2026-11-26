import { describe, it, expect, beforeEach } from "vitest";
import { load, call, resetMocks, mock } from "./helpers.ts";

type Route = { name: string; mod: string; method: "GET" | "POST"; path: string; json?: unknown; params?: Record<string, string> };
const ROUTES: Route[] = [
  { name: "GET /api/agents", mod: "agents.mts", method: "GET", path: "/api/agents" },
  { name: "GET /api/proposals", mod: "proposals.mts", method: "GET", path: "/api/proposals" },
  { name: "GET /api/proposals/:id", mod: "proposals.mts", method: "GET", path: "/api/proposals/p_missing", params: { id: "p_missing" } },
  { name: "POST /api/agent/chat", mod: "agent-chat.mts", method: "POST", path: "/api/agent/chat", json: { agent: "open-meteo-integrator", messages: [{ role: "user", content: "hi" }] } },
  { name: "POST approve", mod: "approve.mts", method: "POST", path: "/api/proposals/p_missing/approve", json: { confirmTitle: "x" }, params: { id: "p_missing" } },
  { name: "POST reject", mod: "proposals.mts", method: "POST", path: "/api/proposals/p_missing/reject", json: {}, params: { id: "p_missing" } },
];

describe.each(ROUTES)("$name", (r) => {
  beforeEach(resetMocks);
  const run = async (o: Parameters<typeof call>[3]) => call(await load(r.mod), r.method, r.path, { json: r.json, params: r.params, ...o });

  it("401 with no token", async () => { expect((await run({})).status).toBe(401); });
  it("401 with a junk token", async () => { expect((await run({ token: "not-a-token" })).status).toBe(401); });
  it("401 with an expired token", async () => { expect((await run({ token: "tok_expired" })).status).toBe(401); });
  it("401 with a signed-out session", async () => { expect((await run({ token: "tok_signed_out" })).status).toBe(401); });
  it("403 for a plain user", async () => {
    const res = await run({ token: "tok_user" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });
  it("503 (never 200) when Supabase is down", async () => {
    await mock("POST", "/__mode", { mode: "supabase-down" });
    const res = await run({ token: "tok_super_admin" });
    expect(res.status).toBe(503);
  });
  it("never reflects a role claimed by the client", async () => {
    const res = await run({ token: "tok_user", headers: { "x-role": "super_admin" } });
    expect(res.status).toBe(403);
  });
  it("sends Cache-Control: no-store on errors", async () => {
    const res = await run({});
    expect(res.headers.get("cache-control") || "").toContain("no-store");
  });
  if (r.method === "POST") {
    it("403 without X-Requested-With", async () => { expect((await run({ token: "tok_super_admin", csrf: false })).status).toBe(403); });
    it("403 with a foreign Origin", async () => { expect((await run({ token: "tok_super_admin", origin: "https://evil.example" })).status).toBe(403); });
    it("403 with no Origin header", async () => { expect((await run({ token: "tok_super_admin", origin: null })).status).toBe(403); });
  }
});
