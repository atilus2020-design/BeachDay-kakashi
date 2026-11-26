// Daily chat budget, per user and global (security.md R11, build-plan §6 store "budget", strong).
// Keys: chat/<yyyy-mm-dd>/global and chat/<yyyy-mm-dd>/user/<userId> → { turns, tokens }.
// Updates use compare-and-swap (onlyIfNew / onlyIfMatch) with a few retries.
import { store, today } from "./blobs.ts";

export interface Counter { turns: number; tokens: number }

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};
export const limits = () => ({
  turns: num(process.env.DAILY_CHAT_LIMIT, 200),
  tokens: num(process.env.DAILY_TOKEN_LIMIT, 2_000_000),
});

const keys = (userId: string, day = today()) => [`chat/${day}/global`, `chat/${day}/user/${userId}`];

async function bump(key: string, d: Counter): Promise<Counter> {
  const s = store("budget");
  for (let i = 0; i < 6; i++) {
    const cur = await s.getWithMetadata(key, { type: "json" });
    const base: Counter = cur?.data && typeof cur.data === "object" ? cur.data : { turns: 0, tokens: 0 };
    const next = { turns: (base.turns | 0) + d.turns, tokens: (base.tokens | 0) + d.tokens };
    const r = cur ? await s.setJSON(key, next, { onlyIfMatch: cur.etag }) : await s.setJSON(key, next, { onlyIfNew: true });
    if (r.modified) return next;
  }
  throw new Error("budget contention");
}

/**
 * Check both counters and reserve one turn. Returns false when today's turn or token limit is reached
 * (the caller answers 429). Call only after the guard succeeded.
 */
export async function checkAndReserveTurn(userId: string): Promise<boolean> {
  const lim = limits();
  const s = store("budget");
  const [g, u] = await Promise.all(keys(userId).map((k) => s.get(k, { type: "json" }) as Promise<Counter | null>));
  for (const c of [g, u]) {
    if (c && ((c.turns | 0) >= lim.turns || (c.tokens | 0) >= lim.tokens)) return false;
  }
  for (const k of keys(userId)) await bump(k, { turns: 1, tokens: 0 });
  return true;
}

/** Add the tokens a turn used (sum of input + output + cache tokens across all rounds). */
export async function recordTokens(userId: string, tokens: number): Promise<void> {
  if (!(tokens > 0)) return;
  for (const k of keys(userId)) await bump(k, { turns: 0, tokens: Math.round(tokens) });
}

export function usageTokens(u: any): number {
  if (!u || typeof u !== "object") return 0;
  return ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
    .reduce((n, f) => n + (typeof u[f] === "number" ? u[f] : 0), 0);
}
