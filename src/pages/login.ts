// /login/ — log in, sign up, Continue with Google, forgot password, signed-in state.
// Flows and copy: docs/ux/flows.md §3, docs/ux/copy.md §3. Auth: src/lib/auth.ts (Supabase, PKCE).
// All dynamic text goes in with textContent. Nothing here grants access: the Functions check the role.
import { announce, mountShell } from "../lib/shell.ts";
import { registerServiceWorker } from "../pwa/register.ts";
import {
  AuthFlowError,
  isAuthConfigured,
  onAuthChange,
  safeNext,
  sendPasswordReset,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  supabase,
  takeNext,
} from "../lib/auth.ts";

mountShell(); // no onSignOut: on /login/ the header slot stays empty; the signed-in view has its own Sign out
registerServiceWorker();

type Mode = "login" | "signup";
type View = "auth" | "confirm" | "forgot" | "signed-in" | "none";

const FLOW_KEY = "bd_auth_flow"; // "google" while a Google round trip is in progress
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- small DOM helpers (kept local: this page owns its own logic) ----------
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`login page: missing #${id}`);
  return el as T;
}

/** Add or remove one id in an element's aria-describedby list. */
function describedBy(el: HTMLElement, id: string, on: boolean): void {
  const ids = new Set((el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  if (on) ids.add(id);
  else ids.delete(id);
  if (ids.size) el.setAttribute("aria-describedby", [...ids].join(" "));
  else el.removeAttribute("aria-describedby");
}

function setFieldError(input: HTMLInputElement, errEl: HTMLElement, message: string | null): void {
  errEl.textContent = message ?? "";
  errEl.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  describedBy(input, errEl.id, !!message);
}

function setBusy(btn: HTMLButtonElement, busy: boolean, label: string): void {
  btn.disabled = busy;
  btn.textContent = label;
  if (busy) btn.setAttribute("aria-busy", "true");
  else btn.removeAttribute("aria-busy");
}

/** copy.md §3 error strings for an AuthFlowError. */
function errorText(err: unknown): string {
  const code = err instanceof AuthFlowError ? err.code : "unknown";
  switch (code) {
    case "not_configured": return "Sign-in isn't set up on this site yet. Try again later.";
    case "invalid_credentials": return "Email or password is incorrect.";
    case "email_not_confirmed": return "Confirm your email first. Check your inbox for the link.";
    case "weak_password": return "That password is too easy to guess. Try a longer one.";
    case "rate_limited": return "Too many tries. Wait a minute and try again.";
    case "network": {
      const status = (err as { cause?: { status?: unknown } }).cause?.status;
      return typeof status === "number" && status >= 500
        ? "Sign-in service unavailable, try again later."
        : "Can't reach the sign-in service. Check your connection.";
    }
    default: return "Something went wrong. Try again.";
  }
}

// ---------- elements ----------
const title = $<HTMLHeadingElement>("login-title");
const context = $<HTMLParagraphElement>("login-context");
const formError = $<HTMLParagraphElement>("form-error");
const formErrorHome = formError.parentElement!;
const formErrorAnchor = formError.nextSibling;

const views: Record<Exclude<View, "none">, HTMLElement> = {
  auth: $("auth-view"),
  confirm: $("confirm-view"),
  forgot: $("forgot-view"),
  "signed-in": $("signed-in-view"),
};

const googleBtn = $<HTMLButtonElement>("google-button");
const tabLogin = $<HTMLButtonElement>("tab-login");
const tabSignup = $<HTMLButtonElement>("tab-signup");
const form = $<HTMLFormElement>("auth-form");
const email = $<HTMLInputElement>("email");
const emailErr = $<HTMLParagraphElement>("email-error");
const password = $<HTMLInputElement>("password");
const passwordHint = $<HTMLParagraphElement>("password-hint");
const passwordErr = $<HTMLParagraphElement>("password-error");
const showPassword = $<HTMLInputElement>("show-password");
const submit = $<HTMLButtonElement>("submit-button");
const forgotLink = $<HTMLAnchorElement>("forgot-link");

const confirmMsg = $<HTMLParagraphElement>("confirm-email-message");
const restart = $<HTMLButtonElement>("signup-restart");

const forgotForm = $<HTMLFormElement>("forgot-form");
const forgotEmail = $<HTMLInputElement>("forgot-email");
const forgotEmailErr = $<HTMLParagraphElement>("forgot-email-error");
const forgotSubmit = $<HTMLButtonElement>("forgot-submit");
const forgotSent = $<HTMLParagraphElement>("forgot-sent-message");
const forgotBack = $<HTMLAnchorElement>("forgot-back");

const confirmed = $<HTMLParagraphElement>("login-confirmed");
const signedInMsg = $<HTMLParagraphElement>("login-signed-in");
const continueBtn = $<HTMLAnchorElement>("continue-button");
const signoutBtn = $<HTMLButtonElement>("signout-button");

// ---------- state ----------
const next = takeNext(); // validated same-origin path, "/" otherwise
let mode: Mode = "login";

context.hidden = !(next === "/agents/" || next.startsWith("/agents/"));
continueBtn.href = next;

// ---------- helpers ----------
function show(view: View): void {
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
  // The forgot view has its own h2 ("Reset your password").
  title.textContent = mode === "signup" && (view === "auth" || view === "confirm") ? "Create your account" : "Sign in to Beach Day";
  clearFormError();
}

/** Show the single form-level error next to `beforeEl` (or at the top of the card when null). */
function showFormError(message: string, beforeEl: HTMLElement | null, inputs: HTMLElement[] = []): void {
  if (beforeEl?.parentElement) beforeEl.parentElement.insertBefore(formError, beforeEl);
  else formErrorHome.insertBefore(formError, formErrorAnchor);
  formError.textContent = message;
  formError.hidden = false;
  for (const i of inputs) describedBy(i, formError.id, true);
  formError.tabIndex = -1;
  formError.focus({ preventScroll: false });
}

function clearFormError(): void {
  formError.hidden = true;
  formError.textContent = "";
  for (const i of [email, password, forgotEmail]) describedBy(i, formError.id, false);
}

function validateEmail(input: HTMLInputElement, errEl: HTMLParagraphElement): boolean {
  const v = input.value.trim();
  if (!v) return setFieldError(input, errEl, "Enter your email."), false;
  if (!EMAIL_RE.test(v)) return setFieldError(input, errEl, "Enter a valid email, like name@example.com."), false;
  setFieldError(input, errEl, null);
  return true;
}

function setMode(m: Mode, focusTab = false): void {
  mode = m;
  const login = m === "login";
  tabLogin.setAttribute("aria-selected", String(login));
  tabSignup.setAttribute("aria-selected", String(!login));
  tabLogin.tabIndex = login ? 0 : -1;
  tabSignup.tabIndex = login ? -1 : 0;
  tabLogin.classList.toggle("btn--primary", login);
  tabLogin.classList.toggle("btn--secondary", !login);
  tabSignup.classList.toggle("btn--primary", !login);
  tabSignup.classList.toggle("btn--secondary", login);
  form.dataset.testid = login ? "login-form" : "signup-form";
  form.setAttribute("aria-labelledby", login ? "tab-login" : "tab-signup");
  password.autocomplete = login ? "current-password" : "new-password";
  passwordHint.hidden = login;
  describedBy(password, passwordHint.id, !login);
  submit.textContent = login ? "Log in" : "Create account";
  forgotLink.parentElement!.hidden = !login;
  title.textContent = login ? "Sign in to Beach Day" : "Create your account";
  setFieldError(email, emailErr, null);
  setFieldError(password, passwordErr, null);
  clearFormError();
  if (focusTab) (login ? tabLogin : tabSignup).focus();
}

function go(path: string): void {
  location.assign(safeNext(path));
}

function cleanUrl(): void {
  // Drop ?code= / ?error= (and keep ?next=) so a reload never replays a one-time code.
  const u = new URL(location.href);
  for (const k of ["code", "error", "error_code", "error_description", "state"]) u.searchParams.delete(k);
  if (next !== "/") u.searchParams.set("next", next);
  history.replaceState(null, "", u.pathname + u.search + u.hash);
}

function showSignedIn(userEmail: string | null | undefined, justConfirmed: boolean): void {
  show("signed-in");
  confirmed.hidden = !justConfirmed;
  signedInMsg.hidden = justConfirmed;
  signedInMsg.textContent = `You're signed in as ${userEmail ?? "your account"}.`;
  signoutBtn.hidden = justConfirmed;
}

function showLogin(): void {
  show("auth");
  setMode(mode);
}

function showForgot(): void {
  show("forgot");
  forgotForm.hidden = false;
  forgotSent.hidden = true;
  setFieldError(forgotEmail, forgotEmailErr, null);
  if (!forgotEmail.value && email.value) forgotEmail.value = email.value.trim();
}

function readFlowFlag(): string | null {
  try {
    const v = sessionStorage.getItem(FLOW_KEY);
    sessionStorage.removeItem(FLOW_KEY);
    return v;
  } catch {
    return null;
  }
}

function setFlowFlag(v: string): void {
  try {
    sessionStorage.setItem(FLOW_KEY, v);
  } catch {
    /* ignore */
  }
}

// ---------- events ----------
for (const [tab, m] of [[tabLogin, "login"], [tabSignup, "signup"]] as const) {
  tab.addEventListener("click", () => setMode(m));
  tab.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const target: Mode = e.key === "Home" ? "login" : e.key === "End" ? "signup" : mode === "login" ? "signup" : "login";
      setMode(target, true);
    }
  });
}

