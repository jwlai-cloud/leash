import { test } from 'node:test';
import assert from 'node:assert/strict';
delete process.env.PAYPAL_CLIENT_ID; // simulated toolkit: no network in unit tests
const { checkToolCall, leashedTools } = await import('../src/leash-tools.js');

const order = { orderId: 'ORDER1', captureId: 'CAP1', total: 28.41, refunded: 0 };

test('agents can only look up orders Leash created', () => {
  assert.equal(checkToolCall('get_order', { id: 'ORDER1' }, { role: 'buyer', order }), null);
  assert.match(checkToolCall('get_order', { id: 'OTHER' }, { role: 'buyer', order }), /not created by Leash/);
});

test('only the winning seller ships, and only against this capture', () => {
  const ship = { order_id: 'ORDER1', capture_id: 'CAP1', tracking_number: 'T', carrier: 'USPS' };
  assert.equal(checkToolCall('add_order_tracking', ship, { role: 'seller', order }), null);
  assert.match(checkToolCall('add_order_tracking', ship, { role: 'buyer', order }), /winning seller/);
  assert.match(checkToolCall('add_order_tracking', { ...ship, capture_id: 'CAP9' }, { role: 'seller', order }), /own PayPal order and capture/);
});

test('refunds need the user to ask, the right capture, and no more than was paid', () => {
  const ctx = { role: 'buyer', order, refundRequested: true };
  assert.equal(checkToolCall('create_refund', { capture_id: 'CAP1' }, ctx), null);
  assert.match(checkToolCall('create_refund', { capture_id: 'CAP1' }, { ...ctx, refundRequested: false }), /did not ask/);
  assert.match(checkToolCall('create_refund', { capture_id: 'CAP1', amount: { currency_code: 'USD', value: '99.00' } }, ctx), /more than/);
  assert.match(checkToolCall('create_refund', { capture_id: 'CAP1' }, { ...ctx, role: 'seller' }), /your own agent/);
  assert.match(checkToolCall('create_refund', { capture_id: 'CAP1' }, { ...ctx, order: { ...order, refunded: 28.41 } }), /already fully refunded/);
});

test('a refused call never reaches PayPal and is audited', async () => {
  const audit = [];
  const tools = leashedTools(['create_refund'], { role: 'buyer', order, refundRequested: false }, (a) => audit.push(a));
  const out = JSON.parse(await tools.create_refund.execute({ capture_id: 'CAP1' }, {}));
  assert.match(out.error, /Blocked by Leash/);
  assert.equal(audit[0].allowed, false);
});
