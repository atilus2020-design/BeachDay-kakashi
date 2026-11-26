// Netlify Blobs helpers (build-plan §6, §9.6).
// store(name) → getStore({ name, consistency: "strong" }) normally; an in-memory store with the
// same subset when NODE_ENV === "test" (vitest). `netlify dev` uses the real local sandbox.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

export type StoreName = "proposals" | "budget" | "audit" | "locks";

export interface WriteOpts { onlyIfNew?: boolean; onlyIfMatch?: string }
export interface WriteResult { modified: boolean; etag?: string }
export interface JsonStore {
  get(key: string, opts: { type: "json" }): Promise<any | null>;
  getWithMetadata(key: string, opts: { type: "json" }): Promise<{ data: any; etag?: string; metadata: Record<string, unknown> } | null>;
  setJSON(key: string, value: unknown, opts?: WriteOpts): Promise<WriteResult>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ blobs: { key: string; etag: string }[]; directories: string[] }>;
}

// ---------------------------------------------------------------- in-memory (tests)
const memory = new Map<string, Map<string, { json: string; etag: string }>>();
let etagSeq = 0;

class MemoryStore implements JsonStore {
  private m: Map<string, { json: string; etag: string }>;
  constructor(name: string) {
    if (!memory.has(name)) memory.set(name, new Map());
    this.m = memory.get(name)!;
  }
  async get(key: string, _opts: { type: "json" }) {
    const e = this.m.get(key);
    return e ? JSON.parse(e.json) : null;
  }
  async getWithMetadata(key: string, _opts: { type: "json" }) {
    const e = this.m.get(key);
    return e ? { data: JSON.parse(e.json), etag: e.etag, metadata: {} } : null;
  }
  async setJSON(key: string, value: unknown, opts: WriteOpts = {}) {
    const cur = this.m.get(key);
    if (opts.onlyIfNew && cur) return { modified: false };
    if (opts.onlyIfMatch !== undefined && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = `"m${++etagSeq}"`;
    this.m.set(key, { json: JSON.stringify(value), etag });
    return { modified: true, etag };
  }
  async delete(key: string) {
    this.m.delete(key);
  }
  async list(opts: { prefix?: string } = {}) {
    const blobs = [...this.m.entries()]
      .filter(([k]) => !opts.prefix || k.startsWith(opts.prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, e]) => ({ key, etag: e.etag }));
    return { blobs, directories: [] };
  }
}

/** Test helper: wipe every in-memory store. */
export function resetMemoryStores(): void {
  memory.clear();
}

export function store(name: StoreName): JsonStore {
  if (process.env.NODE_ENV === "test") return new MemoryStore(name);
  return getStore({ name, consistency: "strong" }) as unknown as JsonStore;
}

// ---------------------------------------------------------------- keys
export const PROPOSAL_ID_RE = /^p_[a-z0-9]{16,40}$/;
export const proposalKey = (id: string) => `proposal/${id}`;

/** Time-sortable id: "p_" + base36 ms (9 chars) + 10 random base36 chars. Newer ids sort later. */
export function newProposalId(): string {
  const t = Date.now().toString(36).padStart(9, "0");
  const r = [...randomBytes(10)].map((b) => (b % 36).toString(36)).join("");
  return `p_${t}${r}`;
}

export const today = (d = new Date()) => d.toISOString().slice(0, 10);
