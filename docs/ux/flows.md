# Beach Day: screen flows, states and test hooks

Owner: Wren (ux-designer-apple-hig) · Date: 2026-11-26 · Wave 1 deliverable.
Companion file: [`copy.md`](copy.md) holds every exact string, keyed by the same `data-testid` names used here.

**Binding rules for Milo (frontend), Quinn (login page) and Pike (e2e):**

1. Every `data-testid` below is a contract. Do not rename or drop one. Add new ones only if you also tell the orchestrator.
2. Copy comes from `copy.md`, character for character (curly apostrophes as written, en dash in time ranges, real minus sign U+2212 only where stated).
3. Mobile first at 375 px, one scrolling column. Targets are at least 44 x 44 px. Sentence case everywhere. Buttons start with a verb.
4. Meaning is never colour alone: score = number + word + icon; diff lines = marker glyph + text; status = word + icon.
5. Status messages go to one `aria-live="polite"` region per page (`data-testid="live-status"`). Streaming chat is announced once per finished message, never per token (WCAG 4.1.3).
6. All server text is inserted with `textContent` (never `innerHTML`).
7. Where a testid repeats (cards, rows, cells) it is the same name on every item, and the item carries a `data-*` attribute for its identity.

---

## 0. Site map and navigation

| Route | Page | Who | Page script |
|---|---|---|---|
| `/` | Home (beach day) | anyone | `home` |
| `/login/` | Log in, sign up, forgot password, signed-in state | anyone | `login` |
| `/login/reset/` | Set a new password (after the email link) | anyone with a recovery link | `login-reset` |
| `/agents/` | Agents: grid, chat, proposals | `super_admin` only | `agents` |
| `/agents/#proposals` | Proposals list (same page, hash view) | `super_admin` | `agents` |
| `/agents/#proposal/<id>` | Proposal detail (same page, hash view; the chat `proposal` event links here) | `super_admin` | `agents` |
| `/how-it-works/` | How it works | anyone | `content` |
| `/resources/` | Resources | anyone | `content` |
| `/guide/` | Step-by-step setup guide | anyone | `content` |
| `/offline.html` | Offline fallback when no cached page exists | anyone | none |

`next` parameter: `/login/?next=/agents/`. Only same-origin paths starting with a single `/` are honoured; anything else goes to `/`.

---

## 1. Shared shell (build-plan §9.8)

Mounted by `mountShell()` into `<header class="site-header" data-shell>` and `<footer class="site-footer" data-shell>`. Each page also has a `<noscript>` fallback with the same links.

**Purpose:** let anyone move between the four main places in one tap, and always show attribution and the honest disclaimer.

### Header (sticky, glass, respects the safe area)

Order, left to right (wraps under the app name below ~360 px; never horizontal scroll):

1. App name link "Beach Day" to `/` (`nav-home`)
2. "Agents" (`nav-agents`)
3. "How it works" (`nav-how`)
4. "Resources" (`nav-resources`)
5. Home and content pages: "Sign in" link to `/login/` (`nav-signin`). Home must not load supabase-js, so it never shows a signed-in state. On `/agents/` and `/login/` (which do load auth) this slot becomes the "Sign out" button (`signout-button`) when a session exists.

The current page link has `aria-current="page"`. A "Skip to content" link (`skip-link`) is the first focusable element and targets `<main id="main">`.

### Footer

Order: links row, attribution, disclaimer.

- Links: Resources (`footer-resources`) · Guide (`footer-guide`) · GitHub (`footer-github`) · API directory (`footer-api`)
- Attribution: "Weather data by Open-Meteo.com", linked to `https://open-meteo.com/` (`attribution`)
- Disclaimer: "A planning aid, not a safety service." (`disclaimer`)

Testids: `site-header`, `site-footer`, `skip-link`, `nav-home`, `nav-agents`, `nav-how`, `nav-resources`, `nav-signin`, `signout-button`, `footer-resources`, `footer-guide`, `footer-github`, `footer-api`, `attribution`, `disclaimer`.

Agents link behaviour: visible to everyone (no role knowledge on the public pages). Signed out it leads to login with `next=/agents/`; role `user` sees "no access".

---

## 2. Home `/`

**Purpose:** answer "Should I go to the beach today, and when?" within two seconds, then let people look ahead. Works offline from the last forecast.

### Layout order (single column)

