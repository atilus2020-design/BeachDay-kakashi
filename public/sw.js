// Beach Day service worker (plain JS, build-injected). See docs/build-plan.md §9.7.
// scripts/inject-sw.mjs rewrites the two placeholders below in dist/sw.js after `vite build`.
const VERSION = "bd-__VERSION__";
const PRECACHE = "__PRECACHE__"; // replaced by a JSON array literal at build time
const SHELL = Array.isArray(PRECACHE) ? PRECACHE : ["/", "/offline.html", "/offline.css", "/manifest.webmanifest"];
const FORECAST = "/api/forecast";
const NEVER = [/^\/api\/agent/, /^\/api\/agents/, /^\/api\/proposals/, /^\/agents(\/|$)/, /^\/login(\/|$)/];

self.addEventListener("install", (event) => {
  // No silent skipWaiting: the page asks the user to reload (SKIP_WAITING message).
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(SHELL.map((u) => cache.add(u).catch(() => undefined)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function offlineJson() {
  return new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("Authorization")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase or other origins
  if (NEVER.some((re) => re.test(url.pathname))) return;

  if (url.pathname === FORECAST) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || offlineJson()))
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return; // other APIs: pass through

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .catch(() => caches.match(req, { ignoreSearch: true }))
        .then((r) => r || caches.match("/offline.html"))
    );
    return;
  }

  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
