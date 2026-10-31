const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A small network with a hired intern, every order off, no cash floor and no fat fingers (Change Freeze).
const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});S.pops.fra.bb.d=300;S.pops.fra.rgen=1;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()";
function game(t, extra = '') {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  if (extra) h.ev(extra);
  return h;
}
const hire = ev => ev("ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal()");
const on = (ev, k, p = {}, cap) => ev(`S.ops.on.${k}=true;S.ops.p.${k}=${JSON.stringify(p)};${cap === undefined ? '' : `S.ops.cap.${k}=${cap};`}`);
const shift = ev => ev('opsDay(S.day)');
const cash = ev => ev('S.cash');
// The same game twice: the intern's shift in one, the player's own clicks in the other. Both must cost the same and end the same.
function twins(t, extra, order, manual, pick) {
  const A = game(t), B = game(t);
  // Hire first: hiring recomputes, which would wipe any routing state the case stages.
  hire(A.ev); hire(B.ev);
  if (extra) { A.ev(extra); B.ev(extra); }
  order(A.ev);
  const a0 = cash(A.ev); shift(A.ev); const a1 = cash(A.ev);
  const b0 = cash(B.ev); B.ev(manual); const b1 = cash(B.ev);
  assert.ok(a0 - a1 > 0, 'the order did some paid work');
  assert.equal(a0 - a1, b0 - b1, 'the shift cost exactly what the clicks cost');
  if (pick) assert.equal(A.ev(pick), B.ev(pick), 'and left the network the same');
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
  return A;
}

test('a new game has no intern and every order off; nothing runs and no random numbers are drawn', t => {
  const { ev, errors } = game(t);
  assert.equal(ev('S.ops.intern'), null);
  assert.equal(ev('Object.values(S.ops.on).some(Boolean)'), false);
  ev("for(const k in S.ops.on)S.ops.on[k]=true");
  const r = ev('window.__n=0;window.__r=Math.random;Math.random=()=>{__n++;return __r()};const s=JSON.stringify(S);opsDay(S.day);Math.random=__r;s===JSON.stringify(S)&&__n===0');
  assert.equal(r, true, 'no intern: orders never run, even switched on');
  assert.deepEqual(errors, []);
});

test('the intern is hired from customer level 2 (or with gates open), costs a monthly salary, and can be let go', t => {
  const { ev, errors } = game(t);
  ev("S.lvl=1;ACT.opsHire({id:'kevin'})");
  assert.equal(ev('S.ops.intern'), null, 'level 1: not yet');
  ev("S.rules=makeRules('sandbox');S.rules.preset='freeze';ACT.opsHire({id:'annie'})");
  assert.equal(ev('S.ops.intern'), 'annie', 'gates open');
  ev("S.ops.intern=null;S.rules=makeRules('freeze');S.lvl=2;compute()");
  const mo = ev('R.costMo'), c0 = cash(ev);
  ev("ACT.opsHire({id:'tracy'})");
  assert.equal(ev('S.ops.intern'), 'tracy');
  assert.equal(c0 - cash(ev), ev('INTERN_MO'), 'first month up front');
  assert.equal(ev('R.costMo') - mo, ev('INTERN_MO'), 'then a monthly salary');
  ev("ACT.opsFire();ACT.opsFire()");
  assert.equal(ev('S.ops.intern'), null);
  assert.deepEqual(errors, []);
});

test('transit headroom adds a LAG member, exactly as the + member button would', t => {
  const A = twins(t, "S.transit[0].hist=[60,80,70]",
    ev => on(ev, 'transit', { x: 1.5 }),
    "ACT.lagT({id:S.transit[0].id,d:1})", "JSON.stringify(S.transit.map(t=>[t.net,t.tier,t.n||1]))");
  assert.match(A.ev('opsEntry(S.ops.log[0])'), /Kevin topped up transit in Frankfurt \+1×100G/);
});

test('transit headroom buys a new port from a chosen provider and stops at the multiple', t => {
  const A = twins(t, "S.transit[0].hist=[100]",
    ev => on(ev, 'transit', { x: 2, prov: 'ntt' }),
    "ACT.buyTransit({city:'fra',net:'ntt',tier:1})", "JSON.stringify(S.transit.map(t=>[t.net,t.tier,t.n||1]))");
  assert.ok(A.ev("S.transit.reduce((a,t)=>a+lagCap(PORT[t.tier].g,t.n),0)") >= 200);
});

test('routers: add one above the load level, as Add router would', t => {
  twins(t, "R.nodeLoad.fra=R.nodeCap.fra*0.85",
    ev => on(ev, 'routers', { at: 80, how: 'add' }),
    "ACT.addRouter({city:'fra'})", 'S.pops.fra.routers');
});

test('routers: swap generation only where a second router carries the traffic', t => {
  const { ev, errors } = game(t, 'R.nodeLoad.fra=R.nodeCap.fra*0.95');
  hire(ev); on(ev, 'routers', { at: 80, how: 'swap' });
  shift(ev);
  assert.equal(ev('S.pops.fra.rgen'), 1, 'one router: a swap would be an outage, so no');
  ev('S.pops.fra.routers=2;compute();R.nodeLoad.fra=R.nodeCap.fra*0.95');
  const want = ev('swapCost("fra",mainRG(RG[1].cls+1))'), c0 = cash(ev);
  shift(ev);
  assert.equal(ev('S.pops.fra.rgen'), ev('mainRG(RG[1].cls+1)'));
  assert.equal(c0 - cash(ev), want, 'paid the swap price after trade-in');
  assert.equal(ev("S.inc.some(i=>i.type==='maint')"), false);
  assert.deepEqual(errors, []);
});

