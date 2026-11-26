// /login/reset/ — finish a password reset after the emailed link.
// Flow and copy: docs/ux/flows.md §4, docs/ux/copy.md §4. The link returns here with ?code= (PKCE); supabase-js
// exchanges it and emits PASSWORD_RECOVERY, then updatePassword() sets the new password.
import { mountShell } from "../lib/shell.ts";
import { registerServiceWorker } from "../pwa/register.ts";
import { AuthFlowError, isAuthConfigured, onAuthChange, supabase, updatePassword } from "../lib/auth.ts";

mountShell();
registerServiceWorker();

const RECOVERY_WAIT_MS = 6000;

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`reset page: missing #${id}`);
  return el as T;
}

function describedBy(el: HTMLElement, id: string, on: boolean): void {
  const ids = new Set((el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  if (on) ids.add(id);
  else ids.delete(id);
  if (ids.size) el.setAttribute("aria-describedby", [...ids].join(" "));
  else el.removeAttribute("aria-describedby");
}

const checking = $<HTMLParagraphElement>("reset-checking");
const form = $<HTMLFormElement>("reset-form");
const username = $<HTMLInputElement>("reset-username");
const pw = $<HTMLInputElement>("new-password");
const pwErr = $<HTMLParagraphElement>("password-error");
const showPw = $<HTMLInputElement>("show-password");
const submit = $<HTMLButtonElement>("reset-submit");
const formError = $<HTMLParagraphElement>("form-error");
const invalid = $<HTMLElement>("invalid-view");
const success = $<HTMLElement>("success-view");

type State = "checking" | "ready" | "invalid" | "success" | "none";
let state: State = "checking";

function setState(s: State): void {
  state = s;
  checking.hidden = s !== "checking";
  form.hidden = s !== "ready";
  invalid.hidden = s !== "invalid";
  success.hidden = s !== "success";
  if (s !== "ready" && s !== "none") hideFormError();
}

function showFormError(message: string, inForm: boolean): void {
  if (inForm) form.insertBefore(formError, submit);
  formError.textContent = message;
  formError.hidden = false;
  describedBy(pw, formError.id, inForm);
  formError.tabIndex = -1;
  formError.focus();
}

function hideFormError(): void {
  formError.hidden = true;
  formError.textContent = "";
  describedBy(pw, formError.id, false);
}

function setPwError(message: string | null): void {
  pwErr.textContent = message ?? "";
  pwErr.hidden = !message;
  if (message) pw.setAttribute("aria-invalid", "true");
  else pw.removeAttribute("aria-invalid");
  describedBy(pw, pwErr.id, !!message);
}

function cleanUrl(): void {
  history.replaceState(null, "", location.pathname); // never leave a one-time code in the address bar
}

showPw.addEventListener("change", () => {
  pw.type = showPw.checked ? "text" : "password";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideFormError();
  if (pw.value.length < 12) {
    setPwError("Use at least 12 characters.");
    pw.focus();
    return;
  }
  setPwError(null);
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  submit.textContent = "Saving…";
  try {
    await updatePassword(pw.value);
    pw.value = "";
    setState("success");
    success.querySelector<HTMLElement>("a")?.focus();
  } catch (err) {
    const code = err instanceof AuthFlowError ? err.code : "unknown";
    const causeCode = (err as { cause?: { code?: unknown } }).cause?.code;
    const status = (err as { cause?: { status?: unknown } }).cause?.status;
    if (code === "weak_password") {
      setPwError(causeCode === "same_password" ? "Choose a password you haven't used before." : "That password is too easy to guess. Try a longer one.");
      pw.focus();
    } else if (code === "not_configured") {
      showFormError("Sign-in isn't set up on this site yet. Try again later.", true);
    } else if (code === "network" && typeof status === "number" && status >= 500) {
      showFormError("Sign-in service unavailable, try again later.", true);
    } else {
      showFormError("Couldn't save your password. Try again.", true);
    }
  } finally {
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
    submit.textContent = "Save new password";
  }
});

function start(): void {
  if (!isAuthConfigured() || !supabase) {
    setState("none");
    checking.hidden = true;
    showFormError("Sign-in isn't set up on this site yet. Try again later.", false);
    return;
  }

  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const hasCode = params.has("code");
  const urlError = params.get("error") || params.get("error_code") || hash.get("error") || hash.get("error_code");

  const ready = (email: string | null | undefined): void => {
    if (state !== "checking") return;
    cleanUrl();
    username.value = email ?? "";
    setState("ready");
    pw.focus();
  };
  const fail = (): void => {
    if (state !== "checking") return;
    cleanUrl();
    setState("invalid");
  };

  if (urlError || !hasCode) {
    // No recovery code in the URL (or Supabase reported an expired/used link): nothing to wait for.
    // Subscribing anyway catches the rare case where the event still arrives.
    onAuthChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") ready(session?.user?.email);
    });
    setTimeout(fail, urlError ? 0 : 1500);
    return;
  }

  // Subscribed synchronously at load, before supabase-js finishes exchanging the code, so the event is not missed.
  onAuthChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") ready(session?.user?.email);
  });
  // If the exchange fails, supabase-js ends initialisation with no session and no PASSWORD_RECOVERY.
  void supabase.auth.getSession().then(
    ({ data }) => {
      if (!data.session) fail();
      // With a session but no event yet, give the event a moment (it is emitted right after initialisation).
      else setTimeout(fail, 1500);
    },
    () => fail(),
  );
  setTimeout(fail, RECOVERY_WAIT_MS);
}

start();
