# Architecture decision records and Beach Day constraints

## ADR format (Michael Nygard)
Source: https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions (read 2026-11-26)
- **Title:** "short noun phrases". **Context:** "the forces at play… value-neutral… simply describing facts." **Decision:** "full sentences, with active voice. 'We will …'" **Status:** proposed → accepted → "deprecated" or "superseded" with a reference. **Consequences:** "All consequences should be listed here, not just the 'positive' ones."
- "ADRs will be numbered sequentially and monotonically. Numbers will not be reused." Keep the old one and mark it superseded. "one or two pages long."
- Beach Day keeps ADRs in `docs/decisions.md` as D-001…

## Platform constraints that shape every design (official docs)
- Netlify Functions: 60 s synchronous and streaming (20 MB); background 15 min with an empty 202 and retries after 1 and 2 min; scheduled 30 s — https://docs.netlify.com/build/functions/configuration/ · https://docs.netlify.com/build/functions/background-functions/
- Netlify headers don't apply to Function responses — https://docs.netlify.com/manage/routing/headers/
- `netlify.toml` env vars aren't visible to Functions — https://docs.netlify.com/build/environment-variables/overview/
- Blobs: eventual by default (≤ 60 s), strong on request, conditional writes — https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- Open-Meteo free tier: < 10,000 calls/day, CC BY 4.0 — https://open-meteo.com/en/terms
- Accepted decisions: D-001 (no other servers), D-002 (no rip proxy), D-003 (Approve → `main`), D-004 (Free plan), D-005 (fine-grained token).
