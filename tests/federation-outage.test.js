// When a server is down, nothing breaks (docs/plans/federation.md): the client fails over between a server's nodes,
// backs off politely and only while the tab is visible, queues in the save with a cap, keeps quiet networks for weeks,
// and the day loop does the same work whatever the connection does. Fake nodes and a virtual clock: no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, URL2, NOW, SERVERS_JSON, rec, key, box } = require('./helpers/fed');
const { load } = require('./harness');

const status = (p) => JSON.parse(p.ev('JSON.stringify(fedStatus())'));

test('a joined save connects, sends its queue and shows connected; killing the server shows offline since then, quietly', async () => {
  const p = fedPage();
  const n1 = p.net.node(URL1);
  assert.equal(await joinGame(p), null);
  assert.ok(await until(async () => (await settle(5), status(p).state === 'connected')), 'connected');
  // The first stats go out a few seconds after joining.
  p.net.advance(6000);
  assert.ok(await until(async () => (await settle(5), n1.puts.some((r) => r.kind === 'stats'))), 'stats sent');
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.out.length') === 0)), 'queue emptied once taken');
  p.net.advance(60000);
  const t = p.net.now(), toasts = p.ev("document.querySelectorAll('.toast').length");
  n1.kill();
  await settle();
  const st = status(p);
  assert.equal(st.state, 'offline');
  assert.equal(st.since, t);
  // No window, no toast: an unreachable server is a normal state.
  assert.equal(p.ev("document.querySelectorAll('.toast').length"), toasts);
  assert.equal(p.ev("!!document.getElementById('modal')&&!document.getElementById('modal').hidden&&document.getElementById('modal').classList.contains('on')"), false);
  assert.deepEqual(p.errors, []);
});

test('a dead node fails over to the other node of the same server (from the registry), which proves its key', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n1 = p.net.node(URL1), n2 = p.net.node(URL2, { key: 'node2' });
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), status(p).state === 'connected')));
  // The registry lists two nodes; the client learnt them after connecting.
  assert.ok(await until(async () => (await settle(5), p.ev('[...FED.live.conns.values()][0].nodes.length') === 2)));
  n1.kill();
  await settle();
  p.net.advance(1000);
  assert.ok(await until(async () => (await settle(5), status(p).state === 'connected')), 'on the second node');
  assert.equal(status(p).servers[0].node, URL2);
  assert.ok(n2.hellos >= 1);
  assert.deepEqual(p.errors, []);
});

test('a node whose key is not on its server\'s list, or that cannot prove it, is left for another', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const bad = p.net.node(URL1, { key: 'mallory' }), good = p.net.node(URL2, { key: 'node2' });
  await joinGame(p);
  p.net.advance(1000);
  const onGood = () => status(p).servers[0] && status(p).servers[0].node === URL2 && status(p).state === 'connected';
  for (let i = 0; i < 200 && !onGood(); i++) { await settle(); p.net.advance(500); }
  assert.ok(onGood(), 'connected to the node that proved its key');
  assert.equal(bad.puts.length, 0, 'nothing sent to the impostor');
  assert.deepEqual(p.errors, []);
});

test('every node down: back-off doubles with jitter up to 30 minutes, and only while the tab is visible', async () => {
  const p = fedPage();
  const n1 = p.net.node(URL1);
  n1.up = false;
  await joinGame(p);
  await settle();
  assert.equal(status(p).state, 'offline');
  // FED.rand is 0.5 here: each wait is 75% of 2 s × 2^(tries-1), capped at 30 minutes.
  const waits = [];
  for (let i = 0; i < 14; i++) {
    const before = p.net.opened.length;
    const w = p.ev('[...FED.live.conns.values()][0].wait');
    assert.ok(p.ev('!![...FED.live.conns.values()][0].t'), 'a retry is scheduled');
    waits.push(w);
    p.net.advance(w);
    await settle();
    assert.equal(p.net.opened.length, before + 1);
  }
  assert.deepEqual(waits.slice(0, 5), [1500, 3000, 6000, 12000, 24000]);
  assert.equal(Math.max(...waits), 1350000, 'never more than 30 minutes (75% with this jitter)');
  // Hidden: the timer fires but nothing dials; visible again: it dials at once and catches up.
  p.net.vis = false;
  const before = p.net.opened.length;
  p.net.advance(1800000);
  await settle();
  assert.equal(p.net.opened.length, before, 'no connection attempts while hidden');
  assert.equal(status(p).servers[0].state, 'waiting');
  n1.up = true;
  p.net.vis = true;
  p.w.document.dispatchEvent(new p.w.Event('visibilitychange'));
  assert.ok(await until(async () => (await settle(5), status(p).state === 'connected')));
  assert.deepEqual(p.errors, []);
});

