# ADR 0003 — Gemini as second AI provider

Status: Accepted (2026-10-28)

## Context
Owner has Gemini API access; Claude key not guaranteed. Judges may have either.

## Decision
- `src/ai.js` has one `llm()` call path; a `PROVIDERS` table supplies per-provider `request()` (URL, headers, body) and `parse()` → `{text, usage}`.
- Gemini: `POST v1beta/models/{model}:generateContent`, `x-goog-api-key`, `systemInstruction`, `responseMimeType: application/json`. Default model `gemini-3.5-flash-lite` (docs' cheap/fast pick, 2026-10).
- Selection: `AI_PROVIDER` if set and valid, else whichever key exists (Claude first), else rules.
- Shares the $20 budget (ADR 0002). Gemini `thoughtsTokenCount` counted as output (billed as output).

## Rejected
- `@google/genai` SDK: one endpoint, no SDK needed.
- Running both providers as a cross-check guard: doubles cost/latency; revisit if judges ask "what if the guard model is fooled too".
