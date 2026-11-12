// Private deals (§5.3, §9.3, §10.7): offers and declines travel sealed for the other party, so a relay operator reads
// neither terms nor reasons; and one server cannot end other players' deals by listing a network as excluded: that
// hides it and stops new deals, while running deals end only once a majority of the joined servers (and at least two)
// confirm it. Fake nodes, a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, rid, key, asn, box, sealRec, openRec } = require('./helpers/fed');

const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const ann = (name, over = {}, t = NOW - 60) => rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(key(name).pub), box: box(name), home: 'DE', day: 400, founded: 20000,
  pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30, mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {},
  auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' }, ...over });
// A joined game at Frankfurt and Amsterdam with exchange ports; the node's feed brings `feed`.
async function game(feed) {
  const p = fedPage(), n = p.net.node(URL1);
  n.feed = feed.map((r) => ({ rec: r, rcpt: [] }));
  assert.equal(await joinGame(p), null);
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:1});ACT.buildPop({city:'ams'});ACT.buyIx({city:'ams',tier:1})");
  const nets = feed.filter((r) => r.kind === 'announce').length, ready = `!!(S.fedn&&S.fedn.nets.length===${nets}&&S.fedp&&S.fedp.mine.length)`;
  for (let i = 0; i < 60 && !p.ev(ready); i++) { p.net.advance(1000); await until(async () => (await settle(5), p.ev(ready)), 300); }
  assert.ok(p.ev(ready), 'players built, terms announced');
  await p.ev('fedPlayRefresh()');
  await settle(10);
  return { p, n };
}
async function resync(p, n, recs) {
  n.feed = recs.map((r) => ({ rec: r, rcpt: [] }));
  for (const ws of n.socks) ws.drop();
  await settle(10);
  p.net.advance(5000);
  await settle(20);
}

test('the box key comes from the identity seed; what this game seals only the other party opens, bound to the record', async () => {
  const p = fedPage();
  p.net.node(URL1).up = false;
  await joinGame(p);
  // The same seed gives the same box in the game and in Node (the vectors' derivation): nothing new in the save.
  assert.equal(await p.ev(`fedBoxPub('${key('carol').seed}')`), box('carol'));
  const me = p.ev('S.fed.key.pub'), myBox = await p.ev('fedBoxPub(S.fed.key.priv)');
  assert.equal(p.ev("JSON.stringify(S.fed).includes('box')"), false, 'the save holds no box key');
  // Sealing needs Bob's box, from his announce.
  await assert.rejects(p.ev(`fedSignMine('offer',{to:'${key('bob').pub}',deal:'peering',basis:'${'A'.repeat(43)}',terms:{at:['fra'],via:'ix'}})`), /nobox/);
  await p.ev(`fedPut('ann','${key('bob').pub}',{rec:${JSON.stringify(ann('bob'))},id:'x',heard:${NOW},srv:[]})`);
  const terms = { mbps: 10000, perGbps: 810, term: 90, at: ['fra'] };
  const r = JSON.parse(await p.ev(`fedSignMine('offer',{to:'${key('bob').pub}',deal:'transit',basis:'${'A'.repeat(43)}',terms:${JSON.stringify(terms)}}).then(JSON.stringify)`));
  assert.deepEqual(Object.keys(r.body).sort(), ['enc', 'to'], 'only to and the box travel');
  assert.equal(JSON.stringify(r).includes('810'), false, 'no price in clear');
  assert.equal((await p.ev(`fedCheck(${JSON.stringify(r)},${NOW})`)).ok, true, 'a valid record for every node');
  // Bob opens it; Carol, with any key she has, does not.
  assert.deepEqual(openRec('bob', r, me, myBox).terms, terms);
  assert.equal(openRec('carol', r, me, myBox), null);
  assert.equal(openRec('carol', r, key('bob').pub, box('bob')), null);
  // The game opens what Bob seals for it, and nothing moved to another record (t or to changed, signed again).
  const from = sealRec('bob', 'decline', NOW, { offer: rid(r), to: me, reason: 'conditions' }, me, myBox);
  await p.ev(`fedPut('ann','${key('bob').pub}',{rec:${JSON.stringify(ann('bob'))},id:'x',heard:${NOW},srv:[]})`);
  assert.deepEqual(JSON.parse(await p.ev(`fedOpenRec(S.fed,${JSON.stringify(from)}).then(JSON.stringify)`)).body, { offer: rid(r), to: me, reason: 'conditions' });
  const moved = rec('bob', 'decline', NOW + 1, from.body);
  assert.equal(await p.ev(`fedOpenRec(S.fed,${JSON.stringify(moved)})`), null, 'a changed t fails');
  const other = rec('bob', 'decline', NOW, { ...from.body, offer: 'B'.repeat(43) });
  assert.equal(await p.ev(`fedOpenRec(S.fed,${JSON.stringify(other)})`), null, 'a changed offer id fails');
  // A browser without X25519 does not offer multiplayer.
  const q = fedPage();
  q.ev("ACT.start({});FED_CAN.p=null;window.__d=crypto.subtle.deriveBits;crypto.subtle.deriveBits=function(a,...x){return a&&a.name==='X25519'?Promise.reject(new Error('no')):__d.call(this,a,...x);}");
  try { assert.equal(await q.ev(`fedJoinWhy('${URL1}')`), 'crypto'); } finally { q.ev('crypto.subtle.deriveBits=__d'); }
  assert.deepEqual(p.errors, []);
  assert.deepEqual(q.errors, []);
});

