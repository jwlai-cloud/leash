import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.MANDATE_KEY_FILE = join(tmpdir(), `leash-key-${process.pid}.pem`);
const { signMandate, verifyMandate, parseCap } = await import('../src/mandate.js');

test('cap comes from the user words', () => {
  assert.equal(parseCap('a drawing set under $40'), 40);
  assert.equal(parseCap('headphones, max $ 89.50'), 89.5);
  assert.equal(parseCap('anything nice'), null);
  assert.equal(parseCap('A $50 gift card for my nephew, under $60'), 60); // budget phrase beats item price
  assert.equal(parseCap('a $20 book or a $35 lamp'), 35);
});

test('signed mandate verifies, and any edit breaks it', () => {
  const m = signMandate({ request: 'set under $40', goods: 'art supplies', capUsd: 40, never: ['Crypto'] });
  assert.ok(verifyMandate(m));
  assert.ok(m.terms.never.includes('gift cards'));
  assert.equal(m.terms.never.filter((n) => n === 'crypto').length, 1); // deduped
  const tampered = { ...m, terms: { ...m.terms, cap_usd: 400 } };
  assert.equal(verifyMandate(tampered), false);
});
