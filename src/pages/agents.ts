// Agents page (super_admin only): access gate, agent grid, chat (SSE), proposals list + detail, Approve and Reject.
// Docs: docs/ux/flows.md §5, docs/ux/copy.md §5. Every server or model string is set with textContent (via h()).
import { requireSuperAdmin, signOut, getAccessToken, supabase } from "../lib/auth.ts";
import { configureApi, apiGet, apiPost, apiStream, isApiFailure, type ApiFailure } from "../lib/api.ts";
import { readSse } from "../lib/sse.ts";
import { mountShell, setSignOut, hideAuthSlot, announce } from "../lib/shell.ts";
import { h, icon, clear, relTime, fmtDateLong, plural, type Child } from "../lib/dom.ts";
import { registerServiceWorker } from "../pwa/register.ts";
import type {
  AgentSummary, AgentsResponse, ApproveResponse, ChatMessage, Proposal, ProposalStatus, ProposalSummary, ProposalsResponse,
} from "../shared/contracts.ts";

const app = document.getElementById("app") as HTMLElement;
const MAX_MESSAGES = 30;
const MAX_BYTES = 100_000;
const SAFE_ID = /^[\w.-]{1,100}$/;

let email: string | null = null;
let agents: AgentSummary[] = [];
let agentsState: "loading" | "error" | "ok" = "loading";

const nameOf = (slug: string): string => agents.find((a) => a.name === slug)?.displayName ?? slug;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const modelBadge = (a: AgentSummary): string => `${a.modelAlias === "custom" ? "Custom" : cap(a.modelAlias)} · ${a.model}`;
const sha7 = (s: string): string => s.slice(0, 7);
const dayOf = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : fmtDateLong(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); };

// ============================================================ boot / access gate

mountShell();
hideAuthSlot();
registerServiceWorker();
configureApi({
  getToken: getAccessToken,
  onUnauthorized: () => location.assign(`/login/?next=${encodeURIComponent(location.pathname + location.hash)}`),
});

function showChecking(): void {
  app.replaceChildren(h("p", { testid: "agents-checking", "aria-busy": "true" }, "Checking your access…"));
}

function showAccessError(): void {
  app.replaceChildren(
    h("h1", { class: "page-title" }, "Agents"),
    h("div", { class: "form-error", testid: "agents-error", role: "alert" }, "Sign-in service unavailable, try again later."),
    h("button", { type: "button", class: "btn btn--primary", testid: "retry-button", on: { click: () => void boot() } }, "Try again"),
  );
}

function showNoAccess(): void {
  setSignOut(null);
  hideAuthSlot();
  streaming?.abort();
  document.querySelectorAll("dialog.dialog").forEach((d) => d.remove());
  app.replaceChildren(h("section", { testid: "no-access" },
    h("h1", { class: "page-title" }, "You don't have access"),
    h("p", {}, email ? `Only the project owner can open Agents. You're signed in as ${email}.` : "Only the project owner can open Agents."),
    h("div", { class: "btn-row" },
      h("a", { class: "btn btn--primary", href: "/", testid: "back-home-link" }, "Back to Beach Day"),
      h("button", { type: "button", class: "btn btn--secondary", testid: "signout-button", on: { click: () => void doSignOut() } }, "Sign out"),
    ),
  ));
}

async function doSignOut(): Promise<void> {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("bd-chat:")) sessionStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
  transcripts.clear();
  try { await signOut(); } catch { /* still leave */ }
  location.assign("/login/");
}

/** True when the error was a 403 (page replaced by no-access) so callers stop. */
function forbidden(e: unknown): boolean {
  if (isApiFailure(e) && e.status === 403) { showNoAccess(); return true; }
  return false;
}

async function boot(): Promise<void> {
  showChecking();
  try {
    const r = await requireSuperAdmin("/agents/" + location.hash);
    try { email = (await supabase?.auth.getSession())?.data.session?.user?.email ?? null; } catch { email = null; }
    if (r !== "ok") return showNoAccess();
  } catch {
    return showAccessError();
  }
  setSignOut(doSignOut);
  buildShellOfPage();
  void loadAgents();
  void refreshCount();
  route();
}

// ============================================================ page frame + router

let teamView: HTMLElement, listView: HTMLElement, detailView: HTMLElement;
let tabTeam: HTMLButtonElement, tabProposals: HTMLButtonElement, countEl: HTMLElement;

