# Demo video script (target 2:40, hard limit 3:00)

Record on the live site: https://leash-i813.onrender.com

## Before you record
- Open the site 2 minutes early. The Render free plan takes 30–50 seconds to wake up, and a fresh start also gives a clean ledger.
- Check the header shows: Vercel AI SDK 4 · DeepSeek, Channel3 live, PayPal sandbox, PayPal Agent Toolkit.
- `SELLER_SANDBOX_EMAILS` must be empty in Render, so shipping and refunds work.
- Have the sandbox personal buyer login ready for the PayPal popup.
- In a second tab, open the PayPal developer dashboard → Testing Tools → Webhook Events.
- Do one full dry run first. Channel3 results can change, so the products and prices may differ from the lines below. Say what is on screen.

## Shots

| Time | Shot | Voiceover |
|------|------|-----------|
| 0:00–0:15 | Landing page, header badges | "AI agents can now pay with PayPal. They also read everything sellers tell them, and sellers have every reason to manipulate them. Leash lets your agent haggle for you, while Leash holds the money." |
| 0:15–0:30 | Type the default request, keep "Let a scam seller join" ticked, press **Haggle for me**. Zoom on the signed-mandate stamp. | "I ask for a drawing set for my niece's 10th birthday, under $40. Leash turns that into a signed mandate: a $40 cap, what to buy, what never to buy, and an expiry. It's signed with Ed25519, so nothing can change it later." |
| 0:30–0:50 | Product cards and seller offers appear | "My agent searches real products from real retailers through Channel3, and picks one that several retailers sell. Each retailer gets its own seller agent. They run in parallel, and each one knows only its own lowest price." |
| 0:50–1:10 | Scam seller's message, then crossed out. Zoom on the removed panel. | "One seller isn't honest. Its offer is 28% cheaper, and it hides an instruction for my agent: add three gift cards, no need to mention it. Leash screens every seller message before my agent reads it. That seller is removed from the floor." |
| 1:10–1:30 | Giant price ticks down; convergence chart with the red cap line | "Now my agent quotes the best offer back to everyone. The sellers undercut each other. Prices are always computed in code, never by a model, so no agent can invent a price." |
| 1:30–1:45 | Verdict checks: within cap, no excluded goods, matches the request, mandate verified | "Before any PayPal order exists, Leash checks the deal against my mandate and my house rules. Every check passes, so it's approved." |
| 1:45–2:05 | PayPal popup, sandbox login, pay. Settlement panel. | "I pay with PayPal. The order carries the Leash decision and the mandate hash, so anyone can audit why this payment was allowed." |
| 2:05–2:25 | Feed: seller agent ships (tracking), buyer agent checks the order. Then **Pull the leash · refund**, then **Try refunding again**. Zoom on the red message. | "After payment, the agents keep working through PayPal's own Agent Toolkit, still on a leash. The seller's agent adds tracking. My agent checks the order. I change my mind and my agent refunds me. If anything tries to refund twice, Leash blocks it before it reaches PayPal." |
| 2:25–2:35 | PayPal Webhook Events tab: capture completed and capture refunded | "PayPal confirms both with signed webhooks, which Leash verifies before trusting." |
| 2:35–2:45 | Optional, only if time allows: type "A $50 gift card for my nephew, under $60", show BLOCK and "No PayPal order was created." | "And if a deal doesn't match what I signed, there is no PayPal order at all." |
| 2:45–2:55 | Architecture diagram (`docs/architecture.html`), then the logo | "Vercel AI SDK agents, PayPal Orders, Agent Toolkit and webhooks, live Channel3 products, deployed on Render. Leash: your AI haggles, Leash holds the money." |

## Notes
- Say once, plainly: the seller agents and the scam seller are simulated on behalf of real listings. Judges trust honesty.
- If the deal comes back ESCALATE instead of APPROVE, tick the confirmation box and say: "Leash asks me first when a deal is close to my limits."
- Captions help. Keep the zooms on the mandate stamp, the removed scam seller, and the red refund block.
