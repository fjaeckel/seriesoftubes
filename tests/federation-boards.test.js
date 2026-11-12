// The boards (docs/plans/federation.md, Leaderboards): what this game reports, and slices ranked by the servers
// (FEDERATION-PROTOCOL 9.5): asked with their filters, merged over the joined servers, kept for offline. The ranking
// rules themselves run in the relay, held to the shared vectors.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, key } = require('./helpers/fed');

test('what a game reports: its mode, POPs in service, pies only with a rocket company, Tier 1, the AI declaration', async () => {
  const p = fedPage();
  p.ev("ACT.start({});S.cash=1e9;ACT.buildPop({city:'ams'});ACT.buildPop({city:'lon'})");
  p.ev('S.fed=fedNewState()');
  let b = JSON.parse(p.ev('JSON.stringify(fedStatsBody())'));
  assert.equal(b.mode, 'normal');
  assert.deepEqual(Object.keys(b.pops).sort(), ['ams', 'fra', 'lon'].filter((c) => b.pops[c]));
  assert.equal(b.shareCountry, true);
  assert.equal('pies' in b, false);
  assert.equal('ai' in b, false);
  p.ev("S.pops.lon.down=S.day+3;S.fed.share=false;S.fed.ai={model:'m',harness:'h'}");
  b = JSON.parse(p.ev('JSON.stringify(fedStatsBody())'));
  assert.equal(b.pops.lon, undefined, 'a POP that is down is not in service');
  assert.equal(b.shareCountry, false);
  assert.deepEqual(b.ai, { model: 'm', harness: 'h' });
  // The body is a valid stats record.
  assert.equal(await p.ev("fedCheck({v:1,kind:'stats',key:'" + key('alice').pub + "',t:" + NOW + ",body:fedStatsBody(),sig:'" + 'A'.repeat(86) + "'}," + NOW + ").then(c=>c.error)"), 'bad_sig');
  assert.deepEqual(p.errors, []);
});

test('a slice ranked by the servers: the request carries the filters, two servers merged, the answer kept for offline', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const U3 = 'wss://third.example.com', n = p.net.node(URL1), n2 = p.net.node(U3, { server: SERVERS_JSON.servers[1].id, key: 'node3' });
  const A = key('alice').pub, B = key('bob').pub, C = key('carol').pub;
  const row = (k, value, o = {}) => ({ rank: 1, key: k, value, asn: 4200000001, ai: false, ...o });
  n.ranks = (f) => ({ slot: NOW - (NOW % 300), n: 3, rows: [row(B, 5, { ai: true, name: 'Bob Net' }), row(A, 2, { rank: 2 })], me: null });
  n2.ranks = { slot: NOW - (NOW % 300), n: 2, rows: [row(C, 4), row(A, 3, { rank: 2 })], me: null };
  await joinGame(p);
  await p.ev(`fedJoin(${JSON.stringify(U3)})`);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().servers.filter(x=>x.state===\'connected\').length') === 2)));
  const v = JSON.parse(await p.ev("fedRankView({board:'pops',division:'ai',tier1:true,region:{city:'fra'}}).then(v=>JSON.stringify(v))"));
  const ask = n.asks.filter((f) => f.m === 'rank').at(-1);
  assert.deepEqual([ask.board, ask.measure, ask.division, ask.filters, ask.n], ['pops', 'total', 'ai', { cities: ['fra'], tier1: true }, 50]);
  assert.deepEqual(v.rows.map((r) => [r.key, r.value, r.rank]), [[B, 5, 1], [C, 4, 2], [A, 3, 3]], 'merged: alice takes the higher value');
  assert.equal(v.at, null, 'fresh');
  assert.equal(n.asks.filter((f) => f.m === 'board').length, 0);
  // Offline: the last answers, "as of" when they came.
  const at = p.ev('FED.now()');
  n.kill(); n2.kill();
  await settle();
  p.net.advance(60000);
  const v2 = JSON.parse(await p.ev("fedRankView({board:'pops',division:'ai',tier1:true,region:{city:'fra'}}).then(v=>JSON.stringify(v))"));
  assert.deepEqual(v2.rows, v.rows);
  assert.equal(v2.at, at);
  // Another slice was never asked: nothing to show offline.
  assert.deepEqual(JSON.parse(await p.ev("fedRankView({board:'pies'}).then(v=>JSON.stringify(v.rows))")), []);
  assert.deepEqual(p.errors, []);
});

test('the offline cache keeps at most 48 answers, the oldest going first', async () => {
  const p = fedPage();
  p.ev('ACT.start({})');
  for (let i = 0; i < 52; i++) { p.net.t += 1000; await p.ev(`fedRanksPut('u','p','k${i}',{slot:0,n:0,rows:[],me:null})`); }
  const e = JSON.parse(await p.ev("fedGet('kv','ranks').then(o=>JSON.stringify(Object.keys(o.entries)))"));
  assert.equal(e.length, 48);
  assert.equal(e.includes('u p k0'), false);
  assert.equal(e.includes('u p k51'), true);
  assert.deepEqual(p.errors, []);
});
