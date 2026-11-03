# ADR 0004 — OpenRouter + DeepSeek V4.1 Flash as default AI provider

Status: Accepted (2026-11-03)

## Context
Need real model calls for the demo at the lowest cost, with exact spend tracking.

## Decision
- New `openrouter` provider (OpenAI-compatible `/chat/completions`), auto-selected first when `OPENROUTER_API_KEY` is set.
- Default model `deepseek/deepseek-v4.1-flash`: cheapest recent DeepSeek on OpenRouter's live model list (2026-11-03: $0.045/M input, $0.50/M output, JSON mode supported). Newer `-1017` snapshot costs 3x input; not worth it for short JSON tasks.
- Request `usage: {include: true}`; the budget records OpenRouter's **billed USD cost** instead of a token estimate (ADR 0002 reservation unchanged).
- ~2.4k input + ~120 output tokens per call, 2 calls per shopping request ≈ $0.0003/request.

## Consequences
Provider-side hard cap: set a credit limit on the OpenRouter key. Other providers stay as alternatives.
