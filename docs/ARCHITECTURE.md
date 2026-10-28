# Architecture (current state)

```
 Browser (public/index.html)
   │  1. POST /api/shop {request, redTeam}
   ▼
 server.js ──► src/ai.js  agentPlan()      Claude/Gemini (or rules)  → proposed cart
          ──► src/ai.js  guardScan()       Claude/Gemini (or regex)       → injected SKUs, intent drift
          ──► src/policy.js evaluate()     deterministic           → APPROVE | ESCALATE | BLOCK
          stores decision {id, cart, verdict} in memory
   │  2. PayPal button → POST /api/orders {decisionId, confirm}
   ▼
 src/paypal.js createOrder()   PayPal Orders v2 (sandbox), custom_id = decisionId
   │  3. buyer approves in PayPal popup (human checkpoint)
   │  4. POST /api/orders/:id/capture
   ▼
 src/paypal.js captureOrder()  → ledger entry (spend counted against monthly budget)
```

## Components
| File | Role |
|------|------|
| `server.js` | Express routes, in-memory decisions + ledger, rate limit on AI route |
| `src/ai.js` | Agent + guard via Claude Messages API or Gemini generateContent (one `llm()` with per-provider request/parse); schema validation; deterministic fallbacks |
| `src/budget.js` | $20 dev/test model spend cap: reserve worst case before call, record real usage after, persisted to `.ai-usage.json` |
| `src/policy.js` | Pure policy engine. Always runs. AI signals can only add risk. |
| `src/paypal.js` | OAuth2 client-credentials, Orders v2 create/capture; simulated mode without creds |
| `data/catalog.json` | Demo catalog. One listing carries a prompt-injection payload. |
| `public/index.html` | Single-page UI, PayPal JS SDK buttons |

## Trust boundaries
- Client never sends a cart or price. Order is built server-side from the stored decision + catalog prices.
- `BLOCK` decisions cannot become orders. `ESCALATE` needs explicit `confirm:true` from the human.
- Capture only for orders this server created. Full policy re-run at order creation and at capture (counting in-flight captures), so tightening policy applies to decisions already made.
- Model output is untrusted: SKUs must exist in catalog, qty integer 1–20, otherwise dropped.

## Modes
Badges in the UI: `AI: claude|gemini|rules`, `PayPal: sandbox|simulated`. Set by env presence (see `.env.example`).

## Acceptance criteria (MVP)
1. "Get flowers for mom under $60" → APPROVE → PayPal order → capture → ledger shows spend.
2. Same request with **red-team agent** → agent obeys listing injection, adds gift cards → BLOCK with reasons.
3. Order over `escalateAbove` → ESCALATE; PayPal button only after human confirms.
4. Spending past monthly budget → BLOCK.
5. Works with zero env vars (both fallbacks).