function buildShellOfPage(): void {
  countEl = h("span", { class: "pill", testid: "proposals-count", hidden: true });
  tabTeam = h("button", { type: "button", class: "btn btn--secondary", role: "tab", testid: "tab-team", id: "tab-team", "aria-controls": "panel-team", on: { click: () => { location.hash = "#team"; } } }, "Team");
  tabProposals = h("button", { type: "button", class: "btn btn--secondary", role: "tab", testid: "tab-proposals", id: "tab-proposals", "aria-controls": "panel-proposals", on: { click: () => { location.hash = "#proposals"; } } }, "Proposals ", countEl);
  teamView = h("div", { id: "panel-team", role: "tabpanel", "aria-labelledby": "tab-team" });
  listView = h("div", { id: "panel-proposals", role: "tabpanel", "aria-labelledby": "tab-proposals", hidden: true });
  detailView = h("div", { hidden: true });
  const tabs = h("div", { class: "btn-row", role: "tablist", "aria-label": "Agents views" }, tabTeam, tabProposals);
  tabs.addEventListener("keydown", (ev) => {
    const k = (ev as KeyboardEvent).key;
    if (k === "ArrowRight" || k === "ArrowLeft") { (document.activeElement === tabTeam ? tabProposals : tabTeam).click(); (document.activeElement === tabTeam ? tabProposals : tabTeam).focus(); }
  });
  app.replaceChildren(
    h("h1", { class: "page-title" }, "Agents"),
    h("p", { class: "text-2", testid: "user-line" }, email ? `Signed in as ${email}` : "Signed in"),
    tabs,
    h("div", { class: "section" }, teamView, listView, detailView),
  );
  window.addEventListener("hashchange", route);
}

function setTabs(which: "team" | "proposals"): void {
  tabTeam.setAttribute("aria-selected", String(which === "team"));
  tabProposals.setAttribute("aria-selected", String(which === "proposals"));
  tabTeam.tabIndex = which === "team" ? 0 : -1;
  tabProposals.tabIndex = which === "proposals" ? 0 : -1;
  tabTeam.classList.toggle("btn--primary", which === "team");
  tabTeam.classList.toggle("btn--secondary", which !== "team");
  tabProposals.classList.toggle("btn--primary", which === "proposals");
  tabProposals.classList.toggle("btn--secondary", which !== "proposals");
}

let listFilter: ProposalStatus | "all" = "pending";

