# Beach Day

Beach Day helps you decide whether it is a good day to go to the beach. Pick a South Florida beach and it scores today and the next few days from 0 to 100, using the free [Open-Meteo](https://open-meteo.com/en/docs) forecast and marine data. It also tells you the best three-hour window of the day and the reasons behind the score.

Beach Day is a planning aid, not a safety service. It does not assess rip currents, does not know which lifeguard flags are flying, and does not replace National Weather Service warnings. Read the [NWS Miami Surf Zone Forecast](https://forecast.weather.gov/product.php?site=MFL&issuedby=MFL&product=SRF) and follow the lifeguards. See [What the app does not do](#what-the-app-does-not-do).

The app is a PWA (installable on iPhone and Android, works offline from the last forecast) built as a static site with Netlify Functions and no other servers ([D-001](docs/decisions.md)).

## What it is

- **Beach Day (`/`)**: the beach picker, today's score, the best window, the reasons, the week ahead, and a link to the official NWS rip current pages.
- **How it works (`/how-it-works/`)**: how the score is built, its vetoes and its limits.
- **Resources (`/resources/`)**: every official source the project relies on.
- **Sign in (`/login/`)**: email and password, or Continue with Google, through Supabase Auth.
- **Agents page (`/agents/`)**: only for the `super_admin` account. The Claude agents from `.claude/agents/` chat here and propose code changes. A proposal is committed to `main` only when the owner reads the full diff, types the proposal's title to confirm, and clicks Approve. Netlify then redeploys the site ([D-003](docs/decisions.md)).
- **Setup and deploy guide (`/guide/`)**: the same steps as this README, with copy buttons for each command.

## Project layout

| Path | What is in it |
|---|---|
| `src/` | Front-end TypeScript: pages, `lib/` (auth, API, shell), `scoring/` (pure beach score), `styles/`, `pwa/` |
| `public/` | Web manifest, icons, offline page |
| `netlify/functions/` | Netlify Functions: `forecast`, `agents`, `agent-chat`, `proposals`, `approve`; shared code in `_lib/` |
| `agents/`, `login/`, `how-it-works/`, `resources/`, `guide/` | The HTML pages |
| `.claude/agents/`, `.claude/skills/`, `knowledge/` | The agent team: definitions, skills and reference notes |
| `supabase/migrations/` | The database migration for the `profiles` table and its security rules |
| `scripts/` | Build steps: agent manifest, service worker, secret scan |
| `tests/` | Unit, function and browser tests, and the local mock servers |
| `docs/` | Decisions, security model, build plan, expert roster |
| `netlify.toml` | Build, headers and Function settings (no secrets) |

## Run locally with mocks

You need Node.js 20 or later and Git. The mocks are fake upstream services, so you do not need any real key, token or Supabase project.

1. On GitHub, open the [Beach Day repository](https://github.com/atilus2020-design/BeachDay-kakashi) and click **Fork**.
2. In a terminal, clone your fork and install the packages. Replace `<your-user>` with your GitHub user name:

   ```bash
   git clone https://github.com/<your-user>/BeachDay-kakashi.git
   cd BeachDay-kakashi
   npm install
   npm run build:agents
   ```

3. In the first terminal, start the mock upstream services and leave them running. They listen on `http://127.0.0.1:9100`:

   ```bash
   npm run mocks
   ```

4. In a second terminal, in the same folder, load the fake settings from `tests/mocks/test.env` and start the app:

   ```bash
   set -a; source tests/mocks/test.env; set +a
   npm run dev
   ```

5. Open <http://localhost:8888>. You should see the beach picker and a score.

If `npm run dev` stops with `fetch failed` after it loads the functions, run the same command Playwright uses instead. It works without network access to Netlify:

```bash
set -a; source tests/mocks/test.env; set +a
npx netlify dev --offline --port 8888
```

`tests/mocks/test.env` is committed on purpose. It holds fake values only, such as `ANTHROPIC_API_KEY=test-key`. Never put a real key in that file.

## Tests

Run these from the project folder.

```bash
npm test
```

`npm test` runs the unit and function tests (Vitest). It starts its own mock server, so you do not need `npm run mocks` for it.

```bash
npx playwright test --trace off
```

This runs the browser tests on phone and desktop viewports. Playwright starts the mock server and `netlify dev --offline` itself. On a new machine, install the browser once first:

```bash
npx playwright install chromium
```

The same browser run is available as `npm run test:e2e`. Test reports are written under `playwright-report/` and `test-results/`, both git-ignored.

## Deploy to Netlify

You need a GitHub account, a Netlify account and a Supabase account. The Free plans of all three are enough ([D-004](docs/decisions.md)).

1. Finish the Supabase steps in [Supabase setup](#supabase-setup) first, or at least create the project, so you have its URL and publishable key.
2. Sign in at [app.netlify.com](https://app.netlify.com), then click **Add new project → Import an existing project**.
3. Choose **GitHub**, authorise Netlify if asked, and select your fork of `BeachDay-kakashi`.
4. Leave the build settings Netlify reads from `netlify.toml`. They should show:

   | Setting | Value |
   |---|---|
   | Build command | `npm run build` |
   | Publish directory | `dist` |
   | Functions directory | `netlify/functions` |

5. Click **Deploy**. The first deploy can fail until the variables in the next section are set. That is expected.
6. In **Site configuration → Environment variables**, add the variables in the [Environment variables](#environment-variables) table.
7. Open **Deploys**, then click **Trigger deploy → Deploy site**. Variables apply only to a new deploy.
8. Wait until the newest deploy shows **Published**. Copy your site address (it ends in `.netlify.app`) and go back to Supabase to set the Site URL and redirect URLs.

Netlify deploys the `main` branch automatically. Each Approve in the Agents page makes one commit to `main`, which triggers one new build.

## Environment variables

Set these in the Netlify UI: **Site configuration → Environment variables**. Never put a real value in a file in this repository. [`.env.example`](.env.example) lists the names and fake formats.

**Scope** says which part of the build can read the variable. "Functions" means the server-side code that runs on request. "Builds" means the browser build, where the value ends up in public JavaScript.

| Name | Scope and context | Secret? | Purpose | Example format (fake) |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Functions, all contexts. Use a low-limit key for previews and development. | **Secret** | Calls Claude for the Agents page | `sk-ant-REPLACE_ME` |
| `GITHUB_TOKEN` | Functions, **Production context only** | **Secret** | Commits approved changes to `main` ([D-005](docs/decisions.md)) | `github_pat_REPLACE_ME` |
| `GITHUB_REPO` | Functions | Public | The `owner/name` repository that Approve commits to | `owner/name` |
| `SUPABASE_URL` | Functions | Public | Your Supabase Project URL | `https://your-project-ref.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Functions | Public by design (row security protects the data) | Your Supabase publishable key | `sb_publishable_REPLACE_ME` |
| `DAILY_CHAT_LIMIT` | Functions | Public | Chat messages allowed each day, per user and in total | `200` |
| `DAILY_TOKEN_LIMIT` | Functions | Public | Claude tokens allowed each day, per user and in total | `2000000` |
| `VITE_SUPABASE_URL` | Builds | Public | The same Project URL, for the browser build | `https://your-project-ref.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Builds | Public | The same publishable key, for the browser build | `sb_publishable_REPLACE_ME` |

Notes:

- `GITHUB_TOKEN` exists only in the Production context. Deploy previews cannot approve commits.
- Use only the two `VITE_` names above. The build fails on any other `VITE_` variable.
- `JOB_SIGNING_SECRET` and `DAILY_JOB_LIMIT` are not needed in this version.

**Local and test only. Do not set these in Netlify.** They point the app at the mock servers: `OPEN_METEO_BASE`, `OPEN_METEO_MARINE_BASE`, `ANTHROPIC_BASE_URL` and `GITHUB_API_URL`.

**Never set these anywhere** (Netlify, a `.env` file, or the `dist/` folder):

- a Supabase secret key (`sb_secret_…`) or a `service_role` key. The build fails if it finds one.
- the Supabase JWT secret
- `CONSOLE_PASSWORD_HASH` or `SESSION_SECRET`. These belonged to a retired design and must not exist.
- any other `VITE_` variable

The Supabase publishable key is safe in the browser because row security limits what it can read ([D-008](docs/decisions.md)). The Claude key and the GitHub token are never sent to the browser.

## Supabase setup

Supabase provides sign-in and the `profiles` table that holds each person's role ([D-006](docs/decisions.md), [D-007](docs/decisions.md)). Create the project at [supabase.com/dashboard](https://supabase.com/dashboard). Use a separate Supabase project for local sign-in tests, not your production one.

1. Click **New project**, then choose a name, a region near Florida and a database password. Save the password in a password manager.
2. Open **Project Settings → API Keys**. Copy the **Project URL** and the **publishable key**. Do not copy any secret key.
3. Open **Authentication → Sign In / Providers → Email**. Turn on **Email** and **Confirm email**, and set the minimum password length to **12**. Save.
4. Open **Authentication → URL Configuration**. Set **Site URL** to `https://<your-site>.netlify.app`.
5. In **Redirect URLs**, add exactly these two entries and no others. Do not use wildcards, and do not add `localhost` to the production project:

   ```text
   https://<your-site>.netlify.app/login/
   https://<your-site>.netlify.app/login/reset/
   ```

6. Open **SQL Editor**, click **New query**, paste the whole contents of [`supabase/migrations/20261126000000_profiles.sql`](supabase/migrations/20261126000000_profiles.sql), and click **Run**. The migration creates the `profiles` table, its row security rules and the sign-up trigger. It also grants no write access, so no one can change a role through the API.

### Optional: Continue with Google

1. Open the [Google Cloud Console](https://console.cloud.google.com/). Create a project if you need one, then open **APIs & Services → Credentials**.
2. Click **Create credentials → OAuth client ID**, and choose **Web application**.
3. Under **Authorized JavaScript origins**, add only your site origin, `https://<your-site>.netlify.app`.
4. Under **Authorized redirect URIs**, add only the Supabase callback. Replace `<project-ref>` with the reference in your Project URL:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

5. Click **Create**, then copy the client ID and the client secret.
6. In Supabase, open **Authentication → Sign In / Providers → Google**, turn it on, paste the client ID and the client secret, and save. The client secret goes only into Supabase, never into Netlify or this repository.

See the [Supabase guide to Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Make the first super_admin

Anyone can sign up, but only a `super_admin` can open the Agents page, chat or Approve. The role is set by hand, in the Supabase SQL editor. No app screen or agent can grant it ([D-007](docs/decisions.md)).

1. Open `https://<your-site>.netlify.app/login/`, choose **Sign up**, and create your account. Use an email address you can read.
2. Click the confirmation link in the email.
3. In the Supabase **SQL Editor**, run this query. Replace `you@example.com` with the email you signed up with. This is the migration's promotion statement, copied as written in its comment block, with only the email filled in:

   ```sql
   update public.profiles p set role = 'super_admin'
   from auth.users u
   where p.id = u.id and u.email = 'you@example.com' and u.email_confirmed_at is not null;
   ```

4. Check that the result says `UPDATE 1`. Any other count means the email is wrong or not yet confirmed.
5. Sign out, then sign in again. The Agents page should open.

To remove access, run the same kind of statement with `role = 'user'`. Keep the number of `super_admin` accounts small.

## GitHub token settings

Approved changes are committed with a fine-grained personal access token that can reach only this one repository ([D-005](docs/decisions.md)).

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens**, then click **Generate new token**.
2. Set **Resource owner** to your account. Under **Repository access**, choose **Only select repositories** and select your fork.
3. Under **Permissions**, set **Contents** to **Read and write**, and **Metadata** to **Read-only**. Set nothing else. In particular, do not add the Workflows permission. GitHub then refuses writes to `.github/workflows/`.
4. Set an expiry, for example 90 days, and add a calendar reminder to rotate the token before then.
5. Click **Generate token** and copy it at once. GitHub shows it only once. Paste it into the Netlify variable `GITHUB_TOKEN` (Production context).

See the [GitHub guide to fine-grained tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Smoke test

After the first successful deploy with the variables set:

1. Open your site. Pick a beach and check that a score, a label and reasons appear.
2. Open `/api/forecast?beach=south-beach`. It should return JSON with status 200.
3. Open `/how-it-works/` and `/resources/`. Both should load with the footer.
4. Signed out, open `/agents/`. You should be sent to sign in.
5. Signed in as a normal user, open `/agents/`. You should see "You don't have access", and `/api/agents` should return 403.
6. Signed in as `super_admin`, open `/agents/`. The agent list should load.

## Agent Console setup

The Agents page needs everything above: the Claude key, the GitHub token (Production), the Supabase variables and the `super_admin` account. Then:

1. Sign in as the `super_admin` account and open `/agents/`.
2. Choose an agent and send a message. The reply streams in.
3. When an agent proposes a change, open it from the proposals list. Read the full diff. Type the proposal's title in the confirmation box, then click **Approve**. Or click **Reject**.
4. An approved change becomes one commit on `main`. Netlify then rebuilds the site, which uses one build from your plan's credits.

Every Function checks the Supabase access token and the `super_admin` role on each request. A missing or invalid token returns 401, a `user` returns 403, and an unreachable Supabase returns 503. The page itself only hides content. The Functions are the real gate ([D-008](docs/decisions.md)).

## Rotating secrets

Rotate a secret on a schedule, and at once if you think it leaked.

1. **GitHub token:** create a new fine-grained token with the settings above. Replace `GITHUB_TOKEN` in Netlify, trigger a new deploy, then delete the old token on GitHub.
2. **Anthropic key:** create a new key in the Anthropic console. Replace `ANTHROPIC_API_KEY` in Netlify, trigger a new deploy, then revoke the old key.
3. **If you think a secret leaked:** revoke it at its source first, then follow the steps above. Check the commit history on GitHub for anything you did not expect.
4. Never paste a secret into a chat, an issue or a commit.

## Free plan notes

- **Supabase pauses idle projects.** A Free project is paused after one week without activity. While it is paused, sign-in and the Agents page fail, but the public beach pages still work. Restore the project from the Supabase dashboard. See [Supabase on pausing free projects](https://supabase.com/docs/guides/platform/free-project-pausing).
- **Supabase email is limited.** The built-in email service sends 2 emails an hour, which covers sign-up confirmations and password resets for a small group. Set up custom SMTP in Supabase before inviting more people. See [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
- **Netlify build credits.** Each approved change triggers one build, and builds use Free plan credits. Keep builds rare. See [Netlify's rate-limiting guide](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/) for how request limits apply.

## What the app does not do

- **It is not a safety service.** It does not know today's lifeguard flags, warnings, water quality, sargassum or jellyfish. Obey the lifeguards and official warnings ([D-002](docs/decisions.md)).
- **It does not assess rip currents.** Open-Meteo has no rip current data, so the score does not guess at it. Each day view links to the National Weather Service. Check [the NWS Miami Surf Zone Forecast](https://forecast.weather.gov/product.php?site=MFL&issuedby=MFL&product=SRF) and [rip current safety](https://www.weather.gov/safety/ripcurrent) before you swim.
- **It is not a surf report.** Wave data is an offshore estimate.
- **The Agents page does not commit anything on its own.** A human approves every change.

## Documentation

- [Setup and deploy guide](https://github.com/atilus2020-design/BeachDay-kakashi/blob/main/guide/index.html) is also served on the live site at `/guide/`.
- [How it works](https://github.com/atilus2020-design/BeachDay-kakashi/blob/main/how-it-works/index.html) explains the score, served at `/how-it-works/`.
- [docs/decisions.md](docs/decisions.md): accepted decisions D-001 to D-008.
- [docs/security.md](docs/security.md): security model, secrets and the owner's set-up checklist.
- [docs/build-plan.md](docs/build-plan.md): build waves, contracts and the mock setup.
- [docs/expert-roster.md](docs/expert-roster.md): the agent team and who owns what.
- [docs/agent-brains.md](docs/agent-brains.md): each agent's model and personality.
- [Resources](https://github.com/atilus2020-design/BeachDay-kakashi/blob/main/resources/index.html) lists every external source, served at `/resources/`.

Project links: the [GitHub repository](https://github.com/atilus2020-design/BeachDay-kakashi) and the [API directory](https://mcp-api.netlify.app/) where we found Open-Meteo.

Weather data by [Open-Meteo.com](https://open-meteo.com/en/terms), licensed under CC BY 4.0.
