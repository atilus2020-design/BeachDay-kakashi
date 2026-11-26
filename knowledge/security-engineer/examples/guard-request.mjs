// Example 2 — the order of checks every protected Netlify Function runs before doing work.
// verifyUser is injected (Supabase in production, a stub here). Run: node guard-request.mjs
export async function guard(req, { siteOrigin, verifyUser, requiredRole = "super_admin" }) {
  if (req.method !== "GET") {                                        // CSRF defence in depth
    const origin = req.headers.get("origin"), site = req.headers.get("sec-fetch-site");
    if (origin !== siteOrigin || (site && site !== "same-origin")) return deny(403, "Forbidden");
    if (req.headers.get("x-requested-with") !== "beachday") return deny(403, "Forbidden");
  }
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") || "");
  if (!m) return deny(401, "Sign in required");
  const user = await verifyUser(m[1]).catch(() => null);             // server-side verification, every request
  if (!user) return deny(401, "Sign in required");
  if (user.role !== requiredRole) return deny(403, "Not allowed");   // role from the database, never from the client
  return { ok: true, user };
}
const deny = (status, error) => ({ ok: false, response: Response.json({ error }, { status }) });

const verifyUser = async (t) => ({ "admin-token": { id: "u1", role: "super_admin" }, "user-token": { id: "u2", role: "user" } })[t] ?? null;
const site = "https://beachday.example";
const mk = (h, method = "POST") => new Request(`${site}/api/agent/chat`, { method, headers: h });
const cases = [
  ["no token", mk({ origin: site, "x-requested-with": "beachday" }), 401],
  ["cross-site", mk({ origin: "https://evil.example", authorization: "Bearer admin-token", "x-requested-with": "beachday" }), 403],
  ["missing header", mk({ origin: site, authorization: "Bearer admin-token" }), 403],
  ["plain user", mk({ origin: site, authorization: "Bearer user-token", "x-requested-with": "beachday" }), 403],
  ["super_admin", mk({ origin: site, authorization: "Bearer admin-token", "x-requested-with": "beachday" }), 200],
];
let bad = 0;
for (const [name, req, want] of cases) {
  const r = await guard(req, { siteOrigin: site, verifyUser });
  const got = r.ok ? 200 : r.response.status; if (got !== want) bad++;
  console.log(`${got === want ? "ok  " : "FAIL"} ${name}: ${got}`);
}
process.exit(bad ? 1 : 0);
