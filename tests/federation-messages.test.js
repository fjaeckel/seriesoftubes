// Records: what this game signs checks everywhere, and what arrives is untrusted (size, JSON, values, envelope, body,
// signature, time) before it is kept. Hostile frames and records change nothing and never throw.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, key, asn, box, sealRec } = require('./helpers/fed');

const announce = (name, t, extra = {}) => rec(name, 'announce', t, { name: name + ' Net', asn: asn(key(name).pub), box: box(name), home: 'DE', day: 10, founded: 20454, pops: ['fra'], ix: ['fra'], cust: 1,
  mix: { content: 0, eyeball: 1000, enterprise: 0 }, traffic: { in: 1, out: 1 }, policy: 'open', rates: {}, auto: { peering: 'auto', transit: 'decline', pni: 'decline', swap: 'decline', consortium: 'decline', port: 'decline' }, ...extra });

test('what this game signs passes the same checks every node runs, and any change breaks the signature', async () => {
  const p = fedPage();
  p.net.node(URL1).up = false;
  await joinGame(p);
  const r = JSON.parse(await p.ev(`fedSignMine('stats',fedStatsBody()).then(r=>JSON.stringify(r))`));
  assert.equal(r.kind, 'stats');
  assert.equal(r.body.mode, 'normal');
  assert.deepEqual(r.body.pops, { fra: 1 });
  assert.equal('pies' in r.body, false, 'no Pie in the Sky company: no pies field');
  const check = (x) => p.ev(`fedCheck(${JSON.stringify(x)},${NOW}).then(c=>c.ok?'ok':c.error)`);
  assert.equal(await check(r), 'ok');
  assert.equal(await check({ ...r, body: { ...r.body, pops: { fra: 9 } } }), 'bad_sig');
  assert.equal(await check({ ...r, t: r.t + 1 }), 'bad_sig');
  assert.equal(await check(JSON.stringify(r, null, 2)), 'ok', 'whitespace on the wire is fine');
  // Announce: the ASN must be the key's.
  assert.equal(await check(announce('bob', NOW)), 'ok');
  assert.equal(await check(announce('bob', NOW, { asn: 4200000000 })), 'bad_field', 'an ASN that is not the key\'s');
  assert.deepEqual(p.errors, []);
});

test('hostile records are refused with their code, without an exception', async () => {
  const p = fedPage();
  const check = (x) => p.ev(`fedCheck(${JSON.stringify(x)},${NOW}).then(c=>c.ok?'ok':c.error)`);
  const ok = announce('bob', NOW);
  assert.equal(await check('x'.repeat(70000)), 'too_big', 'a frame over 64 KB');
  assert.equal(await check('{"__proto__":{"admin":true},"v":1}'), 'missing_field');
  assert.equal(await p.ev('({}).admin'), undefined, 'nothing reaches a prototype');
  assert.equal(await check('[[[[[[[[[[1]]]]]]]]]]'), 'too_deep');
  assert.equal(await check('{"v":1e400}'), 'bad_number');
  assert.equal(await check('{"v":"\\ud800"}'), 'bad_string');
  assert.equal(await check({ ...ok, extra: '<img src=x onerror=alert(1)>' }), 'unknown_field');
  assert.equal(await check(announce('bob', NOW, { name: 'Evil‮gnp.exe' })), 'bad_field', 'bidi controls in names');
  assert.equal(await check(announce('bob', NOW, { name: '<b>Bold</b> Net' })), 'ok', 'markup is just text: shown as typed, never as HTML');
  assert.equal(await check(announce('bob', NOW + 601)), 'too_new');
  assert.equal(await check(rec('bob', 'stats', NOW - 777601, { mode: 'normal', pops: {}, traffic: [], tier1: false, shareCountry: false })), 'too_old');
  assert.equal(await check({ ...ok, kind: 'receipt' }), 'bad_kind');
  assert.equal(await check(null), 'bad_value');
  assert.deepEqual(p.errors, []);
});

test('records from a node: only valid ones are kept; a broken frame drops the connection, which comes back', async () => {
  const p = fedPage();
  const n = p.net.node(URL1);
  const good = announce('bob', NOW - 50), forged = { ...announce('carol', NOW - 50), key: key('bob').pub };
  const old = announce('bob', NOW - 5000, { name: 'Bob Old' });
  n.feed = [{ rec: forged, rcpt: [] }, { rec: 'junk' }, null, { rec: good, rcpt: [] }, { rec: old, rcpt: [] }, { rec: announce('mallory', NOW + 9999), rcpt: [] }];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedNetworks()')).length >= 1)));
  await settle();
  const nets = JSON.parse(await p.ev('fedNetworks().then(l=>JSON.stringify(l.map(x=>[x.key,x.rec.body.name])))'));
  assert.deepEqual(nets, [[key('bob').pub, 'bob Net']], 'only the valid, newest announce');
  // A frame that is not JSON: the connection goes, and the client tries again later; nothing throws.
  const hellos = n.hellos;
  for (const ws of n.socks) ws.onmessage({ data: '{"m":"recs"' });
  await settle();
  p.net.advance(5000);
  assert.ok(await until(async () => (await settle(5), n.hellos > hellos)));
  // A leave drops everything of that key at or before it.
  n.feed = [{ rec: rec('bob', 'leave', NOW, {}), rcpt: [] }];
  for (const ws of n.socks) ws.drop();
  await settle();
  p.net.advance(5000);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedNetworks()')).length === 0)));
  assert.deepEqual(p.errors, []);
});

test('deals addressed to this network reach the gameplay through the deal event; others are not passed on', async () => {
  const p = fedPage();
  const n = p.net.node(URL1);
  await joinGame(p);
  await settle();
  const me = p.ev('S.fed.key.pub');
  p.ev('window.__deals=[];fedOn("deal",d=>__deals.push([d.rec.body.to,d.rec.body.deal]))');
  // Sealed (§5.3): Bob's offer to this network opens with his box (from his announce); his offer to Carol is not ours.
  const myBox = await p.ev('fedBoxPub(S.fed.key.priv)');
  const offer = (to, tb) => sealRec('bob', 'offer', NOW - 10, { to, deal: 'swap', terms: { give: { a: 'fra', b: 'ams', mbps: 10 }, take: { a: 'lon', b: 'par', mbps: 10 }, term: 30 } }, to, tb);
  n.feed = [{ rec: announce('bob', NOW - 20), rcpt: [] }, { rec: offer(me, myBox), rcpt: [] }, { rec: offer(key('carol').pub, box('carol')), rcpt: [] }];
  for (const ws of n.socks) ws.drop();
  await settle();
  p.net.advance(5000);
  assert.ok(await until(async () => (await settle(5), p.ev('__deals.length') >= 1)));
  assert.deepEqual(JSON.parse(p.ev('JSON.stringify(__deals)')), [[me, 'swap']], 'opened, in clear for the gameplay');
  assert.deepEqual(p.errors, []);
});
