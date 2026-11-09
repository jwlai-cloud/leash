import express from 'express';
import { randomUUID } from 'node:crypto';
import { DEFAULT_POLICY, evaluate } from './src/policy.js';
import { aiMode, aiModel, aiBudget } from './src/ai.js';
import { negotiate } from './src/negotiate.js';
import { productsMode } from './src/channel3.js';
import { verifyMandate, publicKeyPem } from './src/mandate.js';
import { createOrder, captureOrder, paypalMode, paypalClientId, payeeFor } from './src/paypal.js';

// ponytail: in-memory state, single demo user. Restart = reset. SQLite if multi-user ever matters.
let policy = { ...DEFAULT_POLICY };
const decisions = new Map(); // decisionId -> decision
const orders = new Map(); // paypal orderId -> decisionId
const ledger = [];
const spent = () => ledger.reduce((s, e) => s + e.amount, 0);
let pendingUsd = 0; // captures in flight, so parallel captures can't jointly overrun the budget
// Verdicts are re-run at order and capture time: tightening policy applies to decisions already made.
const recheck = (d) => evaluate({ cart: d.cart, policy, spentThisMonth: spent() + pendingUsd, signals: d.signals, mandate: d.mandate });

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

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
  res.json({ aiMode, aiModel, aiBudget: aiBudget.status(), productsMode, paypalMode, paypalClientId, policy, spent: spent() }));

app.put('/api/policy', (req, res) => {
  const b = req.body || {};
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  policy = {
    maxPerOrder: num(b.maxPerOrder, policy.maxPerOrder),
    escalateAbove: num(b.escalateAbove, policy.escalateAbove),
    monthlyBudget: num(b.monthlyBudget, policy.monthlyBudget),
    maxQtyPerItem: num(b.maxQtyPerItem, policy.maxQtyPerItem),
  };
  res.json(policy);
});

// Live negotiation as a server-sent event stream; the final verdict becomes a payable decision.
app.post('/api/negotiate', limit, async (req, res) => {
  const request = String(req.body?.request || '').trim().slice(0, 300);
  if (!request) return res.status(400).json({ error: 'Tell your agent what to buy.' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const t0 = Date.now();
  try {
    for await (const e of negotiate({ request, includeScam: req.body?.includeScam !== false, policy, spentThisMonth: spent() + pendingUsd })) {
      if (e.type !== 'verdict') { send({ ...e, t: Date.now() - t0 }); continue; }
      const id = `dec_${randomUUID().slice(0, 8)}`;
      decisions.set(id, { id, at: new Date().toISOString(), request, cart: e.cart, total: e.total, verdict: e.verdict, mandate: e.mandate,
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
  pendingUsd += d.total;
  try {
    const cap = await captureOrder(req.params.id);
    if (cap.status !== 'COMPLETED') return res.status(402).json({ error: `Capture status ${cap.status}` });
    d.captured = { id: cap.id, status: cap.status, payer: cap.payer?.email_address || null };
    ledger.unshift({ at: new Date().toISOString(), decisionId: d.id, orderId: cap.id, amount: d.total, items: d.cart.map((i) => `${i.qty}× ${i.name}`).join(', '), verdict: d.verdict });
    res.json(d.captured);
  } catch (e) {
    res.status(502).json({ error: e.message });
  } finally {
    d.capturing = false;
    pendingUsd -= d.total;
  }
});

app.get('/api/ledger', (_req, res) => res.json({ spent: spent(), budget: policy.monthlyBudget, entries: ledger }));

app.get('/api/decisions', (_req, res) => res.json([...decisions.values()].reverse().slice(0, 20)));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Leash on http://localhost:${port}  (AI: ${aiMode}, PayPal: ${paypalMode})`));