test('a sealed offer whose sender is not known yet waits for its announce; one that does not open is dropped', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  await joinGame(p);
  await settle();
  const me = p.ev('S.fed.key.pub'), myBox = await p.ev('fedBoxPub(S.fed.key.priv)');
  p.ev('window.__deals=[];fedOn("deal",d=>__deals.push(d.rec.body.deal))');
  const swap = { deal: 'swap', terms: { give: { a: 'fra', b: 'ams', mbps: 10 }, take: { a: 'lon', b: 'par', mbps: 10 }, term: 30 } };
  const ok = sealRec('bob', 'offer', NOW - 10, { to: me, ...swap }, me, myBox);
  // Sealed for this network with the wrong box: valid on the wire, never opened.
  const bad = sealRec('bob', 'offer', NOW - 9, { to: me, ...swap }, me, box('carol'));
  await resync(p, n, [ok, bad]);
  assert.equal(p.ev('__deals.length'), 0, 'nothing before Bob\'s box is known');
  await resync(p, n, [rec('bob', 'announce', NOW - 5, ann('bob').body)]);
  assert.ok(await until(async () => (await settle(5), p.ev('__deals.length') === 1)), 'opened once his announce came');
  assert.deepEqual(json(p, '__deals'), ['swap']);
  assert.deepEqual(p.errors, []);
});

// Puts another joined server's excluded list in place (as fedExclIn keeps it) and makes the game look again.
async function listedBy(p, urls, keys) {
  for (const u of urls) await p.ev(`fedPut('kv',fedExclKey('${u}',S.fed.key.pub),{at:${NOW},srv:'${'S'.repeat(42)}${u.length % 10}',keys:${JSON.stringify(keys)},me:null,reasons:[]});if(!S.fed.servers.includes('${u}'))S.fed.servers.push('${u}');FED.xgen++`);
  await p.ev('fedPlayRefresh()');
  await settle(10);
}
const U2 = 'wss://two.example.net/fed', U3 = 'wss://three.example.org/fed';

