import { mountShell } from "../lib/shell.ts";
import { registerServiceWorker } from "../pwa/register.ts";

mountShell();
registerServiceWorker();

// Guide: each command block has a Copy button. The button reads the <pre> just before it.
// The live region announces the result. Clipboard access can fail (no permission, http), so it is guarded.
function setupCopyButtons(): void {
  const status = document.querySelector<HTMLElement>('[data-testid="guide-copy-status"]');
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-testid="guide-copy-button"]');
  buttons.forEach((button) => {
    const pre = button.previousElementSibling;
    if (!(pre instanceof HTMLPreElement)) return;
    const original = button.textContent ?? "Copy";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent ?? "");
        button.textContent = "Copied";
        if (status) status.textContent = "Command copied.";
      } catch {
        if (status) status.textContent = "Copy failed. Select the command and copy it by hand.";
        return;
      }
      window.setTimeout(() => {
        button.textContent = original;
      }, 2000);
    });
  });
}

setupCopyButtons();
