# Beach Day: exact copy

Owner: Wren · Date: 2026-11-26. Sentence case. Verbs on buttons. No "oops". Errors say what happened and what to do, with no blame. Keys are the `data-testid` of the element that shows the string (see [`flows.md`](flows.md)). `{braces}` are filled in at run time. Apostrophes are straight `'` in code and strings (typographic rendering is a styling choice and tests must match the straight form).

Time and number formats: times "10 am", "1 pm", "12 pm" (no leading zero, lowercase, space). Ranges use an en dash: "10 am–1 pm". Temperatures "77°F". Wind "9 mph". Waves "2 ft". Relative time: "just now", "5 min ago", "2 h ago", "yesterday". Dates: "Thursday, Nov 26"; weekday cells "Fri".

## 1. Shell

| Key | String |
|---|---|
| skip-link | Skip to content |
| nav-home | Beach Day |
| nav-agents | Agents |
| nav-how | How it works |
| nav-resources | Resources |
| nav-signin | Sign in |
| signout-button | Sign out |
| footer-resources | Resources |
| footer-guide | Guide |
| footer-github | GitHub |
| footer-api | API directory |
| attribution | Weather data by Open-Meteo.com |
| disclaimer | A planning aid, not a safety service. |
| update-banner | A new version is ready. |
| update-reload-button | Reload |

Links: footer-github `https://github.com/atilus2020-design/BeachDay-kakashi`; footer-api `https://mcp-api.netlify.app/`; attribution `https://open-meteo.com/`.

## 2. Home

| Key | String |
|---|---|
| page `<title>` | Beach Day: South Florida beach forecast |
| picker label | Beach |
| beach-picker options | Beach name from `beaches.json` ("South Beach, Miami Beach", "Crandon Park, Key Biscayne", "Haulover Beach", "Hollywood Beach", "Fort Lauderdale Beach", "Deerfield Beach", "Boca Raton (Red Reef / Spanish River)", "Delray Beach", "Palm Beach (Midtown)", "Jupiter Beach") |
| updated-line | Updated {n} ago |
| today-label (by score) | 80+: Great beach day · 60–79: Good · 40–59: Meh · under 40: Skip it |
| today-label (veto text) | lightning: No-go: lightning · rain: Rain most of the day · wind: Too windy · surf: Dangerous surf · heat: Dangerous heat |
| best-window | Best {start}–{end} (example: Best 10 am–1 pm) |
| reasons-list (empty) | Nothing is holding today back. |
| nws-rip-link | Check today's rip current risk (National Weather Service) |
| uv-badge | UV {n} · {Low / Moderate / High / Very high / Extreme} (example: UV 9 · Very high) |
| today sr summary | Today at {beach}: score {n}, {label}, best {start} to {end}. |
| day-strip label | Next days |
| day-cell name (sr) | {Weekday}, score {n}, {label}, lower confidence (last part only when low confidence) |
| low-confidence-badge | Lower confidence |
| day-detail-low-confidence | Forecasts further out are less certain. Hourly detail isn't shown. |
| day-detail-close | Close |
| hourly-list heading | Hour by hour |
| hour-row | {time} · {score} · {Great / Good / Meh / Skip} |
| day-detail-best-window | Best {start}–{end} |

Reason sentences come from the scoring engine (plain, specific, under 60 characters), for example: "Thunderstorms likely after 2 pm" · "Breezy: 18 mph winds" · "Rough surf: 4 ft waves" · "Light winds, 9 mph" · "Water 77°F" · "Feels like 98°F".

### Home states

| Key | String |
|---|---|
| forecast-loading (live) | Loading the forecast. |
| forecast-error heading | Can't load the forecast |
| forecast-error body | Check your connection, then try again. |
| retry-button | Try again |
| forecast-error (429) | Too many tries. Wait a minute, then try again. |
| stale-banner (offline) | Offline. Showing the forecast saved {n} ago. |
| stale-banner (failed) | Couldn't refresh. Showing the forecast from {n} ago. |
| partial-note | Wave and water data isn't available right now. This score uses weather only. |
| live: back online | Back online. Updated. |
| live: updated | Updated. |
| live: offline | Offline. Showing saved forecast. |

### Install

| Key | String |
|---|---|
| install-button | Install Beach Day |
| install-dismiss | Not now |
| install-ios-sheet title | Install Beach Day |
| install-ios-sheet intro | Add it to your Home Screen to open it like an app. |
| install-ios steps | 1. Tap the Share button. · 2. Tap Add to Home Screen. · 3. Tap Add. |
| install-ios-dismiss | Got it |

## 3. Login `/login/`

