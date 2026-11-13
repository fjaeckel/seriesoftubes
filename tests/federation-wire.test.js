// What the end-to-end run against the real relay (scripts/fed-e2e.js) found in the client's side of the wire (§9.3):
// a refused subscription is asked again, an unsub names its sub, an ack may come without a record id, catalog answers
// span frames, a cursor is kept only for a page handled whole, and a network picked in the looking glass becomes a
// place in the game even when more networks are known than the game models. Fake nodes on a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, PL_ENTRY, rec, key, asn, box, b64, sha } = require('./helpers/fed');

// A node that records every frame it is sent, and can be told how to answer some of them.
function spy(p, o = {}) {
  const n = p.net.node(URL1);
  n.got = [];
  const take = n.take.bind(n);
  n.take = (ws, text) => { const f = JSON.parse(text); n.got.push(f); if (o[f.m] && o[f.m](ws, f, n) !== false) return; take(ws, text); };
  return n;
}
const run = async (p, ms = 1000) => { for (let t = 0; t < ms; t += 250) { p.net.advance(250); await settle(); } };
const ann = (name, t, tr = 2) => rec(name, 'announce', t, { name: name + ' Net', asn: asn(key(name).pub), box: box(name), home: 'DE', day: 10, founded: 20454, pops: ['fra'], ix: [], cust: 1,
  mix: { content: 0, eyeball: 1000, enterprise: 0 }, traffic: { in: tr, out: tr }, policy: 'open', rates: {}, auto: { peering: 'review', transit: 'decline', pni: 'decline', swap: 'decline', consortium: 'decline', port: 'decline' } });

test('a sub answered rate_limited is sent again after the retry the node gave', async () => {
  const p = fedPage();
  let first = true;
  const n = spy(p, { sub: (ws, f, node) => { if (!first) return false; first = false; node.send(ws, { m: 'err', id: f.id, code: 'rate_limited', retry: 3 }); } });
  await joinGame(p);
  await run(p, 1000);
  assert.equal(n.got.filter((f) => f.m === 'sub').length, 1);
  assert.equal(await p.ev('fedStatus().state'), 'connected', 'a refused sub does not drop the connection');
  await run(p, 3000);
  assert.equal(n.got.filter((f) => f.m === 'sub').length, 2, 'subscribed again after 3 s');
  assert.deepEqual(p.errors, []);
});

test('a ranking refused rate_limited several times in a row is asked again until the node answers', async () => {
  const p = fedPage();
  let refused = 0;
  spy(p, { rank: (ws, f, node) => { if (refused >= 4) return false; refused++; node.send(ws, { m: 'err', id: f.id, code: 'rate_limited', retry: 1 }); } });
  await joinGame(p);
  await run(p);
  refused = 0;
  const got = p.ev(`fedAskRetry(FED.live.conns.get(${JSON.stringify(URL1)}),{m:'rank',board:'pops',measure:'total',division:'all'}).then(a=>a&&a.m)`);
  await run(p, 12000);
  assert.equal(await got, 'ranks', 'answered after four refusals, not given up');
  assert.equal(refused, 4);
});

test('an unsub names the id of its sub, and an ack without a record id is a valid frame', async () => {
  const p = fedPage();
  const n = spy(p);
  await joinGame(p);
  await run(p, 2000);
  assert.equal(await p.ev(`fedFrame('{"m":"ack","id":3}','node').error||null`), null, 'the ack of an unsub carries only its id');
  await p.ev('fedOpChain(FED.live.conns.get(' + JSON.stringify(URL1) + ').srv)');
  await run(p);
  const sub = n.got.filter((f) => f.m === 'sub').at(-1), un = n.got.find((f) => f.m === 'unsub');
  assert.deepEqual(sub.kinds, ['genesis', 'operators', 'server']);
  assert.ok(un, 'an unsub was sent');
  assert.equal(un.id, sub.id, 'the unsub names the sub it ends');
  assert.deepEqual(p.errors, []);
});

test('a catalog answer split over several frames is joined', async () => {
  const p = fedPage();
  const n = spy(p, { servers: (ws, f, node) => { node.send(ws, { m: 'catalog', id: f.id, entries: [{ a: 1 }], more: true }); node.send(ws, { m: 'catalog', id: f.id, entries: [{ a: 2 }, { a: 3 }] }); } });
  await joinGame(p);
  await run(p);
  const got = JSON.parse(await p.ev(`fedAsk(FED.live.conns.get(${JSON.stringify(URL1)}),{m:'servers'},true).then(a=>JSON.stringify(a.entries))`));
  assert.deepEqual(got, [{ a: 1 }, { a: 2 }, { a: 3 }]);
  assert.ok(n.got.some((f) => f.m === 'servers'));
});

test('sub pages are handled in order, so the cursor kept is the last page\'s', async () => {
  const p = fedPage();
  // A long first page and a short second one: handled side by side, the first would finish last and win.
  const long = Array.from({ length: 40 }, (_, i) => ({ rec: ann('page' + i, NOW - 50), rcpt: [] }));
  spy(p, { sub: (ws, f, node) => { node.send(ws, { m: 'recs', id: f.id, items: long, cursor: 'e-1', more: true }); node.send(ws, { m: 'recs', id: f.id, items: [long[0]], cursor: 'e-2', more: false }); } });
  await joinGame(p);
  assert.ok(await until(async () => (await run(p, 250), (await p.ev('fedNetworks()')).length === 40)));
  await run(p, 1000);
  assert.equal(await p.ev(`fedGet('kv','cursor:'+${JSON.stringify(URL1)}+'#'+S.fed.key.pub)`), 'e-2');
  assert.deepEqual(p.errors, []);
});

