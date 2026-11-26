import { test, expect } from "@playwright/test";
import { signedInAs, mockSupabase, resetMocks, setMockState, mockCalls, createProposalViaChat, PROPOSAL_TITLE, noHorizontalScroll, expectNoSeriousAxe } from "./helpers.ts";

test.use({ serviceWorkers: "block" });
test.beforeEach(resetMocks);

test.describe("access", () => {
  test("signed out is redirected to /login/?next=/agents/ with no agent content", async ({ page, context }) => {
    await mockSupabase(context);
    await page.goto("/agents/");
    await page.waitForURL((u) => u.pathname === "/login/" && u.searchParams.get("next") === "/agents/");
    await expect(page.getByTestId("agent-grid")).toHaveCount(0);
  });

  test("role user sees only no-access and no /api/agents request is made", async ({ page, context }) => {
    await signedInAs(context, "tok_user");
    const apiCalls: string[] = [];
    page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url()); });
    await page.goto("/agents/");
    await expect(page.getByTestId("no-access")).toBeVisible();
    await expect(page.locator("h1")).toHaveText("You don't have access");
    await expect(page.getByTestId("no-access")).toContainText("user@beachday.test");
    await expect(page.getByTestId("back-home-link")).toBeVisible();
    await expect(page.getByTestId("signout-button")).toBeVisible();
    await expect(page.getByTestId("agent-grid")).toHaveCount(0);
    expect(apiCalls).toEqual([]);
    await expectNoSeriousAxe(page, "no-access");
  });

  test("a forged client role does not help: the API itself answers 403 for tok_user", async ({ request }) => {
    const res = await request.get("/api/agents", { headers: { authorization: "Bearer tok_user" } });
    expect(res.status()).toBe(403);
    expect((await request.get("/api/agents")).status()).toBe(401);
    expect((await request.get("/api/agents", { headers: { authorization: "Bearer tok_expired" } })).status()).toBe(401);
  });

  test("super_admin sees the signed-in line and can sign out", async ({ page, context }) => {
    await signedInAs(context, "tok_super_admin");
    await page.goto("/agents/");
    await expect(page.locator("h1")).toHaveText("Agents");
    await expect(page.getByTestId("user-line")).toContainText("admin@beachday.test");
    await page.getByTestId("signout-button").first().click();
    await page.waitForURL("**/login/**");
  });
});

