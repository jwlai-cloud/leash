import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorFor, concede } from '../src/negotiate.js';

test('floor is 5–14% under list and stable per listing', () => {
  const f = floorFor('target.com', 'ApLETJY', 27.49);
  assert.ok(f >= 27.49 * 0.86 - 0.01 && f <= 27.49 * 0.95 + 0.01);
  assert.equal(floorFor('target.com', 'ApLETJY', 27.49), f);
});

test('sellers never go below their floor', () => {
  const s = { price: 38.09, floor: 35 };
  assert.equal(concede(s, 27.49), Math.max(35, Math.round(38.09 * 0.97 * 100) / 100));
});

test('a seller who can beat the best price undercuts it by 50 cents', () => {
  assert.equal(concede({ price: 36.56, floor: 25 }, 27.49), 26.99);
});

test('the leader sweetens a little but respects its floor', () => {
  assert.equal(concede({ price: 27.49, floor: 25 }, 27.49), 26.39);
  assert.equal(concede({ price: 27.49, floor: 27 }, 27.49), 27);
});
