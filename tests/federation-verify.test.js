// Rows a server ranks are checked (FEDERATION-PROTOCOL 9.5 rankwhy): the game asks for the signed records behind its
// own row and one row picked at random, works the value out itself and compares. An honest server passes; one that
// lies about a value or about the own row is caught, left out of the boards for a day, and named in the sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, rec, rid, key, canon, signText } = require('./helpers/fed');

const slotOf = (t) => t - (t % 300);
function rcpt(r, t) {
  const x = { v: 1, kind: 'receipt', key: key('node1').pub, t: slotOf(t), body: { rec: rid(r), server: PL.id } };
  x.sig = signText(key('node1'), canon(x));
  return x;
}
const stats = (name, t, pops) => rec(name, 'stats', t, { mode: 'normal', pops, traffic: [], tier1: false, shareCountry: false });
const t0 = NOW - 3600, A = key('alice').pub, B = key('bob').pub;
const recs = { [A]: stats('alice', t0, { fra: 2 }), [B]: stats('bob', t0, { fra: 5 }) };
const row = (k, value, rank) => ({ rank, key: k, value, asn: 4200000001, ai: false });

async function setup(ranks) {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  n.ranks = ranks;
  n.why = (f) => ({ slot: slotOf(NOW), items: recs[f.key] ? [{ rec: recs[f.key], rcpt: [rcpt(recs[f.key], t0)] }] : [] });
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
  // The HUD's rank chip asks once on connecting (and its answer is spot-checked too): let it finish, then count afresh.
  assert.ok(await until(async () => (await settle(5), p.ev('FUR.at>0&&!FUR.busy&&!(FED.vb&&FED.vb.size)'))));
  await settle(20);
  n.asks.length = 0;
  p.ev('FED.bad={}');
  await p.ev("fedPut('kv','untrusted',{})");
  return { p, n };
}
const check = (p) => p.ev(`(async()=>{const c=FED.live.conns.get(${JSON.stringify(URL1)}),req=fedRankReq({board:'pops'},[]);
  return fedRankCheck(c,req,fedRanksOk(await fedAskRetry(c,req)));})()`);
const bad = (p) => p.ev("fedUntrusted().then(b=>JSON.stringify(Object.values(b).map(x=>x.srv)))").then(JSON.parse);

test('an honest ranking passes: the own row and a row picked at random match their records', async () => {
  const { p, n } = await setup({ slot: slotOf(NOW), n: 2, rows: [row(B, 5, 1), row(A, 2, 2)], me: null });
  assert.equal(await check(p), true);
  assert.deepEqual(n.asks.filter((f) => f.m === 'rankwhy').map((f) => f.key).sort(), [A, p.ev('S.fed.key.pub')].sort(), 'the own row and alice (the pick)');
  assert.deepEqual(await bad(p), []);
  assert.deepEqual(p.errors, []);
});

test('a value that does not match its records is caught: the server is left out and named', async () => {
  const { p, n } = await setup({ slot: slotOf(NOW), n: 2, rows: [row(B, 5, 1), row(A, 3, 2)], me: null });
  assert.equal(await check(p), false);
  assert.equal(n.asks.filter((f) => f.m === 'rank').length, 2, 'asked again before blaming it');
  assert.deepEqual(await bad(p), [PL.id]);
  const v = JSON.parse(await p.ev("fedRankView({board:'pops'}).then(v=>JSON.stringify(v))"));
  assert.deepEqual([v.rows, v.untrusted], [[], [PL.id]], 'its rows are left out');
  p.ev("ACT.fuOpen({v:'boards'})");
  for (let i = 0; i < 20 && !/does not match its records/.test(p.ev("$('modalCard').textContent")); i++) await settle(10);
  assert.match(p.ev("$('modalCard').textContent"), /Packet Lunch sent a ranking that does not match its records/);
  // Kept for a day, then trusted again.
  p.ev('FED.bad=null');
  assert.deepEqual(await bad(p), [PL.id], 'kept in IndexedDB');
  p.net.t += 86401 * 1000;
  assert.deepEqual(await bad(p), []);
  assert.deepEqual(p.errors, []);
});

test('a lie about the own row is caught: ranked while it has no records', async () => {
  const { p } = await setup({ slot: slotOf(NOW), n: 2, rows: [row(B, 5, 1), row(A, 2, 2)], me: { rank: 1, value: 9 } });
  assert.equal(await check(p), false);
  assert.deepEqual(await bad(p), [PL.id]);
  assert.deepEqual(p.errors, []);
});

test('rows that cannot be checked are not held against the server', async () => {
  const { p, n } = await setup({ slot: slotOf(NOW), n: 2, rows: [row(B, 5, 1), row(A, 3, 2)], me: null });
  n.why = null; // the records are not shown (not_found): nothing to check
  assert.equal(await check(p), true);
  n.why = (f) => ({ slot: slotOf(NOW) - 300, items: [] }); // a slot went by
  assert.equal(await check(p), true);
  assert.deepEqual(await bad(p), []);
  assert.deepEqual(p.errors, []);
});
