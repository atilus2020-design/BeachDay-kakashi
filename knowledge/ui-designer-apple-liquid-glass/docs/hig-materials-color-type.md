# Apple HIG — materials (Liquid Glass), colour, typography (reference notes)

Sources (read 2026-11-26):
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/design/human-interface-guidelines/color
- https://developer.apple.com/design/human-interface-guidelines/typography
- https://developer.apple.com/design/human-interface-guidelines/accessibility

## Materials and Liquid Glass
- Liquid Glass "forms a distinct functional layer for controls and navigation elements… that floats above the content layer."
- **"Don't use Liquid Glass in the content layer."** **"Use Liquid Glass effects sparingly."**
- Variants: *regular* "blurs and adjusts the luminosity of background content to maintain legibility"; *clear* is "highly translucent". "Only use clear Liquid Glass for components that appear over visually rich backgrounds."
- Over bright content, "consider adding a dark dimming layer of 35% opacity."
- "Help ensure legibility by using vibrant colors on top of materials." Standard materials separate foreground from background *within* the content layer.

## Colour
- "Avoid using the same color to mean different things." "Use color consistently… status or interactivity."
- "Make sure all your app's colors work well in light, dark, and increased contrast contexts."
- "Apply color sparingly to the Liquid Glass material, and to symbols or text on the material."
- "Avoid relying solely on color to differentiate between objects, indicate interactivity, or communicate essential information."

## Typography
- iOS default text size **17 pt**, minimum **11 pt**.
- "In general, avoid light font weights." Prefer Regular, Medium, Semibold or Bold; avoid Ultralight, Thin and Light.
- SF Pro is the iOS system font (web: the `-apple-system`/`system-ui` stack; never ship SF font files). "Minimize the number of typefaces."
- Keep the hierarchy when text is enlarged (Dynamic Type; web: rem units).

## Accessibility (HIG)
- Contrast minimums: text up to 17 pt → **4.5:1**; 18 pt or bold → **3:1**.
- Controls: iOS default **44×44 pt**, minimum 28×28 pt.
- Support enlarging text "by at least 200 percent". Honour Reduce Motion.

## Beach Day translation (web)
- Glass only on the top bar, the bottom sheet and floating controls. Score cards and text sit on near-opaque surfaces.
- Glass: `backdrop-filter: blur(20px) saturate(160%)` + a translucent tint + a 1 px light inner border. Fall back to solid when `backdrop-filter` is unsupported or `prefers-reduced-transparency: reduce` is set.
- Original styling inspired by Apple's language. No Apple logos, SF Symbols or trademarks.