test('a network picked in the looking glass becomes a place in the game even past the 48 busiest', async () => {
  const p = fedPage();
  const n = p.net.node(URL1);
  const busy = Array.from({ length: 50 }, (_, i) => ({ rec: ann('busy' + i, NOW - 60, 5000 + i), rcpt: [] }));
  n.feed = [...busy, { rec: ann('quietbob', NOW - 60, 1), rcpt: [] }];
  await joinGame(p);
  assert.ok(await until(async () => (await run(p, 250), (await p.ev('fedNetworks()')).length === 51)));
  await p.ev('fedPlayRefresh()');
  const bob = key('quietbob').pub;
  assert.equal(await p.ev(`!!fedNetOf(${JSON.stringify(bob)})`), false, 'a quiet newcomer is not among the 48 busiest');
  await p.ev(`ACT.fpNet({key:${JSON.stringify(bob)}})`);
  await settle();
  assert.equal(await p.ev(`!!fedNetOf(${JSON.stringify(bob)})`), true, 'picked, it is a place now');
  assert.equal(await p.ev('S.fedn.nets.length'), 48, 'still at most 48');
  assert.ok(await p.ev(`UI.fpOpen&&UI.fpOpen.key===${JSON.stringify(bob)}`), 'its deals sheet opened');
  assert.deepEqual(p.errors, []);
});

test('five shun votes arriving together, each in its own frame, are all counted (an operator\'s game)', async () => {
  const DAY = 86400, sid = (n) => b64(sha('server ' + n));
  const REG = { asOf: NOW - (NOW % DAY), at: NOW, servers: [PL_ENTRY, ...[1, 2, 3, 4, 5].map((n) => ({ id: sid(n), name: 'S' + n, operators: [key('op' + n).pub], nodes: [], listed: NOW - 60 * DAY - (NOW % DAY), answered: NOW - (NOW % DAY) }))] };
  const p = fedPage();
  // The relay sends live records one frame each, right after the backlog.
  spy(p, { sub: (ws, f, node) => { node.send(ws, { m: 'recs', id: f.id, items: [], cursor: 'e-1', more: false });
    for (let i = 1; i <= 5; i++) node.send(ws, { m: 'recs', id: f.id, items: [{ rec: rec('op' + i, 'shun', NOW - DAY, { server: sid(i), target: key('mallory').pub, reason: 'spam' }), rcpt: [] }], cursor: 'e-' + (i + 1), more: false }); } });
  await p.ev(`fedPut('kv','registry',${JSON.stringify(REG)})`);
  // Votes reach only an operator's game: this device holds Anna's operator key of the joined server.
  await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`);
  await joinGame(p);
  await run(p, 2000);
  assert.ok(await until(async () => (await settle(5), ((await p.ev("fedGet('kv','votes')")) || []).length === 5)), 'every vote kept');
  assert.equal((await p.ev(`fedShunInfo(${JSON.stringify(key('mallory').pub)})`)).shunned, true, 'five votes: shunned');
  assert.deepEqual(p.errors, []);
});

test('only a page on a loopback host dials a *.localhost node over plain ws:// (development, §9.1)', async () => {
  const p = fedPage();
  const sock = (u, h) => p.ev(`fedSock(${JSON.stringify(u)},${JSON.stringify(h)})`);
  assert.equal(await sock('wss://relay.localhost:8443/fed', 'localhost'), 'ws://relay.localhost:8443/fed');
  assert.equal(await sock('wss://relay.localhost/fed', '127.0.0.1'), 'ws://relay.localhost/fed');
  assert.equal(await sock('wss://a.relay.localhost', 'game.localhost'), 'ws://a.relay.localhost');
  // The page players load, or a node that is not on this machine: TLS as always.
  assert.equal(await sock('wss://relay.localhost:8443/fed', 'seriesoftub.es'), 'wss://relay.localhost:8443/fed');
  assert.equal(await sock('wss://relay.example.net/fed', 'localhost'), 'wss://relay.example.net/fed');
  assert.equal(await sock('wss://relay.localhost.example.net/fed', 'localhost'), 'wss://relay.localhost.example.net/fed');
  assert.equal(await sock('wss://relay.localhost:8443/fed', 'localhost.example.net'), 'wss://relay.localhost:8443/fed');
});

test('a message type this game does not know is skipped, never a reason to hang up (§9.2)', async () => {
  const p = fedPage();
  await joinGame(p);
  await run(p, 1000);
  const n = p.net.node(URL1);
  for (const ws of n.socks) n.send(ws, { m: 'from_the_future', id: 7, stuff: [1, 2, 3] });
  await run(p, 1000);
  assert.equal(await p.ev('fedStatus().state'), 'connected');
  assert.deepEqual(p.errors, []);
});
