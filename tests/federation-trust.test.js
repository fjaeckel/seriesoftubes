// What a node says is attributed to a server only once one of that server's nodes passed the check (FEDERATION-PROTOCOL
// §9.3): a node that claims a registry server's identity cannot plant an update banner, an excluded list or errors
// under that server's name, and is never a reason to dial that server's nodes. Fake nodes, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, SERVERS_JSON, PL, URL1, URL2, key } = require('./helpers/fed');

const EVIL = 'wss://evil.example.org/fed';
const run = async (p, n = 40) => { for (let i = 0; i < n; i++) { p.net.advance(200); await settle(5); } };

test('a node claiming a registry server it does not belong to plants nothing under that server\'s name', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(EVIL, { key: 'mallory' });
  const take = n.take.bind(n);
  // Unasked frames right after the welcome, while the game is still checking the node.
  n.take = (ws, text) => { const f = JSON.parse(text); take(ws, text);
    if (f.m === 'hello') { n.send(ws, { m: 'update', version: '9.9.9', security: true, notes: 'https://evil.example.org/hotfix', source: 'github' });
      n.send(ws, { m: 'excluded', keys: [key('zed').pub], more: false }); n.send(ws, { m: 'catalog', entries: [] }); } };
  assert.equal(await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`), true);
  assert.equal(await joinGame(p, EVIL), null);
  await run(p);
  assert.equal(p.ev('JSON.stringify(FED.upd)'), '{}', 'no update notice');
  const errs = JSON.parse(p.ev('JSON.stringify(FED.errs)'));
  assert.ok(errs.length && errs.every((e) => e.srv === null && e.why === 'not_node'), JSON.stringify(errs));
  assert.equal(p.ev(`FED.st[${JSON.stringify(EVIL)}].server`), null);
  assert.equal(p.ev(`FED.live.conns.get(${JSON.stringify(EVIL)}).srv`), null, 'the claim is forgotten');
  const ex = JSON.parse(await p.ev(`fedExclInfo(${JSON.stringify(key('zed').pub)}).then(x=>JSON.stringify(x))`));
  assert.equal(ex.shunned, false, 'no excluded list taken before the node was checked');
  // Never failed over to the real server's nodes on the strength of the claim.
  assert.deepEqual([...new Set(p.net.opened)], [EVIL]);
  p.ev(`ACT.fuOpen({v:'server',id:${JSON.stringify(PL.id)}})`);
  await run(p, 20);
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-upd').length"), 0, 'no banner in the operator panel');
  assert.deepEqual(p.errors, []);
});

test('an update notice is taken only from a checked node of the server, after an operator key was proved', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  assert.equal(await joinGame(p), null);
  await run(p, 20);
  const c = `FED.live.conns.get(${JSON.stringify(URL1)})`;
  assert.equal(p.ev(`${c}.phase`), 'ready');
  p.ev(`fedIn(${c},${JSON.stringify(JSON.stringify({ m: 'update', version: '9.9.9', security: true }))})`);
  assert.equal(p.ev('JSON.stringify(FED.upd)'), '{}', 'a player session takes none');
  assert.ok(n.hellos >= 1);
  assert.deepEqual(p.errors, []);
});

test('a node at a registry URL that fails the check is left for the other nodes the catalog lists for that URL', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  p.net.node(URL1, { key: 'mallory', server: key('zed').pub });
  p.net.node(URL2, { key: 'node2' });
  assert.equal(await joinGame(p), null);
  await run(p, 60);
  assert.ok(p.net.opened.includes(URL2), 'failed over to the server the catalog lists the joined URL under');
  assert.ok(JSON.parse(p.ev('JSON.stringify(FED.errs)')).some((e) => e.node === URL1 && e.why === 'not_node'), 'the node at a listed address claiming another server is dropped');
  assert.equal(p.ev(`FED.st[${JSON.stringify(URL1)}].node`), URL2);
  assert.equal(p.ev('fedStatus().state'), 'connected');
  assert.deepEqual(p.errors, []);
});
