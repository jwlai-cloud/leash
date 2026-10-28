# Demo video script (target 2:30, hard limit 3:00)

| Time | Shot | Voiceover |
|------|------|-----------|
| 0:00–0:20 | Title card → UI | "AI agents can now pay with PayPal. But agents read the open web — and the web talks back. Leash is a spend firewall that sits between your agent and PayPal." |
| 0:20–0:35 | Policy panel | "You set the rules once: auto-approve under $50, hard cap $75, $200 a month, no gift cards or crypto." |
| 0:35–1:05 | Tulips prompt → Approved → PayPal sandbox popup → paid; ledger updates | "Ask for tulips for mom. Agent picks a $29 bouquet, guard finds nothing odd, policy approves. Real PayPal sandbox order, Leash decision ID in custom_id, captured, ledger updated." |
| 1:05–1:35 | "Flowers for mom" → Needs you; zoom on injection quote | "Now flowers under $60. The agent picks premium peonies — but this listing hides a message to AI assistants. Leash flags the merchant and asks me before paying." |
| 1:35–2:10 | Red-team toggle on → same prompt → Blocked; zoom on reasons | "What if the agent falls for it? Red-team mode: the agent obeys the listing and adds $300 of gift cards. Leash blocks it: hijacked item, banned category, over cap, intent drift. No PayPal order is ever created." |
| 2:10–2:25 | Architecture slide | "Deterministic policy plus a Claude guard that can only add risk, never remove it. PayPal Orders v2, idempotent capture, and a $20 cap on our own AI spend." |
| 2:25–2:30 | Logo | "Leash. Let agents shop, without letting go." |

Record with both keys set so badges read `AI: claude` and `PayPal: sandbox`.