test('a silent node is given up after two minutes, and a request without an answer times out', async () => {
  const p = fedPage();
  const n1 = p.net.node(URL1);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), status(p).state === 'connected')));
  n1.mute = true;
  const r = p.ev(`fedAsk(FED.live.conns.get(${JSON.stringify(URL1)}),{m:'rank',board:'pops',measure:'total',division:'all'})`);
  await settle();
  p.net.advance(21000);
  assert.equal(await r, null, 'the rank request timed out');
  p.net.advance(130000);
  await settle();
  assert.notEqual(status(p).state, 'connected');
  assert.deepEqual(p.errors, []);
});

test('the queue is capped: an older stats is replaced by the newest, offers beyond the cap are refused, all of it kept in the save', async () => {
  const p = fedPage();
  p.net.node(URL1).up = false;
  await joinGame(p);
  // Offers to Bob are sealed for his box: this game knows it from his announce.
  await p.ev(`fedPut('ann','${key('bob').pub}',{rec:{key:'${key('bob').pub}',body:{box:'${box('bob')}'}},id:null,heard:${NOW},srv:[]})`);
  const out = JSON.parse(await p.ev(`(async()=>{const f=S.fed,r=[];
    for(let i=0;i<3;i++){FED.now=()=>${NOW}+i*300;fedQueue(await fedSignMine('stats',fedStatsBody()));}
    const offer=async n=>fedSignMine('offer',{to:'${key('bob').pub}',deal:'swap',terms:{give:{a:'fra',b:'ams',mbps:n},take:{a:'lon',b:'par',mbps:n},term:30}});
    for(let i=0;i<70;i++)r.push(fedQueue(await offer(i)));
    return JSON.stringify({stats:f.out.filter(x=>x.kind==='stats').map(x=>x.t),offers:f.out.filter(x=>x.kind==='offer').length,refused:r.filter(x=>!x).length});})()`));
  assert.deepEqual(out.stats, [NOW + 600], 'only the newest stats waits');
  assert.equal(out.offers, 64);
  assert.equal(out.refused, 6);
  // Kept in the save: still there after a reload.
  const txt = p.ev('save(true);JSON.stringify(packSave(S))');
  const q = p.ev(`(()=>{const s=JSON.parse(${JSON.stringify(txt)});sanitize(s);return s.fed.out.length;})()`);
  assert.equal(q, 65);
  assert.deepEqual(p.errors, []);
});

test('the day loop does the same work whatever the connection does', async () => {
  const days = async (mode) => {
    const p = mode === 'solo' ? fedPage() : fedPage();
    const n1 = p.net.node(URL1);
    if (mode === 'solo') p.ev('ACT.start({})'); else await joinGame(p);
    if (mode === 'dead') n1.kill();
    for (let d = 0; d < 20; d++) { p.ev('dayTick()'); if (mode !== 'solo') { p.net.advance(30000); await settle(3); } }
    if (mode === 'flaky') n1.kill();
    for (let d = 0; d < 20; d++) p.ev('dayTick()');
    assert.deepEqual(p.errors, []);
    // Ids and log times come from the wall clock; everything else must be the same.
    return p.ev('JSON.stringify({...S,fed:null,fedn:null,fedp:null,cam:null,sv:null})').replace(/"id":"[^"]*"/g, '"id":0').replace(/"at":\d+/g, '"at":0');
  };
  const solo = await days('solo');
  assert.equal(await days('dead'), solo);
  assert.equal(await days('flaky'), solo);
});

