// PayPal Orders v2 (sandbox). Without credentials, returns simulated orders so the demo still runs.
import { randomUUID } from 'node:crypto';

const ID = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_CLIENT_SECRET;
const API = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
export const paypalMode = ID && SECRET ? 'sandbox' : 'simulated';
export const paypalClientId = ID || null;

let token = { value: null, expires: 0 };
async function accessToken() {
  if (token.value && Date.now() < token.expires) return token.value;
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth ${res.status}`);
  const j = await res.json();
  token = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
  return token.value;
}

async function call(path, body, idempotencyKey) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'content-type': 'application/json',
      'PayPal-Request-Id': idempotencyKey, // retries never double-create / double-capture
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`PayPal ${res.status}: ${j.details?.[0]?.description || j.message || 'error'}`);
  return j;
}

const money = (v) => ({ currency_code: 'USD', value: v.toFixed(2) });

export async function createOrder(decision) {
  if (paypalMode === 'simulated') return { id: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'CREATED' };
  const { cart, total, id } = decision;
  return call('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      custom_id: id, // links the PayPal transaction back to the Leash decision for audit
      description: 'Agent purchase approved by Leash',
      amount: { ...money(total), breakdown: { item_total: money(total) } },
      items: cart.map((i) => ({ name: i.name.slice(0, 127), sku: i.sku, quantity: String(i.qty), unit_amount: money(i.price), category: 'PHYSICAL_GOODS' })),
    }],
  }, `create-${id}`);
}

export async function captureOrder(orderId) {
  if (paypalMode === 'simulated') return { id: orderId, status: 'COMPLETED', payer: { email_address: 'simulated-buyer@example.com' } };
  return call(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, `capture-${orderId}`);
}
