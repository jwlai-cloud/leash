// After the money moves: agents act through PayPal's Agent Toolkit, on a leash.
// The winning seller's agent marks the order shipped; your agent verifies the order;
// on request, your agent refunds. Every toolkit call is checked by leashedTools first.
import { randomInt } from 'node:crypto';
import { runAgent } from './agents.js';
import { leashedTools, toolSource } from './leash-tools.js';

const usd = (n) => `$${Number(n).toFixed(2)}`;
const toolEvent = (a) => ({ type: 'tool', via: toolSource(a.tool), tool: a.tool, allowed: a.allowed, reason: a.reason || null, args: a.args, result: a.result || null });

// Run an agent with leashed tools. If the model doesn't make the call, Leash makes the same
// call through the same leash (never twice: skipped when the tool already ran).
async function act({ who, role, order, toolName, system, prompt, args, refundRequested = false, done }) {
  const audit = [];
  const tools = leashedTools([toolName], { role, order, refundRequested }, (a) => audit.push(a));
  const r = await runAgent({
    system, prompt, tools, maxSteps: 3, maxTokens: 200,
    fallback: async (already) => {
      if (!already.includes(toolName) && !audit.length) await tools[toolName].execute(args, {});
      return { text: done };
    },
  });
  if (!audit.length && r.source === 'ai-sdk') await tools[toolName].execute(args, {}); // model replied without calling the tool
  return { who, text: r.text || done, source: r.source, audit };
}

export async function* settle(order) {
  const tracking = `9400${String(randomInt(1e9, 1e10))}${String(randomInt(1e7, 1e8))}`.slice(0, 22);
  const ship = await act({
    who: order.seller, role: 'seller', order, toolName: 'add_order_tracking',
    system: `You are the sales agent for ${order.seller}. The buyer has paid through PayPal. Mark the order shipped by calling add_order_tracking, then confirm to the buyer in one short sentence.`,
    prompt: `PayPal order_id: ${order.orderId}\nPayPal capture_id: ${order.captureId}\nCarrier: USPS\nTracking number: ${tracking}`,
    args: { order_id: order.orderId, capture_id: order.captureId, tracking_number: tracking, carrier: 'USPS' },
    done: `Shipped with USPS, tracking ${tracking}.`,
  });
  for (const a of ship.audit) yield toolEvent(a);
  yield { type: 'agent', who: order.seller, role: 'seller', text: ship.text, source: ship.source, tracking };

  const verify = await act({
    who: 'Your agent', role: 'buyer', order, toolName: 'get_order',
    system: 'You are the buyer\'s agent. Check the order with get_order and confirm, in one short sentence, its status and that the amount matches the agreed price.',
    prompt: `PayPal order id: ${order.orderId}\nAgreed price: ${usd(order.total)} with ${order.seller}`,
    args: { id: order.orderId },
    done: `Order ${order.orderId} checked: ${usd(order.total)} paid to ${order.seller}.`,
  });
  for (const a of verify.audit) yield toolEvent(a);
  yield { type: 'agent', who: 'Your agent', role: 'buyer', text: verify.text, source: verify.source };
}

export async function* refund(order, reason) {
  const left = Math.round((order.total - (order.refunded || 0)) * 100) / 100;
  const res = await act({
    who: 'Your agent', role: 'buyer', order, toolName: 'create_refund', refundRequested: true,
    system: 'You are the buyer\'s agent. The buyer asked for their money back. Call create_refund for the full remaining amount, then confirm in one short sentence.',
    prompt: `PayPal capture_id: ${order.captureId}\nRemaining refundable: ${usd(left)} USD\nBuyer's reason: ${String(reason || 'changed my mind').slice(0, 200)}`,
    args: { capture_id: order.captureId, amount: { currency_code: 'USD', value: left.toFixed(2) }, note_to_payer: 'Refund requested through Leash' },
    done: `Refund of ${usd(left)} requested from PayPal.`,
  });
  for (const a of res.audit) yield toolEvent(a);
  const ok = res.audit.find((a) => a.allowed);
  let amount = 0;
  if (ok) {
    amount = ok.args.amount ? Number(ok.args.amount.value) : left;
    order.refunded = Math.round(((order.refunded || 0) + amount) * 100) / 100;
  }
  yield { type: 'agent', who: 'Your agent', role: 'buyer', text: ok ? res.text : 'Leash refused the refund.', source: res.source };
  yield { type: 'refunded', amount, ok: Boolean(ok) };
}
