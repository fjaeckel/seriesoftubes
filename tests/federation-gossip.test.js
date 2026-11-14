// Catalog gossip in the browser (§10.8): every path element a server id, a bounded list, a merge in one pass, the
// catalog read again only when it changed, and hide lists kept and applied only for the servers a save joined.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, NOW, PL, URL1, key, rec } = require('./helpers/fed');

const ID = (i) => ('x' + i).padEnd(43, 'A'); // server-id shaped (43 base64url characters, the last one A)

test('gossip with a path element that is not a server id is not kept', async () => {
  const p = fedPage({ registry: null });
  const n = p.net.node(URL1);
  n.gossip = [{ genesis: PL.genesis, chain: PL.chain, server: PL.server, path: [PL.id, 'not a server id'], seen: NOW - 5 }];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
  await settle(50);
  assert.ok(!((await p.ev("fedGet('kv','gossip')")) || []).some((g) => g.id === PL.id));
  assert.deepEqual(p.errors, []);
});

test('merging the catalog reads each gossip entry a bounded number of times, with the same answer', async () => {
  const p = fedPage();
  const r = JSON.parse(p.ev(`(()=>{let reads=0;const n=2000,gos=[],reg=[];
    for(let i=0;i<n;i++){const id=('x'+(i%500)).padEnd(43,'A');
      const g={id,server:{rid:'r'+(i%7),t:1000+(i%13),name:'s'+i,nodes:[],operators:[]},path:[id],seen:${NOW}-(i%97)};
      gos.push(new Proxy(g,{get(o,k){reads++;return o[k];}}));if(i<50)reg.push({id,server:{rid:'R',t:1,name:'reg',nodes:[],operators:[]}});}
    const out=fedCatalogMerge(reg,gos,${NOW}),merged=reads;
    // The answer as the rule says (§10.8): for each id the freshest entry (seen, then path) and the newest record.
    const want=new Map();for(const g of gos){if(!want.has(g.id))want.set(g.id,[]);want.get(g.id).push(g);}
    let same=out.length===want.size;for(const row of out){const l=want.get(row.id);
      const b=l.reduce((a,g)=>!a||g.seen>a.seen||g.seen===a.seen&&fedPathLess(g.path,a.path)?g:a,null);
      const s=l.reduce((a,g)=>!a||g.server.t>a.t||g.server.t===a.t&&g.server.rid<a.rid?g.server:a,null);
      if(row.seen!==b.seen||(row.source==='gossip'&&row.rid!==s.rid)||(row.source==='registry'&&row.rid!=='R'))same=false;}
    return JSON.stringify({reads:merged,n,same});})()`));
  assert.ok(r.same, 'the one-pass merge gives what the rule says');
  // Well under what a pass per server costs (n x servers).
  assert.ok(r.reads < 40 * r.n, `${r.reads} reads of ${r.n} entries`);
  assert.deepEqual(p.errors, []);
});

test('the gossip kept is bounded, the freshest staying', async () => {
  const p = fedPage({ registry: null });
  const old = [];
  for (let i = 0; i < 1000; i++) old.push({ id: ID(i), server: { rid: 'r', t: 1, name: 's', nodes: [], operators: [] }, path: [ID(i)], seen: NOW - 1000 + i, impl: {} });
  await p.ev(`fedPut('kv','gossip',${JSON.stringify(old)})`);
  const n = p.net.node(URL1);
  n.gossip = [{ genesis: PL.genesis, chain: PL.chain, server: PL.server, path: [PL.id], seen: NOW - 5 }];
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev("fedGet('kv','gossip')")).some((g) => g.id === PL.id))));
  const kept = await p.ev("fedGet('kv','gossip')");
  const max = p.ev('FED_GOSSIP_MAX');
  assert.ok(max <= 500, 'a few hundred');
  assert.equal(kept.length, max);
  assert.ok(kept.every((g) => g.seen >= NOW - max), 'the stalest went first');
  assert.deepEqual(p.errors, []);
});