1. Shell header
2. Banners region (only the ones that apply, stacked; each is dismissal-free except install): `update-banner`, `stale-banner` (offline or could not refresh), `partial-note`
3. Beach picker: native `<select>` with a visible label. Last choice remembered in `localStorage` (try/catch). First visit default: `south-beach`.
4. **Today card** (largest element): date line, score number, label word, icon, best window
5. Reasons: up to three short lines
6. Safety row: NWS rip-current link (always visible, D-002) and UV badge
7. "Next days" strip: seven buttons, today first (days 4 to 7 marked lower confidence)
8. Day detail panel (opens under the strip when a day is tapped; hidden until then)
9. Install prompt (Android button, or iOS sheet), shown after a forecast has rendered, never on first paint
10. Shell footer (attribution, disclaimer)

### Today card

| Element | Content | testid |
|---|---|---|
| Card | Container, `aria-labelledby` the label | `today-card` |
| Date | "Thursday, Nov 26" | `today-date` |
| Score | Large integer 0 to 100 | `today-score` |
| Label | "Great beach day" (80+), "Good" (60 to 79), "Meh" (40 to 59), "Skip it" (under 40). If a veto applies, the veto label replaces it: "No-go: lightning", "Rain most of the day", "Dangerous surf" and so on (text comes from the score engine `vetoes`, mapped in copy.md) | `today-label` |
| Icon | Inline SVG, decorative (`aria-hidden`), one per label: sun (Great), sun with cloud (Good), cloud (Meh), warning triangle or storm (Skip it / veto) | `today-icon` |
| Best window | "Best 10 am–1 pm". Hidden when there is no `bestWindow` | `best-window` |
| Reasons | `<ul>` of 1 to 3 plain sentences from `reasons[]`; if empty show "Nothing is holding today back." | `reasons-list`, items `reason-item` |
| Rip link | "Check today's rip current risk (National Weather Service)" opens `https://www.weather.gov/safety/ripcurrent` in a new tab (`rel="noopener noreferrer"`). The same link, wording unchanged, also appears in every day detail | `nws-rip-link` |
| UV badge | "UV 9 · Very high" (advisory only, never changes the score). EPA words: Low, Moderate, High, Very high, Extreme. Text plus icon, never colour alone | `uv-badge` |

The card has a visually hidden sentence for screen readers: "Today at {beach}: score 86, Great beach day, best 10 am to 1 pm."

### Next days strip

- Container `day-strip` (role `group`, label "Next days"). Seven `<button aria-pressed>` cells (`day-cell`), each with `data-date="YYYY-MM-DD"`, today first.
- Each cell shows weekday ("Fri"), score, icon, short label. Targets at least 44 x 44.
- Cells 4 to 7 (index 3 to 6) also show a "Lower confidence" marker (`low-confidence-badge`, text "Lower confidence" or short "~" with visually hidden full text) and `data-low-confidence="true"` on the cell.
- Accessible name per cell: "Saturday, score 74, Good, lower confidence". The scoring engine's `reasons[0]` may be appended after a comma.
- Tapping a cell sets `aria-pressed="true"` on it (others false) and opens the day detail. Tapping the pressed cell again closes it.
- Nothing is pressed until the person taps (the Today card already shows today).

### Day detail

| Element | Content | testid |
|---|---|---|
| Panel | `role="region"`, `aria-labelledby` its title, scrolled into view and focus moved to the title | `day-detail` |
| Title | "Saturday, Nov 28" | `day-detail-title` |
| Score + label + icon | Same pattern as Today | `day-detail-score`, `day-detail-label` |
| Best window | Index 0 to 3 only: "Best 9 am–12 pm". Index 4 to 6: not shown | `day-detail-best-window` |
| Reasons | Same as Today | `day-detail-reasons` |
| Hourly list | Index 0 to 3: one row per window hour (09:00 to 17:00): time, score, short word | `hourly-list`, rows `hour-row` (`data-hour`) |
| Lower-confidence note | Index 4 to 6: "Forecasts further out are less certain. Hourly detail isn't shown." | `day-detail-low-confidence` |
| Rip link | Same wording and URL | `day-detail-nws-link` |
| UV badge | Same | `day-detail-uv` |
| Close | Button "Close" | `day-detail-close` |

Rule (doc 01 and build-plan): hourly rows and best window are shown for index 0 to 3 only; `lowConfidence` is true for days 4 to 7 counted from 1, which is index 3 to 6.

Index summary (0 = today):

| Index | `lowConfidence` | Hourly list | Best window |
|---|---|---|---|
| 0 to 2 | false | yes | yes |
| 3 | true | yes | yes |
| 4 to 6 | true | no | no |

### Home states

