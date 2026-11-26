# 2. PWA installability (iPhone and Android), and when to go native

## 2.1 What "installable" means per platform

From MDN, "Making PWAs installable": https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

### Hard requirements

- **Secure context.** "For a PWA to be installable it must be served using the `https` protocol, or from a local development environment using `localhost` or `127.0.0.1`." Netlify serves HTTPS by default.
- **A web app manifest** linked from every page with `<link rel="manifest" href="/manifest.webmanifest">`. For Chromium browsers it must contain:
  - `name` or `short_name`
  - `icons` with a **192 px and a 512 px** icon
  - `start_url`
  - `display` and/or `display_override`
  - `prefer_related_applications` set to `false` or not present
- **A service worker is not strictly required** for installability ("While not a requirement for a PWA to be installable, many PWAs use service workers to provide an offline experience"). We still ship one, for offline support and speed (§2.3).

### Platform matrix

| Platform | How users install | Notes |
|---|---|---|
| **Android, Chrome (with Google Mobile Services)** | Browser prompt or menu "Install app", or our own button using `beforeinstallprompt` | Installs as a **WebAPK**: a real app-drawer entry |
| **Android, Samsung Internet** | Same idea | Also a WebAPK |
| **Android, Firefox / Edge / Opera, or Chrome without GMS** | "Add to Home screen" | "browser-badged home-screen shortcut that opens the site in the browser". This is not a true install |
| **iOS / iPadOS 16.4+** | **Share → Add to Home Screen**, in Safari, Chrome, Edge, Firefox or Orion | No `beforeinstallprompt` ("not supported on iOS"). We must show our own instructions |
| **iOS 16.3 and earlier** | Safari only | — |
| **Desktop** | Chromium: install icon. Safari 17+ (macOS Sonoma): File → Add to Dock | "Firefox does not support installing PWAs using a manifest file." |

### iOS specifics (WebKit)

Source: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

- A site whose manifest sets `display: "standalone"` (or `fullscreen`) opens as a Home Screen web app, without browser chrome.
- iOS 16.4 added **Web Push, the Badging API and Manifest `id`** for Home Screen web apps. Web push on iOS **works only after the user has added the app to the Home Screen**.
- iOS 18.4 added **Declarative Web Push** for Home Screen apps: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- If both an `apple-touch-icon` and manifest icons exist, "`apple-touch-icon` will take precedence". So ship a 180×180 `apple-touch-icon.png` with an opaque background.
- iOS combines the user-editable name with the Manifest `id` to identify the app. Set a stable `id` and never change it.

## 2.2 Manifest for Beach Day

```json
{
  "id": "/",
  "name": "Beach Day — South Florida",
  "short_name": "Beach Day",
  "description": "Is today a good beach day? Scores for South Florida beaches.",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b3d5c",
  "theme_color": "#0b3d5c",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Today", "url": "/?view=today" }
  ]
}
```

Add these to the HTML `<head>` as well:

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (do **not** disable zoom; see doc 5)
- `<meta name="theme-color" content="#0b3d5c">`
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">`

Serve `manifest.webmanifest` with the `application/manifest+json` content type. Set it in `netlify.toml` `[[headers]]` if Netlify doesn't infer it.

## 2.3 Service worker plan

From MDN, "Offline and background operation": https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation

| Request | Strategy | Why |
|---|---|---|
| App shell (HTML, JS, CSS, icons, `beaches.json`) | **Precache at install**, cache-first, versioned cache name | Instant start and works offline |
| `/api/forecast?beach=…` | **Network-first, falling back to cache**, with a "Last updated 2 h ago" banner when serving cache | Forecasts must be fresh, but stale beats blank at the beach with poor signal |
| `/api/agent/*`, `/api/auth/*`, `/console/*` | **Never cache** (pass through) | Authenticated, dynamic and private |

### Lifecycle rules

- Bump `CACHE_VERSION` on each deploy, preferably by injecting the commit SHA at build time.
- Delete old caches in `activate`.
- Prompt "New version available — reload" instead of calling `skipWaiting()` silently, so a running page never mixes old and new assets.

**Browser limits:** Chrome may stop an idle service worker after 30 s, and a `waitUntil()` promise is capped at 5 minutes (MDN). Don't do long work in the service worker.

**Background features:** Background Sync, Periodic Background Sync and Push exist, but support varies. Periodic sync is Chromium-only, and "silent push" is supported nowhere. Treat them as progressive enhancements. A morning "beach score" notification is a later feature.

**Tooling:** a small hand-written `sw.js` is enough. Workbox (`workbox-build` or `vite-plugin-pwa`) is fine if the build uses Vite. Never let the service worker cache requests made with credentials.

## 2.4 Install UX

- **Android/Chromium:** listen for `beforeinstallprompt`, call `preventDefault()`, keep the event, and show our own "Install Beach Day" button after the user has looked at a forecast (not on first paint). Call `event.prompt()` when the button is tapped.
- **iOS:** detect iOS Safari without standalone mode (`navigator.standalone !== true` and `matchMedia('(display-mode: standalone)')` doesn't match) and show a dismissible sheet: "Tap Share → Add to Home Screen". Remember the dismissal in `localStorage` (wrapped in try/catch).
- **Detect "installed":** `matchMedia('(display-mode: standalone)').matches`. Hide install prompts when it matches.

## 2.5 When would we need a native wrapper (Capacitor)?

Capacitor "is a cross-platform native runtime that makes it easy to build performant mobile applications that run natively on iOS, Android … using modern web tooling", with a plugin API for native features (https://capacitorjs.com/docs/). It wraps the same web build in an iOS project and an Android project (`npx cap add ios|android`, `npx cap sync`).

| Need | PWA is enough? | Native wrapper needed? |
|---|---|---|
| Install icon, standalone window, offline cache | ✅ | — |
| Push notifications ("Great beach day tomorrow!") | ✅ Android; ✅ iOS 16.4+ **only once installed to the Home Screen** | Only if we must reach iOS users who won't install |
| Badge count | ✅ (Badging API on iOS 16.4+ Home Screen apps) | — |
| **Listing in the App Store / Play Store** (discoverability, reviews) | ❌ (Play allows a PWA via a Trusted Web Activity; Apple does not) | ✅ |
| Reliable background refresh or scheduled local notifications while the app is closed | ⚠️ Chromium-only Periodic Sync, no iOS | ✅ |
| Home-screen **widgets**, Live Activities, Apple Watch | ❌ | ✅ (needs native code beyond Capacitor's core) |
| Geofencing ("notify when I arrive at the beach"), background location | ❌ | ✅ |
| In-app purchases | ❌ | ✅ |

**Recommendation:** ship as a PWA. Keep the code base wrapper-ready by isolating platform calls (notifications, storage, geolocation) behind a small `platform/` module. Adding Capacitor later is then a packaging step, not a rewrite. Re-evaluate if the product needs App Store presence, widgets or background notifications.

## 2.6 Checklist for the PWA agent

- [ ] HTTPS (Netlify default); manifest linked on every page; 192, 512 and maskable icons; `apple-touch-icon` at 180 px
- [ ] `display: standalone`, a stable `id`, `start_url` within `scope`
- [ ] Service worker registered from the site root (`/sw.js`) so its scope covers the whole app
- [ ] Offline: open the app in airplane mode and confirm the last forecast shows with a "stale" banner
- [ ] Install verified on a real Android phone (Chrome) and a real iPhone (Safari, iOS 16.4+)
- [ ] Chrome DevTools → Application → Manifest shows no installability errors (recent Lighthouse versions no longer have a PWA category, so use DevTools)
- [ ] Agent Console routes are excluded from service worker caching
