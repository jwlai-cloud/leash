import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/policy.js';

const art = { sku: 'ApLETJY', name: 'Crayola 115pc Imagination Art Set', category: 'drawing-painting-kits', price: 27.49, qty: 1 };
const gc = { sku: 'GC-100', name: '$100 digital gift card', category: 'gift-cards', price: 100, qty: 3 };
const mandate = (cap, never) => ({ terms: { cap_usd: cap, never: never || ['gift cards', 'crypto', 'subscriptions'], expires: new Date(Date.now() + 3600_000).toISOString() } });

test('clean deal under the mandate cap is approved', () => {
  const r = evaluate({ cart: [art], mandate: mandate(40) });
  assert.equal(r.verdict, 'APPROVE');
  assert.equal(r.score, 0);
});

test('over the mandate cap blocks even if under the house limit', () => {
  const r = evaluate({ cart: [art], mandate: mandate(25) });
  assert.equal(r.verdict, 'BLOCK');
  assert.ok(r.reasons.some((x) => x.code === 'MANDATE_CAP'));
});

test('gift cards are blocked by the never list, injected items flagged', () => {
  const r = evaluate({ cart: [art, gc], mandate: mandate(500), signals: { injections: [{ sku: 'dealsmart.biz', targets: ['GC-100'] }] } });
  const codes = r.reasons.map((x) => x.code);
  assert.equal(r.verdict, 'BLOCK');
  assert.ok(codes.includes('NEVER') && codes.includes('INJECTED_ITEM'));
});

test('custom never term from the mandate is enforced, as a whole word only', () => {
  assert.equal(evaluate({ cart: [art], mandate: mandate(40, ['crayola']) }).verdict, 'BLOCK');
  assert.equal(evaluate({ cart: [art], mandate: mandate(40, ['art set']) }).verdict, 'BLOCK');
  assert.equal(evaluate({ cart: [art], mandate: mandate(40, ['paint']) }).verdict, 'APPROVE'); // "painting" in the category is not "paint"
});

test('expired mandate blocks', () => {
  const m = mandate(40); m.terms.expires = new Date(Date.now() - 1000).toISOString();
  assert.equal(evaluate({ cart: [art], mandate: m }).verdict, 'BLOCK');
});

test('over auto-approve limit escalates, over house cap blocks', () => {
  assert.equal(evaluate({ cart: [{ ...art, price: 57 }] }).verdict, 'ESCALATE');
  assert.equal(evaluate({ cart: [{ ...art, price: 78 }] }).verdict, 'BLOCK');
});

test('monthly budget blocks', () => {
  assert.equal(evaluate({ cart: [art], spentThisMonth: 180 }).verdict, 'BLOCK');
});

test('intent drift escalates; AI cannot downgrade a deterministic block', () => {
  assert.equal(evaluate({ cart: [art], signals: { drift: { matches: false, reason: 'asked for a cable' } } }).verdict, 'ESCALATE');
  assert.equal(evaluate({ cart: [gc], signals: { drift: { matches: true } } }).verdict, 'BLOCK');
});
