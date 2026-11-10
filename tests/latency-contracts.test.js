const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Strict latency contracts (#137): big customers who pay for a latency SLA on one route, late in the game.
const start = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'nyc'})";
const pop = (c) => `S.pops['${c}']=S.pops['${c}']||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};S.pops['${c}'].rgen=RG.length-1;`;
const wave = (id, a, b) => `S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'wave',tier:6,n:1,km:kmBetween('${a}','${b}'),cut:0,mo:0,day:0,ready:0});`;
const CITIES = ['nyc', 'chi', 'ash', 'mia', 'lon', 'fra'];
const net = () => CITIES.map(pop).join('') + wave('nc', 'nyc', 'chi') + wave('na', 'nyc', 'ash') + wave('am', 'ash', 'mia') + wave('mc', 'mia', 'chi') + 'compute();';
// Spawn n offers, each on its own, and keep them all.
const spawnMany = (ev, n) => JSON.parse(ev(`(()=>{const out=[];for(let i=0;i<${n};i++){S.offers=[];spawnOffer();out.push(...S.offers);}S.offers=[];return JSON.stringify(out);})()`));
// A latency contract on New York ⇄ Chicago, signed long enough ago that its provisioning grace is over.
const sign = (bw = 1600) => `(()=>{const b={id:'lc1',city:'nyc',city2:'chi',name:'Shortest Path Securities',type:'lowlat',bw:${bw},rate:500,reqs:['lat'],latMax:latMaxOf('nyc','chi'),route:'fast',mood:100,since:S.day-30};S.biz.push(b);compute();return b.id;})()`;

test('#137 latency contracts are offered only from their customer level, sized and priced as promised', () => {
  const { ev, errors } = load();
  ev(start);
  ev(net());
  ev('S.lvl=LC_LV-1');
  assert.ok(ev('LC_LV') >= 7, 'a late-game customer');
  const early = spawnMany(ev, 600);
  assert.equal(early.filter((o) => o.type === 'lowlat').length, 0, 'never below its level');
  ev('S.lvl=LC_LV');
  const late = spawnMany(ev, 600);
  const lc = late.filter((o) => o.type === 'lowlat');
  assert.ok(lc.length >= 5, `they call at their level (${lc.length})`);
  for (const o of lc) {
    assert.ok([1600, 3200].includes(o.bw), 'big: 1.6T or 3.2T');
    assert.equal(o.reqs[0], 'lat', 'always a latency limit');
    assert.equal(o.latMax, ev(`latMaxOf('${o.city}','${o.city2}')`), 'the limit every latency customer gets');
    assert.ok(ev(`Math.min(latFloor('${o.city}','${o.city2}'),bestLat('${o.city}','${o.city2}'))<=${o.latMax}`), 'and one something you can build meets');
  }
  // Pay: per Gbps on the same route, above any other high-volume circuit (hyperscaler DCI, AI interconnects), whatever they ask for.
  const per = (o) => o.rate / ev(`150+kmBetween('${o.city}','${o.city2}')*0.08`);
  const big = late.filter((o) => ['hyper', 'ai', 'aiwan'].includes(o.type));
  assert.ok(big.length >= 5, 'there are other big circuits to compare with');
  assert.ok(Math.min(...lc.map(per)) > Math.max(...big.map(per)), 'a latency contract pays more per Gbps than any other big circuit');
  // Same size, same route: a 1.6T latency contract against a 1.6T hyperscaler DCI with every extra a DCI can ask for.
  const o = lc[0], km = ev(`kmBetween('${o.city}','${o.city2}')`);
  const dciBest = (150 + km * 0.08) * ev('BIZ_T.hyper.km') * (1 + ev("REQS.diverse.bonus+REQS.metro.bonus+REQS.sharks.bonus+REQS.gen.bonus"));
  assert.ok(1600 * o.rate > 1600 * dciBest, 'beats a fully loaded DCI of the same size');
  assert.deepEqual(errors, []);
});

test('#137 the latency limit is the circuit latency the game already measures, and breaking it costs credits and the customer', () => {
  const { ev, errors } = load();
  ev(start);
  ev(net());
  ev('S.lvl=LC_LV');
  ev(sign());
  const b = "S.biz.find(b=>b.id==='lc1')";
  assert.ok(ev(`R.l2lat['lc1']<=${b}.latMax`), 'the direct wave meets it');
  assert.ok(ev(`REQS.lat.ok(${b})`));
  assert.ok(ev(`bizSf(${b})>=0.95`), 'and carries all of it');
  // Cut the direct wave: the circuit reroutes the long way round, still carried in full but too slow.
  ev("S.links.find(l=>l.id==='nc').cut=S.day+400;compute()");
  assert.ok(ev(`bizSf(${b})>=0.95`), 'all the bandwidth still arrives');
  assert.ok(ev(`R.l2lat['lc1']>${b}.latMax`), 'over its limit');
  assert.ok(!ev(`REQS.lat.ok(${b})`), 'REQS.lat says so');
  assert.ok(ev(`bizWhy(${b}).some(w=>/latency/i.test(w))`), 'and the customer row says why');
  // A day over: a day's fee back as an SLA credit, and more patience lost than a plain latency customer (HFT) loses.
  const cash = ev('S.cash'), mo = ev(`bizMo(${b})`), days = ev('monLen(S.day)');
  const extra = ev(`lcBreach(${b},S.day)`);
  assert.equal(extra, ev('LC_MOOD'));
  assert.equal(Math.round(cash - ev('S.cash')), Math.round(mo / days), "a day's fee credited");
  assert.equal(ev(`${b}.lcCr`), Math.round(mo / days));
  assert.equal(ev("lcBreach({type:'hft',since:0,latMax:1,city:'nyc',city2:'chi',reqs:['lat'],id:'x'},S.day)"), 0, 'only latency contracts pay credits');
  // In the provisioning grace (rule F1) nothing is credited and nothing is lost.
  assert.equal(ev(`(()=>{const x={...${b},id:'lc2',since:S.day-3};return lcBreach(x,S.day);})()`), 0);
  // Day after day over the limit: unhappy, warned, and gone, with credits paid every day.
  const m0 = ev(`${b}.mood`);
  ev('dayTick()');
  const m1 = ev(`${b}.mood`);
  assert.ok(m0 - m1 >= 6 - 1e-9, `loses at least 6 a day over its SLA (${m0} → ${m1})`);
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++) {
    ev("S.links.find(l=>l.id==='nc').cut=S.day+400;dayTick()");
    gone = !ev("S.biz.some(b=>b.id==='lc1')");
  }
  assert.ok(gone, 'a contract over its latency for weeks cancels');
  assert.deepEqual(errors, []);
});

