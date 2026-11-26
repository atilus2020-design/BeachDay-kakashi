---
name: beach-scoring
description: "Compute and explain the Beach Day 0\u2013100 beach score from Open-Meteo data. Use when implementing, testing, designing or explaining the score."
---
# Beach scoring (decisions D-002 applied)

1. Window: hours 09:00–17:00 local, clipped to sunrise+1h / sunset−1h.
2. Vetoes: thunderstorm codes 95/96/99 in ≥2 window hours → cap 20 "No-go: lightning"; gusts ≥39 mph → cap 20; waves ≥6 ft → cap 30 "Dangerous surf"; feels-like ≥125°F → cap 20.
3. Components (0–100) × weight: rain 30%, feels-like 20%, wind 15%, waves 15% (height only — **no rip proxy**), sky 10%, water temp 10%.
4. `day = 0.6·mean(hour) + 0.4·best 3-hour block`, then apply caps. Labels: 80+ Great, 60–79 Good, 40–59 Meh, <40 Skip it.
5. Reasons: top 2–3 penalties as plain sentences. UV = advisory badge only (EPA categories), never a penalty.
6. Days 4–7: `lowConfidence: true`. Missing marine data → `partial: true`, score from weather only.
7. Always show the NWS link: "Check today's rip current risk (National Weather Service)".
Pure function, no I/O: `scoreWeek({forecast, marine}) → DayScore[]`.
