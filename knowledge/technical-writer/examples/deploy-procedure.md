# Example 1 — a deploy procedure written to the style guide

## Deploy Beach Day to Netlify

You need a GitHub account, a Netlify account (Free plan) and this repository pushed to GitHub. Deploying takes about 10 minutes.

1. In Netlify, click **Add new project → Import an existing project**, then choose **GitHub** and select this repository.
2. Leave the build settings Netlify reads from `netlify.toml` (build command `npm run build`, publish directory `dist`), then click **Deploy**.
3. In **Site configuration → Environment variables**, add each variable from the table below with the **Functions** scope.
4. Optional: in **Domain management**, add a custom domain.
5. Trigger a new deploy so the Functions pick up the variables:
   ```bash
   netlify deploy --prod --build
   ```

| Variable | Scope / context | Example format | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Functions · all contexts | `sk-ant-…` | Calls the Claude API for agent chat |
| `GITHUB_TOKEN` | Functions · Production only | `github_pat_…` | Commits approved changes to `main` |
