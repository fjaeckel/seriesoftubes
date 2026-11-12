// What other players send, and what an imported save carries, is untrusted: names never become markup, a hostile save
// cannot break compute(), only the right operators' votes and hide lists count, and big federations stay quick to
// rank. Each test is a regression test for one finding of the multiplayer review.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fedPage, joinGame, settle, until, URL1, NOW, PL, PL_ENTRY, rec, key, asn, b64, sha } = require('./helpers/fed');
const { load } = require('./harness');

const DAY = 86400, HOSTILE = '<img src=x onerror=alert(1)>';
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const ann = (name, over = {}, t = NOW - 60) => rec(name, 'announce', t, { name: 'Ping Floyd', asn: asn(key(name).pub), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams'], ix: ['fra'], cust: 30,
  mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {},
  auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' }, ...over });
// Markup that made it into the page: any element a name could have made, or any inline handler.
const injected = (p) => p.ev(`document.querySelectorAll('img[src="x"],[onerror]').length`);

test('a hostile player name never becomes markup: snapshot, NOC log, toasts, lists, traceroute, dashboard', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  n.feed = [{ rec: ann('mallory', { name: HOSTILE }), rcpt: [] }];
  await joinGame(p);
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  assert.ok(await until(async () => (p.net.advance(1000), await settle(5), p.ev('!!(S.fedn&&S.fedn.nets.length)'))), 'the player network arrived');
  const id = p.ev(`fedNetId(${JSON.stringify(key('mallory').pub)})`);
  p.ev('compute()');
  for (const name of [p.ev('S.fedn.nets[0].name'), p.ev(`NET['${id}'].name`)]) assert.doesNotMatch(name, /[<>"'&]/, 'stored as plain text');
  // Where a name could still arrive raw (any path that skips the snapshot), the sinks escape it: "no longer Tier 1".
  p.ev(`NET['${id}'].name=${JSON.stringify(HOSTILE)};S.transit=[];S.pni=t1Need().map(n=>({id:'t'+n.id,net:n.id,city:'fra',tier:1,n:1,ready:0}));
    R.reachable=Object.fromEntries(NETS.map(n=>[n.id,n.id!=='${id}']))`);
  const why = p.ev('t1Why()');
  assert.match(why, /&lt;img/, 'escaped in the reason');
  p.ev(`toast(tr('day_tick.you_are_no_longer_tier_1',{why:t1Why()}),'bad')`);
  assert.equal(injected(p), 0, 'toast');
  p.ev(`UI.left='noc';UI.leftOpen=true;renderAll()`);
  assert.equal(injected(p), 0, 'NOC log');
  // Back to the stored name: every list and modal that shows networks.
  p.ev(`NET['${id}'].name=S.fedn.nets[0].name;compute()`);
  for (const view of ["UI.left='nets';renderAll()", "UI.left='deals';renderAll()", `traceModal('fra','net:${id}')`, `ACT.fpNet&&ACT.fpNet({key:${JSON.stringify(key('mallory').pub)}})`, "ACT.fuOpen({v:'glass'})"]) {
    p.ev(view); await settle(20);
    assert.equal(injected(p), 0, view);
  }
  assert.deepEqual(p.errors, []);
});

test('an imported save cannot smuggle markup or broken numbers in its player networks, deals or terms', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const k = key('mallory').pub;
  const out = JSON.parse(ev(`JSON.stringify((()=>{const s=JSON.parse(JSON.stringify(packSave(S)));
    s.fed={on:false,key:null,servers:[],ai:null,out:[],muted:[],share:true,joined:0,last:0,deals:[
      {id:'C'.repeat(42)+'A',deal:'transit',key:'${k}',name:${JSON.stringify(HOSTILE)},asn:1,start:1,end:null,terms:{at:5,mbps:1000,perGbps:1,term:30},role:'buy',st:'run',on:true},
      {id:'D'.repeat(42)+'A',deal:'transit',key:'${k}',name:'x',asn:1,start:1,end:null,terms:{at:['fra'],mbps:1000,perGbps:1,term:30},role:'peer',st:'run',on:true},
      {id:'E'.repeat(42)+'A',deal:'pni',key:'${k}',name:'x',asn:1,start:1,end:null,terms:{at:'fra',mbps:1e400,setup:0,monthly:5,term:30},role:'buy',st:'run',on:true},
      {id:'F'.repeat(42)+'A',deal:'peering',key:'${k}',name:'x',asn:1,start:null,end:null,terms:{at:['fra'],via:'pni'},role:'peer',st:'run',on:true},
      {id:'G'.repeat(42)+'A',deal:'peering',key:'${k}',name:${JSON.stringify(HOSTILE)},asn:-5,start:1,end:null,terms:{at:['fra'],via:'pni'},role:'peer',st:'run',on:true,rep:1e400,extra:{deep:1}}]};
    s.fedn={h:'x',nets:[{k:'${k}',name:${JSON.stringify(HOSTILE)},asn:4200000001,home:'DE',pops:['fra'],ix:[],mix:[0,1000,0],tr:1e400,cust:1,pol:'open',q:1000,st:'active',ai:false,t1:true,bid:'',at:1}]};
    s.fedp={pol:'open',cond:{maxRatio:1e400},rates:{transit:{perGbps:1,term:30,commit:'x'}},auto:{},mine:[{id:'A'.repeat(43),t:5,body:{auto:{}}}],rq:[],
      cons:[{id:'B'.repeat(43),k:'${k}',name:${JSON.stringify(HOSTILE)},a:'fra',b:'ams',m:2,sh:5,pr:1,sg:['${k}'],t:1,st:'open'}],str:[{k:'${k}',mbps:1e400}]};
    const txt=JSON.stringify(s).replace('"extra"','"__proto__"');const r=parseSave(txt);if(r.err)return {err:r.err};
    try{S=migrate(JSON.parse(JSON.stringify(r.s)));compute();renderAll();}catch(e){return {err:'THROW '+e.message};}
    return {deals:S.fed.deals.map(d=>[d.id[0],d.name,d.asn,d.rep,Object.keys(d).sort().join()]),net:S.fedn.nets[0].name,tr:S.fedn.nets[0].tr,cons:S.fedp.cons.map(c=>c.name),mine:S.fedp.mine.length,str:S.fedp.str.length,proto:Object.getPrototypeOf(S.fed.deals[0]||{})===Object.prototype};})())`));
  assert.equal(out.err, undefined, out.err);
  assert.deepEqual(out.deals.map((d) => d[0]), ['G'], 'bad terms, a wrong role, a running deal with no start: dropped');
  const [, name, asnV, rep, keys] = out.deals[0];
  assert.doesNotMatch(name, /[<>]/);
  assert.equal(asnV, 0);
  assert.equal(rep, 0);
  assert.equal(keys, 'ai,asn,deal,end,id,key,name,on,rep,role,st,start,terms,why', 'only the fields a deal has');
  assert.ok(out.proto);
  assert.doesNotMatch(out.net, /[<>]/);
  assert.equal(out.tr, 0);
  assert.ok(out.cons.every((c) => !/[<>]/.test(c)));
  assert.equal(out.mine, 0, 'an announce body that does not check is dropped');
  assert.equal(out.str, 0);
  for (let i = 0; i < 3; i++) ev('dayTick()');
  assert.equal(ev(`document.querySelectorAll('img[src="x"],[onerror]').length`), 0);
  assert.deepEqual(errors, []);
});

// The leaderboard as it was computed before (every slot, every partner): the reference the fast one must match.
function fedBoardRef(q) {
  const { fedWindows, fedByKeyRun, fedEffs, fedHas, fedP95, fedPops, fedOwn, fedDiv, fedByStr, FED_WIN, FED_FLOOR } = q.ctx;
  const W = fedWindows(q.now), from = W.previous.from, last = W.current.to, N = 2 * FED_WIN, by = fedByKeyRun(q.records),
    ex = new Set(q.exclude || []), cities = q.cities ? new Set(q.cities) : null, E = new Map(), eff = (k) => { let e = E.get(k); if (!e) E.set(k, e = by.has(k) ? fedEffs(by.get(k), from, last) : []); return e; };
  const rep = (r, k) => r.body.traffic.find((x) => x.key === k);
  const total = (X, a, b) => { const e = eff(X); let lo = null; const IN = [], OUT = [];
    for (let i = a; i < b; i++) { const r = e[i]; if (!fedHas(r)) continue;
      if (q.board === 'traffic') { let ti = 0, to = 0;
        for (const y of r.body.traffic) { if (ex.has(y.key)) continue; const ry = eff(y.key)[i];
          if (cities && !(fedHas(ry) && fedPops(ry, cities) > 0)) continue;
          if (fedHas(ry)) { const z = rep(ry, X); ti += Math.min(y.in, z ? z.out : 0); to += Math.min(y.out, z ? z.in : 0); } else if (!ry) { ti += y.in; to += y.out; } }
        IN.push(ti); OUT.push(to); } else { const v = q.board === 'pies' ? r.body.pies || 0 : fedPops(r, cities); if (lo === null || v < lo) lo = v; } }
    return q.board === 'traffic' ? Math.max(fedP95(IN), fedP95(OUT)) : lo || 0; };
  const rows = [];
  for (const X of by.keys()) { if (ex.has(X)) continue; const e = eff(X), r = e[N - 1]; if (!fedHas(r)) continue;
    if (q.board === 'pies' && !fedOwn(r.body, 'pies')) continue; if (cities && fedPops(r, cities) === 0) continue;
    const ai = fedOwn(r.body, 'ai'); if (q.division === 'ai' && !ai || q.division === 'human' && ai) continue;
    const cur = total(X, FED_WIN, N); if (q.measure !== 'growth') { rows.push({ key: X, value: cur }); continue; }
    if (!fedHas(e[0])) continue; const prev = total(X, 0, FED_WIN); rows.push({ key: X, value: fedDiv((cur - prev) * 10000, Math.max(prev, FED_FLOOR[q.board])) }); }
  return rows.sort((a, b) => b.value - a.value || fedByStr(a.key, b.key));
}

test('the boards give exactly what every-slot counting gives, on random federations (seeded)', () => {
  const { ev, dom } = load();
  const w = dom.window;
  const ctx = Object.fromEntries(['fedWindows', 'fedByKeyRun', 'fedEffs', 'fedHas', 'fedP95', 'fedPops', 'fedOwn', 'fedDiv', 'fedByStr', 'FED_WIN', 'FED_FLOOR', 'FED_SLOT'].map((k) => [k, ev(k)]));
  let s = 7;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }, ri = (n) => Math.floor(rnd() * n);
  let rows = 0;
  for (let round = 0; round < 60; round++) {
    const now = NOW + ri(300), W = ctx.fedWindows(now), K = 3 + ri(10), keys = Array.from({ length: K }, (_, i) => 'k' + i), recs = [];
    for (let i = 0; i < K; i++) for (let r = 0; r < ri(6); r++) {
      const slot = W.previous.from + (ri(900) - 200) * ctx.FED_SLOT, tr = [], seen = new Set();
      for (let j = 0; j < ri(K); j++) { const y = ri(K + 2), yk = y < K ? keys[y] : 'ghost' + y; if (yk === keys[i] || seen.has(yk)) continue; seen.add(yk); tr.push({ key: yk, in: ri(5000), out: ri(5000) }); }
      const pops = {}; for (const c of ['fra', 'ams', 'lon']) if (rnd() < 0.5) pops[c] = 1 + ri(3);
      const body = { mode: rnd() < 0.85 ? 'normal' : 'sandbox', pops, traffic: tr }; if (rnd() < 0.5) body.pies = ri(500); if (rnd() < 0.3) body.ai = { model: 'm', harness: 'h' };
      recs.push({ id: 'id' + recs.length, key: keys[i], slot, t: slot + ri(3), body });
    }
    w.__recs = recs;
    for (const board of ['traffic', 'pops', 'pies']) for (const measure of ['total', 'growth']) for (const division of ['all', 'ai']) for (const exclude of [[], [keys[0]]]) for (const cities of [null, ['fra']]) {
      const q = { now, board, measure, division, exclude, cities };
      const got = ev(`JSON.stringify(fedBoard({...${JSON.stringify(q)},records:__recs}))`);
      const want = JSON.stringify(fedBoardRef({ ...q, records: JSON.parse(JSON.stringify(recs)), ctx }));
      assert.equal(got, want, JSON.stringify({ round, ...q }));
      rows += JSON.parse(got).length;
    }
  }
  assert.ok(rows > 1000, 'the rounds rank real networks');
});

// 20,000 stats records (the cache cap of one server) from 400 networks, each reporting traffic with 16 others.
const BIG = `(()=>{const now=${NOW},W=fedWindows(now),keys=[],recs=[];for(let i=0;i<400;i++)keys.push(${JSON.stringify(key('alice').pub.slice(0, 38))}+String(i).padStart(5,'0'));
  for(let i=0;i<400;i++)for(let s=0;s<50;s++){const slot=W.previous.from+((i*7+s*11)%576)*FED_SLOT,tr=[];for(let j=1;j<=16;j++)tr.push({key:keys[(i+j*13)%400],in:(i*j+s)%5000,out:(i+j*s)%7000});
    recs.push({id:'r'+recs.length,key:keys[i],slot,t:slot,body:{mode:'normal',pops:{fra:1,ams:1+i%3},traffic:tr,tier1:i%5===0,shareCountry:false,...(i%4?{}:{ai:{model:'m',harness:'h'}})}});}
  return recs;})()`;

test('a leaderboard of 20,000 records is quick, chips only slice again, and a huge one is worked out in short steps', async () => {
  const p = fedPage();
  await joinGame(p);
  p.ev(`window.__runs=0;const g=fedBoardGen;fedBoardGen=function(q){__runs++;return g(q);}`);
  await p.ev(`fedBoardPut(${JSON.stringify(PL.id)},${BIG})`);
  const t0 = Date.now();
  const d = await p.ev(`fedBoardData([${JSON.stringify(PL.id)}])`);
  p.w.__d = d;
  const first = p.ev(`(()=>{const t=Date.now();const s=fedSlice({board:'traffic',measure:'total',division:'all'},__d);return {ms:Date.now()-t,rows:s.rows.length};})()`);
  console.log(`# board of 20,000 records: ${first.ms} ms (with the data ${Date.now() - t0} ms), ${first.rows} rows`);
  assert.ok(first.rows > 300);
  assert.ok(first.ms < 1500, `${first.ms} ms`);
  assert.equal(p.ev('__runs'), 1);
  // Every chip of the division, AI setup, tier, policy and peers kinds reuses it; the same data comes back as the same array.
  const d2 = await p.ev(`fedBoardData([${JSON.stringify(PL.id)}])`);
  assert.ok(p.ev('(d2)=>d2.records===__d.records')(d2), 'unchanged records: the same array');
  const t1 = Date.now();
  for (const v of [{ division: 'ai' }, { division: 'human' }, { model: 'm' }, { tier1: true }, { peers: true }, { division: 'all' }]) p.w.__v = v, p.ev(`fedSlice({board:'traffic',measure:'total',...__v},__d)`);
  assert.equal(p.ev('__runs'), 1, 'no board computed again');
  assert.ok(Date.now() - t1 < 500, `six chips took ${Date.now() - t1} ms`);
  // New records make a new array (and a new board).
  await p.ev(`fedBoardPut(${JSON.stringify(PL.id)},__d.records.slice(0,100))`);
  assert.equal(p.ev(`(d3=>d3.records!==__d.records)`)(await p.ev(`fedBoardData([${JSON.stringify(PL.id)}])`)), true);
  // The reviewer's worst case (2,000 networks, each with 256 partners in one slot): in slices, the same rows.
  const steps = await p.ev(`(async()=>{const now=${NOW},slot=fedWindows(now).current.from,keys=[],recs=[];for(let i=0;i<2000;i++)keys.push('k'+i);
    for(let i=0;i<2000;i++){const tr=[];for(let j=1;j<=256;j++)tr.push({key:keys[(i+j)%2000],in:5,out:5});recs.push({id:'id'+i,key:keys[i],slot,t:slot,body:{mode:'normal',pops:{fra:1},traffic:tr}});}
    window.__big=recs;const q={now,board:'traffic',measure:'total',division:'all',records:recs};const n=await fedBoardWarm(q,4);const a=fedBoard(q);
    const g=fedBoardGen({...q,records:recs.slice()});let x;do x=g.next();while(!x.done);return {n,same:JSON.stringify(a)===JSON.stringify(x.value),rows:a.length};})()`);
  assert.ok(steps.n > 1, `worked out in ${steps.n} pauses`);
  assert.ok(steps.same);
  assert.equal(steps.rows, 2000);
  assert.deepEqual(p.errors, []);
});

const sid = (n) => b64(sha('server ' + n));
const REG = { asOf: NOW - (NOW % DAY), at: NOW, servers: [PL_ENTRY, ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: sid(n), name: 'S' + n, operators: [key('op' + n).pub], nodes: [], listed: NOW - 60 * DAY - (NOW % DAY), answered: NOW - (NOW % DAY) }))] };
const vote = (who, n, t = NOW - DAY, target = key('mallory').pub) => rec(who, 'shun', t, { server: sid(n), target, reason: 'spam' });

