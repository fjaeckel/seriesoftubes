const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Specialist play (#187, #173): capability offers, vendor demo units, pioneer fiber, consortium seats, charters.
const start = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})";
const pop = (c) => `S.pops['${c}']=S.pops['${c}']||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};`;
const df = (id, a, b, ch, own = true) => `S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'df',own:${own},sys:'roadm',ch:${JSON.stringify(ch)},km:kmBetween('${a}','${b}'),sub:false,cable:null,mo:0,trench:'${id}',cut:0,day:0,ready:0,spares:false});`;
// Spawn offers until one of a type shows up (or give up), with everything else cleared out of the way.
const spawnUntil = (ev, type, n = 400) => ev(`(()=>{for(let i=0;i<${n};i++){S.offers=[];spawnOffer();const o=S.offers.find(o=>o.type==='${type}');if(o)return JSON.stringify(o);}return 'null';})()`);

test('#187 a capability brings its customers before the level does, only when you can serve them', () => {
  const { ev, dom, errors } = load();
  ev(start);
  ev(`S.lvl=1;${pop('nyc')}${pop('chi')}compute()`);
  assert.equal(ev("spots().filter(s=>s.t==='hft').length"), 0, 'no low-latency path, no trading firm');
  assert.equal(JSON.parse(spawnUntil(ev, 'hft')), null, 'level 1 alone never brings HFT');
  ev("S.links.push({id:'w',a:'nyc',b:'chi',kind:'wave',tier:2,km:kmBetween('nyc','chi'),cut:0,mo:0});compute()");
  const s = JSON.parse(ev("JSON.stringify(spots().find(s=>s.t==='hft'))"));
  assert.deepEqual([s.a, s.b].sort(), ['chi', 'nyc']);
  const o = JSON.parse(spawnUntil(ev, 'hft'));
  assert.ok(o, 'the trading firm calls');
  assert.equal(o.bw, ev("BIZ_T.hft.opts[0]"), 'at the smallest size');
  assert.deepEqual(o.reqs, ['lat']);
  assert.ok(o.latMax >= s.n, 'and the path you have already meets it');
  assert.equal(o.spot.k, 'lat');
  ev("ACT.leftTab({t:'deals'});renderAll()");
  assert.match(dom.window.document.body.innerHTML, /They spotted your [\d.]+ ms (New York|Chicago)–(New York|Chicago) path/);
  // Lit dark fiber with enough capacity brings AI interconnects (level 4) to a level 3 network; not the bigger DCI.
  ev(`S.lvl=3;${df('d', 'nyc', 'chi', ['zr4', 'zr4'])}compute()`);
  const t = JSON.parse(ev("JSON.stringify([...new Set(spots().map(s=>s.t))])"));
  assert.ok(t.includes('ai'), 'AI training interconnect');
  assert.ok(!t.includes('hyper'), 'not a hyperscaler DCI three times its size');
  assert.ok(!t.includes('hft'), 'level 3 gets HFT anyway: no spotting needed');
  ev("S.lvl=5");
  assert.ok(!ev("spots().some(s=>s.t==='ai')"), 'once the level brings them, they are ordinary offers');
  assert.equal(ev("(()=>{S.rules.gates='open';const n=spots().length;S.rules.gates='ladder';return n;})()"), 0, 'open gates need no spotting');
  assert.deepEqual(errors, []);
});

test('#187 vendor demo units: one level ahead, a wait and a markup', () => {
  const { ev, errors } = load();
  ev(start);
  ev('S.lvl=1');
  assert.equal(ev("RG[1].lvl"), 2);
  assert.equal(ev("techOk('rg',1,2)"), false);
  ev("ACT.demoAsk({k:'rg',id:2})");
  assert.equal(ev("demoAt('rg',2)"), null, 'never two levels ahead');
  ev("ACT.demoAsk({k:'rg',id:1})");
  const at = ev("demoAt('rg',1)");
  assert.equal(at - ev('S.day'), ev('leadDays(DEMO_DAYS)'), 'a short wait');
  ev("ACT.upRouter({city:'fra',g:1})");
  assert.equal(ev("S.pops.fra.rgen||0"), 0, 'not before it ships');
  ev(`S.day=${at}`);
  assert.equal(ev("techOk('rg',1,2)"), true);
  assert.equal(ev("swapCost('fra',1)"), ev("Math.round(RG[1].cost*hwMul('rt')*1.6)-tradeIn(0,1)"), '+60%');
  const cash = ev('S.cash');
  ev("ACT.upRouter({city:'fra',g:1})");
  assert.equal(ev("S.pops.fra.rgen"), 1);
  assert.ok(cash - ev('S.cash') > 0);
  // Optics and line systems the same way.
  ev("S.lvl=2;ACT.demoAsk({k:'opt',id:'zr8'});ACT.demoAsk({k:'sys',id:'roadm'})");
  assert.ok(ev("demoAt('opt','zr8')!==null&&demoAt('sys','roadm')!==null"));
  ev("S.day+=30");
  assert.equal(ev("optCost('zr8')"), ev("Math.round(OPT.zr8.cost*1.6*hwMul('opt'))"));
  assert.equal(ev("sysCost('roadm')"), ev("Math.round(DF_SYS.roadm.cost*1.6)"));
  ev('S.lvl=3');
  assert.equal(ev("optCost('zr8')"), ev("Math.round(OPT.zr8.cost*hwMul('opt'))"), 'list price once your level catches up');
  assert.equal(ev("demoCan(5)"), false);
  assert.deepEqual(errors, []);
});