| State | Trigger | What shows | testids |
|---|---|---|---|
| Loading | First fetch, nothing cached | Skeleton of Today card and strip, `aria-busy="true"` on `<main>`; live region says "Loading the forecast." | `forecast-loading` |
| Loaded | 200, not partial | Everything above | `today-card` |
| Beach changed | Picker change | Same as Loading for the card area only (keep the picker interactive); cached result for that beach shows instantly if present, then refreshes | `forecast-loading` |
| Partial | `partial: true` (marine missing) | Normal card, with note above it: "Wave and water data isn't available right now. This score uses weather only." | `partial-note` |
| Stale (offline) | `navigator.onLine === false` or SW served cache, with `fetchedAt` | Last forecast with banner "Offline. Showing the forecast saved {n} ago." | `stale-banner` (`data-reason="offline"`) |
| Stale (refresh failed) | Online but the request failed, cache exists | Last forecast with banner "Couldn't refresh. Showing the forecast from {n} ago." plus button "Try again" | `stale-banner` (`data-reason="failed"`), `retry-button` |
| Error | Request failed, no cache (400 / 404 / 502 / timeout) | Replaces the card: heading "Can't load the forecast", text, button "Try again". Picker, header and footer stay | `forecast-error`, `retry-button` |
| Unknown beach (404) | Remembered beach id no longer exists | Fall back silently to `south-beach` and load it; no error | none |
| Update ready | SW waiting | Banner "A new version is ready." with button "Reload" | `update-banner`, `update-reload-button` |
| Back online | `online` event | Banner clears, forecast refetches, live region says "Back online. Updated." | `live-status` |

`{n} ago` format: "just now" (under 1 min), "5 min ago", "2 h ago", "yesterday". Same format is used in the "Updated" line under the picker (`updated-line`, "Updated 5 min ago"), shown in every loaded state.

Server errors map: 502 and network failure to Error/Stale; 429 "Too many requests" shows "Too many tries. Wait a minute, then try again." in place of the error body; 400/404 as unknown beach.

### Install prompt

Never on first paint. Shown after the first successful forecast render in the session and only if not already installed (`matchMedia('(display-mode: standalone)')` false and `navigator.standalone !== true`).

**Android / Chromium** (after `beforeinstallprompt` was captured): a quiet card below the strip with the button "Install Beach Day" (`install-button`) and a close "Not now" (`install-dismiss`). Tap calls `event.prompt()`. If the person dismisses the browser dialog, hide the card for the session. Dismissal ("Not now") remembered in `localStorage`.

**iOS Safari-family, not standalone:** a dismissible bottom sheet (`install-ios-sheet`, `role="dialog"`, label "Install Beach Day"): title, three numbered steps (Tap Share · Tap Add to Home Screen · Tap Add), button "Got it" (`install-ios-dismiss`). Dismissal remembered in `localStorage` (try/catch). Never shown on desktop or in standalone.

### Home acceptance criteria

- At 375 px: header, picker, Today score, label and best window are visible without scrolling on a 667 px tall viewport.
- Score is shown as number + word + icon; removing colour leaves it fully readable.
- NWS link text is exact and always present in the Today card and in every day detail, including in stale and partial states.
- The strip has seven cells; cells at index 3 to 6 carry `data-low-confidence="true"`.
- Offline after one load: last forecast and `stale-banner` show; no blank screen.
- Picker is a native `<select>` with a `<label>`; selection survives reload.
- axe: no serious or critical violations in loaded, stale, error and day-detail states.

---

## 3. Login `/login/`

**Purpose:** let someone create an account or sign in, by email and password or with Google, then send them where they were going. Built by Quinn. No CAPTCHA; password managers and paste allowed (WCAG 3.3.8).

### Layout order

1. Shell header (the "Sign in" slot is hidden here)
2. `<h1>` "Sign in to Beach Day" (changes with the tab, see copy.md)
3. One-line reason when `next` is `/agents/`: "Agents is for the project owner." (`login-context`)
4. "Continue with Google" button (`google-button`), full width
5. Divider "or"
6. Tabs: "Log in" (`auth-tab-login`) and "Sign up" (`auth-tab-signup`), `role="tablist"`; the active tab has `aria-selected="true"`
7. Form (`login-form` or `signup-form`): Email (`email-input`), Password (`password-input`, with "Show password" checkbox `show-password`), form-level error (`form-error`, `role="alert"` linked by `aria-describedby`), primary button (`submit-button`: "Log in" or "Create account")
8. "Forgot password?" link (`forgot-link`, only on the Log in tab)
9. Shell footer

Email: `type="email" autocomplete="email" inputmode="email"`. Password: `autocomplete="current-password"` on log in, `new-password` on sign up. Sign up shows hint "At least 12 characters." (`password-hint`).

### Flows

**Log in**
1. Person enters email and password, taps "Log in". Button becomes "Logging in…" and is disabled (`aria-busy`).
2. Success: go to `next` (validated) or `/`.
3. Failure: stay on the form, keep the email, clear nothing else, focus the error. Error text from copy.md: wrong credentials (same text for unknown email and wrong password), unconfirmed email, rate limited, service unavailable, network.