function route(): void {
  if (!teamView || !teamView.isConnected) return;
  let hash = "";
  try { hash = decodeURIComponent(location.hash.replace(/^#/, "")); } catch { hash = ""; } // malformed hash: team view
  teamView.hidden = listView.hidden = detailView.hidden = true;
  if (hash.startsWith("proposal/")) {
    setTabs("proposals");
    detailView.hidden = false;
    void showDetail(hash.slice("proposal/".length));
  } else if (hash === "proposals") {
    setTabs("proposals");
    listView.hidden = false;
    void showList();
  } else {
    setTabs("team");
    teamView.hidden = false;
  }
}

async function refreshCount(): Promise<void> {
  try {
    const r = await apiGet<ProposalsResponse>("/api/proposals?status=pending");
    countEl.textContent = String(r.proposals.length);
    countEl.hidden = r.proposals.length === 0;
  } catch (e) { forbidden(e); }
}

// ============================================================ team grid

async function loadAgents(): Promise<void> {
  agentsState = "loading";
  teamView.replaceChildren(h("div", { testid: "agents-loading", "aria-busy": "true" },
    h("span", { class: "skeleton skeleton--block" }), h("span", { class: "skeleton skeleton--block section" })));
  announce("Loading agents.");
  try {
    agents = (await apiGet<AgentsResponse>("/api/agents")).agents;
    agentsState = "ok";
    renderTeam();
  } catch (e) {
    if (forbidden(e)) return;
    agentsState = "error";
    teamView.replaceChildren(
      h("div", { class: "form-error", testid: "agents-error", role: "alert" }, "Couldn't load the agents."),
      h("button", { type: "button", class: "btn btn--primary", testid: "retry-button", on: { click: () => void loadAgents() } }, "Try again"),
    );
  }
}

let panel: HTMLElement;
let selectedAgent: string | null = null;

function agentCard(a: AgentSummary): HTMLElement {
  const many = a.knowledge.length > 4;
  const list = h("ul", { class: "knowledge-list", testid: "agent-knowledge-list", id: `kn-${a.name}`, hidden: many },
    ...(a.knowledge.length
      ? a.knowledge.map((k) => h("li", { testid: "agent-knowledge-item", "data-path": k.path }, h("div", {}, k.title), h("div", { class: "text-2" }, k.path)))
      : [h("li", {}, "No knowledge files.")]));
  const toggle = many
    ? h("button", { type: "button", class: "btn btn--secondary", testid: "agent-knowledge-toggle", "aria-expanded": "false", "aria-controls": `kn-${a.name}`, on: { click: (ev: Event) => {
      const b = ev.currentTarget as HTMLButtonElement;
      const open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open));
      list.hidden = !open;
      b.textContent = open ? "Hide files" : `Show ${a.knowledge.length} files`;
    } } }, `Show ${a.knowledge.length} files`)
    : null;
  return h("article", { class: `agent-card${selectedAgent === a.name ? " agent-card--selected" : ""}`, testid: "agent-card", "data-agent": a.name },
    h("h2", { class: "agent-card__name", testid: "agent-name" }, a.displayName),
    h("p", { class: "text-2", testid: "agent-slug" }, a.name),
    h("span", { class: "pill pill--model agent-card__model", testid: "agent-model-badge" }, modelBadge(a)),
    h("p", { testid: "agent-personality" }, a.personality),
    h("p", { class: "agent-card__desc", testid: "agent-description" }, a.description),
    h("p", { class: "field__label" }, "Knowledge"),
    list,
    toggle,
    h("button", { type: "button", class: "btn btn--primary", testid: "agent-chat-button", on: { click: () => openChat(a.name) } }, `Chat with ${a.displayName}`),
  );
}

function renderTeam(): void {
  panel = h("section", { class: "card chat", testid: "chat-panel", "aria-label": "Chat", hidden: true });
  teamView.replaceChildren(
    h("ul", { class: "agent-grid", testid: "agent-grid" }, ...agents.map((a) => h("li", {}, agentCard(a)))),
    h("div", { class: "section" }, panel),
  );
  if (selectedAgent && agents.some((a) => a.name === selectedAgent)) openChat(selectedAgent);
}

// ============================================================ chat

type Part = { t: "text"; text: string } | { t: "tool"; name: string; path?: string } | { t: "proposal"; id: string; title: string };
interface Turn { role: "user" | "assistant"; parts: Part[] }
interface PanelError { text: string; retry: boolean }

const transcripts = new Map<string, Turn[]>();
let streaming: AbortController | null = null;
let panelError: PanelError | null = null;
let ui: { agent: AgentSummary; log: HTMLElement; input: HTMLTextAreaElement; send: HTMLButtonElement; stop: HTMLButtonElement; status: HTMLElement } | null = null;

const storeKey = (agent: string): string => `bd-chat:${agent}`;

function validPart(p: unknown): p is Part {
  const o = p as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return false;
  if (o.t === "text") return typeof o.text === "string";
  if (o.t === "tool") return typeof o.name === "string" && (o.path === undefined || typeof o.path === "string");
  if (o.t === "proposal") return typeof o.id === "string" && SAFE_ID.test(o.id) && typeof o.title === "string";
  return false;
}
function getTurns(agent: string): Turn[] {
  let t = transcripts.get(agent);
  if (t) return t;
  t = [];
  try {
    const raw = JSON.parse(sessionStorage.getItem(storeKey(agent)) ?? "[]") as unknown;
    if (Array.isArray(raw)) for (const x of raw as Turn[]) if ((x?.role === "user" || x?.role === "assistant") && Array.isArray(x.parts)) t.push({ role: x.role, parts: x.parts.filter(validPart) });
  } catch { /* corrupt or blocked */ }
  transcripts.set(agent, t);
  return t;
}
function persist(agent: string): void {
  try {
    const t = transcripts.get(agent) ?? [];
    if (t.length) sessionStorage.setItem(storeKey(agent), JSON.stringify(t)); else sessionStorage.removeItem(storeKey(agent));
  } catch { /* ignore */ }
}
function toMessages(turns: Turn[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const t of turns) {
    const content = t.parts.filter((p): p is Extract<Part, { t: "text" }> => p.t === "text").map((p) => p.text).join("\n\n");
    if (content.trim()) out.push({ role: t.role, content });
  }
  return out;
}

function toolSummary(p: Extract<Part, { t: "tool" }>): string {
  if (p.name === "read_file" && p.path) return `Read ${p.path}`;
  if (p.name === "list_files") return `Listed ${p.path ?? "files"}`;
  if (p.name === "search" && p.path) return `Searched for "${p.path}"`;
  return `Used ${p.name}`;
}

function partNode(p: Part, agent: AgentSummary): HTMLElement {
  if (p.t === "text") return h("div", { class: "bubble bubble--assistant", testid: "chat-message", "data-role": "assistant" }, p.text);
  if (p.t === "tool") {
    return h("details", { class: "tool-row", testid: "tool-row", "data-tool": p.name },
      h("summary", {}, toolSummary(p)), h("div", {}, `Tool: ${p.name}`), p.path ? h("div", {}, p.path) : null);
  }
  return h("div", { class: "card", testid: "proposal-link" },
    h("p", {}, `${agent.displayName} proposed: ${p.title}`),
    h("a", { class: "btn btn--secondary", href: `/agents/#proposal/${encodeURIComponent(p.id)}` }, "Review proposal"));
}

function turnNodes(t: Turn, agent: AgentSummary): HTMLElement[] {
  if (t.role === "user") {
    const text = t.parts.map((p) => (p.t === "text" ? p.text : "")).join("");
    return [h("div", { class: "bubble bubble--user", testid: "chat-message", "data-role": "user" }, text)];
  }
  return t.parts.map((p) => partNode(p, agent));
}

function renderLog(): void {
  if (!ui) return;
  const { agent, log } = ui;
  const turns = getTurns(agent.name);
  clear(log);
  if (!turns.length) log.append(h("p", { class: "text-2", testid: "chat-empty" }, `Ask ${agent.displayName} for help, or for a change to the app.`));
  for (const t of turns) log.append(...turnNodes(t, agent));
  if (panelError) {
    const err = panelError;
    log.append(h("div", { class: "form-error", testid: "chat-error", role: "alert" }, err.text,
      err.retry ? h("button", { type: "button", class: "btn btn--secondary", testid: "chat-retry", on: { click: () => retryLast() } }, "Retry") : null));
  }
  log.scrollTop = log.scrollHeight;
}

function setBusy(busy: boolean, thinking = false): void {
  if (!ui) return;
  ui.send.hidden = busy;
  ui.stop.hidden = !busy;
  ui.status.textContent = busy && thinking ? `${ui.agent.displayName} is thinking…` : "";
  ui.log.setAttribute("aria-busy", String(busy));
}

function openChat(name: string, prefill?: string): void {
  const agent = agents.find((a) => a.name === name);
  if (!agent || !panel) return;
  if (ui && ui.agent.name !== name) streaming?.abort();
  selectedAgent = name;
  teamView.querySelectorAll("[data-agent]").forEach((c) => c.classList.toggle("agent-card--selected", c.getAttribute("data-agent") === name));
  panelError = null;

  const log = h("div", { class: "chat__log", role: "log", "aria-live": "off", testid: "chat-log", tabindex: "0", "aria-label": `Conversation with ${agent.displayName}` });
  const input = h("textarea", { class: "textarea", id: "chat-input", testid: "chat-input", rows: "2", placeholder: `Ask ${agent.displayName} anything about their work` });
  const send = h("button", { type: "submit", class: "btn btn--primary", testid: "chat-send" }, "Send");
  const stop = h("button", { type: "button", class: "btn btn--secondary", testid: "chat-stop", hidden: true, on: { click: () => streaming?.abort() } }, "Stop");
  const status = h("p", { class: "text-2", testid: "chat-status" });
  ui = { agent, log, input, send, stop, status };

  const form = h("form", { class: "composer glass", on: { submit: (ev: Event) => { ev.preventDefault(); void sendMessage(); } } },
    h("label", { class: "visually-hidden", for: "chat-input" }, `Message ${agent.displayName}`), input, send, stop);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); void sendMessage(); }
  });
  panel.addEventListener("keydown", onPanelKey);
  const closeBtn = h("button", { type: "button", class: "btn btn--secondary", testid: "chat-close", on: { click: () => { streaming?.abort(); panel.hidden = true; ui = null; selectedAgent = null; teamView.querySelectorAll("[data-agent]").forEach((c) => c.classList.remove("agent-card--selected")); } } }, "Close");
  const clearBtn = h("button", { type: "button", class: "btn btn--secondary", testid: "chat-clear", on: { click: () => {
    streaming?.abort(); transcripts.set(agent.name, []); persist(agent.name); panelError = null; renderLog(); input.focus();
  } } }, "Clear chat");

  panel.replaceChildren(
    h("div", { class: "btn-row btn-row--apart" },
      h("div", {}, h("h2", { class: "card__title", testid: "chat-agent-name" }, agent.displayName), h("span", { class: "pill pill--model" }, modelBadge(agent))),
      h("div", { class: "btn-row" }, clearBtn, closeBtn)),
    log, status, form,
    h("p", { class: "field__hint" }, "Press Ctrl+Enter or ⌘+Enter to send."),
  );
  panel.hidden = false;
  renderLog();
  if (prefill !== undefined) input.value = prefill;
  panel.scrollIntoView({ block: "nearest" });
  input.focus({ preventScroll: true });
}

function onPanelKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape" && streaming) { ev.preventDefault(); streaming.abort(); }
}

function chatError(e: ApiFailure): PanelError {
  if (e.status === 0) return navigator.onLine ? { text: "Something went wrong. Try again.", retry: true } : { text: "You're offline. Chat needs a connection.", retry: false };
  if (e.status === 400) return { text: "That message couldn't be sent. Try a shorter one.", retry: false };
  if (e.status === 404) return { text: "That agent isn't available any more.", retry: false };
  if (e.status === 413) return { text: "That conversation is too long. Clear the chat and start again.", retry: false };
  if (e.status === 429) return { text: e.error === "Daily chat limit reached" ? "You've reached today's chat limit. Try again tomorrow." : "Too many messages. Wait a minute.", retry: false };
  if (e.status === 503) return { text: "Sign-in service unavailable, try again later.", retry: true };
  return { text: "Something went wrong. Try again.", retry: true };
}

function retryLast(): void {
  if (!ui) return;
  const turns = getTurns(ui.agent.name);
  if (turns.length && turns[turns.length - 1].role === "assistant") turns.pop();
  panelError = null;
  void run();
}

async function sendMessage(): Promise<void> {
  if (!ui || streaming) return;
  const text = ui.input.value;
  if (!text.trim()) return;
  const turns = getTurns(ui.agent.name);
  panelError = null;
  if (!navigator.onLine) { panelError = { text: "You're offline. Chat needs a connection.", retry: false }; renderLog(); return; }
  if (toMessages(turns).length + 1 > MAX_MESSAGES) { panelError = { text: "This conversation is full. Clear the chat to continue.", retry: false }; renderLog(); return; }
  turns.push({ role: "user", parts: [{ t: "text", text }] });
  ui.input.value = "";
  persist(ui.agent.name);
  await run();
}

