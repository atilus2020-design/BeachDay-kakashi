# Open-Meteo integration for Miami Beach (Kai, open-meteo-integrator)

Live calls made 2026-11-26 through the Firecrawl scrape tool (maxAge 0; both HTTP 200, `application/json`), because the container cannot resolve open-meteo.com. Point: South Beach, lat 25.7826, lon -80.13. First forecast day in the response: 2026-11-25.

## 1. Exact URLs (built by `knowledge/open-meteo-integrator/examples/build-urls.mjs`)

Forecast:
```
https://api.open-meteo.com/v1/forecast?latitude=25.7826&longitude=-80.13&hourly=weather_code%2Cprecipitation_probability%2Cprecipitation%2Capparent_temperature%2Ccloud_cover%2Cwind_speed_10m%2Cwind_gusts_10m%2Cuv_index%2Cis_day&daily=weather_code%2Cprecipitation_probability_max%2Capparent_temperature_max%2Cwind_speed_10m_max%2Cuv_index_max%2Csunrise%2Csunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=7
```
Marine:
```
https://marine-api.open-meteo.com/v1/marine?latitude=25.7826&longitude=-80.13&hourly=wave_height%2Cwave_period%2Cwave_direction%2Csea_surface_temperature&daily=wave_height_max%2Cwave_period_max&length_unit=imperial&cell_selection=sea&timezone=America%2FNew_York&forecast_days=7
```
Both are called only by the `/api/forecast` Function (cached about 30 min per beach; free tier is non-commercial, CC BY 4.0, so show "Weather data by Open-Meteo.com").

Grid snapping: forecast cell is 25.814812, -80.12985; marine sea cell is 25.791664, -80.12499 (`cell_selection=sea`). Marine is an "offshore wave estimate", not a surf report.

## 2. Fields and units (as returned)

| API | Field | Unit in response | Used for |
|---|---|---|---|
| forecast hourly | `weather_code` | wmo code | rain component, thunder/rain vetoes |
| forecast hourly | `precipitation_probability` | % | rain component (30%) |
| forecast hourly | `precipitation` | inch | display only |
| forecast hourly | `apparent_temperature` | °F | feels-like (20%) |
| forecast hourly | `wind_speed_10m`, `wind_gusts_10m` | `mp/h` (mph) | wind (15%), gale veto |
| forecast hourly | `cloud_cover` | % | sky (10%) |
| forecast hourly | `uv_index` | unitless | advisory badge only, never scored |
| forecast hourly | `is_day` | 0/1 | daylight check |
| forecast daily | `sunrise`, `sunset` | local ISO, no offset | window clip (sunrise+1h, sunset-1h) |
| forecast daily | `weather_code`, `precipitation_probability_max`, `apparent_temperature_max`, `wind_speed_10m_max`, `uv_index_max` | as above | day-strip display, UV badge |
| marine hourly | `wave_height` | ft | waves (15%), 6 ft veto |
| marine hourly | `sea_surface_temperature` | **°C** (even with `length_unit=imperial`) | water temp (10%), convert F = C x 9/5 + 32 |
| marine hourly | `wave_period`, `wave_direction` | s, ° | display only (D-002: no rip-current proxy) |
| marine daily | `wave_height_max`, `wave_period_max` | ft, s | display |

Times are local ("2026-11-25T09:00", no offset; `utc_offset_seconds` -18000), and `hourly.time[i]` lines up with every `hourly.<var>[i]`. Both responses have 168 hourly entries (7 days).

## 3. Real response excerpt (trimmed, live)

Forecast (`hourly`, 2026-11-26 09:00 to 11:00 are indexes 33 to 35; 2026-11-25 shown for the rain day):
```json
{"latitude":25.814812,"longitude":-80.12985,"utc_offset_seconds":-18000,"timezone":"America/New_York",
 "hourly_units":{"weather_code":"wmo code","precipitation_probability":"%","precipitation":"inch","apparent_temperature":"°F","cloud_cover":"%","wind_speed_10m":"mp/h","wind_gusts_10m":"mp/h"},
 "hourly":{"time":["2026-11-25T09:00","2026-11-25T15:00","2026-11-26T09:00","2026-11-26T10:00","2026-11-26T11:00"],
  "weather_code":[65,65,0,0,0],"precipitation_probability":[100,98,0,0,0],"precipitation":[2.819,6.051,0,0,0],
  "apparent_temperature":[77.3,77.3,68.8,72.6,74.2],"wind_speed_10m":[4.7,6.5,14.6,13.0,13.5],"wind_gusts_10m":[12.1,14.3,29.1,24.8,23.0]},
 "daily":{"time":["2026-11-25","2026-11-26"],"weather_code":[65,3],"precipitation_probability_max":[100,18],"uv_index_max":[1.05,5.45],"sunrise":["2026-11-25T06:45","2026-11-26T06:46"],"sunset":["2026-11-25T17:29","2026-11-26T17:29"]}}
```
Marine (same hours):
```json
{"latitude":25.791664,"longitude":-80.12499,
 "hourly_units":{"wave_height":"ft","wave_period":"s","wave_direction":"°","sea_surface_temperature":"°C"},
 "hourly":{"time":["2026-11-25T15:00","2026-11-26T09:00","2026-11-26T10:00"],"wave_height":[3.281,2.231,2.165],"wave_period":[4.8,6.7,6.65],"wave_direction":[142,63,56],"sea_surface_temperature":[25.3,25.0,25.0]},
 "daily":{"time":["2026-11-25","2026-11-26"],"wave_height_max":[3.412,2.887],"wave_period_max":[5.9,6.75]}}
```
Notable live facts: 25 Nov was a washout (code 65 heavy rain, PoP 98 to 100%, 6.05 in in one hour at 15:00). 26 Nov is clear but gusty (gusts up to 37.6 mph overnight, 29 mph at 09:00). Water is about 25 °C (77 °F).

