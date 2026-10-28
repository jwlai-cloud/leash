# ADR 0002 — $20 app-level AI spend cap for dev/testing

Status: Accepted (2026-10-28)

## Context
Dev, testing and judge traffic all hit a paid model. Need a hard ceiling of $20.

## Decision
- `src/budget.js` keeps cumulative token usage in `.ai-usage.json` (gitignored), so restarts don't reset it.
- **Reserve before call:** worst-case cost = (prompt chars / 3) input tokens + `max_tokens` output, priced at env rates. If spent + worst case > `AI_BUDGET_USD` (default 20), the call is never made and the app falls back to rules.
- **Record after call:** real `usage.input_tokens/output_tokens` from the Messages API response.
- Default prices ($5 in / $25 out per MTok) deliberately above Haiku-class pricing, so the cap trips early, not late.
- Budget status exposed at `/api/config` → shown in UI.

## Not covered (by design)
App cap is per-process-file. Two deployments, or a leaked key used elsewhere, bypass it. **Set the provider-side spend limit in the Anthropic Console too** — that is the only durable backstop.

## Reset
Delete `.ai-usage.json`.
