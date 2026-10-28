# Learning notes — the tech under Leash

## PayPal Orders v2
- **Auth:** `POST /v1/oauth2/token` with HTTP Basic `client_id:secret`, `grant_type=client_credentials`. Token cached until ~60s before `expires_in`. ([docs](https://developer.paypal.com/api/rest/authentication/))
- **Create:** `POST /v2/checkout/orders`, `intent: CAPTURE`. When you send `items`, `amount.breakdown.item_total` must equal the sum of `unit_amount × quantity`, or PayPal rejects with `ITEM_TOTAL_MISMATCH`. `custom_id` (≤127 chars) travels with the transaction — we put the Leash decision ID there for audit. ([docs](https://developer.paypal.com/docs/api/orders/v2/#orders_create))
- **Capture:** `POST /v2/checkout/orders/{id}/capture` after buyer approval. ([docs](https://developer.paypal.com/docs/api/orders/v2/#orders_capture))
- **Idempotency:** `PayPal-Request-Id` header makes retries safe (same key → same result, no double charge). ([docs](https://developer.paypal.com/api/rest/reference/idempotency/))
- **JS SDK Buttons:** `paypal.Buttons({ createOrder, onApprove })` — `createOrder` returns an order ID from *your server*; `onApprove` calls your server to capture. The browser never sees secrets. ([docs](https://developer.paypal.com/sdk/js/reference/))
- **Agent Toolkit / MCP:** PayPal's official way to hand these same endpoints to an LLM as tools. Leash deliberately does *not* give the agent the tool — the guard owns it. ([repo](https://github.com/paypal/agent-toolkit))

## Claude Messages API
- `POST /v1/messages` with `x-api-key`, `anthropic-version: 2023-06-01`. Response `usage.input_tokens/output_tokens` drives our spend cap. ([docs](https://docs.anthropic.com/en/api/messages))
- We ask for JSON-only output and still treat it as untrusted: extract `{…}`, `JSON.parse`, then whitelist SKUs and clamp quantities.

## Prompt injection (indirect)
- The attack: content the agent *reads* (web page, listing, email) contains instructions. The agent can't reliably tell data from commands. ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/))
- Defense pattern used here: **don't let the model that read untrusted content hold the payment capability.** A separate guard + deterministic policy decides, and AI signals can only raise risk.

## Design choices worth remembering
- Deterministic policy first, AI second → explainable verdicts, testable without a model.
- Every external dependency has an offline fallback → demo never dies on bad wifi or missing keys.