test('the catalog is read again only after it changed or an entry expired', async () => {
  const p = fedPage({ registry: null });
  p.ev("window.__reads=0;const g0=fedGet;fedGet=(s,k)=>{if(s==='kv'&&k==='gossip')__reads++;return g0(s,k);}");
  const g = [{ id: ID(1), server: { rid: 'r', t: 1, name: 'one', nodes: [], operators: [] }, path: [ID(1)], seen: NOW - 10, impl: {} }];
  await p.ev(`fedPut('kv','gossip',${JSON.stringify(g)})`);
  assert.equal((await p.ev('fedServers()')).length, 1);
  const r0 = p.ev('__reads');
  for (let i = 0; i < 5; i++) await p.ev('fedServers()');
  assert.equal(p.ev('__reads'), r0, 'unchanged: not read again');
  g.push({ ...g[0], id: ID(2), path: [ID(2)], server: { ...g[0].server, name: 'two' } });
  await p.ev(`fedPut('kv','gossip',${JSON.stringify(g)})`);
  assert.equal(await p.ev("fedServers().then(l=>l.map(s=>s.name).sort().join())"), 'one,two', 'a write is seen at once');
  p.ev(`FED.now=()=>${NOW + 604800}`);
  assert.equal(await p.ev('fedServers().then(l=>l.length)'), 0, 'expired entries go without a write');
  assert.deepEqual(p.errors, []);
});

test('hide lists: kept only from the joined server, dropped when it leaves the catalog, names only from joined ones', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  const other = ID(9);
  const reg = { asOf: NOW, at: NOW, servers: [
    { id: PL.id, rid: PL.id, t: NOW - 86400, name: 'P', nodes: [{ key: key('node1').pub, url: URL1 }], operators: [key('op1').pub], listed: NOW - 5184000, answered: NOW },
    { id: other, rid: other, t: NOW - 86400, name: 'O', nodes: [{ key: key('node9').pub, url: 'wss://other.example.net/fed' }], operators: [key('op9').pub], listed: NOW - 5184000, answered: NOW }] };
  const hide = (who, srv, names) => rec(who, 'hide', NOW - 50, { server: srv, hide: [], names, refuse: [] });
  // The joined server's node passes on another server's hide list too (advice): not kept.
  n.feed = [{ rec: hide('op1', PL.id, [key('alice').pub]), rcpt: [] }, { rec: hide('op9', other, [key('bob').pub]), rcpt: [] }];
  await p.ev(`fedPut('kv','registry',${JSON.stringify(reg)})`);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), !!(await p.ev(`fedGet('kv','hide:'+${JSON.stringify(PL.id)})`)))));
  await settle(20);
  assert.equal(await p.ev(`fedGet('kv','hide:'+${JSON.stringify(other)})`), null, 'another server\'s list is not kept');
  // One kept anyway (from before): its names are not applied for this player.
  await p.ev(`(async()=>{const r=${JSON.stringify(hide('op9', other, [key('bob').pub]))};await fedHidePut(${JSON.stringify(other)},{rec:r,id:await fedId(r)});})()`);
  await p.ev("(async()=>{UI.fu={v:'glass'};await fuLoadRun();})()");
  const names = JSON.parse(p.ev('JSON.stringify([...FU.hideNames])'));
  assert.ok(names.includes(key('alice').pub), 'the joined server\'s list hides names');
  assert.ok(!names.includes(key('bob').pub), 'a server not joined hides no names');
  // The other server leaves the catalog: its list goes.
  await p.ev(`fedPut('kv','registry',${JSON.stringify({ ...reg, servers: [reg.servers[0]] })})`);
  await p.ev('fedServers()');
  assert.equal(await p.ev(`fedGet('kv','hide:'+${JSON.stringify(other)})`), null, 'dropped with its server');
  assert.ok(await p.ev(`fedGet('kv','hide:'+${JSON.stringify(PL.id)})`), 'the joined server\'s stays');
  assert.deepEqual(p.errors, []);
});
