# Decision records

Short records of decisions the project lead has made. A new decision that replaces an old one gets a new entry; the old entry is marked "Superseded".

| ID | Date | Decision | Status |
|---|---|---|---|
| D-001 | 2026-11-26 | Beach Day is a **PWA on Netlify**: a static front end and Netlify Functions for the Claude and GitHub calls, with **no other servers** | Accepted |
| D-002 | 2026-11-26 | **No rip-current proxy** in the score. Link out to the National Weather Service Surf Zone Forecast and rip current pages instead | Accepted |
| D-003 | 2026-11-26 | **Approve commits straight to `main`.** Netlify's Git-based continuous deployment redeploys the site | Accepted |
| D-004 | 2026-11-26 | Stay on the **Netlify Free plan** for now | Accepted |
| D-005 | 2026-11-26 | Use a **fine-grained personal access token** limited to this one repository for GitHub commits | Accepted |

## D-001 — PWA on Netlify, no other servers

- **Context:** A beach forecast is read-mostly, mobile and outdoors. The Agent Console needs secret-holding server code, but only a little of it.
- **Decision:** Static assets go on the Netlify CDN. All server logic lives in Netlify Functions (`netlify/functions/`), and state lives in Netlify Blobs. No VPS, container or separate database server.
- **Consequences:** Every server task must fit Netlify Function limits: 60 s for synchronous and streaming functions, 15 min for background functions (doc 03). A native wrapper (Capacitor) is out of scope unless App Store presence becomes a requirement (doc 02 §2.5).

## D-002 — No rip-current proxy

- **Context:** Open-Meteo has no rip-current risk. Doc 01 had proposed deducting points for long-period swell as a proxy.
- **Decision:** **Remove the wave-period rip proxy.** Wave height still affects comfort and swim-ability, and very high surf (≥ 6 ft) still caps the score. Rip-current risk is shown only as a prominent link to the official NWS sources:
  - NWS Miami Surf Zone Forecast: https://forecast.weather.gov/product.php?site=MFL&issuedby=MFL&product=SRF
  - Florida rip-current risk map: https://www.weather.gov/beach/florida
  - Rip current safety: https://www.weather.gov/safety/ripcurrent
- **Consequences:** The score never claims to assess rip currents. The UI copy says "Check today's rip current risk (National Weather Service)" on every day view.

## D-003 — Approve commits straight to `main`

- **Context:** Doc 04 offered committing to `main` or opening a pull request with a Deploy Preview.
- **Decision:** On Approve, the `approve` Function makes **one atomic commit to `main`** through the Git Data API (blobs → tree → commit → fast-forward ref update). There is no pull-request mode for now.
- **Consequences:** The human review in the Console is the only gate, so it must show the full diff, check the base commit for staleness and confirm before committing. The path allow-list and the token's missing Workflows permission are the safety net. Each approval causes one Netlify build, which counts toward Free plan build minutes.

## D-004 — Netlify Free plan

- **Context:** Cost should be zero until the app proves itself.
- **Decision:** Use the Netlify **Free** plan.
- **Consequences:**
  - Background functions (15 min) are available on credit-based Free plans (Netlify docs), so long agent jobs still work.
  - Function rate limits support per-IP and per-domain aggregation on Free (doc 03 §3.3).
  - Team-level rate-limit enforcement and other Enterprise features are not available.
  - Keep builds small and rare: there are monthly credit and build limits, so check the Netlify pricing page before heavy use.
  - Netlify Identity is not used.

## D-005 — Fine-grained personal access token

- **Decision:** `GITHUB_TOKEN` is a fine-grained personal access token with:
  - **only this repository** selected;
  - **Contents: Read and write** and **Metadata: Read**, and **nothing else** (in particular no Workflows permission);
  - **an expiry** (for example 90 days), with a rotation reminder in the README.

  It is stored only in Netlify environment variables (Functions scope, Production context), never in the repository or the browser.
- **Consequences:** GitHub itself rejects writes to `.github/workflows/**`. A leaked token can only touch this one repository's contents until it expires or is revoked.
