import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBudget } from '../src/budget.js';

// $1 per token, cap $10. reserve(3 chars, 1 out) = 1 in + 1 out = $2 worst case.
const make = (file) => createBudget({ file, limitUsd: 10, pricePerMTokIn: 1_000_000, pricePerMTokOut: 1_000_000 });

test('concurrent reservations cannot overshoot the cap', () => {
  const b = make(join(mkdtempSync(join(tmpdir(), 'budget-')), 'u.json'));
  const held = [1, 2, 3, 4, 5, 6].map(() => b.reserve(3, 1)); // none settled yet
  assert.deepEqual(held.map((r) => r !== null), [true, true, true, true, true, false]);
  assert.equal(b.status().spentUsd, 10);
});

test('settle swaps reservation for real usage and persists across restarts', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'budget-')), 'u.json');
  const b = make(file);
  const r = b.reserve(3, 1);
  b.settle(r, { input_tokens: 1, output_tokens: 0 }); // real cost $1
  assert.equal(b.status().spentUsd, 1);
  b.settle(b.reserve(3, 1)); // unbilled call releases its reservation
  assert.equal(b.status().spentUsd, 1);
  const reloaded = make(file);
  assert.equal(reloaded.status().spentUsd, 1);
  assert.equal(reloaded.status().calls, 1);
});
