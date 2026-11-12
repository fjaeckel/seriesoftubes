// Slicing the boards by every dimension the records carry (docs/plans/federation.md): each filter alone and combined,
// regions counting only what is in them, humans and AI together and apart, merged servers counting a record once, and
// the player's own row pinned whatever is selected.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const now = 1767398410, s = (i) => 1767225600 + 300 * i, DAY = Math.floor(now / 86400);
const K = (c) => c.repeat(43);
const A = K('A'), B = K('B'), C = K('C'), D = K('D'), ME = K('M');
const st = (id, key, body, srv = ['s1'], cc = null) => ({ id, key, slot: s(300), t: s(300) + 5, cc, srv,
  body: { mode: 'normal', traffic: [], tier1: false, shareCountry: !!cc, ...body } });
const ann = (home, policy, founded, day) => ({ body: { home, policy, founded, day } });
const DATA = {
  now, exclude: [], me: ME, deals: [{ key: B }],
  records: [
    st('a', A, { pops: { fra: 3, ams: 1 }, tier1: true }, ['s1'], 'DE'),
    st('b', B, { pops: { nyc: 4 }, ai: { model: 'm1', harness: 'h1' } }, ['s1', 's2'], 'US'),
    st('c', C, { pops: { fra: 1, sin: 1 }, ai: { model: 'm2', harness: 'h1' } }, ['s2']),
    st('d', D, { pops: { lon: 6 } }, ['s2'], 'GB'),
    st('m', ME, { pops: { tyo: 1 } }, ['s1']),
  ],
  announces: [[A, ann('DE', 'open', DAY - 400, 900)], [B, ann('US', 'selective', DAY - 10, 30)], [C, ann('SG', 'open', DAY - 100, 200)], [D, ann('GB', 'restrictive', DAY - 2, 5)]],
};

test('every filter alone, combined, ranks in the slice and the own row pinned', () => {
  const { ev, errors } = load();
  ev(`window.__d=${JSON.stringify(DATA)};__d.announces=new Map(__d.announces);`);
  const slice = (v) => JSON.parse(ev(`JSON.stringify(fedSlice(${JSON.stringify(v)},__d))`));
  const keys = (v) => slice(v).rows.map((r) => r.key);
  // The whole board: D 6, B 4, A 4, C 2, ME 1 (ties by key).
  assert.deepEqual(keys({ board: 'pops' }), [D, A, B, C, ME]);
  assert.deepEqual(slice({ board: 'pops' }).rows.map((r) => r.rank), [1, 2, 3, 4, 5]);
  // Division: shared and separate in the same view; AI setup only among AI entries.
  assert.deepEqual(keys({ board: 'pops', division: 'ai' }), [B, C]);
  assert.deepEqual(keys({ board: 'pops', division: 'human' }), [D, A, ME]);
  assert.deepEqual(slice({ board: 'pops', division: 'all' }).rows.filter((r) => r.ai).map((r) => r.key), [B, C], 'robot badges in the shared view');
  assert.deepEqual(keys({ board: 'pops', model: 'm2' }), [C]);
  assert.deepEqual(keys({ board: 'pops', harness: 'h1' }), [B, C]);
  // Regions count only what is in them; networks without a POP there are not listed.
  assert.deepEqual(slice({ board: 'pops', region: { continent: 'EU' } }).rows.map((r) => [r.key, r.value]), [[D, 6], [A, 4], [C, 1]]);
  assert.deepEqual(slice({ board: 'pops', region: { country: 'DE' } }).rows.map((r) => [r.key, r.value]), [[A, 3], [C, 1]]);
  assert.deepEqual(slice({ board: 'pops', region: { city: 'sin' } }).rows.map((r) => [r.key, r.value]), [[C, 1]]);
  // From the announce: home market, policy, age in real days and in game days.
  assert.deepEqual(keys({ board: 'pops', home: 'US' }), [B]);
  assert.deepEqual(keys({ board: 'pops', policy: 'open' }), [A, C]);
  assert.deepEqual(keys({ board: 'pops', ageMin: 30 }), [A, C]);
  assert.deepEqual(keys({ board: 'pops', ageMax: 30 }), [D, B]);
  assert.deepEqual(keys({ board: 'pops', dayMin: 100, dayMax: 500 }), [C]);
  // From the stats and the receipts: Tier 1 and the player's real country.
  assert.deepEqual(keys({ board: 'pops', tier1: true }), [A]);
  assert.deepEqual(keys({ board: 'pops', tier1: false }), [D, B, C, ME]);
  assert.deepEqual(keys({ board: 'pops', from: 'GB' }), [D]);
  // Peers with me: only networks I have a deal with.
  assert.deepEqual(keys({ board: 'pops', peers: true }), [B]);
  // One server's view, or all merged (B, seen by both, counted once).
  assert.deepEqual(keys({ board: 'pops', server: 's1' }), [A, B, ME]);
  assert.deepEqual(keys({ board: 'pops', server: 's2' }), [D, B, C]);
  // Combined.
  assert.deepEqual(keys({ board: 'pops', division: 'ai', region: { continent: 'EU' } }), [C]);
  assert.deepEqual(keys({ board: 'pops', policy: 'open', tier1: false, region: { continent: 'EU' } }), [C]);
  const v = slice({ board: 'pops', division: 'ai', region: { continent: 'EU' } });
  assert.equal(v.rows[0].rank, 1, 'rank in the current slice');
  // My own row stays pinned, with its rank when the slice lists it and without when it does not.
  assert.deepEqual(slice({ board: 'pops' }).me, { key: ME, value: 1, rank: 5, ai: false });
  assert.deepEqual(slice({ board: 'pops', policy: 'open' }).me, { key: ME, value: 1, rank: null, ai: false });
  assert.deepEqual(errors, []);
});

test('the same record merged from two servers counts once, and a record seen twice changes nothing', () => {
  const { ev } = load();
  const twice = { ...DATA, records: [...DATA.records, { ...DATA.records[1] }] };
  ev(`window.__d=${JSON.stringify(twice)};__d.announces=new Map(__d.announces);`);
  const rows = JSON.parse(ev(`JSON.stringify(fedSlice({board:'pops'},__d).rows)`));
  assert.equal(rows.filter((r) => r.key === B).length, 1);
  assert.equal(rows.find((r) => r.key === B).value, 4);
});