test('caches: free boxes only once the network sends enough traffic locally', t => {
  const { ev, errors } = game(t);
  hire(ev);
  const best = ev("NETS.filter(n=>n.cache&&(R.demTo[n.id]||0)>=n.cache.min).map(n=>(R.cityDem.fra||0)*NSH[n.id]).sort((a,b)=>b-a)[0]||0");
  assert.ok(best > 0, 'some network qualifies for a cache in this game');
  on(ev, 'caches', { g: 50 });
  if (best < 50) { shift(ev); assert.equal(ev('S.caches.length'), 0, 'below the threshold: nothing'); }
  on(ev, 'caches', { g: 1 });
  const c0 = cash(ev);
  shift(ev);
  const want = JSON.parse(ev("JSON.stringify(utilityCaches('fra'))"));
  assert.ok(ev('S.caches.length') > 0);
  assert.equal(want.add.filter(x => ev(`(R.cityDem.fra||0)*NSH['${x.net}']`) >= 1).length, 0, 'every eligible box is in');
  assert.equal(cash(ev), c0, 'caches are free to rack');
  assert.deepEqual(errors, []);
});

test('IX: weekly route servers and every willing peer, the same as the #192 batch', t => {
  const A = game(t, "ACT.buyIx({city:'fra',tier:0,signed:true});ACT.buyIx({city:'ams',tier:0})"), B = game(t, "ACT.buyIx({city:'fra',tier:0,signed:true});ACT.buyIx({city:'ams',tier:0})");
  hire(A.ev); on(A.ev, 'ix');
  A.ev('S.day=13');shift(A.ev);
  assert.equal(A.ev('Object.keys(S.rs).length'), 0, 'not on a weekday the intern skips');
  A.ev('S.day=14');shift(A.ev);
  B.ev('ACT.utilityRouteServers();ACT.utilityPeers()');
  assert.equal(A.ev('JSON.stringify(S.rs)'), B.ev('JSON.stringify(S.rs)'));
  assert.equal(A.ev('JSON.stringify(Object.keys(S.peers).sort())'), B.ev('JSON.stringify(Object.keys(S.peers).sort())'));
  assert.equal(A.ev('utilityPeers().reduce((n,r)=>n+r.requests.length,0)'), 0);
  assert.deepEqual(A.errors, []);
});

test('PNI: weekly, big enough networks only, paid peering left out by default, at each network\'s own size and lead time', t => {
  const { ev, errors } = game(t, "ACT.buildPop({city:'ams'});S.pops.ams.rgen=1;compute()");
  hire(ev); on(ev, 'pni', { g: 5, tier: 1 }, 0);
  ev('S.day=17;S.pops.fra.bb.d=3000;S.pops.ams.bb={d:3000};compute()');
  const plan = JSON.parse(ev("JSON.stringify(pniBatch(null,1).orders.filter(q=>(R.cityDem[q.city]||0)*NSH[q.net]>=5&&(NET[q.net].pol!=='paid'||paidFree(NET[q.net]))).map(q=>({k:q.city+q.net,cost:q.cost,tier:q.tier,big:pniBig(q.net)})))"));
  assert.ok(plan.length > 0);
  const c0 = cash(ev);
  shift(ev);
  const got = JSON.parse(ev('JSON.stringify(S.pni.map(p=>({k:p.city+p.net,tier:p.tier,ready:p.ready})))'));
  assert.deepEqual(got.map(p => p.k).sort(), plan.map(p => p.k).sort());
  // Lead times are each network's own (pniLead), quick here under Change Freeze.
  for (const p of plan) { const g = got.find(x => x.k === p.k); assert.equal(g.tier, p.tier); assert.ok(g.ready > 17 && g.ready <= 17 + ev(p.big ? 'leadDays(365)' : 'leadDays(42)'), p.k); }
  assert.equal(c0 - cash(ev), plan.reduce((a, p) => a + p.cost, 0), 'the same setup fees as the bulk order');
  assert.equal(ev("S.pni.some(p=>NET[p.net].pol==='paid'&&!paidFree(NET[p.net]))"), false);
  assert.deepEqual(errors, []);
});

test('sales: decline offers below the minimum, sign the ready ones with #185\'s trial', t => {
  const { ev, errors } = game(t);
  hire(ev); on(ev, 'sales', { acc: true, min: 5000 });
  ev('S.transit[0].tier=3;S.pops.fra.rgen=3;compute()');
  ev("S.offers=[{id:'tiny',city:'fra',name:'Tiny',type:'dia',bw:1,rate:600,reqs:[],exp:30},{id:'big',city:'fra',name:'Big',type:'dia',bw:10,rate:600,reqs:[],exp:30},{id:'gen',city:'fra',name:'Gen',type:'dia',bw:10,rate:600,reqs:['gen'],exp:30}]");
  shift(ev);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.biz.map(b=>b.id))')), ['big']);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.offers.map(o=>o.id))')), ['gen'], 'unmet requirements wait, the tiny one is gone');
  assert.match(ev('opsEntry(S.ops.log[0])'), /declined a tiny offer, signed a customer/);
  assert.deepEqual(errors, []);
});

test('repairs: rush what has a price, as the Rush repair button would', t => {
  twins(t, "S.links=[{id:'f',a:'fra',b:'ams',kind:'df',sys:'lite',ch:['zr4'],km:450,sub:false,ready:0,cut:0,eqDown:10,mo:1}];S.inc=[{id:'amp',type:'amp',ref:'f',until:10,cost:3000,msg:'amp'}];S.pops.ams={day:0,bb:null,boost:0,down:0,routers:1,gen:false}",
    ev => on(ev, 'repair'), "ACT.fixInc({id:'amp'})", 'S.inc.length');
});

