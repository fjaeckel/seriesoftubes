// Hyperscaler outages, phase 6 (85-incidents/71-hyper-incidents.js): grid trouble halves a region for a day or two, a
// replication storm triples a region's copies, a launch night on a region too small melts it, Route 66 going down sours
// every DNS tenant at once, an expired certificate shuts a front door; each is an incident with its rush fix; they read
// the chaos rule, wait for day 45, roll on hashes and never touch a classic game; saves; the Cloud tab and card.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
// Regions in Frankfurt (a Server Barn), Paris and Amsterdam (Rack Shacks), transit at each, German and French users,
// Frankfurt replicating to Amsterdam; a startup tenant with DNS and one without.
// The director (38-hyper-director.js) lets outages in at their level, once introduced, with budget to spend: these tests
// start with all three.
const DIR = 'Object.assign(S.hs.dir,{b:9,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});';
function cloud(t, seed = 7) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','ams'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.par={t:0,ready:0,mw:5};S.hs.rg.ams={t:0,ready:0,mw:5};S.hs.cc.DE={d:600,since:0};S.hs.cc.FR={d:150,since:0};S.hs.rep.fra='ams';S.links=[];" +
    wave('fa', 'fra', 'ams', 3) + wave('fp', 'fra', 'par', 3) + wave('ap', 'ams', 'par', 3) +
    "S.offers=[];for(const [id,p] of [['t1',['vm','obj','dns']],['t2',['vm','obj']]]){const o=hsOffer('startup','fra',10);o.id=id;o.p=p;S.offers.push(o);ACT.accept({id})}" +
    "for(const b of S.biz)b.mood=60;" + DIR + "compute();hsDay(S.day);S.log=[]");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));

test('grid trouble: a region serves half for a day or two; trucking in diesel ends it', (t) => {
  const { ev, errors } = cloud(t);
  const g0 = ev('R.hs.rg.fra.g');
  // The region is seeded on the day: the first day it lands on Frankfurt.
  const { i, d } = J(ev, "(()=>{let i=null,d=0;for(;d<50;d++){S.inc=[];i=hsIncFire('pow',d);if(i&&i.ref==='fra')break;}return {i,d}})()");
  assert.equal(i.type, 'hspow'); assert.equal(i.ref, 'fra');
  assert.ok(i.until - d >= 1 && i.until - d <= 2, 'a day or two');
  ev("S.inc[0].start=S.day;S.inc[0].until=S.day+2;compute()");
  assert.equal(ev('R.hs.rg.fra.g'), g0 * ev('HI_POW'), 'half its room');
  assert.equal(ev("incTitle('hspow')"), ev("tr('hyper_inc.t_pow')"));
  assert.ok(ev('S.hs.ic.pow') >= 1);
  const c0 = ev('S.cash'), cost = ev('S.inc[0].cost');
  ev("ACT.fixInc({id:S.inc[0].id});compute()");
  assert.equal(c0 - ev('S.cash'), cost);
  assert.equal(ev('R.hs.rg.fra.g'), g0, 'back in full');
  assert.deepEqual(errors, []);
});

test('a replication storm triples a region\'s copies and grows its backlog; rolling back ends it', (t) => {
  const { ev, errors } = cloud(t);
  const b0 = ev('compute();R.hs.rep.fra.base');
  assert.ok(b0 > 0);
  ev("S.inc=[];S.inc.push({id:'s1',type:'hsstorm',ref:'fra',until:S.day+4,start:S.day,msg:'x',cost:25000,fix:'f'});S.hs.lag={};compute()");
  assert.ok(Math.abs(ev('R.hs.rep.fra.base') - 3 * b0) < 1e-6, 'three times the copies');
  // Squeeze the pair so the storm cannot all get through: the backlog grows.
  ev("S.links.find(l=>l.id==='fa').tier=1;S.links.find(l=>l.id==='ap').tier=0;compute();hsDay(S.day)");
  const lag = ev("S.hs.lag['fra>ams']||0");
  assert.ok(lag > 0, 'backlog grows');
  // The real thing: fired, it picks a region with a replica.
  ev('S.inc=[]');
  const i = J(ev, "hsIncFire('storm')");
  assert.equal(i.type, 'hsstorm'); assert.ok(J(ev, 'Object.keys(R.hs.rep)').includes(i.ref));
  assert.ok(i.until - ev('S.day') >= 3 && i.until - ev('S.day') <= 5);
  ev(`ACT.fixInc({id:${lit(i.id)}});compute()`);
  assert.equal(ev('hsRepX(' + lit(i.ref) + ')'), 1);
  assert.deepEqual(errors, []);
});