**Sign up**
1. Email + password (12+ characters, checked before submit).
2. Success: replace the form with the confirm-email message (`confirm-email-message`): "Check your email. We sent a confirmation link to {email}. Open it on this device to finish." plus the actions "Use a different email" (`signup-restart`). The message is the same whether or not the address already has an account.
3. The link returns to `/login/` (emailRedirectTo). On arrival with a valid code (PKCE) the page exchanges it, shows "Email confirmed. You're signed in." (`login-confirmed`) then continues to `next` or `/` after the person taps "Continue" (`continue-button`). If the code is expired or invalid: error "That link expired. Log in, or sign up again to get a new one." (`form-error`).
4. Errors: password too short ("Use at least 12 characters."), invalid email, rate limited, service unavailable.

**Continue with Google**
1. Tap `google-button`: redirect to Google, then back to `/login/` (redirectTo).
2. Back on `/login/`: if a session exists, treat as success. If the person cancelled or the provider failed, show "Google sign-in didn't finish. Try again." (`form-error`).

**Forgot password** (same page, replaces the form; `forgot-form`)
1. Heading "Reset your password", Email field (`forgot-email-input`), button "Send reset link" (`forgot-submit`), link "Back to log in" (`forgot-back`).
2. On submit, always show (`forgot-sent-message`): "If that address has an account, we've sent a link to reset your password." Same text for known and unknown addresses; no timing or wording differences. Rate-limit or network failure shows the generic error instead ("Too many tries..." or "Couldn't send. Check your connection and try again.").
3. The link opens `/login/reset/`.

**Already signed in** (visit `/login/` with a session): show `login-signed-in` with "You're signed in as {email}.", button "Continue" (to `next` or `/`) and button "Sign out" (`signout-button`). No forms.

**Sign out:** `signout-button` (here and on `/agents/`) calls `signOut()`, then goes to `/login/` and the live region says "Signed out."

### Login states

| State | Copy / behaviour | testid |
|---|---|---|
| Idle | Forms as above | `login-form` |
| Submitting | Button "Logging in…" / "Creating account…" / "Sending…", disabled | `submit-button` |
| Field invalid | Inline text under the field, `aria-describedby`, `aria-invalid="true"`, no red-only cue (icon + text) | `email-error`, `password-error` |
| Form error | Alert text near the button | `form-error` |
| Confirm email | Message replaces form | `confirm-email-message` |
| Forgot sent | Message replaces form | `forgot-sent-message` |
| Signed in | See above | `login-signed-in` |
| Service down (503, Supabase unreachable) | "Sign-in service unavailable, try again later." | `form-error` |

### Login acceptance criteria

- Email and password fields have visible labels, correct `autocomplete`, allow paste and password managers.
- Wrong password and unknown email give the identical message.
- Forgot password gives the identical message for known and unknown addresses.
- `?next=` accepts `/agents/`; rejects `//evil.example`, `https://evil.example`, `javascript:`; those go to `/`.
- Errors are text with an icon, linked to inputs, announced (`role="alert"`).
- Works at 375 px and 200% zoom; every control at least 44 px.

---

## 4. Set new password `/login/reset/`

**Purpose:** finish a password reset after the emailed link.

### Layout order

1. Shell header
2. `<h1>` "Choose a new password"
3. Form (`reset-form`): New password (`new-password-input`, `autocomplete="new-password"`, "Show password" `show-password`), hint "At least 12 characters." (`password-hint`), button "Save new password" (`reset-submit`), `form-error`
4. Shell footer

### Flow and states

| State | Trigger | Content | testid |
|---|---|---|---|
| Checking link | Page opens, waiting for `PASSWORD_RECOVERY` | "Checking your link…" | `reset-checking` |
| Ready | Recovery session established | Form | `reset-form` |
| Invalid or expired link | No recovery event within a few seconds, or code invalid | "This reset link has expired or was already used." + button "Send a new link" (to `/login/` forgot view) | `reset-invalid-link` |
| Submitting | Tap save | Button "Saving…", disabled | `reset-submit` |
| Success | `updatePassword` ok | "Password updated. You're signed in." + "Continue" (to `/`) | `reset-success`, `continue-button` |
| Too short / weak | Under 12 characters, or the service rejects it | "Use at least 12 characters." or "That password is too easy to guess. Try a longer one." | `password-error` |
| Same as old | Service says so | "Choose a password you haven't used before." | `password-error` |
| Error | Service or network | "Couldn't save your password. Try again." / "Sign-in service unavailable, try again later." | `form-error` |

