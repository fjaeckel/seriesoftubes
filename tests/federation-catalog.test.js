// The list of servers (docs/plans/federation.md, "Finding servers"): the registry from the site's servers.json,
// merged with gossip from nodes; registry entries win; either one missing still gives a list; the cache stays.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, key, canon, signText } = require('./helpers/fed');

const HOP = SERVERS_JSON.servers[1];
const entry = (s, path, seen) => ({ genesis: s.genesis, chain: s.chain, server: s.server, path, seen });
// Packet Lunch's operators (anna, ben, cleo) sign a newer server record with another description.
function newerPL(desc) {
  const r = { v: 1, kind: 'server', key: key('anna').pub, t: NOW - 100, body: { ...PL.server.body, desc } };
  return { ...r, sigs: ['anna', 'ben'].map((n) => ({ key: key(n).pub, sig: signText(key(n), canon(r)) })).sort((a, b) => (a.key < b.key ? -1 : 1)) };
}
const servers = async (p) => JSON.parse(await p.ev('fedServers().then(l=>JSON.stringify(l))'));

test('the registry alone: every listed server, with its nodes from the chain and the weekly job\'s stamps', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  assert.equal(await p.ev('fedCatalogLoad()'), true);
  const l = await servers(p);
  assert.deepEqual(l.map((s) => [s.id, s.source, s.name]), [[PL.id, 'registry', 'Packet Lunch'], [HOP.id, 'registry', 'Hop Shop']].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const pl = l.find((s) => s.id === PL.id);
  assert.deepEqual(pl.nodes.map((n) => n.url).sort(), ['wss://relay.example.net/fed', 'wss://second.example.org:8443/fed']);
  assert.equal(pl.operators.length, 3);
  assert.equal(pl.listed, PL.listed);
  assert.equal(pl.seen, null, 'not heard by gossip yet');
  assert.deepEqual(p.errors, []);
});

test('gossip fills in, the registry wins on records, bad and expired gossip is dropped', async () => {
  const p = fedPage({ registry: { ...SERVERS_JSON, servers: [PL] } });
  const n = p.net.node(URL1);
  const forged = entry(HOP, [HOP.id], NOW - 10);
  forged.server = { ...HOP.server, body: { ...HOP.server.body, desc: 'Forged' } };
  n.gossip = [entry({ ...PL, server: newerPL('Gossip says hi') }, [PL.id, HOP.id], NOW - 60), entry(HOP, [HOP.id], NOW - 30),
    forged, entry(HOP, [HOP.id, 'x'.repeat(43)], NOW - 604800), entry(HOP, [], NOW)];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), (await servers(p)).length === 2)));
  const l = await servers(p);
  const pl = l.find((s) => s.id === PL.id), hop = l.find((s) => s.id === HOP.id);
  assert.equal(pl.source, 'registry');
  assert.equal(pl.desc, PL.server.body.desc, 'the registry\'s description, not gossip\'s');
  assert.equal(pl.seen, NOW - 60);
  assert.deepEqual(pl.path, [PL.id, HOP.id]);
  assert.equal(hop.source, 'gossip');
  assert.equal(hop.seen, NOW - 30);
  assert.equal(hop.desc, HOP.server.body.desc);
  // Gossip is forgotten after 7 days; the registry never expires.
  p.ev(`FED.now=()=>${NOW + 604800}`);
  assert.deepEqual((await servers(p)).map((s) => s.id), [PL.id]);
  assert.deepEqual(p.errors, []);
});

// Two servers syncing (found by scripts/fed-e2e.js): a node gives its clients an entry with the path it came by, which
// ends before the node's own server; the game adds that server, so the looking glass shows who syncs with whom.
test('gossip from a node: the node\'s server ends the path kept, so the looking glass sees the sync', async () => {
  const p = fedPage({ registry: { ...SERVERS_JSON, servers: [PL] } });
  const n = p.net.node(URL1);
  n.gossip = [entry(HOP, [HOP.id], NOW - 30), entry(PL, [PL.id], NOW - 20)];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), (await servers(p)).length === 2)));
  const l = await servers(p);
  assert.deepEqual(l.find((s) => s.id === HOP.id).path, [HOP.id, PL.id], 'heard through Packet Lunch');
  assert.deepEqual(l.find((s) => s.id === PL.id).path, [PL.id], 'its own entry is not passed on');
  const kept = JSON.parse(await p.ev("fedGet('kv','gossip').then(g=>JSON.stringify(g))"));
  assert.ok(kept.every((g) => new Set(g.path).size === g.path.length && g.path[0] === g.id));
  await p.ev('(async()=>{FU.srvs=await fedServers();FU.nets=new Map();FU.gossip=(await fedGet("kv","gossip"))||[];await fuGlassLoad();})()');
  assert.deepEqual(JSON.parse(await p.ev(`JSON.stringify([...(FU.syncs.get(${JSON.stringify(HOP.id)})||[])])`)), [PL.id]);
  assert.deepEqual(p.errors, []);
});

test('no registry (a 404, or offline): gossip alone; and a registry that fails later leaves the cached one', async () => {
  const p = fedPage({ registry: null });
  const n = p.net.node(URL1);
  n.gossip = [entry(HOP, [HOP.id], NOW - 30)];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), (await servers(p)).length === 1)));
  assert.equal((await servers(p))[0].source, 'gossip');
  const q = fedPage({ registry: SERVERS_JSON });
  assert.equal(await q.ev('fedCatalogLoad()'), true);
  q.ev('FED.fetch=()=>Promise.reject(new Error("offline"))');
  assert.equal(await q.ev('fedCatalogLoad()'), false);
  assert.equal((await servers(q)).length, 2, 'the cached registry');
  q.ev("FED.fetch=()=>Promise.resolve({ok:true,text:async()=>'{\"v\":1,\"asOf\":0,\"servers\":[{\"id\":\"x\"}]}'})");
  assert.equal(await q.ev('fedCatalogLoad()'), true);
  assert.equal((await servers(q)).length, 0, 'entries that do not check are left out');
  assert.deepEqual(p.errors, []);
  assert.deepEqual(q.errors, []);
});

test('the registry is fetched from the site itself, never from another origin', () => {
  const p = fedPage();
  assert.equal(p.ev('FED.registry'), 'federation/servers.json');
});
