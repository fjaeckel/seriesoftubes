// The late game grows sideways, plus one expensive way up: eyeball traffic starts where the eyeballs are (#48), giant AI
// circuits spread over many metros (#61), a PNI grows by eight members per router (#323), and Auto-TE spills early onto
// detours within a latency budget (#136).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const US = ['nyc', 'ash', 'chi', 'atn', 'den', 'sea', 'sjc', 'mia'];

// POPs in the given cities with the same home demand, a thin backbone between neighbours and transit at every POP.
function usNetwork(ev, cities, wave) {
  ev(`ACT.start({});S.cash=1e10;S.lvl=6;S.day=500;S.biz=[];S.offers=[];S.links=[];S.pops={};S.pni=[];S.caches=[];S.transit=[];S.ixp={};S.peers={};S.rs={};
    S.nextFail=1e9;S.nextEvent=1e9;const cs=${lit(cities)};
    for(const c of cs){S.pops[c]={routers:2,rgen:3,gen:true,bb:{d:400},down:0};S.transit.push({id:'t'+c,net:'cog',city:c,tier:3,n:4,down:0});}
    for(let i=0;i+1<cs.length;i++)S.links.push({id:'w'+i,a:cs[i],b:cs[i+1],kind:'wave',tier:${wave},km:kmBetween(cs[i],cs[i+1]),cut:0,mo:100});
    compute();`);
}

test('#48: traffic to a network that sells to homes starts where its users live', () => {
  const { ev, errors } = load();
  usNetwork(ev, ['nyc'], 3);
  const us = ev('R.demTo.cmc/R.demand');
  usNetwork(ev, ['fra'], 3);
  const de = ev('R.demTo.cmc/R.demand'), deDtk = ev('R.demTo.dtk/R.demand');
  usNetwork(ev, ['nyc'], 3);
  const usDtk = ev('R.demTo.dtk/R.demand');
  assert.ok(us > ev('NSH.cmc') * 3, `a New York POP sends Comecast far more than its world share (${us})`);
  assert.ok(us > de * 8, `and much more than a Frankfurt POP does (${us} vs ${de})`);
  assert.ok(deDtk > usDtk * 8, `Doitsche Telekomm the other way round (${deDtk} vs ${usDtk})`);
  // Only the split between home networks moves: content keeps its share, and a city's total demand stays the same.
  assert.ok(Math.abs(ev("[...locSh(NSH,'nyc')].reduce((a,b)=>a+b,0)") - 1) < 1e-9, 'the shares still add up to one');
  assert.equal(ev("locSh(NSH,'nyc')[LOC_NIX.get('ggl')]"), ev('NSH.ggl'), 'content is everywhere');
  assert.ok(Math.abs(ev("cityNetSh('nyc','cmc')") - ev("locSh(NSH,'nyc')[LOC_NIX.get('cmc')]")) < 1e-12, 'box sizing reads the same split');
  assert.deepEqual(errors, []);
});

test('#48: peering with an eyeball in more of the cities its users live in carries more of its traffic', () => {
  const { ev, errors } = load();
  // A 10G backbone: hauling Comecast's traffic to two PNIs fills it, and the rest leaves over transit.
  usNetwork(ev, US, 0);
  const share = pnis => {
    ev(`S.pni=${lit(pnis)}.map(c=>({id:'cmc@'+c,city:c,net:'cmc',tier:3,n:4}));compute()`);
    return ev('(R.netEg.cmc.p||0)/R.demTo.cmc');
  };
  const two = share(['nyc', 'ash']), all = share(US);
  assert.ok(all > 0.95, `a PNI in every city takes nearly all of it (${all})`);
  assert.ok(two < 0.6, `two PNIs only take what the backbone can haul to them (${two})`);
  assert.ok(all - two > 0.35, `more PNI locations carry more (${two} → ${all})`);
  assert.deepEqual(errors, []);
});

