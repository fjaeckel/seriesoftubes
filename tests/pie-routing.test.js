// Pie in the Sky: routing through orbit and the customers who pay for it (src/game/80-simulation/35-pie-paths.js,
// src/game/60-features/99-pie-orbit-customers.js). Seeded; state is set directly where luck would decide.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// A sandbox with London and New York joined by a transatlantic wave, Frankfurt 640 km from London, a company, and a
// 16-antenna dish with landing rights at each POP.
const world = (ev, opt = {}) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc','fra'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'lf',a:'lon',b:'fra',kind:'wave',tier:3,km:640,sub:false,cut:0,mo:1});for(const c of ['lon','nyc','fra'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev(`ACT.pieFound();for(const c of ${JSON.stringify(opt.dishes || ['lon', 'nyc', 'fra'])}){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX`);
  ev(`S.pie.crusts.short.cohorts=[{n:${opt.n || 'CRUSTS.short.full'},day:S.day,las:${opt.las !== false}}];compute()`);
};
const circuit = (ev, id, a, b, type = 'hft', bw = 5) => ev(`S.biz.push({id:'${id}',type:'${type}',city:'${a}',city2:'${b}',bw:${bw},rate:1000,reqs:[],latMax:null,route:'fast',name:'${id}',mood:100,since:0,sites:null});compute()`);
const term = (ev, id, city, type = 'pizza', bw = 50) => ev(`S.biz.push({id:'${id}',type:'${type}',city:'${city}',city2:null,bw:${bw},rate:BIZ_T.${type}.rate,reqs:[],latMax:null,route:'normal',name:'${id}',mood:100,since:0,sites:null});compute()`);
const skyOf = (ev, id) => ev(`Object.keys(R.ef).filter(k=>k.startsWith('pie:')&&R.ef[k].eg['l2:${id}']>0).length>0`);

test('London to New York: a latency customer takes the lasers when they are on, and the fiber otherwise', () => {
  const { ev, errors } = load();
  world(ev);
  const fiber = ev("linkLat(S.links.find(l=>l.id==='ln'))");
  circuit(ev, 'hft1', 'lon', 'nyc');
  assert.equal(skyOf(ev, 'hft1'), true, 'through space');
  assert.ok(ev("R.l2lat.hft1") < fiber - 2, `orbit ${ev('R.l2lat.hft1')} ms beats glass ${fiber} ms`);
  assert.equal(ev('R.l2.hft1'), 5, 'carried in full');
  assert.ok(ev('R.pie.rev') > 0, 'the premium for the faster path is orbit revenue');
  // vacuum: ~1.47x faster than glass over the great circle, plus the hop up and down
  const km = ev("pieKm('lon','nyc')"), v = ev(`pieSkyMs(${km},550)`);
  assert.ok(Math.abs(ev('R.l2lat.hft1') - v) < 1.5, `${ev('R.l2lat.hft1')} ≈ ${v}`);
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];compute()");
  assert.equal(skyOf(ev, 'hft1'), false, 'no lasers: no space path');
  assert.ok(Math.abs(ev('R.l2lat.hft1') - fiber) < 0.2, 'on the fiber');
  assert.deepEqual(errors, []);
});

test('O4: short routes never use orbit, and neither does bulk or plain IP traffic', () => {
  const { ev, errors } = load();
  world(ev);
  circuit(ev, 'near', 'lon', 'fra');
  assert.equal(skyOf(ev, 'near'), false, 'London–Frankfurt stays on fiber');
  circuit(ev, 'bk', 'lon', 'nyc', 'l2vpn', 10);
  assert.equal(skyOf(ev, 'bk'), false, 'a circuit that does not care about latency stays on fiber');
  ev("S.pops.lon.bb={d:400};compute()");
  assert.equal(ev("Object.keys(R.ef).filter(k=>k.startsWith('pie:')).every(k=>!Object.keys(R.ef[k].eg).some(e=>!e.startsWith('l2:')))"), true, 'IP flows never cross a sky edge');
  assert.equal(ev("Object.values(R.load).every(Number.isFinite)"), true);
  // and the graph itself has no space edge shorter than the threshold
  assert.equal(ev("Object.keys(R.ef).some(k=>k==='pie:lon~fra'||k==='pie:fra~lon')"), false);
  assert.deepEqual(errors, []);
});

