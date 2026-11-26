// Audit log (security.md R17, build-plan §6): store "audit", key audit/<yyyy-mm-dd>/<ts>-<requestId>.
// Never stores tokens, prompts or file contents. Failures are logged (redacted) and never thrown.
import type { Context } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { store, today } from "./blobs.ts";

export interface AuditEntry {
  t: string;
  userId: string | null;
  email: string | null;
  action: string;            // e.g. "chat", "proposal.create", "proposal.approve", "proposal.reject", "denied"
  target: string | null;     // agent name, proposal id, path…
  ip: string | null;
  requestId: string;
  [extra: string]: unknown;  // small scalar details: status, reason, tokens, commit sha
}

export function requestIdOf(ctx?: Partial<Context> | null): string {
  const id = (ctx as any)?.requestId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : randomBytes(8).toString("hex");
}

export async function audit(
  ctx: Partial<Context> | null | undefined,
  user: { id: string; email: string | null } | null,
  action: string,
  target: string | null,
  extra: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const now = new Date();
  const requestId = requestIdOf(ctx);
  const entry: AuditEntry = {
    ...extra,
    t: now.toISOString(),
    userId: user?.id ?? null,
    email: user?.email ?? null,
    action,
    target,
    ip: typeof (ctx as any)?.ip === "string" ? (ctx as any).ip : null,
    requestId,
  };
  try {
    await store("audit").setJSON(`audit/${today(now)}/${now.getTime()}-${requestId}-${randomBytes(3).toString("hex")}`, entry);
  } catch (e) {
    console.error("audit write failed", (e as Error)?.name ?? "error");
  }
}

/** Audit a request the guard denied (401/403/405/503); user is unknown at that point. */
export function auditDenied(ctx: Partial<Context> | null | undefined, req: Request, status: number): Promise<void> {
  return audit(ctx, null, "denied", new URL(req.url).pathname, { status, method: req.method });
}
