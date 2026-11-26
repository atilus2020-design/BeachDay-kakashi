import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resetMocks, noHorizontalScroll, expectNoSeriousAxe, expectTarget44 } from "./helpers.ts";

const beaches: { id: string; nwsUrl: string }[] = JSON.parse(readFileSync(new URL("../../src/data/beaches.json", import.meta.url), "utf8"));
const nwsUrl = (id: string) => beaches.find((b) => b.id === id)!.nwsUrl;

test.use({ serviceWorkers: "block" });
test.beforeEach(resetMocks);

test.describe("home", () => {
  test("Today card shows number, word label, icon, reasons, NWS link and UV", async ({ page }) => {
    await page.goto("/");
    const card = page.getByTestId("today-card");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("today-score")).toHaveText(/^\d{1,3}$/);
    await expect(page.getByTestId("today-label")).toHaveText(/\S/);
    await expect(page.getByTestId("today-icon")).toBeVisible();
    await expect(page.getByTestId("today-date")).toHaveText(/\w+day, \w{3} \d{1,2}/);
    const n = await page.getByTestId("reason-item").count();
    expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(3);
    await expect(page.getByTestId("reasons-list")).toBeVisible();
    const nws = page.getByTestId("nws-rip-link");
    await expect(nws).toHaveText("Check today's rip current risk (National Weather Service)");
    await expect(nws).toHaveAttribute("href", nwsUrl("south-beach"));
    await expect(nws).toHaveAttribute("rel", /noopener/);
    await expect(page.getByTestId("uv-badge")).toHaveText(/^UV \d+/);
    await expect(page.getByTestId("updated-line")).toContainText("Updated");
    await expect(page.getByTestId("attribution")).toHaveText("Weather data by Open-Meteo.com");
    await expect(page.getByTestId("disclaimer")).toHaveText("A planning aid, not a safety service.");
  });

  test("the forecast request goes through /api/forecast and the mock Open-Meteo", async ({ page }) => {
    const req = page.waitForRequest((r) => r.url().includes("/api/forecast?beach="));
    await page.goto("/");
    expect(new URL((await req).url()).searchParams.get("beach")).toBe("south-beach");
  });

  test("7-day strip: seven cells, days 4-7 low confidence", async ({ page }) => {
    await page.goto("/");
    const cells = page.getByTestId("day-cell");
    await expect(cells).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      const c = cells.nth(i);
      await expect(c).toHaveAttribute("data-date", /^\d{4}-\d{2}-\d{2}$/);
      await expect(c).toHaveAttribute("aria-pressed", "false");
      if (i >= 3) await expect(c).toHaveAttribute("data-low-confidence", "true");
      else await expect(c).not.toHaveAttribute("data-low-confidence", "true");
    }
    await expect(page.getByTestId("low-confidence-badge")).toHaveCount(4);
  });

  test("day detail: opens, shows hourly rows for early days only, closes", async ({ page }) => {
    await page.goto("/");
    const cells = page.getByTestId("day-cell");
    await expect(page.getByTestId("day-detail")).toBeHidden();
    await cells.nth(1).click();
    await expect(cells.nth(1)).toHaveAttribute("aria-pressed", "true");
    const d = page.getByTestId("day-detail");
    await expect(d).toBeVisible();
    await expect(page.getByTestId("day-detail-title")).toHaveText(/\w+day, \w{3} \d{1,2}/);
    await expect(page.getByTestId("day-detail-score")).toHaveText(/^\d{1,3}$/);
    await expect(page.getByTestId("hour-row").first()).toBeVisible();
    await expect(page.getByTestId("day-detail-nws-link")).toHaveText("Check today's rip current risk (National Weather Service)");
    await expect(page.getByTestId("day-detail-nws-link")).toHaveAttribute("href", nwsUrl("south-beach"));
    await expect(page.getByTestId("day-detail-uv")).toBeVisible();
    await page.getByTestId("day-detail-close").click();
    await expect(d).toBeHidden();

    await cells.nth(5).click();
    await expect(page.getByTestId("day-detail-low-confidence")).toHaveText("Forecasts further out are less certain. Hourly detail isn't shown.");
    await expect(page.getByTestId("hour-row")).toHaveCount(0);
    await expect(page.getByTestId("day-detail-best-window")).toHaveCount(0);
    await cells.nth(5).click(); // pressing again closes
    await expect(page.getByTestId("day-detail")).toBeHidden();
  });

  test("partial forecast shows the weather-only note", async ({ page }) => {
    await page.route("**/api/forecast**", async (route) => {
      const res = await route.fetch(); const j = await res.json();
      j.marine = null; j.partial = true;
      await route.fulfill({ response: res, json: j });
    });
    await page.goto("/");
    await expect(page.getByTestId("partial-note")).toHaveText("Wave and water data isn't available right now. This score uses weather only.");
    await expect(page.getByTestId("today-card")).toBeVisible();
    await expect(page.getByTestId("nws-rip-link")).toBeVisible();
  });

  test("error state with no cache offers Try again", async ({ page }) => {
    await page.route("**/api/forecast**", (route) => route.fulfill({ status: 502, json: { error: "Weather data is unavailable right now" } }));
    await page.goto("/");
    await expect(page.getByTestId("forecast-error")).toBeVisible();
    await expect(page.getByTestId("retry-button")).toBeVisible();
    await expect(page.getByTestId("beach-picker")).toBeVisible();
    await expectNoSeriousAxe(page, "home-error");
  });

  test("beach picker is a labelled native select and the choice survives reload", async ({ page }) => {
    await page.goto("/");
    const picker = page.getByTestId("beach-picker");
    expect(await picker.evaluate((el) => el.tagName)).toBe("SELECT");
    await expect(page.getByLabel(/beach/i).first()).toBeVisible();
    await picker.selectOption("haulover");
    await expect.poll(() => page.evaluate(() => document.body.innerText)).toContain("Haulover");
    await page.reload();
    await expect(page.getByTestId("beach-picker")).toHaveValue("haulover");
  });

  test("layout: no horizontal scroll at 375 px and targets are at least 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toBeVisible();
    await noHorizontalScroll(page);
    await expectTarget44(page, "day-cell");
    await expectTarget44(page, "beach-picker");
    // score, label and best window fit above the fold on a 667 px phone
    const b = await page.getByTestId("today-label").boundingBox();
    expect(b!.y + b!.height).toBeLessThanOrEqual(667);
    await page.getByTestId("day-cell").first().click();
    await noHorizontalScroll(page);
  });

  test("axe: no serious or critical violations (loaded and day detail)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toBeVisible();
    await expectNoSeriousAxe(page, "home");
    await page.getByTestId("day-cell").nth(1).click();
    await expect(page.getByTestId("day-detail")).toBeVisible();
    await expectNoSeriousAxe(page, "home-detail");
  });

  test("viewport meta allows zoom and html has a lang", async ({ page }) => {
    await page.goto("/");
    const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(meta).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?(\D|$)/);
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    await expect(page.locator("h1")).toHaveCount(1);
  });
});
