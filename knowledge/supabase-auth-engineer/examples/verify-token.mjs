// Minimal raw-HTTP sketch (no SDK, no CSRF). The production guard is netlify/functions/_lib/auth.ts (supabase-js, security.md §5).
// Netlify-Function-style guard: verify the Supabase access token, then read the role from `profiles` under RLS.
// Uses ONLY the project URL and the publishable key (never the secret key). Tested against an in-process mock.
// Run: node verify-token.mjs
import { createServer } from "node:http";

const BEARER = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/; // an access token is a JWT: three base64url parts

/**
 * requireRole(req, { supabaseUrl, publishableKey, role = "super_admin" })
 *  -> { ok: true, user: { id, email }, role }  |  { ok: false, response: Response(401|403|503) }
 * In a Function: const g = await requireRole(req, { supabaseUrl: Netlify.env.get("SUPABASE_URL"),
 *   publishableKey: Netlify.env.get("SUPABASE_PUBLISHABLE_KEY") }); if (!g.ok) return g.response;
 */
export async function requireRole(req, { supabaseUrl, publishableKey, role = "super_admin" }) {
  const m = BEARER.exec(req.headers.get("authorization") || "");
  if (!m) return deny(401, "Sign in required");
  const token = m[1];
  // 1. Ask Supabase Auth whether the token is valid (documented: GET /auth/v1/user with apikey + Bearer JWT; 200 = valid).
  let userRes;
  try { userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishableKey, authorization: `Bearer ${token}` } }); }
  catch { return deny(503, "Sign-in service unavailable"); }
  if (userRes.status === 401 || userRes.status === 403) return deny(401, "Sign in required");
  if (!userRes.ok) return deny(503, "Sign-in service unavailable");
  const user = await userRes.json().catch(() => null);
  if (!user?.id) return deny(401, "Sign in required");
  // 2. Read the role with the CALLER's JWT, so RLS decides what is visible. Never trust a role sent by the client.
  let profRes;
  try { profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role&id=eq.${encodeURIComponent(user.id)}`,
    { headers: { apikey: publishableKey, authorization: `Bearer ${token}`, accept: "application/json" } }); }
  catch { return deny(503, "Sign-in service unavailable"); }
  if (!profRes.ok) return deny(503, "Sign-in service unavailable");
  const rows = await profRes.json().catch(() => []);
  const actual = Array.isArray(rows) && rows.length === 1 && rows[0].id === user.id ? rows[0].role : null;
  if (actual !== role) return deny(403, "Not allowed"); // default deny: missing profile also lands here
  return { ok: true, user: { id: user.id, email: user.email }, role: actual };
}
const deny = (status, error) => ({ ok: false, response: Response.json({ error }, { status }) });

// ---------- self-test against a mock Supabase (only runs when this file is executed directly) ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const KEY = "sb_publishable_test", tokens = {
    "aaa.bbb.admin": { id: "u-admin", email: "admin@example.com", role: "super_admin" },
    "aaa.bbb.user": { id: "u-user", email: "user@example.com", role: "user" },
  };
  const seen = [];
  const server = createServer((rq, rs) => {
    const tok = (rq.headers.authorization || "").replace("Bearer ", ""), u = tokens[tok];
    seen.push(`${rq.method} ${rq.url.split("?")[0]} apikey=${rq.headers.apikey === KEY}`);
    const send = (c, b) => { rs.writeHead(c, { "content-type": "application/json" }); rs.end(JSON.stringify(b)); };
    if (rq.headers.apikey !== KEY) return send(401, { message: "No API key" });
    if (rq.url === "/auth/v1/user") return u ? send(200, { id: u.id, email: u.email }) : send(401, { msg: "invalid JWT" });
    if (rq.url.startsWith("/rest/v1/profiles")) { // RLS stand-in: caller sees only their own row
      const id = new URL(rq.url, "http://x").searchParams.get("id")?.replace("eq.", "");
      return send(200, u && u.id === id ? [{ id: u.id, role: u.role }] : []);
    }
    send(404, {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const cfg = { supabaseUrl: `http://127.0.0.1:${server.address().port}`, publishableKey: KEY };
  const mk = (auth) => new Request("https://beachday.example/api/agent-chat", { method: "POST", headers: auth ? { authorization: auth } : {} });
  const cases = [
    ["no token", mk(), 401], ["not a bearer JWT", mk("Bearer nope"), 401],
    ["bad token", mk("Bearer aaa.bbb.forged"), 401], ["role user", mk("Bearer aaa.bbb.user"), 403],
    ["role super_admin", mk("Bearer aaa.bbb.admin"), 200],
  ];
  let bad = 0;
  for (const [name, req, want] of cases) {
    const g = await requireRole(req, cfg), got = g.ok ? 200 : g.response.status;
    if (got !== want) bad++;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name}: ${got}${g.ok ? ` (${g.user.email}, ${g.role})` : ""}`);
  }
  const down = await requireRole(mk("Bearer aaa.bbb.admin"), { ...cfg, supabaseUrl: "http://127.0.0.1:1" });
  const okDown = !down.ok && down.response.status === 503; if (!okDown) bad++;
  console.log(`${okDown ? "ok  " : "FAIL"} auth service down: ${down.response?.status} (fails closed)`);
  console.log("requests seen by mock:\n  " + seen.join("\n  "));
  server.close(); process.exit(bad ? 1 : 0);
}
