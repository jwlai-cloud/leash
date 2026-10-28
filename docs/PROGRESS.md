# Progress

## 2026-10-28 — session 1 (MVP)

### Done
- Rules read, idea brainstormed + audited ([BRAINSTORM.md](BRAINSTORM.md)). Pick: Leash.
- Policy engine + tests, AI agent/guard (Claude **or** Gemini, [ADR 0003](adr/0003-gemini-provider.md)) with rule fallbacks, PayPal Orders v2 create/capture with simulated fallback.
- $20 dev/test AI spend cap with pre-call reservation, persisted ([ADR 0002](adr/0002-ai-spend-cap.md)).
- Single-page UI: policy, agent → guard → verdict → pay pipeline, ledger. Mobile layout checked.
- Code review pass: fixed capture race, parallel-capture budget overrun, verdict re-check at order + capture, duplicate-SKU qty bypass, fail-open drift parsing, regex/model target merge, SKU-mention heuristic, budget reservation.
- Verified in browser (rules + simulated mode): approve→pay, escalate→confirm→pay, red-team→block, policy tightened after approval→blocked. `npm test` 9/9. Gemini request/parse verified against a local mock.

### Not verified yet
- **No real LLM call yet.** No API key in dev env. Every browser run so far used the rules fallback.
- **No real PayPal sandbox checkout yet.** No sandbox keys in dev env.

### Next (priority order)
1. Put `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) + PayPal sandbox keys in `.env`, restart, run the 4 demo prompts; fix whatever breaks. Check latency vs the 25s timeout.
2. Set provider-side spend limit.
3. Push to public GitHub repo; deploy to Render (bonus prize).
4. Record demo video per [DEMO_SCRIPT.md](DEMO_SCRIPT.md); write Devpost story (`hackathon-submission` skill).

### Known limits (deliberate)
- No auth: single-user demo; anyone reaching the server can edit policy and send `confirm:true`. Judges need to edit policy. Add per-user auth + signed confirm token before any multi-user use.
- In-memory state; restart resets ledger.
- Regex guard misses paraphrased injections; model guard covers those when a key is set.

### Open questions
- With a real model in non-red-team mode, will the agent still pick the peony listing? If not, the "Needs you" beat changes; red-team beat still works.
