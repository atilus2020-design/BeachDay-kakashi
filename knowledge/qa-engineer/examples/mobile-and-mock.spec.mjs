// Example 1 — phone-viewport test with a mocked API, no-horizontal-scroll check, and offline behaviour.
// Self-contained runner using the `playwright` library (pre-installed Chromium). Run: node mobile-and-mock.spec.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright"); // project code: import from "@playwright/test"
import http from "node:http"; import { readFileSync } from "node:fs";
const html = readFileSync(new URL("./site/index.html", import.meta.url));
const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); });
await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(); let failures = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) failures++; };
for (const dev of ["iPhone 13", "Pixel 7"]) {
  const { defaultBrowserType, ...d } = devices[dev];               // run the device profile in Chromium
  const context = await browser.newContext({ ...d, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route("**/api/forecast**", (route) => route.fulfill({ json: { score: 86, label: "Great beach day" } }));
  await page.goto(base);
  await page.getByText("86 · Great beach day").waitFor();
  check(`${dev}: mocked score shown`, true);
  check(`${dev}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const box = await page.getByRole("button", { name: "Refresh" }).boundingBox();
  check(`${dev}: Refresh target ≥ 44px`, box.height >= 44 && box.width >= 44);
  await page.unroute("**/api/forecast**"); await context.setOffline(true);
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Offline — showing saved forecast").waitFor();
  check(`${dev}: offline message`, true);
  await context.close();
}
await browser.close(); server.close(); process.exit(failures ? 1 : 0);
