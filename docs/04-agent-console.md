# 4. Agent Console: design, security and long jobs

A sign-in-protected page inside the deployed app (`/console`), open only to users whose `profiles.role` is `super_admin` (Supabase Auth; see `docs/security.md`), that:

1. **Lists every agent** in `.claude/agents/` with its name, model and personality.
2. **Lets the user chat with any agent.** Claude is called **only from a Netlify Function**, with the key in an environment variable.
3. **Lets an agent propose code changes.** A change is committed to GitHub **only after the user clicks Approve**, and the commit triggers a Netlify redeploy.

## 4.1 Agent files (the source of truth)

Claude Code subagents are Markdown files with YAML frontmatter in `.claude/agents/`. The Console reads the same files, so the agent team used in development and the agents in the app stay in sync. **That folder doesn't exist yet in this repository.** The next step (building the agent team) creates it.

```markdown
---
name: wave-scientist
description: Owns beach scoring; expert in Open-Meteo marine data and NWS surf guidance.
model: sonnet            # opus | sonnet | haiku | inherit, or a full model ID
tools: Read, Grep, Glob  # Claude Code tools (not used by the Console)
color: cyan
---
You are a calm, precise coastal meteorologist... (personality + instructions)
```

**Mapping for the Console** (done at build time by `scripts/build-agents.mjs`, doc 3 §3.6):

| Frontmatter `model` | Claude API model ID |
|---|---|
| `opus`, `inherit`, or missing | `claude-opus-5-5` (the default) |
| `sonnet` | `claude-sonnet-5-5` |
| `haiku` | `claude-haiku-5-5` |
| A full ID such as `claude-fable-5-2` | Used as-is if it is on an **allow-list of model IDs**; otherwise the build fails |

**Personality** is the frontmatter `description` plus the first paragraph of the body. The full body is the system prompt, and it stays on the server (`agents-private.json`).

Model facts, from https://platform.claude.com/docs/en/about-claude/models/overview.md, checked November 2026:

| Model | ID | Price per million tokens (input / output) | Notes |
|---|---|---|---|
| Opus 5.5 | `claude-opus-5-5` | $4 / $20 | Recommended default. Adaptive thinking is always on. Default effort is `medium` |
| Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | Faster. Default effort is `high` |
| Haiku 5.5 | `claude-haiku-5-5` | from $0.10 / $0.50 | Fastest; for cheap triage or summarizing |
| Fable 5.2 | `claude-fable-5-2` | $8 / $40 | Most capable; long-horizon work |

All four have a 1M-token context window and 128K max output.

## 4.2 Endpoints

Sign up, log in, log out, forgot password and Continue with Google happen **in the browser with supabase-js against Supabase Auth**; there are no `/api/auth/*` Functions. Every endpoint below runs the guard in `docs/security.md` §5: the Supabase access token arrives as `Authorization: Bearer`, is verified server-side, and the role is read from `public.profiles` under RLS. "CSRF" means `X-Requested-With: beachday` plus the `Origin` / `Sec-Fetch-Site` check (security.md R10).

| Method and path | Function | Auth | Purpose |
|---|---|---|---|
| ~~`POST /api/auth/login`, `POST /api/auth/logout`~~ | — | — | **Removed** (superseded by Supabase Auth in the browser) |
| `GET /api/agents` | agents | Supabase token + super_admin | Agent list |
| `POST /api/agent/chat` | agent-chat (streaming) | Supabase token + super_admin + CSRF | One chat turn, streamed as server-sent events (SSE) |
| `POST /api/jobs` | jobs (synchronous) → agent-job (background) | Supabase token + super_admin + CSRF | Start a long task, such as "implement X and propose a change" |
| `GET /api/jobs/:id` | job-status | Supabase token + super_admin | Poll status, progress events and the proposal ID |
| `GET /api/proposals` and `/:id` | proposals | Supabase token + super_admin | List or view pending proposals with their diff |
| `POST /api/proposals/:id/approve` | approve | Supabase token + super_admin + CSRF + allow-list re-check | Commit to GitHub |
| `POST /api/proposals/:id/reject` | proposals | Supabase token + super_admin + CSRF | Mark the proposal rejected |

## 4.3 Chat: calling Claude from a function

Facts from the Claude API docs:

