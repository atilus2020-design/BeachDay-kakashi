---
name: apple-hig-ux
description: "Apply Apple's Human Interface Guidelines to Beach Day flows, navigation, layout, feedback and writing. Use when designing or reviewing screens and copy."
---
# Apple HIG for Beach Day

- Clarity first: the answer ("Great beach day · 86") is the largest element; details are progressive.
- Navigation: a simple top bar with the app name and links (Home, Agents, How it works, Resources); content in a single scrolling column on phones.
- Touch targets ≥ 44×44 pt; spacing generous; content respects safe areas (`env(safe-area-inset-*)`).
- Feedback: every action shows state (loading skeleton, success, error with a retry). Destructive/irreversible actions (Approve) need confirmation that names the consequence.
- Writing: short, friendly, specific; sentence case; avoid jargon ("feels like 91°F" not "apparent temperature").
- Support Dynamic Type-style scaling (rem units), dark mode, and reduced motion.
- Source: https://developer.apple.com/design/human-interface-guidelines/ (see knowledge folders for page-level notes).
