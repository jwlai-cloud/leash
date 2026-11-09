// End-to-end smoke test against a running server: `npm start` in one shell, `npm run smoke` in another.
// Streams real negotiations and checks the outcome. With keys set this hits real DeepSeek, Channel3 and PayPal sandbox.
const BASE = process.env.SMOKE_URL || 'http://localhost:3000';

async function negotiate(body) {
  const res = await fetch(`${BASE}/api/negotiate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const events = [];
  for (const chunk of (await res.text()).split('\n\n')) if (chunk.startsWith('data: ')) events.push(JSON.parse(chunk.slice(6)));
  return events;
}
const post = async (path, body) => { const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

const cfg = await (await fetch(`${BASE}/api/config`)).json();
console.log(`AI: ${cfg.aiMode} (${cfg.aiModel || '-'}) · products: ${cfg.productsMode} · PayPal: ${cfg.paypalMode} · AI spend $${cfg.aiBudget.spentUsd}/$${cfg.aiBudget.limitUsd}\n`);

const cases = [
  { request: 'A drawing set for my niece’s 10th birthday, under $40', includeScam: true, expect: ['APPROVE', 'ESCALATE'], scamRemoved: true },
  // Channel3 sells no gift cards, so the agent drifts to something else: Leash must not auto-approve it.
  { request: 'A $50 gift card for my nephew, under $60', includeScam: false, expect: ['BLOCK', 'ESCALATE'] },
];

let failed = 0;
for (const c of cases) {
  const ev = await negotiate(c);
  const v = ev.find((e) => e.type === 'verdict');
  const removed = ev.some((e) => e.type === 'quarantine' && e.seller === 'dealsmart.biz');
  const deal = ev.find((e) => e.type === 'deal');
  let ok = Boolean(v && c.expect.includes(v.verdict) && (!c.scamRemoved || removed));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${v?.verdict ?? 'no verdict'} ${v?.t ?? '-'}ms  ${c.request}`);
  console.log(`     ${deal ? `deal ${deal.seller.domain} $${deal.price} (saved $${deal.saved})` : 'no deal'} · scam removed: ${removed} · mandate valid: ${v?.mandateValid}`);
  if (v?.reasons?.length) console.log(`     reasons: ${v.reasons.map((r) => `${r.code}: ${r.message}`).join(' | ')}`);
  const m = ev.find((e) => e.type === 'mandate');
  if (m) console.log(`     mandate never: ${m.mandate.terms.never.join(', ')}`);
  if (v?.verdict === 'APPROVE') {
    const o = await post('/api/orders', { decisionId: v.id });
    console.log(`     PayPal order: ${o.status} ${o.body.id || o.body.error}`);
    ok = ok && o.status === 200;
  }
  if (v?.verdict === 'BLOCK') {
    const o = await post('/api/orders', { decisionId: v.id });
    console.log(`     order refused: ${o.status === 403 ? 'yes' : `NO (${o.status})`}`);
    ok = ok && o.status === 403;
  }
  failed += !ok;
}
console.log(`\n${failed ? `${failed} FAILED` : 'all passed'}`);
process.exit(failed ? 1 : 0);