test('optics: light hot fiber with the optic already in it, at the #177 batch price', t => {
  const extra = "ACT.buildPop({city:'ams'});S.pops.ams.rgen=1;S.links.push({id:'f',a:'fra',b:'ams',kind:'df',sys:'lite',ch:['zr4'],km:450,sub:false,ready:0,cut:0,mo:1,trench:'f'});compute();R.load.f=dfCap(S.links.at(-1))*0.95";
  const A = twins(t, extra, ev => on(ev, 'optics', { at: 70 }),
    "ACT.setChCount({id:'f',o:'zr4',n:2})", "JSON.stringify(S.links.find(l=>l.id==='f').ch)");
  assert.equal(A.ev("S.links.find(l=>l.id==='f').ch.length"), 2, 'one more channel brings the fiber under the level');
});

test('decommission: smaller parallel waves go once the bigger link has room, never one a customer needs', t => {
  const { ev, errors } = game(t, "ACT.buildPop({city:'ams'});S.pops.ams.rgen=1;for(const [id,tier] of [['w1',0],['w2',0],['big',2]])S.links.push({id,a:'fra',b:'ams',kind:'wave',tier,km:450,sub:false,cut:0,mo:100,trench:id});compute()");
  hire(ev); on(ev, 'decom', { keep: true });
  ev("R.load={w1:1,w2:1,big:10}");
  shift(ev);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.links.map(l=>l.id).sort())")), ['big', 'w1'], 'one small wave kept as a spare');
  on(ev, 'decom', { keep: false });
  ev("S.biz.push({id:'c',name:'C',type:'l2vpn',city:'fra',city2:'ams',bw:1,rate:1,reqs:['diverse'],mood:100,since:0});R.load={w1:1,big:10}");
  shift(ev);
  assert.ok(ev("S.links.some(l=>l.id==='w1')"), 'a diverse-path customer still needs it');
  ev("S.biz=[];R.load={w1:1,big:10}");
  shift(ev);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.links.map(l=>l.id))")), ['big']);
  assert.deepEqual(errors, []);
});

test('the monthly budget cap and the cash floor stop the intern; a new month resets the budget', t => {
  const { ev, errors } = game(t);
  hire(ev); ev('S.transit[0].hist=[600]'); on(ev, 'transit', { x: 3 }, 10000);
  const c0 = cash(ev);
  shift(ev);
  const spent = c0 - cash(ev);
  assert.ok(spent > 0 && spent <= 10000, 'some work, never over the cap');
  assert.equal(ev('S.ops.spent.transit'), spent);
  assert.match(ev('opsEntry(S.ops.log[0])'), /stopped at the budget for Keep transit headroom/);
  const c1 = cash(ev);
  shift(ev);
  assert.equal(cash(ev), c1, 'the same month: nothing more');
  // The next step (four 100G members to 400G, $16k) never fits a $10k month; the budget still starts again.
  ev('S.day+=30;S.ops.cap.transit=50000');
  shift(ev);
  assert.ok(cash(ev) < c1, 'a new month, a new budget');
  assert.equal(ev('S.ops.spent.transit'), c1 - cash(ev), 'counted from zero');
  ev("S.ops.cap.transit=0;S.ops.floor=1e6;S.cash=1e6+500;S.transit[0].hist=[1e5]");
  const c2 = cash(ev);
  shift(ev);
  assert.equal(cash(ev), c2, 'the cash floor holds even without a cap');
  assert.deepEqual(errors, []);
});

test('pause: an order switched off does nothing, and per-POP switches leave a city alone', t => {
  const { ev, errors } = game(t, "ACT.buildPop({city:'ams'});ACT.buyTransit({city:'ams',net:'cog',tier:1});for(const t of S.transit)t.hist=[90]");
  hire(ev); on(ev, 'transit', { x: 2 });
  ev("ACT.opsToggle({k:'transit'})");
  const s0 = ev('JSON.stringify(S.transit)');
  shift(ev);
  assert.equal(ev('JSON.stringify(S.transit)'), s0);
  ev("ACT.opsToggle({k:'transit'});ACT.opsPop({k:'transit',city:'ams'});closeModal()");
  shift(ev);
  assert.ok(ev("(S.transit.find(t=>t.city==='fra').n||1)") > 1, 'Frankfurt topped up');
  assert.equal(ev("(S.transit.find(t=>t.city==='ams').n||1)"), 1, 'Amsterdam left alone');
  assert.deepEqual(errors, []);
});

test('the shift runs inside dayTick, respects a stopped clock, batches its work and recomputes once', t => {
  const { ev, errors } = game(t, "S.transit[0].hist=[60,80,70]");
  hire(ev); on(ev, 'transit', { x: 1.5 }); on(ev, 'caches', { g: 1 });
  const n = ev("window.__c=compute;window.__n=0;compute=()=>{__n++;return __c()};opsDay(S.day);compute=__c;__n");
  assert.equal(n, 1, 'one recompute for the whole shift');
  const d = ev('S.day');
  ev('dayTick()');
  assert.equal(ev('S.ops.log[0].d'), d + 1);
  ev("S.rules.clock=false;const before=JSON.stringify(S.ops);dayTick();window.__same=before===JSON.stringify(S.ops)");
  assert.equal(ev('__same'), true, 'no clock, no shift');
  assert.deepEqual(errors, []);
});

