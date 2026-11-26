// Install UX: Android beforeinstallprompt button; iOS "Add to Home Screen" sheet. Hidden when standalone.
interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const DISMISS_KEY = "bd-ios-install-dismissed";
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}
function dismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}
function remember(): void {
  try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
  listeners.forEach((fn) => fn());
});
window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((fn) => fn()); });

/** Call after the user has seen a forecast. Renders into `container`; returns a cleanup function. */
export function showInstallButton(container: HTMLElement): () => void {
  const render = () => {
    container.replaceChildren();
    if (isStandalone()) return;
    if (deferred) {
      const wrap = document.createElement("div");
      wrap.className = "install-android";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "install-btn";
      btn.setAttribute("data-testid", "install-button");
      btn.textContent = "Install Beach Day";
      btn.addEventListener("click", async () => {
        const ev = deferred;
        if (!ev) return;
        deferred = null;
        await ev.prompt();
        await ev.userChoice.catch(() => undefined);
        render();
      });
      const later = document.createElement("button");
      later.type = "button";
      later.className = "install-dismiss";
      later.setAttribute("data-testid", "install-dismiss");
      later.textContent = "Not now";
      later.addEventListener("click", () => { remember(); container.replaceChildren(); });
      wrap.append(btn, later);
      if (!dismissed()) container.append(wrap);
    } else if (isIOS() && !dismissed()) {
      const sheet = document.createElement("div");
      sheet.className = "install-sheet";
      sheet.setAttribute("role", "region");
      sheet.setAttribute("aria-label", "Install Beach Day");
      sheet.setAttribute("data-testid", "install-ios-sheet");
      const h = document.createElement("h2");
      h.textContent = "Install Beach Day";
      const intro = document.createElement("p");
      intro.textContent = "Add it to your Home Screen to open it like an app.";
      const ol = document.createElement("ol");
      for (const t of ["Tap the Share button.", "Tap Add to Home Screen.", "Tap Add."]) {
        const li = document.createElement("li");
        li.textContent = t;
        ol.append(li);
      }
      const close = document.createElement("button");
      close.type = "button";
      close.setAttribute("data-testid", "install-ios-dismiss");
      close.textContent = "Got it";
      close.addEventListener("click", () => { remember(); render(); });
      sheet.append(h, intro, ol, close);
      container.append(sheet);
    }
  };
  listeners.add(render);
  render();
  return () => { listeners.delete(render); container.replaceChildren(); };
}
