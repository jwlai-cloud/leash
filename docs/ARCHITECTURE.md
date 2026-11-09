# Architecture (current state)

```
 Browser (public/index.html, "Price pit" UI)
   │ POST /api/negotiate {request, includeScam}   ← server-sent event stream
   ▼
 server.js ─► src/negotiate.js
                1. mandate     src/mandate.js   cap parsed from user's words, Ed25519-signed
                2. search      src/channel3.js  real products + retailer offers (cached)
                3. pick        buyer agent (LLM) chooses product with competing retailers
                4. open        seller agents (LLM words, code prices) + optional simulated scam seller
                5. screen      src/ai.js screenMessages: regex + LLM; flagged sellers removed
                6. counter     buyer agent quotes best price; sellers concede toward hidden floors
                7. deal        lowest price wins
                8. verdict     src/ai.js checkDrift + src/policy.js evaluate → APPROVE | ESCALATE | BLOCK
   │ PayPal JS SDK button → POST /api/orders {decisionId, confirm}
   ▼
 src/paypal.js createOrder   Orders v2 sandbox; payee = winning seller's sandbox account; custom_id = decision:mandate-hash
   │ buyer approves in PayPal popup → POST /api/orders/:id/capture → ledger
```

## Components
| File | Role |
|------|------|
| `server.js` | Express routes, SSE stream, in-memory decisions + ledger, rate limit, policy re-check at order and capture |
| `src/negotiate.js` | The negotiation floor. Async generator of events. All prices computed here. |
| `src/mandate.js` | Parse cap, sign/verify mandate (Ed25519, key in `.leash-mandate-key.pem`) |
| `src/channel3.js` | Channel3 `/v1/search`, normalise, disk cache `.channel3-cache.json`, snapshot fallback |
| `src/ai.js` | LLM providers (OpenRouter default, Claude, Gemini, Vertex), `ask` with rules fallback, `screenMessages`, `checkDrift` |
| `src/budget.js` | $20 AI spend cap: reserve worst case, settle with billed cost |
| `src/policy.js` | Pure policy: mandate cap/expiry/never-list, house caps, budget, injected items, drift |
| `src/paypal.js` | OAuth2, Orders v2 create (payee, custom_id) and capture, idempotency keys |
| `public/index.html` | Single page UI, design direction 2 (see `design-demos/`) |

## Trust boundaries
- **Prices:** decided in code from Channel3 offers and seller floors. Model text never sets a price; a reply missing the engine price gets it appended.
- **Mandate:** cap comes from the user's words. The model may only echo exclusions the user wrote. Signed, verified before payment.
- **Seller messages:** screened before the buyer agent reads them. Flagged sellers are removed from the floor.
- **Client:** never sends a cart or price. Orders are built from the stored decision. `BLOCK` cannot become an order; `ESCALATE` needs `confirm:true`. Policy re-runs at order and capture.
- **Model output:** schema-checked, IDs whitelisted, drift fails closed.
- **Floors:** never sent to the browser.

## Modes (badges in header)
AI model or `rules`, `Channel3 live` or `snapshot`, `PayPal sandbox` or `simulated`. Set by env (see `.env.example`).

## Honest limits
- Seller agents are simulated on behalf of real listings. Retailers don't run agents yet.
- In-memory state; restart resets the ledger. Single user, no auth.
