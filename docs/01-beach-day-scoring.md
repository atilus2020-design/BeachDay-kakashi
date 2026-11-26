# 1. Use case and beach-day scoring

## 1.1 The use case

"Is it a good beach day?" turns into a few concrete questions for a South Florida beachgoer:

1. **Will it storm or rain while I'm there?** South Florida summer afternoons often bring thunderstorms. Lightning is the one condition that should always say "don't go".
2. **Will I be comfortable?** That means heat and humidity (feels-like temperature), sun, cloud and wind.
3. **Is the water nice?** That means wave height (calm vs rough), water temperature, and whether it is safe to swim.
4. **When is the best window?** Morning vs afternoon matters, because storms usually build after midday.

**Core user flow:** open the app (installed or in the browser) → pick a beach, with the last pick remembered → see **Today** as a big score, label and reasons → scroll a **7-day strip** of daily scores → tap a day for its hourly breakdown and best window → read the safety links (NWS surf zone and rip current forecast, beach flags).

**Not in scope at first:** official rip-current risk, water quality (bacteria), sargassum and jellyfish. Open-Meteo doesn't provide these. The UI should say so and link to official sources (§1.6).

## 1.2 APIs and exact fields

Neither API needs a key. Both take `latitude` and `longitude`, return hourly arrays aligned to a `time` array, and accept `timezone`. Use `timezone=America/New_York` (or `auto`) so that "today" and the daylight hours are local.

### Forecast API — `https://api.open-meteo.com/v1/forecast`

Source: https://open-meteo.com/en/docs

| Purpose | Hourly variable(s) | Daily variable(s) |
|---|---|---|
| Storms and rain | `weather_code`, `precipitation_probability`, `precipitation` | `weather_code`, `precipitation_probability_max`, `precipitation_sum`, `precipitation_hours` |
| Comfort | `apparent_temperature`, `temperature_2m`, `relative_humidity_2m` | `apparent_temperature_max`, `temperature_2m_max` |
| Sky | `cloud_cover` | `sunshine_duration` |
| Wind | `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m` | `wind_speed_10m_max`, `wind_gusts_10m_max`, `wind_direction_10m_dominant` |
| Sun safety | `uv_index`, `uv_index_clear_sky` | `uv_index_max` |
| Daylight window | `is_day` | `sunrise`, `sunset`, `daylight_duration` |

Units: `temperature_unit=fahrenheit`, `wind_speed_unit=mph` (also `kmh`, `ms`, `kn`) and `precipitation_unit=inch`. `forecast_days` defaults to 7, with a maximum of 16. A `current=` parameter also exists, and every hourly variable is available there, which suits a "right now" badge.

### Marine API — `https://marine-api.open-meteo.com/v1/marine`

Source: https://open-meteo.com/en/docs/marine-weather-api

| Purpose | Hourly variable(s) | Daily variable(s) |
|---|---|---|
| Surf size | `wave_height`, `wind_wave_height`, `swell_wave_height` | `wave_height_max`, `swell_wave_height_max` |
| Surf character (used as a rip proxy) | `wave_period`, `swell_wave_period`, `swell_wave_peak_period`, `wave_direction`, `swell_wave_direction` | `wave_period_max`, `swell_wave_period_max`, `wave_direction_dominant` |
| Water temperature | `sea_surface_temperature` | *(none: compute it from hourly data)* |
| Tide-ish | `sea_level_height_msl` (includes ocean tides and the inverted-barometer effect) | — |
| Currents | `ocean_current_velocity`, `ocean_current_direction` | — |

Parameters: `length_unit=imperial` (default `metric`), `cell_selection=sea` (also `land` and `nearest`; use `sea` so a shoreline point snaps to an ocean cell) and `forecast_days` (parameter table: default 5, max 8). Request `forecast_days=7` so both APIs cover the same week.

**Caveats from the Marine docs:**

- "Accuracy at coastal areas is limited."
- Tides and currents come from about 8 km models: "not suitable for coastal navigation and does not replace your nautical almanac."
- Sea level near the coast "can be reasonably accurate near unobstructed coasts".

The UI copy must reflect this: say "offshore wave estimate", never "surf report".

**To verify in the first spike:** whether the Marine API accepts `temperature_unit=fahrenheit` for `sea_surface_temperature`. If not, convert °C to °F in code. Also confirm which marine model covers the Florida coast best (MeteoFrance MFWAM at about 8 km, ECMWF WAM at 9 km, and NCEP GFS Wave at about 16–25 km are listed). The default "best match" is a reasonable starting point.

### Example requests (Miami Beach)

```
https://api.open-meteo.com/v1/forecast?latitude=25.7826&longitude=-80.1300
  &hourly=weather_code,precipitation_probability,precipitation,apparent_temperature,temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,is_day
  &daily=weather_code,precipitation_probability_max,precipitation_sum,apparent_temperature_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset
  &temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch
  &timezone=America%2FNew_York&forecast_days=7

https://marine-api.open-meteo.com/v1/marine?latitude=25.7826&longitude=-80.1300
  &hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,sea_surface_temperature
  &daily=wave_height_max,wave_period_max
  &length_unit=imperial&cell_selection=sea&timezone=America%2FNew_York&forecast_days=7
```

