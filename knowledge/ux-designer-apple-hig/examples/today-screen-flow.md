# Example 1 — flow spec: Home / Today screen (what good looks like)

**User goal:** "Should I go to the beach today, and when?" Answer within 2 seconds of opening.

| Order | Element | Content | Notes |
|---|---|---|---|
| 1 | Top bar (glass) | "Beach Day" · links: Agents, How it works, Resources | Sticky; respects the safe area |
| 2 | Beach picker | Native `<select>` labelled "Beach", last choice remembered | One tap to change |
| 3 | **Today card** | "86" + "Great beach day" + icon; best window "Best 10 am–1 pm" | Largest element; number + word + icon (never colour alone) |
| 4 | Reasons | Up to 3 short lines: "Light winds, 9 mph" · "Water 77°F" | Plain words, no jargon |
| 5 | Safety row | "Check today's rip current risk (National Weather Service)" → NWS link; UV badge "UV 9 · Very high" | Always visible (D-002) |
| 6 | Next days | Horizontal strip of 6 day buttons: "Fri 74 Good" | Each is a 44 px+ button; days 4–7 marked "less certain" |
| 7 | Footer | "Weather data by Open-Meteo.com" · "A planning aid, not a safety service" | CC BY 4.0 attribution |

**States**
- Loading: skeleton card with the label "Loading forecast…" (live region).
- Offline: banner "Offline — showing the forecast from 9:40 am" plus the cached content. With no cache, show the offline page with a "Try again" button.
- Error: "Couldn't load the forecast. Check your connection and try again." [Try again]
- Partial (no wave data): reason line "Wave data unavailable right now".

**Acceptance criteria**
- At 375 px wide, the score, label and best window are visible without scrolling.
- Every interactive element is ≥ 44×44 px and reachable by keyboard in reading order.
- The VoiceOver reading of the Today card is "South Beach today: 86, Great beach day. Best from 10 AM to 1 PM."
