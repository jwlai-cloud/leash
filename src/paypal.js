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

// Winning seller's own sandbox business account receives the money (multi-party).
// SELLER_SANDBOX_EMAILS="a@business.example.com,b@business.example.com"; each retailer domain maps to one, stably.
const SELLER_EMAILS = (process.env.SELLER_SANDBOX_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
export function payeeFor(domain) {
  if (!SELLER_EMAILS.length) return null;
  const h = [...domain].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return SELLER_EMAILS[h % SELLER_EMAILS.length];
}

export async function createOrder(decision) {
  if (paypalMode === 'simulated') return { id: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'CREATED' };
  const { cart, total, id, mandate } = decision;
  const merchant = cart[0]?.merchant || 'seller';
  const payee = payeeFor(merchant);
  return call('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      // Audit link: Leash decision + signed mandate hash travel with the PayPal transaction.
      custom_id: `${id}:${mandate?.hash?.slice(0, 64) || ''}`.slice(0, 127),
      description: `Deal negotiated by your agent with ${merchant}, checked by Leash`.slice(0, 127),
      ...(payee ? { payee: { email_address: payee } } : {}),
      amount: { ...money(total), breakdown: { item_total: money(total) } },
      items: cart.map((i) => ({ name: i.name.slice(0, 127), sku: String(i.sku).slice(0, 127), quantity: String(i.qty), unit_amount: money(i.price), category: 'PHYSICAL_GOODS' })),
    }],
  }, `create-${id}`);
}

export async function captureOrder(orderId) {
  if (paypalMode === 'simulated') return { id: orderId, status: 'COMPLETED', payer: { email_address: 'simulated-buyer@example.com' },
    purchase_units: [{ payments: { captures: [{ id: `SIMCAP-${randomUUID().slice(0, 8).toUpperCase()}`, status: 'COMPLETED' }] } }] };
  return call(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, `capture-${orderId}`);
}

// Orders v2 tracking. (The Agent Toolkit's create_shipment_tracking uses the older
// /v1/shipping/trackers-batch API, which a standard sandbox REST app is NOT_AUTHORIZED for.)
export async function addTracking({ orderId, captureId, trackingNumber, carrier }) {
  if (paypalMode === 'simulated') return { id: orderId, status: 'COMPLETED', tracking_number: trackingNumber, simulated: true };
  return call(`/v2/checkout/orders/${encodeURIComponent(orderId)}/track`,
    { capture_id: captureId, tracking_number: trackingNumber, carrier, notify_payer: false }, `track-${orderId}-${trackingNumber}`);
}

// Webhooks: PayPal signs every event. We ask PayPal to verify the signature before trusting it.
// PAYPAL_WEBHOOK_ID comes from the app's Webhooks section in the developer dashboard.
export const webhookId = process.env.PAYPAL_WEBHOOK_ID || null;
export async function verifyWebhook(headers, event) {
  if (!webhookId || paypalMode === 'simulated') return false;
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  const res = await fetch(`${API}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId, webhook_event: event,
    }),
  });
  if (!res.ok) return false;
  return (await res.json()).verification_status === 'SUCCESS';
}
