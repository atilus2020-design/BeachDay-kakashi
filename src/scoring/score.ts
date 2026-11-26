// Pure beach scoring: scoreWeek({ forecast, marine }) -> DayScore[]. No I/O.
// Implements docs/01-beach-day-scoring.md §1.3 with D-002 (no rip-current proxy; wave height only).
import { bestBlock, beachWindow, pad } from "./window.ts";
import { cToF, lerp, mean, round, uvCategory, type UvCategory } from "./units.ts";

export interface ForecastJson {
  hourly: {
    time: string[];
    weather_code: (number | null)[];
    precipitation_probability: (number | null)[];
    apparent_temperature: (number | null)[];
    cloud_cover: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    [k: string]: unknown;
  };
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
    uv_index_max?: (number | null)[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
export interface MarineJson {
  hourly: {
    time: string[];
    wave_height: (number | null)[];
    sea_surface_temperature: (number | null)[]; // °C
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
export interface BeachInputs {
  forecast: ForecastJson | null;
  marine: MarineJson | null;
}

export type DayLabel = "great" | "good" | "fair" | "poor";
export interface DayScore {
  date: string; // YYYY-MM-DD local
  score: number; // 0-100
  label: DayLabel;
  labelText: "Great beach day" | "Good" | "Meh" | "Skip it";
  vetoes: string[]; // "lightning" | "rain-most-of-day" | "gale" | "dangerous-surf" | "extreme-heat"
  reasons: string[]; // what cost points (components averaging < 60) and veto sentences, max 3
  highlights: string[]; // what went right (components averaging >= 80), max 3; show when reasons is empty
  bestWindow?: { start: string; end: string; score: number }; // omitted for lowConfidence days
  uv: { max: number; category: UvCategory };
  lowConfidence: boolean; // day index >= 3
  partial: boolean; // marine missing: scored from weather only
  waterF: number | null; // mean sea temperature in the window, °F
}

const THUNDER = new Set([95, 96, 99]);
const RAIN = new Set([61, 63, 65, 66, 67, 80, 81, 82]);
const W = { rain: 30, feels: 20, wind: 15, waves: 15, sky: 10, water: 10 } as const;
type Key = keyof typeof W;

interface Hour {
  code: number; pop: number; feels: number; wind: number; gust: number; cloud: number;
  wave: number | null; sstF: number | null; hr: number;
}
type Comps = Record<Key, number | null>;

function components(h: Hour): Comps {
  const rain = RAIN.has(h.code) || THUNDER.has(h.code) ? 0 : lerp(h.pop, 10, 70);
  const feels = h.feels < 78 ? lerp(h.feels, 78, 65) : h.feels <= 90 ? 100 : lerp(h.feels, 90, 108);
  const wind = Math.max(0, lerp(h.wind, 12, 25) - (h.gust - h.wind > 10 ? 10 : 0));
  return {
    rain, feels, wind,
    waves: h.wave == null ? null : lerp(h.wave, 2, 5),
    sky: lerp(h.cloud, 30, 90),
    water: h.sstF == null ? null : lerp(h.sstF, 80, 68),
  };
}

function hourScore(h: Hour, c: Comps): number {
  if (THUNDER.has(h.code)) return 0;
  let s = 0, w = 0;
  for (const k of Object.keys(W) as Key[]) {
    const v = c[k];
    if (v != null) { s += v * W[k]; w += W[k]; }
  }
  return s / w;
}

const labelOf = (s: number): [DayLabel, DayScore["labelText"]] =>
  s >= 80 ? ["great", "Great beach day"] : s >= 60 ? ["good", "Good"] : s >= 40 ? ["fair", "Meh"] : ["poor", "Skip it"];

export function scoreWeek({ forecast, marine }: BeachInputs): DayScore[] {
  if (!forecast?.hourly || !forecast?.daily) return [];
  const H = forecast.hourly, M = marine?.hourly ?? null;
  const marineIdx = new Map<string, number>();
  M?.time.forEach((t, i) => marineIdx.set(t, i));
  const out: DayScore[] = [];

  forecast.daily.time.forEach((date, dayIdx) => {
    const { startH, endH } = beachWindow(forecast.daily.sunrise?.[dayIdx], forecast.daily.sunset?.[dayIdx]);
    const hours: Hour[] = [];
    H.time.forEach((t, i) => {
      if (!t.startsWith(date)) return;
      const hr = Number(t.slice(11, 13));
      if (hr < startH || hr > endH) return;
      const mi = marineIdx.get(t);
      const sst = mi == null ? null : M!.sea_surface_temperature[mi];
      const wave = mi == null ? null : M!.wave_height[mi];
      hours.push({
        hr, code: H.weather_code[i] ?? 0, pop: H.precipitation_probability[i] ?? 0,
        feels: H.apparent_temperature[i] ?? 80, wind: H.wind_speed_10m[i] ?? 0, gust: H.wind_gusts_10m[i] ?? 0,
        cloud: H.cloud_cover[i] ?? 0, wave: wave ?? null, sstF: sst == null ? null : cToF(sst),
      });
    });
    if (!hours.length) return;

    const comps = hours.map(components);
    const scores = hours.map((h, i) => hourScore(h, comps[i]));
    const blk = bestBlock(scores);
    let score = round(0.6 * mean(scores) + 0.4 * (blk ? blk.score : mean(scores)));

    // Vetoes (caps) with their sentences.
    const vetoes: string[] = [];
    const vetoReasons: string[] = [];
    const cap = (n: number, id: string, text: string) => { score = Math.min(score, n); vetoes.push(id); vetoReasons.push(text); };
    if (hours.filter((h) => THUNDER.has(h.code)).length >= 2) cap(20, "lightning", "No-go: lightning");
    if (hours.filter((h) => RAIN.has(h.code) || h.pop >= 70).length >= hours.length / 2) cap(35, "rain-most-of-day", "Rain most of the day");
    if (hours.some((h) => h.gust >= 39)) cap(20, "gale", `Gale-force gusts, ${round(Math.max(...hours.map((h) => h.gust)))} mph`);
    if (hours.some((h) => (h.wave ?? 0) >= 6)) cap(30, "dangerous-surf", `Dangerous surf, ${round(Math.max(...hours.map((h) => h.wave ?? 0)))} ft`);
    if (hours.some((h) => h.feels >= 125)) cap(20, "extreme-heat", `Dangerous heat, ${round(Math.max(...hours.map((h) => h.feels)))}°F`);

    // Reasons / highlights from average component scores.
    const avg = (k: Key): number | null => {
      const v = comps.map((c) => c[k]).filter((x): x is number => x != null);
      return v.length ? mean(v) : null;
    };
    const wavesAvg = mean(hours.filter((h) => h.wave != null).map((h) => h.wave as number));
    const waterF = hours.some((h) => h.sstF != null) ? round(mean(hours.filter((h) => h.sstF != null).map((h) => h.sstF as number))) : null;
    const avgFeels = mean(hours.map((h) => h.feels));
    const avgWind = mean(hours.map((h) => h.wind));
    const maxPop = Math.max(...hours.map((h) => h.pop));
    const avgCloud = mean(hours.map((h) => h.cloud));

    const bad: Record<Key, string> = {
      rain: `Rain likely (${round(maxPop)}%)`,
      feels: avgFeels > 90 ? `Feels hot, ${round(avgFeels)}°F` : `Feels cool, ${round(avgFeels)}°F`,
      wind: `Breezy, ${round(avgWind)} mph`,
      waves: `Rough surf, ${round(wavesAvg)} ft`,
      sky: `Mostly cloudy (${round(avgCloud)}% cloud)`,
      water: `Cool water, ${waterF}°F`,
    };
    const good: Record<Key, string> = {
      rain: `Dry, rain chance ${round(maxPop)}%`,
      feels: `Comfortable, feels like ${round(avgFeels)}°F`,
      wind: `Light winds, ${round(avgWind)} mph`,
      waves: `Gentle surf, ${round(wavesAvg)} ft`,
      sky: `Mostly sunny (${round(avgCloud)}% cloud)`,
      water: `Water ${waterF}°F`,
    };
    const keys = (Object.keys(W) as Key[]).filter((k) => avg(k) != null);
    const byPenalty = [...keys].sort((a, b) => (100 - avg(b)!) * W[b] - (100 - avg(a)!) * W[a]);
    const reasons = [...vetoReasons, ...byPenalty.filter((k) => avg(k)! < 60).map((k) => bad[k])].slice(0, 3);
    const highlights = [...keys].sort((a, b) => avg(b)! * W[b] - avg(a)! * W[a])
      .filter((k) => avg(k)! >= 80).map((k) => good[k]).slice(0, 3);

    const lowConfidence = dayIdx >= 3;
    const uvMax = forecast.daily.uv_index_max?.[dayIdx] ?? 0;
    const [label, labelText] = labelOf(score);
    const day: DayScore = {
      date, score, label, labelText, vetoes, reasons, highlights,
      uv: { max: uvMax, category: uvCategory(uvMax) },
      lowConfidence, partial: M == null || hours.every((h) => h.wave == null),
      waterF,
    };
    if (!lowConfidence && blk) {
      const s = hours[blk.index].hr;
      day.bestWindow = { start: pad(s), end: pad(s + 3), score: round(blk.score) };
    }
    out.push(day);
  });
  return out;
}
