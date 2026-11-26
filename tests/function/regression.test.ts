// Regression tests for controls found by security review (Rook): tampered proposals, tool path
// refusal, budget, CSRF on decisions, token accounting on failed turns.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { call, load, createProposal, resetMocks, setState, calls, parseSse } from "./helpers.ts";
import { store, today, resetMemoryStores } from "../../netlify/functions/_lib/blobs.ts";

const ADMIN = { token: "tok_super_admin" };
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";

/** Runs one chat turn whose Claude replies are scripted; returns SSE events and the Anthropic requests. */
async function scriptedChat(script: unknown[], message = "go") {
  await setState({ script });
  const chat = await load("agent-chat.mts");
  const res = await call(chat, "POST", "/api/agent/chat", { ...ADMIN, json: { agent: "open-meteo-integrator", messages: [{ role: "user", content: message }] } });
  const status = res.status;
  const events = status === 200 ? parseSse(await res.text()) : [];
  const anthropic = (await calls()).filter((c) => c.path === "/anthropic/v1/messages");
  return { status, events, anthropic, res };
}
/** tool_result blocks the function sent back to Claude in the follow-up request. */
const toolResults = (anthropic: any[]): any[] => {
  const last = anthropic[1]?.body?.messages?.at(-1)?.content;
  return Array.isArray(last) ? last.filter((b: any) => b.type === "tool_result") : [];
};
const proposalCount = async () => (await store("proposals").list({ prefix: "proposal/" })).blobs.length;

beforeEach(async () => { await resetMocks(); });

describe("approve re-validates a tampered stored proposal (complete mediation)", () => {
  for (const bad of ["netlify.toml", "supabase/migrations/x.sql", "knowledge/x.md", "Netlify/functions/a.mts"]) {
    it(`422 for stored path ${bad}; no GitHub write; path not echoed; still pending`, async () => {
      const { id, title } = await createProposal();
      const s = store("proposals");
      const cur = await s.getWithMetadata(`proposal/${id}`, { type: "json" });
      cur!.data.files[0].path = bad;
      await s.setJSON(`proposal/${id}`, cur!.data);
      await resetMocks();
      const res = await call(await load("approve.mts"), "POST", `/api/proposals/${id}/approve`, { ...ADMIN, params: { id }, json: { confirmTitle: title } });
      expect(res.status).toBe(422);
      expect(JSON.stringify(await res.json())).not.toContain(bad);
      expect((await calls()).filter((c) => c.path.startsWith("/github") && c.method !== "GET")).toHaveLength(0);
      const after = await s.get(`proposal/${id}`, { type: "json" });
      expect(after.status).toBe("pending");
      expect(after.approving).toBeUndefined();
    });
  }
});

describe("propose_change refuses denied paths (is_error, nothing stored)", () => {
  const FUZZ = [
    "../netlify.toml", "src/../netlify.toml", "/etc/passwd", "src\\app.ts", "src/app/./x.ts", "src//x.ts", "SRC/app.ts",
    "srс/app/x.ts", ".github/workflows/x.yml", "netlify/functions/approve.mts", ".claude/agents/x.md", "package.json",
    "src/app/" + "a".repeat(300), "", "src/app/x\u0000.ts",
    "supabase/migrations/x.sql", "login/index.html", "src/lib/auth.ts", "knowledge/x.md", "netlify.toml",
  ];
  it("every fuzz path comes back as an error to the model and no proposal is stored", async () => {
    const before = await proposalCount();
    const tools = FUZZ.map((path) => ({ name: "propose_change", input: { title: "x", summary: "x", files: [{ path, action: "update", content: "x" }] } }));
    const { status, events, anthropic } = await scriptedChat([{ tools }, { text: ["done"] }]);
    expect(status).toBe(200);
    expect(events.some((e) => e.event === "proposal")).toBe(false);
    const results = toolResults(anthropic);
    expect(results).toHaveLength(FUZZ.length);
    for (const r of results) expect(r.is_error).toBe(true);
    expect(await proposalCount()).toBe(before);
    expect((await calls()).filter((c) => c.path.startsWith("/github") && c.method !== "GET")).toHaveLength(0);
  });
  it("a valid path in the same turn still works afterwards (control)", async () => {
    const before = await proposalCount();
    const { events } = await scriptedChat([{ tools: [{ name: "propose_change", input: { title: "Valid", summary: "s", files: [{ path: "docs/notes.md", action: "update", content: "# Notes\n\nmore\n" }] } }] }, { text: ["done"] }]);
    expect(events.some((e) => e.event === "proposal")).toBe(true);
    expect(await proposalCount()).toBe(before + 1);
  });
});

