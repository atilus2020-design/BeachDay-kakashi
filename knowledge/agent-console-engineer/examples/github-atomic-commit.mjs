// Example 2 — Approve: one atomic commit to main via the Git Data API, with a stale check,
// run against an in-process mock of the GitHub REST API. Run: node github-atomic-commit.mjs
import http from "node:http";

export async function commitFiles({ api, repo, token, files, message, baseSha }) {
  const gh = async (method, path, body) => {
    const r = await fetch(`${api}/repos/${repo}${path}`, { method, body: body && JSON.stringify(body), headers: {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "beach-day", "Content-Type": "application/json" } });
    if (!r.ok) throw Object.assign(new Error(`GitHub ${method} ${path} → ${r.status}`), { status: r.status });
    return r.json();
  };
  const head = (await gh("GET", "/git/ref/heads/main")).object.sha;
  if (baseSha && head !== baseSha) throw Object.assign(new Error("main moved since the proposal; re-check touched files"), { status: 409 });
  const baseTree = (await gh("GET", `/git/commits/${head}`)).tree.sha;
  const tree = await gh("POST", "/git/trees", { base_tree: baseTree, tree: files.map((f) =>
    f.action === "delete" ? { path: f.path, mode: "100644", type: "blob", sha: null }
                          : { path: f.path, mode: "100644", type: "blob", content: f.content }) });
  const commit = await gh("POST", "/git/commits", { message, tree: tree.sha, parents: [head] });
  await gh("PATCH", "/git/refs/heads/main", { sha: commit.sha, force: false });
  return commit.sha;
}

// ---- mock GitHub ----
const calls = []; let mainSha = "c0ffee";
const mock = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    calls.push(`${req.method} ${req.url.replace("/repos/acme/beach-day", "")}`);
    if (req.headers.authorization !== "Bearer test-token") return res.writeHead(401).end();
    const j = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url.endsWith("/git/ref/heads/main")) return j({ object: { sha: mainSha } });
    if (req.url.includes("/git/commits/")) return j({ tree: { sha: "tree0" } });
    if (req.url.endsWith("/git/trees")) return j({ sha: "tree1" });
    if (req.url.endsWith("/git/commits")) return j({ sha: "newcommit" });
    if (req.url.endsWith("/git/refs/heads/main") && JSON.parse(b).force === false) { mainSha = "newcommit"; return j({}); }
    res.writeHead(404).end();
  });
});
await new Promise((r) => mock.listen(0, r));
const api = `http://127.0.0.1:${mock.address().port}`;
const sha = await commitFiles({ api, repo: "acme/beach-day", token: "test-token", baseSha: "c0ffee",
  message: "Tweak today copy\n\nProposed-by: wren", files: [{ path: "src/pages/home.ts", action: "update", content: "// new" }] });
console.log("committed", sha, "\n" + calls.join("\n"));
try { await commitFiles({ api, repo: "acme/beach-day", token: "test-token", baseSha: "c0ffee", message: "x", files: [] }); }
catch (e) { console.log("stale proposal rejected:", e.status, e.message); }
mock.close();
