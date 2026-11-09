// Channel3 product search (real products, real retailer offers).
// Cached to disk so demos and re-runs don't burn the 1,000 free searches/month.
// No key -> bundled snapshot of real Channel3 results (data/channel3-snapshot.json).
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.CHANNEL3_API_KEY;
const CACHE_FILE = process.env.CHANNEL3_CACHE_FILE || '.channel3-cache.json';
const SNAPSHOT = new URL('../data/channel3-snapshot.json', import.meta.url);
export const productsMode = KEY ? 'channel3' : 'channel3-snapshot';

let cache = {};
try { cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { /* first run */ }

// Keep only what the agents and UI need; everything from the API is untrusted text.
export function normalize(p) {
  return {
    id: p.id,
    title: String(p.title || '').slice(0, 140),
    brand: p.brands?.[0]?.name || null,
    category: p.category?.slug || null,
    description: String(p.description || '').slice(0, 600),
    image: p.images?.[0]?.cleaned_url || p.images?.[0]?.url || null,
    rating: p.ratings ? { value: p.ratings.value, count: p.ratings.count } : null,
    offers: (p.offers || [])
      .filter((o) => o?.price?.currency === 'USD' && Number.isFinite(o.price.price) && o.availability !== 'OutOfStock')
      .map((o) => ({ domain: o.domain, price: o.price.price, listPrice: o.price.compare_at_price || o.price.price, url: o.url })),
  };
}

export async function searchProducts(query, { maxPrice, limit = 8 } = {}) {
  const key = JSON.stringify([query.toLowerCase().trim(), maxPrice || null, limit]);
  if (cache[key]) return { products: cache[key], source: 'cache' };
  if (!KEY) {
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    return { products: snap.map(normalize).filter((p) => p.offers.length), source: 'snapshot' };
  }
  const res = await fetch('https://api.trychannel3.com/v1/search', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit, filters: { availability: ['InStock'], ...(maxPrice ? { price: { max_price: maxPrice } } : {}) } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Channel3 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const products = ((await res.json()).products || []).map(normalize).filter((p) => p.offers.length);
  cache[key] = products;
  try { writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch (e) { console.warn('channel3 cache save failed:', e.message); }
  return { products, source: 'channel3' };
}