test('shun votes are kept only from operators of voting servers: junk cannot push real votes out (an operator\'s game)', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`);
  const junk = Array.from({ length: 40 }, (_, i) => vote('junk' + i, 1 + (i % 6), NOW - 10, key('alice').pub));
  n.feed = [...junk, vote('op1', 1), vote('op2', 2), vote('op3', 2), vote('op4', 4)].map((r) => ({ rec: r, rcpt: [] }));
  await p.ev(`fedPut('kv','registry',${JSON.stringify(REG)})`);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), ((await p.ev("fedGet('kv','votes')")) || []).length === 3)));
  await settle(50);
  const kept = (await p.ev("fedGet('kv','votes')")).map((v) => v.rec.key).sort();
  assert.deepEqual(kept, [key('op1').pub, key('op2').pub, key('op4').pub].sort(), 'not from strangers, not for a server one does not operate');
  assert.deepEqual(p.errors, []);
});

test('an operator\'s shun tally over 4,096 votes is counted once per change of votes or registry', async () => {
  const p = fedPage();
  await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`);
  await joinGame(p);
  const servers = Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, operators: ['op' + i], listed: NOW - 40 * DAY, answered: NOW - DAY }));
  await p.ev(`fedPut('kv','registry',${JSON.stringify({ asOf: NOW, at: NOW, servers })})`);
  // Target t gets a vote from servers s0..s5 (and s6 for the first 496): six or seven of the five needed.
  const votes = Array.from({ length: 4096 }, (_, i) => { const sv = Math.floor(i / 600); return { id: 'v' + i, rec: { kind: 'shun', key: 'op' + sv, t: NOW - 100 - (i % 50), body: { server: 's' + sv, target: 't' + (i % 600), reason: 'spam' } } }; });
  await p.ev(`fedPut('kv','votes',${JSON.stringify(votes)})`);
  p.ev('window.__tally=0;const f=fedShun;fedShun=(...a)=>{__tally++;return f(...a);}');
  const t0 = Date.now();
  const all = '(async()=>{const now=FED.now(),T=await fedShunTally(now);let n=0;for(let i=0;i<600;i++)if(fedShunOf(T,"t"+i,now).shunned)n++;return n;})()';
  const shunned = await p.ev(all);
  const ms = Date.now() - t0;
  console.log(`# shun tally of 4,096 votes: ${ms} ms`);
  assert.ok(ms < 600, `${ms} ms`);
  assert.equal(shunned, 600, 'six or seven servers (of 20 voting, 5 needed) voted against each');
  const once = p.ev('__tally');
  await p.ev(all);
  await p.ev("fedShunInfo('t1')");
  assert.equal(p.ev('__tally'), once, 'the same votes at the same moment: nothing counted again');
  p.ev('FED.vgen++');
  await p.ev(all);
  assert.ok(p.ev('__tally') > once, 'new votes are counted');
  assert.deepEqual(p.errors, []);
});