## 1.3 Scoring model

Design goals: **explainable** (each point lost has a stated reason), **safety first** (hard vetoes outrank averages), **tunable** (all thresholds live in one config file) and **pure** (a function from the API JSON to the score, so it is easy to unit-test).

### Step 1: the beach window

Score only the hours people are actually at the beach: daylight hours from **09:00 to 17:00 local**, clipped to `sunrise` + 1 h and `sunset` − 1 h. Also report the best 3-hour block in that window (the highest mean hourly score). This captures "go this morning, storms likely after 2 pm".

### Step 2: hard vetoes (cap the score)

| Condition (any hour in the window) | Effect | Why |
|---|---|---|
| `weather_code` ∈ {95, 96, 99} (thunderstorm, with or without hail) | Day capped at **20, "No-go: lightning"** if ≥ 2 window hours; that hour scores 0 | NWS: "When thunder roars, go indoors", and wait 30 minutes after the last thunder. https://www.weather.gov/safety/lightning-safety-overview |
| `wind_gusts_10m` ≥ 39 mph (Beaufort 8, gale) | Capped at 20 | Unsafe, and sand blasts |
| `wave_height` ≥ 6 ft | Capped at 30, "Dangerous surf" | High surf; likely high rip-current risk |
| Apparent temperature ≥ 125 °F | Capped at 20 | NWS heat index "Extreme Danger" |

Thunderstorm codes in the WMO table (Open-Meteo docs): 95 is a thunderstorm, and 96 and 99 are thunderstorms with slight or heavy hail.

### Step 3: component scores (0–100 each) and weights

| Component | Weight | Input | 100 points | Falls to 0 | Source for thresholds |
|---|---|---|---|---|---|
| **Rain** | 30% | hourly `precipitation_probability`, `weather_code` | PoP ≤ 10% and code 0–3 | PoP ≥ 70%, or rain codes 61–67 / 80–82 | WMO codes from Open-Meteo docs; thresholds are product judgment |
| **Feels-like** | 20% | `apparent_temperature` (°F) | 78–90 °F | ≤ 65 °F or ≥ 108 °F; −15 points per band above 90 (Caution 80–90, Extreme Caution 90–103, Danger 103–124) | NWS heat index categories, https://www.weather.gov/ama/heatindex (note: the chart is for shade; full sun can add up to 15 °F) |
| **Wind** | 15% | `wind_speed_10m`, `wind_gusts_10m` (mph) | sustained ≤ 12 mph (Beaufort ≤ 3, gentle breeze) | sustained ≥ 25 mph (Beaufort 6); minus 10 if gusts exceed sustained by more than 10 mph | NWS Miami Beaufort scale: gentle 8–12 mph, moderate 13–18, fresh 19–24. https://www.weather.gov/mfl/beaufort |
| **Waves** | 15% | `wave_height` (ft), `wave_period` (s) | ≤ 2 ft | ≥ 5 ft; minus 15 if period ≥ 10 s with height ≥ 3 ft (long-period swell is a rip-risk proxy) | Product judgment; label it as a proxy and link the NWS Surf Zone Forecast |
| **Sky** | 10% | `cloud_cover` (%) | ≤ 30% | ≥ 90% | Product judgment |
| **Water temperature** | 10% | `sea_surface_temperature` (°F) | ≥ 80 °F | ≤ 68 °F (linear between) | Product judgment for South Florida (summer water is often in the mid-80s °F) |

**UV is an advisory, not a score input.** High UV goes with sunny, good beach weather, so penalizing it would invert the score. Show the EPA category as a badge instead, along with its action text:

| `uv_index_max` | EPA category | Badge text (from EPA guidance) |
|---|---|---|
| 0–2 | Low | Sunglasses on bright days |
| 3–5 | Moderate | Seek shade near midday |
| 6–7 | High | Reduce time in the sun 10 am–4 pm |
| 8–10 | Very High | Minimize sun 10 am–4 pm; skin burns quickly |
| 11+ | Extreme | Avoid sun 10 am–4 pm; SPF 30+ every 2 hours |

Source: EPA, "The UV Index", https://www.epa.gov/sunsafety/uv-index-1. The category wording above is quoted from EPA's archived UV Index Scale page, https://19january2017snapshot.epa.gov/sunsafety/uv-index-scale-1_.html. In South Florida, Extreme UV is common in summer, so the badge should always be visible.

### Step 4: combine and label

```
hourScore = Σ(weight_i × component_i)          // per hour in the window
dayScore  = 0.6 × mean(hourScores) + 0.4 × max(3-hour block mean)
dayScore  = min(dayScore, any veto cap)
```

| Score | Label | Colour token (always paired with text and an icon) |
|---|---|---|
| 80–100 | Great beach day | `--score-great` |
| 60–79 | Good | `--score-good` |
| 40–59 | Meh | `--score-fair` |
| 0–39 | Skip it | `--score-poor` |

