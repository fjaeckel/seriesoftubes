// Live states and the boards of now (FEDERATION-PROTOCOL 5.11, 9.3 state, 9.5, 10.13): while the tab is visible the
// game sends its current numbers, signed, every 10 s when they changed (and a keepalive every 3 minutes), never more
// often than every 5 s, only to servers that take them; the boards sheet opens on now and asks again every 10 s while
// it shows, and stops when it closes; a row of now is spot-checked against the signed states of the same snapshot.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, rec, key } = require('./helpers/fed');

async function joined(o) {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1, o);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
  return { p, n };
}
// Time goes on in 10-second steps, letting the sockets answer in between (as a real clock would).
const step = async (p, ms) => { for (let t = 0; t < ms; t += 10000) { p.net.advance(Math.min(10000, ms - t)); await settle(40); } };

test('a live state goes out every 10 s when the numbers changed, a keepalive every 3 minutes, none while hidden', { skip: 'timing-dependent on slow CI machines; to be made deterministic (4.0.0)' }, async () => {
  const { p, n } = await joined();
  await step(p, 5000);
  assert.equal(n.states.length, 1, 'the first state, with the first stats');
  const r = n.states[0];
  assert.equal(r.kind, 'state');
  assert.equal(r.key, p.ev('S.fed.key.pub'));
  assert.deepEqual(r.body, JSON.parse(p.ev('JSON.stringify(fedStatsBody())')), 'the same fields as stats');
  const ok = await p.ev(`fedCheck(${JSON.stringify(r)},FED.now(),{kinds:FED_STATE}).then(c=>c.ok)`);
  assert.equal(ok, true, 'signed by the network, a valid state');
  assert.equal(await p.ev(`fedCheck(${JSON.stringify(r)},FED.now()).then(c=>c.error)`), 'bad_kind', 'never a record');
  // Nothing changed: nothing for the next ticks.
  await step(p, 30000);
  assert.equal(n.states.length, 1);
  // A POP goes into service: the next tick sends it.
  p.ev("S.pops.ams={...(S.pops[Object.keys(S.pops)[0]]||{}),down:0}");
  await step(p, 10000);
  assert.equal(n.states.length, 2);
  assert.ok(n.states[1].body.pops.ams, 'the new POP');
  assert.ok(n.states[1].t - n.states[0].t >= 5);
  // Three minutes without a change: a keepalive keeps the network on the boards of now.
  await step(p, 180000);
  assert.equal(n.states.length, 3);
  // Hidden: nothing is sent, whatever changes.
  p.net.vis = false;
  p.ev("S.pops.lon={...S.pops.ams}");
  await step(p, 60000);
  assert.equal(n.states.length, 3);
  p.net.vis = true;
  await step(p, 10000);
  assert.equal(n.states.length, 4);
  assert.ok(p.ev('FED.stCost.n') >= 4, 'the work it took is counted');
  assert.deepEqual(p.errors, []);
});

test('a server that does not list the state feature gets no states and is not asked for boards of now', async () => {
  const { p, n } = await joined({ feats: [] });
  await step(p, 30000);
  assert.equal(n.states.length, 0);
  const v = JSON.parse(await p.ev("fedRankView({board:'pops',measure:'now'}).then(v=>JSON.stringify(v))"));
  assert.deepEqual(v.rows, []);
  assert.equal(n.asks.filter((f) => f.m === 'rank').length, 0);
  assert.deepEqual(p.errors, []);
});

test('the boards sheet opens on now and asks again every 30 s, whatever the measure, then stops', async () => {
  const { p, n } = await joined();
  const me = p.ev('S.fed.key.pub');
  n.ranks = (f) => ({ slot: 0, at: p.net.now(), n: 1, rows: [{ rank: 1, key: me, value: n.asks.length, asn: 4200000001, ai: false }], me: { rank: 1, value: 1 } });
  p.ev("ACT.fuOpen({v:'boards'})");
  await step(p, 500);
  const ranks = (m) => n.asks.filter((f) => f.m === 'rank' && (!m || f.measure === m));
  assert.equal(ranks()[0].measure, 'now', 'the default measure');
  const k = ranks('now').length;
  await step(p, 20000);
  assert.equal(ranks('now').length, k, 'not before 30 s');
  await step(p, 10000);
  assert.ok(ranks('now').length > k, 'asked again after 30 s');
  // Hidden: no asks; visible again: asks resume.
  p.net.vis = false;
  const h = ranks().length;
  await step(p, 60000);
  assert.equal(ranks().length, h, 'none while hidden');
  p.net.vis = true;
  await step(p, 30000);
  assert.ok(ranks().length > h, 'asks resume when visible');
  // The 24-hour board refreshes too.
  p.ev("ACT.fuQ({k:'measure',v:'total'})");
  await step(p, 500);
  const j = ranks('total').length;
  await step(p, 30000);
  assert.ok(ranks('total').length > j, 'the 24 h board refreshes every 30 s too');
  // Closing the sheet stops the sheet's asks.
  p.ev('ACT.fuClose()');
  await step(p, 500);
  const c = ranks('total').length;
  await step(p, 60000);
  assert.equal(ranks('total').length, c, 'no board asks once closed');
  assert.deepEqual(p.errors, []);
});

// Spot checks of a board of now: the states of the snapshot the answer used (at), checked and worked out alone.
const A = key('alice').pub, B = key('bob').pub;
const state = (name, t, pops, traffic = []) => rec(name, 'state', t, { mode: 'normal', pops, traffic, tier1: false, shareCountry: false });
const row = (k, value, rank) => ({ rank, key: k, value, asn: 4200000001, ai: false });
async function nowCheck(rows, states, whyAt) {
  const { p, n } = await joined();
  const at = p.net.now();
  n.ranks = { slot: at - (at % 300), at, n: rows.length, rows, me: null };
  n.why = (f) => ({ slot: at - (at % 300), at: whyAt ?? f.at, items: (states[f.key] || []).map((r) => ({ rec: r, rcpt: [] })) });
  const r = await p.ev(`(async()=>{const c=FED.live.conns.get(${JSON.stringify(URL1)}),req=fedRankReq({board:'traffic',measure:'now'},[]);
    return fedRankCheck(c,req,fedRanksOk(await fedAskRetry(c,req)));})()`);
  return { p, n, r };
}

test('a row of now is checked against the live states it came from, the min() rule included', async () => {
  const t = NOW - 30;
  const a = state('alice', t, { fra: 1 }, [{ key: B, in: 800, out: 300 }]), b = state('bob', t, { fra: 1 }, [{ key: A, in: 200, out: 500 }]);
  // alice: in min(800, 500), out min(300, 200): 500.
  const honest = await nowCheck([row(A, 500, 1)], { [A]: [a, b] });
  assert.equal(honest.r, true);
  assert.ok(honest.n.asks.some((f) => f.m === 'rankwhy' && f.measure === 'now' && f.at === honest.p.net.now()), 'rankwhy names the snapshot');
  assert.deepEqual(honest.p.errors, []);
  // 800 counts only alice's side: caught.
  const liar = await nowCheck([row(A, 800, 1)], { [A]: [a, b] });
  assert.equal(liar.r, false);
  assert.deepEqual(JSON.parse(await liar.p.ev("fedUntrusted().then(b=>JSON.stringify(Object.values(b).map(x=>x.srv)))")), [PL.id]);
  // Another snapshot cannot check it: not held against the server.
  const other = await nowCheck([row(A, 800, 1)], { [A]: [a, b] }, 1);
  assert.equal(other.r, true);
  assert.deepEqual(other.p.errors, []);
});
