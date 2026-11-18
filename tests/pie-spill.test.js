// Pie in the Sky: a terminal customer bigger than a full dish spills onto the next dish in reach instead of going
// short with nothing to fix it (one dish tops out at 16 antennas, and pizza customers keep doubling).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// London and Paris (344 km apart, one bent-pipe hop) on a wave, each with a 40G dish under a baked Shortcrust.
function world(t, cities) {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev } = h;
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;S.offers=[];S.biz=[]");
  ev("for(const c of ['lon','par'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'lp',a:'lon',b:'par',kind:'wave',tier:3,km:344,sub:true,cut:0,mo:1});for(const c of ['lon','par'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev(`ACT.pieFound();for(const c of ${JSON.stringify(cities)}){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes){x.ant=2;x.band=0;}`
    + "S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];"
    + "S.biz.push({id:'big',type:'pizza',city:'lon',name:'big',bw:60,rate:1000,mood:100,since:0,reqs:[]});compute()");
  return h;
}

test('a customer bigger than its dish lands the rest on a dish nearby and is served in full', t => {
  const { ev, errors } = world(t, ['lon', 'par']);
  assert.equal(ev('pieDishes().every(d=>d.g===40)'), true);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(R.pie.gx.big)")), [['lon', 40], ['par', 20]]);
  assert.equal(ev("R.pie.gs.big"), 'lon', 'its first dish is still the one it lands at');
  assert.ok(ev("R.pie.sf.big") > 0.95, `served ${ev('R.pie.sf.big')}`);
  assert.equal(ev("R.pie.term.lon+R.pie.term.par"), 60);
  assert.equal(ev("pieFixList(R.pie).length"), 0, 'nothing left to fix');
  assert.match(ev("pieLandHere('par')"), /big/, 'Paris lists it among what comes down there');
  assert.deepEqual(errors, []);
});

test('with one dish it stays short, and nothing spills', t => {
  const { ev, errors } = world(t, ['lon']);
  assert.equal(ev("R.pie.gx.big"), undefined);
  assert.ok(Math.abs(ev("R.pie.sf.big") - 40 / 60) < 0.01, `served ${ev('R.pie.sf.big')}`);
  assert.deepEqual(errors, []);
});

test('a dish cut off from the backbone comes last, even when it is the nearest', t => {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;S.offers=[];S.biz=[]");
  // Brussels has a POP and a dish but no fiber yet; Paris is on the backbone, 264 km away.
  ev("for(const c of ['lon','par','bru'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'lp',a:'lon',b:'par',kind:'wave',tier:3,km:344,sub:true,cut:0,mo:1});for(const c of ['lon','par'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['par','bru']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes){x.ant=2;x.band=0;}"
    + "S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];"
    + "S.biz.push({id:'b',type:'pizza',city:'bru',name:'b',bw:20,rate:1000,mood:100,since:0,reqs:[]});compute()");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(R.pie.isl)')), ['bru']);
  assert.equal(ev('R.pie.gs.b'), 'par', 'it lands on the dish whose traffic gets out');
  assert.ok(ev('R.pie.sf.b') > 0.95, `served ${ev('R.pie.sf.b')}`);
  assert.deepEqual(errors, []);
});
