// Deterministic policy engine. Pure: same inputs -> same verdict.
// AI signals (injection, drift) can only ADD risk; nothing here can be talked out of a block.

export const DEFAULT_POLICY = {
  maxPerOrder: 75,
  escalateAbove: 50,
  monthlyBudget: 200,
  maxQtyPerItem: 3,
  allowedCategories: ['flowers', 'books', 'home', 'electronics-accessories'],
};

const WEIGHT = { block: 40, escalate: 20, info: 0 };

export const cartTotal = (cart) =>
  Math.round(cart.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;

export function evaluate({ cart, policy = DEFAULT_POLICY, spentThisMonth = 0, signals = {} }) {
  const reasons = [];
  const add = (severity, code, message) => reasons.push({ severity, code, message });
  const total = cartTotal(cart);
  const injections = signals.injections || [];

  if (!cart.length) add('block', 'EMPTY_CART', 'Agent proposed no items.');

  for (const item of cart) {
    if (!policy.allowedCategories.includes(item.category))
      add('block', 'CATEGORY', `${item.name}: category "${item.category}" is not on your allowlist.`);
    if (item.qty > policy.maxQtyPerItem)
      add('escalate', 'QTY', `${item.name}: quantity ${item.qty} exceeds usual max of ${policy.maxQtyPerItem}.`);
    const hijack = injections.find((inj) => inj.targets.includes(item.sku));
    if (hijack)
      add('block', 'INJECTED_ITEM', `${item.name} was added on instructions hidden in the "${hijack.sku}" listing, not by you.`);
    if (injections.some((inj) => inj.sku === item.sku))
      add('escalate', 'HOSTILE_LISTING', `${item.name}: this listing contains text aimed at manipulating AI agents.`);
  }

  if (total > policy.maxPerOrder)
    add('block', 'ORDER_CAP', `Order total $${total.toFixed(2)} exceeds per-order cap $${policy.maxPerOrder}.`);
  else if (total > policy.escalateAbove)
    add('escalate', 'ORDER_REVIEW', `Order total $${total.toFixed(2)} is above your auto-approve limit $${policy.escalateAbove}.`);

  if (spentThisMonth + total > policy.monthlyBudget)
    add('block', 'BUDGET', `Would bring monthly spend to $${(spentThisMonth + total).toFixed(2)} (budget $${policy.monthlyBudget}).`);

  if (signals.drift && !signals.drift.matches)
    add('escalate', 'INTENT_DRIFT', `Cart doesn't match your request: ${signals.drift.reason}`);

  const verdict = reasons.some((r) => r.severity === 'block')
    ? 'BLOCK'
    : reasons.some((r) => r.severity === 'escalate')
      ? 'ESCALATE'
      : 'APPROVE';
  const score = Math.min(100, reasons.reduce((s, r) => s + WEIGHT[r.severity], 0));
  reasons.sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]); // stable: blocks first, then escalations
  return { verdict, score, total, reasons };
}