test('O2: a crust carries nothing under 40%, a share up to 60%, and orbit never carries more than the dishes hold', () => {
  const { ev, errors } = load();
  world(ev, { n: 'Math.floor(CRUSTS.short.full*0.39)' });
  circuit(ev, 'hft1', 'lon', 'nyc');
  term(ev, 'pz', 'pcn');
  assert.deepEqual(ev('JSON.stringify(pieHubs())'), '[]');
  assert.equal(skyOf(ev, 'hft1'), false);
  assert.equal(ev("R.pie.sf.pz"), 0, 'a home on Pitcairn gets nothing from a half-baked crust');
  // the only orbit money under 40% is patchy-sky customers (99-pie-patchy.js), who need no traffic carried
  assert.equal(ev('R.pie.rev'), ev('R.pie.patchy.mo'));
  assert.equal(ev("R.pie.flows.filter(f=>f.g>0).length"), 0);
  // half-baked at 50%: a quarter of the crust's Gbps (half its pies, half of those carrying) and a quarter of the market
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full/2,day:S.day,las:true}];compute()");
  assert.deepEqual(ev('JSON.stringify(pieHubs())'), '["short"]', 'over 40% it is a hub');
  assert.ok(ev('R.pie.sf.pz') > 0.9, 'and serves the home on Pitcairn');
  const c = JSON.parse(ev("JSON.stringify(R.pie.crust.find(c=>c.id==='short'))"));
  assert.equal(c.st, 'part');
  assert.ok(Math.abs(c.cap - ev('CRUSTS.short.g') / 4) < 1, `carries ${c.cap} of ${ev('CRUSTS.short.g')} G at 50%`);
  assert.ok(Math.abs(ev('pieMarket()') - ev('CRUSTS.short.g*PIE_SELL/4')) < 1, 'the market shrinks with it');
  // baked: now load it far past the dishes
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];for(let i=0;i<20;i++)S.biz.push({id:'big'+i,type:'boat',city:'pcn',city2:null,bw:800,rate:1,reqs:[],route:'normal',name:'b'+i,mood:100,since:0,sites:null});compute()");
  const dishG = ev('pieDishes().reduce((a,d)=>a+d.g,0)');
  const used = ev('Object.values(R.pie.used).reduce((a,b)=>a+b,0)');
  assert.ok(used <= dishG + 1e-6, `orbit carries ${used} G on ${dishG} G of antennas`);
  for (const c of ['lon', 'nyc', 'fra']) assert.ok(ev(`R.pie.used.${c}`) <= ev(`pieDishes().find(d=>d.city==='${c}').g`) + 1e-6, c);
  assert.ok(ev("Object.keys(R.pie.term).length") > 0);
  assert.deepEqual(errors, []);
});

test('O3: a dish whose POP is off the backbone is flagged and carries only its own POP\'s traffic and its terminals', () => {
  const { ev, errors } = load();
  world(ev);
  ev("ACT.buildPop({city:'syd'});ACT.pieDish({city:'syd'});S.pie.lic.AU={state:'ok',until:1e6};for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX;compute()");
  assert.deepEqual(ev('JSON.stringify(R.pie.isl)'), '["syd"]', 'Sydney has no fiber to the rest');
  circuit(ev, 'hs', 'lon', 'syd');
  assert.equal(ev('R.l2.hs'), 5, "a circuit to Sydney is Sydney's own traffic: it rides the backhaul");
  assert.ok(ev("R.ef['pie:bh:syd'].eg['l2:hs']") > 0);
  circuit(ev, 'ln', 'lon', 'nyc');
  assert.equal(ev("Object.keys(R.ef).some(k=>k.includes('syd')&&R.ef[k].eg['l2:ln']>0)"), false, 'never transit between other cities');
  // a home next to it still lands there (bent pipe, local only)
  term(ev, 'pz', 'cbr');
  assert.equal(ev('R.pie.gs.pz'), 'syd');
  assert.deepEqual(errors, []);
});