| Key | String |
|---|---|
| page `<title>` | Sign in · Beach Day |
| h1 (Log in tab) | Sign in to Beach Day |
| h1 (Sign up tab) | Create your account |
| login-context (`next` is /agents/) | Agents is for the project owner. |
| google-button | Continue with Google |
| divider | or |
| auth-tab-login | Log in |
| auth-tab-signup | Sign up |
| email-input label | Email |
| password-input label | Password |
| show-password | Show password |
| password-hint (sign up and reset) | At least 12 characters. |
| submit-button (login) | Log in |
| submit-button (signup) | Create account |
| submit-button (busy) | Logging in… / Creating account… |
| forgot-link | Forgot password? |

### Errors

| Situation | String (`form-error` unless noted) |
|---|---|
| Wrong password or unknown email (identical) | Email or password is incorrect. |
| Email not confirmed | Confirm your email first. Check your inbox for the link. |
| Empty email (`email-error`) | Enter your email. |
| Bad email format (`email-error`) | Enter a valid email, like name@example.com. |
| Empty password (`password-error`) | Enter your password. |
| Short password on sign up (`password-error`) | Use at least 12 characters. |
| Weak or leaked password (`password-error`) | That password is too easy to guess. Try a longer one. |
| Rate limited | Too many tries. Wait a minute and try again. |
| Service down (503, Supabase unreachable) | Sign-in service unavailable, try again later. |
| Network | Can't reach the sign-in service. Check your connection. |
| Google cancelled or failed | Google sign-in didn't finish. Try again. |
| Expired confirmation link | That link expired. Log in, or sign up again to get a new one. |
| Anything else | Something went wrong. Try again. |
| Sign-in not set up (no Supabase keys; `form-error`, also on /login/reset/) | Sign-in isn't set up on this site yet. Try again later. |

### Confirm email and forgot password

| Key | String |
|---|---|
| confirm-email-message | Check your email. We sent a confirmation link to {email}. Open it on this device to finish. |
| signup-restart | Use a different email |
| login-confirmed | Email confirmed. You're signed in. |
| continue-button | Continue |
| forgot-form heading | Reset your password |
| forgot-form body | Enter your email and we'll send a link. |
| forgot-submit | Send reset link |
| forgot-submit (busy) | Sending… |
| forgot-back | Back to log in |
| forgot-sent-message (same for every address) | If that address has an account, we've sent a link to reset your password. |
| forgot error (network) | Couldn't send. Check your connection and try again. |
| login-signed-in | You're signed in as {email}. |
| signout live | Signed out. |

## 4. Set new password `/login/reset/`

| Key | String |
|---|---|
| page `<title>` | New password · Beach Day |
| h1 | Choose a new password |
| reset-checking | Checking your link… |
| new-password-input label | New password |
| reset-submit | Save new password |
| reset-submit (busy) | Saving… |
| reset-success | Password updated. You're signed in. |
| reset-invalid-link | This reset link has expired or was already used. |
| reset-invalid-link action | Send a new link |
| password-error (short) | Use at least 12 characters. |
| password-error (weak) | That password is too easy to guess. Try a longer one. |
| password-error (reused) | Choose a password you haven't used before. |
| form-error | Couldn't save your password. Try again. |
| form-error (503) | Sign-in service unavailable, try again later. |

## 5. Agents

### Access

| Key | String |
|---|---|
| page `<title>` | Agents · Beach Day |
| agents-checking | Checking your access… |
| no-access h1 | You don't have access |
| no-access body | Only the project owner can open Agents. You're signed in as {email}. |
| back-home-link | Back to Beach Day |
| agents-error | Sign-in service unavailable, try again later. |
| h1 | Agents |
| user-line | Signed in as {email} |
| tab-team | Team |
| tab-proposals | Proposals |

### Team grid

| Key | String |
|---|---|
| agents-loading (live) | Loading agents. |
| agents-error (list) | Couldn't load the agents. |
| agent-model-badge | {Opus / Sonnet / Haiku} · {model id} (example: Sonnet · claude-sonnet-5-5); alias "custom": Custom · {model id} |
| agent-knowledge-list heading | Knowledge |
| agent-knowledge-item | {title} with the repo path beneath |
| agent-knowledge-list (empty) | No knowledge files. |
| agent-knowledge-toggle | Show {n} files / Hide files |
| agent-chat-button | Chat with {name} |

### Chat

