---
name: accessibility-wcag
description: "Apply WCAG 2.2 AA to Beach Day: contrast, colour independence, target size, focus, live regions, reduced motion. Use when designing, building or testing any UI."
---
# Accessibility (WCAG 2.2 AA)

- 1.4.1: score = number + word + icon, never colour alone. Diffs use +/− markers.
- 1.4.3 / 1.4.11: text 4.5:1, UI parts 3:1 — check over glass in light and dark.
- 1.4.4 / 1.4.10: works at 200% zoom and 320px; never disable zoom.
- 2.5.8: targets ≥ 24px (we use 44px).
- 2.4.7 / 2.4.11: visible focus, not hidden by sticky header.
- 4.1.2: native controls first (`<select>`, `<button>`); labels on inputs.
- 4.1.3: status messages in `aria-live="polite"`; streaming chat announced per finished message, not per token.
- 3.3.8: login allows password managers and paste; no CAPTCHA puzzles.
- `prefers-reduced-motion`, `lang="en"`, one `<h1>` per page, landmarks.
- Verify with axe (`@axe-core/playwright`) + keyboard + VoiceOver/TalkBack spot checks. Spec: https://www.w3.org/TR/WCAG22/
