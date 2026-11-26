# What Beach Day QA must prove (from docs/05 and decisions)

- **Scoring:** lightning veto (≥ 2 window hours with 95/96/99), rain-most-of-day cap 35, heat bands, wave height only (no period penalty, D-002), UV advisory only, missing marine data → `partial`.
- **Phone layout:** no horizontal scroll at 375 px (`document.documentElement.scrollWidth <= window.innerWidth`); targets ≥ 44 px.
- **Offline:** load → go offline → reload shows the cached forecast with a stale banner, or `/offline.html`.
- **Agents page:** non-admins see "Not allowed"; super_admin sees the list (name, model, personality, knowledge).
- **Approve flow** against the mock GitHub: diff shown → click Approve → confirm → the mock receives `GET ref` → `GET commit` → `POST trees` → `POST commits` → `PATCH ref`. A stale base gives a 409 message.
- **Security:** every protected endpoint returns 401 with no token and 403 for a `user` role; the allow-list fuzz list is rejected; no secrets in `dist/`.
- **Accessibility:** axe has no serious or critical violations on each page.
