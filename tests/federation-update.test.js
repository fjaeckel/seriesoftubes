// Relay versions and update notices (docs/RELAY.md "Update notices", FEDERATION-PROTOCOL 9.3 welcome and update, 10.8
// entry impl): the looking glass shows what each node of a server runs, from the node's welcome or its server's own
// catalog entry; an operator's panel shows the update banner a node sends only to sessions that proved an operator
// key, louder for a security fix, with the notes link only when it is https. Fake nodes, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, key } = require('./helpers/fed');

const txt = (p) => p.ev("$('modalCard').textContent");
const html = (p) => p.ev("$('modalCard').innerHTML");
const entry = (s, path, seen, impl) => ({ genesis: s.genesis, chain: s.chain, server: s.server, path, seen, impl });
const [N1, N2] = PL.server.body.nodes;
async function open(p, v) { p.ev(`ACT.fuOpen(${JSON.stringify(v)})`); for (let i = 0; i < 40; i++) { p.net.advance(200); await settle(5); } }

test('the looking glass shows each node\'s relay version: from its welcome, else from its server\'s entry', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  n.impl = { name: 'tubes-relay', version: '3.6.0' };
  // The server's own entry: the second node runs 3.5.0; an item for a node it does not have and a malformed one are left out.
  n.gossip = [entry(PL, [PL.id], NOW - 60, [{ node: N1.key, name: 'tubes-relay', version: '3.4.0' }, { node: N2.key, name: 'tubes-relay', version: '3.5.0' },
    { node: key('stranger').pub, name: 'tubes-relay', version: '9.9.9' }, { node: N2.key, name: 'tubes-relay', version: '<b>x</b>' }])];
  assert.equal(await joinGame(p), null);
  assert.ok(await until(async () => (await settle(5), JSON.parse(await p.ev('fedServers().then(l=>JSON.stringify(l))')).some((s) => s.relays && s.relays[N2.key]))));
  const s = JSON.parse(await p.ev('fedServers().then(l=>JSON.stringify(l))')).find((x) => x.id === PL.id);
  assert.deepEqual(s.relays, { [N1.key]: { name: 'tubes-relay', version: '3.4.0' }, [N2.key]: { name: 'tubes-relay', version: '3.5.0' } });
  assert.deepEqual(JSON.parse(p.ev('JSON.stringify(FED.st[' + JSON.stringify(URL1) + '].impl)')), { name: 'tubes-relay', version: '3.6.0' });
  await open(p, { v: 'server', id: PL.id });
  // The node this game is connected to said 3.6.0 itself: that wins over the entry's older 3.4.0.
  assert.match(txt(p), /Relay software\s*relay\.example\.net relay 3\.6\.0\s*second\.example\.org:8443 relay 3\.5\.0/);
  assert.doesNotMatch(txt(p), /9\.9\.9|<b>x/);
  // A player sees no operator panel and no update banner.
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-upd').length"), 0);
  assert.deepEqual(p.errors, []);
});

test('an operator gets the update banner, louder for a security fix; the notes link is https only', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  n.update = { version: '3.7.0', security: true, notes: 'https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.7.0', source: 'feed' };
  assert.equal(await joinGame(p), null);
  await settle(20);
  assert.equal(p.ev('JSON.stringify(FED.upd)'), '{}', 'no notice before an operator key is proved');
  assert.equal(await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`), true);
  assert.ok(await until(async () => (await settle(5), p.ev(`!!FED.upd[${JSON.stringify(PL.id)}]`))));
  await open(p, { v: 'server', id: PL.id });
  assert.match(txt(p), /Operator panel\s*⚠️ Security update available\s*Relay 3\.7\.0 fixes a security issue/);
  assert.equal(p.ev("document.querySelector('#modalCard .fu-upd').className"), 'fu-box fu-upd bad');
  const a = p.ev("(()=>{const a=document.querySelector('#modalCard .fu-upd a');return a&&[a.getAttribute('href'),a.rel,a.target].join(' ')})()");
  assert.equal(a, 'https://github.com/fjaeckel/seriesoftubes/releases/tag/v3.7.0 noopener noreferrer _blank');

  // From GitHub releases (relay.json could not be read), a plain update, a link that is not https: no link.
  p.ev(`fedIn([...FED.live.conns.values()][0],${JSON.stringify(JSON.stringify({ m: 'update', version: '3.8.0', security: false, notes: 'javascript:alert(1)', source: 'github' }))})`);
  await open(p, { v: 'server', id: PL.id });
  assert.match(txt(p), /⬆️ Update available\s*Relay 3\.8\.0 is out\. Update your nodes when you can\. From GitHub releases\./);
  assert.equal(p.ev("document.querySelector('#modalCard .fu-upd').className"), 'fu-box fu-upd');
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-upd a').length"), 0);
  // A malformed notice changes nothing and does not drop the connection.
  p.ev(`fedIn([...FED.live.conns.values()][0],${JSON.stringify(JSON.stringify({ m: 'update', version: '<img src=x onerror=alert(1)>', security: true }))})`);
  assert.equal(p.ev(`FED.upd[${JSON.stringify(PL.id)}].version`), '3.8.0');
  assert.equal(p.ev('fedStatus().state'), 'connected');
  assert.doesNotMatch(html(p), /onerror/);
  // On a phone the banner fits: nothing wider than the screen.
  p.ev('window.innerWidth=360;window.innerHeight=740;renderTabbar()');
  await open(p, { v: 'server', id: PL.id });
  assert.equal(p.ev('isPhone()'), true);
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-upd').length"), 1);
  assert.deepEqual(p.errors, []);
});

test('fedUpdOf and fedImpls keep only well-formed values', () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const u = (f) => JSON.parse(p.ev(`JSON.stringify(fedUpdOf(${JSON.stringify(f)}))`));
  assert.deepEqual(u({ version: '3.6.0', security: 'yes', notes: 'https://a.example/n' }), { version: '3.6.0', security: false, notes: 'https://a.example/n', github: false });
  assert.equal(u({ version: '3.6.0', source: 'github' }).github, true);
  assert.equal(u({ version: '3.6.0', source: 'gossip' }).github, false, 'gossip is no update source');
  assert.equal(u({ version: '3.6.0', notes: 'https://user:pw@a.example/' }).notes, null);
  assert.equal(u({ version: '3.6.0', notes: 'http://a.example/' }).notes, null);
  assert.equal(u({ version: 'x'.repeat(41) }), null);
  assert.equal(u({}), null);
  const im = (l) => JSON.parse(p.ev(`JSON.stringify(fedImpls(${JSON.stringify(l)},${JSON.stringify(PL.server.body.nodes)}))`));
  assert.deepEqual(im('nope'), {});
  assert.deepEqual(im(Array(17).fill({ node: N1.key, name: 'tubes-relay', version: '1.0.0' })), {}, 'more than 16: ignored');
  assert.deepEqual(im([{ node: N1.key, name: 'other-relay', version: '0.1' }]), { [N1.key]: { name: 'other-relay', version: '0.1' } });
  assert.deepEqual(p.errors, []);
});