test('Pitcairn and the Arctic are servable from orbit, and offers only come when the network can serve them', () => {
  const { ev, errors } = load();
  world(ev, { las: false });
  assert.equal(ev("pieServe('pcn','pizza')"), null, 'no lasers and no dish within 1,000 km: Pitcairn waits');
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
  assert.ok(ev("!!pieServe('pcn','pizza')"), 'with lasers it lands on a dish of yours');
  term(ev, 'pz', 'pcn');
  assert.ok(ev('R.pie.sf.pz') > 0.9, `Pitcairn served ${ev('R.pie.sf.pz')}`);
  assert.ok(ev("bizSf(S.biz.find(b=>b.id==='pz'))") > 0.9);
  assert.ok(ev('R.rev.orbit') >= 50 * ev('BIZ_T.pizza.rate') * 0.9);
  // Utqiaġvik at 71°N: past Shortcrust's reach, but a polar crust covers it
  assert.equal(ev("pieServe('brw','pizza')"), null);
  ev("S.pie.crusts.frozen.cohorts=[{n:CRUSTS.frozen.full,day:S.day,las:true}];compute()");
  assert.ok(ev("!!pieServe('brw','pizza')"), 'the frozen crust reaches the Arctic');
  // offers: only kinds the sky can serve, sized to fit
  ev("S.offers=[];for(let i=0;i<60;i++)pieSpawn(pick(pieOfferTypes()))");
  const offers = JSON.parse(ev("JSON.stringify(S.offers)"));
  assert.ok(offers.length > 3, 'orbit customers call');
  assert.ok(offers.every(o => ev(`!!BIZ_T.${o.type}.orbit&&!!pieServe('${o.city}','${o.type}')`)), 'each one servable');
  assert.ok(ev('pieSold()') <= ev('pieMarket()') + 1e-6, 'never more than the market');
  ev("S.offers=[];S.pie.crusts.short.cohorts=[];S.pie.crusts.frozen.cohorts=[];compute()");
  assert.equal(ev('pieOfferTypes().length'), 0, 'nothing in the sky: nobody calls');
  assert.deepEqual(errors, []);
});

test('the Mars mission gets its orbital option only in saves of this version', () => {
  const { ev, errors } = load();
  world(ev);
  ev('S.lvl=13');
  assert.ok(ev("pieOfferTypes().includes('marsorb')"));
  ev('S.pieV=0');
  assert.equal(ev("pieOfferTypes().includes('marsorb')"), false);
  assert.deepEqual(errors, []);
});

test('spats: data stays home, and not over my airspace', () => {
  const { ev, errors } = load();
  world(ev);
  // A home in Ireland lands on London's dish (bent pipe) until Ireland wants its customers on Irish soil.
  term(ev, 'ie', 'dub');
  assert.equal(ev('R.pie.gs.ie'), 'lon');
  ev("S.pie.spat.home={st:'on',cc:'IE',ask:S.day,until:S.day+90,c:0};compute()");
  assert.equal(ev('pieSpatHome("IE")'), true);
  assert.equal(ev('R.pie.gs.ie||null'), null, 'no Irish dish: not served');
  // London–New York circuit: the US and the UK fall out; New York traffic must not touch a British dish.
  circuit(ev, 'hft1', 'nyc', 'fra');
  assert.equal(ev("Object.keys(R.ef).some(k=>k==='pie:lon'&&R.ef[k].eg['l2:hft1']>0)"), false);
  ev("S.pie.spat.air={st:'on',cc:'US',cc2:'GB',ask:S.day,until:S.day+90,c:0};compute()");
  assert.equal(ev("pieAirBlock('US','GB')"), true);
  term(ev, 'us', 'bos');
  assert.equal(ev('R.pie.gs.us'), 'nyc');
  term(ev, 'gb', 'man');
  assert.equal(ev('R.pie.gs.gb'), 'lon');
  circuit(ev, 'hft2', 'nyc', 'lon');
  assert.equal(ev("Object.keys(R.ef).some(k=>k==='pie:lon'&&R.ef[k].eg['l2:hft2']>0)"), false, 'US traffic avoids the British dish');
  assert.ok(ev('R.l2.hft2') > 0, 'and goes by fiber');
  assert.deepEqual(errors, []);
});

