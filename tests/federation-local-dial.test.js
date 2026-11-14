// A server must not make the browser dial into the player's own network or machine: node URLs heard from servers
// (a server's list of nodes to fail over to, servers only heard of through gossip) are dialled only when public, unless
// the player chose a local server themselves (a LAN party), where local addresses are the point. Fake nodes, virtual
// clock: no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, URL2, SERVERS_JSON, PL } = require('./helpers/fed');

const LOCALS = ['wss://10.0.0.7/fed', 'wss://192.168.1.9:8443/fed', 'wss://router.local/fed', 'wss://[fd00::1]/fed', 'wss://127.0.0.1:9/fed', 'wss://169.254.1.1/fed'];
const status = (p) => JSON.parse(p.ev('JSON.stringify(fedStatus())'));

test('failover only goes to public nodes when the server joined is public', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  p.net.node(URL1);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), status(p).state === 'connected')));
  const got = await p.ev(`(async()=>{const c=FED.live.conns.get(${JSON.stringify(URL1)});await fedLearn(c,[{id:c.srv,nodes:${JSON.stringify([URL1, ...LOCALS, URL2].map((u) => ({ url: u })))}}]);return JSON.stringify(c.nodes);})()`);
  assert.deepEqual(JSON.parse(got), [URL1, URL2], 'the private, loopback, link-local and .local nodes are left out');
  assert.deepEqual(p.errors, []);
});

test('a LAN party keeps working: joined at a local address, the server\'s other local nodes are dialled', async () => {
  const LAN = 'wss://192.168.1.20:8443/fed', LAN2 = 'wss://192.168.1.21:8443/fed';
  const p = fedPage();
  p.net.node(LAN);
  await joinGame(p, LAN);
  assert.ok(await until(async () => (await settle(5), p.ev(`!!FED.live&&!!FED.live.conns.get(${JSON.stringify(LAN)})&&!!FED.live.conns.get(${JSON.stringify(LAN)}).srv`))), 'connected to the LAN server');
  const got = await p.ev(`(async()=>{const c=FED.live.conns.get(${JSON.stringify(LAN)});await fedLearn(c,[{id:c.srv,nodes:${JSON.stringify([LAN, LAN2, URL2].map((u) => ({ url: u })))}}]);return JSON.stringify(c.nodes);})()`);
  assert.deepEqual(JSON.parse(got), [LAN, LAN2, URL2]);
  assert.equal(p.ev('fedOnLocal()'), true);
  assert.deepEqual(p.errors, []);
});

test('Join on a server only heard of offers a public node, never a local one; the registry and invites are as they are', () => {
  const p = fedPage();
  p.ev('ACT.start({})');
  const gossip = { id: 'g'.repeat(43), name: 'Heard Of', source: 'gossip', nodes: [{ url: LOCALS[1] }, { url: 'wss://public.example.org/fed' }], operators: [] };
  const onlyLocal = { ...gossip, id: 'h'.repeat(43), nodes: [{ url: LOCALS[0] }] };
  const reg = { id: PL.id, name: 'Packet Lunch', source: 'registry', nodes: PL.server.body.nodes, operators: [] };
  p.ev(`FU.srvs=${JSON.stringify([gossip, onlyLocal, reg])}`);
  assert.equal(p.ev(`fedJoinUrl(FU.srvs[0])`), 'wss://public.example.org/fed');
  assert.equal(p.ev(`fedJoinUrl(FU.srvs[1])`), undefined, 'no node to offer');
  assert.equal(p.ev(`fedJoinUrl(FU.srvs[2])`), PL.server.body.nodes[0].url);
  const card = (i, at) => p.ev(`fuSrvCard(FU.srvs[${i}],S.fed${at ? ',' + JSON.stringify(at) : ''})`);
  assert.ok(!card(0).includes('192.168.1.9') && card(0).includes('public.example.org'), 'the card\'s Join button');
  assert.doesNotMatch(card(1), /data-act="fuJoin"/, 'no Join at all for a local-only server heard of');
  assert.match(card(1, LOCALS[0]), /data-act="fuJoin"[^>]*10\.0\.0\.7/, 'an invitation to it (the player\'s own link) still joins');
  // On a LAN server already: local servers heard of there are offered too.
  p.ev(`S.fed=fedNewState();S.fed.servers=['wss://192.168.1.20:8443/fed']`);
  assert.equal(p.ev(`fedJoinUrl(FU.srvs[1])`), LOCALS[0]);
  assert.deepEqual(p.errors, []);
});