test('the NOC gets one notice a week, the shift report; the daily lines stay in the Ops sheet', t => {
  const { ev, errors } = game(t, "S.transit[0].hist=[600]");
  ev('S.day=14');
  hire(ev); on(ev, 'transit', { x: 1.5 }); on(ev, 'sales', { acc: true, min: 5000 });
  ev('S.transit[0].tier=3;S.pops.fra.rgen=3;compute()');
  const n0 = ev('S.log.length');
  for (let d = 14; d < 21; d++) {
    if (d === 15) ev("S.offers=[{id:'tiny',city:'fra',name:'Tiny',type:'dia',bw:1,rate:600,reqs:[],exp:60},{id:'big',city:'fra',name:'Big',type:'dia',bw:10,rate:600,reqs:[],exp:60}]");
    ev(`S.day=${d}`); shift(ev);
  }
  assert.equal(ev('S.log.length'), n0, 'a whole week of shifts: no NOC notice yet');
  assert.ok(ev('S.ops.log.length') >= 2, 'the Ops sheet has the daily detail');
  ev('S.day=21'); shift(ev);
  assert.equal(ev('S.log.length'), n0 + 1, 'one notice for the week');
  assert.match(ev('S.log[0].t'), /^Kevin's week Kevin signed a customer \(\+\$6\.0k\/mo\), topped up transit .*declined a tiny offer.*Week total: \$[\d.]+k up front, \+\$[\d.]+k\/mo\./);
  assert.equal(ev('S.log[0].k'), 'good');
  ev('S.day=22'); shift(ev);
  assert.equal(ev('S.log.length'), n0 + 1, 'and nothing more until the next week ends');
  // Only the sales order now: one tiny offer declined on day 23, reported when the week ends.
  ev("for(const k in S.ops.on)S.ops.on[k]=false;S.ops.on.sales=true;S.offers=[{id:'t2',city:'fra',name:'T2',type:'dia',bw:1,rate:600,reqs:[],exp:60}];S.day=23");shift(ev);
  ev("S.day=28");shift(ev);
  assert.equal(ev('S.log.length'), n0 + 2);
  assert.match(ev('S.log[0].t'), /declined a tiny offer\.$/, 'nothing spent: no money line');
  assert.equal(ev('S.log[0].k'), '');
  ev("S.day=35");shift(ev);
  assert.equal(ev('S.log.length'), n0 + 2, 'an idle week: no notice');
  assert.deepEqual(errors, []);
});

test('the Ops sheet opens with the intern\'s mood and the weekly shift report, at 360 px, in every language', t => {
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'pt']) {
    const h = load(lang === 'en' ? {} : { lang });
    const { ev, dom, errors } = h;
    ev(BASE); ev('S.day=14'); dom.window.innerWidth = 360;
    hire(ev);
    ev('opsModal()');
    const mood = () => dom.window.document.querySelector('#modalCard .ops-mood').textContent;
    assert.equal(mood(), ev("tr('ops.mood_new',{name:opsName()})"), lang + ': a new hire says so');
    on(ev, 'transit', { x: 1.5 }, 0);
    ev("S.transit[0].hist=[600];S.day=21");shift(ev);ev("S.transit[0].hist=[6000];S.day=28");shift(ev);ev('opsModal()');
    const reps = [...dom.window.document.querySelectorAll('#modalCard .ops-rep')];
    assert.equal(reps.length, 2, lang + ': last week, and this week so far');
    assert.equal(reps[0].lastElementChild.textContent, ev('opsWeekLine(S.ops.rep)'), lang);
    assert.ok(mood().length > 10, lang);
    assert.doesNotMatch(dom.window.document.getElementById('modalCard').textContent, /\bops\.[a-z_]+/, lang);
    assert.deepEqual(errors, [], lang);
    dom.window.close();
  }
});

test('the mood follows the week, with no dice', t => {
  const { ev, errors } = game(t);
  ev('S.day=100'); hire(ev); ev('S.day=110');
  const quiet = ev('opsMood()');
  assert.equal(ev('opsMood()'), quiet, 'the same day reads the same');
  assert.ok([ev("tr('ops.mood_quiet',{name:'Kevin'})"), ev("tr('ops.mood_kevin')")].includes(quiet));
  ev("S.ops.wk=opsWkNew(Math.floor(S.day/7));S.ops.wk.n.sales=1");
  assert.equal(ev('opsMood()'), ev("tr('ops.mood_sales',{name:'Kevin'})"));
  ev("S.ops.wk.n.broke=1;delete S.ops.wk.n.sales");
  assert.equal(ev('opsMood()'), ev("tr('ops.mood_broke',{name:'Kevin'})"));
  assert.deepEqual(errors, []);
});

test('fat fingers: never under Change Freeze, rare and harmless in On-call and BGP at 3 a.m.', t => {
  const { ev, errors } = game(t);
  hire(ev);
  ev('window.__r=Math.random;Math.random=()=>0');
  for (let i = 0; i < 50; i++) shift(ev);
  assert.equal(ev('S.ops.log.some(e=>e.f!==undefined)'), false, 'Change Freeze: never, even on the unluckiest roll');
  for (const p of ['oncall', 'bgp']) {
    ev(`S.rules=makeRules('${p}');S.ops.log=[]`);
    const c0 = cash(ev), links = ev('S.links.length'), pops = ev('Object.keys(S.pops).length');
    shift(ev);
    assert.equal(ev('S.ops.log[0].f!==undefined'), true, p);
    assert.ok(c0 - cash(ev) <= 20000, 'costs a little at most');
    assert.equal(ev('S.links.length'), links); assert.equal(ev('Object.keys(S.pops).length'), pops);
  }
  ev('Math.random=__r');
  assert.ok(ev("OPS_FF_RATE.oncall<0.01&&OPS_FF_RATE.bgp<0.02"), 'rare');
  assert.deepEqual(errors, []);
});

