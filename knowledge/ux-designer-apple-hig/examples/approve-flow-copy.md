# Example 2 — copy deck: Agent proposal and Approve (irreversible action)

| Moment | Copy | Why |
|---|---|---|
| Proposal card title | "Kai proposes: Show water temperature in °F" | Who, and what in plain words |
| Diff header | "2 files changed · +14 −3" | Scope before detail |
| Primary button | **"Approve and deploy"** | Verb plus consequence (HIG: use a verb) |
| Secondary button | "Reject" (placed apart from Approve) | Avoid mis-taps |
| Confirm sheet title | "Commit to main and redeploy?" | Names the irreversible effect (D-003) |
| Confirm sheet body | "This commits 2 files to GitHub `main`. Netlify will rebuild the live site in about a minute." | Specific, no blame, sets expectations |
| Confirm button | "Commit and deploy" · Cancel | — |
| Success | "Committed a1b2c3d. Deploy started." + link "View commit" | Feedback with a next step |
| Stale error | "The code changed since this proposal. Ask Kai to refresh it." [Ask again] | Says how to fix it |
| Not allowed | "Only the project owner can approve changes." | No jargon like "403" |
