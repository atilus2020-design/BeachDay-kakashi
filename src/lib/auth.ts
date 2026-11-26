// Browser auth module for Beach Day (Supabase Auth). Contract: docs/build-plan.md §3.5, docs/security.md R13,
// decisions D-006..D-008. Imported ONLY by login/, login/reset/ and agents/ (keeps supabase-js off the home page).
//
// Uses only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (public by design). Never a secret key.
// Everything here is convenience: the real gate is requireRole() in every Function (D-008).
// If the VITE vars are missing, importing this module does NOT throw; every function rejects with
// AuthFlowError code "not_configured" ("Sign-in isn't configured") so the page can show a message.
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from "@supabase/supabase-js";

export type Role = "user" | "super_admin";

export type AuthErrorCode =
  | "not_configured"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "rate_limited"
  | "network"
  | "unknown";

const MESSAGES: Record<AuthErrorCode, string> = {
  not_configured: "Sign-in isn't configured",
  invalid_credentials: "Email or password is incorrect",
  email_not_confirmed: "Confirm your email first, then sign in",
  weak_password: "Choose a stronger password",
  rate_limited: "Too many attempts. Try again later",
  network: "Sign-in service unavailable, try again later",
  unknown: "Something went wrong. Try again",
};

/** The only error type this module throws. `code` is stable for UI copy; `message` is a safe default. */
export class AuthFlowError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, options?: { cause?: unknown }) {
    super(MESSAGES[code], options);
    this.name = "AuthFlowError";
    this.code = code;
  }
}

// ---------- client ----------

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const KEY_ = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";

function makeClient(): SupabaseClient | null {
  if (!URL_ || !KEY_) return null;
  try {
    return createClient(URL_, KEY_, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch {
    return null; // malformed URL: behave as "not configured" rather than crash the page
  }
}

/** The shared browser client, or null when sign-in isn't configured. Prefer the functions below. */
export const supabase: SupabaseClient | null = makeClient();

export function isAuthConfigured(): boolean {
  return supabase !== null;
}

function client(): SupabaseClient {
  if (!supabase) throw new AuthFlowError("not_configured");
  return supabase;
}

function toFlowError(err: unknown): AuthFlowError {
  if (err instanceof AuthFlowError) return err;
  const e = err as { code?: string; status?: number; name?: string } | null;
  const code = e?.code ?? "";
  const status = typeof e?.status === "number" ? e.status : 0;
  if (code === "invalid_credentials") return new AuthFlowError("invalid_credentials", { cause: err });
  if (code === "email_not_confirmed") return new AuthFlowError("email_not_confirmed", { cause: err });
  if (code === "weak_password" || code === "same_password") return new AuthFlowError("weak_password", { cause: err });
  if (status === 429 || code.startsWith("over_")) return new AuthFlowError("rate_limited", { cause: err });
  if (status === 0 || status >= 500 || e?.name === "AuthRetryableFetchError") return new AuthFlowError("network", { cause: err });
  return new AuthFlowError("unknown", { cause: err });
}

const site = (): string => location.origin;
const LOGIN_URL = (): string => `${site()}/login/`;
const RESET_URL = (): string => `${site()}/login/reset/`;

// ---------- safe `next` handling ----------

const NEXT_KEY = "bd_auth_next";

/** Accept only same-origin paths starting with "/" (not "//" or "/\"). Anything else → "/". */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  try {
    const u = new URL(raw, location.origin);
    if (u.origin !== location.origin) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

function rememberNext(next: unknown): void {
  try {
    sessionStorage.setItem(NEXT_KEY, safeNext(next));
  } catch {
    /* storage blocked: we fall back to "/" */
  }
}

/**
 * Where to go after sign-in: `?next=` on the current URL, else the value saved before an OAuth or
 * email round trip (redirect URLs must be exact, R13, so `next` cannot ride on them), else "/".
 * Reading clears the saved value.
 */
export function takeNext(): string {
  const fromQuery = new URLSearchParams(location.search).get("next");
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
  } catch {
    /* ignore */
  }
  return safeNext(fromQuery ?? saved ?? "/");
}

// ---------- flows ----------

/** Create an account. With "Confirm email" on, there is no session yet: show "check your email". */
export async function signUp(email: string, password: string, next?: string): Promise<{ needsConfirmation: boolean }> {
  const sb = client();
  if (next !== undefined) rememberNext(next);
  try {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: LOGIN_URL() } });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  } catch (err) {
    throw toFlowError(err);
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const sb = client();
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (err) {
    throw toFlowError(err);
  }
}