test('a hide list counts only when an operator of its own server signed it', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  const reg = { asOf: NOW, at: NOW, servers: [{ id: PL.id, rid: PL.id, t: NOW - DAY, name: 'P', nodes: [{ key: key('node1').pub, url: URL1 }], operators: [key('op1').pub], listed: NOW - 60 * DAY, answered: NOW }] };
  const hide = (who, k) => rec(who, 'hide', NOW - 50, { server: PL.id, hide: [key(k).pub], names: [], refuse: [] });
  n.feed = [{ rec: hide('mallory', 'alice'), rcpt: [] }];
  await p.ev(`fedPut('kv','registry',${JSON.stringify(reg)})`);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
  await settle(50);
  assert.equal(await p.ev(`fedGet('kv','hide:'+${JSON.stringify(PL.id)})`), null, 'a stranger cannot hide anyone');
  n.feed = [{ rec: hide('op1', 'bob'), rcpt: [] }];
  for (const ws of n.socks) ws.drop();
  await settle();
  p.net.advance(5000);
  assert.ok(await until(async () => (await settle(5), !!(await p.ev(`fedGet('kv','hide:'+${JSON.stringify(PL.id)})`)))), 'the operator can');
  const ex = JSON.parse(await p.ev(`fedBoardData([${JSON.stringify(PL.id)}]).then(d=>JSON.stringify(d.exclude))`));
  assert.ok(ex.includes(key('bob').pub));
  // A list kept before this check (a stranger's) is not used.
  await p.ev(`(async()=>{const r=${JSON.stringify(hide('mallory', 'carol'))};await fedPut('kv','hide:'+${JSON.stringify(PL.id)},{rec:r,id:await fedId(r)});})()`);
  const ex2 = JSON.parse(await p.ev(`fedBoardData([${JSON.stringify(PL.id)}]).then(d=>JSON.stringify(d.exclude))`));
  assert.ok(!ex2.includes(key('carol').pub));
  assert.deepEqual(p.errors, []);
});