async function run(): Promise<void> {
  if (!ui || streaming) return;
  const { agent } = ui;
  const turns = getTurns(agent.name);
  const messages = toMessages(turns);
  if (new TextEncoder().encode(JSON.stringify({ agent: agent.name, messages })).length > MAX_BYTES) {
    panelError = { text: "That conversation is too long. Clear the chat and start again.", retry: false };
    renderLog(); return;
  }
  const turn: Turn = { role: "assistant", parts: [] };
  turns.push(turn);
  renderLog();
  const ctl = new AbortController();
  streaming = ctl;
  setBusy(true, true);
  const view = ui; // the panel may be switched while streaming
  let bubble: HTMLElement | null = null;
  let failure: PanelError | null = null;
  const shown = (): boolean => ui === view;
  try {
    const res = await apiStream("/api/agent/chat", { agent: agent.name, messages }, ctl.signal);
    await readSse(res, (event, data) => {
      if (event === "text" && typeof data === "string") {
        const last = turn.parts[turn.parts.length - 1];
        if (last?.t === "text") last.text += data; else { turn.parts.push({ t: "text", text: data }); bubble = null; }
        if (shown()) {
          view.status.textContent = "";
          if (!bubble) {
            bubble = partNode(turn.parts[turn.parts.length - 1], agent);
            bubble.setAttribute("aria-busy", "true");
            view.log.querySelector('[data-testid="chat-empty"]')?.remove();
            view.log.append(bubble);
          } else bubble.textContent = (turn.parts[turn.parts.length - 1] as { text: string }).text;
          view.log.scrollTop = view.log.scrollHeight;
        }
      } else if (event === "tool" && data && typeof data === "object") {
        const d = data as { name?: unknown; path?: unknown };
        const part: Part = { t: "tool", name: String(d.name ?? "tool"), path: typeof d.path === "string" ? d.path : undefined };
        turn.parts.push(part); bubble = null;
        if (shown()) view.log.append(partNode(part, agent));
      } else if (event === "proposal" && data && typeof data === "object") {
        const d = data as { id?: unknown; title?: unknown };
        if (typeof d.id === "string" && SAFE_ID.test(d.id)) {
          const part: Part = { t: "proposal", id: d.id, title: String(d.title ?? "") };
          turn.parts.push(part); bubble = null;
          if (shown()) view.log.append(partNode(part, agent));
          void refreshCount();
        }
      } else if (event === "error") {
        failure = { text: "Agent unavailable, please retry.", retry: true };
      }
    });
  } catch (e) {
    if (ctl.signal.aborted) { /* stopped by the person */ }
    else if (isApiFailure(e)) {
      if (e.status === 401) { streaming = null; return; } // api layer redirects to login
      if (forbidden(e)) { streaming = null; return; }
      failure = chatError(e);
    } else failure = { text: "Something went wrong. Try again.", retry: true };
  }
  streaming = null;
  (bubble as HTMLElement | null)?.removeAttribute("aria-busy");
  if (!turn.parts.length) turns.splice(turns.indexOf(turn), 1);
  persist(agent.name);
  if (!shown()) return;
  panelError = failure;
  setBusy(false);
  renderLog();
  if (!failure && !ctl.signal.aborted) announce(`${agent.displayName} replied.`);
  view.input.focus({ preventScroll: true });
}

// ============================================================ proposals list

const STATUS_WORD: Record<ProposalStatus, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const EMPTY: Record<string, string> = { pending: "No pending proposals.", approved: "No approved proposals yet.", rejected: "No rejected proposals.", all: "No proposals yet." };

function chip(status: ProposalStatus, testid: string): HTMLElement {
  return h("span", { class: `pill ${status === "approved" ? "pill--great" : status === "rejected" ? "pill--poor" : "pill--fair"}`, testid, "data-status": status },
    icon(status === "approved" ? "check" : status === "rejected" ? "warning" : "clock", 16), STATUS_WORD[status]);
}

async function showList(): Promise<void> {
  const select = h("select", { class: "select", id: "proposal-filter", testid: "proposal-filter" },
    ...(["pending", "approved", "rejected", "all"] as const).map((v) => h("option", { value: v, selected: v === listFilter }, cap(v))));
  select.value = listFilter;
  const results = h("div", { "aria-live": "off" });
  select.addEventListener("change", () => { listFilter = select.value as typeof listFilter; void fill(); });
  listView.replaceChildren(h("div", { class: "field" }, h("label", { class: "field__label", for: "proposal-filter" }, "Status"), select), results);

  async function fill(): Promise<void> {
    results.replaceChildren(h("div", { testid: "proposals-loading", "aria-busy": "true" }, h("span", { class: "skeleton skeleton--block" })));
    try {
      const { proposals } = await apiGet<ProposalsResponse>(`/api/proposals?status=${encodeURIComponent(listFilter)}`);
      if (listFilter === "pending") { countEl.textContent = String(proposals.length); countEl.hidden = proposals.length === 0; }
      if (!proposals.length) {
        results.replaceChildren(h("div", { class: "card", testid: "proposals-empty" },
          h("p", {}, EMPTY[listFilter]), h("p", { class: "text-2" }, "Ask an agent for a change in the Team view."),
          h("button", { type: "button", class: "btn btn--primary", testid: "go-team-button", on: { click: () => { location.hash = "#team"; } } }, "Go to Team")));
        return;
      }
      results.replaceChildren(h("ul", { class: "proposal-list", testid: "proposal-list" }, ...proposals.map(proposalItem)));
    } catch (e) {
      if (forbidden(e)) return;
      results.replaceChildren(h("div", { class: "form-error", testid: "proposals-error", role: "alert" }, "Couldn't load proposals."),
        h("button", { type: "button", class: "btn btn--primary", testid: "retry-button", on: { click: () => void fill() } }, "Try again"));
    }
  }
  await fill();
}

