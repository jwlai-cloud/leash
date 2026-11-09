// Agent runtime: Vercel AI SDK (v4, the version PayPal's Agent Toolkit is built on) over OpenRouter.
// Every run is charged against the same $20 budget as the rest of the app.
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { aiBudget } from './ai.js';

const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4.1-flash';
// Reasoning off: short agent turns, and thinking tokens ate the budget (see ADR 0006).
const openrouter = KEY ? createOpenRouter({ apiKey: KEY, extraBody: { reasoning: { enabled: false } } }) : null;
export const agentRuntime = openrouter ? `Vercel AI SDK 4 · ${MODEL}` : 'rules (no OPENROUTER_API_KEY)';

// Run one agent turn (possibly several tool steps). `fallback` runs when there is no model,
// the budget is spent, or the model fails; it receives whatever tool calls already happened
// so it never repeats one (a refund must not run twice).
export async function runAgent({ system, prompt, tools, maxSteps = 3, maxTokens = 300, fallback }) {
  const steps = [];
  if (openrouter) {
    const reserved = aiBudget.reserve(system.length + prompt.length * maxSteps + 1500, maxTokens * maxSteps);
    if (reserved !== null) {
      try {
        const r = await generateText({
          model: openrouter.chat(MODEL, { usage: { include: true } }),
          system, prompt, tools, maxSteps, maxTokens, temperature: 0,
          abortSignal: AbortSignal.timeout(30_000),
          onStepFinish: (s) => steps.push(...(s.toolCalls || []).map((c) => c.toolName)),
        });
        const cost = r.providerMetadata?.openrouter?.usage?.cost;
        aiBudget.settle(reserved, { input_tokens: r.usage?.promptTokens || 0, output_tokens: r.usage?.completionTokens || 0, ...(Number.isFinite(cost) ? { cost_usd: cost } : {}) });
        return { text: String(r.text || '').slice(0, 400), toolsUsed: steps, source: 'ai-sdk' };
      } catch (e) {
        // Billing unknown after a failed call: keep the worst case reserved (fail safe).
        console.warn('agent fallback:', e.message);
      }
    }
  }
  const out = (await fallback?.(steps)) || { text: '' };
  return { ...out, toolsUsed: steps, source: 'rules' };
}
