// Unit helpers for the beach score. Pure, no I/O.

export const cToF = (c: number): number => (c * 9) / 5 + 32;

/** 100 at `good`, 0 at `bad`, linear between. Works in either direction. */
export function lerp(v: number, good: number, bad: number): number {
  const t = (v - good) / (bad - good);
  return Math.round(100 * Math.min(1, Math.max(0, 1 - t)));
}

export type UvCategory = "low" | "moderate" | "high" | "very-high" | "extreme";

/** EPA UV Index categories (advisory only, never scored). */
export function uvCategory(uv: number): UvCategory {
  if (uv >= 11) return "extreme";
  if (uv >= 8) return "very-high";
  if (uv >= 6) return "high";
  if (uv >= 3) return "moderate";
  return "low";
}

export const round = (n: number): number => Math.round(n);
export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
