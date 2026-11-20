// The Hyperscaler's availability zones (60-features/38-hyper-zones.js): what a zone costs and adds (Gbps, compute slots,
// megawatts from the same metro grid, a monthly bill), the level gates; a zone takes every local failure (a router crash,
// a power cut, a fat finger, the cleaner, one feed's grid trouble, one building's squirrel or certificate) so the region
// serves on minus a zone's worth with no failover and nothing lost; it never helps against what hits the whole metro, the
// whole region or the law (a grid squeeze or trip, a moratorium, residency, a region-wide failure, Chaos Kong, lost data);
// the plan suggests one; saves; the Cloud tab and card at 360 px and on a desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
// Whole-region failures and grid trips are let in by the director from day HS_DIR_BIG: these tests start past it.
const DIR = 'S.day=Math.max(S.day,HS_DIR_BIG);Object.assign(S.hs.dir,{b:9,t:S.day,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});';
/* Frankfurt (home, a Server Barn: 1.5T), Paris and Amsterdam (Rack Shacks), transit at each, fat waves. German users
   (300G) call Frankfurt home, its replica is Amsterdam. Frankfurt gets one zone, live today (zone: true). */
function net(t, zone = true, lv = 8) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev(`ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=${lv};S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});` +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','ams'])ACT.buyTransit({city:c,net:'cog',tier:4});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.par={t:0,ready:0,mw:5};S.hs.rg.ams={t:0,ready:0,mw:5};S.hs.pw.fra=hsPwDef('fra');S.hs.pw.par=hsPwDef('par');S.hs.pw.ams=hsPwDef('ams');" +
    "S.hs.cc.DE={d:300,since:0};S.hs.rep.fra='ams';S.links=[];" + wave('fp', 'fra', 'par', 4) + wave('fa', 'fra', 'ams', 4) + wave('ap', 'ams', 'par', 4) + DIR +
    (zone ? "ACT.hsZone({city:'fra'});S.hs.az.fra[0].r=S.day;" : '') + 'compute();hsDay(S.day);checkGoals();compute();checkGoals();S.log=[]');
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
// An outage at Frankfurt's POP as failureRun makes one (85-incidents/20-failures.js), then the soft landing it asks for.
const popInc = (type) => `S.pops.fra.down=S.day+2;addInc({type:${lit(type)},ref:'fra',until:S.day+2,msg:'Boom.',cost:1500,fix:'Fix'});hsSoloSoft(S.inc[S.inc.length-1]);compute()`;
// The dice a region failure rolls (hsFailFire): which region, how long, which message.
const dice = (...q) => `(()=>{const q=${JSON.stringify(q)},m=Math.random;Math.random=()=>q.length?q.shift():m();try{return hsFailFire();}finally{Math.random=m;}})()`;

