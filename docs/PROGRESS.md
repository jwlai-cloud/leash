# Progress

## 2026-11-09 — negotiation floor

### Done
- Pivot to agent-to-agent negotiation ([ADR 0005](adr/0005-negotiation-floor-pivot.md)); design direction 2 "Price pit" chosen ([design-demos](../design-demos/direction-approved.md)).
- Real APIs verified end to end: DeepSeek V4.1 Flash via OpenRouter, Channel3 live search, PayPal sandbox order creation. Negotiation takes about 6–10s.
- Signed mandate, seller-message screening, price engine, policy rework, payee routing.
- `npm test` 16/16. `npm run smoke` 2/2 against real APIs (twice).

### Not verified yet
- **Captured payment through the UI.** PayPal orders are created; the buyer login in the popup and capture haven't been done since the rebuild.
- **Payee routing.** `SELLER_SANDBOX_EMAILS` is not set yet, so payments go to the app's own sandbox merchant.
- Mobile layout of the new UI.

### Next (priority order)
1. Owner: complete one PayPal checkout in the UI; create 2–3 sandbox business accounts and set `SELLER_SANDBOX_EMAILS`.
2. Public GitHub repo (owner OK needed), deploy to Render with keys.
3. Record the video from [DEMO_SCRIPT.md](DEMO_SCRIPT.md) (update for the negotiation floor); upload to YouTube early.
4. Devpost write-up from [SUBMISSION.md](SUBMISSION.md) (update for the pivot); select Channel3 and Render as sponsor tools. Deadline Thu 12 Nov, 12:00 PST.

### Known limits (deliberate)
- Seller agents simulated per real listing; scam seller simulated. Labelled in the UI and README.
- No auth, in-memory state.