test('Route 66 down: every tenant with DNS loses happiness at once and its bundle sours; the others are untouched', (t) => {
  const { ev, errors } = cloud(t);
  const q0 = J(ev, "S.biz.map(b=>hsTenQ(R,b))");
  const i = J(ev, "hsIncFire('dns')");
  assert.equal(i.type, 'hsdns'); assert.equal(i.until, ev('S.day') + 1);
  assert.match(i.msg, /DNS/);
  assert.deepEqual(J(ev, 'S.biz.map(b=>b.mood)'), [60 - ev('HI_DNS_MOOD'), 60], 'at once, DNS tenants only');
  assert.equal(ev("hsIncFire('dns')"), null, 'one outage at a time');
  ev('compute()');
  const q1 = J(ev, "S.biz.map(b=>hsTenQ(R,b))");
  assert.ok(q1[0] < q0[0] * 0.5, 'the DNS tenant\'s bundle sours: ' + q0[0] + ' -> ' + q1[0]);
  assert.ok(Math.abs(q1[1] - q0[1]) < 1e-9, 'the other is untouched');
  assert.match(ev("hsIncAlerts().map(x=>x.h).join('')"), /Route 66/);
  assert.match(ev('hsCard()'), /Route 66/, 'at the top of the card');
  ev(`ACT.fixInc({id:${lit(i.id)}});compute()`);
  assert.ok(Math.abs(ev('hsTenQ(R,S.biz[0])') - q0[0]) < 1e-9, 'rolled back');
  assert.deepEqual(errors, []);
});

test('an expired certificate shuts a front door; users go round to another; renewing it costs next to nothing', (t) => {
  const { ev, errors } = cloud(t);
  assert.equal(ev('R.hs.cc.DE.v'), 'fra');
  ev("S.inc=[];S.inc.push({id:'c1',type:'hscert',ref:'fra',until:S.day+2,start:S.day,msg:'x',cost:500,fix:'f'});compute()");
  assert.equal(ev("hsDoor('fra')"), false);
  assert.notEqual(ev('R.hs.cc.DE.v'), 'fra', 'German users enter at another door');
  assert.ok(ev('R.hs.cc.DE.v'));
  ev("ACT.fixInc({id:'c1'});compute()");
  assert.equal(ev('R.hs.cc.DE.v'), 'fra');
  const i = J(ev, "hsIncFire('cert')");
  assert.equal(i.type, 'hscert'); assert.equal(i.cost, 500);
  assert.deepEqual(errors, []);
});

test('a launch night on a region too small melts it until the launch is over; a well-built one never melts', (t) => {
  const { ev, errors } = cloud(t);
  // A game studio with a launch ten times its size tonight, on a Rack Shack in Paris.
  ev("const o=hsOffer('game','par',80);o.id='g1';S.offers.push(o);ACT.accept({id:'g1'});const b=S.biz.find(b=>b.id==='g1');b.rg='par';" +
    "S.hs.lf={id:'g1',g:0,ann:S.day,from:S.day,until:S.day+3,f:10,q:0,k:0};compute()");
  assert.ok(ev("hsLfServed(R,S.biz.find(b=>b.id==='g1'))") < ev('HS_LF_OK'), 'under-provisioned');
  const r = ev("R.hs.ten.g1.r");
  const i = J(ev, "(()=>{for(let d=50;d<90;d++){const i=hsMeltDay(d,1);if(i)return i;}return null})()");
  assert.ok(i, 'it melts on some night');
  assert.equal(i.type, 'hsmelt'); assert.equal(i.ref, r); assert.equal(i.until, ev('S.hs.lf.until'));
  assert.match(i.msg, /Battle Royale with Cheese/);
  const g = ev(`HS_T[S.hs.rg[${lit(r)}].t].g`);
  ev('compute()');
  assert.ok(Math.abs(ev(`R.hs.rg[${lit(r)}].g`) - g * ev('HI_MELT')) < 1e-6 || ev(`R.hs.rg[${lit(r)}].g`) < g, 'serves less');
  assert.equal(ev("hsMeltDay(S.day,1)"), null, 'once');
  // A studio served in full never melts.
  const B = cloud(t);
  B.ev("const o=hsOffer('game','fra',5);o.id='g1';S.offers.push(o);ACT.accept({id:'g1'});S.hs.lf={id:'g1',g:0,ann:S.day,from:S.day,until:S.day+3,f:1.5,q:0,k:0};compute()");
  assert.ok(B.ev("hsLfServed(R,S.biz.find(b=>b.id==='g1'))") >= B.ev('HS_LF_OK'));
  assert.equal(B.ev("(()=>{for(let d=50;d<120;d++)if(hsMeltDay(d,2))return 1;return 0})()"), 0);
  assert.deepEqual(errors, []); assert.deepEqual(B.errors, []);
});

