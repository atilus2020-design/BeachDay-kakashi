// Example 1 — build the exact Open-Meteo URLs Beach Day uses. Run: node build-urls.mjs
export const HOURLY = ["weather_code","precipitation_probability","precipitation","apparent_temperature","cloud_cover","wind_speed_10m","wind_gusts_10m","uv_index","is_day"];
export const DAILY = ["weather_code","precipitation_probability_max","apparent_temperature_max","wind_speed_10m_max","uv_index_max","sunrise","sunset"];
export const MARINE_HOURLY = ["wave_height","wave_period","wave_direction","sea_surface_temperature"];

export function forecastUrl({ lat, lon }, base = "https://api.open-meteo.com") {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    hourly: HOURLY.join(","), daily: DAILY.join(","),
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch",
    timezone: "America/New_York", forecast_days: "7",
  });
  return `${base}/v1/forecast?${p}`;
}
export function marineUrl({ lat, lon }, base = "https://marine-api.open-meteo.com") {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    hourly: MARINE_HOURLY.join(","), daily: "wave_height_max,wave_period_max",
    length_unit: "imperial", cell_selection: "sea", timezone: "America/New_York", forecast_days: "7",
  });
  return `${base}/v1/marine?${p}`;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const southBeach = { lat: 25.7826, lon: -80.13 };
  console.log(forecastUrl(southBeach));
  console.log(marineUrl(southBeach));
}