Acceptance: paste and password managers allowed; the link works once; after success the person has a session and the URL no longer contains a code.

---

## 5. Agents `/agents/`

**Purpose:** let the project owner talk to the team's agents, review what they propose and approve or reject it. `super_admin` only; the server enforces it, the UI only decides what to show. The page is `no-store` and `noindex`.

### Access flow (runs before anything else renders)

1. Page shows only the shell and `agents-checking` ("Checking your access…", `aria-busy`).
2. No session: go to `/login/?next=/agents/` (no flash of content).
3. Session, role `user` (or no profile): show `no-access`. Nothing else on the page is rendered, no API call is made.
4. Session, role `super_admin`: render the page.
5. Supabase unreachable: `agents-error` ("Sign-in service unavailable, try again later.", button "Try again").
6. Any API 401 after one silent refresh: go to `/login/?next=<current path>`. Any API 403: replace the page with `no-access`. 503 "Sign-in service unavailable": inline error with "Try again".

### No access (role `user`)

- `<h1>` "You don't have access"
- Text "Only the project owner can open Agents. You're signed in as {email}."
- Buttons: "Back to Beach Day" (`back-home-link`), "Sign out" (`signout-button`)
- testid `no-access`

### Page layout (super_admin)

1. Shell header (with "Sign out" in the sign-in slot)
2. `<h1>` "Agents" and the signed-in line "Signed in as {email}" (`user-line`)
3. View switcher (two buttons, `role="tablist"`): "Team" (`tab-team`) and "Proposals" (`tab-proposals`, with a count badge `proposals-count` of pending items)
4. Active view: Team (grid + chat) or Proposals (list; detail via hash)
5. Shell footer

### Team view: agent grid

- Loading: `agents-loading` skeleton cards.
- Error: `agents-error` "Couldn't load the agents." + "Try again" (`retry-button`).
- Loaded: `agent-grid`, one `agent-card` per agent (`data-agent="<name>"`, e.g. `open-meteo-integrator`).

Each card, in order:

| Element | Content | testid |
|---|---|---|
| Name | Display name ("Kai") | `agent-name` |
| Role | Agent `name` slug in small text ("open-meteo-integrator") | `agent-slug` |
| Model badge | Resolved short model text with the alias: "Sonnet · claude-sonnet-5-5"; text only, no colour meaning | `agent-model-badge` |
| Personality | Excerpt, up to about three lines | `agent-personality` |
| Description | One line of what it does | `agent-description` |
| Knowledge | Heading "Knowledge" then a list of file titles; each item shows the title and its repo path in small text; empty: "No knowledge files." Collapsed with a "Show N files" disclosure when more than 4 (`agent-knowledge-toggle`) | `agent-knowledge-list`, items `agent-knowledge-item` (`data-path`) |
| Action | Button "Chat with Kai" (name filled in) | `agent-chat-button` |

### Chat

Opens as a panel under the grid on desktop and a full-height sheet on phones. Selecting another agent switches the agent and keeps its own transcript. Transcript lives in `sessionStorage` (per agent); "Clear chat" (`chat-clear`) removes it.

Layout order inside the panel: header (agent name `chat-agent-name`, model badge, "Close" `chat-close`) → log (`chat-log`, `role="log"`, `aria-live="off"` while streaming) → status line (`chat-status`) → composer.

Composer: textarea (`chat-input`, label "Message Kai", Enter inserts newline on phones; Cmd/Ctrl+Enter sends on desktop; hint under the field), button "Send" (`chat-send`). While streaming, "Send" becomes "Stop" (`chat-stop`) which aborts the stream.

Message rows: `chat-message` with `data-role="user|assistant"`. Assistant text appears progressively; the container has `aria-busy="true"` until done, then one polite announcement ("Kai replied.") through `live-status`.

Tool rows: for each `tool` event a collapsible row `tool-row` (a `<details>`): summary "Read file src/lib/api.ts" (name mapped to a verb phrase, see copy.md), closed by default, `data-tool="read_file"`.

Proposal link: for each `proposal` event, a card `proposal-link` inside the chat: "Kai proposed: {title}" with the link text "Review proposal" to `/agents/#proposal/<id>`.

Chat states:

