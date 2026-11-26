// Fetch wrapper for the Beach Day API (build-plan §3.1, §3.5).
// - Bearer token from the configured provider (the Agents page passes auth.getAccessToken; this file never
//   imports auth, so the home page stays free of supabase-js).
// - POST adds `X-Requested-With: beachday`. 15 s timeout. One retry on 401 after asking for a fresh token.
// - Failures throw a plain `{ status, error }` (status 0 = network or timeout).

export interface ApiFailure {
  status: number;
  error: string;
}
export const isApiFailure = (e: unknown): e is ApiFailure =>
  typeof e === "object" && e !== null && typeof (e as ApiFailure).status === "number" && typeof (e as ApiFailure).error === "string";

type TokenProvider = () => Promise<string | null>;
let getToken: TokenProvider = async () => null;
let onUnauthorized: (() => void) | null = null;

/** Called once by pages that talk to protected endpoints. */
export function configureApi(opts: { getToken: TokenProvider; onUnauthorized?: () => void }): void {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized ?? null;
}

const TIMEOUT_MS = 15_000;

interface Attempt {
  res: Response;
  clear: () => void;
}
interface Opts {
  method: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Stream: the timeout only covers waiting for the response headers. */
  stream?: boolean;
  /** Public endpoints send no Authorization header. */
  anonymous?: boolean;
}

async function attempt(path: string, o: Opts, token: string | null): Promise<Attempt> {
  const ctl = new AbortController();
  let timedOut = false;
  const onAbort = (): void => ctl.abort();
  if (o.signal) {
    if (o.signal.aborted) ctl.abort();
    else o.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, o.timeoutMs ?? TIMEOUT_MS);
  const clear = (): void => { clearTimeout(timer); o.signal?.removeEventListener("abort", onAbort); };
  const headers: Record<string, string> = { Accept: o.stream ? "text/event-stream" : "application/json" };
  if (token && !o.anonymous) headers.Authorization = `Bearer ${token}`;
  if (o.method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-Requested-With"] = "beachday";
  }
  try {
    const res = await fetch(path, {
      method: o.method,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      signal: ctl.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (o.stream) clearTimeout(timer);
    return { res, clear };
  } catch (e) {
    clear();
    if (o.signal?.aborted && !timedOut) throw e; // caller aborted (Stop): let AbortError through
    throw { status: 0, error: timedOut ? "timeout" : "network" } satisfies ApiFailure;
  }
}

async function errorOf(res: Response): Promise<ApiFailure> {
  let message = "";
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j?.error === "string") message = j.error;
  } catch { /* not JSON */ }
  return { status: res.status, error: message || res.statusText || "error" };
}

async function run(path: string, o: Opts): Promise<Attempt> {
  let token = o.anonymous ? null : await getToken();
  let a = await attempt(path, o, token);
  if (a.res.status === 401 && !o.anonymous) {
    a.clear();
    token = await getToken(); // supabase-js refreshes an expired session here
    a = await attempt(path, o, token);
    if (a.res.status === 401) {
      a.clear();
      onUnauthorized?.();
      throw await errorOf(a.res);
    }
  }
  return a;
}

async function json<T>(path: string, o: Opts): Promise<T> {
  const a = await run(path, o);
  try {
    if (!a.res.ok) throw await errorOf(a.res);
    return (await a.res.json()) as T;
  } catch (e) {
    if (isApiFailure(e)) throw e;
    if (o.signal?.aborted) throw e;
    throw { status: 0, error: "network" } satisfies ApiFailure;
  } finally {
    a.clear();
  }
}

export const apiGet = <T>(path: string, signal?: AbortSignal): Promise<T> => json<T>(path, { method: "GET", signal });
export const apiPost = <T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> => json<T>(path, { method: "POST", body, signal });
/** Public GET (no token), e.g. /api/forecast. */
export const publicGet = <T>(path: string, signal?: AbortSignal): Promise<T> => json<T>(path, { method: "GET", signal, anonymous: true });

/** POST that returns the streaming Response (text/event-stream). Non-2xx throws {status,error} before streaming. */
export async function apiStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const a = await run(path, { method: "POST", body, signal, stream: true });
  if (!a.res.ok) {
    a.clear();
    throw await errorOf(a.res);
  }
  return a.res;
}