test('thousands of new announces do not read the whole store each time', async () => {
  const p = fedPage({ idb: false });
  p.ev('FED.idb=()=>null;window.__reads=0;const a=fedAll;fedAll=s=>{if(s===\'ann\')__reads++;return a(s);}');
  const r = await p.ev(`(async()=>{for(let i=0;i<6000;i++)await fedAnnPut({rec:{key:'k'+i,t:${NOW}-i,body:{}},id:'i'+i},${NOW}-i,null);return {reads:__reads,size:FEDDB.mem?FEDDB.mem.ann.size:-1};})()`);
  assert.ok(r.reads <= 2, `${r.reads} whole reads`);
  assert.ok(r.size <= 5500 && r.size >= 5000, `${r.size} kept`);
  const nets = await p.ev(`fedNetworks(${NOW}).then(l=>l.length)`);
  assert.equal(nets, r.size);
  assert.deepEqual(p.errors, []);
});

test('the MCP server\'s export_save never carries the multiplayer private key or the queue', () => {
  const { ev, dom } = load({ agent: true });
  const js = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lib', 'mcp-headless.js'), 'utf8');
  dom.window.eval(js);
  ev('ACT.start({})');
  const k = key('alice');
  ev(`S.fed=fedNewState();S.fed.key=${JSON.stringify({ pub: k.pub, priv: k.seed })};S.fed.out=[${JSON.stringify(ann('alice'))}];S.fed.op={seed:'x'}`);
  const txt = ev("__mcpHeadless.exportSave('9.9.9')");
  assert.ok(!txt.includes(k.seed), 'no private key');
  const s = JSON.parse(txt).S;
  assert.deepEqual(s.fed.key, { pub: k.pub });
  assert.deepEqual(s.fed.out, []);
  assert.equal(s.fed.op, undefined);
  assert.equal(ev('S.fed.key.priv'), k.seed, 'the running game keeps its key');
});
