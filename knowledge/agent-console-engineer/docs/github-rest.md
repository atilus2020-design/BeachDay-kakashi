# GitHub REST API — reference notes (contents and commits)

Sources (read 2026-11-26):
- https://docs.github.com/en/rest/repos/contents
- https://docs.github.com/en/rest/git/trees
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

## Headers
`Authorization: Bearer <fine-grained token>` · `Accept: application/vnd.github+json` · `X-GitHub-Api-Version: 2026-03-10` (the version shown in the docs) · `User-Agent: beach-day`

## Contents API
- `GET /repos/{owner}/{repo}/contents/{path}?ref=main` returns `content` (base64), `sha` and `size`. Files ≤ 1 MB work fully. For 1–100 MB use the `raw` media type; over 100 MB is unsupported.
- `PUT /repos/{owner}/{repo}/contents/{path}` with body `message`, `content` (base64), **`sha` (required when updating)**, `branch`, `committer`. Responses: 200, 201, 404, **409**, 422. Needs Contents: write; files in `.github/workflows` also need **Workflows: write**.
- `DELETE …/contents/{path}` with `message` and `sha` (committer/author need both name and email, or you get a 422).
- "If you use this endpoint and the 'Delete a file' endpoint in parallel, the concurrent requests will conflict… You must use these endpoints serially instead."

## Git Data API (atomic multi-file commit, used by Approve)
1. `GET /repos/{o}/{r}/git/ref/heads/main` → `object.sha` (head)
2. `GET /repos/{o}/{r}/git/commits/{head}` → `tree.sha`
3. `POST /repos/{o}/{r}/git/trees` with `{ base_tree, tree: [{ path, mode: "100644", type: "blob", content }] }`. "If the value [sha] is `null` then the file will be deleted." Needs Contents: write.
4. `POST /repos/{o}/{r}/git/commits` with `{ message, tree, parents: [head] }`
5. `PATCH /repos/{o}/{r}/git/refs/heads/main` with `{ sha, force: false }`. This fails if `main` moved: re-read and retry once.

## Fine-grained personal access token (D-005)
- Settings → Developer settings → Fine-grained tokens → Generate. **Only select repositories** → this repo. Permissions: **Contents: Read and write**, **Metadata: Read**. Set an expiration (the default is 30 days, maximum 366 or none, unless org policy limits it).
- "Treat your access tokens like passwords."
