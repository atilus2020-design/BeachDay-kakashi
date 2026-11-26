// Public GET /api/forecast?beach=<id>. Proxies Open-Meteo forecast + marine (build-plan §3.2).
import type { Config } from "@netlify/functions";
import beaches from "../../src/data/beaches.json" with { type: "json" };

const HOURLY = ["weather_code", "precipitation_probability", "precipitation", "apparent_temperature", "cloud_cover", "wind_speed_10m", "wind_gusts_10m", "uv_index", "is_day"];
const DAILY = ["weather_code", "precipitation_probability_max", "apparent_temperature_max", "wind_speed_10m_max", "uv_index_max", "sunrise", "sunset"];
const MARINE_HOURLY = ["wave_height", "wave_period", "wave_direction", "sea_surface_temperature"];

const env = (k: string): string | undefined => (globalThis as any).Netlify?.env?.get?.(k) ?? process.env[k];
const trim = (s: string) => s.replace(/\/+$/, "");

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra };
}
const OK_CACHE = {
  "Cache-Control": "public, max-age=300",
  "Netlify-CDN-Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600",
};
const err = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: headers({ "Cache-Control": "no-store" }) });

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j === "object" && !("error" in j && (j as any).error === true) ? j : null;
  } catch {
    return null; // never echo upstream bodies or errors
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return err(405, "Method not allowed");
  const id = new URL(req.url).searchParams.get("beach");
  if (!id) return err(400, "Missing beach parameter");
  const beach = beaches.find((b) => b.id === id);
  if (!beach) return err(404, "Unknown beach");

  const fBase = trim(env("OPEN_METEO_BASE") || "https://api.open-meteo.com");
  const mBase = trim(env("OPEN_METEO_MARINE_BASE") || "https://marine-api.open-meteo.com");
  const fUrl = `${fBase}/v1/forecast?` + new URLSearchParams({
    latitude: String(beach.lat), longitude: String(beach.lon),
    hourly: HOURLY.join(","), daily: DAILY.join(","),
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch",
    timezone: "America/New_York", forecast_days: "7",
  });
  const mUrl = `${mBase}/v1/marine?` + new URLSearchParams({
    latitude: String(beach.lat), longitude: String(beach.lon),
    hourly: MARINE_HOURLY.join(","), daily: "wave_height_max,wave_period_max",
    length_unit: "imperial", cell_selection: "sea", timezone: "America/New_York", forecast_days: "7",
  });
  const [forecast, marine] = await Promise.all([getJson(fUrl), getJson(mUrl)]);
  if (!forecast && !marine) return err(502, "Weather data is unavailable right now");

  const body = { beach, forecast, marine, partial: !forecast || !marine, fetchedAt: new Date().toISOString() };
  return new Response(JSON.stringify(body), { status: 200, headers: headers(OK_CACHE) });
};

export const config: Config = {
  path: "/api/forecast",
  method: "GET",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