- Everything goes through `POST /v1/messages` with `model`, `max_tokens` and `messages`, plus an optional `system`. Stop reasons are `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal` and `model_context_window_exceeded`. Source: https://platform.claude.com/docs/en/api/messages/create.md
- **Streaming** (`client.messages.stream(...)`) emits `message_start`, then `content_block_start` / `content_block_delta` (`text_delta`, `input_json_delta`, `thinking_delta`) / `content_block_stop`, then `message_delta` (stop reason and usage) and `message_stop`, with `ping` events throughout. An `error` event such as `overloaded_error` can arrive mid-stream; the SDK raises it as an error. Source: https://platform.claude.com/docs/en/build-with-claude/streaming.md
- Use the official TypeScript SDK `@anthropic-ai/sdk`, not hand-rolled `fetch`.

### Opus 5.5 / Sonnet 5.5 API notes (from the Claude API reference)

- **Don't send `thinking: {type: "disabled"}`** to Opus 5.5 (it returns a 400). Omit `thinking`, and control depth with `output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" }`. **Use `low` for chat** (fast and cheap) and `high` for code-change jobs.
- **Forced `tool_choice` (`any` or `tool`) returns a 400** on Opus 5.5 and Sonnet 5.5. Use `tool_choice: auto`, `strict: true` on tools, and say in the system prompt when to call a tool.
- **No assistant prefill**, and no `temperature`, `top_p` or `top_k` (rejected).
- **Check `stop_reason === "refusal"`** before reading the content. On Opus and Sonnet 5.5, enable the server-side fallback (beta `server-side-fallback-2026-07-01` with `fallbacks: "default"` on `client.beta.messages.*`) so a safety decline is retried on a fallback model in the same call. Haiku 5.5 has no server-side fallback.
- Handle **429** using the `retry-after` header (not every 429 has it, and the spend-cap 429 never does). Rate limits are counted as requests per minute (RPM), input tokens per minute (ITPM) and output tokens per minute (OTPM), and responses include `anthropic-ratelimit-*` headers. Source: https://platform.claude.com/docs/en/api/rate-limits.md. Set a **monthly spend limit** on the Claude Console workspace used by this key.

### Sketch: streaming chat relayed as SSE

```ts
// netlify/functions/agent-chat.mts (sketch)
import Anthropic from "@anthropic-ai/sdk";
import type { Config, Context } from "@netlify/functions";
import { guard } from "./_lib/auth.ts";              // docs/security.md §5
import { getAgent } from "./_lib/agents.ts";          // server-side prompts and model IDs
import { checkBudget, recordUsage } from "./_lib/budget.ts";

const client = new Anthropic();                        // reads ANTHROPIC_API_KEY from env

export default async (req: Request, ctx: Context) => {
  const g = await guard(req);                          // Supabase token + super_admin; 401/403 otherwise
  if (!g.ok) return g.response;
  const user = g.user;                                 // { id, email } from Supabase, never from the body
  const { agent: agentName, messages } = await req.json();
  const agent = getAgent(agentName);                   // 404 if unknown; never trust a client system prompt
  validateMessages(messages);                          // roles user/assistant only, size caps, ≤ N turns
  await checkBudget(user.id, ctx.ip);                  // daily request/token budget in Blobs (strong)

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const stream = client.beta.messages.stream({
          model: agent.model,                          // e.g. "claude-opus-5-5"
          max_tokens: 8000,                            // bounded so the turn finishes well under 60 s
          system: agent.systemPrompt,
          messages,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",                        // omit for Haiku 5.5
        });
        stream.on("text", (t) => send("text", t));
        const final = await stream.finalMessage();
        await recordUsage(user.id, final.usage);
        send("done", { stop_reason: final.stop_reason });
      } catch (err) {
        send("error", { message: "Agent unavailable, please retry." }); // no stack traces to the client
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
};

export const config: Config = {
  path: "/api/agent/chat",
  method: "POST",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
```

**Client side:** use `fetch()` and read `response.body` with a `ReadableStream` reader. `EventSource` can't send POST bodies or custom headers. Append text to the message bubble, and announce it to screen readers in **batches** (doc 5).

**Conversation storage:** keep the transcript in the browser (`sessionStorage`) and send it with each turn. This is stateless and simple. Cap it at about 30 turns or about 100 KB, and offer "Start new chat". Optionally save transcripts to Blobs for the audit log.

**Prompt caching:** agent system prompts are long and the same on every turn. Add `cache_control` on the system prompt to cut cost and latency on later turns (Claude API prompt-caching docs).

## 4.4 Proposing code changes: a tool the agent calls

The agent never touches GitHub. It calls a **client tool** we define. Our function validates the tool input and **stores a proposal**. A human approves it later.

