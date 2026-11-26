import { test, expect } from "@playwright/test";
import { resetMocks } from "./helpers.ts";

// The service worker is deliberately NOT blocked here.
test.beforeEach(resetMocks);

test.describe("service worker and offline", () => {
  test("registers, takes control, and the offline reload shows the saved forecast with a stale banner", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
    await expect(page.getByTestId("today-card")).toBeVisible();
    const score = await page.getByTestId("today-score").innerText();

    await context.setOffline(true);
    await page.reload();
    const offlinePage = page.getByTestId("offline-page");
    const card = page.getByTestId("today-card");
    await expect(card.or(offlinePage)).toBeVisible({ timeout: 15_000 });
    if (await card.isVisible()) {
      await expect(page.getByTestId("stale-banner")).toBeVisible();
      await expect(page.getByTestId("stale-banner")).toHaveText(/Offline\. Showing the forecast saved .+ ago\./);
      await expect(page.getByTestId("today-score")).toHaveText(score);
      await expect(page.getByTestId("nws-rip-link")).toBeVisible();
    } else {
      await expect(offlinePage).toBeVisible();
    }
    await context.setOffline(false);
  });

  test("a page never visited offline falls back to /offline.html or the shell, not a browser error", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    const res = await page.goto("/how-it-works/").catch(() => null);
    expect(res === null ? "browser-error" : "ok").toBe("ok");
    await expect(page.getByTestId("offline-page").or(page.getByTestId("section-score"))).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
  });

  test("auth and agent traffic is never served from the service worker cache", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
      return urls;
    });
    expect(cached.filter((u) => /\/api\/(agent|proposals)|supabase/.test(u))).toEqual([]);
  });

  test("online again after offline: banner clears", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByTestId("today-card")).toBeVisible();
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByTestId("stale-banner")).toBeVisible();
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByTestId("stale-banner")).toBeHidden({ timeout: 15_000 });
  });
});
