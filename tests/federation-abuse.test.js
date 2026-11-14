// What a player with a modified game (or a script with valid keys) can push through the servers into other players'
// games, one regression test each: flooding the announce store, renewing someone else's deal, inflating a seller's
// books, a changing founded day, filling the consortium list and the review queue, choosing the day's leaker and
// co-founding terms off the lists. Fake nodes, a virtual clock; seeded, nothing left to luck.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, rid, key, asn, box, sealRec } = require('./helpers/fed');
const { load } = require('./harness');

const DAY = 86400;
const AUTO = { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto', wave: 'auto' };
const J = JSON.stringify;
function ann(name, over = {}, t = NOW - 60) {
  const k = key(name);
  return rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30,
    mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {}, auto: AUTO, ...over });
}
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const plain = (v) => JSON.parse(JSON.stringify(v));
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
const spyAnswers = (p) => p.ev('window.__ans=[];{const A=fedAnswer;fedAnswer=(s,r,id,why)=>{__ans.push([id,why]);return A(s,r,id,why);};}');
// Selling transit (auto): the card is announced; offer(from, dt, over) is a transit offer on it from that network.
async function sellTransit(feed = [ann('alice')], card = { perGbps: 1, commit: [], term: 30 }) {
  const { p, n } = await game(feed);
  p.ev(`fedTermsApply({pol:'open',rates:{transit:${J(card)}},auto:{transit:'auto',peering:'auto'}})`);
  assert.ok(await until(async () => (await settle(5), p.ev('!!(S.fedp.mine[0]&&S.fedp.mine[0].body.rates.transit)'))), 'card announced');
  const mine = json(p, 'S.fedp.mine[0]'), to = p.ev('S.fed.key.pub');
  const offer = (from, dt, over = {}) => sealRec(from, 'offer', p.net.now() + dt,
    { to, deal: 'transit', basis: mine.id, terms: { mbps: 10000, perGbps: mine.body.rates.transit.perGbps, term: 30, at: ['fra'] }, ...over }, to, mine.body.box);
  return { p, n, offer, mine, to };
}

test('a flood of new networks never pushes a partner out of the store, nor ends its deal', async () => {
  const { p, n, offer } = await sellTransit([ann('alice'), ann('bob', { name: 'Bob Net' })]);
  await resync(p, n, [offer('alice', 0)]);
  assert.ok(await until(async () => (await settle(5), p.ev("S.fed.deals.length===1&&S.fed.deals[0].st==='run'"))), 'deal runs');
  const alice = key('alice').pub, bob = key('bob').pub;
  // Bob has been known for ten days (no deal): history, so he outlasts networks first heard just now.
  p.ev(`(async()=>{const o=await fedGet('ann',${J(bob)});o.fs=o.heard-10*86400;await fedPut('ann',${J(bob)},o);})()`);
  await settle(5);
  await p.ev(`(async()=>{const now=fedNow(),A=S.fedp.mine[0].body;for(let i=0;i<5600;i++){const k=('s'+i).padEnd(42,'Q')+'A';
     await fedAnnPut({rec:{v:1,kind:'announce',key:k,t:now-5,body:{...A,name:'Sybil '+i,asn:4200000001}},id:('i'+i).padEnd(43,'Z')},fedSlot(now),'x');}})()`);
  assert.ok(await p.ev("fedCount('ann')") <= 5500, 'the store stays bounded');
  assert.ok(await p.ev(`fedGet('ann',${J(alice)})`), 'the partner stays');
  assert.ok(await p.ev(`fedGet('ann',${J(bob)})`), 'a network known for long stays');
  await p.ev('fedPlayRefresh()'); await settle(10);
  assert.equal(p.ev('S.fed.deals[0].st'), 'run');
  // Even with its announce gone from this browser (another save's flood, a cleared store), the deal goes on...
  await p.ev(`fedDel('ann',${J(alice)})`);
  await p.ev('fedPlayRefresh()'); await settle(10);
  assert.equal(p.ev('S.fed.deals[0].st'), 'run');
  // ...until the partner itself is silent long enough to be dark; the decline is still sealed for it, with the box the deal kept.
  p.ev('window.__q=[];{const Q=fedQueue;fedQueue=(r,f)=>{__q.push(r.kind);return Q(r,f);};}');
  p.ev(`S.fed.deals[0].heard=fedNow()-40*86400`);
  await p.ev('fedPlayRefresh()'); await settle(20);
  assert.deepEqual(json(p, '[S.fed.deals[0].st,S.fed.deals[0].why]'), ['over', 'quiet']);
  assert.ok(await until(async () => (await settle(5), p.ev("__q.includes('decline')"))), 'the decline is queued');
  assert.deepEqual(p.errors, []);
});

