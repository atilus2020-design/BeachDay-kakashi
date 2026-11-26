# What makes Beach Day installable on iPhone and Android?

Answer from Juno (pwa-mobile-engineer) to the project lead.
Sources: `knowledge/pwa-mobile-engineer/` (read in full, sources dated 2026-11-26: MDN "Making PWAs installable", web.dev install criteria, WebKit iOS web push) and `docs/02-pwa-installability.md`.

Status note: `public/` does not exist yet, so none of the items below are built or verified. This is the target checklist, not a pass/fail report.

## Both platforms
- [ ] Served over HTTPS (Netlify default). `localhost` is fine in dev.
- [ ] `<link rel="manifest" href="/manifest.webmanifest">` on every page, not just `index.html`. This includes `/agents/`, `/guide/`, `/login/` and the other Vite entries.
- [ ] The manifest is actually served (HTTP 200, `application/manifest+json`). Set it in `netlify.toml` `[[headers]]` if Netlify does not infer it.
- [ ] Manifest fields: `id` (`"/"`, stable, never change it), `name`, `short_name`, `start_url` inside `scope`, `scope`, `display: "standalone"`, `theme_color`, `background_color`. `prefer_related_applications` is absent or `false`.
- [ ] Icons: 192x192 and 512x512 PNG, plus a 512 maskable icon. Every `src` path resolves.
- [ ] Head tags: `viewport` with `viewport-fit=cover` (zoom stays enabled) and `<meta name="theme-color">`.
- [ ] A service worker at `/sw.js` (root scope). It is not required for installability, but we ship it for offline. Serve it with `Cache-Control: no-cache`.
- [ ] The service worker never caches `/api/agent*`, `/api/auth*`, `/api/proposals*`, `/agents*` or `/login*`. It uses network-first for `/api/forecast`, with an offline fallback to `/offline.html`.

## Android (Chrome with Google Mobile Services, and Samsung Internet)
- [ ] Chromium install criteria met: HTTPS, manifest with name, 192 and 512 icons, `start_url`, a valid `display`, and no `prefer_related_applications: true`.
- [ ] Engagement: Chrome waits until the user has tapped the page at least once and spent at least 30 seconds on it. Testing a fresh load for 5 seconds and finding no prompt is normal.
- [ ] The app is not already installed. The prompt does not fire if it is.
- [ ] `beforeinstallprompt` is captured with `preventDefault()` and the event is kept. Our own "Install Beach Day" button calls `event.prompt()`. Show the button after the user has viewed a forecast, not on first paint.
- [ ] Result is a WebAPK (a real app-drawer entry) only on Chrome with GMS and on Samsung Internet. Firefox, Edge, Opera and Chrome without GMS get a browser-badged shortcut, which is not a true install.
- [ ] Hide install UI when `matchMedia('(display-mode: standalone)').matches`.

## iPhone (iOS 16.4+)
- [ ] There is no `beforeinstallprompt` on iOS. Show our own dismissible sheet: "Tap Share, then Add to Home Screen". Show it only when not standalone (`navigator.standalone !== true` and the display-mode query does not match). Remember dismissal in `localStorage` inside try/catch.
- [ ] A 180x180 `apple-touch-icon` with an opaque background, linked in `<head>`. It takes precedence over manifest icons, so a missing or transparent one gives an ugly Home Screen icon.
- [ ] `display: "standalone"` in the manifest makes the Home Screen icon open as a chrome-less web app.
- [ ] Stable manifest `id` (iOS 16.4+ uses it, with the user-editable name, to identify the app).
- [ ] Install path is Share, then Add to Home Screen, in Safari, Chrome, Edge, Firefox or Orion on iOS 16.4+. On 16.3 and earlier, Safari only.
- [ ] Web Push works only after the Home Screen install. Do not promise notifications to people who are just browsing.

## The one mistake people make most often
The manifest is missing or broken, so the browser silently declines to offer install. Typical forms:
- No 512x512 icon, or the icon path 404s.
- The manifest is not linked on every page.
- The manifest is served as an HTML fallback (SPA rewrite) instead of JSON.
- `start_url` is outside `scope`.

Chrome gives no error to the user. The install option just never appears.

The iPhone version of the same mistake: expecting an install prompt. iOS never fires one, so people see no install UI and assume the app is not installable.

### How to catch it
1. Chrome DevTools, Application, Manifest. It lists every installability error and shows the icons. This is the main check.
2. Run `node knowledge/pwa-mobile-engineer/examples/check-manifest.mjs public/manifest.webmanifest` once `public/manifest.webmanifest` exists. It checks the Chromium criteria and `start_url` against `scope`.
3. `curl -sI https://<site>/manifest.webmanifest` and confirm 200 plus `application/manifest+json`.
4. Install on a real Pixel (Chrome) and a real iPhone (Safari, iOS 16.4+). Spec compliance on paper is not proof.
5. Add a Playwright check on the Pixel 7 and iPhone 13 projects that every page has the manifest link, and that every manifest icon URL returns 200.

Note: recent Lighthouse versions no longer have a PWA category, so use DevTools rather than a Lighthouse PWA score.
