# Installability — iOS and Android (reference notes)

Sources (read 2026-11-26):
- MDN, Making PWAs installable: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- web.dev, install criteria: https://web.dev/articles/install-criteria
- WebKit, Web Push for Web Apps on iOS and iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

## Chromium criteria (web.dev)
- Not already installed.
- **Engagement:** "clicked or tapped on the page at least once" and "spent at least 30 seconds viewing the page".
- Served over **HTTPS** (or localhost).
- Manifest with: `short_name` or `name`; `icons` "must include a 192px and a 512px icon"; `start_url`; `display` "must be one of `fullscreen`, `standalone`, `minimal-ui`, or `window-controls-overlay`"; `prefer_related_applications` absent or `false`.
- When the criteria are met, Chromium fires **`beforeinstallprompt`**, so you can show your own Install button and call `event.prompt()`.

## Android (MDN)
- "the only browsers that install PWAs as WebAPKs are: Chrome on devices with Google Mobile Services (GMS), and Samsung Internet". Others add a browser-badged shortcut.

## iOS / iPadOS (MDN and WebKit)
- iOS 16.4+: install from the **Share menu → Add to Home Screen** in Safari, Chrome, Edge, Firefox or Orion. iOS 16.3 and earlier: Safari only.
- **No `beforeinstallprompt` on iOS.** Show your own instructions.
- With a manifest whose `display` is `standalone` or `fullscreen`, the Home Screen icon opens as a web app.
- iOS 16.4 added Web Push, Badging and Manifest `id` for Home Screen apps. Web Push works **only after** the app is added to the Home Screen.
- If both exist, "`apple-touch-icon` will take precedence over the Manifest-declared icons."

## Service worker
- Not required for installability ("While not a requirement for a PWA to be installable, many PWAs use service workers"), but Beach Day uses one for offline.

## The most common mistake
The manifest is missing or broken: wrong icon sizes (no 512 px), a bad path, not linked on every page, or a wrong `start_url`/`scope`. Chrome then silently won't offer install. **Always check Chrome DevTools → Application → Manifest.** On iOS the equivalent mistake is expecting an install prompt; you must tell people to use Share → Add to Home Screen.
