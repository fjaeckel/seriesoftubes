// The customer cone board (FEDERATION-PROTOCOL §5.2 cust/up, §10.4): the player networks reachable through a network's
// transit customers, counted only over edges both sides list, with traffic both ways, to networks that joined at least
// 30 days before and were heard in the last 7. The server ranks; a game checks a row from the signed records rankwhy
// shows (fedRankOne, in the federation worker), announces included for their founded.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { advanceUntil, fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, rec, rid, key, asn, box, canon, signText } = require('./helpers/fed');

const DAY = 86400, TODAY = Math.floor(NOW / DAY);
const slotOf = (t) => t - (t % 300);

// fedRankOne on hand-made records (already checked): a chain A -> B -> C, with what breaks it.
test('fedRankOne counts the cone over edges both sides list, with traffic both ways, to established networks', () => {
  const { ev, errors } = load();
  const s = slotOf(NOW) - 3600, tr = (...l) => l.map(([k, i, o]) => ({ key: k, in: i, out: o }));
  const r = (id, k, body) => ({ id, key: k, slot: s, t: s + 20, body: { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: false, ...body } });
  const chain = (o = {}) => [
    r('a', 'kA', { cust: ['kB'], traffic: tr(['kB', 100, 100]) }),
    r('b', 'kB', { cust: ['kC'], up: ['kA'], traffic: tr(['kA', 100, o.oneWay ? 0 : 100], ['kC', 50, 50]) }),
    r('c', 'kC', { up: o.noUp ? [] : ['kB'], traffic: tr(['kB', 50, 50]) }),
  ];
  const one = (k, recs, founded, q = {}) => JSON.parse(ev(`JSON.stringify(fedRankOne(${JSON.stringify({ now: NOW, board: 'cone', measure: 'total', division: 'all', exclude: [], cities: null, filters: {}, founded, ...q })},'${k}',${JSON.stringify(recs)},null))`)).value;
  const old = { kA: TODAY - 100, kB: TODAY - 100, kC: TODAY - 100 };
  assert.equal(one('kA', chain(), old), 2);
  assert.equal(one('kB', chain(), old), 1);
  assert.equal(one('kA', chain(), { ...old, kC: TODAY - 29 }), 1, 'a young member does not count');
  assert.equal(one('kA', chain(), { ...old, kB: TODAY - 29 }), 0, 'a young member in the middle cuts the path');
  assert.equal(one('kA', chain({ oneWay: true }), old), 0, 'traffic one way only: the edge does not count');
  assert.equal(one('kA', chain({ noUp: true }), old), 1, 'one side alone counts nothing');
  assert.equal(one('kA', chain(), { kA: 1, kB: TODAY - 100 }), 1, 'no announce: never established');
  assert.equal(one('kA', chain(), old, { exclude: ['kB'] }), 0, 'excluded: no edge leads to it');
  // A silent member: its last record more than 7 days before every slot of the window.
  const silent = chain().map((x) => (x.key === 'kB' ? { ...x, slot: s - 8 * DAY, t: s - 8 * DAY } : x));
  assert.equal(one('kA', silent, old), 0, 'not heard in 7 days: no value, no edge');
  assert.deepEqual(errors, []);
});