test('a new POP from the template costs exactly the clicks it replaces', t => {
  const A = game(t), B = game(t);
  hire(A.ev); hire(B.ev);
  const q = JSON.parse(A.ev("JSON.stringify(opsTplQuote('ams'))"));
  assert.ok(q.net && q.ix && q.kit);
  const a0 = cash(A.ev); A.ev("ACT.opsNewPop({city:'ams'})"); const a1 = cash(A.ev);
  const b0 = cash(B.ev);
  B.ev(`ACT.buildPop({city:'ams'});ACT.launchBB({city:'ams'});ACT.buyTransit({city:'ams',net:'${q.net}',tier:0});ACT.buyIx({city:'ams',tier:0});ACT.utilityKit({city:'ams',cost:utilityKit('ams').cost})`);
  assert.equal(a0 - a1, q.cost, 'the quoted price');
  assert.equal(a0 - a1, b0 - cash(B.ev), 'the same as clicking it');
  assert.equal(A.ev('JSON.stringify([S.pops.ams.gen,S.pops.ams.site2,S.pops.ams.routers,!!S.pops.ams.bb,S.ixp.ams])'), B.ev('JSON.stringify([S.pops.ams.gen,S.pops.ams.site2,S.pops.ams.routers,!!S.pops.ams.bb,S.ixp.ams])'));
  A.ev('S.cash=10');A.ev("ACT.opsNewPop({city:'lon'})");
  assert.equal(A.ev('!!S.pops.lon'), false, 'all or nothing on the price');
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
});

test('saves: old saves load with no intern and everything off, settings survive a reload, junk is repaired', t => {
  const { ev, errors } = game(t);
  ev("delete S.ops;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ops.intern'), null);
  assert.equal(ev('Object.values(S.ops.on).some(Boolean)'), false);
  hire(ev);
  ev("on=1;S.ops.on.pni=true;S.ops.p.pni={g:50,tier:2,paid:true};S.ops.cap.pni=1e6;S.ops.skip.fra=['caches'];save();S=migrate(JSON.parse(slotRaw(UI.slot)))");
  assert.equal(ev("S.ops.intern==='kevin'&&S.ops.on.pni&&S.ops.p.pni.tier===2&&S.ops.cap.pni===1e6&&S.ops.skip.fra[0]==='caches'"), true);
  ev(`S.ops={intern:'mallory',on:{transit:'yes',hack:true},p:{transit:{x:99,prov:'nobody'}},cap:{transit:-5},spent:{transit:'lots'},skip:{atlantis:['transit'],fra:['ix','transit']},
    log:[{d:1,i:'kevin',r:[['transit',2,['fra +1×100G','<img>']],['evil',1,[]]],f:99,c:'fra'},'junk'],floor:3,tpl:{bb:'no'}};S=migrate(S)`);
  assert.equal(ev('S.ops.intern'), null);
  assert.equal(ev("S.ops.on.transit===false&&!('hack' in S.ops.on)"), true);
  assert.equal(ev("opsP('transit','x')===1.5&&opsP('transit','prov')==='cheap'&&opsCap('transit')===50000&&S.ops.spent.transit===0"), true);
  assert.equal(ev("JSON.stringify(S.ops.skip)"), '{"fra":["transit"]}');
  assert.equal(ev("JSON.stringify(S.ops.log)"), '[{"d":1,"i":"kevin","r":[["transit",2,["fra +1×100G"]]]}]');
  assert.equal(ev('S.ops.floor===50000&&S.ops.tpl.bb===true'), true);
  ev(`S.ops.wk={w:3,i:'kevin',n:{sales:2,evil:9,transit:'x'},wh:{transit:['fra +1×100G','<b>']},up:-5,mo:'a',rev:41000,ff:99};S.ops.rep={i:'mallory'};S=migrate(S)`);
  assert.equal(ev("JSON.stringify(S.ops.wk)"), '{"w":3,"i":"kevin","n":{"sales":2},"wh":{"transit":["fra +1×100G"]},"up":0,"mo":0,"rev":41000,"ff":7}');
  assert.equal(ev('S.ops.rep'), null);
  assert.deepEqual(errors, []);
});

test('the Ops sheet works at 360 px in every language, from the NOC tab and the phone tab bar', t => {
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'pt']) {
    const h = load(lang === 'en' ? {} : { lang });
    const { ev, dom, errors } = h;
    ev(BASE);
    dom.window.innerWidth = 360;
    const doc = dom.window.document;
    ev("ACT.phoneTab({t:'noc'})");
    const open = doc.querySelector('#leftBody [data-act="opsOpen"]');
    assert.ok(open, lang);
    open.click();
    const hireBtn = doc.querySelector('#modalCard [data-act="opsHire"]');
    assert.ok(hireBtn, lang);
    hireBtn.click();
    assert.ok(ev('opsHired()'), lang);
    doc.querySelector('#modalCard [data-act="opsToggle"]').click();
    assert.equal(doc.querySelector('#modalCard [data-act="opsToggle"]').getAttribute('aria-pressed'), 'true', lang);
    doc.querySelector('#modalCard [data-act="opsParam"]').click();
    const txt = doc.getElementById('modalCard').textContent;
    assert.doesNotMatch(txt, /\bops\.[a-z_]+/, lang);
    assert.ok(doc.querySelector('#modalCard select[data-chg="opsCity"]'), lang);
    ev("closeModal();selectCity('ams')");
    assert.ok(doc.querySelector('#panelBody [data-act="opsNewPop"]'), lang);
    assert.doesNotMatch(doc.getElementById('panelBody').textContent, /\bops\.[a-z_]+/, lang);
    assert.deepEqual(errors, [], lang);
    dom.window.close();
  }
});

