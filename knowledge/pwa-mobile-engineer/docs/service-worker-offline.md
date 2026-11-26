# Service worker and offline — reference notes

Sources: MDN "Offline and background operation" https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation · web.dev "Offline cookbook" https://web.dev/articles/offline-cookbook

- **Lifecycle:** `install` (precache the shell with `event.waitUntil(cache.addAll([...]))`) → `activate` (delete old caches) → `fetch` (intercept with `event.respondWith`).
- **Strategies (web.dev):** cache on install; stale-while-revalidate; network falling back to cache; cache then network; **generic fallback** (`caches.match('/offline.html')`).
- **MDN:** cache-first is fast "but more likely to return a stale response"; network-first tries the server "and fall[s] back to the cache if the device is offline".
- **Chrome limits (MDN):** an idle SW may be stopped after 30 s; `waitUntil()` promises are capped at 5 min.
- **Beach Day strategy:** precache the shell plus `/offline.html`; **network-first** for `/api/forecast` (cache fallback with a stale banner); **never cache** `/api/agent*`, `/api/auth*`, `/api/proposals*`, `/agents/*`, `/login/*`; navigation requests fall back to the cached page, then `/offline.html`.
- Serve `/sw.js` with `Cache-Control: no-cache` and register it from the root so its scope covers the whole site.
