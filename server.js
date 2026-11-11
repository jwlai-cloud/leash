import express from 'express';
import { randomUUID } from 'node:crypto';
import { DEFAULT_POLICY, evaluate } from './src/policy.js';
import { aiMode, aiModel, aiBudget } from './src/ai.js';
import { negotiate } from './src/negotiate.js';
import { productsMode } from './src/channel3.js';
import { verifyMandate, publicKeyPem } from './src/mandate.js';
import { createOrder, captureOrder, paypalMode, paypalClientId, payeeFor, verifyWebhook, webhookId } from './src/paypal.js';
import { settle, refund } from './src/settle.js';
import { agentRuntime } from './src/agents.js';
import { toolkitMode } from './src/leash-tools.js';

// ponytail: in-memory state, restart = reset. The house rules are fixed; spend is tracked per visitor
// (random id from the browser) so one visitor's payments can't use up another's budget. Real sign-in + DB if it goes multi-user.
const policy = { ...DEFAULT_POLICY };
const decisions = new Map(); // decisionId -> decision
const orders = new Map(); // paypal orderId -> decisionId
const ledger = [];
const visitor = (req) => String(req.get('x-leash-visitor') || req.ip).slice(0, 64);
const pending = new Map(); // visitor -> captures in flight, so parallel captures can't jointly overrun the budget
const spent = (v) => ledger.reduce((s, e) => s + (e.visitor === v ? e.amount : 0), 0) + (pending.get(v) || 0);
// Verdicts are re-run at order and capture time, against the visitor's spend at that moment.
const recheck = (d) => evaluate({ cart: d.cart, policy, spentThisMonth: spent(d.visitor), signals: d.signals, mandate: d.mandate });

const app = express();
const webhooks = []; // last verified PayPal events, newest first

// PayPal webhooks: mounted before the small global JSON limit; trusted only after PayPal verifies the signature.
app.post('/api/paypal/webhook', express.json({ limit: '200kb' }), async (req, res) => {
  let ok = false;
  try { ok = await verifyWebhook(req.headers, req.body); } catch (e) { console.warn('webhook verify failed:', e.message); }
  if (!ok) return res.status(400).json({ error: 'Signature not verified.' });
  const ev = req.body;
  const r = ev.resource || {};
  // Captures carry the order id; refunds only link "up" to their capture.
  const upCapture = r.links?.find((l) => l.rel === 'up')?.href?.split('/captures/')[1];
  const orderId = r.supplementary_data?.related_ids?.order_id
    || [...decisions.values()].find((x) => upCapture && x.captured?.captureId === upCapture)?.orderId || null;
  webhooks.unshift({ at: new Date().toISOString(), type: ev.event_type, id: ev.id, resourceId: r.id, orderId, status: r.status });
  webhooks.length = Math.min(webhooks.length, 50);
  const d = decisions.get(orders.get(orderId));
  if (d) (d.webhooks ||= []).push(ev.event_type);
  res.sendStatus(200); // any 2xx stops PayPal retrying
});
app.get('/api/webhooks', (_req, res) => res.json({ configured: Boolean(webhookId), events: webhooks.slice(0, 20) }));

app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

const stream = (res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  return (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
};

// ponytail: best-effort per-IP limiter on the paid AI route; set a provider spend cap too.
const hits = new Map();
const limit = (req, res, next) => {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 15) return res.status(429).json({ error: 'Slow down: 15 requests/minute.' });
  hits.set(req.ip, [...recent, now]);
  next();
};

app.get('/api/config', (_req, res) =>
  res.json({ aiMode, aiModel, aiBudget: aiBudget.status(), agentRuntime, toolkitMode, productsMode, paypalMode, paypalClientId, webhooks: Boolean(webhookId), policy }));

// Live negotiation as a server-sent event stream; the final verdict becomes a payable decision.
app.post('/api/negotiate', limit, async (req, res) => {
  const request = String(req.body?.request || '').trim().slice(0, 300);
  if (!request) return res.status(400).json({ error: 'Tell your agent what to buy.' });
  const send = stream(res);
  const t0 = Date.now();
  try {
    for await (const e of negotiate({ request, includeScam: req.body?.includeScam !== false, policy, spentThisMonth: spent(visitor(req)) })) {
      if (e.type !== 'verdict') { send({ ...e, t: Date.now() - t0 }); continue; }
      const id = `dec_${randomUUID().slice(0, 8)}`;
      decisions.set(id, { id, visitor: visitor(req), at: new Date().toISOString(), request, cart: e.cart, total: e.total, verdict: e.verdict, mandate: e.mandate,
        signals: { injections: [], drift: e.drift } });
      send({ type: 'verdict', id, verdict: e.verdict, score: e.score, total: e.total, reasons: e.reasons, drift: e.drift, listPrice: e.listPrice,
        payee: e.cart[0] ? payeeFor(e.cart[0].merchant) : null, mandateValid: e.mandate ? verifyMandate(e.mandate) : false, t: Date.now() - t0 });
    }
  } catch (err) {
    console.error('negotiate failed:', err);
    send({ type: 'error', message: 'Negotiation stopped: ' + err.message });
  }
  res.end();
});