test('a save that never joined opens no socket, sets no timer and makes no request', async () => {
  const p = fedPage();
  p.net.node(URL1);
  p.ev('ACT.start({})');
  for (let d = 0; d < 5; d++) p.ev('dayTick()');
  await settle();
  assert.equal(p.net.opened.length, 0);
  assert.equal(p.net.timers.length, 0);
  assert.equal(p.ev('FED.live'), null);
  assert.equal(p.ev('FED.listening'), false);
  assert.equal(p.ev('S.fed'), null);
});

test('a server gone for good: leave it, join another, and the identity and deals are intact', async () => {
  const p = fedPage();
  const a = p.net.node(URL1), b = p.net.node('wss://other.example.org/fed', { server: SERVERS_JSON.servers[1].id });
  await joinGame(p);
  const pub = p.ev('S.fed.key.pub');
  p.ev(`S.fed.deals.push({id:'${'A'.repeat(43)}',deal:'peering',key:'${key('bob').pub}',name:'Bob Net',asn:4281146038,start:${NOW},end:null,terms:{at:['fra'],via:'ix'}})`);
  a.kill();
  p.net.advance(14 * 86400 * 1000);
  await p.ev(`ACT.fedLeave({url:${JSON.stringify(URL1)}})`);
  assert.equal(p.ev('S.fed.on'), false);
  assert.equal(await p.ev("ACT.fedJoin({url:'wss://other.example.org/fed'})"), null);
  assert.ok(await until(async () => (await settle(5), status(p).state === 'connected')));
  assert.equal(p.ev('S.fed.key.pub'), pub, 'same network');
  assert.equal(p.ev('S.fed.deals.length'), 1);
  assert.deepEqual(p.ev('JSON.stringify(S.fed.servers)'), JSON.stringify(['wss://other.example.org/fed']));
  assert.ok(b.hellos >= 1);
  assert.deepEqual(p.errors, []);
});

test('a peer silent for 7, 20 and 40 days: unchanged, fading, dark; heard again, back; forgotten after 180', async () => {
  const p = fedPage();
  const n1 = p.net.node(URL1);
  const ann = rec('bob', 'announce', NOW - 100, { name: 'Bob Net', asn: 4281146038, box: box('bob'), home: 'DE', day: 10, founded: 20454, pops: ['fra'], ix: ['fra'], cust: 1,
    mix: { content: 0, eyeball: 1000, enterprise: 0 }, traffic: { in: 1, out: 1 }, policy: 'open', rates: {}, auto: { peering: 'auto', transit: 'decline', pni: 'decline', swap: 'decline', consortium: 'decline', port: 'decline' } });
  n1.feed = [{ rec: ann, rcpt: [] }];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedNetworks()')).length === 1)), 'bob arrived');
  const at = async (days) => JSON.parse(JSON.stringify(await p.ev(`fedNetworks(${NOW} + ${days}*86400).then(l=>l.map(n=>n.quiet))`)));
  assert.equal((await at(6))[0].state, 'active');
  assert.equal((await at(20))[0].state, 'fading');
  assert.ok((await at(20))[0].factor < 1000 && (await at(20))[0].factor > 0);
  assert.deepEqual((await at(40))[0], { state: 'dark', factor: 0 });
  // Heard again (any record of his): back to active.
  await p.ev(`fedHeard('${key('bob').pub}', ${NOW} + 40*86400)`);
  assert.equal((await at(40))[0].state, 'active');
  assert.deepEqual(await at(40 + 181), [], 'forgotten from the cache');
  assert.deepEqual(p.errors, []);
});

test('without IndexedDB (a private window) the cache works from memory and the game plays on', async () => {
  const p = fedPage({ idb: false });
  p.ev('FED.idb=()=>{throw new Error("blocked")}');
  const n1 = p.net.node(URL1);
  n1.exclude([key('mallory').pub]);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedShunned()')).length === 1)), 'the excluded list kept in memory');
  p.ev('dayTick()');
  assert.deepEqual(p.errors, []);
});

test('the worker copy of the game never starts a session', () => {
  const { ev } = load();
  ev('globalThis.__TUBES_WORKER__=1;FED.set=()=>{throw new Error("no timers in the worker")};ACT.start({})');
  ev("S.fed={on:true,key:null,servers:['wss://relay.example.net/fed']};sanitize(S)");
  assert.equal(ev('FED.live'), null);
});
