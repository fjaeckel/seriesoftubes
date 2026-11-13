// The total traffic board (FEDERATION-PROTOCOL 5.2, 10.4): stats carry the network's whole traffic as the HUD shows it,
// the server ranks its 95th percentile (vectors boards/018 to 020), and the leaderboard sheet has its chip and note.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, NOW, SERVERS_JSON, URL1, key } = require('./helpers/fed');

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

test('leaderboards: a Total traffic board, its note, values in Mbps then Gbps', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  await joinGame(p);
  for (let t = 0; t < 1000; t += 500) { p.net.advance(500); await settle(); }
  const me = p.ev('S.fed.key.pub');
  const row = (k, rank, value) => ({ rank, key: k, value, asn: 4200000001, ai: false });
  n.ranks = (f) => f.board === 'total' ? { slot: 0, n: 3, rows: [row(key('carol').pub, 1, 48000), row(me, 2, 900), row(key('bob').pub, 3, 32)], me: { rank: 2, value: 900 } } : {};
  p.ev("ACT.fuOpen({v:'boards'})");
  const opt = `[...document.querySelectorAll('#modalCard select.fu-bsel option')].find(o=>o.textContent==='Total traffic')`;
  assert.ok(p.ev(`!!${opt}`), 'the board is offered');
  p.ev(`(()=>{const s=document.querySelector('#modalCard select.fu-bsel');s.value=${opt}.value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  for (let i = 0; i < 40 && !p.ev("!!FU.slice&&UI.fu.q.board==='total'&&!!document.querySelector('#modalCard .fu-board')"); i++) await settle(20);
  const vals = JSON.parse(p.ev(`JSON.stringify([...document.querySelectorAll('#modalCard .fu-board .fu-v')].map(x=>x.textContent))`));
  assert.deepEqual(vals, [p.ev('fmtG(48)'), '900 Mbps', '32 Mbps'], 'the own row in its place on the board');
  assert.match(p.ev("$('modalCard').textContent"), /whole traffic, as each game reports it/);
  assert.deepEqual(p.errors, []);
});