```ts
const proposeChange = {
  name: "propose_change",
  description:
    "Propose a set of file changes for human review. Nothing is committed until the user approves. " +
    "Only paths under the allowed directories can be changed. Provide complete new file contents.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "files"],
    properties: {
      title:   { type: "string", description: "Short commit title (≤ 72 chars)" },
      summary: { type: "string", description: "Why this change; what was tested" },
      files: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "action", "content"],
          properties: {
            path:    { type: "string", description: "Repo-relative path, e.g. src/app/today.ts" },
            action:  { type: "string", enum: ["create", "update", "delete"] },
            content: { type: "string", description: "Full file content (empty for delete)" },
          },
        },
      },
    },
  },
};
```

Also give the agent **read-only tools** so it proposes changes against real code:

- `read_file(path)` and `list_files(dir)`. These use the GitHub Contents API (`GET /repos/{owner}/{repo}/contents/{path}`, which returns base64 content and a `sha`; files up to 1 MB work normally) with the same token, limited to the read allow-list.
- Optionally `search_code`.

**Tool loop rules** (Claude API tool use, https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md):

- Run the tools when `stop_reason` is `tool_use`.
- Return **all** `tool_result` blocks, each with its `tool_use_id`, in **one** user message. Use `is_error: true` for failures, such as a rejected path, so the agent can correct itself.
- Parse tool inputs with `JSON.parse` and never with string matching.
- If streaming with `eager_input_streaming: true` (useful for large file contents), validate the parsed input against the schema before using it, because a partial input can be silently truncated.

**When `propose_change` runs (server side):**

1. Normalize and validate every path against the allow-list (§4.5.4). Reject the whole proposal on any violation, and return an `is_error` result explaining why.
2. Enforce size limits: at most 20 files, at most 200 KB per file, and at most 1 MB total. Text only (UTF-8, no NUL bytes).
3. Record the **base commit SHA** (current `main` HEAD) and each touched file's current blob `sha`.
4. Compute a unified diff for display, using the `diff` npm package on the server or the client.
5. Save `proposal/<id>` in Blobs with `onlyIfNew`: `{ id, agent, title, summary, files, baseSha, fileShas, diff, status: "pending", createdAt, createdBy }`.
6. Return `{ proposal_id }` to the agent, which tells the user "Proposal #id is ready for review".

## 4.5 Security model

> **`docs/security.md` is the authoritative security model** (threats, rules R1–R17, environment variables, the guard contract and the QA checklist). This section is a summary; where they differ, `docs/security.md` wins.

### 4.5.1 Threats to design for

| Threat | Mitigation |
|---|---|
| Strangers or ordinary signed-up users using the console to burn Claude credits | Supabase token verified server-side on every request, role `super_admin` read from `profiles` under RLS, per-IP rate limits, daily budget, Anthropic spend limit |
| Strangers getting the app to commit code | Every endpoint requires a verified Supabase token and `super_admin`. Approve also requires the CSRF checks and an approval-specific confirmation |
| A user making themselves `super_admin` | No UPDATE privilege or policy on `profiles`; role assigned only by the owner in the SQL editor; role never taken from the client or JWT claims (security.md R2–R4) |
| **Prompt injection** (a malicious file, issue text or chat message steers an agent into a harmful change) | The agent can only *propose*. The server validates paths and the human reviews the full diff. Agents can't edit security code (deny-list). Tool outputs are treated as untrusted data in the system prompt |
| A leaked GitHub token | Fine-grained token for this repository only, Contents read/write only, with an expiry. It is only in the Functions environment and never logged |
| A leaked Claude key | Only in the Functions environment; separate workspace with a spend limit; rotate it |
| An agent changing CI or deploy config to escape | The token lacks the Workflows permission, so GitHub rejects `.github/workflows` changes. The allow-list also blocks `netlify.toml`, `netlify/functions/**`, `package*.json`, `.claude/**` and `.github/**` |
| Approving a stale proposal over newer commits | Compare the base SHA; on mismatch, rebase or re-propose (§4.6) |

### 4.5.2 Sign-in and roles (Supabase Auth)

> **Superseded:** the original shared-password gate (`CONSOLE_PASSWORD_HASH`, HMAC `bd_session` cookie with `SESSION_SECRET`, `/api/auth/login`) is replaced by Supabase Auth. Do not build it.