test('#187 pioneer fiber: dig your own before level 3, at a markup', () => {
  const { ev, errors } = load();
  ev(start);
  ev(`S.lvl=2;${pop('ams')}UI.dfSrc='build';UI.dfSys='lite';UI.pending={a:'fra',b:'ams'};`);
  const km = ev("kmBetween('fra','ams')");
  assert.equal(ev(`digCost(${km})`), ev(`Math.round(dfBuildCost(${km})*1.6)`));
  const cash = ev('S.cash');
  ev('ACT.orderDf()');
  const l = JSON.parse(ev("JSON.stringify(S.links.find(l=>l.kind==='df'))"));
  assert.ok(l && l.own, 'your own trench');
  assert.equal(cash - ev('S.cash'), ev(`digCost(${km})+DF_SYS.lite.cost+ampCount(${km})*AMP_COST`));
  ev('S.lvl=3');
  assert.equal(ev(`digCost(${km})`), ev(`dfBuildCost(${km})`), 'no markup at level 3');
  assert.deepEqual(errors, []);
});

test('#173 a consortium seat: offer, pay, build, light, cut, save', () => {
  const { ev, dom, errors } = load();
  ev(start);
  ev("S.lvl=3;S.capDeal={at:S.day,c:'lon'};capDealTick(S.day)");
  const off = JSON.parse(ev('JSON.stringify(S.seatOff)'));
  assert.ok(off && ev(`SEAT_ROUTES.lon.some(r=>r[2]===${JSON.stringify(off.name)})`), 'a capacity conference offers a seat on one of its routes');
  ev("ACT.leftTab({t:'deals'});renderAll()");
  assert.match(dom.window.document.body.innerHTML, /Consortium seat: /);
  // A seat short enough to light with level 2 optics.
  ev("S.lvl=2;S.seatOff={a:'syd',b:'akl',name:'Tasman Devil',km:seatKm('syd','akl'),exp:S.day+30}");
  const km = ev('S.seatOff.km');
  const cash = ev('S.cash'), popC = ev("popCost('syd')+popCost('akl')");
  ev('ACT.seatBuy({n:2})');
  assert.equal(cash - ev('S.cash'), ev(`seatCost(${km},2)`) + popC, 'your share of the build, and the landing POPs');
  const l = JSON.parse(ev("JSON.stringify(S.links.find(l=>l.seat))"));
  assert.ok(l.own && l.sub && l.pairs === 2 && l.ready > ev('S.day'), 'your own subsea glass, being laid');
  assert.equal(ev('S.seatOff'), null);
  assert.equal(ev("pairsMax(S.links.find(l=>l.seat))"), 2, 'only the pairs you bought');
  // Save and load keep it.
  ev('const s=migrate(JSON.parse(JSON.stringify(S)));window.__s=s');
  assert.equal(ev("__s.links.find(l=>l.seat).pairs"), 2);
  // It lands and lights with your own optics.
  ev(`S.day=${l.ready};S.pops.syd.rgen=S.pops.akl.rgen=1;ACT.addCh({id:'${l.id}',o:'zr4'});compute()`);
  assert.ok(ev(`dfCap(S.links.find(l=>l.id==='${l.id}'))`) > 0, 'lit');
  ev(`ACT.subUpgrade({id:'${l.id}',k:'terminal'})`);
  assert.equal(ev(`S.links.find(l=>l.id==='${l.id}').subterminal`), undefined, 'the consortium owns the terminals');
  // A cut on the cable cuts your share.
  ev(`S.links=S.links.filter(l=>l.id==='${l.id}');eval('('+fireFailure.toString().replace('for(const o of opts){r-=o[1];if(r<=0){type=o[0];break;}}',\"type='cut';\")+')')()`);
  assert.ok(ev(`linkDown(S.links.find(l=>l.id==='${l.id}'))`), 'the cut takes your pairs down too');
  assert.deepEqual(errors, []);
});

