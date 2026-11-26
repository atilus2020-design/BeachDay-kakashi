# Secrets, CSRF and fine-grained tokens — notes

## OWASP Secrets Management Cheat Sheet
Source: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- **Least privilege:** "configure fine-grained access controls on each object and component."
- **Expiry:** "You should create secrets to expire after a defined time where possible." Automate or support **rotation**.
- **Never in code:** many organizations "have them hardcoded within the source code in plaintext". Don't.
- **Detect:** "enable secrets detection… before commit/PR… via pre-commit hook." **Logs:** secrets must "Never be logged".
- **Environment variables:** OWASP notes they are "not recommended unless the other methods are not possible". On Netlify (no secrets manager on Free), env vars with **Functions scope** and **"Contains secret values"** are the available option. We pair them with expiry, rotation and no logging.

## OWASP CSRF Prevention Cheat Sheet
Source: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- `SameSite=Strict` cookies are not sent on cross-site requests; `Lax` allows only top-level safe-method navigations.
- **Custom request header** defence: "the client appends a custom header… If the header does not exist, the backend rejects the request". It relies on the CORS preflight.
- **Fetch Metadata:** `Sec-Fetch-Site` (`same-origin`, `same-site`, `cross-site`, `none`) blocks cross-site requests. Fallback **Origin** verification "is a mandatory requirement".
- Beach Day sends the access token in an `Authorization: Bearer` header (not a cookie). The browser doesn't attach that automatically, which removes classic CSRF. We still require `X-Requested-With: beachday` and check `Origin`/`Sec-Fetch-Site` on POST, as defence in depth.

## GitHub fine-grained token (D-005)
Source: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- Repository access → **Only select repositories** → this repo. Permissions: **Contents: Read and write**, **Metadata: Read**. Expiration default 30 days, max 366 or none (org policy may cap it).
- "Treat your access tokens like passwords." "We highly recommend adding an expiration."
- Writing `.github/workflows/*` requires **Workflows: write** (Contents API docs). Without it GitHub refuses, which is our CI escape hatch closed.
- Fine-grained tokens can always read public repositories, so the target repo comes from env `GITHUB_REPO`, never from the request.

## Vite environment variables
Source: https://vite.dev/guide/env-and-mode
- "Variables prefixed with `VITE_` will be exposed in client-side source code after Vite bundling." "`VITE_*` variables should _not_ contain sensitive information such as API keys."