test('sales trial at most one offer a shift, and an offer that did not fit waits a week', t => {
  const { ev, errors } = game(t);
  hire(ev); on(ev, 'sales', { acc: true, min: 0 });
  ev("S.offers=['a','b','c'].map(id=>({id,city:'fra',name:id,type:'dia',bw:1e5,rate:600,reqs:[],exp:60}));window.__t=0;window.__a=autoOffer;autoOffer=o=>{__t++;return __a(o)}");
  shift(ev);
  assert.equal(ev('__t'), 1, 'one routing trial per shift');
  for (let i = 0; i < 2; i++) { ev('S.day++'); shift(ev); }
  assert.equal(ev('__t'), 3, 'each offer once');
  ev('S.day++'); shift(ev);
  assert.equal(ev('__t'), 3, 'too big for the network: not tried again within the week');
  ev('S.day+=7'); shift(ev);
  assert.equal(ev('__t'), 4);
  ev('autoOffer=__a');
  assert.deepEqual(errors, []);
});

test('re-hiring in a later month starts on a fresh budget, not last month\'s spending', t => {
  const { ev, errors } = game(t);
  hire(ev);
  ev("S.ops.spent.transit=50000;ACT.opsFire();ACT.opsFire();S.day=400;ACT.opsHire({id:'kevin'});closeModal()");
  assert.equal(ev('S.ops.spent.transit'), 0);
  assert.equal(ev('S.ops.mon'), ev('Math.floor(S.day/30)'));
  ev("S.ops.spent.transit=1234;ACT.opsFire();ACT.opsFire();ACT.opsHire({id:'annie'});closeModal()");
  assert.equal(ev('S.ops.spent.transit'), 1234, 'the same month: what was spent stays spent');
  assert.deepEqual(errors, []);
});

test('transit never comes from a provider that breaks a promise: no-Cogentle customers, bank covenants, the Spat', t => {
  const { ev, errors } = game(t, "S.transit=[];ACT.buyTransit({city:'fra',net:'lvl',tier:0});compute();S.transit[0].hist=Array(30).fill(200)");
  hire(ev); on(ev, 'transit', { x: 1.5 });
  assert.equal(ev("cheapestTransit('fra').id"), 'cog', 'Cogentle is the cheapest here, so it would be the pick');
  ev("S.biz.push({id:'b1',city:'fra',name:'X',type:'dia',bw:1,rate:100,mood:100,since:S.day,reqs:['nocog']})");
  assert.equal(ev("reqOk(S.biz[0])"), true);
  shift(ev);
  assert.ok(ev('S.transit.length') > 1 || ev('S.transit[0].n') > 1, 'the intern still topped up');
  assert.equal(ev("S.transit.some(t=>t.net==='cog')"), false);
  assert.equal(ev("reqOk(S.biz[0])"), true, 'the customer still gets what they signed for');
  ev("S.ops.p.transit={x:1.5,prov:'cog'}");
  assert.notEqual(ev("opsProv('fra').id"), 'cog', 'even when the player picked Cogentle');
  assert.notEqual(ev("opsTplQuote('ams').net"), 'cog', 'and the new-POP template too');
  // A bank covenant says the same.
  ev("S.biz=[];S.loans=[{bank:'db',covs:['nocog'],pay:1,bal:1}]");
  assert.notEqual(ev("cheapestTransit('fra').id"), 'cog');
  // Cogentle is not speaking to Goggle: the Spat scenario, or a de-peering.
  ev("S.loans=[]");
  assert.equal(ev("cheapestTransit('fra').id"), 'cog');
  ev("S.ev.depeer=S.day+5");
  assert.notEqual(ev("cheapestTransit('fra').id"), 'cog');
  ev("S.ev.depeer=0;S.scn={id:'spat',rules:{spat:true}}");
  assert.notEqual(ev("cheapestTransit('fra').id"), 'cog');
  // Two upstreams: once met, never undone (adding is fine; the order never removes).
  ev("S.scn=null;S.biz=[{id:'b2',city:'fra',name:'Y',type:'dia',bw:1,rate:1,mood:100,since:0,reqs:['twoup']}]");
  assert.ok(ev("cheapestTransit('fra')"));
  ev("S.transit=[]");
  assert.equal(ev("cheapestTransit('fra')"), undefined, 'a lone first upstream would break "two upstreams"');
  assert.deepEqual(errors, []);
});

test('decommission keeps its spare in another trench than the big link', t => {
  const { ev, errors } = game(t, "ACT.buildPop({city:'ams'});S.pops.ams.rgen=1;for(const [id,tier,tr] of [['big',2,'T1'],['s1',1,'T1'],['s2',0,'T2']])S.links.push({id,a:'fra',b:'ams',kind:'wave',tier,km:400,sub:false,cut:0,mo:100,trench:tr});compute()");
  hire(ev); on(ev, 'decom', { keep: true });
  ev("R.load={big:1,s1:0,s2:0}");
  shift(ev);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.links.map(l=>l.id).sort())")), ['big', 's2'], 'the 100G in the same trench goes, the 10G in its own trench stays');
  // Every small wave shares the big one's trench: keep the largest, as before.
  ev("S.links=S.links.filter(l=>l.id==='big');for(const [id,tier] of [['a',1],['b',0]])S.links.push({id,a:'fra',b:'ams',kind:'wave',tier,km:400,sub:false,cut:0,mo:100,trench:'T1'});compute();R.load={big:1}");
  shift(ev);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.links.map(l=>l.id).sort())")), ['a', 'big']);
  assert.deepEqual(errors, []);
});