test('#61: giant AI circuits spread over many metros, busy ones a bit busier', () => {
  const { ev, errors } = load();
  ev(`ACT.start({});S.cash=1e12;S.lvl=11;S.biz=[];S.offers=[];for(const m of MEGA)if(!S.pops[m.c])S.pops[m.c]={routers:1,rgen:3,gen:true,bb:null,down:0};
    for(const c of ['ash','nyc','chi','dal','mex','lax','hou','bos','was'])if(!S.pops[c])S.pops[c]={routers:1,rgen:3,gen:true,bb:null,down:0};`);
  ev('__reseed(61)');
  // Three hundred offers, each signed as it comes, the way a long game fills up.
  const out = JSON.parse(ev(`(()=>{const cnt={};let n=0;for(let i=0;i<300;i++){const before=S.offers.length;spawnSpecial(['aiwan','mtrain','agi'][i%3]);
    if(S.offers.length===before)continue;const o=S.offers.pop();S.biz.push(o);n++;for(const c of bCities(o))cnt[c]=(cnt[c]||0)+1;}return JSON.stringify({cnt,n});})()`));
  const tot = Object.values(out.cnt).reduce((a, b) => a + b, 0);
  const five = ['mex', 'chi', 'dal', 'ash', 'nyc'].reduce((a, c) => a + (out.cnt[c] || 0), 0);
  assert.ok(out.n > 200, `offers came (${out.n})`);
  assert.ok(Object.keys(out.cnt).length >= 25, `ends in many metros (${Object.keys(out.cnt).length})`);
  assert.ok(five / tot < 0.35, `the old five metros no longer get most of it (${(five / tot).toFixed(2)})`);
  const avg = tot / Object.keys(out.cnt).length;
  assert.ok(out.cnt.ash > avg, `Ashburn stays a bit busier than the average metro (${out.cnt.ash} vs ${avg.toFixed(1)})`);
  assert.ok(out.cnt.ash < tot * 0.15, `but never the only place (${out.cnt.ash} of ${tot})`);
  assert.deepEqual(errors, []);
});

test('#323: a PNI grows by eight members per router at the POP, up to 32', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});S.cash=1e12;S.lvl=13;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});S.pops.fra.rgen=RG_TOP;S.pops.fra.routers=1;S.rules={...(S.rules||{}),pnis:'instant'};");
  ev("S.pni.push({id:'p1',city:'fra',net:'nfx',tier:3,n:8});compute()");
  const n = () => ev("S.pni.find(p=>p.id==='p1').n");
  assert.equal(ev("pniLagMax('fra')"), 8, 'one router: eight members, as before');
  ev("ACT.lagP({id:'p1',d:1})");
  assert.equal(n(), 8, 'a ninth member needs a second router');
  assert.match(dom.window.document.getElementById('toasts').textContent, /already bundles 8 ports/);
  ev("ACT.addRouter({city:'fra'})");
  assert.equal(ev("pniLagMax('fra')"), 16);
  ev("ACT.lagP({id:'p1',d:1})");
  assert.equal(n(), 9, 'the second router takes eight more');
  assert.ok(Math.abs(ev("R.nodeCap.fra") - ev("nodeCap('fra')")) < 1e-9);
  // Taking that router away again would leave the bundle with nowhere to land.
  ev("ACT.rmRouter({city:'fra'})");
  assert.equal(ev('S.pops.fra.routers'), 2, 'the router stays while the PNI needs it');
  assert.match(dom.window.document.getElementById('toasts').textContent, /Shrink a PNI first/);
  ev("S.pops.fra.routers=6;");
  assert.equal(ev("pniLagMax('fra')"), 32, 'never more than 32 members, however many routers');
  for (let i = 0; i < 30; i++) ev("ACT.lagP({id:'p1',d:1})");
  assert.equal(n(), 32);
  // The panel offers a member while there is room and says why when there is none.
  ev("S.pops.fra.routers=4;UI.sel={type:'city',id:'fra'};S.pni.find(p=>p.id==='p1').n=31;");
  ev('window.innerWidth=390;renderAll()');
  assert.deepEqual(errors, []);
});

