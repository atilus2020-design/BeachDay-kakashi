// E2E app server: serves the production build in dist/ and runs the Netlify Function handlers in-process.
// Why not `netlify dev`? Its Edge Functions bootstrap downloads files from the network and crashes offline
// (sandbox / CI without internet). Set E2E_NETLIFY_DEV=1 in playwright.config to use the real CLI instead.
// Limits: no platform rate limiting, no netlify.toml headers/CSP. Env comes from tests/mocks/test.env (+ NODE_ENV=test
// so Blobs are in-memory and an http Supabase URL is accepted).
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dist = join(root, "dist");
const port = Number(process.env.PORT || 8888);
process.env.NODE_ENV = "test";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain", ".woff2": "font/woff2" };

// Load every function and compile its config.path (":id" params) into a matcher.
const routes = [];
const fdir = join(root, "netlify/functions");
for (const f of readdirSync(fdir).filter((n) => n.endsWith(".mts"))) {
  const mod = await import(pathToFileURL(join(fdir, f)).href);
  const paths = [].concat(mod.config?.path ?? []);
  const methods = mod.config?.method ? [].concat(mod.config.method) : null;
  for (const p of paths) {
    const names = []; const re = new RegExp("^" + p.replace(/:([a-z]+)/gi, (_m, n) => { names.push(n); return "([^/]+)"; }) + "/?$");
    routes.push({ re, names, methods, handler: mod.default });
  }
}

async function runFunction(req, res, url, r, m) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, [].concat(v).join(", "));
  const init = { method: req.method, headers };
  if (!["GET", "HEAD"].includes(req.method)) init.body = Buffer.concat(chunks);
  const request = new Request(`http://${req.headers.host}${url.pathname}${url.search}`, init);
  const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
  const ctx = { ip: req.socket.remoteAddress, params, deploy: { context: "dev" }, geo: {}, requestId: Math.random().toString(36).slice(2), waitUntil() {} };
  let response;
  try { response = await r.handler(request, ctx); } catch (e) { console.error("function crashed", e?.message); response = new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500, headers: { "content-type": "application/json" } }); }
  const out = {}; response.headers.forEach((v, k) => { out[k] = v; });
  res.writeHead(response.status, out);
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).on("error", () => res.end()).pipe(res);
}

async function serveStatic(res, pathname) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dist, rel);
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch { /* fallthrough */ }
  try {
    const buf = await readFile(file);
    const headers = { "content-type": TYPES[extname(file)] || "application/octet-stream", "x-content-type-options": "nosniff" };
    if (file.endsWith("sw.js")) headers["cache-control"] = "no-cache";
    res.writeHead(200, headers); res.end(buf);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found");
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (m && (!r.methods || r.methods.includes(req.method))) return runFunction(req, res, url, r, m);
      if (m) { res.writeHead(405, { "content-type": "application/json" }); return res.end('{"error":"Method not allowed"}'); }
    }
    res.writeHead(404, { "content-type": "application/json" }); return res.end('{"error":"Not found"}');
  }
  return serveStatic(res, url.pathname);
}).listen(port, "127.0.0.1", () => console.log(`e2e app server on http://localhost:${port}`));
