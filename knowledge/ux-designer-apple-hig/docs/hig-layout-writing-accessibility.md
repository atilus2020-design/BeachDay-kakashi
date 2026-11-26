# Apple HIG — layout, writing, accessibility (reference notes for flows and copy)

Sources (read 2026-11-26):
- https://developer.apple.com/design/human-interface-guidelines/layout
- https://developer.apple.com/design/human-interface-guidelines/writing
- https://developer.apple.com/design/human-interface-guidelines/accessibility

## Layout
- **"Order content by relative importance."** People read top to bottom, so "place the most important items near the top and leading side".
- "Group related items… negative space, container shapes, or separator lines."
- "Align elements to make them easier to scan, and use indentation to convey hierarchy."
- Respect **safe areas** so the Dynamic Island and system bars don't hide controls (web: `env(safe-area-inset-*)` with `viewport-fit=cover`).
- "Determine layout based on size classes, not device type." Adapt gracefully to rotation and resizing.

## Writing
- "If you can use fewer words, do so." "Choose simple, plain language… avoiding jargon."
- Buttons: "it's almost always best to use a verb." "'Send' often works better than 'Let's do it!'"
- Errors: "display it as close to the problem as possible, avoid blame, and be clear about what someone can do to fix it." Skip "oops!".
- Empty states: "guide people on actions they can take, and give them a button or link."
- Pick a capitalization style per element type and apply it consistently. Beach Day uses sentence case throughout.
- "Favorites" beats "Your Favorites": drop needless possessives.

## Accessibility
- Don't rely on colour: "Offer visual indicators, like distinct shapes or icons, in addition to color."
- Controls: 44×44 pt default. Text should enlarge to 200%. Respect Reduce Motion. Label everything for VoiceOver.