showPassword.addEventListener("change", () => {
  password.type = showPassword.checked ? "text" : "password";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormError();
  const okEmail = validateEmail(email, emailErr);
  let okPw = true;
  if (!password.value) okPw = (setFieldError(password, passwordErr, "Enter your password."), false);
  else if (mode === "signup" && password.value.length < 12) okPw = (setFieldError(password, passwordErr, "Use at least 12 characters."), false);
  else setFieldError(password, passwordErr, null);
  if (!okEmail) return email.focus();
  if (!okPw) return password.focus();

  const addr = email.value.trim();
  if (mode === "login") {
    setBusy(submit, true, "Logging in…");
    try {
      await signIn(addr, password.value);
      go(next);
    } catch (err) {
      setBusy(submit, false, "Log in");
      showFormError(errorText(err), submit, [email, password]);
    }
  } else {
    setBusy(submit, true, "Creating account…");
    try {
      const { needsConfirmation } = await signUp(addr, password.value, next);
      setBusy(submit, false, "Create account");
      if (needsConfirmation) {
        password.value = "";
        show("confirm");
        confirmMsg.textContent = `Check your email. We sent a confirmation link to ${addr}. Open it on this device to finish.`;
        restart.focus();
      } else {
        go(next); // project has email confirmation off: already signed in
      }
    } catch (err) {
      setBusy(submit, false, "Create account");
      if (err instanceof AuthFlowError && err.code === "weak_password") {
        setFieldError(password, passwordErr, "That password is too easy to guess. Try a longer one.");
        password.focus();
      } else {
        showFormError(errorText(err), submit, [email, password]);
      }
    }
  }
});

