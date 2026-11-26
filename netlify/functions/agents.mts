// GET /api/agents → { agents: AgentSummary[] } (build-plan §3.2). super_admin only; never returns prompts.
import type { Config, Context } from "@netlify/functions";
import { requireRole } from "./_lib/auth.ts";
import { listAgents } from "./_lib/agents.ts";
import { auditDenied } from "./_lib/audit.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default async (req: Request, ctx: Context) => {
  const g = await requireRole(req, ctx, "super_admin", { methods: ["GET"] });
  if (!g.ok) {
    await auditDenied(ctx, req, g.response.status);
    return g.response;
  }
  try {
    return json(200, { agents: listAgents() });
  } catch {
    return json(500, { error: "Something went wrong" });
  }
};

export const config: Config = {
  path: "/api/agents",
  method: ["GET"],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