- **Sign-in** is Supabase Auth in the browser: email and password (sign up with email confirmation, log in, log out, forgot password) and Continue with Google (`signInWithOAuth({ provider: 'google' })`). The browser client uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Roles** live in `public.profiles` (`role` default `'user'`), created by a trigger on `auth.users`. RLS lets a user read only their own row; nobody can update `role` through the API. The owner assigns `super_admin` by hand in the Supabase SQL editor.
- **Every Function** verifies the access token with Supabase (`auth.getUser(jwt)`) and reads the role with the caller's JWT, on every request. Only `super_admin` passes. The secret / `service_role` key is never used.
- **Approve is high-impact.** Show the full diff and require an explicit "Approve and deploy" click, with the proposal title typed or confirmed.
- **The page is static** and contains no secrets; hiding the Agents link from non-admins is cosmetic. Mark `/console` `noindex` and `no-store`.
- Full rules, SQL, redirect allow-list and Google client settings: `docs/security.md`.

### 4.5.3 GitHub fine-grained personal access token

Source: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. **Resource owner:** the account or organization that owns this repository. An organization can require approval, and the token stays "pending" until an admin approves it.
3. **Repository access → Only select repositories → this one repository.**
4. **Permissions:**
   - **Contents: Read and write**
   - **Metadata: Read** (mandatory)
   - **Nothing else.** Specifically, *not* Workflows. Without it, GitHub rejects writes to `.github/workflows/*`, because the Contents API docs say workflow files need "Contents" (write) **and** "Workflows" (write).
5. **Expiration:** set one, such as 90 days ("we highly recommend adding an expiration"). Put a rotation reminder in the README.
6. Store it as the Netlify env var `GITHUB_TOKEN` (Functions scope, Production context only, marked secret). "Treat your access tokens like passwords."

Note: a fine-grained token can still *read* public repositories, so the code must hard-code the owner and repository it uses (`GITHUB_REPO=owner/name` env var). It must never take a repository name from the request.

### 4.5.4 Path allow-list (enforced on the server, twice: on propose and on approve)

```ts
// netlify/functions/_lib/allowlist.ts (policy sketch)
export const WRITE_ALLOW = [
  "src/app/**", "src/console/**", "src/scoring/**", "src/data/**",
  "public/**", "tests/**", "docs/**",
];
export const WRITE_DENY = [                    // deny always wins
  ".github/**", ".claude/**", "netlify/**", "netlify.toml",
  "package.json", "package-lock.json", "scripts/**",
  "**/.env*", "**/*.pem", "**/*.key",
];
export function assertWritablePath(p: string): string {
  if (typeof p !== "string" || p.length === 0 || p.length > 200) throw err("bad path");
  if (p.includes("\\") || p.includes("\0") || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) throw err("bad path");
  const norm = path.posix.normalize(p);
  if (norm !== p || norm.split("/").some((s) => s === ".." || s === "." || s === "")) throw err("bad path");
  if (matchesAny(norm, WRITE_DENY) || !matchesAny(norm, WRITE_ALLOW)) throw err("path not allowed");
  return norm;
}
```

- Use a well-tested glob matcher (such as `picomatch`) and **unit-test the policy hard**, including fuzz cases (doc 5).
- Only ever write tree entries with mode `100644` (regular file). Never write `120000` (symlink), `160000` (submodule) or `100755`.
- **Why `netlify/**`, `package.json` and `scripts/**` are denied:** a change there runs code at build time or in functions that hold the secrets. Agents may *suggest* such changes in chat, but a human applies them by hand. Revisit this deliberately, never through an agent proposal.

### 4.5.5 No secrets in the browser

- Only Functions read `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `JOB_SIGNING_SECRET` and `GITHUB_REPO`. The only browser-visible values are `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, which are public by design (safe only because RLS is on for every table).
- Never use a `VITE_` or `PUBLIC_` prefix for these. A build-time check fails if any of these names, or `sk-ant-`, `github_pat_`, `sb_secret_` or `service_role`, appear in `dist/` (security.md R7).
- Never return upstream error bodies to the client verbatim (they can echo headers). Log a redacted version instead.
- CSP `connect-src 'self' https://<project-ref>.supabase.co` (doc 3 §3.5 needs updating) means the client can only talk to our own functions and our Supabase project.

### 4.5.6 Rate limits and budgets (defence in depth)

