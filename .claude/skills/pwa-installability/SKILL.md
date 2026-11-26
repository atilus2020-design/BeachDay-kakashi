---
name: pwa-installability
description: "Make Beach Day installable and offline-capable on iPhone and Android: manifest, icons, service worker, install UX. Use for any PWA, offline or install question."
---
# PWA installability

- HTTPS (Netlify) + `<link rel="manifest" href="/manifest.webmanifest">` on every page.
- Manifest: `id`, `name`, `short_name`, `start_url`, `scope`, `display: "standalone"`, `theme_color`, `background_color`, icons **192 + 512** (+ maskable 512). `prefer_related_applications` absent.
- iOS: no `beforeinstallprompt`; show "Share → Add to Home Screen" sheet; `apple-touch-icon` 180×180 takes precedence over manifest icons. Web Push only after Home Screen install (iOS 16.4+).
- Android Chrome/Samsung: WebAPK install; capture `beforeinstallprompt`, show own button after first forecast view.
- Service worker at `/sw.js` (root scope): precache shell; network-first for `/api/forecast` with cache fallback + stale banner; **never cache** `/api/agent*`, `/api/auth*`, `/api/proposals*`, `/agents*`; offline fallback page `/offline.html`.
- Version caches by build; delete old caches on `activate`; prompt to reload instead of silent `skipWaiting`.
- Most common mistake: missing/incorrect icon sizes or manifest not served/linked → not installable. Check DevTools → Application → Manifest.