function proposalItem(p: ProposalSummary): HTMLElement {
  return h("li", { class: "proposal-item card", testid: "proposal-item", "data-id": p.id, "data-status": p.status },
    SAFE_ID.test(p.id) ? h("a", { class: "btn btn--secondary", href: `#proposal/${encodeURIComponent(p.id)}` }, p.title) : h("span", {}, p.title),
    h("span", { class: "text-2" }, `by ${nameOf(p.agent)} · ${plural(p.fileCount, "file", "files")} · ${relTime(p.createdAt)}`),
    chip(p.status, "proposal-status-chip"));
}

// ============================================================ proposal detail

type Flash = { testid: string; text: string; kind: "info" | "stale"; agent?: string; title?: string };
const FILE_ACTION: Record<string, string> = { create: "Add", update: "Edit", delete: "Delete" };

async function showDetail(rawId: string, flash?: Flash): Promise<void> {
  if (!SAFE_ID.test(rawId)) { detailView.replaceChildren(detailError(404, rawId)); return; }
  detailView.replaceChildren(h("div", { testid: "proposal-loading", "aria-busy": "true" }, h("span", { class: "skeleton skeleton--block" })));
  try {
    const p = await apiGet<Proposal>(`/api/proposals/${encodeURIComponent(rawId)}`);
    if (location.hash.replace(/^#/, "") !== `proposal/${rawId}` && decodeURIComponent(location.hash.replace(/^#/, "")) !== `proposal/${rawId}`) return;
    renderDetail(p, flash);
  } catch (e) {
    if (forbidden(e)) return;
    detailView.replaceChildren(detailError(isApiFailure(e) ? e.status : 0, rawId));
  }
}

function detailError(status: number, id: string): HTMLElement {
  return h("div", { testid: "proposal-error" },
    h("p", { class: "form-error", role: "alert" }, status === 404 ? "That proposal doesn't exist." : "Couldn't load this proposal."),
    h("div", { class: "btn-row" },
      h("a", { class: "btn btn--secondary", href: "#proposals", testid: "back-to-proposals" }, "All proposals"),
      status === 404 ? null : h("button", { type: "button", class: "btn btn--primary", testid: "retry-button", on: { click: () => void showDetail(id) } }, "Try again")));
}

type DiffKind = "add" | "del" | "ctx" | "hunk" | "file";
function classify(line: string, state: { inHunk: boolean }): { kind: DiffKind; text: string } {
  if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ") || /^(new|deleted) file mode|^similarity |^rename |^old mode|^new mode/.test(line)) {
    if (line.startsWith("diff --git")) state.inHunk = false;
    return { kind: "file", text: line };
  }
  if (line.startsWith("@@")) { state.inHunk = true; return { kind: "hunk", text: line }; }
  if (state.inHunk && line.startsWith("+")) return { kind: "add", text: line.slice(1) };
  if (state.inHunk && line.startsWith("-")) return { kind: "del", text: line.slice(1) };
  if (line.startsWith("\\")) return { kind: "file", text: line };
  return { kind: "ctx", text: line.startsWith(" ") ? line.slice(1) : line };
}

const MARKER: Record<DiffKind, string> = { add: "+", del: "−", ctx: " ", hunk: "", file: "" };

function diffLine(kind: DiffKind, text: string): HTMLElement {
  // The marker is real text (+ or U+2212) in a span WITHOUT Sable's .diff__mark class, because that class
  // draws the same marker with CSS and it would show twice. See handoff OPEN.
  return h("div", { class: `diff__line diff__line--${kind === "file" ? "meta" : kind}`, testid: "diff-line", "data-kind": kind },
    h("span", { testid: "diff-marker", "data-marker": MARKER[kind] }, MARKER[kind]),
    h("span", {}, text === "" ? " " : text));
}

function diffView(diff: string): { stat: HTMLElement | null; view: HTMLElement; adds: number; dels: number } {
  const lines = diff.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const state = { inHunk: false };
  const parsed = lines.map((l) => classify(l, state));
  const adds = parsed.filter((p) => p.kind === "add").length;
  const dels = parsed.filter((p) => p.kind === "del").length;
  const LIMIT = 400;
  const view = h("div", { class: "diff", testid: "diff-view", role: "region", "aria-label": "Proposed changes", tabindex: "0" });
  parsed.slice(0, LIMIT).forEach((p) => view.append(diffLine(p.kind, p.text)));
  if (parsed.length > LIMIT) {
    const more = h("button", { type: "button", class: "btn btn--secondary", testid: "diff-show-more", on: { click: () => {
      parsed.slice(LIMIT).forEach((p) => view.append(diffLine(p.kind, p.text)));
      more.remove();
    } } }, "Show the rest");
    view.append(more);
  }
  return { stat: null, view, adds, dels };
}

function renderDetail(p: Proposal, flash?: Flash): void {
  const d = diffView(p.diff ?? "");
  const files = p.files ?? [];
  const nFiles = files.length || p.fileCount;
  const parts: Child[] = [
    h("a", { class: "btn btn--secondary", href: "#proposals", testid: "back-to-proposals" }, "All proposals"),
    h("h2", { class: "section__title section", testid: "proposal-title" }, p.title),
    h("p", { class: "text-2" }, chip(p.status, "proposal-status"), ` by ${nameOf(p.agent)} · ${plural(nFiles, "file", "files")} · Created ${relTime(p.createdAt)}`),
  ];
  if (flash) parts.push(flashNode(flash));
  parts.push(
    p.summary ? h("p", { testid: "proposal-summary" }, p.summary) : null,
    h("ul", { class: "knowledge-list", testid: "proposal-files" }, ...files.map((f) => h("li", { testid: "proposal-file" }, h("code", {}, f.path), ` · ${FILE_ACTION[f.action] ?? f.action}`))),
    h("p", { class: "section text-2", testid: "diff-stat" }, `${plural(nFiles, "file", "files")} changed · +${d.adds} −${d.dels}`),
    d.view,
  );
  if (p.status === "pending") {
    const approve = h("button", { type: "button", class: "btn btn--primary", testid: "approve-button", on: { click: () => openApprove(p, approve) } }, "Approve and deploy");
    const reject = h("button", { type: "button", class: "btn btn--secondary", testid: "reject-button", on: { click: () => openReject(p, reject) } }, "Reject");
    parts.push(h("div", { class: "btn-row btn-row--apart section" }, reject, approve));
  } else {
    parts.push(decisionBlock(p));
  }
  detailView.replaceChildren(h("div", { testid: "proposal-detail" }, ...parts));
}

function decisionBlock(p: Proposal): HTMLElement {
  const who = p.decidedBy?.email ?? "unknown";
  const when = p.decidedAt ? dayOf(p.decidedAt) : "";
  if (p.status === "approved") {
    return h("div", { class: "card section", testid: "decision-block" },
      h("p", {}, `Approved by ${who} on ${when}. Commit ${p.commit ? sha7(p.commit.sha) : ""}.`),
      p.commit && /^https:\/\//.test(p.commit.url) ? h("a", { href: p.commit.url, target: "_blank", rel: "noopener noreferrer", testid: "commit-link" }, "View commit") : null);
  }
  return h("div", { class: "card section", testid: "decision-block" },
    h("p", {}, `Rejected by ${who} on ${when}.`),
    p.rejectReason ? h("p", { testid: "reject-reason-text" }, `Reason: ${p.rejectReason}`) : null);
}

function flashNode(f: Flash): HTMLElement {
  if (f.kind === "stale") {
    return h("div", { class: "banner banner--stale", testid: "stale-message" },
      h("div", { class: "banner__body" }, f.text),
      h("button", { type: "button", class: "btn btn--secondary banner__action", testid: "ask-again-button", on: { click: () => {
        location.hash = "#team";
        openChat(f.agent ?? "", `Please refresh the proposal "${f.title}" against the current code.`);
      } } }, "Ask again"));
  }
  return h("div", { class: "banner banner--info", role: "status" }, h("div", { class: "banner__body", testid: f.testid }, f.text));
}

// ---------- dialogs

function dialogShell(testid: string, title: string, trigger: HTMLElement): { dlg: HTMLDialogElement; heading: HTMLElement; busy: { v: boolean } } {
  const busy = { v: false };
  const heading = h("h2", { class: "dialog__title", tabindex: "-1" }, title);
  const dlg = h("dialog", { class: "dialog", testid, "aria-labelledby": "dlg-title" });
  heading.id = "dlg-title";
  dlg.addEventListener("cancel", (ev) => { if (busy.v) ev.preventDefault(); });
  dlg.addEventListener("close", () => { dlg.remove(); if (trigger.isConnected) trigger.focus(); });
  document.body.append(dlg);
  return { dlg, heading, busy };
}

function openApprove(p: Proposal, trigger: HTMLElement): void {
  const n = p.files?.length || p.fileCount;
  const { dlg, heading, busy } = dialogShell("approve-dialog", "Commit to main and redeploy?", trigger);
  const input = h("input", { class: "input", type: "text", id: "confirm-title", testid: "confirm-title-input", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  const hint = h("p", { class: "field__hint", testid: "confirm-hint", "aria-live": "polite" }, "Doesn't match yet");
  const err = h("p", { class: "form-error", testid: "approve-error", role: "alert", hidden: true });
  const cancel = h("button", { type: "button", class: "btn btn--secondary", testid: "cancel-approve-button", on: { click: () => dlg.close() } }, "Cancel");
  const confirm = h("button", { type: "button", class: "btn btn--primary", testid: "confirm-approve-button", disabled: true }, "Commit and deploy");
  const showErr = (t: string): void => { err.textContent = t; err.hidden = false; };

  input.addEventListener("input", () => {
    const ok = input.value === p.title; // exact: no trimming or normalising (matches the server)
    confirm.disabled = !ok || busy.v;
    hint.textContent = ok ? "Matches" : "Doesn't match yet";
  });
  confirm.addEventListener("click", () => {
    if (busy.v || input.value !== p.title) return;
    busy.v = true;
    confirm.disabled = true; cancel.disabled = true; input.disabled = true;
    confirm.textContent = "Committing…";
    err.hidden = true;
    void (async () => {
      try {
        const r = await apiPost<ApproveResponse>(`/api/proposals/${encodeURIComponent(p.id)}/approve`, { confirmTitle: input.value });
        busy.v = false; dlg.close();
        const msg = `Committed ${sha7(r.commit.sha)}. Deploy started.`;
        announce(msg);
        void refreshCount();
        await showDetail(p.id, { testid: "approve-success", text: msg, kind: "info" });
      } catch (e) {
        busy.v = false;
        const f: ApiFailure = isApiFailure(e) ? e : { status: 0, error: "network" };
        if (f.status === 401) return;
        if (f.status === 403) { dlg.close(); showNoAccess(); return; }
        if (f.status === 409) {
          dlg.close();
          try {
            const fresh = await apiGet<Proposal>(`/api/proposals/${encodeURIComponent(p.id)}`);
            if (fresh.status !== "pending") { renderDetail(fresh, { testid: "approve-decided", text: "This proposal was already decided.", kind: "info" }); return; }
          } catch { /* fall through to stale */ }
          renderDetail(p, { testid: "stale-message", kind: "stale", text: `The code changed since this proposal. Ask ${nameOf(p.agent)} to refresh it.`, agent: p.agent, title: p.title });
          return;
        }
        confirm.textContent = "Commit and deploy"; cancel.disabled = false; input.disabled = false; confirm.disabled = input.value !== p.title;
        showErr(
          f.status === 400 ? "The title doesn't match. Check it and try again."
          : f.status === 422 ? "This change touches a file agents can't edit, so it can't be approved."
          : f.status === 429 ? "Too many tries. Wait a minute, then try again."
          : f.status === 502 ? "GitHub is unavailable right now. Nothing was committed. Try again later."
          : f.status === 413 ? "This proposal is too large to approve."
          : f.status === 503 ? (/sign-in/i.test(f.error) ? "Sign-in service unavailable, try again later." : "Approving is turned off on this site. Preview deploys can't commit.")
          : "Something went wrong. Nothing was committed. Try again.");
      }
    })();
  });

  dlg.append(heading,
    h("p", {}, `This commits ${n === 1 ? "1 file" : `${n} files`} to GitHub `, h("code", {}, "main"), ". Netlify will rebuild the live site in about a minute."),
    h("p", { testid: "approve-dialog-title-echo" }, `"${p.title}"`),
    h("div", { class: "field" }, h("label", { class: "field__label", for: "confirm-title" }, "Type the proposal title to confirm"), input, hint),
    err,
    h("div", { class: "dialog__actions" }, cancel, confirm));
  dlg.showModal();
  heading.focus();
}

function openReject(p: Proposal, trigger: HTMLElement): void {
  const { dlg, heading, busy } = dialogShell("reject-dialog", "Reject this proposal?", trigger);
  const reason = h("textarea", { class: "textarea", id: "reject-reason", testid: "reject-reason-input", maxlength: "500", rows: "3" });
  const counter = h("p", { class: "field__hint" }, "0 of 500");
  reason.addEventListener("input", () => { counter.textContent = `${reason.value.length} of 500`; });
  const err = h("p", { class: "form-error", testid: "reject-error", role: "alert", hidden: true });
  const cancel = h("button", { type: "button", class: "btn btn--secondary", testid: "cancel-reject-button", on: { click: () => dlg.close() } }, "Cancel");
  const confirm = h("button", { type: "button", class: "btn btn--destructive", testid: "confirm-reject-button" }, "Reject proposal");
  confirm.addEventListener("click", () => {
    if (busy.v) return;
    busy.v = true; confirm.disabled = true; cancel.disabled = true; confirm.textContent = "Rejecting…"; err.hidden = true;
    void (async () => {
      try {
        const text = reason.value.trim();
        await apiPost(`/api/proposals/${encodeURIComponent(p.id)}/reject`, text ? { reason: text } : {});
        busy.v = false; dlg.close();
        announce("Proposal rejected.");
        void refreshCount();
        await showDetail(p.id, { testid: "reject-success", text: "Proposal rejected.", kind: "info" });
      } catch (e) {
        busy.v = false;
        const f: ApiFailure = isApiFailure(e) ? e : { status: 0, error: "network" };
        if (f.status === 401) return;
        if (f.status === 403) { dlg.close(); showNoAccess(); return; }
        else if (f.status === 409) {
          dlg.close();
          await showDetail(p.id, { testid: "approve-decided", text: "This proposal was already decided.", kind: "info" });
          return;
        } else if (f.status === 429) err.textContent = "Too many tries. Wait a minute, then try again.";
        else err.textContent = "Something went wrong. Try again.";
        err.hidden = false; confirm.disabled = false; cancel.disabled = false; confirm.textContent = "Reject proposal";
      }
    })();
  });
  dlg.append(heading,
    h("p", {}, `${nameOf(p.agent)} will see it as rejected. Nothing is committed.`),
    h("div", { class: "field" }, h("label", { class: "field__label", for: "reject-reason" }, "Reason (optional)"), reason, counter),
    err,
    h("div", { class: "dialog__actions" }, cancel, confirm));
  dlg.showModal();
  heading.focus();
}

void boot();
