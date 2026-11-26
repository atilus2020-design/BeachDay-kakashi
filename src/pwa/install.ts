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
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "install-btn";
      btn.textContent = "Install Beach Day";
      btn.addEventListener("click", async () => {
        const ev = deferred;
        if (!ev) return;
        deferred = null;
        await ev.prompt();
        await ev.userChoice.catch(() => undefined);
        render();
      });
      container.append(btn);
    } else if (isIOS() && !dismissed()) {
      const sheet = document.createElement("div");
      sheet.className = "install-sheet";
      sheet.setAttribute("role", "region");
      sheet.setAttribute("aria-label", "Install Beach Day");
      const p = document.createElement("p");
      p.textContent = "Install Beach Day: Tap Share, then Add to Home Screen.";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Not now";
      close.addEventListener("click", () => { remember(); render(); });
      sheet.append(p, close);
      container.append(sheet);
    }
  };
  listeners.add(render);
  render();
  return () => { listeners.delete(render); container.replaceChildren(); };
}