## 4. Scoring method (reference: `score-day.mjs`, docs/01 section 1.3, D-002)

1. Window: 09:00 to 17:00 local, clipped to sunrise+1h and sunset-1h. With sunset 17:29 the live window is 9:00 to 16:00 (8 hours).
2. Per hour, six components 0 to 100 (linear between the good and bad points), weights: rain 30 (PoP 10 to 70%; rain codes 61-67/80-82 score 0), feels-like 20 (100 at 78 to 90 °F, down to 0 at 65 °F or 108 °F), wind 15 (12 to 25 mph, minus 10 if gusts exceed sustained by more than 10), waves 15 (2 to 5 ft, height only, **no rip-current proxy**), sky 10 (cloud 30 to 90%), water temp 10 (80 °F down to 68 °F, after C to F).
3. `hour = weighted mean` (a missing marine component is dropped and the weights renormalised, which gives `partial`). `day = round(0.6 x mean(hours) + 0.4 x best 3-hour block)`.
4. Vetoes cap the day: thunder codes in 2 or more hours, cap 20; rain codes or PoP 70% or more in half the hours, cap 35; gust 39 mph or more, cap 20; waves 6 ft or more, cap 30 (feels-like 125 °F or more, cap 20, is in the spec but not yet in the reference scorer).
5. Labels: 80+ great, 60 to 79 good, 40 to 59 fair ("Meh"), under 40 poor ("Skip it"). Reasons are the top 2 to 3 penalised components in plain words. UV is a badge only (EPA category from `uv_index_max`). Days 4 to 7 are `lowConfidence`. Always link the NWS rip-current page.

## 5. Computed scores (live data, via `examples/score-live.mjs`)

| Day | Score | Label | Vetoes | Top reasons | Daily context |
|---|---|---|---|---|---|
| Wed 2026-11-25 | **35** | poor | rain-most-of-day | Rain likely, Cloudy, Rough surf | heavy rain, 3.4 ft |
| Thu 2026-11-26 | **86** | great | none | Uncomfortable temperature, Chilly water, Windy | clear, UV max 5.45 (Moderate), 2.9 ft |
| Fri 2026-11-27 | **74** | good | none | Uncomfortable temperature, Cloudy, Chilly water | overcast, UV 4.65 |
| Sat 2026-11-28 | **73** | good | none | Uncomfortable temperature, Cloudy, Chilly water | low confidence |
| Sun 2026-11-29 | **86** | great | none | Cloudy, Chilly water, Rain likely | low confidence |
| Mon 2026-11-30 | **75** | good | none | Rain likely, Cloudy, Windy | low confidence |
| Tue 2026-12-01 | **79** | good | none | Cloudy, Rain likely, Chilly water | low confidence |

Day 1 would score about 52 without the rain veto, which is why that veto exists.

## 6. Files and caveats

- Fixtures (full live responses, overwriting the earlier trimmed copies of the same name): `knowledge/open-meteo-integrator/examples/fixtures/miami-forecast-2026-11-25.json` and `miami-marine-2026-11-25.json`. The previous trimmed versions are not kept in the repo (git history has them).
- Wrapper: `knowledge/open-meteo-integrator/examples/score-live.mjs` (imports `scoreDay`; `score-day.mjs` is unmodified). Run `node score-live.mjs`.
- Transcription caveat: the scrape tool returned the JSON to me as text, so I rebuilt the files with a script. The hourly arrays all have 168 entries and weather_code and precipitation agree hour by hour, but a byte-for-byte match with the API is not guaranteed.
- Observations for the lead: the reference scorer's reasons look odd for 26 Nov ("Uncomfortable temperature" at about 70 °F feels-like, "Chilly water" at 77 °F), because its penalty threshold is low; and it has no UV badge, `lowConfidence` or `partial` flag yet (the wrapper adds `lowConfidence` for days 4 to 7). Those belong in the real `src/scoring` module. Nothing was committed or pushed.
