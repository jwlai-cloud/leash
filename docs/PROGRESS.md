# Progress

## 2026-11-09 — negotiation floor

### Done
- Pivot to agent-to-agent negotiation ([ADR 0005](adr/0005-negotiation-floor-pivot.md)); design direction 2 "Price pit" chosen ([design-demos](../design-demos/direction-approved.md)).
- Real APIs verified end to end: DeepSeek V4.1 Flash via OpenRouter, Channel3 live search, PayPal sandbox order creation. Negotiation takes about 6–10s.
- Signed mandate, seller-message screening, price engine, policy rework, payee routing.
- `npm test` 16/16. `npm run smoke` 2/2 against real APIs (twice).
- Real sandbox checkout through the UI: order 0GT57263JN2666825, capture 18325377M69774702, $28.41 COMPLETED; `custom_id` carries decision + mandate hash (checked via PayPal API).

- Agent framework + leashed PayPal Agent Toolkit ([ADR 0006](adr/0006-agent-framework-and-paypal-agent-toolkit.md)): real sandbox `get_order` and `create_refund` (refund 5N1574911Y9259208) verified; second refund refused by Leash. Independent seller agents. Webhook endpoint with signature verification. `npm test` 20/20.

### Not verified yet
- Full settle flow on a fresh real capture through the UI (shipping on Orders v2 `/track`).
- Webhooks on a public URL (needs Render + `PAYPAL_WEBHOOK_ID`).
- **Payee routing.** `SELLER_SANDBOX_EMAILS` is not set yet, so payments go to the app's own sandbox merchant.
- Mobile layout of the new UI.

### Next (priority order)
1. Owner: create 2–3 sandbox business accounts and set `SELLER_SANDBOX_EMAILS` (payee routing).
2. Deploy to Render; register the webhook URL; set `PAYPAL_WEBHOOK_ID`. (Public repo done: github.com/jwlai-cloud/leash.)
3. Record the video from [DEMO_SCRIPT.md](DEMO_SCRIPT.md) (update for the negotiation floor); upload to YouTube early.
4. Devpost write-up from [SUBMISSION.md](SUBMISSION.md) (update for the pivot); select Channel3 and Render as sponsor tools. Deadline Thu 12 Nov, 12:00 PST.

### Known limits (deliberate)
- Seller agents simulated per real listing; scam seller simulated. Labelled in the UI and README.
- No auth, in-memory state.