test('a zone costs a fifth of its tier, builds in weeks, adds room, slots and megawatts from the same grid, and bills monthly', (t) => {
  const { ev, errors } = net(t, false);
  const c0 = ev('S.cash'), cost0 = ev('R.cost.cloud'), free0 = ev("hsMwFree('fra')"), used0 = ev("hsMwUsed('fra')");
  assert.equal(ev("hsAzCost('fra')"), 80000, 'a fifth of a Server Barn');
  assert.equal(ev("hsAzCost('par')"), 60000, 'and at least $60k (the Rack Shack is free)');
  ev("ACT.hsZone({city:'fra'})");
  assert.equal(c0 - ev('S.cash'), 80000);
  const z = J(ev, 'S.hs.az.fra');
  assert.equal(z.length, 1);
  assert.equal(z[0].r - ev('S.day'), ev('leadDays(20)'), 'twenty days, a third of a Barn\'s sixty');
  // Being built: it holds its megawatts already, but serves nothing yet.
  ev('compute()');
  assert.equal(ev('R.hs.rg.fra.g'), 1500);
  assert.equal(ev("hsMwRes('fra')") - ev("hsMwUsed('fra')"), 5, 'held while built');
  assert.ok(Math.abs(free0 - ev("hsMwFree('fra')") - 5) < 1e-9);
  ev('S.hs.az.fra[0].r=S.day;compute()');
  assert.equal(ev('R.hs.rg.fra.g'), 1875, 'a quarter of the tier more');
  assert.equal(ev("hsSlots('fra')"), 15, 'three compute slots more');
  assert.ok(Math.abs(ev("hsMwUsed('fra')") - used0 - 5) < 1e-9, 'five MW more drawn from the metro grid');
  assert.equal(Math.round(ev('R.cost.cloud') - cost0 - ev("hsAzMo('fra')") - ev("hsPwBill('fra')") + ev(`(()=>{const k=S.hs.az.fra;S.hs.az.fra=[];const b=hsPwBill('fra');S.hs.az.fra=k;return b;})()`)), 0, 'its monthly bill and its power');
  assert.equal(ev("hsAzMo('fra')"), 3000);
  // A third building at level 5 and up, never a fourth; never on a cage, never without a region.
  ev("ACT.hsZone({city:'fra'})");
  assert.equal(ev('S.hs.az.fra.length'), 2);
  ev("ACT.hsZone({city:'fra'})");
  assert.equal(ev('S.hs.az.fra.length'), 2, 'three buildings at most');
  assert.notEqual(ev('S.hs.az.fra[0].n'), ev('S.hs.az.fra[1].n'), 'every zone its own name');
  ev("ACT.hsZone({city:'lon'})");
  assert.equal(ev('S.hs.az.lon'), undefined);
  assert.deepEqual(errors, []);
});

test('zones wait for their level, and a metro with no megawatts to spare gets none', (t) => {
  const { ev, errors } = net(t, false, 1);
  ev("ACT.hsZone({city:'fra'})");
  assert.equal(ev('S.hs.az.fra'), undefined, 'not at level 1');
  ev("S.lvl=2;ACT.hsZone({city:'fra'});ACT.hsZone({city:'fra'})");
  assert.equal(ev('S.hs.az.fra.length'), 1, 'one at level 2');
  ev("S.hs.pw.par.cap=hsTown('par')+5.5;ACT.hsZone({city:'par'})");
  assert.equal(ev('S.hs.az.par'), undefined, 'no power for it in Paris');
  assert.match(ev('S.log.map(x=>x.m||x.msg||"").join(" ")+document.body.textContent'), /No power for a zone in Paris/);
  assert.deepEqual(errors, []);
});

test('a zone takes every local failure: the region serves on minus a zone, no failover, nothing lost', (t) => {
  const { ev, errors } = net(t);
  ev("S.hs.lag['fra>ams']=500");
  for (const type of ['crash', 'power', 'oops', 'cleaner']) {
    ev("S.inc=[];delete S.pops.fra.down;" + popInc(type));
    assert.equal(ev("S.inc[0].type"), 'hsaz', `${type}: one zone out`);
    assert.equal(ev("hsLive('fra')&&!hsOut('fra')&&!(S.pops.fra.down>S.day)"), true, `${type}: the region and its POP stay up`);
    assert.equal(ev("R.hs.fo.fra"), undefined, `${type}: no failover`);
    assert.equal(ev('R.hs.rg.fra.g'), 1500, `${type}: a zone's worth less`);
    assert.ok(ev("hsQ(R,'DE')") >= 0.9, `${type}: users barely notice`);
    assert.match(ev('S.inc[0].msg'), /It hit Zone [AB].* only/);
  }
  // One feed's grid trouble: a zone's worth less, not half.
  ev("S.inc=[];addInc({type:'hspow',ref:'fra',until:S.day+2,msg:'x',cost:1});compute()");
  assert.equal(ev('R.hs.rg.fra.g'), 1500);
  // One building's trouble in a region failure (a squirrel, a certificate, the cooling, the batteries): one zone out.
  for (const k of [0, 1, 2, 5]) {
    ev('S.inc=[];S.hs.down={};S.hs.out={};compute()');
    assert.equal(ev(dice(0.4, 0, (k + 0.5) / 6)), true);
    assert.equal(ev("S.inc[S.inc.length-1].type+'|'+S.inc[S.inc.length-1].ref"), 'hsaz|fra', `message ${k}: a zone`);
    ev('compute();hsFailDay(S.day)');
    assert.equal(ev("!S.hs.down.fra&&!S.hs.out.fra&&hsLive('fra')"), true, `message ${k}: no region failure`);
  }
  assert.equal(ev("S.hs.lag['fra>ams']"), 500, 'the backlog was never at risk');
  assert.equal(ev('S.hs.flost'), 0, 'no data lost');
  assert.equal(ev('S.hs.azo.fra'), 8, 'every local outage counted');
  // A zone out is no crisis for the director: other trouble may still come.
  ev("S.inc=[];addInc({type:'hsaz',ref:'fra',until:S.day+2,msg:'x',cost:1})");
  assert.equal(ev('hsDirInc()'), false);
  // Without a zone the same trouble hits the region as before: half for one feed, a failover for a dark POP.
  ev("S.inc=[];addInc({type:'hspow',ref:'par',until:S.day+2,msg:'x',cost:1});compute()");
  assert.equal(ev('R.hs.rg.par.g'), 200);
  assert.deepEqual(errors, []);
});