| Layer | Setting |
|---|---|
| Netlify `rateLimit` (per IP, edge-enforced) | chat 10/60 s; jobs 3/60 s; approve 5/60 s; reads 60/60 s. Sign-in limits are Supabase Auth's built-in rate limits |
| App budget (Blobs, strong) | Per user `id` and global: for example 200 chat turns and 20 jobs a day, plus a daily token ceiling summed from `usage` |
| Claude Console | Workspace **spend limit**; a separate key for this app |
| Claude 429 | Respect `retry-after`; show "busy, retry in N s" |
| GitHub | Commits are rare; still serialize approvals (one at a time, via a strong-consistency lock key in Blobs) |

### 4.5.7 Audit log

Append an audit entry to Blobs for each chat turn (agent, tokens), job, proposal, approval, rejection and denied request (401/403/429), with time, Supabase user `id`, IP and request ID, never tokens. Sign-ins and password resets are in the Supabase Auth logs. Show the last 50 on a Console "Activity" tab.

## 4.6 Approve → commit → redeploy

**Recommended: one atomic commit via the Git Data API.** Several files land in a single commit, and the base SHA check comes for free.

1. `GET /repos/{owner}/{repo}/git/ref/heads/main` gives the current HEAD SHA.
2. **Stale check:** if HEAD ≠ `proposal.baseSha`, fetch each touched file's current blob SHA. If any differs from `proposal.fileShas`, return **409** ("the code changed since this proposal; ask the agent to refresh it"). If only untouched files changed, continue on the new HEAD.
3. `GET /repos/{owner}/{repo}/git/commits/{head}` gives its tree SHA.
4. `POST /repos/{owner}/{repo}/git/trees` with `base_tree` set to the HEAD tree and `tree: [{ path, mode: "100644", type: "blob", content }]`. For deletes, use `sha: null`; the docs say "If the value is `null` then the file will be deleted". Requires Contents: write. Source: https://docs.github.com/en/rest/git/trees
5. `POST /repos/{owner}/{repo}/git/commits` with `{ message, tree, parents: [head] }`. Set the message to `"<title>\n\n<summary>\n\nProposed-by: <agent>\nApproved-in: Beach Day Agent Console (proposal <id>)"`.
6. `PATCH /repos/{owner}/{repo}/git/refs/heads/main` with `{ sha: newCommit, force: false }`. A non-fast-forward fails safely, so retry from step 1 once.
7. Change the proposal from `pending` to `approved` with `onlyIfMatch` (its ETag), so a double-click or race can't commit twice. Store the commit SHA and URL.
8. **Netlify redeploys automatically**, because the site has continuous deployment on `main`. The UI links the commit and shows "Deploy started". Optionally, poll the Netlify API or react to a `deploySucceeded` platform event (shown in the Functions API reference) to show "Live ✓".

**Simpler alternative: the Contents API**, one file per request. Use `PUT /repos/{owner}/{repo}/contents/{path}` with `message`, base64 `content`, the file's `sha` when updating, `branch` and `committer`, and `DELETE` with `sha` for deletes. Status codes: 200, 201, 404, **409** and 422. The docs warn that parallel PUT/DELETE calls "will conflict… use these endpoints serially". Downside: N files make N commits and N Netlify builds, so prefer the Git Data API. Source: https://docs.github.com/en/rest/repos/contents

