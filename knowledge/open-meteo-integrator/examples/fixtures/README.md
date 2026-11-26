# Fixtures

| File | Origin | Trust |
|---|---|---|
| `miami-forecast-2026-11-25.json`, `miami-marine-2026-11-25.json` | Live API responses (3 days), saved **verbatim** on 2026-11-26 | **Canonical**. Use for tests |
| `*-7day-reconstructed.json` | Live 7-day responses rebuilt from scraped text by the integrator | **Display only.** May contain transcription errors (e.g. a 6.05 in/hour precipitation value). Don't assert exact values from these |