test('a zone never helps against the metro, the region or the law', (t) => {
  const { ev, errors } = net(t);
  ev("ACT.hsZone({city:'fra'});S.hs.az.fra[1].r=S.day;compute()");
  assert.equal(ev('R.hs.rg.fra.g'), 2250, 'two zones');
  // A change pushed to every building (DNS, the cleanup script): the whole region fails over.
  for (const k of [3, 4]) {
    ev('S.inc=[];S.hs.down={};S.hs.out={};compute()');
    ev(dice(0.4, 0, (k + 0.5) / 6));
    assert.equal(ev("S.inc[S.inc.length-1].type"), 'region', `message ${k}: the region`);
    ev('compute()');
    assert.equal(ev("hsOut('fra')"), true);
    assert.equal(ev('R.hs.fo.fra'), 'ams', 'its replica takes over');
  }
  // A region-wide failure with backlog over the mark: data lost, zones or not.
  ev("S.inc=[];S.hs.down={};S.hs.out={};S.hs.lag['fra>ams']=500;hsRegionFail('fra',2,'region');compute()");
  assert.equal(ev('S.hs.flost'), 1, 'lost data still needs a replica region');
  // Chaos Kong evacuates a region with zones like any other.
  ev("S.inc=[];S.hs.down={};S.hs.out={};for(const c of ['par','ams']){S.hs.az[c]=[{r:0,n:0}];}compute();runNow(hsKongRun());compute()");
  assert.equal(ev('Object.keys(S.hs.down).length'), 1, 'Chaos Kong takes a whole region');
  // The metro's grid squeezed (a heatwave, a cut): every building shares the same grid, so the zones are cut too.
  ev("S.inc=[];S.hs.down={};S.hs.out={};S.hs.pw.fra.cap=hsTown('fra')+20;compute()");
  assert.ok(ev("hsCut('fra')") < 1);
  assert.ok(Math.abs(ev('R.hs.rg.fra.g') - ev("hsRgG('fra')*hsCut('fra')")) < 1e-6, 'the cut takes its share of every zone');
  // A grid trip announced for tomorrow and not answered takes the region down, zones or not.
  ev("S.hs.pw.fra.cap=hsTown('fra')+8;compute();S.hs.dir.w={c:'fra',d:S.day,k:'cut',ok:0};hsTripDay(S.day)");
  assert.equal(ev("S.hs.down.fra>S.day"), true, 'a tripped metro grid takes every building');
  ev("S.hs.pw.fra=hsPwDef('fra');S.hs.down={};S.hs.out={};S.inc=[];compute()");
  // A moratorium: no new building in the metro, a zone included.
  ev("S.hs.law.mor.par={a:S.day,f:S.day,u:S.day+200,m:0};ACT.hsZone({city:'par'})");
  assert.equal(ev('S.hs.az.par.length'), 1, 'no zone during a moratorium');
  // Residency: users pinned to their country are not served from a zone abroad.
  ev("S.hs.cc.IN={d:50,since:0};compute()");
  assert.equal(ev("R.hs.cc.IN.parts.some(p=>p[3])"), false, 'Indian users still wait for an Indian region');
  assert.deepEqual(errors, []);
});