| State | Copy | testid |
|---|---|---|
| Empty | One hint line, no suggestion chips | `chat-empty` |
| Sending / waiting for first token | "Kai is thinking…" | `chat-status` |
| Streaming | Text grows; Send becomes Stop | `chat-stop` |
| Done | Status clears; announce once | `live-status` |
| Stream error event | Inline in the log: "Agent unavailable, please retry." with button "Retry" (`chat-retry`) which resends the last user message | `chat-error` |
| 400 | "That message couldn't be sent. Try a shorter one." | `chat-error` |
| 413 | "That conversation is too long. Clear the chat and start again." | `chat-error` |
| 429 | "You've reached today's chat limit. Try again tomorrow." (budget) or "Too many messages. Wait a minute." (rate); the server text decides which, UI shows `Too many requests` mapped to the rate wording | `chat-error` |
| 404 unknown agent | "That agent isn't available any more." | `chat-error` |
| 401 | silent refresh then login redirect | none |
| 403 | page becomes `no-access` | `no-access` |
| 503 | "Sign-in service unavailable, try again later." | `chat-error` |
| Offline | "You're offline. Chat needs a connection." Send is disabled | `chat-error` |
| Too long | Message over the limit: counter turns into text "Message too long" and Send disabled (ChatRequest total 100 KB, 30 messages: when 30 messages reached, "This conversation is full. Clear the chat to continue.") | `chat-error` |

### Proposals list view

- Filter: native `<select>` "Status": Pending (default), Approved, Rejected, All (`proposal-filter`, values `pending|approved|rejected|all`).
- List: `proposal-list` of `proposal-item` (`data-id`, `data-status`). Each item is a link to `#proposal/<id>` showing: title, "by Kai", file count ("2 files"), relative time, status chip with word (`proposal-status-chip`, text "Pending", "Approved" or "Rejected", with an icon).
- Empty: `proposals-empty`: "No pending proposals." (text follows the filter) and "Ask an agent for a change in the Team view." with button "Go to Team" (`go-team-button`).
- Loading `proposals-loading`; error `proposals-error` "Couldn't load proposals." with "Try again".

### Proposal detail `/agents/#proposal/<id>`

Layout order: back link "All proposals" (`back-to-proposals`) → title (`proposal-title`, `<h2>`) → meta line: status chip (`proposal-status`), "by {agent display name}", "{n} files", "Created {time}" → summary (`proposal-summary`) → files list (`proposal-files`, each `proposal-file` showing the path and a word "Add", "Edit" or "Delete") → diff (`diff-view`) → actions (only when pending): "Reject" (`reject-button`) and "Approve and deploy" (`approve-button`), visually separated, Reject is the secondary style and sits apart from Approve to avoid mis-taps.

**Diff view:** header `diff-stat` "2 files changed · +14 −3". Monospace, horizontally scrollable inside its own box (page never scrolls sideways). One element per line (`diff-line`) with `data-kind`: `add`, `del`, `ctx`, `hunk` or `file`. The marker is a separate leading span (`diff-marker`) containing "+" for added, "−" (U+2212) for removed, a space for context, nothing for hunk and file headers. Added/removed lines additionally have a subtle tint, but the marker is the meaning. All text via `textContent`. Long files: show first 400 lines with "Show the rest" button (`diff-show-more`).

**Decided proposals** show a status block instead of the actions: Approved: "Approved by {email} on {date}. Commit {sha7}" with link "View commit" (`commit-link`). Rejected: "Rejected by {email} on {date}." plus the reason if any (`reject-reason-text`). testid `decision-block`.

**Detail states:** `proposal-loading`, `proposal-error` (404: "That proposal doesn't exist." with link back; other: "Couldn't load this proposal." + "Try again").

### Approve flow (irreversible, D-003)

1. Tap "Approve and deploy" (`approve-button`). Opens modal `approve-dialog` (`role="dialog"`, `aria-modal`, focus moves to the title, Escape cancels, focus returns to the button).
2. Dialog content: title "Commit to main and redeploy?"; body "This commits {n} files to GitHub `main`. Netlify will rebuild the live site in about a minute."; the proposal title shown in a quoted line (`approve-dialog-title-echo`); label "Type the proposal title to confirm" with input `confirm-title-input` (no autocomplete, paste allowed); buttons "Cancel" (`cancel-approve-button`, default focus order first) and "Commit and deploy" (`confirm-approve-button`).
3. `confirm-approve-button` is `disabled` until the input equals the proposal title **exactly** (case and spacing; the client does no trimming or normalising, matching the server). A helper line (`confirm-hint`) reads "Matches" with a check icon when equal, or "Doesn't match yet" otherwise (text, `aria-live="polite"`).
4. Tap "Commit and deploy": button becomes "Committing…", disabled, dialog cannot be dismissed by backdrop.
5. Success (200): dialog closes, the detail page shows `approve-success`: "Committed {sha7}. Deploy started." + link "View commit" (`commit-link`) opening the GitHub commit URL in a new tab. Status chip becomes Approved; action buttons disappear. Live region announces it.
6. Failure inside the dialog (`approve-error`, `role="alert"`), dialog stays open except where noted:

