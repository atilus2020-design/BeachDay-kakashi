import { test, expect } from "@playwright/test";
import { mockSupabase, seedSession, SUPABASE, resetMocks, noHorizontalScroll, expectNoSeriousAxe, expectTarget44 } from "./helpers.ts";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => { await resetMocks(); await mockSupabase(context); });

test.describe("login page", () => {
  test("renders both tabs, Google button and labelled fields", async ({ page }) => {
    await page.goto("/login/");
    await expect(page.locator("h1")).toHaveText("Sign in to Beach Day");
    await expect(page.getByTestId("google-button")).toBeVisible();
    await expect(page.getByTestId("auth-tab-login")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("login-form")).toBeVisible();
    await expect(page.getByTestId("email-input")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByTestId("password-input")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.locator('label[for="email"]')).toBeVisible();
    await expect(page.getByTestId("forgot-link")).toBeVisible();
    await expect(page.getByTestId("nav-signin")).toBeHidden();
    await noHorizontalScroll(page);
    await expectTarget44(page, "submit-button");
    await expectTarget44(page, "google-button");
    await expectNoSeriousAxe(page, "login");
  });

  test("next=/agents/ shows the context line", async ({ page }) => {
    await page.goto("/login/?next=/agents/");
    await expect(page.getByTestId("login-context")).toHaveText("Agents is for the project owner.");
  });

  test("sign up tab: 12-character hint, short password rejected before any request", async ({ page }) => {
    let signups = 0; page.on("request", (r) => { if (r.url().includes("/auth/v1/signup")) signups++; });
    await page.goto("/login/");
    await page.getByTestId("auth-tab-signup").click();
    await expect(page.locator("h1")).toHaveText("Create your account");
    await expect(page.getByTestId("password-hint")).toHaveText("At least 12 characters.");
    await expect(page.getByTestId("password-input")).toHaveAttribute("autocomplete", "new-password");
    await page.getByTestId("email-input").fill("new@beachday.test");
    await page.getByTestId("password-input").fill("short");
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("password-error")).toHaveText("Use at least 12 characters.");
    expect(signups).toBe(0);
  });

  test("sign up success shows the check-your-email message", async ({ page }) => {
    await page.goto("/login/");
    await page.getByTestId("auth-tab-signup").click();
    await page.getByTestId("email-input").fill("new@beachday.test");
    await page.getByTestId("password-input").fill("a-long-enough-password");
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("confirm-email-message")).toContainText("new@beachday.test");
    await expect(page.getByTestId("signup-restart")).toBeVisible();
  });

  test("wrong password shows one generic error and keeps the email", async ({ page }) => {
    await page.goto("/login/");
    await page.getByTestId("email-input").fill("user@beachday.test");
    await page.getByTestId("password-input").fill("wrong-password");
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("form-error")).toHaveText("Email or password is incorrect.");
    await expect(page.getByTestId("form-error")).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("email-input")).toHaveValue("user@beachday.test");
  });

  test("log in as a user without next goes home", async ({ page }) => {
    await page.goto("/login/");
    await page.getByTestId("email-input").fill("user@beachday.test");
    await page.getByTestId("password-input").fill("a-long-enough-password");
    await page.getByTestId("submit-button").click();
    await page.waitForURL((u) => u.pathname === "/");
  });

  test("log in as admin with next=/agents/ lands on Agents", async ({ page }) => {
    await page.goto("/login/?next=/agents/");
    await page.getByTestId("email-input").fill("admin@beachday.test");
    await page.getByTestId("password-input").fill("a-long-enough-password");
    await page.getByTestId("submit-button").click();
    await page.waitForURL("**/agents/");
    await expect(page.getByTestId("agent-grid")).toBeVisible();
  });

  for (const bad of ["//evil.example", "https://evil.example", "javascript:alert(1)"]) {
    test(`unsafe next=${bad} is ignored`, async ({ page }) => {
      await page.goto(`/login/?next=${encodeURIComponent(bad)}`);
      await page.getByTestId("email-input").fill("user@beachday.test");
      await page.getByTestId("password-input").fill("a-long-enough-password");
      await page.getByTestId("submit-button").click();
      await page.waitForURL((u) => u.origin === new URL(page.url()).origin && u.pathname === "/");
      expect(new URL(page.url()).hostname).not.toContain("evil");
    });
  }

  test("forgot password gives the same message for any address", async ({ page }) => {
    await page.goto("/login/");
    await page.getByTestId("forgot-link").click();
    await expect(page.getByTestId("forgot-form")).toBeVisible();
    await page.getByTestId("forgot-email-input").fill("nobody@beachday.test");
    await page.getByTestId("forgot-submit").click();
    await expect(page.getByTestId("forgot-sent-message")).toHaveText("If that address has an account, we've sent a link to reset your password. If no email arrives in a few minutes, check spam, then send it again.");
    await expect(page.getByTestId("forgot-back")).toBeVisible();
  });

  test("Continue with Google requests the authorize redirect", async ({ page, context }) => {
    await context.route("https://beachday-test.supabase.co/auth/v1/authorize**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>google</title>" }));
    await page.goto("/login/");
    const req = page.waitForRequest((r) => r.url().startsWith(`${SUPABASE}/auth/v1/authorize`) && r.url().includes("provider=google"));
    await page.getByTestId("google-button").click();
    await req;
  });

  test("already signed in shows the signed-in state and signs out", async ({ page, context }) => {
    await seedSession(context, "tok_user");
    await page.goto("/login/");
    await expect(page.getByTestId("login-signed-in")).toContainText("user@beachday.test");
    await expect(page.getByTestId("login-form")).toBeHidden();
    await page.getByTestId("signout-button").click();
    await page.waitForURL("**/login/");
    await expect(page.getByTestId("login-form")).toBeVisible();
  });

  test("reset page without a recovery link says the link is invalid", async ({ page }) => {
    await page.goto("/login/reset/");
    await expect(page.locator("h1")).toHaveText("Choose a new password");
    await expect(page.getByTestId("reset-invalid-link")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("reset-invalid-link")).toContainText("This reset link has expired or was already used.");
  });
});
