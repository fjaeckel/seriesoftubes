// The boards (docs/plans/federation.md, Leaderboards): what this game reports, and slices ranked by the servers
// (FEDERATION-PROTOCOL 9.5): asked with their filters, merged over the joined servers, kept for offline. The ranking
// rules themselves run in the relay, held to the shared vectors. Slicing (FEDERATION-PROTOCOL 9.5, 10.12): the game turns a
// view into a rank request, checks the answer, and merges the answers of all its servers: rows joined by key, the
// networks it mutes or its servers hide left out, the player's own row pinned whatever is selected.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
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

/* ---------- slices: request, checks, merge (pure functions) ---------- */

// Distinct test keys (the last character keeps all-'A' clear of the all-zero key, a weak point that FdK refuses).
const K = (c) => c.repeat(42) + 'w';
const A = K('A'), B = K('B'), C = K('C'), D = K('D'), ME = K('M');
const row = (key, value, o = {}) => ({ rank: 1, key, value, asn: 4200000001, ai: false, ...o });

test('a view becomes a rank request: every filter, regions as city lists, peers as keys', () => {
  const { ev, errors } = load();
  const req = (v, deals = []) => JSON.parse(ev(`JSON.stringify(fedRankReq(${JSON.stringify(v)},${JSON.stringify(deals)}))`));
  assert.deepEqual(req({ board: 'traffic', measure: 'growth', division: 'ai' }), { m: 'rank', board: 'traffic', measure: 'growth', division: 'ai', filters: {}, n: 50 });
  const r = req({ board: 'pops', model: 'm1', harness: 'h1', home: 'DE', from: 'US', policy: 'open', tier1: false, ageMin: 7, ageMax: 30, dayMin: 365, dayMax: 999, region: { country: 'DE' }, peers: true }, [{ key: B }, { key: A }, { key: B }]);
  assert.deepEqual(Object.keys(r.filters).sort(), ['ageMax', 'ageMin', 'cities', 'dayMax', 'dayMin', 'from', 'harness', 'home', 'keys', 'model', 'policy', 'tier1']);
  assert.equal(r.filters.tier1, false, 'false filters too');
  assert.deepEqual(r.filters.keys, [A, B], 'deal partners, once each, sorted');
  assert.ok(r.filters.cities.length > 1 && r.filters.cities.includes('fra') && !r.filters.cities.includes('nyc'), 'a country: its cities');
  assert.deepEqual(req({ region: { city: 'fra' } }).filters.cities, ['fra']);
  assert.equal(ev(`fedRankKey(fedRankReq({board:'pops'},[],50))===fedRankKey(fedRankReq({board:'pops'},[],90))`), true, 'the rows asked for are not part of the slice');
  assert.deepEqual(errors, []);
});

test('answers are checked before they are shown', () => {
  const { ev, errors } = load();
  const ok = (a) => JSON.parse(ev(`JSON.stringify(fedRanksOk(${JSON.stringify(a)}))`));
  const good = { m: 'ranks', id: 1, slot: 1767398400, n: 2, rows: [row(A, 9, { name: 'Ping Floyd', home: 'DE', cc: 'FR' }), row(B, 4, { rank: 2, ai: true })], me: { rank: null, value: 3 } };
  assert.deepEqual(ok(good).rows[0], { rank: 1, key: A, value: 9, asn: 4200000001, ai: false, name: 'Ping Floyd', home: 'DE', cc: 'FR' });
  for (const bad of [{ ...good, rows: [row('x', 1)] }, { ...good, rows: [row(A, 1.5)] }, { ...good, rows: [row(A, 1, { name: '' })] }, { ...good, rows: [row(A, 1, { home: 'de' })] },
    { ...good, me: { rank: 0, value: 1 } }, { ...good, rows: Array(101).fill(row(A, 1)) }, { ...good, m: 'recs' }])
    assert.equal(ok(bad), null, JSON.stringify(bad).slice(0, 120));
  assert.deepEqual(errors, []);
});

test('all servers merged: rows by key with the higher value, muted and hidden left out, own row ranked in the merge', () => {
  const { ev, errors } = load();
  const merge = (as, drop = []) => JSON.parse(ev(`JSON.stringify(fedRankMerge(${JSON.stringify(as)},${JSON.stringify(ME)},new Set(${JSON.stringify(drop)})))`));
  const s1 = { slot: 1, n: 40, rows: [row(A, 9), row(B, 7, { rank: 2 }), row(ME, 5, { rank: 3 })], me: { rank: 3, value: 5 } };
  const s2 = { slot: 1, n: 3, rows: [row(B, 8), row(C, 6, { rank: 2 }), row(D, 1, { rank: 3 })], me: null };
  let m = merge([s1, s2]);
  assert.deepEqual(m.rows.map((r) => [r.key, r.value, r.rank]), [[A, 9, 1], [B, 8, 2], [C, 6, 3], [ME, 5, 4], [D, 1, 5]], 'B: the higher of 7 and 8');
  assert.deepEqual(m.me, { rank: 4, value: 5 }, 'its place in the merged rows');
  assert.equal(m.n, 40);
  m = merge([s1, s2], [C, A]);
  assert.deepEqual(m.rows.map((r) => r.key), [B, ME, D], 'muted or hidden: gone, the rest ranked again');
  assert.deepEqual(m.me, { rank: 2, value: 5 });
  // Not among the rows: the own row as the first server that has one gives it; not on the board: none.
  m = merge([{ ...s2, me: null }, { slot: 1, n: 90, rows: [row(A, 9)], me: { rank: 77, value: 2 } }]);
  assert.deepEqual(m.me, { rank: 77, value: 2 });
  assert.equal(merge([s2]).me, null);
  assert.equal(merge([null, s2]).rows.length, 3, 'a server with no answer is skipped');
  assert.deepEqual(errors, []);
});
