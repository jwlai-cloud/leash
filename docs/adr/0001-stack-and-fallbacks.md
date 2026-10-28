# ADR 0001 — Stack: Node + Express + vanilla HTML, raw REST, offline fallbacks

Status: Accepted (2026-10-28)

## Context
4-hour build. Judges must be able to run it. No API keys may be available on a judge's machine.

## Decision
- **Node 22 + Express**, one server file plus small modules. Frontend is one static HTML page + PayPal JS SDK. No build step.
- **Raw `fetch`** to PayPal REST (OAuth2 client-credentials, Orders v2 create/capture) and the Anthropic Messages API. No SDKs: three endpoints each, nothing an SDK saves us.
- **Two independent fallbacks**, each shown in the UI as a mode badge:
  - No `ANTHROPIC_API_KEY` → rule-based agent + regex injection scanner.
  - No `PAYPAL_CLIENT_ID/SECRET` → simulated order IDs, simulated approve button.
- Policy engine is **pure deterministic code** and always runs; AI can only *add* risk, never remove a deterministic block.
- In-memory state (ledger, decisions). Restart = reset.

## Rejected
- Next.js: build step + more files for no demo gain.
- PayPal Agent Toolkit: wraps the same Orders endpoints as LLM tools; we need the guard *between* agent and PayPal, so the agent must not hold the payment tool.
- DB: single-user demo; a DB adds setup friction for judges.

## Consequences
Restart loses ledger (acceptable for demo). Upgrade path: SQLite file if multi-session needed.