test('decommission sees the traffic of a customer signed earlier in the same shift', t => {
  const { ev, errors } = game(t, "S.pops.fra.bb.d=30;ACT.buildPop({city:'ams'});S.pops.ams.rgen=1;for(const [id,tier,tr] of [['big',2,'T1'],['s1',1,'T2'],['s2',1,'T3']])S.links.push({id,a:'fra',b:'ams',kind:'wave',tier,km:400,sub:false,cut:0,mo:1000,trench:tr});compute()");
  hire(ev); on(ev, 'sales', { acc: true, min: 0 }); on(ev, 'decom', { keep: false });
  ev("S.offers=[{id:'o1',city:'fra',city2:'ams',name:'Bulk Co',type:'l2vpn',bw:450,rate:20,reqs:[],exp:S.day+20}]");
  shift(ev);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.biz.map(b=>b.id))')).length, 1, 'signed');
  assert.equal(ev('S.links.length'), 3, 'its 450G needs every wave, so none goes');
  ev('compute()');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(bizWhy(S.biz[0]))')), []);
  assert.deepEqual(errors, []);
});

test('no recompute on a shift that only declined offers or stopped at a budget', t => {
  const { ev, errors } = game(t);
  hire(ev); on(ev, 'sales', { acc: false, min: 50000 }); on(ev, 'transit', { x: 3 }, 10000);
  ev("S.ops.spent.transit=10000;S.transit[0].hist=[600];S.offers=[{id:'tiny',city:'fra',name:'Tiny',type:'dia',bw:1,rate:600,reqs:[],exp:30}]");
  const n = ev("window.__c=compute;window.__n=0;compute=()=>{__n++;return __c()};opsDay(S.day);compute=__c;__n");
  assert.equal(n, 0, 'nothing in the network changed');
  assert.match(ev('opsEntry(S.ops.log[0])'), /declined a tiny offer, stopped at the budget/);
  ev("S.ops.spent.transit=0");
  assert.equal(ev("window.__n=0;compute=()=>{__n++;return __c()};opsDay(S.day);compute=__c;__n"), 1, 'a real job still recomputes once');
  assert.deepEqual(errors, []);
});

