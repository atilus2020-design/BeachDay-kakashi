---
name: liquid-glass-ui
description: "Create Beach Day's Apple-style Liquid Glass visual language for the web: translucent materials, depth, tokens, typography and dark mode with legible text. Use for any visual design or CSS styling work."
---
# Liquid Glass UI on the web

- Material = `background: color-mix(in srgb, var(--glass-tint) 55%, transparent)` + `backdrop-filter: blur(20px) saturate(160%)` + 1px inner highlight border + soft shadow. Provide a solid fallback with `@supports not (backdrop-filter: blur(1px))`.
- Glass is for **controls and navigation layers** (top bar, sheets, cards over imagery); content text sits on sufficiently opaque surfaces so contrast stays ≥ 4.5:1.
- Tokens in `src/styles/tokens.css` on `:root`, redefined under `@media (prefers-color-scheme: dark)`: colours (`--bg`, `--text`, `--glass-tint`, `--score-great|good|fair|poor`), radii (continuous, 14–28px), spacing (4-pt grid), shadows, motion durations.
- Typography: system font stack `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`; large rounded score numerals; weights ≥ 500 for key numbers.
- Respect `prefers-reduced-transparency` (solid surfaces) and `prefers-reduced-motion`.
- Original design inspired by Apple's language — no Apple logos, icons or trademarks.
