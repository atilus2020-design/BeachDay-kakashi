// Example 2 — Beach Day service worker pattern (network-first API, shell precache, offline fallback).
const VERSION = "bd-v1"; // replaced with the build hash at build time
const SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"];
const NEVER = [/^\/api\/(agent|auth|proposals|agents)/, /^\/agents\//, /^\/login\//];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL))));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || NEVER.some((r) => r.test(url.pathname))) return;
  if (url.pathname === "/api/forecast") {                       // network first, cache fallback
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || Response.json({ error: "offline" }, { status: 503 }))));
    return;
  }
  if (e.request.mode === "navigate") {                          // pages: network, then cache, then offline page
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("/offline.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));  // static assets: cache first
});
