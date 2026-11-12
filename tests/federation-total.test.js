// The total traffic board (FEDERATION-PROTOCOL 5.2, 10.4): stats carry the network's whole traffic as the HUD shows it,
// the board ranks its 95th percentile (old records without it count 0), and the leaderboard sheet has its chip and note.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, NOW, SERVERS_JSON, PL, URL1, key } = require('./helpers/fed');

test('stats carry total: traffic served in Mbps, a valid record', async () => {
  const p = fedPage();
  p.ev("ACT.start({});S.fed=fedNewState();R.served=12.3456");
  const b = JSON.parse(p.ev('JSON.stringify(fedStatsBody())'));
  assert.equal(b.total, 12000, 'in steps of about 20%');
  // Traffic that moves a little keeps the same body, so no new stats record goes out every slot.
  p.ev('R.served=12.9');
  assert.equal(JSON.parse(p.ev('JSON.stringify(fedStatsBody())')).total, 12000);
  p.ev('R.served=14.1');
  assert.equal(JSON.parse(p.ev('JSON.stringify(fedStatsBody())')).total, 15000);
  assert.deepEqual([0, 0.4, 1, 32, 111, 999, 1000].map((v) => p.ev(`fedStep(${v})`)), [0, 0, 1, 30, 120, 1000, 1000]);
  p.ev('R.served=5e6');
  assert.equal(JSON.parse(p.ev('JSON.stringify(fedStatsBody())')).total, 1e9, 'capped at the Mbps limit');
  assert.equal(await p.ev("fedCheck({v:1,kind:'stats',key:'" + key('alice').pub + "',t:" + NOW + ",body:fedStatsBody(),sig:'" + 'A'.repeat(86) + "'}," + NOW + ").then(c=>c.error)"), 'bad_sig');
  assert.deepEqual(p.errors, []);
});

test('the total board: p95 of total, absent counts 0, growth and the region filter', () => {
  const p = fedPage();
  const now = 1767398410, s = (i) => 1767225600 + 300 * i, A = key('alice').pub, B = key('bob').pub, C = key('carol').pub;
  const r = (id, k, i, body) => ({ id, key: k, slot: s(i), t: s(i) + 20, body: { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: false, ...body } });
  const recs = [
    r('a1', A, 0, { total: 2000 }), r('a2', A, 288, { total: 3000 }), r('a3', A, 562, { total: 90000 }),// 14 high slots: not counted
    r('b1', B, 288, { pops: { nyc: 1 }, total: 5000 }),
    r('c1', C, 0, {}),// an older game: no total
  ];
  const board = (q) => JSON.parse(p.ev(`JSON.stringify(fedBoard(${JSON.stringify({ now, board: 'total', measure: 'total', division: 'all', exclude: [], cities: null, records: recs, ...q })}))`));
  assert.deepEqual(board({}), [{ key: B, value: 5000 }, { key: A, value: 3000 }, { key: C, value: 0 }]);
  assert.deepEqual(board({ measure: 'growth' }), [{ key: A, value: 5000 }, { key: C, value: 0 }]);
  assert.deepEqual(board({ cities: ['fra'] }).map((x) => x.key).includes(B), false, 'no POP in the region: not listed');
  assert.deepEqual(p.errors, []);
});

test('leaderboards: a Total traffic chip, its note, values in Mbps then Gbps', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  p.net.node(URL1).up = false;
  await joinGame(p);
  for (let t = 0; t < 1000; t += 500) { p.net.advance(500); await settle(); }
  const me = p.ev('S.fed.key.pub'), now = p.ev('FED.now()'), slot = now - (now % 300) - 600;
  const row = (k, id, total) => ({ id, key: k, slot, t: slot + 10, body: { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: false, total } });
  await p.ev(`fedBoardPut(${JSON.stringify(PL.id)},${JSON.stringify([row(key('bob').pub, 'b'.repeat(43), 32), row(key('carol').pub, 'c'.repeat(43), 48000), row(me, 'd'.repeat(43), 900)])})`);
  p.ev("ACT.fuOpen({v:'boards'})");
  const chip = `[...document.querySelectorAll('#modalCard .fu-chip')].find(b=>b.textContent==='Total traffic')`;
  assert.ok(p.ev(`!!${chip}`), 'the chip is there');
  p.ev(`${chip}.click()`);
  for (let i = 0; i < 40 && !p.ev("!!FU.slice&&UI.fu.q.board==='total'&&!!document.querySelector('#modalCard .fu-board')"); i++) await settle(20);
  const vals = JSON.parse(p.ev(`JSON.stringify([...document.querySelectorAll('#modalCard .fu-board .fu-v')].map(x=>x.textContent))`));
  assert.deepEqual(vals, ['900 Mbps', p.ev('fmtG(48)'), '32 Mbps'], 'own row pinned, then the board');
  assert.match(p.ev("$('modalCard').textContent"), /whole traffic, as each game reports it/);
  assert.deepEqual(p.errors, []);
});