test('saves without pies route identically, and pay nothing for orbit', () => {
  const { ev, errors } = load();
  const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  ev(`S=migrate(JSON.parse(${lit(save)}));compute()`);
  assert.equal(ev('S.pie'), null);
  const out = () => ev("JSON.stringify([R.served,R.demand,R.revMo,R.egT,R.load,R.l2,R.l2lat,R.rev])");
  const a = out();
  assert.equal(ev("R.pie===undefined&&R.rev.orbit===undefined"), true);
  // the same save with a rocket company that has nothing in the sky routes the same traffic
  ev("S.pieV=1;pieInit();compute()");
  const b = JSON.parse(ev("JSON.stringify([R.served,R.demand,R.egT,R.load,R.l2,R.l2lat])"));
  const a0 = JSON.parse(a);
  assert.deepEqual(b, [a0[0], a0[1], a0[3], a0[4], a0[5], a0[6]]);
  assert.deepEqual(errors, []);
});

test('orbit earnings go into the book, day by day', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'pz', 'pcn');
  // Homes on Pitcairn online through the pies also bring the UK's satellite grant (tests/pie-gov.test.js).
  assert.equal(ev('R.pie.gov.sky'), ev('GRANT_SKY_MO'));
  const mo = ev('R.pie.rev+R.pie.gov.rdf+R.pie.gov.sky');
  ev('for(let i=0;i<30;i++)dayTick()');
  assert.ok(Math.abs(ev('S.pie.book.earned') - mo) / mo < 0.05, `${ev('S.pie.book.earned')} ≈ ${mo}`);
  assert.deepEqual(errors, []);
});

test('orbit customers sit out a bad month: at most PIE_PATIENCE happiness a day, then they cancel', () => {
  const { ev, errors } = load();
  world(ev);
  term(ev, 'pz', 'pcn');
  ev("S.biz.find(b=>b.id==='pz').since=-100");
  assert.ok(ev('R.pie.sf.pz') > 0.9, 'served');
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full*0.3,day:S.day,las:true}];compute()");
  assert.equal(ev('R.pie.sf.pz'), 0, 'the sky has a gap');
  ev('for(let i=0;i<10;i++)dayTick()');
  const m = ev("(S.biz.find(b=>b.id==='pz')||{mood:-1}).mood");
  assert.ok(m >= 100 - 10 * ev('PIE_PATIENCE') - 1e-9 && m < 100, `ten bad days: grumpy (${m}), not gone`);
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute();for(let i=0;i<5;i++)dayTick()");
  assert.ok(ev("S.biz.find(b=>b.id==='pz').mood") > m, 'the sky back: happier again');
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full*0.3,day:S.day,las:true}];compute();for(let i=0;i<40;i++)dayTick()");
  assert.equal(ev("S.biz.some(b=>b.id==='pz')"), false, 'a month and more of nothing: cancelled');
  assert.deepEqual(errors, []);
});

test('a terminal lands on the nearest dish with room for all of it, not a sliver of a full one', () => {
  const { ev, errors } = load();
  world(ev);
  ev("S.pie.dishes.find(d=>d.city==='lon').ant=1;compute()");
  term(ev, 'a', 'dub', 'pizza', 15);
  assert.equal(ev("R.pie.gs.a"), 'lon', 'the nearest dish first');
  term(ev, 'b', 'dub', 'pizza', 50);
  assert.notEqual(ev("R.pie.gs.b"), 'lon', 'London has 5 G left: the next dish takes all 50');
  assert.ok(ev('R.pie.sf.b') > 0.95, `served in full (${ev('R.pie.sf.b')})`);
  assert.deepEqual(errors, []);
});
