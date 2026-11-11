# Learning notes — the tech under Leash

## PayPal Orders v2
- **Auth:** `POST /v1/oauth2/token` with HTTP Basic `client_id:secret`, `grant_type=client_credentials`. Token cached until ~60s before `expires_in`. ([docs](https://developer.paypal.com/api/rest/authentication/))
- **Create:** `POST /v2/checkout/orders`, `intent: CAPTURE`. When you send `items`, `amount.breakdown.item_total` must equal the sum of `unit_amount × quantity`, or PayPal rejects with `ITEM_TOTAL_MISMATCH`. `custom_id` (≤127 chars) travels with the transaction — we put the Leash decision ID there for audit. ([docs](https://developer.paypal.com/docs/api/orders/v2/#orders_create))
- **Capture:** `POST /v2/checkout/orders/{id}/capture` after buyer approval. ([docs](https://developer.paypal.com/docs/api/orders/v2/#orders_capture))
- **Idempotency:** `PayPal-Request-Id` header makes retries safe (same key → same result, no double charge). ([docs](https://developer.paypal.com/api/rest/reference/idempotency/))
- **JS SDK Buttons:** `paypal.Buttons({ createOrder, onApprove })` — `createOrder` returns an order ID from *your server*; `onApprove` calls your server to capture. The browser never sees secrets. ([docs](https://developer.paypal.com/sdk/js/reference/))
- **Agent Toolkit:** PayPal's open-source toolkit that hands PayPal APIs to an LLM as tools. It works with several frameworks (Vercel AI SDK, OpenAI Agents SDK, LangChain, CrewAI, MCP). We use its AI SDK adapter for `get_order` and `create_refund`, with `context: { sandbox: true }` because it defaults to live. Leash wraps each tool so every call is checked against the deal first. It returns PayPal errors as a result string, not an exception, so check every result. ([repo](https://github.com/paypal/agent-toolkit))
- **Order tracking:** `POST /v2/checkout/orders/{id}/track` with the capture ID, carrier and tracking number.
- **Webhooks:** trust an event only after `POST /v1/notifications/verify-webhook-signature` returns `SUCCESS` for your webhook ID. A refund event carries no order ID; find the order through the capture it links "up" to.

## Agents: Vercel AI SDK + OpenRouter
- `generateText` with tools and `maxSteps` runs each agent; `onStepFinish` tells us which tools were called. ([docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling))
- OpenRouter with DeepSeek V4.1 Flash. Turn reasoning off (`reasoning: { enabled: false }`), or the model can spend the whole token budget thinking and return nothing. `usage: { include: true }` returns the billed cost, which feeds our $20 spend cap.
- Model output is untrusted: JSON is schema-checked, product IDs are whitelisted, and the intent check fails closed.

## Channel3
- `GET /v1/search` with `x-api-key` returns products with offers from several retailers. Free tier: 1,000 searches a month, so results are cached on disk with a snapshot fallback.

## Prompt injection (indirect)
- The attack: content the agent *reads* (web page, listing, email) contains instructions. The agent can't reliably tell data from commands. ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/))
- Defense pattern used here: **don't let the model that read untrusted content hold the payment capability.** A separate guard + deterministic policy decides, and AI signals can only raise risk.

## Design choices worth remembering
- Deterministic policy first, AI second → explainable verdicts, testable without a model.
- Every external dependency has an offline fallback → demo never dies on bad wifi or missing keys.
