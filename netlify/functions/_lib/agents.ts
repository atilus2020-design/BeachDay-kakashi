// Agent registry, read from the build output of scripts/build-agents.mjs (build-plan §9.3).
// agents.json is public (AgentSummary[]); agents-private.json holds { model, system } and never
// leaves the server.
import publicAgents from "../_generated/agents.json" with { type: "json" };
import privateAgents from "../_generated/agents-private.json" with { type: "json" };

export interface AgentSummary {
  name: string;
  displayName: string;
  description: string;
  model: string;
  modelAlias: "opus" | "sonnet" | "haiku" | "custom";
  personality: string;
  color?: string;
  knowledge: { path: string; title: string }[];
}
export interface AgentPrivate { model: string; system: string }
export interface Agent extends AgentSummary { system: string }

const SUMMARIES = publicAgents as unknown as AgentSummary[];
const PRIVATE = privateAgents as unknown as Record<string, AgentPrivate>;
export const AGENT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function listAgents(): AgentSummary[] {
  return SUMMARIES.map((a) => ({ ...a, knowledge: a.knowledge.map((k) => ({ ...k })) }));
}

/** Look up an agent by name; returns null for anything unknown (caller answers 404). */
export function getAgent(name: unknown): Agent | null {
  if (typeof name !== "string" || !AGENT_NAME_RE.test(name)) return null;
  const summary = SUMMARIES.find((a) => a.name === name);
  const priv = Object.prototype.hasOwnProperty.call(PRIVATE, name) ? PRIVATE[name] : undefined;
  if (!summary || !priv) return null;
  return { ...summary, model: priv.model, system: priv.system };
}