| API response | UI |
|---|---|
| 400 title mismatch | "The title doesn't match. Check it and try again." |
| 409 stale or already decided | Dialog closes; page shows `stale-message`: "The code changed since this proposal. Ask {agent} to refresh it." with button "Ask again" (`ask-again-button`) which opens the Team view chat with that agent pre-filled: "Please refresh the proposal "{title}" against the current code." If the proposal is already decided the detail reloads and shows the decision block with "This proposal was already decided." |
| 422 path re-check failed | "This change touches a file agents can't edit, so it can't be approved." (Reject stays available) |
| 429 | "Too many tries. Wait a minute, then try again." |
| 503 approve disabled | "Approving is turned off on this site. Preview deploys can't commit." |
| 401 | silent refresh once, then login redirect (the typed title is lost) |
| 403 | "Only the project owner can approve changes." |
| 500 / network | "Something went wrong. Nothing was committed. Try again." |

### Reject flow

1. Tap "Reject" (`reject-button`): modal `reject-dialog`: title "Reject this proposal?", body "{agent} will see it as rejected. Nothing is committed.", optional textarea "Reason (optional)" (`reject-reason-input`, max 500, counter), buttons "Cancel" (`cancel-reject-button`) and "Reject proposal" (`confirm-reject-button`).
2. Success: dialog closes, `reject-success` "Proposal rejected." and the decision block shows.
3. Errors in `reject-error`: 409 "This proposal was already decided." (reload detail); 403 "Only the project owner can reject changes."; 429 "Too many tries. Wait a minute, then try again."; other "Something went wrong. Try again."

### Agents acceptance criteria

- Signed out visit of `/agents/` redirects to `/login/?next=/agents/` with no agent content rendered.
- Role `user` sees only `no-access`; no `/api/agents` request is made.
- Every `agent-card` shows name, model badge, personality and a knowledge list.
- Chat: `chat-input` and `chat-send` work with keyboard; streaming does not announce per token; `tool-row` is collapsed by default; `proposal-link` points to `/agents/#proposal/<id>`.
- `confirm-approve-button` is disabled until `confirm-title-input` equals the title exactly (one wrong character keeps it disabled).
- Diff lines carry a text marker and `data-kind`; no reliance on colour.
- Approve success shows the 7-character SHA and a working commit link; stale shows the "Ask again" path.
- Dialogs trap focus, close on Escape (except while committing), restore focus.

---

## 6. How it works `/how-it-works/`

**Purpose:** explain, in plain words, how the score works, what the app does not do, and how agents propose while a human approves. Content page: shell + `<h1>` + sections. Page script `content`.

Section order and testids:

1. `<h1>` "How Beach Day works" (`page-title`)
2. "How we score a beach day" (`section-score`): window 9 am to 5 pm, parts and weights as a simple list (`score-weights-list`), labels table (`score-labels`: 80+ Great beach day, 60 to 79 Good, 40 to 59 Meh, under 40 Skip it), "Days further out are less certain."
3. "When we say no" (`section-vetoes`): lightning, rain most of the day, strong wind, dangerous surf, extreme heat; these cap the score.
4. "What Beach Day doesn't do" (`section-limits`): no rip-current prediction (with the NWS link `how-nws-link`), not a lifeguard or safety service, no pollution, jellyfish or beach-closure data, UV is advice only.
5. "Where the data comes from" (`section-data`): Open-Meteo forecast and marine, with attribution link, "Wave data is an offshore estimate, not a surf report."
6. "How agents change this app" (`section-agents`): agents propose, a human reads the diff, types the title, approves; approving commits to `main` and the site redeploys; only the project owner can approve.
7. Shell footer

Acceptance: one `<h1>`; sentence-case headings; all external links open with `rel="noopener noreferrer"`; works offline from cache.

---

## 7. Resources `/resources/`

**Purpose:** every external link in one place, grouped, with a plain-words reason for each.

Groups (`resource-group` each with an `<h2>`): "Weather and safety", "Build and host", "Accessibility and design", "This project". Links are `resource-link` (all with `rel="noopener noreferrer"`, new tab). The full list and wording is in `copy.md` section Resources. The page includes the Guide link (`resource-guide-link`) and the API directory link (`resource-api-link`).

Acceptance: every link has descriptive text (not "click here"); the page lists the NWS rip-current pages; the Open-Meteo terms are linked next to the attribution.

---

## 8. Guide `/guide/`

**Purpose:** let a non-expert set up and deploy their own copy, step by step.

