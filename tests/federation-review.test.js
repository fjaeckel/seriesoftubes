// Review findings on the multiplayer client, one regression test each: how connections keep their place and back off
// (§9.3), what IndexedDB keeps per network, and deal rules around renewals, waves, consortium shares and the review
// queue (§10.10). Fake nodes, a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, URL2, NOW, PL_ENTRY, rec, rid, key, asn, box, sealRec } = require('./helpers/fed');

const DAY = 86400;
const AUTO = { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto', wave: 'auto' };
const J = JSON.stringify;
const run = async (p, ms = 1000) => { for (let t = 0; t < ms; t += 250) { p.net.advance(250); await settle(); } };
// A node that records every frame, and lets o[m](ws, frame, node) answer a kind itself (true: instead of the node).
function spy(p, url = URL1, o = {}) {
  const n = p.net.node(url); n.got = []; const take = n.take.bind(n);
  n.take = (ws, text) => { const f = JSON.parse(text); n.got.push(f); if (o[f.m] && o[f.m](ws, f, n)) return; take(ws, text); };
  return n;
}
function ann(name, over = {}, t = NOW - 60) {
  const k = key(name);
  return rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30,
    mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {}, auto: AUTO, ...over });
}
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
async function game(feed, setup) {
  const p = fedPage(), n = p.net.node(URL1);
  n.feed = feed.map((r) => ({ rec: r, rcpt: [] }));
  assert.equal(await joinGame(p), null);
  p.ev('S.fed.joined-=100');
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});" + (setup || ''));
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')), 'connected');
  const nets = feed.filter((r) => r.kind === 'announce').length;
  const ready = `!!(S.fedn&&S.fedn.nets.length===${nets}&&S.fedp&&S.fedp.mine.length&&S.fedp.leakD)`;
  for (let i = 0; i < 60 && !p.ev(ready); i++) { p.net.advance(1000); await until(async () => (await settle(5), p.ev(ready)), 300); }
  assert.ok(p.ev(ready), 'players built, terms announced');
  await p.ev('fedPlayRefresh()');
  await settle(10);
  return { p, n };
}
// The node's next sync sends recs: every socket drops, and the game reconnects (waiting out its back-off).
async function resync(p, n, recs) {
  n.feed = recs.map((r) => ({ rec: r, rcpt: [] }));
  for (const ws of n.socks) ws.drop();
  await settle(10);
  for (let i = 0; i < 40 && p.ev('fedStatus().state') !== 'connected' || i < 1; i++) { p.net.advance(2500); await settle(20); }
}
const spyToasts = (p) => p.ev('window.__t=[];{const T0=toast;toast=(h,k,a,o)=>{__t.push({h:String(h),acts:(a||[]).map(x=>x.act)});return T0(h,k,a,o);};}');
// Selling transit under review: the card is announced, an offer from alice waits, the seller accepts it.
async function sellTransit(mode = 'review') {
  const { p, n } = await game([ann('alice')]);
  p.ev(`fedTermsApply({pol:'open',rates:{transit:{perGbps:1,commit:[],term:30}},auto:{transit:'${mode}'}})`);
  assert.ok(await until(async () => (await settle(5), p.ev('!!(S.fedp.mine[0]&&S.fedp.mine[0].body.rates.transit)'))), 'card announced');
  const mine = json(p, 'S.fedp.mine[0]'), to = p.ev('S.fed.key.pub');
  const terms = { mbps: 10000, perGbps: mine.body.rates.transit.perGbps, term: 30, at: ['fra'] };
  const offer = (dt, renews) => sealRec('alice', 'offer', p.net.now() + dt, { to, deal: 'transit', basis: mine.id, terms, ...(renews ? { renews } : {}) }, to, mine.body.box);
  return { p, n, offer };
}

/* ---------- connections and what IndexedDB keeps ---------- */

test('C1: sync cursors are kept per network, so another save on this device does not skip this one\'s deals', async () => {
  const REG = { asOf: NOW - (NOW % DAY), at: NOW, servers: [PL_ENTRY] };
  const p = fedPage(), n = spy(p);
  await p.ev(`fedPut('kv','registry',${J(REG)})`);
  assert.equal(await p.ev(`fedOpKeySet(${J(key('anna').seed)})`), true);
  await joinGame(p); await run(p, 3000);
  const pub1 = p.ev('S.fed.key.pub');
  assert.equal(await p.ev(`fedGet('kv',${J('cursor:' + URL1 + '#' + pub1)})`), 'c1');
  assert.deepEqual(Object.keys(await p.ev("fedGet('kv','vcursors')") || {}), [URL1 + '#' + pub1], 'vote cursors too');
  const from = n.got.length;
  await joinGame(p); await run(p, 3000);
  assert.notEqual(p.ev('S.fed.key.pub'), pub1, 'a second network');
  const subs = n.got.slice(from).filter((f) => f.m === 'sub');
  assert.equal(subs.find((f) => f.kinds.includes('offer')).since, '', 'it syncs from the start');
  assert.equal(subs.find((f) => f.kinds.includes('shun')).since, '', 'and its votes from the start');
});

