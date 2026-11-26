# Writing procedures and link pages — reference notes

Sources (read 2026-11-26): Google developer documentation style guide, Procedures — https://developers.google.com/style/procedures · Apple HIG Writing — https://developer.apple.com/design/human-interface-guidelines/writing

- "A procedure is a sequence of numbered steps for accomplishing a task." "In general, use one step for each action."
- "In most cases, introduce a procedure with an introductory sentence."
- "Tell the reader where to complete an action… before you state the action." (For example: "In the Netlify UI, go to **Site configuration → Environment variables**, then click **Add a variable**.")
- Optional steps start with "Optional:". Sub-steps use lowercase letters.
- For a complex step: describe the action, then give the command in a code block.
- HIG: "If you can use fewer words, do so." Use plain language with no jargon, and a verb on every button or link label.

## Beach Day specifics
- Env var tables give: name · where to set it · scope/context · format example (fake) · purpose. **Never a real value.**
- The Resources page links only official sources (see `examples/resources-list.md`). Verify every link before publishing.
- Always state the limits: a planning aid, not a safety service; no rip-current assessment (link to NWS, D-002).
