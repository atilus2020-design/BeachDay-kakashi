import { test, expect } from "@playwright/test";
import { resetMocks, noHorizontalScroll, expectNoSeriousAxe } from "./helpers.ts";

test.use({ serviceWorkers: "block" });
test.beforeEach(resetMocks);

const PAGES = ["/", "/login/", "/agents/", "/how-it-works/", "/resources/", "/guide/"];

test.describe("every page is installable-ready", () => {
  for (const path of PAGES) {
    test(`${path}: manifest link, icons and theme meta`, async ({ page, request }) => {
      await page.goto(path);
      const href = await page.locator('link[rel="manifest"]').getAttribute("href");
      expect(href, "manifest link").toBeTruthy();
      const res = await request.get(new URL(href!, page.url()).href);
      expect(res.status()).toBe(200);
      const m = await res.json();
      expect(m.name).toBeTruthy(); expect(m.display).toBe("standalone"); expect(m.start_url).toBeTruthy();
      expect(m.icons.length).toBeGreaterThanOrEqual(2);
      for (const i of m.icons) {
        const r = await request.get(new URL(i.src, page.url()).href);
        expect(r.status(), i.src).toBe(200);
        expect(r.headers()["content-type"]).toMatch(/image\//);
      }
      expect(await page.locator('link[rel="apple-touch-icon"]').count()).toBeGreaterThan(0);
      expect(await page.locator('meta[name="theme-color"]').count()).toBeGreaterThan(0);
      const apple = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute("href");
      expect((await request.get(new URL(apple!, page.url()).href)).status()).toBe(200);
    });
  }
});

test.describe("shell and content pages", () => {
  for (const path of ["/", "/how-it-works/", "/resources/", "/guide/"]) {
    test(`${path}: header, nav, footer, skip link`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("site-header")).toBeVisible();
      for (const id of ["nav-home", "nav-agents", "nav-how", "nav-resources", "nav-signin"]) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId("footer-guide")).toHaveAttribute("href", "/guide/");
      await expect(page.getByTestId("footer-github")).toHaveAttribute("href", "https://github.com/atilus2020-design/BeachDay-kakashi");
      await expect(page.getByTestId("footer-api")).toHaveAttribute("href", "https://mcp-api.netlify.app/");
      await expect(page.getByTestId("attribution")).toHaveText("Weather data by Open-Meteo.com");
      await expect(page.getByTestId("disclaimer")).toHaveText("A planning aid, not a safety service.");
      await expect(page.getByTestId("skip-link")).toHaveAttribute("href", "#main");
      await noHorizontalScroll(page);
      await expectNoSeriousAxe(page, path);
    });
  }
  test("how it works has the score sections and the NWS link", async ({ page }) => {
    await page.goto("/how-it-works/");
    await expect(page.locator("h1")).toHaveCount(1);
    for (const id of ["section-score", "score-weights-list", "score-labels", "section-vetoes", "section-limits", "section-data", "section-agents"]) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("how-nws-link")).toHaveAttribute("href", /weather\.gov/);
    await expect(page.getByTestId("how-nws-link")).toHaveAttribute("rel", /noopener/);
  });
  test("resources: groups, descriptive links, rel=noopener", async ({ page }) => {
    await page.goto("/resources/");
    expect(await page.getByTestId("resource-group").count()).toBeGreaterThanOrEqual(4);
    const links = page.getByTestId("resource-link");
    const n = await links.count(); expect(n).toBeGreaterThan(5);
    for (let i = 0; i < n; i++) {
      await expect(links.nth(i)).toHaveAttribute("rel", /noopener/);
      expect((await links.nth(i).innerText()).trim().toLowerCase()).not.toBe("click here");
    }
    await expect(page.getByTestId("resource-guide-link")).toBeVisible();
    await expect(page.getByTestId("resource-api-link")).toHaveAttribute("href", "https://mcp-api.netlify.app/");
  });
  test("guide: numbered steps and copy buttons", async ({ page }) => {
    await page.goto("/guide/");
    expect(await page.getByTestId("guide-step").count()).toBeGreaterThan(3);
    await expect(page.getByTestId("guide-check")).toBeVisible();
    await expect(page.getByTestId("guide-troubleshooting")).toBeVisible();
    expect(await page.getByTestId("guide-copy-button").count()).toBe(await page.getByTestId("guide-code").count());
  });
  test("offline.html renders with a retry button", async ({ page }) => {
    await page.goto("/offline.html");
    await expect(page.getByTestId("offline-page")).toBeVisible();
    await expect(page.locator("h1")).toHaveText("You're offline");
    await expect(page.getByTestId("offline-retry")).toBeVisible();
    await expectNoSeriousAxe(page, "offline.html");
  });
  test("home page does not load supabase-js", async ({ page }) => {
    const hits: string[] = [];
    page.on("request", (r) => { if (/supabase/i.test(r.url())) hits.push(r.url()); });
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toBeVisible();
    expect(hits).toEqual([]);
  });
});
