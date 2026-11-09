// PayPal Agent Toolkit tools, on a leash: every call an agent makes is checked by Leash first.
// Allowed calls run through PayPal's own toolkit (sandbox). Refused calls never reach PayPal;
// the agent gets the refusal back as the tool result, and the decision is audited.
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { tool } from 'ai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { addTracking } from './paypal.js';

const ID = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_CLIENT_SECRET;
export const toolkitMode = ID && SECRET ? 'paypal-agent-toolkit' : 'simulated';

const toolkit = toolkitMode === 'paypal-agent-toolkit'
  ? new PayPalAgentToolkit({
      clientId: ID,
      clientSecret: SECRET,
      configuration: {
        // Least privilege: only the actions Leash knows how to police.
        actions: { orders: { get: true }, payments: { createRefund: true } },
        context: { sandbox: true }, // toolkit defaults to LIVE PayPal without this
      },
    }).getTools()
  : null;

// Same tool names and argument shapes when no PayPal keys are set, so the demo flow still runs.
const simulated = {
  get_order: tool({ description: 'Retrieve the details of an order', parameters: z.object({ id: z.string() }),
    execute: async ({ id }) => JSON.stringify({ id, status: 'COMPLETED', simulated: true }) }),
  create_refund: tool({ description: 'Process a refund for a captured payment.', parameters: z.object({ capture_id: z.string(), amount: z.object({ currency_code: z.string(), value: z.string() }).optional(), note_to_payer: z.string().optional() }),
    execute: async ({ amount }) => JSON.stringify({ id: `SIMREF-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'COMPLETED', amount, simulated: true }) }),
};

// Leash's own shipping tool (Orders v2 /track): the toolkit's shipment tool needs a permission sandbox apps lack.
const addOrderTracking = tool({
  description: 'Add shipment tracking to a paid PayPal order (Orders v2).',
  parameters: z.object({ order_id: z.string(), capture_id: z.string(), tracking_number: z.string(), carrier: z.string() }),
  execute: async (a) => JSON.stringify(await addTracking({ orderId: a.order_id, captureId: a.capture_id, trackingNumber: a.tracking_number, carrier: a.carrier })),
});

const base = { ...(toolkit || simulated), add_order_tracking: addOrderTracking };
export const toolSource = (name) => (name === 'add_order_tracking' ? 'leash · orders v2' : toolkitMode);
const r2 = (n) => Math.round(n * 100) / 100;

// The rules. `order` is the Leash record of a paid deal; `role` is who is holding the tools.
export function checkToolCall(name, args, { role, order, refundRequested = false }) {
  if (!order) return 'No paid Leash order in scope.';
  if (name === 'get_order')
    return args.id === order.orderId ? null : `Order ${args.id} was not created by Leash for this deal.`;
  if (name === 'add_order_tracking') {
    if (role !== 'seller') return 'Only the winning seller can mark this order shipped.';
    if (args.order_id !== order.orderId || args.capture_id !== order.captureId) return 'Shipment must reference this deal\'s own PayPal order and capture.';
    return null;
  }
  if (name === 'create_refund') {
    if (role !== 'buyer') return 'Only your own agent can ask for your money back.';
    if (!refundRequested) return 'You did not ask for a refund.';
    if (args.capture_id !== order.captureId) return 'Refund must target this deal\'s own PayPal capture.';
    const left = r2(order.total - (order.refunded || 0));
    if (left <= 0) return 'This payment is already fully refunded.';
    const want = args.amount ? Number(args.amount.value) : left;
    if (!(want > 0) || r2(want) > left) return `A refund of $${want} is more than the $${left.toFixed(2)} left to refund.`;
    if (args.amount && args.amount.currency_code !== 'USD') return 'Refund currency must be USD.';
    return null;
  }
  return `Tool ${name} is not allowed on a Leash.`;
}

// Hand an agent only the named tools, each wrapped by checkToolCall. onAudit sees every call.
export function leashedTools(names, ctx, onAudit = () => {}) {
  const out = {};
  for (const name of names) {
    const t = base[name];
    if (!t) continue;
    out[name] = tool({
      description: t.description,
      parameters: t.parameters,
      execute: async (args, opts) => {
        const refusal = checkToolCall(name, args, ctx);
        if (refusal) {
          onAudit({ tool: name, args, allowed: false, reason: refusal });
          return JSON.stringify({ error: `Blocked by Leash: ${refusal}` });
        }
        const result = await t.execute(args, opts);
        onAudit({ tool: name, args, allowed: true, result: String(result).slice(0, 600) });
        return result;
      },
    });
  }
  return out;
}