**Explanations:** return the two or three components that cost the most points as plain sentences, for example "Thunderstorms likely after 2 pm", "Breezy: 18 mph winds" or "Rough surf: 4 ft waves". This is the most valuable part of the UI and makes the score trustworthy.

**Confidence:** forecast skill drops with lead time. Show days 4–7 with a "lower confidence" hint, and don't report hourly best windows beyond day 3.

### Suggested module shape

```ts
// src/scoring/score.ts: pure, no fetch, 100% unit-tested
export interface BeachInputs { forecast: ForecastJson; marine: MarineJson; config?: ScoreConfig }
export interface DayScore {
  date: string;               // YYYY-MM-DD local
  score: number;              // 0–100
  label: "great" | "good" | "fair" | "poor";
  vetoes: string[];           // e.g. ["lightning"]
  reasons: string[];          // top penalties, human-readable
  bestWindow?: { start: string; end: string; score: number };
  uv: { max: number; category: "low" | "moderate" | "high" | "very-high" | "extreme" };
  lowConfidence: boolean;
}
export function scoreWeek(input: BeachInputs): DayScore[];
```

## 1.4 South Florida beach list (seed data)

Store this as `src/data/beaches.json` with `id`, `name`, `city`, `county`, `lat`, `lon`, `nwsOffice`, and optionally `coast: "atlantic" | "gulf"`.

The coordinates below are approximate beachfront points. **Verify each one on a map before launch**, and keep the point just offshore of the sand so `cell_selection=sea` picks an ocean grid cell.

| id | Beach | County | lat | lon |
|---|---|---|---|---|
| south-beach | South Beach, Miami Beach | Miami-Dade | 25.7826 | -80.1300 |
| crandon | Crandon Park, Key Biscayne | Miami-Dade | 25.7180 | -80.1540 |
| haulover | Haulover Beach | Miami-Dade | 25.9030 | -80.1205 |
| hollywood | Hollywood Beach | Broward | 26.0112 | -80.1173 |
| fort-lauderdale | Fort Lauderdale Beach | Broward | 26.1189 | -80.1037 |
| deerfield | Deerfield Beach | Broward | 26.3184 | -80.0748 |
| boca-raton | Boca Raton (Red Reef / Spanish River) | Palm Beach | 26.3683 | -80.0687 |
| delray | Delray Beach | Palm Beach | 26.4615 | -80.0587 |
| palm-beach | Palm Beach (Midtown) | Palm Beach | 26.7056 | -80.0364 |
| jupiter | Jupiter Beach | Palm Beach | 26.9342 | -80.0705 |

Keys and Gulf-coast beaches (Naples, Marco Island) can be added later. The Gulf has a different wave climate, so the wave thresholds may need a per-coast config.

## 1.5 API terms and budget

From https://open-meteo.com/en/terms:

- **Free tier:** non-commercial use only, under 10,000 calls a day, 5,000 an hour and 600 a minute (300,000 a month). Commercial use or more calls needs a paid API key.
- **Licence:** the data is **CC BY 4.0**. The app must show attribution, for example "Weather data by Open-Meteo.com" with a link, in the footer and on the About page.

**Budget:** one beach view needs two calls (forecast and marine). With a caching proxy (doc 3) keyed per beach and cached for about 30 minutes, the worst case is about 10 beaches × 2 APIs × 48 refreshes a day ≈ **960 calls a day**, however many users there are. That is well inside the limits.

**If Beach Day ever becomes commercial** (ads, paid tier), switch to an Open-Meteo API key first.

## 1.6 Safety, liability and official sources to link

- **Rip currents:** the NWS Surf Zone Forecast has three risk levels: Low ("life threatening rip currents often occur in the vicinity of groins, jetties, reefs, and piers"), Moderate and High. For South Florida, link NWS Miami (MFL) and, for Jupiter, NWS Melbourne (MLB). Florida statewide map: https://www.weather.gov/beach/florida. Product list: https://www.weather.gov/safety/ripcurrent-forecasts
- **Beach warning flags:** Florida uses a standard flag program: green (low hazard), yellow (medium), red (high), double red (water closed) and purple (dangerous marine life). Example county page: https://www.volusia.org/services/public-protection/beach-safety/beach-warning-flags.stml. The app can't know the flag flying today, so tell users to obey the lifeguard flags.
- **Lightning:** https://www.weather.gov/safety/lightning-safety-overview
- **Heat:** https://www.weather.gov/ama/heatindex
- **Disclaimer copy (required):** "Beach Day is a planning aid based on model forecasts. It is not a safety service. Always follow lifeguard flags and official NWS warnings."

## 1.7 Open questions

- Should the score have **personas** (swimmer, sunbather, surfer)? A surfer wants 3–5 ft waves, the opposite of a swimmer. A weight preset per persona is cheap to add later because the config is separate.
- Should we fetch **NWS rip-current risk** via the NWS API (api.weather.gov) for the first one or two days? That adds a second data source and its own failure modes. Spike it before committing.
- Should water temperature use **a daily mean or the mid-day value**? Mid-day is simpler and close enough.
