---
name: github-commits
description: "Read files and commit approved changes to the Beach Day GitHub repo from a Netlify Function with a fine-grained token. Use for any GitHub REST API code or review."
---
# GitHub commits (decisions D-003, D-005)

- Token: fine-grained PAT, this repo only, Contents RW + Metadata R, **no Workflows**, with expiry. Env `GITHUB_TOKEN`; target repo from env `GITHUB_REPO` (never from the request).
- Headers: `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2026-03-10`, `User-Agent: beach-day`.
- Read: `GET /repos/{o}/{r}/contents/{path}?ref=main` → base64 `content` + `sha` (≤1 MB).
- Atomic commit to `main`: `GET git/ref/heads/main` → `GET git/commits/{sha}` (tree) → `POST git/trees` (`base_tree`, entries `{path, mode:"100644", type:"blob", content}`; `sha:null` deletes) → `POST git/commits` (`parents:[head]`) → `PATCH git/refs/heads/main` (`force:false`).
- Stale check: if head ≠ proposal base and a touched file's blob sha changed → 409.
- Contents API PUT/DELETE must be serial if used. Base URL overridable by `GITHUB_API_URL` for mocks.