googleBtn.addEventListener("click", async () => {
  clearFormError();
  googleBtn.disabled = true;
  setFlowFlag("google");
  try {
    await signInWithGoogle(next); // navigates away on success
  } catch (err) {
    readFlowFlag();
    googleBtn.disabled = false;
    showFormError(err instanceof AuthFlowError && err.code === "unknown" ? "Google sign-in didn't finish. Try again." : errorText(err), null);
  }
});

restart.addEventListener("click", () => {
  email.value = "";
  password.value = "";
  mode = "signup";
  showLogin();
  email.focus();
});

forgotLink.addEventListener("click", (e) => {
  e.preventDefault();
  history.replaceState(null, "", "#forgot");
  showForgot();
  forgotEmail.focus();
});

forgotBack.addEventListener("click", (e) => {
  e.preventDefault();
  history.replaceState(null, "", location.pathname + location.search);
  mode = "login";
  showLogin();
  email.focus();
});

forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormError();
  if (!validateEmail(forgotEmail, forgotEmailErr)) return forgotEmail.focus();
  setBusy(forgotSubmit, true, "Sending…");
  try {
    await sendPasswordReset(forgotEmail.value.trim()); // resolves the same way for known and unknown addresses
    setBusy(forgotSubmit, false, "Send reset link");
    forgotForm.hidden = true;
    forgotSent.hidden = false;
    forgotBack.focus();
  } catch (err) {
    setBusy(forgotSubmit, false, "Send reset link");
    const code = err instanceof AuthFlowError ? err.code : "unknown";
    showFormError(code === "network" ? "Couldn't send. Check your connection and try again." : errorText(err), forgotSubmit, [forgotEmail]);
  }
});

signoutBtn.addEventListener("click", async () => {
  signoutBtn.disabled = true;
  try {
    await signOut();
  } catch {
    /* the local session is cleared either way */
  }
  signoutBtn.disabled = false;
  history.replaceState(null, "", "/login/");
  mode = "login";
  showLogin();
  announce("Signed out.");
});

// ---------- start ----------
async function start(): Promise<void> {
  if (!isAuthConfigured() || !supabase) {
    show("none");
    showFormError("Sign-in isn't set up on this site yet. Try again later.", null);
    return;
  }

  const params = new URLSearchParams(location.search);
  const hadCode = params.has("code");
  const urlError = params.get("error") || params.get("error_code");
  const flow = readFlowFlag();

  // Keep the shell's view of the session in step (e.g. signed out in another tab).
  onAuthChange((event) => {
    if (event === "SIGNED_OUT" && !views["signed-in"].hidden) showLogin();
  });

  // getSession waits for supabase-js to finish exchanging a ?code= (PKCE) from Google or the email link.
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    session = null;
  }

  if (hadCode || urlError) cleanUrl();

  if (session) {
    if (hadCode && flow === "google") return go(next); // Google round trip done: treat as success
    showSignedIn(session.user?.email, hadCode);
    return;
  }

  if (location.hash === "#forgot") {
    showForgot();
    return;
  }

  showLogin();
  if (hadCode || urlError) {
    const msg = flow === "google" ? "Google sign-in didn't finish. Try again." : "That link expired. Log in, or sign up again to get a new one.";
    showFormError(msg, submit);
  }
}

void start();
