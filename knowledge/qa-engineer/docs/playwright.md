# Playwright — reference notes

Sources (read 2026-11-26): https://playwright.dev/docs/emulation · https://playwright.dev/docs/mock · https://playwright.dev/docs/accessibility-testing · https://playwright.dev/docs/test-webserver

## Devices and emulation
```js
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ projects: [
  { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  { name: 'Pixel', use: { ...devices['Pixel 7'] } },
]});
```
- Set `viewport` **after** spreading `devices[...]` ("devices also define the `viewport`").
- Offline: `use: { offline: true }` or `await context.setOffline(true)`. Dark mode: `colorScheme: 'dark'` or `page.emulateMedia({ colorScheme: 'dark' })`. `locale` and `timezoneId` (use `America/New_York`).
- Here, Chromium runs every project (WebKit isn't installed). The iPhone project emulates viewport, user agent and touch in Chromium. Real iOS checks are manual.

## Mocking network
```js
await page.route('*/**/api/v1/fruits', async route => { await route.fulfill({ json: [{ name: 'Strawberry', id: 21 }] }); });
// patch a real response:
await page.route('*/**/api/v1/fruits', async route => { const response = await route.fetch(); const json = await response.json(); json.push({ name: 'Loquat', id: 100 }); await route.fulfill({ response, json }); });
```
- Register routes **before** `page.goto`. Requests the service worker makes may not pass through `page.route`, so for mocking tests use `serviceWorkers: 'block'` in `use`, and test the SW separately.
- Server-side calls from Functions can't be caught by `page.route`. Point their base URLs (`ANTHROPIC_BASE_URL`, `GITHUB_API_URL`, `OPEN_METEO_BASE`, `SUPABASE_URL`) at a local mock server.

## Web server
```js
webServer: { command: 'npm run start', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 120_000 },
use: { baseURL: 'http://localhost:3000' },
```
`webServer` can be an array (frontend plus mock server). `env` passes variables to the command.

## Accessibility
```js
import AxeBuilder from '@axe-core/playwright';
const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
expect(results.violations).toEqual([]);
```
"many accessibility problems can only be discovered through manual testing", so combine with keyboard and screen-reader checks.