test('the plan suggests a zone where a region runs in one building or keeps meeting local outages', (t) => {
  const { ev, errors } = net(t, false, 2);
  ev("HP.k='';compute()");
  const P = J(ev, "hp().P.filter(x=>x.k==='az').map(x=>x.c)");
  assert.deepEqual(P, ['ams', 'fra', 'par']);
  assert.equal(ev("!!hpUrgent()&&hpUrgent().k==='az'"), false, 'advice, never the urgent next step');
  ev("ACT.hsZone({city:'fra'});S.hs.az.fra[0].r=S.day;S.lvl=5;HP.k='';compute()");
  assert.equal(ev("hp().P.some(x=>x.k==='az'&&x.c==='fra')"), false, 'one zone and no outages: enough');
  ev("S.hs.azo={fra:3};HP.k='';compute()");
  assert.equal(ev("hp().P.find(x=>x.k==='az'&&x.c==='fra').o"), 3, 'three local outages: another zone');
  assert.deepEqual(errors, []);
});

test('saves: zones repaired against the regions, old saves load', (t) => {
  const { ev, errors } = net(t);
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  assert.deepEqual(back.hs.az, s.hs.az);
  const junk = { ...s, hs: { ...s.hs, az: { fra: [{ r: 'x', n: 99 }, 7, { r: 3, n: 1 }, { r: 4, n: 2 }], zzz: [{ r: 1, n: 0 }], par: 'no' }, azo: { fra: -3, ams: 'x', zzz: 4, par: 2 } } };
  const m = J(ev, `migrate(${JSON.stringify(junk)})`);
  assert.deepEqual(m.hs.az, { fra: [{ r: 0, n: 5 }, { r: 3, n: 1 }] });
  assert.deepEqual(m.hs.azo, { par: 2 });
  const old = { ...s, hs: { ...s.hs } };
  delete old.hs.az; delete old.hs.azo;
  const o = J(ev, `migrate(${JSON.stringify(old)})`);
  assert.deepEqual([o.hs.az, o.hs.azo], [{}, {}]);
  // A zone on what is now a cage goes.
  const cage = { ...s, hs: { ...s.hs, rg: { ...s.hs.rg, par: { t: 4, ready: 0, mw: 0 } }, az: { par: [{ r: 0, n: 0 }] } } };
  assert.deepEqual(J(ev, `migrate(${JSON.stringify(cage)}).hs.az`), {});
  ev(`S=migrate(${JSON.stringify(s)});compute();for(let i=0;i<3;i++)dayTick()`);
  assert.deepEqual(errors, []);
});

test('the zones section and card lines render on a phone and a desktop, two buttons a row at most', (t) => {
  const { ev, dom, errors } = net(t);
  const doc = dom.window.document;
  ev("S.inc=[];addInc({type:'hsaz',ref:'fra',until:S.day+2,msg:'x',cost:1});compute()");
  for (const [w, h] of [[360, 740], [740, 360], [1280, 800]]) {
    ev(`innerWidth=${w};innerHeight=${h};ACT.focusCity({city:'fra'});UI.tab='cust';ACT.panelFold({k:'s:hsaz',o:1});renderAll()`);
    const sec = doc.querySelector('#panel [data-sec="hsaz"]');
    assert.ok(sec, 'the zones section');
    assert.match(sec.textContent, /Availability zones[\s\S]*2 buildings[\s\S]*Zones protect you from a bad day\. Regions protect you from a bad year\.[\s\S]*Zone B, The /);
    assert.match(sec.textContent, /One building is out until/);
    assert.ok(sec.querySelector('[data-act="hsZone"]'), 'room for a third at level 8');
    assert.ok([...doc.querySelectorAll('#panel .btns')].every((b) => b.querySelectorAll('button').length <= 2), `rows of two (${w})`);
    ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderAll()");
    const card = doc.querySelector('#leftBody .hsc').textContent;
    assert.match(card, /Zones: Frankfurt 2/);
    assert.match(card, /A zone is out in Frankfurt/);
  }
  assert.deepEqual(errors, []);
});
