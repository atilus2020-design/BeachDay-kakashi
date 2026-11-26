import { expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const MOCK = `http://127.0.0.1:${process.env.MOCK_PORT || 9100}`;
export const SUPABASE = "https://beachday-test.supabase.co";
export const PROPOSAL_TITLE = "Add QA note to docs/notes.md";

export const USERS = {
  tok_super_admin: { id: "00000000-0000-4000-8000-000000000001", email: "admin@beachday.test", role: "super_admin" },
  tok_user: { id: "00000000-0000-4000-8000-000000000002", email: "user@beachday.test", role: "user" },
} as const;
type Tok = keyof typeof USERS;

export async function mockApi(method: string, path: string, body?: unknown) {
  const r = await fetch(MOCK + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
}
export const resetMocks = () => mockApi("DELETE", "/__calls");
export const setMockState = (s: Record<string, unknown>) => mockApi("POST", "/__state", s);
export const mockCalls = (): Promise<any[]> => mockApi("GET", "/__calls");

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "*",
};
const session = (tok: Tok) => {
  const u = USERS[tok];
  return {
    access_token: tok, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh_${tok}`,
    user: { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
};

/** Fulfils every browser call to the test Supabase project. Password "wrong-password" is rejected. */
export async function mockSupabase(context: BrowserContext, opts: { signupOk?: boolean } = {}) {
  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const tok = (/^Bearer (.+)$/.exec(req.headers()["authorization"] || "")?.[1] ?? "") as Tok;
    if (url.pathname === "/auth/v1/token") {
      const b = req.postDataJSON?.() ?? {};
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const t = String(b.refresh_token || "").replace("refresh_", "") as Tok;
        return USERS[t] ? json(200, session(t)) : json(400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
      }
      if (b.password === "wrong-password" || !b.email) return json(400, { error: "invalid_grant", error_code: "invalid_credentials", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
      return json(200, session(/admin/.test(b.email) ? "tok_super_admin" : "tok_user"));
    }
    if (url.pathname === "/auth/v1/user") return USERS[tok] ? json(200, session(tok).user) : json(401, { code: 401, msg: "invalid JWT" });
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === "/auth/v1/recover") return json(200, {});
    if (url.pathname === "/auth/v1/signup") {
      if (opts.signupOk === false) return json(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "rate limit" });
      const b = req.postDataJSON?.() ?? {};
      return json(200, { id: USERS.tok_user.id, aud: "authenticated", email: b.email, identities: [{}], app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    }
    if (url.pathname === "/rest/v1/profiles") {
      const u = USERS[tok];
      if (!u) return json(401, { code: "PGRST301", message: "JWT invalid" });
      const row = { id: u.id, email: u.email, role: u.role };
      return /pgrst\.object/.test(req.headers()["accept"] || "") ? json(200, row) : json(200, [row]);
    }
    return json(404, { message: "unmocked" });
  });
}

/** Pre-seeds a signed-in supabase-js session (storage key sb-<project ref>-auth-token). */
export async function seedSession(context: BrowserContext, tok: Tok) {
  await context.addInitScript(([key, value]) => { try { if (!sessionStorage.getItem("e2e-seeded")) { sessionStorage.setItem("e2e-seeded", "1"); localStorage.setItem(key, value); } } catch { /* ignore */ } }, ["sb-beachday-test-auth-token", JSON.stringify(session(tok))] as const);
}

export async function signedInAs(context: BrowserContext, tok: Tok) {
  await mockSupabase(context);
  await seedSession(context, tok);
}

export async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

export async function expectNoSeriousAxe(page: Page, label = "") {
  const r = await new AxeBuilder({ page: page as any }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${label} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

export async function expectTarget44(page: Page, testid: string) {
  const els = page.getByTestId(testid);
  const n = await els.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = await els.nth(i).boundingBox();
    expect(b, `${testid}[${i}] visible`).not.toBeNull();
    expect(b!.height, `${testid}[${i}] height`).toBeGreaterThanOrEqual(43.5);
    expect(b!.width, `${testid}[${i}] width`).toBeGreaterThanOrEqual(43.5);
  }
}

/** Opens /agents/ as signed-in super_admin, chats "propose", follows the proposal link to the detail view. */
export async function createProposalViaChat(page: Page, agent = "open-meteo-integrator") {
  await page.goto("/agents/");
  await page.locator(`[data-testid="agent-card"][data-agent="${agent}"]`).getByTestId("agent-chat-button").click();
  await page.getByTestId("chat-input").fill("Please propose a note in docs/notes.md");
  await page.getByTestId("chat-send").click();
  const link = page.getByTestId("proposal-link").last();
  await expect(link).toBeVisible({ timeout: 20_000 });
  await link.getByRole("link").click();
  await expect(page.getByTestId("proposal-detail")).toBeVisible();
  await expect(page.getByTestId("proposal-title")).toHaveText(PROPOSAL_TITLE);
}
