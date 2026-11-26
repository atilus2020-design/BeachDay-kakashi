import { describe, it, expect, beforeEach } from "vitest";
import { load, call, resetMocks } from "./helpers.ts";

describe("GET /api/agents", () => {
  beforeEach(resetMocks);
  it("200 for super_admin with name, model, personality and knowledge", async () => {
    const h = await load("agents.mts");
    const res = await call(h, "GET", "/api/agents", { token: "tok_super_admin" });
    expect(res.status).toBe(200);
    const { agents }: any = await res.json();
    expect(agents.length).toBeGreaterThan(5);
    const qa = agents.find((a: any) => a.name === "qa-engineer");
    expect(qa).toBeTruthy();
    expect(qa.displayName).toBe("Pike");
    expect(qa.model).toMatch(/^claude-/);
    expect(typeof qa.personality).toBe("string");
    expect(Array.isArray(qa.knowledge)).toBe(true);
    expect(qa.knowledge.length).toBeGreaterThan(0);
    expect(qa.knowledge[0]).toEqual({ path: expect.stringMatching(/^knowledge\/qa-engineer\//), title: expect.any(String) });
  });
  it("never exposes system prompts", async () => {
    const h = await load("agents.mts");
    const t = await (await call(h, "GET", "/api/agents", { token: "tok_super_admin" })).text();
    expect(t).not.toContain("Before you answer");
    expect(t).not.toMatch(/"system"/);
  });
});