test('#137 a latency contract within its limit stays happy and pays no credits', () => {
  const { ev, errors } = load();
  ev(start);
  ev(net());
  ev(sign());
  ev("S.biz.find(b=>b.id==='lc1').mood=90");
  for (let i = 0; i < 5; i++) ev("S.links.forEach(l=>l.cut=0);dayTick()");
  const b = ev("JSON.stringify(S.biz.find(b=>b.id==='lc1')||null)");
  const o = JSON.parse(b);
  assert.ok(o, 'still a customer');
  assert.equal(o.lcCr, undefined, 'no credits');
  assert.equal(o.lcB, undefined, 'not in breach');
  assert.ok(o.mood > 90, `happier every day it is served (${o.mood})`);
  assert.deepEqual(errors, []);
});

test('#137 the volume cap holds: renewals, a sales shark and an edited save never take one past 3.2T', () => {
  const { ev, errors } = load();
  ev(start);
  ev(net());
  ev(sign(1600));
  const b = "S.biz.find(b=>b.id==='lc1')";
  assert.ok(ev('Math.max(...BIZ_T.lowlat.opts)<=BIZ_T.lowlat.max'), 'a shark bumps an offer one size up its list, never past the most');
  assert.equal(ev(`clGrow(${b})`), true, 'grows to the next size once');
  assert.equal(ev(`${b}.bw`), 3200);
  assert.equal(ev(`clGrow(${b})`), false, 'and never past it');
  assert.equal(ev(`${b}.bw`), 3200);
  assert.equal(ev("(()=>{const x={type:'hyper',bw:6400};clGrow(x);return x.bw;})()"), 12800, 'other customers still double past their top size');
  // An edited save asking for more is cut back to the most the type sells.
  ev(`${b}.bw=51200`);
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev(`${b}.bw`), 3200);
  assert.deepEqual(errors, []);
});

test('#137 old saves load, and new fields from a save are checked', () => {
  const { ev, errors } = load();
  ev(start);
  ev(net());
  // A save from before latency contracts: nothing of theirs in it.
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.ok(!ev("S.biz.some(b=>b.type==='lowlat')"));
  // A save with a contract whose fields were edited or lost.
  ev(sign());
  ev(`(()=>{const s=JSON.parse(JSON.stringify(S)),b=s.biz.find(b=>b.id==='lc1');b.lcCr='lots';b.lcB='yes';delete b.latMax;b.reqs=[];S=migrate(s);compute();})()`);
  const b = JSON.parse(ev("JSON.stringify(S.biz.find(b=>b.id==='lc1'))"));
  assert.equal(b.lcCr, undefined, 'junk credits dropped');
  assert.equal(b.lcB, 1, 'flag as a flag');
  assert.equal(b.latMax, ev("latMaxOf('nyc','chi')"), 'the latency limit comes back');
  assert.ok(b.reqs.includes('lat'), 'and its requirement');
  ev(`(()=>{const s=JSON.parse(JSON.stringify(S));s.biz.find(b=>b.id==='lc1').lcCr=${lit(1234.4)};S=migrate(s);})()`);
  assert.equal(ev("S.biz.find(b=>b.id==='lc1').lcCr"), 1234);
  assert.deepEqual(errors, []);
});

test('#137 offer and customer rows on a 390 px phone', () => {
  const { ev, dom, errors } = load();
  ev(start);
  ev(net());
  ev('S.lvl=LC_LV');
  ev("S.offers.push({id:'o1',city:'nyc',city2:'chi',name:'Great Circle Clearing House',type:'lowlat',bw:3200,rate:900,reqs:['lat'],latMax:latMaxOf('nyc','chi'),exp:S.day+40})");
  dom.window.innerWidth = 390;
  ev("ACT.leftTab({t:'deals'});renderAll()");
  const html = dom.window.document.body.innerHTML;
  assert.match(html, /Great Circle Clearing House/);
  assert.match(html, /Low-latency wholesale route/);
  assert.match(html, /Latency SLA [\d.]+ ms: a day's fee back for every day over it · never more than 3\.20 Tbps/);
  ev("ACT.accept({id:'o1'})");
  const c = JSON.parse(ev("JSON.stringify(S.biz.find(b=>b.name==='Great Circle Clearing House'))"));
  assert.equal(c.route, 'fast', 'routed for latency');
  assert.equal(c.latMax, ev("latMaxOf('nyc','chi')"));
  ev(`S.biz.find(b=>b.id===${lit(c.id)}).lcCr=5000;renderAll()`);
  const cs = ev('custSection()');
  assert.match(cs, /Low-latency wholesale route/);
  assert.match(cs, /\$5\.0k paid in SLA credits/);
  assert.deepEqual(errors, []);
});