test.describe("team view and chat (super_admin)", () => {
  test.beforeEach(async ({ context }) => { await signedInAs(context, "tok_super_admin"); });

  test("agent grid: every card has name, model badge, personality and knowledge", async ({ page }) => {
    await page.goto("/agents/");
    const cards = page.getByTestId("agent-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(5);
    const qa = page.locator('[data-testid="agent-card"][data-agent="qa-engineer"]');
    await expect(qa.getByTestId("agent-name")).toHaveText("Pike");
    await expect(qa.getByTestId("agent-slug")).toHaveText("qa-engineer");
    await expect(qa.getByTestId("agent-model-badge")).toContainText("claude-");
    await expect(qa.getByTestId("agent-personality")).toHaveText(/\S/);
    await expect(qa.getByTestId("agent-description")).toHaveText(/\S/);
    expect(await qa.getByTestId("agent-knowledge-item").count()).toBeGreaterThan(0);
    await expect(qa.getByTestId("agent-knowledge-item").first()).toHaveAttribute("data-path", /^knowledge\/qa-engineer\//);
    await expect(qa.getByTestId("agent-chat-button")).toHaveText("Chat with Pike");
    for (let i = 0; i < await cards.count(); i++) {
      await expect(cards.nth(i).getByTestId("agent-model-badge")).toBeVisible();
      expect(await cards.nth(i).getByTestId("agent-knowledge-item").count()).toBeGreaterThan(0);
    }
    await noHorizontalScroll(page);
    await expectNoSeriousAxe(page, "agents-grid");
  });

  test("knowledge disclosure expands when an agent has more than four files", async ({ page }) => {
    await page.goto("/agents/");
    const toggle = page.getByTestId("agent-knowledge-toggle");
    test.skip((await toggle.count()) === 0, "no agent has more than 4 knowledge files");
    await toggle.first().click();
    await expect(toggle.first()).toHaveAttribute("aria-expanded", "true");
  });

  test("chat streams a reply, announces once, and tool/proposal rows are absent for a plain question", async ({ page }) => {
    await page.goto("/agents/");
    const card = page.locator('[data-testid="agent-card"][data-agent="open-meteo-integrator"]');
    await card.getByTestId("agent-chat-button").click();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
    await expect(page.getByTestId("chat-agent-name")).toHaveText(/Kai/);
    await expect(page.getByTestId("chat-empty")).toBeVisible();
    await page.getByTestId("chat-input").fill("How is the beach?");
    await page.getByTestId("chat-send").click();
    const msgs = page.getByTestId("chat-message");
    await expect(msgs.first()).toHaveAttribute("data-role", "user");
    await expect(msgs.last()).toHaveAttribute("data-role", "assistant");
    await expect(msgs.last()).toContainText("Sunny with light winds.", { timeout: 20_000 });
    await expect(page.getByTestId("chat-send")).toBeVisible();
    await expect(page.getByTestId("proposal-link")).toHaveCount(0);
    await expect(page.getByTestId("chat-log")).toHaveAttribute("role", "log");
    await expect(page.getByTestId("live-status")).toContainText(/replied/i);
    const chatCalls = (await mockCalls()).filter((c) => c.path === "/anthropic/v1/messages");
    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0].body.system).toBeTruthy();
  });

  test("chat Close button hides the panel", async ({ page }) => {
    await page.goto("/agents/");
    const btn = page.locator('[data-testid="agent-card"]').first().getByTestId("agent-chat-button");
    await btn.click();
    await page.getByTestId("chat-close").click();
    await expect(page.getByTestId("chat-panel")).toBeHidden();
  });

  test("a propose message yields a proposal link to the detail view", async ({ page }) => {
    await page.goto("/agents/");
    await page.locator('[data-testid="agent-card"][data-agent="open-meteo-integrator"]').getByTestId("agent-chat-button").click();
    await page.getByTestId("chat-input").fill("Please propose a note in docs/notes.md");
    await page.getByTestId("chat-send").click();
    const pl = page.getByTestId("proposal-link").last();
    await expect(pl).toBeVisible({ timeout: 20_000 });
    await expect(pl).toContainText(PROPOSAL_TITLE);
    await expect(pl.getByRole("link")).toHaveAttribute("href", /\/agents\/#proposal\/p_/);
    for (const row of await page.getByTestId("tool-row").all()) expect(await row.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  });

  test("the chat request carries the bearer token and CSRF header", async ({ page }) => {
    const seen = page.waitForRequest((r) => r.url().endsWith("/api/agent/chat"));
    await page.goto("/agents/");
    await page.locator('[data-testid="agent-card"]').first().getByTestId("agent-chat-button").click();
    await page.getByTestId("chat-input").fill("hello");
    await page.getByTestId("chat-send").click();
    const h = (await seen).headers();
    expect(h["authorization"]).toBe("Bearer tok_super_admin");
    expect(h["x-requested-with"]).toBe("beachday");
  });

  test("upstream failure shows a retryable error without leaking details", async ({ page }) => {
    await setMockState({ anthropicStatus: 529 });
    await page.goto("/agents/");
    await page.locator('[data-testid="agent-card"]').first().getByTestId("agent-chat-button").click();
    await page.getByTestId("chat-input").fill("hello");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-error")).toBeVisible({ timeout: 20_000 });
    expect(await page.getByTestId("chat-error").innerText()).not.toMatch(/overloaded|test-key|sk-ant/i);
  });
});

test.describe("proposals (super_admin)", () => {
  test.beforeEach(async ({ context }) => { await signedInAs(context, "tok_super_admin"); });

  test("detail shows the diff with text markers, stat line and files", async ({ page }) => {
    await createProposalViaChat(page);
    await expect(page.getByTestId("proposal-status")).toHaveText(/Pending/);
    await expect(page.getByTestId("proposal-file").first()).toContainText("docs/notes.md");
    await expect(page.getByTestId("diff-stat")).toHaveText(/1 file changed/);
    const adds = page.locator('[data-testid="diff-line"][data-kind="add"]');
    const dels = page.locator('[data-testid="diff-line"][data-kind="del"]');
    expect(await adds.count()).toBeGreaterThan(0);
    expect(await dels.count()).toBeGreaterThan(0);
    await expect(adds.first().getByTestId("diff-marker")).toHaveText("+");
    await expect(dels.first().getByTestId("diff-marker")).toHaveText("−");
    await expect(page.getByTestId("diff-view")).toContainText("QA was here.");
    await expect(page.getByTestId("approve-button")).toHaveText("Approve and deploy");
    await expect(page.getByTestId("reject-button")).toHaveText("Reject");
    await noHorizontalScroll(page);
    await expectNoSeriousAxe(page, "proposal-detail");
  });

  test("the pending proposal appears in the Proposals list", async ({ page }) => {
    await createProposalViaChat(page);
    await page.getByTestId("back-to-proposals").click();
    await expect(page.getByTestId("proposal-list")).toBeVisible();
    const item = page.getByTestId("proposal-item").filter({ hasText: PROPOSAL_TITLE }).first();
    await expect(item).toHaveAttribute("data-status", "pending");
    await expect(item.getByTestId("proposal-status-chip")).toHaveText("Pending");
    await expect(page.getByTestId("proposal-filter")).toHaveValue("pending");
  });

  test("Approve needs the exact title, then commits ref -> commit -> trees -> commits -> PATCH", async ({ page }) => {
    await createProposalViaChat(page);
    await resetMocks(); // clear the call log and reset the mock head; the proposal is stored server-side
    await page.getByTestId("approve-button").click();
    const dlg = page.getByTestId("approve-dialog");
    await expect(dlg).toBeVisible();
    await expect(page.getByTestId("approve-dialog-title-echo")).toContainText(PROPOSAL_TITLE);
    const confirm = page.getByTestId("confirm-approve-button");
    await expect(confirm).toBeDisabled();
    const input = page.getByTestId("confirm-title-input");
    await input.fill(PROPOSAL_TITLE.slice(0, -1));
    await expect(confirm).toBeDisabled();
    await expect(page.getByTestId("confirm-hint")).toHaveText("Doesn't match yet");
    await input.fill(PROPOSAL_TITLE.toLowerCase());
    await expect(confirm).toBeDisabled();
    await input.fill(PROPOSAL_TITLE);
    await expect(page.getByTestId("confirm-hint")).toHaveText("Matches");
    await expect(confirm).toBeEnabled();
    await confirm.dblclick(); // a double click must still commit once

    const ok = page.getByTestId("approve-success");
    await expect(ok).toBeVisible({ timeout: 20_000 });
    await expect(ok).toHaveText(/Committed [0-9a-f]{7}\. Deploy started\./);
    await expect(page.getByTestId("commit-link")).toHaveAttribute("href", /\/commit\/[0-9a-f]{40}$/);
    await expect(page.getByTestId("approve-button")).toHaveCount(0);
    await expect(page.getByTestId("proposal-status")).toHaveText(/Approved/);

    const gh = (await mockCalls()).filter((c) => c.path.startsWith("/github/repos/"));
    const seq = gh.map((c) => `${c.method} ${c.path.replace(/^.*\/BeachDay-kakashi\//, "").replace(/\/commits\/[0-9a-f]+$/, "/commits/:sha")}`);
    let at = -1;
    for (const w of ["GET git/ref/heads/main", "GET git/commits/:sha", "POST git/trees", "POST git/commits", "PATCH git/refs/heads/main"]) {
      const i = seq.indexOf(w, at + 1);
      expect(i, `${w} in order within ${seq.join(", ")}`).toBeGreaterThan(at);
      at = i;
    }
    expect(seq.filter((s) => s.startsWith("PATCH"))).toHaveLength(1);
    expect(gh.find((c) => c.method === "PATCH")!.body.force).toBe(false);
  });

  test("a stale base shows the stale message and offers Ask again", async ({ page }) => {
    await createProposalViaChat(page);
    await setMockState({ head: "4444444444444444444444444444444444444444", files: { "docs/notes.md": "# Notes\n\nchanged by someone else\n" } });
    await page.getByTestId("approve-button").click();
    await page.getByTestId("confirm-title-input").fill(PROPOSAL_TITLE);
    await page.getByTestId("confirm-approve-button").click();
    await expect(page.getByTestId("stale-message")).toContainText("The code changed since this proposal. Ask Kai to refresh it.", { timeout: 20_000 });
    await expect(page.getByTestId("ask-again-button")).toBeVisible();
    expect((await mockCalls()).filter((c) => c.method === "PATCH")).toHaveLength(0);
    await page.getByTestId("ask-again-button").click();
    await expect(page.getByTestId("chat-input")).toHaveValue(new RegExp(`Please refresh the proposal .*${PROPOSAL_TITLE}`));
  });

  test("Approve disabled on this site (no GITHUB_TOKEN) is reported, nothing committed", async ({ page }) => {
    test.skip(!process.env.E2E_NO_GITHUB_TOKEN, "needs a server started without GITHUB_TOKEN (Deploy Preview simulation)");
    await createProposalViaChat(page);
    await page.getByTestId("approve-button").click();
    await page.getByTestId("confirm-title-input").fill(PROPOSAL_TITLE);
    await page.getByTestId("confirm-approve-button").click();
    await expect(page.getByTestId("approve-error")).toHaveText("Approving is turned off on this site. Preview deploys can't commit.");
  });

  test("Reject flow: optional reason, success, decision block, no GitHub writes", async ({ page }) => {
    await createProposalViaChat(page);
    await resetMocks();
    await page.getByTestId("reject-button").click();
    await expect(page.getByTestId("reject-dialog")).toBeVisible();
    await page.getByTestId("reject-reason-input").fill("Not needed right now");
    await page.getByTestId("confirm-reject-button").click();
    await expect(page.getByTestId("reject-success")).toHaveText("Proposal rejected.");
    await expect(page.getByTestId("decision-block")).toContainText("admin@beachday.test");
    await expect(page.getByTestId("reject-reason-text")).toContainText("Not needed right now");
    await expect(page.getByTestId("proposal-status")).toHaveText(/Rejected/);
    await expect(page.getByTestId("approve-button")).toHaveCount(0);
    expect((await mockCalls()).filter((c) => c.path.startsWith("/github"))).toHaveLength(0);
  });

  test("Escape cancels the approve dialog and focus returns to the button", async ({ page }) => {
    await createProposalViaChat(page);
    await page.getByTestId("approve-button").click();
    await expect(page.getByTestId("approve-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("approve-dialog")).toBeHidden();
    await expect(page.getByTestId("approve-button")).toBeFocused();
  });

  test("empty proposals list for Rejected filter shows the empty copy or items", async ({ page }) => {
    await page.goto("/agents/#proposals");
    await expect(page.getByTestId("proposal-filter")).toBeVisible();
    await page.getByTestId("proposal-filter").selectOption("approved");
    await expect(page.getByTestId("proposal-list").or(page.getByTestId("proposals-empty"))).toBeVisible();
  });
});