test('one server listing a network hides it and refuses new deals, but running deals go on with a notice', async () => {
  const { p, n } = await game([ann('alice'), ann('bob', { name: 'Hop Dog' })]);
  const ka = key('alice').pub, kb = key('bob').pub;
  assert.equal(await p.ev(`fedRequest('${ka}','peering',{via:'ix'})`), null);
  await listedBy(p, [URL1], [ka, kb]);
  // Running: still on, routed, and the sheet says why it goes on.
  const d = json(p, 'S.fed.deals[0]');
  assert.equal(d.st, 'run');
  assert.equal(d.on, true);
  assert.notEqual(p.ev(`S.fedn.nets.find(x=>x.k==='${ka}').st`), 'dark');
  p.ev(`innerWidth=360;innerHeight=640;ACT.fpNet({key:'${ka}'})`);
  assert.match(p.ev("$('modal').textContent"), /Excluded by relay\.example\.net\. Your running deals continue until other servers confirm it/);
  // No new deals either way; Bob, with nothing running, is hidden (dark) and off the boards.
  assert.deepEqual(json(p, `fedOffer('${ka}','transit',{}).miss.map(x=>x.l)`), ['excluded']);
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev(`fedRequest('${kb}','peering',{via:'ix'})`))).miss.map((x) => x.l), ['excluded']);
  assert.equal(p.ev(`S.fedn.nets.find(x=>x.k==='${kb}').st`), 'dark');
  assert.ok(JSON.parse(await p.ev('fedShunned().then(l=>JSON.stringify(l))')).includes(kb));
  // An offer from Bob is answered with a sealed excluded.
  const me = p.ev('S.fed.key.pub'), myBox = await p.ev('fedBoxPub(S.fed.key.priv)');
  await resync(p, n, [sealRec('bob', 'offer', p.net.now(), { to: me, deal: 'swap', terms: { give: { a: 'fra', b: 'ams', mbps: 10 }, take: { a: 'fra', b: 'ams', mbps: 10 }, term: 30 } }, me, myBox)]);
  assert.ok(await until(async () => (await settle(5), n.puts.some((x) => x.kind === 'decline' && (openRec('bob', x, me, myBox) || {}).reason === 'excluded'))), 'declined: excluded');
  assert.deepEqual(p.errors, []);
});

test('running deals end when two of three joined servers list the network, not when one of three does', async () => {
  const { p } = await game([ann('alice')]);
  const ka = key('alice').pub;
  assert.equal(await p.ev(`fedRequest('${ka}','peering',{via:'ix'})`), null);
  // Three joined servers have sent lists; only one lists Alice.
  await listedBy(p, [URL1], [ka]);
  await listedBy(p, [U2, U3], []);
  assert.equal(p.ev('S.fed.deals[0].st'), 'run', 'one of three: not confirmed');
  assert.equal(p.ev(`fedExclConfirmed(1,3)`), false);
  // A second one lists her: a majority of three and at least two.
  await listedBy(p, [U2], [ka]);
  assert.equal(p.ev('S.fed.deals[0].st'), 'over');
  assert.equal(p.ev('S.fed.deals[0].why'), 'excluded');
  assert.ok(p.ev("S.log.some(e=>/federation excluded/.test(e.t))"));
  // The rule: a strict majority of the servers that sent a list, and at least two.
  assert.deepEqual([[1, 1], [2, 2], [2, 3], [2, 4], [3, 4], [3, 5]].map(([m, k]) => p.ev(`fedExclConfirmed(${m},${k})`)), [false, true, true, false, true, true]);
  assert.deepEqual(p.errors, []);
});

test('a deal is never sealed with a nonce that is not from the secure random source', async () => {
  const p = fedPage();
  assert.ok(p.ev('/crypto\\.getRandomValues\\(a\\);return a;/.test(fedNonce12.toString())'));
  assert.ok(!p.ev('/FED\\.rand/.test(fedNonce12.toString())'), 'no fallback to the game\'s own random numbers');
  const n = p.ev('Array.from(fedNonce12()).join()'), m = p.ev('Array.from(fedNonce12()).join()');
  assert.notEqual(n, m);
});