test('C2: when the node does not take this network\'s auth, the game does not subscribe and tries again later', async () => {
  const p = fedPage(), n = spy(p, URL1, { auth: (ws, f, node) => { node.send(ws, { m: 'err', id: f.id, code: 'internal' }); return true; } });
  await joinGame(p); await run(p, 1000);
  assert.equal(n.got.filter((f) => f.m === 'sub').length, 0, 'no sub without this network proved');
  assert.equal(await p.ev(`fedGet('kv',${J('cursor:' + URL1 + '#')}+S.fed.key.pub)`), null, 'no cursor kept');
  const h = n.hellos; await run(p, 10000);
  assert.ok(n.hellos > h, 'it reconnects');
  assert.equal(n.got.filter((f) => f.m === 'sub').length, 0);
});

test('C3: a node that hangs up right after the sub is not redialled every two seconds', async () => {
  const p = fedPage(), n = spy(p, URL1, { sub: (ws, f, node) => { node.net.later(() => ws.drop()); return true; } });
  await joinGame(p); await run(p, 1000);
  const h0 = n.hellos; await run(p, 120000);
  assert.ok(n.hellos - h0 <= 10, `backs off (${n.hellos - h0} hellos in 2 minutes)`);
});

test('C3: a connection-level rate limit is waited out', async () => {
  const p = fedPage(), n = spy(p, URL1, { hello: (ws, f, node) => { node.hellos++; node.send(ws, { m: 'err', code: 'rate_limited', retry: 30 }); return true; } });
  await joinGame(p); await run(p, 1000);
  assert.equal(n.hellos, 1);
  await run(p, 28000);
  assert.equal(n.hellos, 1, 'no new hello before the retry');
  await run(p, 20000);
  assert.ok(n.hellos >= 2, 'then it tries again');
});

test('C3: a connection that stayed up a while starts its back-off from the beginning', async () => {
  const p = fedPage(), n = spy(p);
  await joinGame(p); await run(p, 1000);
  // A few quick drops grow the back-off...
  for (let i = 0; i < 4; i++) { for (const ws of n.socks) ws.drop(); await run(p, 40000); }
  assert.equal(p.ev('fedStatus().state'), 'connected');
  await run(p, 70000);
  // ...a minute connected resets it.
  const h = n.hellos; for (const ws of n.socks) ws.drop(); await run(p, 2500);
  assert.equal(n.hellos, h + 1, 'redialled within the first back-off step');
});

test('C4: a sealed deal waiting for its sender\'s announce survives a reload and opens once the announce comes', async () => {
  const { p, n } = await game([ann('alice')]);
  const mine = json(p, 'S.fedp.mine[0]'), to = p.ev('S.fed.key.pub');
  const o = sealRec('bob', 'offer', p.net.now(), { to, deal: 'peering', basis: mine.id, terms: { at: ['fra'], via: 'ix' } }, to, mine.body.box);
  await resync(p, n, [o]);
  assert.ok(await until(async () => (await settle(5), (await p.ev(`fedGet('kv','dpend#'+S.fed.key.pub)`) || []).length === 1)), 'kept in IndexedDB');
  // A reload: the memory is gone, the session starts again.
  p.ev('fedStop();FED.dpend=[];window.__dl=[];fedOn("deal",e=>__dl.push(e.id));fedWake();');
  await resync(p, n, [ann('bob', { name: 'Bob Net' }, p.net.now() - 30)]);
  assert.ok(await until(async () => (await settle(5), p.ev('__dl.length') === 1)), 'the deal opened');
  assert.equal(p.ev('__dl[0]'), rid(o));
  assert.equal((await p.ev(`fedGet('kv','dpend#'+S.fed.key.pub)`)).length, 0, 'and left the store');
});