test('outages read the chaos rule, wait for day 45, roll on hashes, and never touch a classic game', (t) => {
  const { ev, errors } = cloud(t);
  const run = (chaos, from, to) => ev(`(()=>{S.rules.chaos=${lit(chaos)};S.inc=[];for(const k in S.hs.ic)S.hs.ic[k]=0;window.__n=0;window.__r=Math.random;Math.random=()=>{__n++;return __r()};
    const d0=S.day;for(let d=${from};d<${to};d++){S.day=d;Object.assign(S.hs.dir,{c:null,q:0,b:9,t:d,ib:0});hsIncDay(d);S.inc=S.inc.filter(i=>i.until>d+1)}S.day=d0;Math.random=__r;
    return JSON.stringify([Object.values(S.hs.ic).reduce((a,x)=>a+x,0),__n])})()`);
  assert.deepEqual(JSON.parse(run('none', 45, 1045)), [0, 0], 'chaos off: never');
  assert.deepEqual(JSON.parse(run('normal', 0, 45)), [0, 0], 'never before day 45');
  const [n, rnd] = JSON.parse(run('normal', 45, 2045));
  assert.equal(rnd, 0, 'no random numbers drawn');
  // About one in forty days, with the director held open but for its one crisis at a time (an outage still on waits).
  assert.ok(n >= 12 && n <= 110, 'about one in forty days: ' + n);
  assert.equal(run('normal', 45, 2045), JSON.stringify([n, 0]), 'the same game rolls the same');
  // A classic game: no hook does anything, the failure kinds are as they were.
  const c = load({ seed: 3 });
  t.after(() => c.dom.window.close());
  c.ev("ACT.start({});S.cash=1e8;compute()");
  assert.equal(c.ev("S.hs===undefined"), true);
  assert.equal(c.ev("(()=>{for(let d=45;d<500;d++)hsIncDay(d);return S.inc.length})()"), 0);
  assert.equal(c.ev("hsRepX('fra')+hsIncNeed('dns')"), 2);
  assert.equal(c.ev("hsCertOut('fra')"), false);
  assert.deepEqual(errors, []); assert.deepEqual(c.errors, []);
});

test('saves: counters repaired; cloud outages pointing nowhere dropped; a classic save keeps none', (t) => {
  const { ev, errors } = cloud(t);
  ev("hsIncFire('dns');S.inc.push({id:'a',type:'hspow',ref:'fra',until:S.day+1,start:S.day,msg:'m',cost:1});S.inc.push({id:'b',type:'hspow',ref:'lon',until:S.day+1,start:S.day,msg:'m',cost:1});" +
    "S.inc.push({id:'c',type:'hscert',ref:'zzz',until:S.day+1,start:S.day,msg:'m',cost:1});S.inc.push({id:'d',type:'hsdns',ref:'nope',until:S.day+1,start:S.day,msg:'m',cost:1});S.hs.ic.pow='lots';S.hs.ic.cert=-4");
  const back = J(ev, '(()=>{const r=parseSave(JSON.stringify(S));const s=migrate(r.s);return {ic:s.hs.ic,inc:s.inc.map(i=>i.id+":"+i.type)}})()');
  assert.deepEqual(back.ic, { pow: 0, storm: 0, melt: 0, dns: 1, cert: 0 });
  assert.ok(back.inc.includes('a:hspow'));
  assert.ok(!back.inc.includes('b:hspow') && !back.inc.includes('c:hscert') && !back.inc.includes('d:hsdns'));
  assert.equal(back.inc.filter(x => x.endsWith(':hsdns')).length, 1);
  assert.deepEqual(errors, []);
});

test('the Cloud tab shows an outage here with its fix, on a phone and a desktop', (t) => {
  const { ev, errors, dom } = cloud(t);
  ev("S.inc.push({id:'p1',type:'hspow',ref:'fra',until:S.day+2,start:S.day,msg:'A crane',cost:20000,fix:'Truck in diesel'});compute()");
  for (const w of [360, 1280]) {
    ev(`window.innerWidth=${w};selectCity('fra');UI.tab='cust';renderAll()`);
    assert.match(ev("((x)=>x?x.t+x.body():'')(hsIncSpec('fra'))"), /Truck in diesel/);
    const html = dom.window.document.body.innerHTML;
    assert.ok(html.includes('A crane'), 'shown at ' + w);
  }
  assert.equal(ev("((x)=>x?x.t+x.body():'')(hsIncSpec('par'))"), '');
  assert.deepEqual(errors, []);
});
