// Pie in the Sky (#380): a latency circuit only flies where the sky has room for it. Launching pies must not take a
// circuit that its fiber carried in full and leave it on a dish full of terminals or of earlier circuits.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A sandbox with London and New York on an 800G transatlantic wave; pies() adds a baked, lasered Shortcrust over
// dishes of `ant` antennas at both ends.
const world = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1});for(const c of ['lon','nyc'])ACT.buyTransit({city:c,net:'cog',tier:1})");
};
const pies = (ev, ant) => ev(`ACT.pieFound();for(const c of ['lon','nyc']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=${ant};`
  + "S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
const circuit = (ev, id, bw) => ev(`S.biz.push({id:'${id}',type:'hft',city:'lon',city2:'nyc',bw:${bw},rate:1000,reqs:[],latMax:null,route:'fast',name:'${id}',mood:100,since:0,sites:null});compute()`);
const sky = (ev, id) => ev(`Object.keys(R.ef).some(k=>k.startsWith('pie:')&&R.ef[k].eg['l2:${id}']>0)`);

test('circuits that fit fly; the one the dishes cannot hold keeps its fiber and stays whole', () => {
  const { ev, errors } = load();
  world(ev);
  circuit(ev, 'a', 40);
  circuit(ev, 'b', 40);
  const fiber = ev('R.l2lat.b');
  assert.equal(ev('R.l2.a+R.l2.b'), 80, 'on fiber both are carried in full');
  pies(ev, 2); // 40G a dish
  assert.equal(ev('pieDishes().every(d=>d.g===40)'), true);
  assert.equal(sky(ev, 'a'), true, 'the first circuit fits in orbit and flies');
  assert.ok(ev('R.l2lat.a') < fiber, 'faster up there');
  assert.equal(sky(ev, 'b'), false, 'the dishes are full: the second stays on the fiber');
  assert.equal(ev('R.l2.b'), 40, 'and is still carried in full');
  assert.ok(Math.abs(ev('R.l2lat.b') - fiber) < 1e-6);
  assert.ok(ev('R.pie.used.lon') <= 40 + 1e-6);
  assert.deepEqual(errors, []);
});

test('a circuit bigger than any dish stays on the fiber that carries it', () => {
  const { ev, errors } = load();
  world(ev);
  circuit(ev, 'big', 400);
  pies(ev, 16); // 320G a dish
  assert.equal(sky(ev, 'big'), false);
  assert.equal(ev('R.l2.big'), 400);
  assert.deepEqual(errors, []);
});

test('local terminals fill the dish first: the circuit they leave too little room for keeps its fiber', () => {
  const { ev, errors } = load();
  world(ev);
  circuit(ev, 'c', 20);
  pies(ev, 2);
  assert.equal(sky(ev, 'c'), true, 'an empty sky has room');
  ev("S.biz.push({id:'pz',type:'pizza',city:'nyc',city2:null,bw:30,rate:BIZ_T.pizza.rate,reqs:[],latMax:null,route:'normal',name:'pz',mood:100,since:0,sites:null});compute()");
  assert.ok(ev('R.pie.term.nyc') > 25, 'homes near New York take most of the dish');
  assert.equal(sky(ev, 'c'), false, 'too little room left: back on the fiber');
  assert.equal(ev('R.l2.c'), 20);
  assert.deepEqual(errors, []);
});
