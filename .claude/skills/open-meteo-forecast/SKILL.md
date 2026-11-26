---
name: open-meteo-forecast
description: "Call and interpret the Open-Meteo Forecast and Marine APIs for Beach Day: endpoints, field names, units, time zones, caching and terms. Use for any weather or marine data work."
---
# Open-Meteo forecast and marine

- Forecast: `https://api.open-meteo.com/v1/forecast` — `forecast_days` default 7, max 16.
- Marine: `https://marine-api.open-meteo.com/v1/marine` — `forecast_days` max 8; `cell_selection=sea`; `length_unit=imperial`.
- Always send `timezone=America/New_York`, `temperature_unit=fahrenheit`, `wind_speed_unit=mph`, `precipitation_unit=inch`.
- Hourly forecast fields we use: `weather_code, precipitation_probability, precipitation, apparent_temperature, temperature_2m, cloud_cover, wind_speed_10m, wind_gusts_10m, uv_index, is_day`.
- Daily: `weather_code, precipitation_probability_max, apparent_temperature_max, wind_speed_10m_max, uv_index_max, sunrise, sunset`.
- Marine hourly: `wave_height, wave_period, wave_direction, sea_surface_temperature` (SST is °C unless proven otherwise; convert).
- Responses: `hourly.time[]` aligned with each `hourly.<var>[]`; `hourly_units` gives units. Local ISO times without offset when `timezone` is set.
- Call only through the `/api/forecast` Function; CDN-cache per beach ~30 min. Free tier: non-commercial, <10,000 calls/day; CC BY 4.0 → show "Weather data by Open-Meteo.com".
- Marine accuracy is limited near coasts: call it an "offshore wave estimate".
- Details: `docs/01-beach-day-scoring.md`, `knowledge/open-meteo-integrator/`.
