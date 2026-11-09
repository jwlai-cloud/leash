# ADR 0006 — Vercel AI SDK agents and a leashed PayPal Agent Toolkit

Status: Accepted (2026-11-09)

## Context
PayPal's webinars name the Agent Toolkit and, for TypeScript, the Vercel AI SDK. Judges reward PayPal being central to the AI, not a checkout bolted on. Seller agents were one shared model call per round, so "multi-agent" was only half true.

## Decision
- **Framework:** Vercel AI SDK v4 (`ai@4`, the version `@paypal/agent-toolkit@1.11.0` depends on) with `@openrouter/ai-sdk-provider@0.4`, model DeepSeek V4.1 Flash, reasoning off. `src/agents.js` runs every agent and charges the $20 budget.
- **Independent seller agents:** one AI SDK call per seller, in parallel, each with private context (its own floor). Prices stay in code.
- **Leashed toolkit (`src/leash-tools.js`):** agents get PayPal Agent Toolkit tools wrapped by `checkToolCall`. Least privilege: `get_order`, `create_refund` only. Context `sandbox: true` (the toolkit defaults to live).
  - `get_order`: only orders Leash created for this deal.
  - `create_refund`: only your own agent, only after you ask, only this deal's capture, never more than is left.
  - Refused calls never reach PayPal; the agent gets the refusal as the tool result; every call is audited and shown in the UI.
- **Shipping:** the toolkit's `create_shipment_tracking` calls `/v1/shipping/trackers-batch`, which a standard sandbox REST app gets `NOT_AUTHORIZED` for (verified 2026-11-09). Leash adds its own leashed tool `add_order_tracking` on Orders v2 `/track` instead.
- **Checkout stays Leash's own Orders v2 code:** the toolkit's `create_order` has no `payee` or `custom_id`, which we need for paying the winning seller and the mandate audit link.
- **Webhooks:** `/api/paypal/webhook` trusts an event only after PayPal's `verify-webhook-signature` returns SUCCESS (`PAYPAL_WEBHOOK_ID`).

## Rejected
- AWS Strands + Bedrock: no PayPal toolkit adapter for Strands; AWS is not a sponsor (loses the Render prize).
- Upgrading the toolkit's pinned dependencies (`ai@4`, `@langchain/core@0.3.6`, `mathjs@14`): would likely break the toolkit.

## Consequences
- `npm audit` reports 12 high + 1 moderate advisories, all transitive through the toolkit's pinned dependencies (LangChain, mathjs, AI SDK 4 utils). Leash does not use the affected LangChain, React or patch APIs. Acceptable for a sandbox demo; revisit before any production use.
- Real-sandbox verified: toolkit `get_order` on a captured order, toolkit `create_refund` (refund `5N1574911Y9259208`, COMPLETED), second refund refused by Leash.
