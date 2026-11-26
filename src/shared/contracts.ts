// Beach Day shared API contracts (docs/build-plan.md §3.3, §3.4, §9.3).
// Types only: no runtime code, so it is safe to import from the browser (src/)
// and from Netlify Functions with:
//   import type { … } from "../../src/shared/contracts.ts";
// Scoring types (DayScore) live in src/scoring, not here.

export type Role = "user" | "super_admin";

// ---- Forecast (GET /api/forecast?beach=<id>, public) ----

export interface Beach {
  id: string;
  name: string;
  city: string;
  county: string;
  lat: number;
  lon: number;
  nwsOffice: string;
  coast?: "atlantic" | "gulf";
}

export interface ForecastResponse {
  beach: Beach;
  /** Open-Meteo Forecast JSON as returned (doc 01 §1.2); null if it failed. */
  forecast: unknown | null;
  /** Open-Meteo Marine JSON as returned; null if it failed. */
  marine: unknown | null;
  /** True when one of forecast / marine is null. */
  partial: boolean;
  /** ISO 8601. */
  fetchedAt: string;
}

// ---- Agents (GET /api/agents, super_admin) ----

export interface AgentKnowledgeFile {
  /** Repo-relative path, e.g. "knowledge/<agent>/docs/<file>.md". */
  path: string;
  title: string;
}

export interface AgentSummary {
  /** Agent file name, e.g. "open-meteo-integrator". */
  name: string;
  /** Persona name, e.g. "Kai". */
  displayName: string;
  description: string;
  /** Resolved API model ID, e.g. "claude-sonnet-5-5". */
  model: string;
  modelAlias: "opus" | "sonnet" | "haiku" | "custom";
  /** Short excerpt, plain text. */
  personality: string;
  color?: string;
  /** Files under knowledge/<agent>/docs and examples (§9.3). */
  knowledge: AgentKnowledgeFile[];
}

export interface AgentsResponse {
  agents: AgentSummary[];
}

// ---- Chat (POST /api/agent/chat, super_admin + CSRF) ----

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** ≤ 30 messages, ≤ 100 KB. */
export interface ChatRequest {
  agent: string;
  messages: ChatMessage[];
}

/** SSE payloads, keyed by `event:` name (§3.4). Each `data:` line is JSON. */
export interface ChatEventMap {
  /** 0..n text chunks. */
  text: string;
  /** 0..n tool calls, shown as a collapsible row. */
  tool: { name: string; path?: string };
  /** 0..1; links to /agents/#proposal/<id>. */
  proposal: { id: string; title: string };
  /** Exactly one of done | error, always last. */
  done: { stop_reason: string };
  error: { message: string };
}

export type ChatEventName = keyof ChatEventMap;

/** Discriminated union of every chat stream event. */
export type ChatEvent = {
  [K in ChatEventName]: { event: K; data: ChatEventMap[K] };
}[ChatEventName];

// ---- Proposals ----

export type ProposalStatus = "pending" | "approved" | "rejected";

/** Query value for GET /api/proposals?status=… (default "pending"). */
export type ProposalStatusFilter = ProposalStatus | "all";

/** Supabase user id + email. */
export interface Actor {
  id: string;
  email: string | null;
}

export interface ProposalSummary {
  id: string;
  agent: string;
  title: string;
  status: ProposalStatus;
  fileCount: number;
  createdAt: string;
  createdBy: Actor;
}

export type ProposalFileAction = "create" | "update" | "delete";

export interface ProposalFile {
  path: string;
  action: ProposalFileAction;
}

export interface Proposal extends ProposalSummary {
  summary: string;
  baseSha: string;
  files: ProposalFile[];
  /** Unified diff; render with textContent only. */
  diff: string;
  decidedAt?: string;
  decidedBy?: Actor;
  rejectReason?: string;
  commit?: CommitRef;
}

/** GET /api/proposals: newest first, ≤ 50. */
export interface ProposalsResponse {
  proposals: ProposalSummary[];
}

export interface CommitRef {
  sha: string;
  url: string;
}

/** POST /api/proposals/:id/approve — must equal the proposal title exactly. */
export interface ApproveRequest {
  confirmTitle: string;
}

export interface ApproveResponse {
  status: "approved";
  commit: CommitRef;
  deploy: "started";
}

/** POST /api/proposals/:id/reject — reason ≤ 500 chars. */
export interface RejectRequest {
  reason?: string;
}

export interface RejectResponse {
  status: "rejected";
}

// ---- Errors ----

/** Generic error body for every non-2xx JSON response. */
export interface ApiError {
  error: string;
}
