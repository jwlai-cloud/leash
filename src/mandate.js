// Signed intent mandate: what the user authorised, in a form anyone can verify.
// The cap is parsed from the user's own words, never from model output.
import { generateKeyPairSync, sign, verify, createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const KEY_FILE = process.env.MANDATE_KEY_FILE || '.leash-mandate-key.pem';
let privateKey;
try { privateKey = createPrivateKey(readFileSync(KEY_FILE, 'utf8')); } catch {
  privateKey = generateKeyPairSync('ed25519').privateKey;
  try { writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 }); } catch { /* read-only FS: per-process key */ }
}
// ponytail: local key file; a KMS/HSM-held key if this ever signs for real users
export const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });

export const HOUSE_NEVER = ['gift cards', 'crypto', 'subscriptions'];

// Flat object, sorted keys, arrays of strings only: stable bytes to sign.
const canonical = (terms) => JSON.stringify(Object.fromEntries(Object.entries(terms).sort(([a], [b]) => a.localeCompare(b))));

// "A $50 gift card, under $60" -> 60: a budget phrase wins; otherwise the last amount mentioned.
export function parseCap(request) {
  const AMT = String.raw`\$\s?(\d+(?:\.\d{1,2})?)`;
  const budget = request.match(new RegExp(String.raw`(?:under|below|max(?:imum)?|budget(?: of| is)?|up to|less than|no more than|within)\s*${AMT}`, 'i'));
  if (budget) return Number(budget[1]);
  const all = [...request.matchAll(new RegExp(AMT, 'g'))];
  return all.length ? Number(all.at(-1)[1]) : null;
}

export function signMandate({ request, goods, forWhom, capUsd, never = [], now = new Date() }) {
  const terms = {
    request: request.slice(0, 300),
    goods: String(goods || 'as described').slice(0, 80),
    for: String(forWhom || 'me').slice(0, 80),
    cap_usd: Math.round(capUsd * 100) / 100,
    never: [...new Set([...HOUSE_NEVER, ...never.map((n) => String(n).toLowerCase().slice(0, 40))])].slice(0, 8),
    expires: new Date(now.getTime() + 24 * 3600_000).toISOString(),
  };
  const bytes = Buffer.from(canonical(terms));
  return {
    terms,
    alg: 'ed25519',
    hash: createHash('sha256').update(bytes).digest('hex'),
    sig: sign(null, bytes, privateKey).toString('base64'),
  };
}

export function verifyMandate(m, pem = publicKeyPem) {
  const bytes = Buffer.from(canonical(m.terms));
  return createHash('sha256').update(bytes).digest('hex') === m.hash
    && verify(null, bytes, createPublicKey(pem), Buffer.from(m.sig, 'base64'));
}
