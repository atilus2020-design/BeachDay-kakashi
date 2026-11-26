import { describe, it, expect, beforeEach } from "vitest";
import { load, call, resetMocks, setState, calls, createProposal } from "./helpers.ts";

const ADMIN = { token: "tok_super_admin" };

describe("proposals", () => {
  beforeEach(resetMocks);

  it("a proposal made in chat appears in the list and detail with a diff", async () => {
    const { id, title } = await createProposal();
    const h = await load("proposals.mts");

    const list: any = await (await call(h, "GET", "/api/proposals", ADMIN)).json();
    const row = list.proposals.find((p: any) => p.id === id);
    expect(row).toMatchObject({ title, status: "pending", agent: "open-meteo-integrator", fileCount: 1 });
    expect(row.createdBy.email).toBe("admin@beachday.test");

    const res = await call(h, "GET", `/api/proposals/${id}`, { ...ADMIN, params: { id } });
    expect(res.status).toBe(200);
    const p: any = await res.json();
    expect(p.files).toEqual([{ path: "docs/notes.md", action: "update" }]);
    expect(p.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(p.diff).toContain("docs/notes.md");
    expect(p.diff).toContain("+QA was here.");
  });
  it("filters by status and rejects a bad status", async () => {
    const h = await load("proposals.mts");
    expect((await call(h, "GET", "/api/proposals?status=bogus", ADMIN)).status).toBe(400);
    const { id } = await createProposal();
    const approved: any = await (await call(h, "GET", "/api/proposals?status=approved", ADMIN)).json();
    expect(approved.proposals.some((p: any) => p.id === id)).toBe(false);
    const all: any = await (await call(h, "GET", "/api/proposals?status=all", ADMIN)).json();
    expect(all.proposals.some((p: any) => p.id === id)).toBe(true);
  });
  it("404 for an unknown proposal", async () => {
    const h = await load("proposals.mts");
    expect((await call(h, "GET", "/api/proposals/p_nope", { ...ADMIN, params: { id: "p_nope" } })).status).toBe(404);
  });
  it("reject marks it rejected, then 409 on a second decision", async () => {
    const { id } = await createProposal();
    const h = await load("proposals.mts");
    const res = await call(h, "POST", `/api/proposals/${id}/reject`, { ...ADMIN, params: { id }, json: { reason: "not now" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "rejected" });
    const p: any = await (await call(h, "GET", `/api/proposals/${id}`, { ...ADMIN, params: { id } })).json();
    expect(p.status).toBe("rejected"); expect(p.rejectReason).toBe("not now"); expect(p.decidedBy.email).toBe("admin@beachday.test");
    expect((await call(h, "POST", `/api/proposals/${id}/reject`, { ...ADMIN, params: { id }, json: {} })).status).toBe(409);
    expect((await calls()).filter((c) => c.path.startsWith("/github") && c.method !== "GET")).toHaveLength(0);
  });
  it("reject 404 for an unknown proposal and 400 for an over-long reason", async () => {
    const h = await load("proposals.mts");
    expect((await call(h, "POST", "/api/proposals/p_nope/reject", { ...ADMIN, params: { id: "p_nope" }, json: {} })).status).toBe(404);
    const { id } = await createProposal();
    expect((await call(h, "POST", `/api/proposals/${id}/reject`, { ...ADMIN, params: { id }, json: { reason: "x".repeat(501) } })).status).toBe(400);
  });
});

describe("POST /api/proposals/:id/approve", () => {
  beforeEach(resetMocks);
  const approve = async (id: string, o: Record<string, unknown> = {}) => call(await load("approve.mts"), "POST", `/api/proposals/${id}/approve`, { ...ADMIN, params: { id }, ...o });

  it("400 when the confirm title is wrong, and nothing is written", async () => {
    const { id } = await createProposal();
    await resetMocks(); // createProposal itself reads GitHub (head + blob); count only what approve does
    const res = await approve(id, { json: { confirmTitle: "wrong title" } });
    expect(res.status).toBe(400);
    expect((await calls()).filter((c) => c.path.startsWith("/github"))).toHaveLength(0);
  });
  it("400 for a missing confirm title", async () => {
    const { id } = await createProposal();
    expect((await approve(id, { json: {} })).status).toBe(400);
  });
  it("404 for an unknown proposal", async () => {
    expect((await approve("p_nope", { json: { confirmTitle: "x" } })).status).toBe(404);
  });
  it("commits via ref -> commit -> trees -> commits -> PATCH ref (force:false) exactly once", async () => {
    const { id, title } = await createProposal();
    await resetMocks(); // clears call log + mock state; proposals live in the in-memory Blobs fake
    const res = await approve(id, { json: { confirmTitle: title } });
    expect(res.status).toBe(200);
    const b: any = await res.json();
    expect(b).toMatchObject({ status: "approved", deploy: "started", commit: { sha: expect.stringMatching(/^[0-9a-f]{40}$/) } });

    const gh = (await calls()).filter((c) => c.path.startsWith("/github/repos/atilus2020-design/BeachDay-kakashi/"));
    const seq = gh.map((c) => `${c.method} ${c.path.split("/BeachDay-kakashi/")[1].replace(/\/commits\/[0-9a-f]+$/, "/commits/:sha")}`);
    const want = ["GET git/ref/heads/main", "GET git/commits/:sha", "POST git/trees", "POST git/commits", "PATCH git/refs/heads/main"];
    let at = -1; for (const w of want) { const i = seq.indexOf(w, at + 1); expect(i, `${w} missing/out of order in ${seq.join(", ")}`).toBeGreaterThan(at); at = i; }
    expect(seq.filter((s) => s === "PATCH git/refs/heads/main")).toHaveLength(1);
    expect(gh.every((c) => c.headers.authorization === "Bearer test-token")).toBe(true);
    const tree = gh.find((c) => c.method === "POST" && c.path.endsWith("git/trees"))!.body;
    expect(tree.tree[0]).toMatchObject({ path: "docs/notes.md", mode: "100644", type: "blob" });
    const patch = gh.find((c) => c.method === "PATCH")!.body;
    expect(patch.force).toBe(false); expect(patch.sha).toBe(b.commit.sha);
    const commitBody = gh.find((c) => c.method === "POST" && c.path.endsWith("git/commits"))!.body;
    expect(commitBody.parents).toHaveLength(1);

    // a second approve is refused and writes nothing more
    const again = await approve(id, { json: { confirmTitle: title } });
    expect(again.status).toBe(409);
    expect((await calls()).filter((c) => c.method === "PATCH")).toHaveLength(1);
  });
  it("two concurrent approves produce one commit", async () => {
    const { id, title } = await createProposal();
    const [a, b] = await Promise.all([approve(id, { json: { confirmTitle: title } }), approve(id, { json: { confirmTitle: title } })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await calls()).filter((c) => c.method === "PATCH")).toHaveLength(1);
  });
  it("409 when main moved and a touched file changed", async () => {
    const { id, title } = await createProposal();
    await setState({ head: "2222222222222222222222222222222222222222", files: { "docs/notes.md": "# Notes\n\nsomeone else edited\n" } });
    const res = await approve(id, { json: { confirmTitle: title } });
    expect(res.status).toBe(409);
    expect((await calls()).filter((c) => c.method === "PATCH" || c.path.endsWith("git/commits") && c.method === "POST")).toHaveLength(0);
  });
  it("still commits when main moved but no touched file changed", async () => {
    const { id, title } = await createProposal();
    await setState({ head: "3333333333333333333333333333333333333333" });
    expect((await approve(id, { json: { confirmTitle: title } })).status).toBe(200);
  });
  it("503 when GITHUB_TOKEN is not set (Deploy Previews)", async () => {
    const { id, title } = await createProposal();
    await resetMocks();
    const saved = process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKEN;
    try {
      const res = await approve(id, { json: { confirmTitle: title } });
      expect(res.status).toBe(503);
      expect((await calls()).filter((c) => c.path.startsWith("/github"))).toHaveLength(0);
    } finally { process.env.GITHUB_TOKEN = saved; }
  });
  it("never leaks the GitHub token in error bodies", async () => {
    const { id, title } = await createProposal();
    await setState({ githubStatus: 500 });
    const res = await approve(id, { json: { confirmTitle: title } });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await res.text()).not.toContain("test-token");
  });
});
