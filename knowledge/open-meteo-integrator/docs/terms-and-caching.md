# Terms, limits and caching

Source: https://open-meteo.com/en/terms (read 2026-11-26)

- **Free API:** non-commercial use only; fewer than **10,000 calls/day, 5,000/hour, 600/minute** (300,000/month).
- **Licence:** **CC BY 4.0**, so attribution is required: "Weather data by Open-Meteo.com" with a link.
- **Commercial use** or more calls needs a paid API key.

## Beach Day caching plan (doc 03 §3.4)
- The browser calls only `/api/forecast?beach=<id>`. The Function calls both APIs in parallel.
- Response headers: `Cache-Control: public, max-age=300` plus `Netlify-CDN-Cache-Control: public, s-maxage=1800, stale-while-revalidate=600`. Netlify's custom `[[headers]]` do **not** apply to Function responses (Netlify headers docs), so the Function must set these itself.
- Worst case is about 10 beaches × 2 APIs × 48 refreshes/day ≈ 960 calls/day, regardless of user count.
- The service worker uses network-first for `/api/forecast` with a cache fallback.
