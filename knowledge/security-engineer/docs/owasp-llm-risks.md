# OWASP Top 10 for LLM Applications (2025) — notes for the Agent Console

Sources: https://genai.owasp.org/llm-top-10/ · https://genai.owasp.org/llmrisk/llm01-prompt-injection/ · https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (read 2026-11-26)

The list: LLM01 Prompt Injection · LLM02 Sensitive Information Disclosure · LLM03 Supply Chain · LLM04 Data and Model Poisoning · LLM05 Improper Output Handling · LLM06 Excessive Agency · LLM07 System Prompt Leakage · LLM08 Vector and Embedding Weaknesses · LLM09 Misinformation · LLM10 Unbounded Consumption.

## LLM01 Prompt Injection
- **Direct** injection comes from the user's prompt. **Indirect** injection comes from external content (websites, files, and for us **repository files the agent reads**).
- Mitigations (OWASP list): constrain model behaviour; define and validate expected output formats; filter input and output; **enforce privilege control and least privilege**; **require human approval for high-risk actions**; segregate and identify external content; adversarial testing.

## LLM06 Excessive Agency
- "Excessive Agency is the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous or manipulated outputs from an LLM."
- Mitigations (quoted in short form):
  - minimize extensions;
  - minimize functionality ("should not contain other functionality such as deleting");
  - minimize permissions;
  - execute in the user's context;
  - "Utilise human-in-the-loop control to require a human to approve high-impact actions";
  - "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed… complete mediation."

## How Beach Day applies them
| Risk | Control |
|---|---|
| LLM01 / LLM06 | Agents get only `read_file`, `list_files` and `propose_change`. Nothing writes without **Approve**. The server re-validates the allow-list at propose **and** approve time (complete mediation). The token has Contents only and no Workflows permission |
| LLM02 / LLM07 | System prompts stay server-side. Keys never reach the model or the browser. Error bodies are not echoed |
| LLM05 | Model text is rendered with `textContent`, never `innerHTML`. Diffs are escaped |
| LLM10 | Per-IP `rateLimit`, daily budget in Blobs, bounded `max_tokens`, Anthropic workspace spend limit |