test('#323: saves keep their LAGs, big ones included, and garbage is clamped', () => {
  const { ev, errors } = load();
  ev("ACT.start({});ACT.launchBB({city:'fra'});S.pops.fra.routers=3;");
  ev("S.pni.push({id:'old',city:'fra',net:'nfx',tier:2,n:8},{id:'big',city:'fra',net:'ggl',tier:2,n:24,up:{tier:3,n:24,ready:S.day+30}},{id:'bad',city:'fra',net:'akm',tier:1,n:999})");
  ev('const o=JSON.parse(JSON.stringify(S));sanitize(o);window.__o=o');
  assert.equal(ev("__o.pni.find(p=>p.id==='old').n"), 8, 'an old save with an 8-port LAG loads as it was');
  assert.equal(ev("__o.pni.find(p=>p.id==='big').n"), 24);
  assert.equal(ev("__o.pni.find(p=>p.id==='big').up.n"), 24);
  assert.equal(ev("__o.pni.find(p=>p.id==='bad').n"), 32, 'never past the biggest bundle');
  assert.equal(ev("migrate(JSON.parse(JSON.stringify(S)))&&1"), 1);
  assert.deepEqual(errors, []);
});

test('#136: spill tiers keep a hot link at its line while a detour within the latency budget has room', () => {
  const { ev, errors } = load();
  // New York reaches its upstream in Los Angeles over a direct 10G wave, or about 10 ms longer through Miami on 800G.
  ev(`ACT.start({});S.cash=1e12;S.lvl=13;for(const g of GOALS)S.done[g.id]=0;for(const c of ['nyc','lax','mia'])if(!S.pops[c])ACT.buildPop({city:c});
    for(const c of ['nyc','lax','mia']){S.pops[c].rgen=RG_TOP;S.pops[c].routers=RMAX;}if(!S.pops.nyc.bb)ACT.launchBB({city:'nyc'});S.pops.nyc.bb.d=400;
    const L=(a,b,t)=>{UI.via=null;UI.lmode='wave';UI.route='main';openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};
    L('nyc','lax',0);L('nyc','mia',3);L('mia','lax',3);S.links.forEach(l=>l.ready=0);
    S.transit=[];const t=NETS.find(n=>n.price&&n.pops.includes('lax')&&n.type==='t1');ACT.buyTransit({city:'lax',net:t.id,tier:3});
    S.ixp={};S.pni=[];S.caches=[];S.te={on:true,day:0};S.core={lv:2,run:2,legacy:true};S.nextFail=1e9;S.nextEvent=1e9;`);
  const direct = "R.load[S.links.find(l=>l.a==='nyc'&&l.b==='lax').id]";
  const run = s => { ev(`S.te.script=${lit(s)};compute()`); return { load: ev(direct), served: ev('R.served'), moved: ev('R.teMoved') }; };
  const none = run(''), short = run('spill at 80% within 5 ms'), long = run('spill at 80% within 15 ms'), two = run('spill at 80% within 15 ms\nspill at 90% within 30 ms');
  assert.ok(none.load > 9.99, 'without tiers the direct link fills up');
  assert.ok(short.load > 9.99, 'a detour 10 ms longer is outside a 5 ms budget: the link fills up as before');
  assert.ok(Math.abs(long.load - 8) < 1e-6, `within 15 ms the link stays at 80% (${long.load})`);
  assert.ok(Math.abs(two.load - 8) < 1e-6, 'the 90% tier only opens once the 80% detours are full');
  assert.ok(Math.abs(long.served - none.served) < 1e-6, 'and nothing is lost: the detour carries it');
  assert.ok(long.moved > none.moved, 'Auto-TE moved it');
  assert.equal(ev("teParse('spill at 80% within 500 ms').errors.length"), 1, 'a budget past 100 ms is refused');
  assert.equal(ev("JSON.stringify(teParse('spill at 90% within 20 ms\\nspill at 80% within 10 ms').tiers)"), '[{"at":0.8,"ms":10},{"at":0.9,"ms":20}]');
  assert.deepEqual(errors, []);
});
