// The customer cone board (FEDERATION-PROTOCOL §5.2 cust/up, §10.4): the player networks reachable through a network's
// transit customers, counted only over edges both sides list, with traffic both ways, to networks that joined at least
// 30 days before and were heard in the last 7. The server ranks; a game checks a row from the signed records rankwhy
// shows (fedRankOne, in the federation worker), announces included for their founded.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, rec, rid, key, asn, box, canon, signText } = require('./helpers/fed');

const DAY = 86400, TODAY = Math.floor(NOW / DAY);
const slotOf = (t) => t - (t % 300);

// fedRankOne on hand-made records (already checked): a chain A -> B -> C, with what breaks it.
test('fedRankOne counts the cone over edges both sides list, with traffic both ways, to established networks', () => {
  const { ev, errors } = load();
  const s = slotOf(NOW) - 3600, tr = (...l) => l.map(([k, i, o]) => ({ key: k, in: i, out: o }));
  const r = (id, k, body) => ({ id, key: k, slot: s, t: s + 20, body: { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: false, ...body } });
  const chain = (o = {}) => [
    r('a', 'kA', { cust: ['kB'], traffic: tr(['kB', 100, 100]) }),
    r('b', 'kB', { cust: ['kC'], up: ['kA'], traffic: tr(['kA', 100, o.oneWay ? 0 : 100], ['kC', 50, 50]) }),
    r('c', 'kC', { up: o.noUp ? [] : ['kB'], traffic: tr(['kB', 50, 50]) }),
  ];
  const one = (k, recs, founded, q = {}) => JSON.parse(ev(`JSON.stringify(fedRankOne(${JSON.stringify({ now: NOW, board: 'cone', measure: 'total', division: 'all', exclude: [], cities: null, filters: {}, founded, ...q })},'${k}',${JSON.stringify(recs)},null))`)).value;
  const old = { kA: TODAY - 100, kB: TODAY - 100, kC: TODAY - 100 };
  assert.equal(one('kA', chain(), old), 2);
  assert.equal(one('kB', chain(), old), 1);
  assert.equal(one('kA', chain(), { ...old, kC: TODAY - 29 }), 1, 'a young member does not count');
  assert.equal(one('kA', chain(), { ...old, kB: TODAY - 29 }), 0, 'a young member in the middle cuts the path');
  assert.equal(one('kA', chain({ oneWay: true }), old), 0, 'traffic one way only: the edge does not count');
  assert.equal(one('kA', chain({ noUp: true }), old), 1, 'one side alone counts nothing');
  assert.equal(one('kA', chain(), { kA: 1, kB: TODAY - 100 }), 1, 'no announce: never established');
  assert.equal(one('kA', chain(), old, { exclude: ['kB'] }), 0, 'excluded: no edge leads to it');
  // A silent member: its last record more than 7 days before every slot of the window.
  const silent = chain().map((x) => (x.key === 'kB' ? { ...x, slot: s - 8 * DAY, t: s - 8 * DAY } : x));
  assert.equal(one('kA', silent, old), 0, 'not heard in 7 days: no value, no edge');
  assert.deepEqual(errors, []);
});

// A server's cone row, checked by a game from rankwhy's records (receipts and all) in the federation worker's code.
function rcpt(r, t) {
  const x = { v: 1, kind: 'receipt', key: key('node1').pub, t: slotOf(t), body: { rec: rid(r), server: PL.id } };
  x.sig = signText(key('node1'), canon(x));
  return x;
}
function ann(name, founded) {
  const k = key(name);
  return rec(name, 'announce', NOW - 7200, { name: 'Net ' + name, asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded, pops: ['fra'], ix: [], cust: 3,
    mix: { content: 300, eyeball: 600, enterprise: 100 }, traffic: { in: 4000, out: 9000 }, policy: 'open', rates: {},
    auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' } });
}
const A = key('alice').pub, B = key('bob').pub, t0 = NOW - 3600;
const st = (name, body) => rec(name, 'stats', t0, { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: false, ...body });
async function setup(bobFounded, value) {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  const sa = st('alice', { cust: [B], traffic: [{ key: B, in: 300, out: 200 }] }), sb = st('bob', { up: [A], traffic: [{ key: A, in: 200, out: 300 }] });
  // Only the cone board has rows (the HUD's rank chip asks the traffic board, which must not check against cone records).
  n.ranks = (f) => f.board === 'cone' ? { slot: slotOf(NOW), n: 2, rows: [{ rank: 1, key: A, value, asn: asn(A), ai: false }], me: null } : { slot: slotOf(NOW), n: 0, rows: [], me: null };
  n.why = (f) => ({ slot: slotOf(NOW), items: f.key === A ? [{ rec: sa, rcpt: [rcpt(sa, t0)] }, { rec: sb, rcpt: [rcpt(sb, t0)] }, { rec: ann('alice', TODAY - 300), rcpt: [] }, { rec: ann('bob', bobFounded), rcpt: [] }] : [] });
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
  return { p, n };
}
const check = (p) => p.ev(`(async()=>{const c=FED.live.conns.get(${JSON.stringify(URL1)}),req=fedRankReq({board:'cone'},[]);
  return fedRankCheck(c,req,fedRanksOk(await fedAskRetry(c,req)));})()`);

test('a cone row checks out from rankwhy\'s records, the customers\' announces giving who is established', async () => {
  const { p, n } = await setup(TODAY - 100, 1);
  assert.equal(await check(p), true);
  assert.ok(n.asks.some((f) => f.m === 'rankwhy' && f.board === 'cone' && f.key === A));
  assert.deepEqual(p.errors, []);
});

test('a cone that counts a newcomer is caught', async () => {
  const { p } = await setup(TODAY - 5, 1);
  assert.equal(await check(p), false, 'bob joined 5 days ago: alice\'s cone is 0, not 1');
  assert.deepEqual(p.errors, []);
});

test('the boards sheet has a Customer cone board with its explanation, at phone width', { skip: 'timing-dependent on slow CI machines; to be made deterministic (4.0.0)' }, async () => {
  const { p, n } = await setup(TODAY - 100, 1);
  p.ev('innerWidth=360;innerHeight=640;ACT.fuOpen({v:"boards"});');
  await p.ev('ACT.fuQ({k:"board",v:"cone"})');
  assert.ok(await until(async () => (await settle(5), /Customer cone/.test(p.ev("$('modalCard').textContent")) && p.ev("!!document.querySelector('#modalCard .fu-row .fu-rank')"))));
  const txt = p.ev("$('modalCard').textContent");
  assert.match(txt, /buy transit from you/);
  assert.match(txt, /30 days/);
  assert.ok(n.asks.some((f) => f.m === 'rank' && f.board === 'cone'));
  // Values are counts, not traffic.
  assert.equal(p.ev("fuVal({board:'cone',measure:'total'},12)"), '12');
  assert.deepEqual(p.errors, []);
});
