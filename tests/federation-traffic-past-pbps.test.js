// Reported traffic past 1 Pbps: stats total, stats traffic per partner and announce traffic are Traffic (up to 10^12
// Mbps, FEDERATION-PROTOCOL 2.1), so a network past 1 Pbps ranks as what it carries, not as 1.00 Pbps on every board.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, NOW, key } = require('./helpers/fed');

test('networks past 1 Pbps report their real traffic, up to 1 Ebps, in valid records', async () => {
  const p = fedPage();
  const k = key('alice');
  p.ev(`ACT.start({});S.fed=fedNewState();S.fed.key=${JSON.stringify({ pub: k.pub, priv: k.seed })};S.fed.op={seed:'x'};R.served=5e6`);
  const total = () => JSON.parse(p.ev('JSON.stringify(fedStatsBody())')).total;
  assert.equal(total(), 5e9, '5 Pbps reads as 5 Pbps, not 1');
  p.ev('R.served=2e9');
  assert.equal(total(), 1e12, 'capped at the Traffic limit, 1 Ebps');
  assert.deepEqual([999, 1000, 1.2e9, 4.4e11, 2e12].map((v) => p.ev(`fedStep(${v})`)), [1000, 1000, 1.2e9, 4e11, 1e12]);
  p.ev('R.served=2e7');
  const ann = JSON.parse(await p.ev('fedAnnBody().then(b=>JSON.stringify(b.traffic))'));
  assert.equal(ann.in, 2e10, 'announce traffic in: 20 Pbps');
  assert.equal(ann.out, 3e9, 'announce traffic out follows the mix (all eyeballs: 15%), past 1 Pbps too');
  // The checker takes them: only the signature fails on this made-up record.
  const chk = (kind, body) => p.ev(`fedCheck({v:1,kind:'${kind}',key:'${key('alice').pub}',t:${NOW},body:${body},sig:'${'A'.repeat(86)}'},${NOW}).then(c=>c.error)`);
  assert.equal(await chk('stats', 'fedStatsBody()'), 'bad_sig');
  assert.deepEqual(p.errors, []);
});
