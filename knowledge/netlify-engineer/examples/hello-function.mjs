// Example 2 — a modern Netlify Function, invoked locally with a real Request (Node 18+). Run: node hello-function.mjs
const handler = async (req, context) => {
  const name = new URL(req.url).searchParams.get("name") ?? "beach";
  if (name.length > 40) return Response.json({ error: "name too long" }, { status: 400 });
  // Functions set their own headers: netlify.toml [[headers]] do not apply to function responses.
  return Response.json({ hello: name, ip: context.ip }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
};
export default handler;
export const config = { path: "/api/hello", method: "GET", rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = await handler(new Request("http://localhost/api/hello?name=Kai"), { ip: "127.0.0.1" });
  const bad = await handler(new Request("http://localhost/api/hello?name=" + "x".repeat(41)), { ip: "127.0.0.1" });
  console.log(ok.status, await ok.json(), ok.headers.get("cache-control"), "|", bad.status, await bad.json());
  if (ok.status !== 200 || bad.status !== 400) process.exit(1);
}
