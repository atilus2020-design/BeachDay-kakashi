// POST /api/proposals/:id/approve → one atomic commit to main (build-plan §3.2; doc 04 §4.6; D-003, D-005).
// Order: guard → 503 if no GITHUB_TOKEN → body → proposal (404) → pending (409) → exact title (400)
// → locks/approve (409 if busy) → status CAS "approving" → re-validate paths (422)
// → stale check + Git Data API commit (409 stale) → status CAS approved.
import type { Config, Context } from "@netlify/functions";
import { requireRole } from "./_lib/auth.ts";
import { assertProposalLimits, assertWritablePath, type ProposalFile } from "./_lib/allowlist.ts";
import { audit, auditDenied, requestIdOf } from "./_lib/audit.ts";
import { store, proposalKey, PROPOSAL_ID_RE } from "./_lib/blobs.ts";
import { commitToMain, hasWriteToken, StaleError } from "./_lib/github.ts";

const LOCK_KEY = "approve";
const LOCK_TTL_MS = 90_000;
const APPROVING_STALE_MS = 120_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

function idFrom(req: Request, ctx: Context): string | null {
  const fromParams = (ctx?.params as Record<string, string> | undefined)?.id;
  if (fromParams) return fromParams;
  const m = /^\/api\/proposals\/([^/]+)\/approve\/?$/.exec(new URL(req.url).pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

async function acquireLock(owner: string): Promise<boolean> {
  const locks = store("locks");
  const value = { owner, at: new Date().toISOString() };
  if ((await locks.setJSON(LOCK_KEY, value, { onlyIfNew: true })).modified) return true;
  const cur = await locks.getWithMetadata(LOCK_KEY, { type: "json" });
  if (!cur) return (await locks.setJSON(LOCK_KEY, value, { onlyIfNew: true })).modified;
  if (Date.parse(cur.data?.at) > Date.now() - LOCK_TTL_MS) return false;
  return (await locks.setJSON(LOCK_KEY, value, { onlyIfMatch: cur.etag })).modified; // take over an expired lock
}

async function releaseLock(owner: string): Promise<void> {
  const locks = store("locks");
  const cur = await locks.get(LOCK_KEY, { type: "json" });
  if (cur?.owner === owner) await locks.delete(LOCK_KEY);
}

export default async (req: Request, ctx: Context) => {
  const g = await requireRole(req, ctx, "super_admin", { methods: ["POST"] });
  if (!g.ok) {
    await auditDenied(ctx, req, g.response.status);
    return g.response;
  }
  const user = g.user;
  if (!hasWriteToken()) return json(503, { error: "Approve is disabled on this deploy" });

  const id = idFrom(req, ctx);
  let body: any;
  try {
    const text = await req.text();
    if (text.length > 4096) return json(413, { error: "Request too large" });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "Invalid request" });
  }
  if (!body || typeof body !== "object" || typeof body.confirmTitle !== "string") return json(400, { error: "Invalid request" });
  if (!id || !PROPOSAL_ID_RE.test(id)) return json(404, { error: "Not found" });

  const proposals = store("proposals");
  const key = proposalKey(id);
  const owner = `${requestIdOf(ctx)}-${Math.random().toString(36).slice(2)}`;
  let locked = false;
  let flagged: string | undefined; // etag after setting `approving`
  try {
    const first = await proposals.getWithMetadata(key, { type: "json" });
    if (!first) return json(404, { error: "Not found" });
    if (first.data.status !== "pending") return json(409, { error: "This proposal was already decided" });
    if (body.confirmTitle !== first.data.title) return json(400, { error: "The title does not match" });

    if (!(await acquireLock(owner))) return json(409, { error: "Another approval is in progress" });
    locked = true;

    // Re-read under the lock and claim it (CAS), so a parallel reject or approve cannot also decide it.
    const cur = await proposals.getWithMetadata(key, { type: "json" });
    if (!cur) return json(404, { error: "Not found" });
    const p = cur.data;
    const approving = p.approving && Date.parse(p.approving.at) > Date.now() - APPROVING_STALE_MS;
    if (p.status !== "pending" || approving) return json(409, { error: "This proposal was already decided" });
    const claim = await proposals.setJSON(key, { ...p, approving: { by: user.id, at: new Date().toISOString() } }, { onlyIfMatch: cur.etag });
    if (!claim.modified) return json(409, { error: "This proposal was already decided" });
    flagged = claim.etag;

    // Re-validate the stored proposal from scratch (R9).
    let files: ProposalFile[];
    try {
      files = (p.files ?? []).map((f: any) => ({ path: f?.path, action: f?.action, content: f?.content }));
      assertProposalLimits(files);
      for (const f of files) if (assertWritablePath(f.path) !== f.path) throw new Error("path changed");
      if (!p.fileShas || typeof p.fileShas !== "object" || typeof p.baseSha !== "string") throw new Error("bad record");
    } catch {
      await audit(ctx, user, "denied", id, { status: 422, reason: "allowlist" });
      return json(422, { error: "This proposal failed the path check" });
    }

    const title = String(p.title).replace(/\s+/g, " ").trim();
    const message = `${title}\n\n${String(p.summary ?? "").trim()}\n\nProposed-by: ${p.agent}\nApproved-in: Beach Day Agent Console (proposal ${id})`;
    let commit: { sha: string; url: string };
    try {
      commit = await commitToMain({ files, message, baseSha: p.baseSha, fileShas: p.fileShas });
    } catch (e) {
      if (e instanceof StaleError) {
        await audit(ctx, user, "proposal.stale", id, { status: 409 });
        return json(409, { error: "The code changed since this proposal; ask the agent to refresh it." });
      }
      console.error("approve commit failed", (e as Error)?.name ?? "error", (e as any)?.status ?? "");
      return json(502, { error: "GitHub is unavailable, try again later" });
    }

    const { approving: _drop, ...rest } = p;
    const done = await proposals.setJSON(
      key,
      { ...rest, status: "approved", decidedAt: new Date().toISOString(), decidedBy: { id: user.id, email: user.email }, commit },
      { onlyIfMatch: flagged },
    );
    flagged = undefined;
    if (!done.modified) console.error("approve: status CAS failed after commit", id); // the lock + claim make this unexpected
    await audit(ctx, user, "proposal.approve", id, { commit: commit.sha });
    return json(200, { status: "approved", commit, deploy: "started" });
  } catch (e) {
    console.error("approve failed", (e as Error)?.name ?? "error");
    return json(500, { error: "Something went wrong" });
  } finally {
    if (flagged) {
      // Undo the claim when we did not commit (stale, 422, GitHub error).
      try {
        const cur = await proposals.getWithMetadata(key, { type: "json" });
        if (cur && cur.etag === flagged) {
          const { approving: _drop, ...rest } = cur.data;
          await proposals.setJSON(key, rest, { onlyIfMatch: flagged });
        }
      } catch {
        /* the approving flag expires on its own */
      }
    }
    if (locked) await releaseLock(owner).catch(() => undefined);
  }
};

export const config: Config = {
  path: "/api/proposals/:id/approve",
  method: ["POST"],
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