test('#187 the Low-latency boutique: pick it on day 0, traders weigh more and pay more, Speed of Light wins', () => {
  const { ev, dom, errors } = load();
  ev(start);
  ev("ACT.leftTab({t:'goals'});renderAll()");
  assert.match(dom.window.document.body.innerHTML, /Pick a charter/);
  ev("window.innerWidth=360;renderAll()");
  assert.match(dom.window.document.body.innerHTML, /Low-latency boutique/, 'on a phone too');
  ev("window.innerWidth=1280");
  assert.equal(ev('charter()'), 'global', 'Global backbone until you pick');
  ev("ACT.charter({k:'boutique'})");
  assert.equal(ev('charter()'), 'boutique');
  ev("ACT.charter({k:'global'})");
  assert.equal(ev('charter()'), 'boutique', 'picked once');
  // More and better-paid trading firms than a global backbone with the same network.
  const count = (k) => {
    const g = load();
    g.ev(start);
    g.ev(`S.lvl=2;S.charter='${k}';${pop('nyc')}${pop('chi')}compute()`);
    return JSON.parse(g.ev("(()=>{let n=0,r=0;for(let i=0;i<300;i++){S.offers=[];spawnOffer();const o=S.offers.find(o=>o.type==='hft');if(o){n++;if(o.reqs.length===1)r=o.rate/(150+kmBetween(o.city,o.city2)*0.08)/BIZ_T.hft.km;}}return JSON.stringify({n,r});})()"));
  };
  const gl = count('global'), bq = count('boutique');
  assert.ok(bq.n > gl.n * 1.5, `boutique traders call more (${bq.n} vs ${gl.n})`);
  assert.ok(Math.abs(bq.r - 1.4) < 0.02 && Math.abs(gl.r - 1) < 0.02, 'and pay 40% more');
  // Speed of Light: three finance routes faster on your own glass than any lease, and two paying latency customers.
  ev(`S.lvl=2;${pop('nyc')}${pop('chi')}${pop('ash')}${df('a', 'nyc', 'chi', ['zr4'])}${df('b', 'chi', 'ash', ['zr4'])}${df('c', 'nyc', 'ash', ['zr4'])}compute()`);
  assert.equal(ev('solRoutes().length'), 3);
  ev('specDay(S.day)');
  assert.equal(ev('S.solWon'), 0, 'not without paying customers');
  ev("for(const [a,b] of [['nyc','chi'],['chi','ash']])S.biz.push({id:uid(),city:a,city2:b,name:'T',type:'hft',bw:1,rate:1000,reqs:['lat'],latMax:latMaxOf(a,b),mood:100,since:0});compute();specDay(S.day)");
  assert.equal(ev('S.solWon'), Math.max(1, ev('S.day')), 'Speed of Light');
  ev('checkBadges()');
  assert.notEqual(ev("S.ach.sol"), undefined, 'and its badge');
  ev("renderAll()");
  assert.match(dom.window.document.body.innerHTML, /Won on /);
  assert.deepEqual(errors, []);
});

test('#187 old saves load as Global backbone; scenarios ignore charters', () => {
  const { ev, errors } = load();
  ev(start);
  ev("const o=JSON.parse(JSON.stringify(S));for(const k of ['charter','chartSet','demo','seatOff','solWon'])delete o[k];o.links.push({id:'q',a:'fra',b:'ams',kind:'df',own:false,sub:false,seat:true,sys:'lite',ch:[],km:400,ready:0});window.__o=migrate(o)");
  assert.equal(ev('__o.charter'), 'global');
  assert.equal(ev('__o.chartSet'), true, 'no charter card for an old save');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__o.demo)')), {});
  assert.equal(ev('__o.seatOff'), null);
  assert.equal(ev("__o.links.find(l=>l.id==='q').seat"), undefined, 'a forged seat is dropped');
  ev("S.charter='boutique';S.scn={id:'x'}");
  assert.equal(ev('charter()'), 'global');
  assert.deepEqual(errors, []);
});
