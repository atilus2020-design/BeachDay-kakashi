---
name: docs-writing
description: "Write Beach Day's README, deploy steps, How it works page, Resources page and the step-by-step guide in plain language with correct links. Use for any user-facing documentation."
---
# Docs writing

- Lead with the task the reader wants to do; numbered steps; one action per step; show exact commands in fenced `bash` blocks.
- Every env var: name, where to set it (Netlify UI → Site configuration → Environment variables), scope, example format (never a real value).
- Resources page lists every external dependency with its official link: Open-Meteo docs + terms, Netlify docs, Claude API docs, GitHub REST docs, Supabase docs, MDN PWA, Apple HIG, WCAG, NWS rip current pages, the repo, https://mcp-api.netlify.app/ and `/guide/`.
- Check each link resolves; prefer official docs over blogs.
- Say what the app does **not** do (not a safety service; no rip-current assessment — D-002).
- Keep README sections: What it is · Run locally · Deploy to Netlify · Environment variables · Agent Console setup · Tests · Rotating secrets.
