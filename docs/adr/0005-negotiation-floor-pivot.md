# ADR 0005 — Pivot to a negotiation floor with signed mandates

Status: Accepted (2026-11-09, owner answered "yes to all as you recommend")

## Context
A single shopping agent with a PayPal checkout will be common among entries. The hackathon resources name agent-to-agent negotiation and settlement as an inspiration. Deadline Thu 12 Nov 12:00 PST.

## Decisions
1. **Name:** keep "Leash". Main screen is the "Negotiation floor". Tagline: "Your AI haggles. Leash holds the money."
2. **Seller agents:** real Channel3 products and list prices; seller agents are simulated per listing with a hidden floor price. The UI says so: "Seller agents simulated for real listings. In production, shops plug in their own agent."
3. **Payee:** Orders v2 `payee` set to the winning seller's own PayPal sandbox business account (multi-party), not the Leash account.
4. **Mandate:** the user's request becomes an Ed25519-signed mandate (cap, goods, exclusions, expiry). Its hash goes in the PayPal order `custom_id`.
5. **Old UI:** replaced, not kept beside the new screen.
6. **Design:** huashu-design light gate: three first-screen directions, owner picks one.

## Consequences
Owner creates 2–3 sandbox business accounts and a Channel3 key. Channel3 free tier is 1,000 searches/month; results are cached. Policy engine, guard, budget cap and PayPal client are reused.