test('C4: pending deals are capped per network, oldest first, and expire after 30 days', async () => {
  const { p } = await game([ann('alice')]);
  const r = await p.ev(`(async()=>{const f=S.fed;for(let i=0;i<300;i++)await fedDealIn(f,{rec:{v:1,kind:'offer',key:'${key('zed').pub}',t:${NOW}+i,body:{to:f.key.pub,enc:'x'}},id:'p'+i,slot:0,server:'s'});
    const o=await fedGet('kv','dpend#'+f.key.pub);return o.length+' '+o[0].id;})()`);
  assert.equal(r, '256 p44');
  p.ev(`FED.now=()=>${NOW + 31 * DAY}`);
  await p.ev('fedDealRetry(S.fed)');
  assert.equal((await p.ev(`fedGet('kv','dpend#'+S.fed.key.pub)`)).length, 0);
});

test('C5: offline boards show this network\'s own row, never another save\'s', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  n.ranks = { slot: 0, n: 1, rows: [], me: { rank: 7, value: 1234 } };
  await joinGame(p); await run(p, 2000);
  assert.equal((await p.ev('fedRankView({board:"pops"})')).me.rank, 7);
  await run(p, 1000);
  n.kill(); await joinGame(p); await run(p, 2000);
  const v = await p.ev('fedRankView({board:"pops"})');
  assert.equal(v.me, null);
});

test('C6: a record taken by the servers left leaves the queue; replaced records leave no trace', async () => {
  const p = fedPage(), n2 = p.net.node(URL2); p.net.node(URL1); n2.up = false;
  await joinGame(p, URL1); await p.ev(`fedJoin(${J(URL2)})`); await run(p, 3000);
  await p.ev("(async()=>{const r=await fedSignMine('leave',{});fedQueue(r);})()"); await run(p, 2000);
  assert.ok(p.ev("S.fed.out.some(r=>r.kind==='leave')"), 'waits for the second server');
  const s1 = await p.ev("(async()=>{const r=await fedSignRec(S.fed.key.priv,'stats',fedStatsBody(),fedNow());fedQueue(r);return fedRid(r);})()");
  await run(p, 2000);
  assert.ok(p.ev(`FED.sent.has(${J(s1)})`), 'taken by one server');
  await p.ev("(async()=>{const r=await fedSignRec(S.fed.key.priv,'stats',{...fedStatsBody(),pies:7},fedNow()+1);fedQueue(r);})()");
  assert.equal(p.ev(`FED.sent.has(${J(s1)})`), false, 'the replaced stats leaves FED.sent');
  await p.ev(`fedLeave(${J(URL2)})`); await run(p, 2000);
  await p.ev("(async()=>{const r=await fedSignRec(S.fed.key.priv,'stats',fedStatsBody(),fedNow()+2);fedQueue(r);})()"); await run(p, 3000);
  assert.equal(p.ev('S.fed.servers.join()'), URL1);
  assert.equal(p.ev("S.fed.out.map(r=>r.kind).join()"), '', 'nothing left waiting');
});

test('C7: a new announce replaces the queued one even when the queue is full', async () => {
  const p = fedPage(); p.ev('ACT.start({})');
  const r = p.ev(`(()=>{const f=fedNewState();f.out=[{kind:'announce',key:'k',t:1,body:{n:0}}];for(let i=0;i<64;i++)f.out.push({kind:'offer',key:'k',t:1,body:{n:i}});
    const ok=fedQueue({kind:'announce',key:'k',t:2,body:{n:1}},f);return ok+' '+f.out.filter(x=>x.kind==='announce').map(x=>x.t).join()+' '+f.out.length;})()`);
  assert.equal(r, 'true 2 65');
  const b = p.ev(`(()=>{const f=fedNewState();f.out=[];for(let i=0;i<64;i++)f.out.push({kind:'offer',key:'k',t:1,body:{n:i}});return fedQueue({kind:'offer',key:'k',t:2,body:{n:99}},f);})()`);
  assert.equal(b, false, 'offers are still refused when full');
});

/* ---------- gameplay ---------- */

