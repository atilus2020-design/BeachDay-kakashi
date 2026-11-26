# Open-Meteo Forecast API — reference notes

Source: https://open-meteo.com/en/docs (read 2026-11-26)

- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Required:** `latitude`, `longitude` (WGS84). The API snaps to the nearest grid cell, so the response `latitude`/`longitude` differ slightly from the request (live example: requested 25.7826, -80.13 → got 25.814812, -80.12985).
- **`hourly=`** comma list. Fields Beach Day uses: `weather_code`, `precipitation_probability`, `precipitation`, `apparent_temperature`, `temperature_2m`, `relative_humidity_2m`, `cloud_cover`, `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`, `uv_index`, `uv_index_clear_sky`, `is_day`.
- **`daily=`** fields: `weather_code`, `precipitation_probability_max`, `precipitation_sum`, `apparent_temperature_max`, `temperature_2m_max`, `wind_speed_10m_max`, `wind_gusts_10m_max`, `uv_index_max`, `sunrise`, `sunset`, `daylight_duration`, `sunshine_duration`.
- **`current=`:** every hourly variable is also available as a current value.
- **Units:** `temperature_unit` = `celsius` (default) | `fahrenheit`; `wind_speed_unit` = `kmh` (default) | `ms` | `mph` | `kn`; `precipitation_unit` = `mm` (default) | `inch`. With `mph`, the response unit string is `"mp/h"`.
- **`timezone`:** default `GMT`; any IANA name or `auto`. With `America/New_York`, `hourly.time` holds **local times without an offset** (`"2026-11-25T09:00"`), and `utc_offset_seconds` is `-18000` in EST (`-14400` in EDT).
- **`forecast_days`:** default 7, max 16.
- **Response shape:** `hourly.time[i]` lines up with `hourly.<var>[i]`; units are in `hourly_units`; the same applies to `daily`.

## WMO weather codes (from the docs)
0 clear · 1 mainly clear · 2 partly cloudy · 3 overcast · 45/48 fog · 51/53/55 drizzle · 56/57 freezing drizzle · 61/63/65 rain slight/moderate/heavy · 66/67 freezing rain · 71/73/75 snow · 77 snow grains · 80/81/82 rain showers · 85/86 snow showers · **95 thunderstorm · 96/99 thunderstorm with hail**.