describe("read_file / list_files refuse secret and unsafe paths", () => {
  const BAD = [".env", "a/.env.local", "tests/mocks/test.env", "x/id_rsa", ".npmrc", "k.PEM", ".git/config", "node_modules/a", "dist/x", ".netlify/state.json", "../x", "a//b", "/etc/passwd", "src\\x"];
  it("read_file errors for each and never contacts GitHub", async () => {
    const { anthropic } = await scriptedChat([{ tools: BAD.map((path) => ({ name: "read_file", input: { path } })) }, { text: ["done"] }]);
    const results = toolResults(anthropic);
    expect(results).toHaveLength(BAD.length);
    for (const r of results) expect(r.is_error).toBe(true);
    expect((await calls()).filter((c) => c.path.includes("/contents"))).toHaveLength(0);
  });
  it("list_files errors for secret directories", async () => {
    const dirs = ["node_modules", "dist", ".netlify", ".git", "../x", "a//b"];
    const { anthropic } = await scriptedChat([{ tools: dirs.map((dir) => ({ name: "list_files", input: { dir } })) }, { text: ["done"] }]);
    for (const r of toolResults(anthropic)) expect(r.is_error).toBe(true);
    expect((await calls()).filter((c) => c.path.includes("/contents"))).toHaveLength(0);
  });
  it("list_files on the root hides .env and *.pem names but shows normal files", async () => {
    const { anthropic } = await scriptedChat([{ tools: [{ name: "list_files", input: { dir: "" } }] }, { text: ["done"] }]);
    const [r] = toolResults(anthropic);
    expect(r.is_error).not.toBe(true);
    const names = JSON.parse(r.content).entries.map((e: any) => e.name);
    expect(names).toContain("README.md");
    expect(names).not.toContain(".env");
    expect(names).not.toContain("key.pem");
  });
  it("read_file works for a normal file (control)", async () => {
    const { anthropic } = await scriptedChat([{ tools: [{ name: "read_file", input: { path: "docs/notes.md" } }] }, { text: ["done"] }]);
    const [r] = toolResults(anthropic);
    expect(r.is_error).not.toBe(true);
    expect(r.content).toContain("# Notes");
  });
});

describe("daily budget", () => {
  const saved = { turns: process.env.DAILY_CHAT_LIMIT, tokens: process.env.DAILY_TOKEN_LIMIT };
  beforeEach(() => resetMemoryStores());
  afterEach(() => {
    for (const [k, v] of [["DAILY_CHAT_LIMIT", saved.turns], ["DAILY_TOKEN_LIMIT", saved.tokens]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    resetMemoryStores();
  });
  const ask = async () => call(await load("agent-chat.mts"), "POST", "/api/agent/chat", { ...ADMIN, json: { agent: "open-meteo-integrator", messages: [{ role: "user", content: "hi" }] } });

  it("turn limit: the second chat is 429 and Claude is not called", async () => {
    process.env.DAILY_CHAT_LIMIT = "1";
    const first = await ask(); expect(first.status).toBe(200); await first.text();
    await resetMocks();
    const second = await ask();
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: "Daily chat limit reached" });
    expect((await calls()).filter((c) => c.path.startsWith("/anthropic"))).toHaveLength(0);
  });
  it("token limit: once tokens are used up the next chat is 429", async () => {
    process.env.DAILY_TOKEN_LIMIT = "10";
    const first = await ask(); expect(first.status).toBe(200); await first.text();
    expect((await ask()).status).toBe(429);
  });
});

describe("CSRF on decisions", () => {
  const cases = [
    { name: "approve", mod: "approve.mts", suffix: "approve", json: (t: string) => ({ confirmTitle: t }) },
    { name: "reject", mod: "proposals.mts", suffix: "reject", json: () => ({ reason: "x" }) },
  ];
  for (const c of cases) {
    it(`${c.name}: 403 without X-Requested-With, with a foreign Origin, with Sec-Fetch-Site cross-site; proposal untouched`, async () => {
      const { id, title } = await createProposal();
      await resetMocks();
      const h = await load(c.mod);
      const path = `/api/proposals/${id}/${c.suffix}`;
      const base = { ...ADMIN, params: { id }, json: c.json(title) };
      expect((await call(h, "POST", path, { ...base, csrf: false })).status).toBe(403);
      expect((await call(h, "POST", path, { ...base, origin: "https://evil.example" })).status).toBe(403);
      expect((await call(h, "POST", path, { ...base, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
      expect((await calls()).filter((x) => x.path.startsWith("/github"))).toHaveLength(0);
      const p = await store("proposals").get(`proposal/${id}`, { type: "json" });
      expect(p.status).toBe("pending");
    });
  }
});

describe("token accounting on failed turns", () => {
  beforeEach(() => resetMemoryStores());
  it("an upstream error after one tool round still records the tokens already used", async () => {
    const { events } = await scriptedChat([{ tools: [{ name: "read_file", input: { path: "docs/notes.md" } }] }, { status: 529 }]);
    expect(events.at(-1)!.event).toBe("error");
    const c = await store("budget").get(`chat/${today()}/user/${ADMIN_ID}`, { type: "json" });
    expect(c.turns).toBe(1);
    expect(c.tokens).toBeGreaterThan(0);
    const g = await store("budget").get(`chat/${today()}/global`, { type: "json" });
    expect(g.tokens).toBeGreaterThan(0);
  });
  it("a normal turn records tokens too (control)", async () => {
    const { events } = await scriptedChat([{ text: ["hello"] }]);
    expect(events.at(-1)!.event).toBe("done");
    const c = await store("budget").get(`chat/${today()}/user/${ADMIN_ID}`, { type: "json" });
    expect(c.tokens).toBeGreaterThan(0);
  });
});