test('G1: a save with many ended deals keeps its running ones on load, and ended ones are pruned as deals are added', async () => {
  const p = fedPage(); p.ev('ACT.start({})');
  const k = key('alice').pub;
  const r = p.ev(`(()=>{const B='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',id=i=>B[i>>6]+B[i&63]+'A'.repeat(41);
    const mk=(i,st)=>({id:id(i),deal:'peering',key:'${k}',name:'A',asn:1,start:1,end:null,terms:{at:['fra'],via:'ix'},role:'peer',st,on:st==='run',rep:0,why:st==='over'?'term':'',ai:false});
    const deals=[];for(let i=0;i<300;i++)deals.push(mk(i,'over'));deals.push(mk(300,'run'));deals.push(mk(301,'wait'));
    const s={day:0,fed:{key:{pub:'${k}'},servers:[],deals}};fedSanitize(s);
    const L=s.fed.deals,f={deals:L.slice()};fedDealAdd(f,mk(400,'wait'));
    return [L.length,L.filter(d=>d.st!=='over').length,L[0].id,L.findIndex(d=>d.st==='run'),f.deals.length,f.deals[f.deals.length-1].id,f.deals[0].id].join(' ');})()`);
  const id = (i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[i >> 6] + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[i & 63] + 'A'.repeat(41);
  // 256 kept: the two running or waiting, then the newest 254 ended (46 to 299), in their order.
  assert.equal(r, ['256', '2', id(46), '254', '256', id(400), id(47)].join(' '));
});

test('G2: tapping Renew twice books one renewal, and Renew is gone once one exists', async () => {
  const { p } = await game([ann('alice', { rates: { transit: { perGbps: 100, commit: [], term: 30 } } })]);
  const k = key('alice').pub;
  assert.equal(await p.ev(`fedRequest('${k}','transit',{at:'fra',mbps:10000})`), null);
  const d = json(p, 'S.fed.deals[0]');
  p.ev(`FED.now=()=>${d.end - 3 * DAY}`);
  assert.match(p.ev(`fedDealRow(S.fed.deals[0])`), /fpRenew/, 'Renew offered in the last week');
  p.ev('FED.now=()=>__net.now()');
  await p.ev(`ACT.fpRenew({id:'${d.id}'})`);
  await p.ev(`ACT.fpRenew({id:'${d.id}'})`);
  assert.equal(p.ev('S.fed.deals.length'), 2, 'one renewal');
  assert.equal(p.ev('S.fed.deals[1].renews'), d.id);
  p.ev(`FED.now=()=>${d.end - 3 * DAY}`);
  assert.doesNotMatch(p.ev(`fedDealRow(S.fed.deals[0])`), /fpRenew/, 'no second Renew');
  p.ev('FED.now=()=>__net.now()');
});

test('G2: a seller books one renewal of a deal, and declines a second', async () => {
  const { p, n, offer } = await sellTransit('auto');
  const o1 = offer(0);
  await resync(p, n, [o1]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.deals.length') === 1)));
  p.ev('window.__ans=[];{const A=fedAnswer;fedAnswer=(s,r,id,why)=>{__ans.push([id,why]);return A(s,r,id,why);};}');
  const o2 = offer(5, rid(o1)), o3 = offer(9, rid(o1));
  await resync(p, n, [o2, o3]);
  assert.ok(await until(async () => (await settle(5), p.ev('__ans.length') === 1)));
  assert.equal(p.ev('S.fed.deals.length'), 2, 'one renewal booked');
  assert.equal(p.ev('__ans[0][0]'), rid(o3), 'the second is declined');
});

test('G3: a renewal accepted under review starts when the renewed deal ends (seller)', async () => {
  const { p, n, offer } = await sellTransit('review');
  const o1 = offer(0);
  await resync(p, n, [o1]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.rq.length') === 1)));
  assert.equal(await p.ev(`fedAcceptRq('${rid(o1)}')`), null);
  const o2 = offer(5, rid(o1));
  await resync(p, n, [o2]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.rq.length') === 1)));
  assert.equal(await p.ev(`fedAcceptRq('${rid(o2)}')`), null);
  const [a, b] = json(p, 'S.fed.deals');
  assert.equal(b.start, a.end, 'the renewal starts at the old end');
  assert.equal(b.end, a.end + 30 * DAY);
  p.ev('fedDealsOn(S,fedNow())');
  assert.equal(p.ev('S.fed.deals.filter(d=>d.on).length'), 1, 'only one bills now');
});

test('G3: a renewal accepted under review starts when the renewed deal ends (buyer)', async () => {
  const A = (t) => ann('alice', { rates: { transit: { perGbps: 100, commit: [], term: 30 } }, auto: { ...AUTO, transit: 'review' } }, t);
  const { p, n } = await game([A()]);
  const k = key('alice').pub, me = p.ev('S.fed.key.pub');
  assert.equal(await p.ev(`fedRequest('${k}','transit',{at:'fra',mbps:10000})`), null);
  const d1 = json(p, 'S.fed.deals[0]');
  await resync(p, n, [A(p.net.now() - 30), rec('alice', 'accept', p.net.now(), { offer: d1.id, to: me })]);
  assert.ok(await until(async () => (await settle(5), p.ev("S.fed.deals[0].st==='run'"))));
  const old = json(p, 'S.fed.deals[0]');
  await p.ev(`ACT.fpRenew({id:'${old.id}'})`);
  const d2 = json(p, 'S.fed.deals[1]');
  assert.equal(d2.st, 'wait');
  await resync(p, n, [A(p.net.now() - 30), rec('alice', 'accept', p.net.now(), { offer: d2.id, to: me })]);
  assert.ok(await until(async () => (await settle(5), p.ev("S.fed.deals[1].st==='run'"))));
  assert.equal(p.ev('S.fed.deals[1].start'), old.end);
});

const LIT = "S.links.push({id:'D1',a:'ams',b:'fra',kind:'df',own:true,sys:'cl',ch:['zr4'],km:Math.round(kmBetween('ams','fra')*1.05),ready:0,day:0,cut:0,mo:100,trench:'own:D1',pairs:1});compute();";
async function sellWave(mode) {
  const { p, n } = await game([ann('alice')], LIT);
  p.ev(`fedTermsApply({pol:'open',rates:{wave:{routes:[{a:'ams',b:'fra'}],sizes:[{gbps:400,monthly:1e9}],term:90}},auto:{wave:'${mode}'}})`);
  assert.ok(await until(async () => (await settle(5), p.ev('!!(S.fedp.mine[0]&&S.fedp.mine[0].body.rates.wave)'))));
  const mine = json(p, 'S.fedp.mine[0]'), to = p.ev('S.fed.key.pub'), ceil = p.ev("fedWaveCeil('ams','fra',400)");
  const terms = { a: 'ams', b: 'fra', gbps: 400, monthly: ceil, term: 90 };
  const offer = (dt, renews) => sealRec('alice', 'offer', p.net.now() + dt, { to, deal: 'wave', basis: mine.id, terms, ...(renews ? { renews } : {}) }, to, mine.body.box);
  return { p, n, offer };
}

test('G4: renewing a wave on a full route counts the room of the wave it replaces (review)', async () => {
  const { p, n, offer } = await sellWave('review');
  const o1 = offer(0);
  await resync(p, n, [o1]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.rq.length') === 1)));
  assert.equal(await p.ev(`fedAcceptRq('${rid(o1)}')`), null);
  p.ev('compute()');
  assert.equal(p.ev("fedWaveRoom('ams','fra',400)"), false, 'the route is full');
  const o2 = offer(5, rid(o1));
  await resync(p, n, [o2]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.rq.length') === 1)));
  assert.equal(await p.ev(`fedAcceptRq('${rid(o2)}')`), null);
  assert.equal(p.ev('S.fed.deals.length'), 2);
});

test('G4: renewing a wave on a full route counts the room of the wave it replaces (automatic)', async () => {
  const { p, n, offer } = await sellWave('auto');
  const o1 = offer(0);
  await resync(p, n, [o1]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.deals.length') === 1)));
  p.ev('compute()');
  await resync(p, n, [offer(5, rid(o1))]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.deals.length') === 2)), 'the renewal binds');
  // A new wave (no renewal) still needs room of its own.
  p.ev('window.__ans=[];{const A=fedAnswer;fedAnswer=(s,r,id,why)=>{__ans.push([id,why]);return A(s,r,id,why);};}');
  await resync(p, n, [offer(9)]);
  assert.ok(await until(async () => (await settle(5), p.ev('__ans.length') === 1)));
  assert.equal(p.ev('__ans[0][1]'), 'conditions');
});

test('G5: a consortium project with a share under the honest price costs the honest price', async () => {
  const { p, n } = await game([ann('alice')], "ACT.buildPop({city:'nyc'});");
  const o = rec('alice', 'offer', p.net.now(), { deal: 'consortium', terms: { name: 'Free Tube', a: 'ams', b: 'nyc', members: 2, share: 0, pairs: 16 } });
  await resync(p, n, [o]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.cons.length') === 1)));
  const honest = p.ev("fedConsShare('ams','nyc',16)");
  assert.ok(honest > 0);
  assert.equal(p.ev('S.fedp.cons[0].sh'), honest, 'shown at the honest price');
  const c0 = p.ev('S.cash');
  // Funded at once (two members): the first fibre's goal pays its reward in the same step.
  assert.equal(await p.ev(`fedConsJoin('${rid(o)}')`), null);
  assert.equal(c0 - p.ev('S.cash'), honest - 10000, 'and charged it (less the goal reward)');
  assert.equal(p.ev('S.links.find(l=>l.seat).paid'), honest);
  // A project kept by an older game at a lower share is charged the honest price when funded.
  p.ev(`S.fedp.cons.push({id:'x'.repeat(43),k:'${key('alice').pub}',name:'Old',a:'ams',b:'nyc',m:2,sh:0,pr:16,sg:['${key('alice').pub}'],t:${NOW},st:'open',me:false})`);
  p.ev('S.cash=1e9');
  const c1 = p.ev('S.cash');
  assert.equal(await p.ev(`fedConsJoin('${'x'.repeat(43)}')`), null);
  assert.equal(c1 - p.ev('S.cash'), honest);
});

test('G6: a full review queue declines the offer it lets go, so its sender is not left waiting', async () => {
  const { p, n } = await game([ann('alice')]);
  p.ev("fedTermsApply({pol:'open',rates:{},auto:{peering:'review'}})");
  assert.ok(await until(async () => (await settle(5), p.ev("S.fedp.mine[0]&&S.fedp.mine[0].body.auto.peering==='review'"))));
  const mine = json(p, 'S.fedp.mine[0]'), to = p.ev('S.fed.key.pub');
  const offers = [];
  for (let i = 0; i < 33; i++) offers.push(sealRec('alice', 'offer', p.net.now() + i, { to, deal: 'peering', basis: mine.id, terms: { at: ['fra'], via: 'ix' } }, to, mine.body.box));
  p.ev('window.__ans=[];{const A=fedAnswer;fedAnswer=(s,r,id,why)=>{__ans.push([id,why]);return A(s,r,id,why);};}');
  await resync(p, n, offers);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.rq.length') === 32 && p.ev('__ans.length') === 1)));
  assert.deepEqual(json(p, '__ans'), [[rid(offers[0]), 'declined']]);
  assert.equal(p.ev(`S.fedp.rq.some(q=>q.id===${J(rid(offers[0]))})`), false);
  assert.equal(p.ev(`S.fedp.rq.some(q=>q.id===${J(rid(offers[32]))})`), true);
});

test('G7: a deal that ran its term offers Renew to its buyer only', async () => {
  const { p, n, offer } = await sellTransit('auto');
  await resync(p, n, [offer(0)]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.deals.length') === 1)));
  spyToasts(p);
  p.ev('fedDealsOn(S,S.fed.deals[0].end+10)');
  assert.equal(p.ev("S.fed.deals[0].st"), 'over');
  assert.deepEqual(json(p, '__t.map(t=>t.acts)'), [[]], 'the seller gets the notice without Renew');
  p.ev("S.fed.deals[0].st='run';S.fed.deals[0].role='buy';__t.length=0;fedDealsOn(S,S.fed.deals[0].end+10)");
  assert.deepEqual(json(p, '__t.map(t=>t.acts)'), [['fpRenew']], 'the buyer gets Renew');
});

test('G8: policy and request modes are checked against their lists, not any key of an object', async () => {
  const { p } = await game([ann('alice')]);
  p.ev("fedTermsApply({pol:'open'})");
  p.ev("fedTermsApply({pol:'constructor'})");
  assert.equal(p.ev('S.fedp.pol'), 'open');
  p.ev("UI.fpDraft=null;fedTermsEdit('pol','toString');fedTermsEdit('a.peering','constructor')");
  assert.equal(p.ev('UI.fpDraft.pol'), 'open');
  assert.equal(p.ev("['auto','review','decline'].includes(UI.fpDraft.auto.peering)"), true);
  // A deal ended for a reason this version does not know (a save from elsewhere) still shows a state.
  p.ev("S.fed.deals.push({id:'y'.repeat(43),deal:'peering',key:'" + key('alice').pub + "',name:'A',asn:1,start:1,end:null,terms:{at:['fra'],via:'ix'},role:'peer',st:'over',on:false,rep:0,why:'constructor',ai:false})");
  assert.equal(typeof p.ev('fedDealState(S.fed.deals[S.fed.deals.length-1])'), 'string');
  assert.doesNotMatch(p.ev('fedDealState(S.fed.deals[S.fed.deals.length-1])'), /function|native/);
  assert.deepEqual(p.errors, []);
});