/** Redirects the browser to Google (PKCE); it returns to /login/, which then sends the user to takeNext(). */
export async function signInWithGoogle(next?: string): Promise<void> {
  const sb = client();
  rememberNext(next ?? "/");
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: LOGIN_URL(), scopes: "openid email profile" },
    });
    if (error) throw error;
  } catch (err) {
    throw toFlowError(err);
  }
}

export async function signOut(): Promise<void> {
  const sb = client();
  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  } catch (err) {
    throw toFlowError(err);
  } finally {
    accessToken = null;
  }
}

/**
 * Send the reset email (returns to /login/reset/). Resolves the same way whether or not the account exists
 * (no enumeration). Rate limits also resolve: Supabase's per-address cooldown fires only for existing
 * accounts, so surfacing it would reveal the account (security.md R15 / A3). Rejects only when not
 * configured ("not_configured") or the service is unreachable ("network").
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const sb = client();
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RESET_URL() });
    if (error) throw error;
  } catch (err) {
    const fe = toFlowError(err);
    if (fe.code === "network" || fe.code === "not_configured") throw fe;
  }
}

/** On /login/reset/, after the PASSWORD_RECOVERY event (the recovery link signs the user in). */
export async function updatePassword(password: string): Promise<void> {
  const sb = client();
  try {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
  } catch (err) {
    throw toFlowError(err);
  }
}

// ---------- session ----------

let accessToken: string | null = null;

/** Current access token for `Authorization: Bearer`, refreshed by supabase-js when needed; null if signed out. */
export async function getAccessToken(): Promise<string | null> {
  const sb = client();
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) return accessToken;
    accessToken = data.session?.access_token ?? null;
    return accessToken;
  } catch {
    return accessToken;
  }
}

/**
 * The signed-in user's role from their own `profiles` row (RLS), or null if signed out / unknown.
 * COSMETIC ONLY (show or hide UI). Functions re-check the role on every request.
 */
export async function getRole(): Promise<Role | null> {
  const sb = client();
  const { data: s } = await sb.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await sb.from("profiles").select("id, role").eq("id", uid).maybeSingle();
  if (error) throw toFlowError(error);
  const role = (data as { role?: unknown } | null)?.role;
  return role === "super_admin" || role === "user" ? role : null;
}

/**
 * Subscribe to auth events (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED,
 * PASSWORD_RECOVERY). The callback runs outside supabase-js's lock, so it may call this module.
 * Returns an unsubscribe function. When not configured, calls back once with SIGNED_OUT.
 */
export function onAuthChange(cb: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  if (!supabase) {
    setTimeout(() => cb("SIGNED_OUT", null), 0);
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    accessToken = session?.access_token ?? null; // keep the callback fast; no awaited Supabase calls here
    setTimeout(() => cb(event, session), 0);
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Page gate for /agents/ (cosmetic; the Functions decide). Signed out → navigates to /login/?next=<next>
 * and the returned promise never settles. Signed in as super_admin → "ok"; any other role → "forbidden".
 * Rejects with AuthFlowError ("not_configured" or "network") when the check cannot be made.
 */
export async function requireSuperAdmin(next: string): Promise<"ok" | "forbidden"> {
  const sb = client();
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    location.assign(`/login/?next=${encodeURIComponent(safeNext(next))}`);
    return new Promise<never>(() => {});
  }
  const role = await getRole();
  return role === "super_admin" ? "ok" : "forbidden";
}
