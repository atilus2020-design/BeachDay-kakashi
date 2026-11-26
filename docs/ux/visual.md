# Beach Day visual system (Sable)

Original Apple-inspired Liquid Glass. No Apple logos, SF Symbols or font files; system font stack only.
Every page links **only** `<link rel="stylesheet" href="/src/styles/base.css">` (it `@import`s `tokens.css` and `materials.css`).
Glass is used only for header/nav, sheets/dialogs and floating controls. Content (cards, score, text) sits on solid `--surface`.
Solid fallbacks: `@supports not (backdrop-filter)`, `prefers-reduced-transparency`, `prefers-contrast: more`. Reduced motion disables animation. Tap size 44px. Safe-area insets via `--safe-*`. Never disable zoom.

## Tokens (`tokens.css`, light + dark)
Colour: `--bg --surface --surface-2 --text --text-2 --line --line-soft --accent --on-accent --danger --on-danger --score-great|good|fair|poor` (usable as text on `--surface`), `--score-*-bg` (pill fills), `--banner-info|stale|offline|error-bg`, `--diff-add|del-bg`, `--diff-add|del-text`, `--glass-tint --glass-border --glass-highlight --scrim --focus-ring`, `--shadow-1 --shadow-2`.
Shape/space: `--radius-s|m|l|pill`, `--space-1..12` (4-pt), `--tap` (44px), `--content-w`, `--content-w-wide`, `--gutter`.
Type: `--font --font-round --font-mono --text-s|m|l|xl --text-score`. Motion: `--dur-fast|dur|dur-slow --ease`. Safe area: `--safe-top|right|bottom|left`.

## Class contract
**Utilities:** `.visually-hidden` (screen-reader only), `.skip-link` (first focusable element, href `#main`), `.stack` (vertical rhythm), `.text-2` (secondary text). Focus ring is global (`:focus-visible`).

**Shell:** `.site-header` (sticky glass; contains `.site-header__brand` link and `.site-nav` with `<a>`s; current page `aria-current="page"`), `.site-footer` (contains `ul.site-footer__links` + text).

**Layout:** `.page` (main container, 720px), `.page--wide` (1080px, Agents), `.page-title`, `.section`, `.section__title`.

**Cards / score:** `.card`, `.card__title`; `.score-card` with `.score-card__beach`, `.score-card__number` (big numeral), `.score-card__label` (word + icon), `.score-card__window`, `.score-card__reasons` (ul). Score colour text classes: `.score--great|good|fair|poor` (always paired with number + word + icon). Pills: `.pill` + `.pill--great|good|fair|poor|model`.

**Buttons:** `.btn` + `.btn--primary|secondary|destructive`, `.btn--block`; `disabled`/`aria-disabled` styled. `.btn-row` (wrap), `.btn-row--apart` (keeps Approve and Reject far apart).

**Forms:** `.field` (wrapper), `.field__label`, `.field__hint`, `.input`, `.select`, `.textarea`, `aria-invalid="true"` shows error border, `.field__error` (text + warning glyph; link with `aria-describedby`), `.form-error` (form-level), `.divider` (e.g. "or"), `.auth-card` (narrow login container).

**Checkbox/toggle:** `label.check` wrapping `input[type=checkbox]` (24px box, row min-height 44px) and `span.check__label`, e.g. "Show password". `.form-error` now starts with a CSS "warning" glyph (not colour-only).

**PWA:** `.pwa-banner` (`role="status"` update banner; first child is the text, then a `.btn` Reload), `button.install-btn` (44px, hide with `hidden`), `.install-sheet` (+ `__steps`) inside `.sheet` for iOS "Tap Share, then Add to Home Screen" with a "Not now" `.btn--secondary`.

**Day strip:** `ul/div.day-strip` (scrolls inside itself) containing `button.day-strip__day[aria-pressed]` with `.day-strip__name` and `.day-strip__score`.

**Banners:** `.banner` + `.banner--info|stale|offline|error`, children `.banner__icon`, `.banner__body`, `.banner__action`. Put in an `aria-live="polite"` region.

**Skeleton:** `.skeleton` + `.skeleton--text|score|block`.

**Agents:** `ul.agent-grid` > `li` > `button.agent-card` (`aria-pressed` or `.agent-card--selected`) with `.agent-card__name`, `.agent-card__desc`, `.pill.pill--model.agent-card__model`, `ul.knowledge-list`.

**Chat:** `.chat`, `.chat__log` (scrolling, give `role="log"`), `.bubble` + `.bubble--user|assistant` (`aria-busy="true"` shows an ellipsis while streaming), `.tool-row` (+ `.tool-row--error`), `.composer` (sticky glass; contains `.textarea` + `.btn`).

**Proposals / diff:** `.proposal-list`, `.proposal-item`; `.diff` (`<pre>`/div, monospace, wraps) with `.diff__line` + `--add|del|hunk|meta`, each line starts with a marker `<span>` holding the real text `+` / `−` (or empty), either `.diff__mark` or `[data-testid="diff-marker"]`, styled monospace and bold, then a `<span>` of text set via `textContent`. CSS draws no marker, so nothing is shown twice. Add `.visually-hidden` "added"/"removed" text if desired.

**Dialog / sheet:** `dialog.dialog` (native; `.dialog__title`, `.dialog__actions`) or `div.dialog` with `.scrim`; `.sheet` (bottom glass sheet); `.install-sheet` + `.install-sheet__steps`; `.floating-control` (fixed glass button).

**Long-form:** wrap in `.prose` (or put `.content` on `<main class="page content">`, which shares the same rules; guide copy buttons get 44px targets) (h1-h3, lists, `code`, `pre`, `blockquote`/`.callout`, tables scroll inside). `.link-list` (44px link rows for Resources), `ol.steps` (numbered setup steps for Guide).

## Contrast results (`node` check over tokens.css; text 4.5:1, UI 3:1)
All pass in light and dark for: text/text-2 on bg, surface, surface-2; on-accent/accent; accent on surface/bg; on-danger/danger; danger on surface and banner; text on every banner bg; score-great/good/fair/poor as text on surface, bg and their own pill bg; diff text on diff bg; line (3:1 border), focus-ring, accent, danger on bg/surface; text and text-2 over glass tint (0.78 alpha) composited on bg and surface. Only miss: dark text-2 over glass on a pure-white backdrop (4.01) which cannot occur (page is dark navy); reduced-transparency uses solid.

**Layout notes (Wave 3):** `.agent-grid > li` stretch so cards are equal height, the chat button sits at the card bottom; `.proposal-list > .card` has no extra margin (grid gap only); `[data-testid="hourly-list"]` rows are 44px with hairlines; chat panel is a `.section` under the grid.