| Key | String |
|---|---|
| chat-input label | Message {name} |
| chat-input placeholder | Ask {name} anything about their work |
| chat hint (desktop) | Press Ctrl+Enter or ⌘+Enter to send. |
| chat-send | Send |
| chat-stop | Stop |
| chat-clear | Clear chat |
| chat-close | Close |
| chat-empty | Ask {name} for help, or for a change to the app. |
| chat-status (waiting) | {name} is thinking… |
| live: reply done | {name} replied. |
| tool-row summaries | read_file: Read {path} · list_files: Listed {path} · search: Searched for "{query}" · other: Used {name} |
| proposal-link | {name} proposed: {title} with link text Review proposal |
| chat-retry | Retry |
| chat-error (stream error event) | Agent unavailable, please retry. |
| chat-error (400) | That message couldn't be sent. Try a shorter one. |
| chat-error (413) | That conversation is too long. Clear the chat and start again. |
| chat-error (30 messages) | This conversation is full. Clear the chat to continue. |
| chat-error (429 rate) | Too many messages. Wait a minute. |
| chat-error (429 budget) | You've reached today's chat limit. Try again tomorrow. |
| chat-error (404) | That agent isn't available any more. |
| chat-error (503) | Sign-in service unavailable, try again later. |
| chat-error (offline) | You're offline. Chat needs a connection. |
| chat-error (500/other) | Something went wrong. Try again. |

### Proposals list

| Key | String |
|---|---|
| proposal-filter label | Status |
| filter options | Pending · Approved · Rejected · All |
| proposal-item | {title} · by {name} · {n} files (1 file) · {n} ago |
| proposal-status-chip | Pending · Approved · Rejected |
| proposals-empty (pending) | No pending proposals. |
| proposals-empty (approved) | No approved proposals yet. |
| proposals-empty (rejected) | No rejected proposals. |
| proposals-empty (all) | No proposals yet. |
| proposals-empty hint | Ask an agent for a change in the Team view. |
| go-team-button | Go to Team |
| proposals-error | Couldn't load proposals. |
| retry-button | Try again |

### Proposal detail

| Key | String |
|---|---|
| back-to-proposals | All proposals |
| proposal-title | The proposal title as the agent wrote it. Chat card and list prefix: "{name} proposes: " is not part of the title and never typed in the confirm field |
| meta | {Status} · by {name} · {n} files · Created {n} ago |
| proposal-file actions | Add · Edit · Delete |
| diff-stat | {n} files changed · +{a} −{d} |
| diff-show-more | Show the rest |
| approve-button | Approve and deploy |
| reject-button | Reject |
| decision-block (approved) | Approved by {email} on {date}. Commit {sha7}. |
| commit-link | View commit |
| decision-block (rejected) | Rejected by {email} on {date}. |
| reject-reason-text | Reason: {reason} |
| proposal-error (404) | That proposal doesn't exist. |
| proposal-error (other) | Couldn't load this proposal. |

### Approve dialog

| Key | String |
|---|---|
| approve-dialog title | Commit to main and redeploy? |
| approve-dialog body | This commits {n} files to GitHub `main`. Netlify will rebuild the live site in about a minute. (1 file: "This commits 1 file…") |
| confirm-title-input label | Type the proposal title to confirm |
| confirm-hint (match) | Matches |
| confirm-hint (no match) | Doesn't match yet |
| cancel-approve-button | Cancel |
| confirm-approve-button | Commit and deploy |
| confirm-approve-button (busy) | Committing… |
| approve-success | Committed {sha7}. Deploy started. |
| stale-message | The code changed since this proposal. Ask {name} to refresh it. |
| ask-again-button | Ask again |
| ask-again prefilled message | Please refresh the proposal "{title}" against the current code. |
| already decided (409) | This proposal was already decided. |
| approve-error 400 | The title doesn't match. Check it and try again. |
| approve-error 422 | This change touches a file agents can't edit, so it can't be approved. |
| approve-error 429 | Too many tries. Wait a minute, then try again. |
| approve-error 503 | Approving is turned off on this site. Preview deploys can't commit. |
| approve-error 403 | Only the project owner can approve changes. |
| approve-error 500/network | Something went wrong. Nothing was committed. Try again. |
| live: approved | Committed {sha7}. Deploy started. |

### Reject dialog

| Key | String |
|---|---|
| reject-dialog title | Reject this proposal? |
| reject-dialog body | {name} will see it as rejected. Nothing is committed. |
| reject-reason-input label | Reason (optional) |
| reject counter | {n} of 500 |
| cancel-reject-button | Cancel |
| confirm-reject-button | Reject proposal |
| confirm-reject-button (busy) | Rejecting… |
| reject-success | Proposal rejected. |
| reject-error 409 | This proposal was already decided. |
| reject-error 403 | Only the project owner can reject changes. |
| reject-error 429 | Too many tries. Wait a minute, then try again. |
| reject-error other | Something went wrong. Try again. |

## 6. How it works

