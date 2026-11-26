// GET /api/proposals?status=…, GET /api/proposals/:id, POST /api/proposals/:id/reject (build-plan §3.2–3.3).
import type { Config, Context } from "@netlify/functions";
import { requireRole } from "./_lib/auth.ts";
import { audit, auditDenied } from "./_lib/audit.ts";
import { store, proposalKey, PROPOSAL_ID_RE } from "./_lib/blobs.ts";

const LIST_MAX = 50;
const SCAN_MAX = 500;
const APPROVING_STALE_MS = 120_000;
const STATUSES = new Set(["pending", "approved", "rejected", "all"]);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

function route(req: Request, ctx: Context): { id: string | null; action: "list" | "get" | "reject" | null } {
  const p = new URL(req.url).pathname.replace(/\/+$/, "");
  const m = /^\/api\/proposals(?:\/([^/]+)(?:\/(reject))?)?$/.exec(p);
  if (!m) return { id: null, action: null };
  const id = (ctx?.params as Record<string, string> | undefined)?.id ?? (m[1] ? decodeURIComponent(m[1]) : null);
  if (!m[1]) return { id: null, action: "list" };
  return { id, action: m[2] ? "reject" : "get" };
}

const summaryOf = (p: any) => ({
  id: p.id, agent: p.agent, title: p.title, status: p.status,
  fileCount: Array.isArray(p.files) ? p.files.length : 0, createdAt: p.createdAt, createdBy: p.createdBy,
});
const publicOf = (p: any) => ({
  ...summaryOf(p),
  summary: p.summary,
  baseSha: p.baseSha,
  files: (p.files ?? []).map((f: any) => ({ path: f.path, action: f.action })),
  diff: p.diff,
  ...(p.decidedAt ? { decidedAt: p.decidedAt } : {}),
  ...(p.decidedBy ? { decidedBy: p.decidedBy } : {}),
  ...(p.rejectReason ? { rejectReason: p.rejectReason } : {}),
  ...(p.commit ? { commit: p.commit } : {}),
});

export default async (req: Request, ctx: Context) => {
  const g = await requireRole(req, ctx, "super_admin", { methods: ["GET", "POST"] });
  if (!g.ok) {
    await auditDenied(ctx, req, g.response.status);
    return g.response;
  }
  try {
    const { id, action } = route(req, ctx);
    if (!action) return json(404, { error: "Not found" });
    const method = req.method.toUpperCase();
    if ((action === "reject") !== (method === "POST")) return json(405, { error: "Method not allowed" });
    const s = store("proposals");

    if (action === "list") {
      const status = new URL(req.url).searchParams.get("status") ?? "pending";
      if (!STATUSES.has(status)) return json(400, { error: "Invalid request" });
      const { blobs } = await s.list({ prefix: "proposal/" });
      const keys = blobs.map((b) => b.key).sort().reverse().slice(0, SCAN_MAX); // ids are time-sortable
      const out = [];
      for (const k of keys) {
        if (out.length >= LIST_MAX) break;
        const p = await s.get(k, { type: "json" });
        if (p && (status === "all" || p.status === status)) out.push(summaryOf(p));
      }
      out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      return json(200, { proposals: out });
    }

    if (!id || !PROPOSAL_ID_RE.test(id)) return json(404, { error: "Not found" });

    if (action === "get") {
      const p = await s.get(proposalKey(id), { type: "json" });
      return p ? json(200, publicOf(p)) : json(404, { error: "Not found" });
    }

    // reject
    let body: any = {};
    const text = await req.text();
    if (text.length > 4096) return json(413, { error: "Request too large" });
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, { error: "Invalid request" });
      }
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request" });
    const reason = body.reason;
    if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) return json(400, { error: "Invalid request" });

    const cur = await s.getWithMetadata(proposalKey(id), { type: "json" });
    if (!cur) return json(404, { error: "Not found" });
    const p = cur.data;
    const approving = p.approving && Date.parse(p.approving.at) > Date.now() - APPROVING_STALE_MS;
    if (p.status !== "pending" || approving) return json(409, { error: "This proposal was already decided" });
    const { approving: _drop, ...rest } = p;
    const next = {
      ...rest,
      status: "rejected",
      decidedAt: new Date().toISOString(),
      decidedBy: { id: g.user.id, email: g.user.email },
      ...(reason && reason.trim() ? { rejectReason: reason.trim() } : {}),
    };
    const w = await s.setJSON(proposalKey(id), next, { onlyIfMatch: cur.etag });
    if (!w.modified) return json(409, { error: "This proposal was already decided" });
    await audit(ctx, g.user, "proposal.reject", id, {});
    return json(200, { status: "rejected" });
  } catch (e) {
    console.error("proposals failed", (e as Error)?.name ?? "error");
    return json(500, { error: "Something went wrong" });
  }
};

export const config: Config = {
  path: ["/api/proposals", "/api/proposals/:id", "/api/proposals/:id/reject"],
  method: ["GET", "POST"],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
