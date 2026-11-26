// Page shell (build-plan §9.8, docs/ux/flows.md §1): header nav, footer, skip link, one live region.
// Fills <header class="site-header" data-shell> and <footer class="site-footer" data-shell>.
// This file never imports auth: pages that have a session pass a sign-out handler via mountShell/setSignOut.
import { h, clear } from "./dom.ts";

export interface ShellOptions {
  /** Pages that load auth (Agents, Login) pass a handler to get the "Sign out" button instead of "Sign in". */
  onSignOut?: (() => void | Promise<void>) | null;
}

const NAV: { id: string; href: string; text: string; match: (p: string) => boolean }[] = [
  { id: "nav-agents", href: "/agents/", text: "Agents", match: (p) => p.startsWith("/agents") },
  { id: "nav-how", href: "/how-it-works/", text: "How it works", match: (p) => p.startsWith("/how-it-works") },
  { id: "nav-resources", href: "/resources/", text: "Resources", match: (p) => p.startsWith("/resources") },
];

let signOutHandler: (() => void | Promise<void>) | null = null;
let navEl: HTMLElement | null = null;
let authHidden = false;
let liveEl: HTMLElement | null = null;

function renderAuthSlot(): void {
  if (!navEl) return;
  navEl.querySelector("[data-auth-slot]")?.remove();
  if (authHidden) return;
  const path = location.pathname;
  let slot: HTMLElement | null = null;
  if (signOutHandler) {
    const fn = signOutHandler;
    slot = h("button", { type: "button", class: "btn btn--secondary", testid: "signout-button", "data-auth-slot": true, on: { click: () => { void fn(); } } }, "Sign out");
  } else if (!path.startsWith("/login")) {
    slot = h("a", { href: "/login/", testid: "nav-signin", "data-auth-slot": true }, "Sign in");
  }
  if (slot) navEl.append(slot);
}

/** Switch the auth slot after the page knows the session (null hides both Sign in and Sign out where the page shows its own). */
export function setSignOut(handler: ShellOptions["onSignOut"]): void {
  signOutHandler = handler ?? null;
  authHidden = false;
  renderAuthSlot();
}

/** Hide the Sign in / Sign out slot (e.g. while the Agents page is still checking access). */
export function hideAuthSlot(): void {
  authHidden = true;
  renderAuthSlot();
}

/** Announce a short status message through the single polite live region (WCAG 4.1.3). */
export function announce(message: string): void {
  if (!liveEl) liveEl = ensureLive();
  const el = liveEl;
  el.textContent = "";
  setTimeout(() => { el.textContent = message; }, 40);
}

function ensureLive(): HTMLElement {
  let el = document.querySelector<HTMLElement>('[data-testid="live-status"]');
  if (!el) {
    el = h("div", { class: "visually-hidden", role: "status", "aria-live": "polite", "aria-atomic": "true", testid: "live-status", id: "live-status" });
    document.body.append(el);
  }
  return el;
}

function externalLink(href: string, text: string, testid: string): HTMLAnchorElement {
  return h("a", { href, target: "_blank", rel: "noopener noreferrer", testid }, text);
}

function buildHeader(header: HTMLElement): void {
  const path = location.pathname;
  header.setAttribute("data-testid", "site-header");
  clear(header);
  const brand = h("a", { class: "site-header__brand", href: "/", testid: "nav-home", "aria-current": path === "/" || path === "/index.html" ? "page" : null }, "Beach Day");
  navEl = h("nav", { class: "site-nav", "aria-label": "Site" });
  for (const n of NAV) {
    navEl.append(h("a", { href: n.href, testid: n.id, "aria-current": n.match(path) ? "page" : null }, n.text));
  }
  header.append(brand, navEl);
  renderAuthSlot();
}

function buildFooter(footer: HTMLElement): void {
  footer.setAttribute("data-testid", "site-footer");
  clear(footer);
  const links = h("ul", { class: "site-footer__links" },
    h("li", {}, h("a", { href: "/resources/", "data-testid": "footer-resources" }, "Resources")),
    h("li", {}, h("a", { href: "/guide/", "data-testid": "footer-guide" }, "Guide")),
    h("li", {}, externalLink("https://github.com/atilus2020-design/BeachDay-kakashi", "GitHub", "footer-github")),
    h("li", {}, externalLink("https://mcp-api.netlify.app/", "API directory", "footer-api")),
  );
  footer.append(
    links,
    h("p", {}, externalLink("https://open-meteo.com/", "Weather data by Open-Meteo.com", "attribution")),
    h("p", { testid: "disclaimer" }, "A planning aid, not a safety service."),
  );
}

// Style the PWA module's own elements (src/pwa/*) with Sable's classes after they render (we may not edit src/pwa).
function decoratePwa(root: ParentNode): void {
  const add = (el: Element, classes: string, testid?: string): void => {
    el.classList.add(...classes.split(" "));
    if (testid && !el.hasAttribute("data-testid")) el.setAttribute("data-testid", testid);
  };
  root.querySelectorAll(".pwa-banner").forEach((b) => {
    add(b, "banner banner--info", "update-banner");
    b.querySelectorAll("button").forEach((btn) => add(btn, "btn btn--secondary banner__action", "update-reload-button"));
  });
  root.querySelectorAll("button.install-btn").forEach((b) => add(b, "btn btn--primary", "install-button"));
  root.querySelectorAll("div.install-sheet").forEach((s) => {
    add(s, "sheet", "install-ios-sheet");
    s.querySelectorAll("button").forEach((btn) => add(btn, "btn btn--secondary", "install-ios-dismiss"));
  });
}

export function mountShell(opts: ShellOptions = {}): void {
  signOutHandler = opts.onSignOut ?? null;
  const body = document.body;

  if (!body.querySelector(".skip-link")) {
    body.prepend(h("a", { class: "skip-link", href: "#main", testid: "skip-link" }, "Skip to content"));
  }
  const main = document.querySelector("main");
  if (main && !main.id) main.id = "main";
  if (main && !main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");

  const header = document.querySelector<HTMLElement>("header.site-header[data-shell]");
  if (header) buildHeader(header);
  const footer = document.querySelector<HTMLElement>("footer.site-footer[data-shell]");
  if (footer) buildFooter(footer);
  // The <noscript> fallback nav is only used without JS.
  liveEl = ensureLive();

  decoratePwa(document);
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n instanceof Element) { decoratePwa(n.parentNode ?? document); decoratePwa(n); } });
  }).observe(body, { childList: true, subtree: true });
}
