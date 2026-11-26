// Example 2 — score real Open-Meteo data (fixtures recorded live 2026-11-25, Miami Beach).
// Implements docs/01 §1.3 with decision D-002 (no rip proxy). Run: node score-day.mjs
import { readFileSync } from "node:fs";
const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const lerp = (v, good, bad) => { // 100 at `good`, 0 at `bad`, linear between (works either direction)
  const t = (v - good) / (bad - good); return Math.round(100 * Math.min(1, Math.max(0, 1 - t)));
};
const cToF = (c) => c * 9 / 5 + 32;
const THUNDER = new Set([95, 96, 99]);
const RAIN = new Set([61, 63, 65, 66, 67, 80, 81, 82]);

export function hourComponents(h) {
  const rain = RAIN.has(h.code) ? 0 : lerp(h.pop, 10, 70);
  let feels = h.feels < 78 ? lerp(h.feels, 78, 65) : h.feels <= 90 ? 100 : lerp(h.feels, 90, 108);
  const wind = Math.max(0, lerp(h.wind, 12, 25) - (h.gust - h.wind > 10 ? 10 : 0));
  const waves = h.wave == null ? null : lerp(h.wave, 2, 5);
  const sky = lerp(h.cloud, 30, 90);
  const water = h.sstF == null ? null : lerp(h.sstF, 80, 68);
  return { rain, feels, wind, waves, sky, water };
}
const W = { rain: 30, feels: 20, wind: 15, waves: 15, sky: 10, water: 10 };
function weighted(c) { let s = 0, w = 0; for (const k in W) if (c[k] != null) { s += c[k] * W[k]; w += W[k]; } return s / w; }
const REASON = { rain: "Rain likely", feels: "Uncomfortable temperature", wind: "Windy", waves: "Rough surf", sky: "Cloudy", water: "Chilly water" };

export function scoreDay(forecast, marine, date) {
  const H = forecast.hourly, M = marine?.hourly;
  const sunrise = forecast.daily.sunrise[forecast.daily.time.indexOf(date)];
  const sunset = forecast.daily.sunset[forecast.daily.time.indexOf(date)];
  const startH = Math.max(9, +sunrise.slice(11, 13) + 1), endH = Math.min(17, +sunset.slice(11, 13) - 1);
  const hours = [];
  H.time.forEach((t, i) => {
    if (!t.startsWith(date)) return;
    const hr = +t.slice(11, 13); if (hr < startH || hr > endH) return;
    const mi = M ? M.time.indexOf(t) : -1;
    hours.push({ t, code: H.weather_code[i], pop: H.precipitation_probability[i], feels: H.apparent_temperature[i],
      wind: H.wind_speed_10m[i], gust: H.wind_gusts_10m[i], cloud: H.cloud_cover[i],
      wave: mi >= 0 ? M.wave_height[mi] : null, sstF: mi >= 0 ? cToF(M.sea_surface_temperature[mi]) : null });
  });
  const comps = hours.map(hourComponents), scores = comps.map(weighted);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  let best = 0; for (let i = 0; i + 3 <= scores.length; i++) best = Math.max(best, (scores[i] + scores[i + 1] + scores[i + 2]) / 3);
  let score = Math.round(0.6 * mean + 0.4 * best); const vetoes = [];
  if (hours.filter((h) => THUNDER.has(h.code)).length >= 2) { score = Math.min(score, 20); vetoes.push("lightning"); }
  if (hours.filter((h) => RAIN.has(h.code) || h.pop >= 70).length >= hours.length / 2) { score = Math.min(score, 35); vetoes.push("rain-most-of-day"); }
  if (hours.some((h) => h.gust >= 39)) { score = Math.min(score, 20); vetoes.push("gale"); }
  if (hours.some((h) => h.wave >= 6)) { score = Math.min(score, 30); vetoes.push("dangerous-surf"); }
  const avgPenalty = Object.keys(W).map((k) => [k, comps.reduce((a, c) => a + (c[k] == null ? 0 : (100 - c[k]) * W[k]), 0) / comps.length])
    .sort((a, b) => b[1] - a[1]).filter(([, p]) => p > 150).slice(0, 3).map(([k]) => REASON[k]);
  const label = score >= 80 ? "great" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";
  return { date, score, label, vetoes, reasons: avgPenalty, window: `${startH}:00–${endH}:00`, hours: hours.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = fx("miami-forecast-2026-11-25.json"), m = fx("miami-marine-2026-11-25.json");
  for (const d of f.daily.time) console.log(JSON.stringify(scoreDay(f, m, d)));
}
