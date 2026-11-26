// Registers /sw.js (production builds only) and shows "New version available — Reload".
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) promptReload(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) promptReload(sw);
          });
        });
      })
      .catch(() => undefined);
  });
  // Reload only for a real update; the first-visit clients.claim() must not reload the page.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function promptReload(worker: ServiceWorker): void {
  if (document.getElementById("sw-update")) return;
  const bar = document.createElement("div");
  bar.id = "sw-update";
  bar.className = "pwa-banner";
  bar.setAttribute("role", "status");
  bar.setAttribute("data-testid", "update-banner");
  const msg = document.createElement("span");
  msg.textContent = "A new version is ready.";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Reload";
  btn.setAttribute("data-testid", "update-reload-button");
  btn.addEventListener("click", () => worker.postMessage({ type: "SKIP_WAITING" }));
  bar.append(msg, " ", btn);
  document.body.append(bar);
}
