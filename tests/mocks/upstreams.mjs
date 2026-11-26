// One dependency-free mock server for every upstream (docs/build-plan.md section 9.4).
//   /open-meteo/v1/forecast   /marine/v1/marine   /anthropic/v1/messages
//   /github/repos/:owner/:repo/...   /supabase/auth/v1/user   /supabase/rest/v1/profiles
// Control: GET /__calls, DELETE /__calls (reset calls AND state), POST /__state, POST /__role, POST /__mode
import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const fx = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/open-meteo/${name}`, import.meta.url)), "utf8"));
const FORECAST_3 = fx("miami-forecast-2026-11-25.json");
const MARINE_3 = fx("miami-marine-2026-11-25.json");
const FORECAST_7 = fx("miami-forecast-2026-11-25-7day-reconstructed.json");
const MARINE_7 = fx("miami-marine-2026-11-25-7day-reconstructed.json");

export const USERS = {
  tok_super_admin: { id: "00000000-0000-4000-8000-000000000001", email: "admin@beachday.test", role: "super_admin" },
  tok_user: { id: "00000000-0000-4000-8000-000000000002", email: "user@beachday.test", role: "user" },
};
export const INITIAL_HEAD = "1111111111111111111111111111111111111111";
export const PROPOSE_INPUT = {
  title: "Add QA note to docs/notes.md",
  summary: "Adds a short QA note.",
  files: [{ path: "docs/notes.md", action: "update", content: "# QA Notes\n\nQA was here.\n" }],
};

const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
const blobSha = (content) => sha1(`blob ${Buffer.byteLength(content)}\0${content}`);

function freshState() {
  return {
    head: INITIAL_HEAD,
    files: { "docs/notes.md": "# Notes\n", "src/app/today.ts": "export const today = 1;\n", "README.md": "# Beach Day\n", ".env": "SECRET=1\n", "key.pem": "-----BEGIN-----\n" },
    commits: {}, trees: {}, counter: 0,
    forecastStatus: 200, marineStatus: 200, anthropicStatus: 200, githubStatus: 200,
    supabase: "up", roles: {}, script: [],
  };
}

export function startMocks(port = 0, host = "127.0.0.1") {
  let calls = [];
  let st = freshState();

  const send = (res, status, body, headers = {}) => {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(payload);
  };

  const sse = (res, events) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
    for (const [e, d] of events) res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
    res.end();
  };
  const msgStart = (model) => ["message_start", { type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } }];
  const textEvents = (model, chunks) => [
    msgStart(model),
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ...chunks.map((t) => ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }]),
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 8 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  const toolEvents = (model, tools) => {
    tools = Array.isArray(tools) ? tools : [{ name: "propose_change", input: tools }];
    const blocks = tools.flatMap((t, n) => {
      const json = JSON.stringify(t.input); const mid = Math.floor(json.length / 2); const index = n + 1;
      return [
        ["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: `toolu_mock${index}`, name: t.name, input: {} } }],
        ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(0, mid) } }],
        ["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(mid) } }],
        ["content_block_stop", { type: "content_block_stop", index }],
      ];
    });
    return [
      msgStart(model),
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let me draft that change. " } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ...blocks,
      ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 40 } }],
      ["message_stop", { type: "message_stop" }],
    ];
  };

  const blocks = (m) => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content || []);

  function anthropic(req, res, path, body) {
    if (req.method !== "POST" || path !== "/v1/messages") return send(res, 404, { error: "not found" });
    if (st.anthropicStatus !== 200) {
      const type = st.anthropicStatus === 429 ? "rate_limit_error" : "overloaded_error";
      return send(res, st.anthropicStatus, { type: "error", error: { type, message: "mock" } });
    }
    const model = body?.model || "claude-sonnet-5-5";
    // Scripted turns (POST /__state {script:[{tools:[{name,input}]} | {text:[..]} | {status:529}]}): one step per request.
    const step = st.script.shift();
    if (step) {
      if (step.status) return send(res, step.status, { type: "error", error: { type: "overloaded_error", message: "mock" } });
      if (step.tools) return sse(res, toolEvents(model, step.tools));
      return sse(res, textEvents(model, step.text || ["ok"]));
    }
    const last = (body?.messages || []).at(-1) || { content: "" };
    const lb = blocks(last);
    let events;
    if (lb.some((b) => b.type === "tool_result")) events = textEvents(model, ["I proposed ", "the change; ", "please review."]);
    else if (/propose/i.test(lb.filter((b) => b.type === "text").map((b) => b.text).join(" "))) events = toolEvents(model, PROPOSE_INPUT);
    else events = textEvents(model, ["Sunny with ", "light winds."]);
    if (body?.stream === false) {
      const content = events.filter((e) => e[0] === "content_block_start").map((e) => e[1].content_block);
      return send(res, 200, { id: "msg_mock", type: "message", role: "assistant", model, content, stop_reason: events.some((e) => e[0] === "message_delta" && e[1].delta.stop_reason === "tool_use") ? "tool_use" : "end_turn", usage: { input_tokens: 12, output_tokens: 8 } });
    }
    return sse(res, events);
  }

  function github(req, res, path, body, url) {
    const m = /^\/repos\/([^/]+)\/([^/]+)\/(.*)$/.exec(path);
    if (!m) return send(res, 404, { message: "Not Found" });
    if (st.githubStatus !== 200) return send(res, st.githubStatus, { message: "mock failure" });
    const rest = m[3];
    let r;
    if (req.method === "GET" && (rest === "contents" || (r = /^contents\/(.+)$/.exec(rest)))) {
      const p = rest === "contents" ? "" : decodeURIComponent(r[1]);
      if (p === "" || (!(p in st.files) && Object.keys(st.files).some((f) => f.startsWith(p + "/")))) {
        const pre = p ? p + "/" : ""; const seen = new Map();
        for (const f of Object.keys(st.files)) if (f.startsWith(pre)) { const name = f.slice(pre.length).split("/")[0]; const isDir = f.slice(pre.length).includes("/"); seen.set(name, isDir ? { name, path: pre + name, type: "dir", size: 0 } : { name, path: pre + name, type: "file", size: Buffer.byteLength(st.files[f]) }); }
        return send(res, 200, [...seen.values()]);
      }
      if (!(p in st.files)) return send(res, 404, { message: "Not Found" });
      const c = st.files[p];
      return send(res, 200, { type: "file", path: p, name: p.split("/").pop(), encoding: "base64", content: Buffer.from(c).toString("base64"), sha: blobSha(c), size: Buffer.byteLength(c) });
    }
    if (req.method === "GET" && rest === "git/ref/heads/main") return send(res, 200, { ref: "refs/heads/main", object: { sha: st.head, type: "commit" } });
    if (req.method === "GET" && (r = /^git\/commits\/([0-9a-f]+)$/.exec(rest))) {
      const c = st.commits[r[1]];
      return send(res, 200, { sha: r[1], tree: { sha: c ? c.tree : `tree_${r[1].slice(0, 8)}` }, parents: c ? c.parents.map((sha) => ({ sha })) : [] });
    }
    if (req.method === "POST" && rest === "git/trees") {
      const sha = sha1(`tree-${++st.counter}`);
      st.trees[sha] = body?.tree || [];
      return send(res, 201, { sha, tree: st.trees[sha] });
    }
    if (req.method === "POST" && rest === "git/commits") {
      const sha = sha1(`commit-${++st.counter}`);
      st.commits[sha] = { tree: body?.tree, parents: body?.parents || [], message: body?.message };
      return send(res, 201, { sha, html_url: `https://github.com/${m[1]}/${m[2]}/commit/${sha}`, tree: { sha: body?.tree }, parents: (body?.parents || []).map((s) => ({ sha: s })) });
    }
    if (req.method === "PATCH" && rest === "git/refs/heads/main") {
      const c = st.commits[body?.sha];
      if (!c) return send(res, 422, { message: "Object does not exist" });
      if (!body?.force && !c.parents.includes(st.head)) return send(res, 422, { message: "Update is not a fast forward" });
      for (const e of st.trees[c.tree] || []) {
        if (e.sha === null) delete st.files[e.path]; else if (typeof e.content === "string") st.files[e.path] = e.content;
      }
      st.head = body.sha;
      return send(res, 200, { ref: "refs/heads/main", object: { sha: st.head, type: "commit" } });
    }
    return send(res, 404, { message: "Not Found" });
  }

  const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
  const roleOf = (tok) => st.roles[USERS[tok]?.id] ?? USERS[tok]?.role;

  function supabase(req, res, path, url) {
    if (st.supabase === "down") return send(res, 503, { message: "mock supabase down" });
    if (!req.headers.apikey) return send(res, 401, { message: "No API key found in request" });
    const tok = bearer(req);
    if (path === "/auth/v1/user" && req.method === "GET") {
      if (tok === "tok_signed_out") return send(res, 403, { code: 403, error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" });
      const u = USERS[tok];
      if (!u) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return send(res, 200, { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    }
    if (path === "/rest/v1/profiles" && req.method === "GET") {
      const u = USERS[tok];
      if (!u) return send(res, 401, { code: "PGRST301", message: "JWT invalid" });
      let rows = [{ id: u.id, email: u.email, role: roleOf(tok), created_at: "2026-01-01T00:00:00Z" }];
      const idq = url.searchParams.get("id");
      if (idq) rows = rows.filter((r) => `eq.${r.id}` === idq);
      const sel = (url.searchParams.get("select") || "*").split(",").map((s) => s.trim());
      if (!sel.includes("*")) rows = rows.map((r) => Object.fromEntries(sel.filter((k) => k in r).map((k) => [k, r[k]])));
      if (/pgrst\.object/.test(req.headers.accept || "")) {
        return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" });
      }
      return send(res, 200, rows);
    }
    return send(res, 404, { message: "Not Found" });
  }

  function control(req, res, path, body) {
    if (path === "/__calls" && req.method === "GET") return send(res, 200, calls);
    if (path === "/__calls" && req.method === "DELETE") { calls = []; st = freshState(); return send(res, 200, { ok: true }); }
    if (path === "/__state" && req.method === "POST") {
      const { head, files, ...rest } = body || {};
      if (head) st.head = head;
      if (files) Object.assign(st.files, files);
      Object.assign(st, rest);
      return send(res, 200, { ok: true, head: st.head });
    }
    if (path === "/__role" && req.method === "POST") { st.roles[body.id] = body.role; return send(res, 200, { ok: true }); }
    if (path === "/__mode" && req.method === "POST") { st.supabase = body === "supabase-down" || body?.mode === "supabase-down" ? "down" : "up"; return send(res, 200, { ok: true }); }
    return send(res, 404, { error: "not found" });
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
      const url = new URL(req.url, "http://mock");
      const p = url.pathname;
      if (p.startsWith("/__")) return control(req, res, p, body);
      calls.push({ t: Date.now(), method: req.method, path: p, query: url.search, url: req.url, headers: { ...req.headers }, body });
      try {
        if (p === "/open-meteo/v1/forecast") {
          if (st.forecastStatus !== 200) return send(res, st.forecastStatus, { error: true, reason: "mock" });
          return send(res, 200, Number(url.searchParams.get("forecast_days")) > 3 ? FORECAST_7 : FORECAST_3);
        }
        if (p === "/marine/v1/marine") {
          if (st.marineStatus !== 200) return send(res, st.marineStatus, { error: true, reason: "mock" });
          return send(res, 200, Number(url.searchParams.get("forecast_days")) > 3 ? MARINE_7 : MARINE_3);
        }
        if (p.startsWith("/anthropic/")) return anthropic(req, res, p.slice(10), body);
        if (p.startsWith("/github/")) return github(req, res, p.slice(7), body, url);
        if (p.startsWith("/supabase/")) return supabase(req, res, p.slice(9), url);
      } catch (e) { return send(res, 500, { error: String(e) }); }
      return send(res, 404, { error: "unknown mock route" });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolve({ server, port: actual, url: `http://${host}:${actual}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.MOCK_PORT || 9100);
  const m = await startMocks(port);
  console.log(`Beach Day upstream mocks listening on ${m.url}`);
}