| Section | Copy |
|---|---|
| `<title>` | How it works · Beach Day |
| h1 | How Beach Day works |
| Intro | Beach Day gives each South Florida beach a score from 0 to 100, so you can decide fast. Here's what goes into it. |
| h2 section-score | How we score a beach day |
| Body | We look at the hours people are at the beach, 9 am to 5 pm, trimmed to an hour after sunrise and an hour before sunset. Each hour is scored, then the day combines the whole-day average with the best three hours in a row. |
| Weights list | Rain: 30% · Feels-like temperature: 20% · Wind: 15% · Waves: 15% · Clouds: 10% · Water temperature: 10% |
| Labels | 80 and up: Great beach day · 60 to 79: Good · 40 to 59: Meh · Under 40: Skip it |
| Confidence | Days further out are less certain. We mark the last four days "Lower confidence" and don't show hour-by-hour detail for them. |
| h2 section-vetoes | When we say no |
| Body | Some conditions cap the score, however nice the rest looks: thunderstorms (No-go: lightning), rain most of the day, very strong gusts, dangerous surf of 6 ft or more, and extreme heat. |
| h2 section-limits | What Beach Day doesn't do |
| List | It doesn't predict rip currents. For that, check today's rip current risk (National Weather Service). · It isn't a lifeguard or a safety service. Follow beach flags and lifeguard advice. · It doesn't know about water quality, jellyfish or beach closures. · The UV badge is advice only. It doesn't change the score. Wear sunscreen. |
| how-nws-link | Check today's rip current risk (National Weather Service) |
| h2 section-data | Where the data comes from |
| Body | Forecasts come from Open-Meteo.com, using its weather and marine services. Wave data is an offshore estimate, not a surf report. |
| h2 section-agents | How agents change this app |
| Body | A team of AI agents helps build Beach Day. They can't change the live site on their own. An agent writes a proposal, the project owner reads exactly what would change, types the proposal's title to confirm, and approves it. Approving saves the change to the code and the site rebuilds. Only the project owner can approve. |

## 7. Resources

Intro: "Where the data, tools and guidance behind Beach Day come from." All links open in a new tab.

| Group | Link text (URL) |
|---|---|
| Weather and safety | National Weather Service rip current safety (https://www.weather.gov/safety/ripcurrent) · NWS Miami surf zone forecast (https://forecast.weather.gov/product.php?site=MFL&issuedby=MFL&product=SRF) · Florida rip current risk map (https://www.weather.gov/beach/florida) · NWS lightning safety (https://www.weather.gov/safety/lightning-safety-overview) · Open-Meteo forecast API docs (https://open-meteo.com/en/docs) · Open-Meteo marine API docs (https://open-meteo.com/en/docs/marine-weather-api) · Open-Meteo terms of use (https://open-meteo.com/en/terms) |
| Build and host | Netlify docs (https://docs.netlify.com/) · Netlify Functions (https://docs.netlify.com/build/functions/overview/) · Claude API docs (https://docs.claude.com/) · GitHub REST API (https://docs.github.com/en/rest) · Supabase Auth docs (https://supabase.com/docs/guides/auth) · MDN: Progressive web apps (https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) |
| Accessibility and design | Apple Human Interface Guidelines (https://developer.apple.com/design/human-interface-guidelines/) · WCAG 2.2 (https://www.w3.org/TR/WCAG22/) |
| This project | Set up your own copy: Guide (/guide/, `resource-guide-link`) · Beach Day on GitHub (https://github.com/atilus2020-design/BeachDay-kakashi) · API directory (https://mcp-api.netlify.app/, `resource-api-link`) |

h1: Resources. h2s as in the table (sentence case).

## 8. Guide

| Key | String |
|---|---|
| `<title>` | Guide · Beach Day |
| h1 | Set up your own Beach Day |
| Intro | Follow these steps to run your own copy. It takes about an hour, and you don't need to write code. |
| Step 1 | Get the code |
| Step 2 | Create a Netlify site |
| Step 3 | Create a Supabase project |
| Step 4 | Turn on email and Google sign-in |
| Step 5 | Add your keys to Netlify |
| Step 6 | Deploy |
| Step 7 | Make yourself the project owner |
| guide-check heading | Check it works |
| guide-troubleshooting heading | If something goes wrong |
| guide-copy-button | Copy |
| guide-copy-button (done) | Copied |
| Rule | Show key formats only (sk-ant-…, github_pat_…, sb_publishable_…), never a real value. Never ask anyone to paste a secret into chat or commit it. |

## 9. Offline page

| Key | String |
|---|---|
| offline-page h1 | You're offline |
| offline-page body | Beach Day needs a connection the first time. Once you've loaded a forecast, it's saved for next time. |
| offline-retry | Try again |
| offline-page body (approved variant, Wave 3) | No signal right now, and we don't have this page saved yet. Forecasts you've already looked at will show again once you open them. |

## 10. Voice checklist

- Lead with the answer ("Great beach day"), then the reason.
- Say "feels like 98°F", never "apparent temperature".
- Errors: what happened, then what to do. No blame, no codes ("403"), no "oops".
- Buttons: verb first ("Send reset link", "Commit and deploy"); "Cancel" always sits beside the destructive choice, never replaces it.
- Don't repeat the label as the placeholder.