**Headers:** `Authorization: Bearer $GITHUB_TOKEN`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2026-03-10` (the current version shown in the docs; pin it in one constant), and a `User-Agent`.

**Not adopted (D-003 — Approve commits straight to `main`).** For reference only: "Approve to preview". Commit to the branch `agent/<proposal-id>`, open a pull request, and let Netlify build a **Deploy Preview**. Then click "Merge and deploy" once the preview looks right. This needs the **Pull requests: write** permission on the token as well, and is worth it once agents make non-trivial UI changes.

## 4.7 Long agent jobs within Netlify's time limits

| Work | Where it runs | Limit | Pattern |
|---|---|---|---|
| Chat turn (Q&A, small advice) | Streaming function | 60 s, 20 MB | Low effort, bounded `max_tokens`, stream text |
| "Read code, plan, propose change" (many tool rounds) | **Background function** | 15 min | Job record in Blobs; the client polls |
| More than 15 minutes | Chain background invocations | 15 min each | Checkpoint the conversation in Blobs, then re-invoke itself to continue |

### Background job flow

1. `POST /api/jobs` (a normal synchronous function) runs the guard (Supabase token + super_admin), then checks budget and input, then creates `job/<id>` with `status: "queued"` (`onlyIfNew`). It then calls the background function's URL internally, with the job ID and an **internal HMAC signature** (`JOB_SIGNING_SECRET`), so strangers can't start background work directly. It returns `{ jobId }`.
2. **`agent-job` (`config.background = true`)** receives the call; the caller has already received an empty 202. It then:
   - verifies the signature;
   - **claims** the job with a compare-and-swap from `queued` to `running` (`onlyIfMatch`), so the platform's retry after a failure (1 minute, then 2 minutes) doesn't run it twice;
   - runs the Claude tool loop (`read_file`, `list_files`, `propose_change`) with `effort: "high"`;
   - after each model turn, appends a progress event (`{ t, kind: "text" | "tool" | "proposal", summary }`) and the transcript to the job record;
   - watches the clock. At about 13 minutes it saves a checkpoint and either re-invokes itself (`continuation: n + 1`, capped at 3) or ends with `status: "needs_input"`.
3. **`GET /api/jobs/:id`** returns status, events since a cursor, and `proposalId` when one exists. The UI polls every 2–3 s with backoff, and shows a live activity feed and a "Review proposal" button.
4. On a terminal state (`succeeded`, `failed` or `needs_input`), keep the record for 30 days for the audit log. A cleanup can be a scheduled function (30 s limit, enough to delete old keys).

**Why not stream long jobs?** Streaming functions still stop at 60 s, and background functions can't stream (Netlify docs). Polling Blobs is simple and survives a phone going to sleep or the user closing the tab. The user comes back and the job is still there.

**Keeping turns short anyway:** a fixed tool set (`read_file`, `list_files`, `propose_change`) and a clear system prompt ("read only what you need; propose one focused change") keep jobs to a few minutes. A Claude **task budget** (beta, `output_config.task_budget`) can also make the model pace itself within a token ceiling. It is advisory, unlike `max_tokens`.

**Alternative considered: Claude Managed Agents.** Anthropic hosts the agent loop and a sandbox, with sessions streamed as events. This would remove the 15-minute concern and give the agent a real workspace. It is in beta and bills session runtime on top of tokens. Revisit it if jobs grow beyond "read a few files, propose a change". The Netlify-hosted loop above is enough for this app and keeps every GitHub write behind our own approve endpoint.

## 4.8 Console UI outline

- **Sign in** (Supabase Auth): email and password, Continue with Google, Sign up, Forgot password; Log out in the header. Non-admins see a "Not allowed" state, never the Agents page.
- **Agents** grid, showing each card's name, model badge (Opus / Sonnet / Haiku), personality excerpt, "Chat" button and "Give a task" button.
- **Chat** with a message list, composer and stop button. Tool calls are shown as collapsible "📄 read src/app/today.ts" rows.
- **Jobs** with a live activity feed per job.
- **Proposals** with a list (pending, approved, rejected) and a detail page: title, agent, summary, per-file diff (unified, with additions and deletions shown by text markers, not only colour), the base SHA, and **Approve and deploy** / **Reject** buttons.
- **Activity** showing the audit log.

## 4.9 Environment variables (summary)

| Name | Scope / context | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Functions; all contexts (a separate low-limit key for previews and dev) | Claude API |
| `GITHUB_TOKEN` | Functions; **Production only** | Fine-grained token for this repository |
| `GITHUB_REPO` | Functions | `owner/name`, hard-coded target |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Builds (inlined into the bundle) | Public. Browser Supabase client |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Functions | Public. Token verification and role lookup with the caller's JWT |
| `JOB_SIGNING_SECRET` | Functions | HMAC key for internal background invocations |
| `DAILY_CHAT_LIMIT`, `DAILY_JOB_LIMIT`, `DAILY_TOKEN_LIMIT` | Functions | Budget knobs |
| ~~`CONSOLE_PASSWORD_HASH`, `SESSION_SECRET`~~ | — | **Retired** with the password gate |

Never set `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. The full table with secret/public classification is in `docs/security.md` §4.

## 4.10 Open questions

- **Decided (D-003):** commit directly to `main`.
- **Decided (D-005):** a fine-grained personal access token for this repository only, with Contents read/write and Metadata read.
- Should agents get a `run_tests` tool? Not inside Netlify Functions: there is no repository checkout or toolchain. If wanted, have the approve step open a pull request and let GitHub Actions run tests. That needs a separate, human-managed workflow, not one written by agents.
- **Decided (lead, 2026-11-26; decision record pending):** Supabase Auth (email and password plus Google) with roles in `public.profiles`; only `super_admin` uses the Console. See `docs/security.md`.
- MFA for the `super_admin` account: recommended, not yet decided.
