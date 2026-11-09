// Deterministic policy engine. Pure: same inputs -> same verdict.
// AI signals (injection, drift) can only ADD risk; nothing here can be talked out of a block.

export const DEFAULT_POLICY = {
  maxPerOrder: 75,
  escalateAbove: 50,
  monthlyBudget: 200,
  maxQtyPerItem: 3,
};

// Things that behave like cash: the classic scam payout. Matched against category + title.
const NEVER_PATTERNS = {
  'gift cards': /gift[\s-]?cards?|e-?gift|store credit|voucher/i,
  crypto: /crypto|bitcoin|\bbtc\b|ethereum/i,
  subscriptions: /subscription|membership|auto-?renew/i,
};

const WEIGHT = { block: 40, escalate: 20, info: 0 };

export const cartTotal = (cart) =>
  Math.round(cart.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;

export function evaluate({ cart, policy = DEFAULT_POLICY, spentThisMonth = 0, signals = {}, mandate = null }) {
  const reasons = [];
  const add = (severity, code, message) => reasons.push({ severity, code, message });
  const total = cartTotal(cart);
  const injections = signals.injections || [];
  const never = mandate?.terms?.never || Object.keys(NEVER_PATTERNS);

  if (!cart.length) add('block', 'EMPTY_CART', 'No deal was reached.');

  for (const item of cart) {
    const text = `${item.category || ''} ${item.name}`;
    for (const term of never) {
      const re = NEVER_PATTERNS[term] || new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'); // whole words only
      if (re.test(text)) add('block', 'NEVER', `${item.name}: "${term}" are excluded by your mandate.`);
    }
    if (item.qty > policy.maxQtyPerItem)
      add('escalate', 'QTY', `${item.name}: quantity ${item.qty} exceeds usual max of ${policy.maxQtyPerItem}.`);
    const hijack = injections.find((inj) => inj.targets.includes(item.sku));
    if (hijack)
      add('block', 'INJECTED_ITEM', `${item.name} was added on instructions hidden in a seller message, not by you.`);
  }

  if (mandate && total > mandate.terms.cap_usd)
    add('block', 'MANDATE_CAP', `Total $${total.toFixed(2)} is over your mandate cap $${mandate.terms.cap_usd.toFixed(2)}.`);
  if (mandate && Date.now() > Date.parse(mandate.terms.expires))
    add('block', 'MANDATE_EXPIRED', 'Your mandate has expired.');

  if (total > policy.maxPerOrder)
    add('block', 'ORDER_CAP', `Order total $${total.toFixed(2)} exceeds per-order cap $${policy.maxPerOrder}.`);
  else if (total > policy.escalateAbove)
    add('escalate', 'ORDER_REVIEW', `Order total $${total.toFixed(2)} is above your auto-approve limit $${policy.escalateAbove}.`);

  if (spentThisMonth + total > policy.monthlyBudget)
    add('block', 'BUDGET', `Would bring monthly spend to $${(spentThisMonth + total).toFixed(2)} (budget $${policy.monthlyBudget}).`);

  if (signals.drift && !signals.drift.matches)
    add('escalate', 'INTENT_DRIFT', `Deal doesn't match your request: ${signals.drift.reason}`);

  const verdict = reasons.some((r) => r.severity === 'block')
    ? 'BLOCK'
    : reasons.some((r) => r.severity === 'escalate')
      ? 'ESCALATE'
      : 'APPROVE';
  const score = Math.min(100, reasons.reduce((s, r) => s + WEIGHT[r.severity], 0));
  reasons.sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]); // stable: blocks first, then escalations
  return { verdict, score, total, reasons };
}
