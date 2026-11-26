// Server-side guard for every protected Beach Day Function.
// Contract: docs/security.md §5, docs/build-plan.md §3.1 / §3.5 / §9.5, decisions D-006..D-008.
//
//   const g = await requireRole(req, ctx, "super_admin");
//   if (!g.ok) return g.response;
//   // g.user = { id, email }, g.supabase = per-request client carrying this caller's JWT
//
// Uses ONLY SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (never a secret / service_role key).
// Never logs tokens. Never caches between requests. Fails closed.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Context } from "@netlify/functions";

export type Role = "super_admin";

export type GuardResult =
  | { ok: true; user: { id: string; email: string | null }; supabase: SupabaseClient }
  | { ok: false; response: Response };

export interface GuardOptions {
  /** Methods the route allows (step 1). Default: GET and POST. */
  methods?: readonly string[];
}

const TIMEOUT_MS = 5000;
const MAX_AUTH_HEADER = 4096;
const BEARER = /^Bearer ([A-Za-z0-9._-]+)$/;

const MSG = {
  method: "Method not allowed",
  forbidden: "Forbidden",
  signIn: "Sign in required",
  notAllowed: "Not allowed",
  unavailable: "Sign-in service unavailable",
} as const;

function deny(status: number, error: string, extra: Record<string, string> = {}): { ok: false; response: Response } {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
    }),
  };
}

/** SUPABASE_URL must be https, except under `netlify dev` or vitest (build-plan §9.5). */
function supabaseConfig(ctx: Context | undefined): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!url || !key) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const devOrTest = ctx?.deploy?.context === "dev" || process.env.NODE_ENV === "test";
  if (parsed.protocol === "https:") return { url, key };
  if (parsed.protocol === "http:" && devOrTest) return { url, key };
  return null;
}

/** Status of a supabase-js error object, or 0 for network / abort / unknown. */
function statusOf(err: unknown): number {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : 0;
}

export async function requireRole(
  req: Request,
  ctx: Context | undefined,
  role: Role,
  opts: GuardOptions = {},
): Promise<GuardResult> {
  // 1. Method.
  const methods = (opts.methods ?? ["GET", "POST"]).map((m) => m.toUpperCase());
  const method = req.method.toUpperCase();
  if (!methods.includes(method)) return deny(405, MSG.method, { Allow: methods.join(", ") });

  // 2–3. CSRF, non-GET only.
  if (method !== "GET" && method !== "HEAD") {
    let selfOrigin: string;
    try {
      selfOrigin = new URL(req.url).origin;
    } catch {
      return deny(403, MSG.forbidden);
    }
    const origin = req.headers.get("origin");
    const fetchSite = req.headers.get("sec-fetch-site");
    if (!origin || origin !== selfOrigin) return deny(403, MSG.forbidden);
    if (fetchSite !== null && fetchSite !== "same-origin") return deny(403, MSG.forbidden);
    if (req.headers.get("x-requested-with") !== "beachday") return deny(403, MSG.forbidden);
  }

  // 4. Bearer format.
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.length > MAX_AUTH_HEADER) return deny(401, MSG.signIn);
  const m = BEARER.exec(authorization);
  if (!m) return deny(401, MSG.signIn);
  const jwt = m[1];

  // Config: missing or non-https SUPABASE_URL outside dev/test → fail closed.
  const cfg = supabaseConfig(ctx);
  if (!cfg) {
    console.error("[auth] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing or not https");
    return deny(503, MSG.unavailable);
  }

  // One 5 s deadline covers both Supabase calls.
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  const timedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline });

  // Per-request client carrying this caller's JWT (RLS applies to every query made with it).
  const supabase = createClient(cfg.url, cfg.key, {
    global: { headers: { Authorization: `Bearer ${jwt}` }, fetch: timedFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    // 5. Verify the token with Supabase Auth (GET {SUPABASE_URL}/auth/v1/user).
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr) {
      const s = statusOf(userErr);
      if (s >= 400 && s < 500 && s !== 408 && s !== 429) return deny(401, MSG.signIn);
      return deny(503, MSG.unavailable);
    }
    const user = userData?.user;
    if (!user?.id) return deny(401, MSG.signIn);

    // 6. Own profiles row, read under RLS with the caller's JWT.
    const { data: rows, error: profErr, status: profStatus } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .abortSignal(deadline)
      .retry(false);
    if (profErr) {
      const s = statusOf(profErr) || profStatus || 0;
      if (s === 0 || s >= 500 || s === 408 || s === 429) return deny(503, MSG.unavailable);
      if (s === 401) return deny(401, MSG.signIn);
      return deny(403, MSG.notAllowed);
    }
    if (!Array.isArray(rows) || rows.length !== 1) return deny(403, MSG.notAllowed);
    const row = rows[0] as { id?: unknown; role?: unknown };
    if (row.id !== user.id) return deny(403, MSG.notAllowed);

    // 7. Role.
    if (row.role !== role) return deny(403, MSG.notAllowed);

    // 8. Allowed.
    return { ok: true, user: { id: user.id, email: user.email ?? null }, supabase };
  } catch {
    // Network failure, timeout, or anything unexpected: fail closed, no details.
    return deny(503, MSG.unavailable);
  }
}