// A server's cone row, checked by a game from rankwhy's records (receipts and all) in the federation worker's code.
function rcpt(r, t) {
  const x = { v: 1, kind: 'receipt', key: key('node1').pub, t: slotOf(t), body: { rec: rid(r), server: PL.id } };
  x.sig = signText(key('node1'), canon(x));
  return x;
}
function ann(name, founded) {
  const k = key(name);
  return rec(name, 'announce', NOW - 7200, { name: 'Net ' + name, asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded, pops: ['fra'], ix: [], cust: 3,
    mix: { content: 300, eyeball: 600, enterprise: 100 }, traffic: { in: 4000, out: 9000 }, policy: 'open', rates: {},
    auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' } });
}
const A = key('alice').pub, B = key('bob').pub, t0 = NOW - 3600;
const st = (name, body) => rec(name, 'stats', t0, { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: false, ...body });
async function setup(bobFounded, value) {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  const sa = st('alice', { cust: [B], traffic: [{ key: B, in: 300, out: 200 }] }), sb = st('bob', { up: [A], traffic: [{ key: A, in: 200, out: 300 }] });
  // Only the cone board has rows (the HUD's rank chip asks the traffic board, which must not check against cone records).
  n.ranks = (f) => f.board === 'cone' ? { slot: slotOf(NOW), n: 2, rows: [{ rank: 1, key: A, value, asn: asn(A), ai: false }], me: null } : { slot: slotOf(NOW), n: 0, rows: [], me: null };
  n.why = (f) => ({ slot: slotOf(NOW), items: f.key === A ? [{ rec: sa, rcpt: [rcpt(sa, t0)] }, { rec: sb, rcpt: [rcpt(sb, t0)] }, { rec: ann('alice', TODAY - 300), rcpt: [] }, { rec: ann('bob', bobFounded), rcpt: [] }] : [] });
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
  return { p, n };
}
const check = (p) => p.ev(`(async()=>{const c=FED.live.conns.get(${JSON.stringify(URL1)}),req=fedRankReq({board:'cone'},[]);
  return fedRankCheck(c,req,fedRanksOk(await fedAskRetry(c,req)));})()`);

test('a cone row checks out from rankwhy\'s records, the customers\' announces giving who is established', async () => {
  const { p, n } = await setup(TODAY - 100, 1);
  assert.equal(await check(p), true);
  assert.ok(n.asks.some((f) => f.m === 'rankwhy' && f.board === 'cone' && f.key === A));
  assert.deepEqual(p.errors, []);
});

test('a cone that counts a newcomer is caught', async () => {
  const { p } = await setup(TODAY - 5, 1);
  assert.equal(await check(p), false, 'bob joined 5 days ago: alice\'s cone is 0, not 1');
  assert.deepEqual(p.errors, []);
});

test('the boards sheet has a Customer cone board with its explanation, at phone width', async () => {
  const { p, n } = await setup(TODAY - 100, 1);
  p.ev('innerWidth=360;innerHeight=640;ACT.fuOpen({v:"boards"});');
  // This server's records are the 24-hour ones (stats, not live states), so the board is the 24-hour cone: on Now its
  // spot check would rightly find the row does not check out.
  await p.ev('ACT.fuQ({k:"measure",v:"total"})');
  await p.ev('ACT.fuQ({k:"board",v:"cone"})');
  // The board's answer and its spot check finish in real time, and a retry waits on the game clock: move it on.
  assert.ok(await advanceUntil(p, () => /Customer cone/.test(p.ev("$('modalCard').textContent")) && p.ev("!!document.querySelector('#modalCard .fu-row .fu-rank')")));
  assert.doesNotMatch(p.ev("$('modalCard').textContent"), /does not check out/, 'the spot check passes');
  const txt = p.ev("$('modalCard').textContent");
  assert.match(txt, /buy transit from you/);
  assert.match(txt, /30 days/);
  assert.ok(n.asks.some((f) => f.m === 'rank' && f.board === 'cone'));
  // Values are counts, not traffic.
  assert.equal(p.ev("fuVal({board:'cone',measure:'total'},12)"), '12');
  assert.deepEqual(p.errors, []);
});

// fedRankOne as it was before it worked the cone out once per stretch of slots where nothing changes: the reference the
// faster one must agree with, on seeded random cones whose records start, stop and come of age inside the windows.
const CONE_REF = `window.fedRankOneRef=function(q,key,recs,ann,states){const W=fedWindows(q.now),from=W.previous.from,last=W.current.to,by=fedByKey(recs),ex=new Set(q.exclude||[]),
    cs=q.cities?new Set(q.cities):null,F=q.filters||{},w=by.get(key),pops=r=>{let n=0;for(const c of Object.keys(r.body.pops))if(!cs||cs.has(c))n+=r.body.pops[c];return n;};
  const no={listed:false,kept:false,value:0},l=fedEffAt(w,last);
  if(ex.has(key)||!fedHas(l)||q.board==='pies'&&!fedOwn(l.body,'pies')||cs&&pops(l)===0||q.measure==='growth'&&!fedHas(fedEffAt(w,from)))return no;
  const traffic=(r,s)=>{let i=0,o=0;for(const e of r.body.traffic){if(ex.has(e.key))continue;const y=fedEffAt(by.get(e.key),s);
      if(cs&&!(fedHas(y)&&pops(y)>0))continue;if(!y){i+=e.in;o+=e.out;}else if(fedHas(y)){const z=y.body.traffic.find(x=>x.key===key);if(z){i+=Math.min(e.in,z.out);o+=Math.min(e.out,z.in);}}}
    return [i,o];};
  /* The customer cone at slot s (§10.4): networks reachable over counted transit edges. X -> Y counts when both have a
     value (heard in the 7 days before), neither is excluded, X lists Y in cust and Y lists X in up, each reports traffic
     with the other both ways, and Y joined at least 30 days before s. */
  const fd=q.founded||{},both=(r,k)=>{const z=r.body.traffic.find(x=>x.key===k);return !!z&&z.in>0&&z.out>0;};
  const cone=(s,at=k=>fedEffAt(by.get(k),s))=>{const seen=new Set([key]),todo=[key];
    while(todo.length){const z=todo.pop(),r=at(z);
      for(const y of r.body.cust||[]){if(seen.has(y)||ex.has(y)||!fedOwn(fd,y)||fedDiv(s,FED_DAY)-fd[y]<FED_NEWCOMER)continue;const ye=at(y);
        if(!fedHas(ye)||!(ye.body.up||[]).includes(z)||!both(r,y)||!both(ye,z))continue;seen.add(y);todo.push(y);}}
    return seen.size-1;};
  // POPs and pies: the value at the latest slot of the window with one (slots run in order: the last wins).
  /* The running slot c (§10.13): a key whose live state is in normal mode has one more sample there, the latest of the
     current window. Partners and cone members report there with their live state, else their effective record at c. */
  const c=fedSlot(q.now),L=fedLatest(q.now,states||[]),run=k=>{const s=L.get(k);return s?{body:s.body}:fedEffAt(by.get(k),c);};
  const smp=(()=>{const s=L.get(key);if(!s||s.body.mode!=='normal')return null;const r={body:s.body};
    if(q.board==='pops')return [pops(r),0];if(q.board==='pies')return [r.body.pies||0,0];if(q.board==='total')return [r.body.total||0,0];
    if(q.board==='cone')return [cone(c,run),0];
    let i=0,o=0;for(const e of r.body.traffic){if(ex.has(e.key))continue;const y=run(e.key);
      if(cs&&!(fedHas(y)&&pops(y)>0))continue;if(!y){i+=e.in;o+=e.out;}else if(fedHas(y)){const z=y.body.traffic.find(x=>x.key===key);if(z){i+=Math.min(e.in,z.out);o+=Math.min(e.out,z.in);}}}
    return [i,o];})();
  const total=(a,b,x)=>{const IN=[],OUT=[];let lo=null;
    for(let k=a;k<b;k++){const s=from+k*FED_SLOT,r=fedEffAt(w,s);if(!fedHas(r))continue;
      if(q.board==='traffic'){const [i,o]=traffic(r,s);IN.push(i);OUT.push(o);}else if(q.board==='total')IN.push(r.body.total||0);else if(q.board==='cone')IN.push(cone(s));
      else lo=q.board==='pies'?r.body.pies||0:pops(r);}
    if(x){if(q.board==='traffic'){IN.push(x[0]);OUT.push(x[1]);}else if(q.board==='total'||q.board==='cone')IN.push(x[0]);else lo=x[0];}
    return q.board==='traffic'?Math.max(fedP95(IN),fedP95(OUT)):q.board==='total'||q.board==='cone'?fedP95(IN):lo||0;};
  let value=total(FED_WIN,2*FED_WIN,smp);
  if(q.measure==='growth'){const prev=total(0,FED_WIN);value=fedDiv((value-prev)*10000,Math.max(prev,FED_FLOOR[q.board]));}
  return {listed:true,kept:fedKept(q,key,l,ann,fedDiv(q.now,FED_DAY)),value};}
`;
test('the cone worked out once per unchanged stretch gives what every slot worked out gives', () => {
  const p = load();
  p.ev(CONE_REF);
  const r = p.ev(`(()=>{let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};const out=[];
   for(let trial=0;trial<12;trial++){const V=40,now=1767312100+trial*7777,W=fedWindows(now),keys=[];for(let i=0;i<V;i++)keys.push(('k'+i+'_'+trial).padEnd(43,'A'));
    const recs=[],founded={},day=fedDiv(now,FED_DAY);
    for(let i=0;i<V;i++){founded[keys[i]]=day-20-Math.floor(rnd()*30);
      for(let s=W.previous.from-FED_SLOT*300;s<=W.current.to;s+=FED_SLOT*(20+Math.floor(rnd()*400))){
        const cust=[],up=[],tr=[];for(let d=0;d<4;d++){const c=keys[Math.floor(rnd()*V)];if(c!==keys[i]&&!cust.includes(c))cust.push(c);}
        for(let d=0;d<2;d++){const u=keys[Math.floor(rnd()*V)];if(u!==keys[i]&&!up.includes(u))up.push(u);}
        for(const k of [...cust,...up])tr.push({key:k,in:rnd()<0.9?5:0,out:5});
        if(rnd()<0.1)continue;recs.push({id:'i'+i+'_'+s,key:keys[i],slot:s,t:s,body:{mode:rnd()<0.95?'normal':'sandbox',pops:{fra:1},traffic:tr,cust,up,tier1:false,shareCountry:false}});}}
    for(const measure of ['growth','p95']){for(let i=0;i<V;i+=3){const q={now,board:'cone',measure,division:'all',exclude:i%2?[keys[5]]:[],cities:null,filters:{},founded};
      const a=fedRankOne(q,keys[i],recs,{founded:0},[]),b=fedRankOneRef(q,keys[i],recs,{founded:0},[]);out.push([JSON.stringify(a),JSON.stringify(b)]);}}}
   return out;})()`);
  let nz = 0;
  for (const [a, b] of r) { assert.equal(a, b); if (JSON.parse(b).value) nz++; }
  assert.ok(r.length === 336 && nz > 50, `${r.length} cases, ${nz} with a cone`);
});
