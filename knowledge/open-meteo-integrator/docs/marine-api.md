# Open-Meteo Marine API — reference notes

Source: https://open-meteo.com/en/docs/marine-weather-api (read 2026-11-26)

- **Endpoint:** `https://marine-api.open-meteo.com/v1/marine`
- **Hourly fields:**
  - `wave_height`, `wave_direction`, `wave_period`, `wave_peak_period`
  - `wind_wave_height|direction|period|peak_period`
  - `swell_wave_height|direction|period|peak_period`, plus secondary and tertiary swell fields
  - `ocean_current_velocity`, `ocean_current_direction`
  - `sea_surface_temperature`
  - `sea_level_height_msl` (includes tides and the inverted-barometer effect), `invert_barometer_height`
- **Daily fields:** `wave_height_max`, `wave_direction_dominant`, `wave_period_max`, and the wind_wave and swell equivalents.
- **`length_unit`:** `metric` (default) | `imperial`. Imperial gives `wave_height` in **ft**.
- **`sea_surface_temperature` stays in °C** in our live call with `length_unit=imperial` (response `hourly_units.sea_surface_temperature: "°C"`). **Convert to °F in code:** `F = C × 9/5 + 32`.
- **`cell_selection`:** `land` | `sea` | `nearest`. Use `sea` for beaches.
- **`forecast_days`:** the parameter table says default 5, up to 8. Beach Day requests 7.
- **Models:** MeteoFrance MFWAM about 8 km, ECMWF WAM 9 km, NCEP GFS Wave 16–25 km, DWD EWAM/GWAM, ERA5-Ocean.
- **Caveats (quoted):** "Accuracy at coastal areas is limited." Tides and currents at about 8 km are "not suitable for coastal navigation and does not replace your nautical almanac." UI wording: "offshore wave estimate".
- **Decision D-002:** wave period is display-only; there is no rip-current proxy.
