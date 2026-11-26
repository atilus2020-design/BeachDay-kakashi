// Wrapper: score the live Miami fixtures with the reference scorer (score-day.mjs is unmodified).
// Run: node score-live.mjs [YYYY-MM-DD of first fixture day]
import { readFileSync } from "node:fs";
import { scoreDay } from "./score-day.mjs";
const first = process.argv[2] ?? "2026-11-25";
const fx = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const forecast = fx(`miami-forecast-${first}.json`), marine = fx(`miami-marine-${first}.json`);
forecast.daily.time.forEach((d, i) => console.log(JSON.stringify({ ...scoreDay(forecast, marine, d), lowConfidence: i >= 3 })));