test('a partner that leaves the federation ends its deals at once', async () => {
  const { p, n, offer } = await sellTransit();
  await resync(p, n, [offer('alice', 0)]);
  assert.ok(await until(async () => (await settle(5), p.ev("S.fed.deals.length===1&&S.fed.deals[0].st==='run'"))));
  await p.ev(`fedLeft(${J(key('alice').pub)},fedNow())`);
  await p.ev('fedPlayRefresh()'); await settle(10);
  assert.deepEqual(json(p, '[S.fed.deals[0].st,S.fed.deals[0].why]'), ['over', 'quiet']);
});

test('only the network a deal is with can renew it', async () => {
  const { p, n, offer, mine, to } = await sellTransit([ann('alice'), ann('mallory', { name: 'Mallory' })]);
  const o1 = offer('alice', 0);
  await resync(p, n, [o1]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.deals.length') === 1)));
  const X = rid(o1);
  spyAnswers(p);
  // Mallory names Alice's deal as the one an automatic peering offer of hers renews: declined, nothing booked.
  const m = sealRec('mallory', 'offer', p.net.now() + 2, { to, deal: 'peering', basis: mine.id, renews: X, terms: { at: ['fra'], via: 'pni' } }, to, mine.body.box);
  await resync(p, n, [m]);
  assert.ok(await until(async () => (await settle(5), p.ev('__ans.length') === 1)));
  assert.deepEqual(json(p, '__ans'), [[rid(m), 'conditions']]);
  assert.equal(p.ev(`fedRenewal(S.fed,${J(X)},${J(key('mallory').pub)})`), null);
  // Alice's own renewal is booked.
  const o2 = offer('alice', 9, { renews: X });
  await resync(p, n, [o2]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.deals.length') === 2)));
  assert.equal(p.ev(`fedRenewal(S.fed,${J(X)},${J(key('alice').pub)}).id`), rid(o2));
  assert.equal(p.ev('__ans.length'), 1);
  assert.deepEqual(p.errors, []);
});

test('a transit buyer cannot commit past the card nor report its way into the seller\'s books', async () => {
  const { p, n, offer } = await sellTransit([ann('alice')], { perGbps: 500, commit: [{ mbps: 10000, off: 0 }], term: 30 });
  spyAnswers(p);
  const big = offer('alice', 0);
  const huge = offer('alice', 1, { terms: { mbps: 1e9, perGbps: 500, term: 30, at: ['fra'] } });
  await resync(p, n, [huge]);
  assert.ok(await until(async () => (await settle(5), p.ev('__ans.length') === 1)));
  assert.deepEqual(json(p, '__ans'), [[rid(huge), 'conditions']], 'a commit of 1 Pbps on a 10G card is declined');
  await resync(p, n, [big]);
  assert.ok(await until(async () => (await settle(5), p.ev("S.fed.deals.some(d=>d.st==='run')"))));
  // The buyer reports a petabit crossing: the seller counts at most what the deal's exits carry (twice the commit).
  const k = key('alice').pub;
  p.ev(`fedDealsTick(S,fedNow(),new Set(),new Set(),new Map([[${J(k)},{traffic:[{key:S.fed.key.pub,in:1e9,out:1e9}]}]]))`);
  assert.equal(p.ev('S.fed.deals[0].rep'), 20000);
  assert.equal(p.ev('(()=>{const C={},V={};fedMoney(C,V,R);return V.fed;})()'), 20 * p.ev('S.fed.deals[0].terms.perGbps'));
  // A save holding such a deal from before is repaired on load, not refused.
  const r = json(p, `(()=>{const s=JSON.parse(JSON.stringify(S));s.fed.deals[0].terms.mbps=1e9;s.fed.deals[0].rep=2e9;sanitize(s);return [s.fed.deals[0].terms.mbps,s.fed.deals[0].rep];})()`);
  assert.deepEqual(r, [100000, 200000]);
  assert.deepEqual(p.errors, []);
});

test('a network\'s founded day never changes, and a late newcomer claim is refused', async () => {
  const p = load();
  p.ev("ACT.start({});S.fed=fedNewState();");
  const out = await p.ev(`(async()=>{const k='M'.repeat(43),now=1767312100,b={name:'M',founded:20000},put=(t,f)=>fedAnnPut({rec:{v:1,kind:'announce',key:k,t,body:{...b,founded:f}},id:('i'+t).padEnd(43,'Z')},t,'x');
    const a=await put(now,20000),b2=await put(now+10,20450),c=await put(now+20,20000);const o=await fedGet('ann',k);
    return [a,b2,c,o.rec.t,o.fd];})()`);
  assert.deepEqual(plain(out), [true, false, true, 1767312120, 20000]);
  // The newcomer price claims a join day after this browser first heard of the network: declined.
  const miss = p.ev(`(()=>{const k='N'.repeat(43);FEDN.ann.set(k,{key:k,rec:{body:{founded:20450}},heard:1767312100,fs:20400*86400});
    return [fedTheirMiss(S,{deal:'peering',terms:{at:[],via:'ix',founded:20450}},k).map(m=>m.l),
      (FEDN.ann.get(k).fs=20449*86400,fedTheirMiss(S,{deal:'peering',terms:{at:[],via:'ix',founded:20450}},k).map(m=>m.l))];})()`);
  assert.deepEqual(plain(miss), [['newcomer'], []]);
});

test('one network cannot fill the consortium list or the review queue', async () => {
  const p = load();
  p.ev('ACT.start({});S.fed=fedNewState();');
  const r = p.ev(`(()=>{const mk=(i,k)=>({key:k,t:1767312100+i,body:{deal:'consortium',terms:{name:'Spam '+i,a:'fra',b:'ams',members:16,share:0,pairs:1}}});
    const id=i=>(i+'').padStart(43,'A');for(let i=0;i<24;i++)fedConsSeen(S,mk(i,'M'.repeat(43)),id(i));
    const mal=S.fedp.cons.filter(c=>c.k==='M'.repeat(43)).map(c=>c.name);
    const legit=fedConsSeen(S,mk(99,'L'.repeat(43)),id(99));return {mal,legit,len:S.fedp.cons.length};})()`);
  assert.deepEqual(plain(r), { mal: ['Spam 22', 'Spam 23'], legit: true, len: 3 });
  // A full list (other authors, two each) lets go the oldest of the author with the most, never refuses a newcomer.
  const r2 = p.ev(`(()=>{S.fedp.cons=[];const mk=(i,k)=>({key:k,t:1767312100+i,body:{deal:'consortium',terms:{name:'P'+i,a:'fra',b:'ams',members:16,share:0,pairs:1}}});
    for(let i=0;i<24;i++)fedConsSeen(S,mk(i,String.fromCharCode(65+(i>>1)).repeat(43)),(i+'').padStart(43,'B'));
    const ok=fedConsSeen(S,mk(50,'z'.repeat(43)),'Z'.repeat(43));return [ok,S.fedp.cons.length,S.fedp.cons.some(c=>c.name==='P0')];})()`);
  assert.deepEqual(plain(r2), [true, 24, false]);
  // The review queue: 32 offers from one network leave another network's genuine request waiting.
  const q = p.ev(`(()=>{const P=S.fedp;P.rq=[{id:'g'.repeat(43),rec:{key:'G'.repeat(43),body:{}}}];const out=[];
    for(let i=0;i<32;i++){const old=fedRqRoom(P,'M'.repeat(43));if(old)out.push(old.id);P.rq.push({id:(i+'').padStart(43,'m'),rec:{key:'M'.repeat(43),body:{}}});}
    return {len:P.rq.length,genuine:P.rq.some(x=>x.rec.key==='G'.repeat(43)),gone:out.length};})()`);
  assert.deepEqual(plain(q), { len: 5, genuine: true, gone: 28 });
  // A full queue of several requesters lets go the oldest of the one with the most.
  const q2 = p.ev(`(()=>{const P=S.fedp,ks=['B','B','B','A','A','A','A'];for(let c=0;c<25;c++)ks.push(String.fromCharCode(67+(c/3|0)));
    P.rq=ks.map((c,i)=>({id:(i+'').padStart(43,'q'),rec:{key:c.repeat(43),body:{}}}));const old=fedRqRoom(P,'Z'.repeat(43));return [old&&old.rec.key[0],P.rq.length];})()`);
  assert.deepEqual(plain(q2), ['A', 31]);
});

test('the day\'s leaker is never a network first heard lately, and co-founding terms stay on the lists', () => {
  const p = load();
  p.ev("ACT.start({});S.fed=fedNewState();S.fed.key={pub:'B'.repeat(43)};");
  const r = p.ev(`(()=>{const D=20500,old='A'.repeat(43),fresh='C'.repeat(43);
    FEDN.ann=new Map([[old,{key:old,rec:{body:{founded:20000}},heard:D*86400,fs:20100*86400}],[fresh,{key:fresh,rec:{body:{founded:20000}},heard:D*86400,fs:(D-5)*86400}]]);
    S.fedn={h:'x',nets:[old,fresh].map(k=>({k,st:'active'}))};const won=new Set();for(let d=D;d<D+25;d++)won.add(fedLeaker(S,d));return [...won].sort();})()`);
  assert.ok(!r.includes('C'.repeat(43)), 'a key first heard 5 days ago never leaks');
  assert.deepEqual(plain(r), ['A'.repeat(43), 'B'.repeat(43)]);
  const m = p.ev(`[3650,180].map(term=>fedTheirAbsurd(S,{deal:'cofound',terms:{at:'fra',share:250,term}})).concat([fedTheirAbsurd(S,{deal:'cofound',terms:{at:'fra',share:999,term:180}})])`);
  assert.deepEqual(plain(m), [true, false, true]);
});
