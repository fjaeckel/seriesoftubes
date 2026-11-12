// The boards (docs/plans/federation.md, Leaderboards): what this game reports, which saves take part, the AI
// division, the lower of two traffic figures, the 7-day carry, and a board fetched from a node and kept for offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, rec, rid, key, canon, signText } = require('./helpers/fed');

const slotOf = (t) => t - (t % 300);
function rcpt(r, t, cc) {
  const x = { v: 1, kind: 'receipt', key: key('node1').pub, t: slotOf(t), body: { rec: rid(r), server: PL.id, ...(cc ? { cc } : {}) } };
  x.sig = signText(key('node1'), canon(x));
  return x;
}
const stats = (name, t, body) => rec(name, 'stats', t, { mode: 'normal', pops: {}, traffic: [], tier1: false, shareCountry: false, ...body });

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

test('excluded modes, the AI division, the lower of two traffic figures and the 7-day limit', () => {
  const p = fedPage();
  const now = 1767398410, s = (i) => 1767225600 + 300 * i, A = key('alice').pub, B = key('bob').pub, C = key('carol').pub, M = key('mallory').pub;
  const r = (id, k, i, body) => ({ id, key: k, slot: s(i), t: s(i) + 20, body: { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: false, ...body } });
  const recs = [
    r('a', A, 300, { pops: { fra: 3 }, traffic: [{ key: B, in: 800, out: 300 }] }),
    r('b', B, 300, { pops: { fra: 2 }, traffic: [{ key: A, in: 250, out: 900 }], ai: { model: 'm1', harness: 'h' } }),
    r('c', C, 300, { mode: 'sandbox', pops: { fra: 50 } }),
    r('m', M, 0, { pops: { fra: 9 } }),// carried forward through the window
  ];
  const board = (q) => JSON.parse(p.ev(`JSON.stringify(fedBoard(${JSON.stringify({ now, measure: 'total', division: 'all', exclude: [], cities: null, records: recs, ...q })}))`));
  assert.deepEqual(board({ board: 'pops' }).map((x) => x.key), [M, A, B], 'the sandbox save is not ranked');
  assert.deepEqual(board({ board: 'pops', division: 'ai' }).map((x) => x.key), [B]);
  assert.deepEqual(board({ board: 'pops', division: 'human' }).map((x) => x.key), [M, A]);
  // A: in min(800, B's out 900), out min(300, B's in 250); B: in min(250, 300), out min(900, 800): both 800, then by key.
  assert.deepEqual(board({ board: 'traffic' }).filter((x) => x.key !== M), [{ key: B, value: 800 }, { key: A, value: 800 }]);
  assert.deepEqual(board({ board: 'pops', now: s(0) + 604800 + 86400 + 10 }).map((x) => x.key).includes(M), false, 'silent 7 days: off the boards');
  assert.deepEqual(board({ board: 'pops', exclude: [M] }).map((x) => x.key), [A, B]);
  assert.deepEqual(p.errors, []);
});

test('a board fetched from a node: receipts give the slots and countries; kept for offline viewing; merged servers count once', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  const t0 = NOW - 3600;
  const b1 = stats('bob', t0, { pops: { fra: 2 }, shareCountry: true }), c1 = stats('carol', t0, { pops: { ams: 5 }, ai: { model: 'm', harness: 'h' } });
  const forged = stats('mallory', t0, { pops: { fra: 99 } });
  n.board = [{ rec: b1, rcpt: [rcpt(b1, t0 + 100, 'DE'), rcpt(b1, t0 + 400)] }, { rec: c1, rcpt: [rcpt(c1, t0)] },
    { rec: forged, rcpt: [{ ...rcpt(forged, t0), key: key('mallory').pub }] }, { rec: { ...b1, sig: 'x' }, rcpt: [] }];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
  assert.equal(await p.ev(`fedBoardFetch(${JSON.stringify(URL1)})`), 2, 'mallory has no valid receipt, the copy no valid signature');
  const d = JSON.parse(await p.ev('fedBoardData().then(d=>JSON.stringify({...d,announces:[...d.announces]}))'));
  const bob = d.records.find((x) => x.key === key('bob').pub);
  assert.equal(bob.slot, slotOf(t0 + 100), 'the earliest receipt');
  assert.equal(bob.cc, 'DE');
  assert.deepEqual(bob.srv, [PL.id]);
  assert.equal(d.at, NOW);
  const v = JSON.parse(await p.ev("fedBoardView({board:'pops'}).then(v=>JSON.stringify(v))"));
  assert.deepEqual(v.rows.map((r) => [r.value, r.rank, r.ai]), [[5, 1, true], [2, 2, false]]);
  // Offline: the cache answers; the node gone changes nothing.
  n.kill();
  await settle();
  assert.equal(await p.ev(`fedBoardFetch(${JSON.stringify(URL1)})`), null);
  const v2 = JSON.parse(await p.ev("fedBoardView({board:'pops'}).then(v=>JSON.stringify(v))"));
  assert.deepEqual(v2.rows, v.rows);
  assert.deepEqual(p.errors, []);
});