Layout: `<h1>` "Set up your own Beach Day" (`page-title`), a short intro with a time estimate, then numbered steps (`guide-step`, `<ol>`, `data-step="1"…`), each with a heading, one to four sentences, and where useful a code block (`guide-code`, copy button `guide-copy-button` labelled "Copy"). Final section "Check it works" (`guide-check`) and "If something goes wrong" (`guide-troubleshooting`). The step titles are listed in `copy.md`; the docs-writing expert owns the detailed step text, which must follow these titles and the environment variable list in build-plan §3.7. Never show a real secret value; use the formats from §3.7.

Acceptance: steps numbered and in order; every code block copyable; no step needs a secret pasted in chat or committed; links verified.

---

## 9. Cross-cutting states

### Offline fallback `/offline.html`
Static page: `<h1>` "You're offline", text "Beach Day needs a connection the first time. Once you've loaded a forecast, it's saved for next time.", button "Try again" (`offline-retry`, reloads). Testid `offline-page`.

### Update available
`update-banner` appears on any page that registers the service worker when a new version waits: "A new version is ready." + "Reload" (`update-reload-button`). It never reloads on its own.

### 404 inside the app
Unknown path: Netlify serves the home page for `/`, content pages for known paths; no custom 404 required in v1.

### Live-region announcements (all through `live-status`)
"Loading the forecast." · "Updated." · "Offline. Showing saved forecast." · "Back online. Updated." · "{Agent} replied." · "Proposal rejected." · "Committed {sha7}. Deploy started." · "Signed out."

---

## 10. Full testid index

Shell: `site-header` `site-footer` `skip-link` `nav-home` `nav-agents` `nav-how` `nav-resources` `nav-signin` `signout-button` `footer-resources` `footer-guide` `footer-github` `footer-api` `attribution` `disclaimer` `live-status` `update-banner` `update-reload-button`

Home: `beach-picker` `updated-line` `today-card` `today-date` `today-score` `today-label` `today-icon` `best-window` `reasons-list` `reason-item` `nws-rip-link` `uv-badge` `day-strip` `day-cell` `low-confidence-badge` `day-detail` `day-detail-title` `day-detail-score` `day-detail-label` `day-detail-best-window` `day-detail-reasons` `hourly-list` `hour-row` `day-detail-low-confidence` `day-detail-nws-link` `day-detail-uv` `day-detail-close` `forecast-loading` `forecast-error` `retry-button` `stale-banner` `partial-note` `install-button` `install-dismiss` `install-ios-sheet` `install-ios-dismiss`

Login: `login-context` `google-button` `auth-tab-login` `auth-tab-signup` `login-form` `signup-form` `email-input` `password-input` `show-password` `password-hint` `submit-button` `form-error` `email-error` `password-error` `forgot-link` `forgot-form` `forgot-email-input` `forgot-submit` `forgot-back` `forgot-sent-message` `confirm-email-message` `signup-restart` `login-confirmed` `continue-button` `login-signed-in`

Reset: `reset-checking` `reset-form` `new-password-input` `reset-submit` `reset-success` `reset-invalid-link`

Agents: `agents-checking` `no-access` `back-home-link` `agents-error` `agents-loading` `user-line` `tab-team` `tab-proposals` `proposals-count` `agent-grid` `agent-card` `agent-name` `agent-slug` `agent-model-badge` `agent-personality` `agent-description` `agent-knowledge-list` `agent-knowledge-item` `agent-knowledge-toggle` `agent-chat-button` `chat-panel` `chat-agent-name` `chat-close` `chat-clear` `chat-log` `chat-message` `tool-row` `proposal-link` `chat-status` `chat-empty` `chat-input` `chat-send` `chat-stop` `chat-retry` `chat-error` `proposal-filter` `proposal-list` `proposal-item` `proposal-status-chip` `proposals-empty` `go-team-button` `proposals-loading` `proposals-error` `proposal-detail` `back-to-proposals` `proposal-title` `proposal-status` `proposal-summary` `proposal-files` `proposal-file` `proposal-loading` `proposal-error` `diff-view` `diff-stat` `diff-line` `diff-marker` `diff-show-more` `approve-button` `reject-button` `approve-dialog` `approve-dialog-title-echo` `confirm-title-input` `confirm-hint` `cancel-approve-button` `confirm-approve-button` `approve-error` `approve-success` `commit-link` `stale-message` `ask-again-button` `decision-block` `reject-reason-text` `reject-dialog` `reject-reason-input` `cancel-reject-button` `confirm-reject-button` `reject-error` `reject-success`

Content: `page-title` `section-score` `score-weights-list` `score-labels` `section-vetoes` `section-limits` `how-nws-link` `section-data` `section-agents` `resource-group` `resource-link` `resource-guide-link` `resource-api-link` `guide-step` `guide-code` `guide-copy-button` `guide-check` `guide-troubleshooting` `offline-page` `offline-retry`
