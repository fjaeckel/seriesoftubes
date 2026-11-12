// Slicing the boards (docs/plans/federation.md): the server ranks (FEDERATION-PROTOCOL 9.5, 10.12), so the game turns a
// view into a rank request, checks the answer, and merges the answers of all its servers: rows joined by key, the
// networks it mutes or its servers hide left out, the player's own row pinned whatever is selected.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const K = (c) => c.repeat(42) + 'A';
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
