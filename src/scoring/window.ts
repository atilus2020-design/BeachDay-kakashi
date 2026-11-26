// The beach window: 09:00-17:00 local, clipped to sunrise+1h and sunset-1h (doc 01 §1.3 step 1).

export interface Window {
  startH: number;
  endH: number; // inclusive hour
}

const hourOf = (iso: string): number => Number(iso.slice(11, 13));

export function beachWindow(sunrise: string | undefined, sunset: string | undefined): Window {
  const startH = Math.max(9, sunrise ? hourOf(sunrise) + 1 : 9);
  const endH = Math.min(17, sunset ? hourOf(sunset) - 1 : 17);
  return { startH, endH };
}

export const pad = (h: number): string => `${String(h).padStart(2, "0")}:00`;

/** Highest mean of 3 consecutive hourly scores. Returns null if fewer than 3 hours. */
export function bestBlock(scores: number[]): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null;
  for (let i = 0; i + 3 <= scores.length; i++) {
    const s = (scores[i] + scores[i + 1] + scores[i + 2]) / 3;
    if (!best || s > best.score) best = { index: i, score: s };
  }
  return best;
}