test('per-POP exceptions go with the POP: on decommission, and in a save that lost it', t => {
  const { ev, errors } = game(t, "ACT.buildPop({city:'ams'});ACT.buildPop({city:'lon'});compute()");
  hire(ev);
  ev("ACT.opsPop({k:'transit',city:'ams'});ACT.opsPop({k:'caches',city:'lon'});closeModal()");
  ev("decommission(['ams'])");
  assert.equal(ev('JSON.stringify(S.ops.skip)'), '{"lon":["caches"]}');
  ev("ACT.buildPop({city:'ams'});closeModal()");
  assert.equal(ev("opsHere('transit','ams')"), true, 'a rebuilt POP starts with every order on');
  ev("S.ops.skip.par=['transit'];S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('JSON.stringify(S.ops.skip)'), '{"lon":["caches"]}', 'no POP in Paris: its exception is dropped on load');
  assert.deepEqual(errors, []);
});

test('one order that throws is paused and noted; the rest of the shift and the day still run', t => {
  const { ev, errors } = game(t, "S.transit[0].hist=[60,80,70]");
  hire(ev); on(ev, 'repair'); on(ev, 'transit', { x: 1.5 });
  ev("window.__r=OPS_RUN.repair;OPS_RUN.repair=()=>{throw new Error('boom')};window.__e=console.error;console.error=()=>{}");
  const d = ev('S.day'), saves = ev("window.__s=0;window.__sv=save;save=()=>{__s++;return __sv()};S.day=29;dayTick();save=__sv;__s");
  ev("OPS_RUN.repair=__r;console.error=__e");
  assert.ok(d >= 0 && saves >= 1, 'dayTick reached the save on day 30');
  assert.equal(ev('S.ops.on.repair'), false, 'the broken order is paused');
  assert.ok(ev("(S.transit[0].n||1)") > 1, 'the next order still ran');
  assert.match(ev('opsEntry(S.ops.log[0])'), /got stuck on Rush repairs and paused it/);
  assert.deepEqual(errors, []);
});

test('the fat-fingered LAG member respects a paused transit order and per-POP exceptions', t => {
  const { ev, errors } = game(t);
  hire(ev);
  // Each shift rolls: fat finger yes, the only POP, the LAG slip (index 3).
  ev("S.rules=makeRules('bgp');window.__r=Math.random;window.__k=0;Math.random=()=>[0,0,0.7][__k++%3]");
  const n0 = ev('S.transit[0].n||1'), c0 = cash(ev);
  shift(ev);
  assert.equal(ev('__k'), 3);
  assert.equal(ev('S.ops.log[0].f'), 0, 'transit order paused: a harmless label instead');
  assert.equal(ev('S.transit[0].n||1'), n0); assert.equal(cash(ev), c0);
  on(ev, 'transit', { x: 1 }); ev("ACT.opsPop({k:'transit',city:'fra'});closeModal();S.transit[0].hist=[0]");
  shift(ev);
  assert.equal(ev('S.ops.log[0].f'), 0, 'Frankfurt excepted: the same');
  ev("ACT.opsPop({k:'transit',city:'fra'});closeModal()");
  shift(ev);
  assert.equal(ev('S.ops.log[0].f'), 3, 'allowed: the extra member');
  assert.equal(ev('S.transit[0].n||1'), n0 + 1);
  ev('Math.random=__r');
  assert.deepEqual(errors, []);
});

test('caches: the cash floor and a running-cost budget hold; the panel and the log show what a month costs', t => {
  const { ev, errors } = game(t);
  hire(ev); on(ev, 'caches', { g: 1 });
  const add = () => ev("utilityCaches('fra').add.filter(x=>(R.cityDem.fra||0)*NSH[x.net]>=1).length");
  assert.ok(add() >= 2, 'several boxes on offer');
  ev('S.ops.floor=50000;S.cash=1000');
  shift(ev);
  assert.equal(ev('S.caches.length'), 0, 'below the floor: no new rent either');
  assert.match(ev('opsEntry(S.ops.log[0])'), /stopped at the budget for Accept free caches/);
  ev('S.cash=1e8;S.ops.cap.caches=1000');
  const m0 = ev('opsMoNow()');
  shift(ev);
  assert.equal(ev('S.caches.length'), 2, 'a $1k/mo budget fits two $400/mo boxes');
  assert.equal(ev('S.ops.addMo.caches'), 800);
  assert.equal(ev('opsMoNow()') - m0, 800);
  assert.equal(ev('S.ops.log[0].mo'), 800);
  assert.match(ev('opsEntry(S.ops.log[0])'), /racked 2 free caches \(Frankfurt\).*Cost: \$0 up front, \+\$800\/mo\./);
  ev('opsModal()');
  const txt = ev("document.getElementById('modalCard').textContent");
  assert.match(txt, /each box costs \$400\/mo/);
  assert.match(txt, /Adds at most: \+\$1\.0k\/mo/);
  assert.match(txt, /This month: \$0 up front, \+\$800\/mo on the bill/);
  ev('S.day+=30;S.ops.cap.caches=0'); shift(ev);
  assert.equal(ev('S.ops.addMo.caches'), (ev('S.caches.length') - 2) * 400, 'a new month counts from zero');
  assert.deepEqual(errors, []);
});

test('transit: the log line and budget line show the monthly cost a top-up adds', t => {
  const { ev, errors } = game(t, "S.transit[0].hist=[60,80,70]");
  hire(ev); on(ev, 'transit', { x: 1.5 });
  const m0 = ev('opsMoNow()'), c0 = cash(ev);
  shift(ev);
  const mo = ev('opsMoNow()') - m0;
  assert.ok(mo > 0);
  assert.equal(ev('S.ops.log[0].up'), c0 - cash(ev));
  assert.equal(ev('S.ops.log[0].mo'), Math.round(mo));
  assert.equal(ev('Math.round(S.ops.addMo.transit)'), Math.round(mo));
  assert.match(ev('opsEntry(S.ops.log[0])'), /Cost: \$[\d.]+k up front, \+\$[\d.]+k?\/mo\./);
  assert.deepEqual(errors, []);
});

test('#226 the shift report\'s Open button in the NOC opens the Ops sheet, and survives a reload', t => {
  const { ev, errors, dom } = game(t);
  ev('S.day=14'); hire(ev); on(ev, 'sales', { acc: false, min: 5000 });
  ev("S.offers=[{id:'t',city:'fra',name:'T',type:'dia',bw:1,rate:600,reqs:[],exp:60}];S.day=15"); shift(ev);
  ev('S.day=21'); shift(ev);
  assert.match(ev('S.log[0].t'), /^Kevin's week/);
  ev("S=migrate(JSON.parse(JSON.stringify(S)));closeModal();ACT.leftTab({t:'noc'})");
  const doc = dom.window.document;
  const b = doc.querySelector(`#leftBody [data-act=logOpen][data-args='${JSON.stringify({ id: ev('S.log[0].id') })}']`);
  assert.ok(b, 'the report has an Open button');
  b.click();
  assert.equal(doc.getElementById('modal').hidden, false, 'a sheet opened');
  assert.ok(doc.querySelector('#modalCard .ops-rep'), 'and it is the Ops sheet with the report');
  assert.deepEqual(errors, []);
});

test('#228 the intern names the exchanges it peered at, even one that shares its city\'s id', t => {
  const { ev, errors } = game(t, "ACT.buyIx({city:'fra',tier:0,signed:true})");
  hire(ev); on(ev, 'ix');
  ev('S.day=14'); shift(ev);
  const line = ev('opsLine(S.ops.log[0])');
  // Frankfurt's first exchange has the city's id: the line names DE-KICKS, not the city
  assert.match(line, /peered with \d+ networks? at DE-KICKS/, line);
  assert.doesNotMatch(line, /at Frankfurt/);
  // two exchanges in two cities read as two exchanges, in the daily line and in the week's report
  const e = "{i:'kevin',r:[['peer',2,['fra~3','lon']]],up:0,mo:0}";
  assert.match(ev(`opsLine(${e})`), /at Apfelwein-IX, LYNX/);
  assert.match(ev("opsWeekLine({w:2,i:'kevin',n:{peer:2},wh:{peer:['fra~3','lon']},up:0,mo:0,rev:0,ff:0})"), /at Apfelwein-IX, LYNX/);
  // other orders still name cities
  assert.match(ev("opsLine({i:'kevin',r:[['routers',1,['lon +1']]],up:0,mo:0})"), /London \+1/);
  assert.deepEqual(errors, []);
});
