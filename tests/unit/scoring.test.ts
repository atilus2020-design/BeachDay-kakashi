import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { scoreWeek } from "../../src/scoring/score.ts";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/open-meteo/${n}`, import.meta.url), "utf8"));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const forecast3 = () => fx("miami-forecast-2026-11-25.json");
const marine3 = () => fx("miami-marine-2026-11-25.json");

// ---- synthetic data builder (local ISO times, America/New_York) ----
interface Hour { code: number; pop: number; feels: number; wind: number; gust: number; cloud: number; uv: number; wave: number; sstC: number }
const CALM: Hour = { code: 0, pop: 0, feels: 82, wind: 8, gust: 12, cloud: 20, uv: 5, wave: 1.5, sstC: 28 };
function synth(date: string, base: Partial<Hour> = {}, byHour: Record<number, Partial<Hour>> = {}) {
  const f: any = { timezone: "America/New_York", hourly: { time: [], weather_code: [], precipitation_probability: [], apparent_temperature: [], cloud_cover: [], wind_speed_10m: [], wind_gusts_10m: [], uv_index: [] },
    daily: { time: [date], weather_code: [0], precipitation_probability_max: [0], apparent_temperature_max: [90], wind_speed_10m_max: [10], uv_index_max: [base.uv ?? CALM.uv], sunrise: [`${date}T06:45`], sunset: [`${date}T17:29`] } };
  const m: any = { timezone: "America/New_York", hourly: { time: [], wave_height: [], wave_period: [], wave_direction: [], sea_surface_temperature: [] }, daily: { time: [date] } };
  for (let h = 0; h < 24; h++) {
    const t = `${date}T${String(h).padStart(2, "0")}:00`; const v = { ...CALM, ...base, ...(byHour[h] || {}) };
    f.hourly.time.push(t); f.hourly.weather_code.push(v.code); f.hourly.precipitation_probability.push(v.pop); f.hourly.apparent_temperature.push(v.feels);
    f.hourly.cloud_cover.push(v.cloud); f.hourly.wind_speed_10m.push(v.wind); f.hourly.wind_gusts_10m.push(v.gust); f.hourly.uv_index.push(v.uv);
    m.hourly.time.push(t); m.hourly.wave_height.push(v.wave); m.hourly.wave_period.push(8); m.hourly.wave_direction.push(90); m.hourly.sea_surface_temperature.push(v.sstC);
  }
  return { forecast: f, marine: m };
}
const one = (date: string, base?: Partial<Hour>, byHour?: Record<number, Partial<Hour>>) => scoreWeek(synth(date, base, byHour))[0] as any;
const text = (d: any) => [...(d.vetoes || []), ...(d.reasons || [])].join(" | ").toLowerCase();

describe("canonical fixtures (live Open-Meteo, 25-27 Nov 2026)", () => {
  const week = () => scoreWeek({ forecast: forecast3(), marine: marine3() }) as any[];
  it("returns one DayScore per forecast day with the documented shape", () => {
    const w = week();
    expect(w.map((d) => d.date)).toEqual(["2026-11-25", "2026-11-26", "2026-11-27"]);
    for (const d of w) {
      expect(d.score).toBeGreaterThanOrEqual(0); expect(d.score).toBeLessThanOrEqual(100);
      expect(["great", "good", "fair", "poor"]).toContain(d.label);
      expect(Array.isArray(d.vetoes)).toBe(true); expect(Array.isArray(d.reasons)).toBe(true);
      expect(typeof d.uv.max).toBe("number"); expect(typeof d.lowConfidence).toBe("boolean");
    }
  });
  it("25 Nov (rain all day) is capped at 35 with a rain reason", () => {
    const d = week()[0];
    expect(d.score).toBeLessThanOrEqual(35);
    expect(text(d)).toMatch(/rain/);
  });
  it("26 Nov (clear, breezy) scores 80 or more", () => {
    expect(week()[1].score).toBeGreaterThanOrEqual(80);
    expect(week()[1].label).toBe("great");
  });
  it("first three days are not low confidence", () => {
    expect(week().map((d) => d.lowConfidence)).toEqual([false, false, false]);
  });
  it("is deterministic", () => {
    expect(week()).toEqual(week());
  });
  it("wave period never changes the score (D-002)", () => {
    const a = week();
    for (const p of [0.5, 20]) {
      const m = marine3(); m.hourly.wave_period = m.hourly.wave_period.map(() => p);
      expect(scoreWeek({ forecast: forecast3(), marine: m })).toEqual(a);
    }
  });
  it("UV is an advisory badge only", () => {
    const a = week();
    const f = forecast3(); f.hourly.uv_index = f.hourly.uv_index.map(() => 13); f.daily.uv_index_max = f.daily.uv_index_max.map(() => 13);
    const b = scoreWeek({ forecast: f, marine: marine3() }) as any[];
    expect(b.map((d) => d.score)).toEqual(a.map((d) => d.score));
    expect(b[1].uv.category).toBe("extreme");
  });
  it("marine null gives a partial result from weather only", () => {
    const w = scoreWeek({ forecast: forecast3(), marine: null }) as any[];
    expect(w).toHaveLength(3);
    for (const d of w) { expect(d.partial).toBe(true); expect(text(d)).toMatch(/wave data unavailable/); expect(typeof d.score).toBe("number"); }
  });
  it("days 4-7 are lowConfidence (7-day reconstructed fixture, shape only)", () => {
    const w = scoreWeek({ forecast: fx("miami-forecast-2026-11-25-7day-reconstructed.json"), marine: fx("miami-marine-2026-11-25-7day-reconstructed.json") }) as any[];
    expect(w).toHaveLength(7);
    expect(w.map((d) => d.lowConfidence)).toEqual([false, false, false, true, true, true, true]);
  });
});

describe("doc 05 scoring cases (synthetic days)", () => {
  it("a calm day scores great", () => { expect(one("2026-11-26").score).toBeGreaterThanOrEqual(80); });

  it("thunderstorm in 2+ window hours caps at 20 with lightning veto", () => {
    const d = one("2026-11-26", {}, { 14: { code: 95 }, 15: { code: 96 } });
    expect(d.score).toBeLessThanOrEqual(20);
    expect(d.vetoes.join(" ").toLowerCase()).toContain("lightning");
    expect(text(d)).toContain("lightning");
  });
  it("a single thunderstorm hour does not veto", () => {
    const d = one("2026-11-26", {}, { 14: { code: 95 } });
    expect(text(d)).not.toContain("lightning"); expect(d.score).toBeGreaterThan(20);
  });
  it("thunderstorm only at 19:00 (outside the window) does not veto", () => {
    const d = one("2026-11-26", {}, { 19: { code: 95 }, 20: { code: 95 } });
    expect(text(d)).not.toContain("lightning"); expect(d.score).toBeGreaterThanOrEqual(80);
  });
  it("rain most of the day caps at 35", () => {
    const d = one("2026-11-26", { code: 63, pop: 90 });
    expect(d.score).toBeLessThanOrEqual(35);
  });
  it("apparent temperature 104F lowers the score with a heat reason; 85F does not", () => {
    const hot = one("2026-11-26", { feels: 104 }), ok = one("2026-11-26", { feels: 85 });
    expect(hot.score).toBeLessThan(ok.score);
    expect(text(hot)).toMatch(/heat|hot|danger|temperature/);
    expect(text(ok)).not.toMatch(/heat|hot|danger/);
  });
  it("wave height: 1.5 ft keeps full wave points, 4 ft loses most", () => {
    const small = one("2026-11-26", { wave: 1.5 }), two = one("2026-11-26", { wave: 2 }), big = one("2026-11-26", { wave: 4 });
    expect(small.score).toBe(two.score);
    expect(small.score - big.score).toBeGreaterThanOrEqual(5);
  });
  it("UV 11 shows an extreme badge but no penalty", () => {
    const hi = one("2026-11-26", { uv: 11 }), lo = one("2026-11-26", { uv: 3 });
    expect(hi.uv.category).toBe("extreme"); expect(lo.uv.category).toBe("moderate");
    expect(hi.score).toBe(lo.score);
  });
  it("missing marine data: weather-only score, partial, reason", () => {
    const { forecast } = synth("2026-11-26");
    const d = (scoreWeek({ forecast, marine: null }) as any[])[0];
    expect(d.partial).toBe(true); expect(text(d)).toMatch(/wave data unavailable/);
  });
  it("uses local times across both DST changes (2026-11-01 and 2026-03-08)", () => {
    for (const date of ["2026-11-01", "2026-03-08"]) {
      const d = one(date);
      expect(d.date).toBe(date);
      if (d.bestWindow) {
        const hr = (x: string) => +/(\d{2}):\d{2}/.exec(x)![1]; const s = hr(d.bestWindow.start), e = hr(d.bestWindow.end);
        expect(s).toBeGreaterThanOrEqual(9); expect(e).toBeLessThanOrEqual(17);
      }
    }
  });
});
