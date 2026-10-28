// Hard cap on model spend for dev/testing. Persisted to disk so restarts don't reset it.
// reserve() books worst-case cost BEFORE a call (so concurrent calls can't overshoot);
// settle() swaps the reservation for real usage after. Over cap -> caller falls back to rules.
import { readFileSync, writeFileSync } from 'node:fs';

export function createBudget({ file, limitUsd, pricePerMTokIn, pricePerMTokOut }) {
  let state = { spentUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
  try { state = { ...state, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const cost = (inTok, outTok) => (inTok * pricePerMTokIn + outTok * pricePerMTokOut) / 1e6;
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const save = () => { try { writeFileSync(file, JSON.stringify(state, null, 2)); } catch (e) { console.warn('budget save failed:', e.message); } };

  return {
    // ponytail: chars/3 over-estimates tokens on purpose; tokenizer endpoint if precision matters
    // Returns the reserved amount, or null if it would cross the cap.
    reserve(promptChars, maxOutputTokens) {
      const worst = cost(Math.ceil(promptChars / 3), maxOutputTokens);
      if (state.spentUsd + worst > limitUsd) return null;
      state.spentUsd = round(state.spentUsd + worst);
      return worst;
    },
    // usage = API usage block; omit it when the call was never billed (to release the reservation).
    // If billing is unknown (call errored after send), callers skip settle and keep the worst case booked.
    settle(reserved, usage = { input_tokens: 0, output_tokens: 0 }) {
      const i = usage.input_tokens || 0, o = usage.output_tokens || 0;
      state.inputTokens += i; state.outputTokens += o;
      if (i || o) state.calls += 1;
      state.spentUsd = round(Math.max(0, state.spentUsd - reserved + cost(i, o)));
      save();
    },
    status: () => ({ ...state, limitUsd, exhausted: state.spentUsd >= limitUsd }),
  };
}