app.get('/api/mandate-key', (_req, res) => res.type('text/plain').send(publicKeyPem));

app.post('/api/orders', async (req, res) => {
  const d = decisions.get(req.body?.decisionId);
  if (!d) return res.status(404).json({ error: 'Unknown decision.' });
  if (d.orderId) return res.json({ id: d.orderId }); // PayPal button may call twice
  const v = recheck(d);
  if (v.verdict === 'BLOCK') return res.status(403).json({ error: `Leash blocked this purchase. ${v.reasons[0]?.message || ''}` });
  // ponytail: `confirm` is self-asserted by the single local user's UI; per-user auth + signed confirm token if multi-user
  if (v.verdict === 'ESCALATE' && req.body?.confirm !== true)
    return res.status(409).json({ error: 'Human confirmation required.' });
  d.confirmed = req.body?.confirm === true;
  try {
    const order = await createOrder(d);
    d.orderId = order.id;
    orders.set(order.id, d.id);
    res.json({ id: order.id, status: order.status });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/orders/:id/capture', async (req, res) => {
  const d = decisions.get(orders.get(req.params.id));
  if (!d) return res.status(404).json({ error: 'Order not created by Leash.' });
  if (d.captured) return res.json(d.captured);
  if (d.capturing) return res.status(409).json({ error: 'Capture already in progress.' });
  // Policy/budget can change between decision and capture: re-run the full policy, counting in-flight captures.
  const v = recheck(d);
  if (v.verdict === 'BLOCK') return res.status(403).json({ error: `Blocked at capture. ${v.reasons[0]?.message || ''}` });
  if (v.verdict === 'ESCALATE' && !d.confirmed) return res.status(409).json({ error: 'Policy changed: human confirmation required.' });
  d.capturing = true;
  pending.set(d.visitor, (pending.get(d.visitor) || 0) + d.total);
  try {
    const cap = await captureOrder(req.params.id);
    if (cap.status !== 'COMPLETED') return res.status(402).json({ error: `Capture status ${cap.status}` });
    const captureId = cap.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
    d.captured = { id: cap.id, captureId, status: cap.status, payer: cap.payer?.email_address || null };
    ledger.unshift({ visitor: d.visitor, at: new Date().toISOString(), decisionId: d.id, orderId: cap.id, captureId, amount: d.total, items: d.cart.map((i) => `${i.qty}× ${i.name}`).join(', '), verdict: d.verdict });
    res.json(d.captured);
  } catch (e) {
    res.status(502).json({ error: e.message });
  } finally {
    d.capturing = false;
    pending.set(d.visitor, pending.get(d.visitor) - d.total);
  }
});

// The paid deal as the toolkit leash sees it.
const paidOrder = (d) => (d.paid ||= { orderId: d.orderId, captureId: d.captured.captureId, total: d.total, seller: d.cart[0]?.merchant, refunded: 0 });

// After capture: seller agent ships, buyer agent verifies, both via the leashed PayPal Agent Toolkit.
app.post('/api/orders/:id/settle', limit, async (req, res) => {
  const d = decisions.get(orders.get(req.params.id));
  if (!d?.captured?.captureId) return res.status(404).json({ error: 'No captured Leash order.' });
  if (d.settled) return res.status(409).json({ error: 'Already settled.' });
  d.settled = true;
  const send = stream(res);
  try { for await (const e of settle(paidOrder(d))) send(e); } catch (e) { console.error('settle failed:', e); send({ type: 'error', message: e.message }); }
  res.end();
});

// "Pull the leash": your agent asks PayPal for your money back, within what Leash allows.
app.post('/api/orders/:id/refund', limit, async (req, res) => {
  const d = decisions.get(orders.get(req.params.id));
  if (!d?.captured?.captureId) return res.status(404).json({ error: 'No captured Leash order.' });
  if (d.refunding) return res.status(409).json({ error: 'Refund already in progress.' });
  d.refunding = true;
  const send = stream(res);
  try {
    for await (const e of refund(paidOrder(d), String(req.body?.reason || '').slice(0, 200))) {
      if (e.type === 'refunded' && e.ok) ledger.unshift({ visitor: d.visitor, at: new Date().toISOString(), decisionId: d.id, orderId: d.orderId, amount: -e.amount, items: `Refund · ${d.cart[0]?.name || ''}`, verdict: 'REFUND' });
      send(e);
    }
  } catch (e) { console.error('refund failed:', e); send({ type: 'error', message: e.message }); }
  finally { d.refunding = false; }
  res.end();
});

app.get('/api/ledger', (req, res) => {
  const v = visitor(req);
  res.json({ spent: spent(v), budget: policy.monthlyBudget, entries: ledger.filter((e) => e.visitor === v).map(({ visitor: _, ...e }) => e) });
});

app.get('/api/decisions', (_req, res) => res.json([...decisions.values()].reverse().slice(0, 20)));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Leash on http://localhost:${port}  (AI: ${aiMode}, PayPal: ${paypalMode})`));
