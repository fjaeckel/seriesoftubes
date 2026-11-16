// #409: RouteScript spill tiers must not send IP traffic through orbit. Their detours are searched by latency,
// where a crust with lasers is the fastest way across an ocean; the sky carries only latency circuits (O2-O4).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// London and Frankfurt full of users, their only transit in New York over thin waves, dishes at all three under a
// baked crust with lasers.
const world = ev => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc','fra'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:0,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'lf',a:'lon',b:'fra',kind:'wave',tier:0,km:640,sub:false,cut:0,mo:1});"
    + "S.transit=[];ACT.buyTransit({city:'nyc',net:'cog',tier:1});for(const c of ['lon','fra']){S.pops[c].bb={d:200};S.pops[c].rgen=RG_TOP}");
  ev("ACT.pieFound();for(const c of ['lon','nyc','fra']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX");
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];S.core={lv:2,run:2};compute()");
};
const ipInSky = ev => ev("Object.keys(R.ef).filter(k=>k.startsWith('pie:')&&Object.keys(R.ef[k].eg).some(e=>!e.startsWith('l2:'))).join(',')");
const script = 'protect customers\\nspill at 70% within 5ms\\nspill at 73% within 10ms\\nspill at 77% within 20ms\\nspill at 80%';

test('#409 spill tiers keep IP traffic out of orbit', () => {
  const { ev, errors } = load();
  world(ev);
  const before = ev('R.served');
  ev(`S.te={on:true,day:0,script:'${script}'};compute()`);
  assert.equal(ev('teRules().tiers.length'), 3, 'the script is live');
  assert.equal(ipInSky(ev), '', 'no IP flow crosses a sky edge');
  assert.equal(ev("R.pie.dish.reduce((a,d)=>a+d.transit,0)"), 0, 'the dishes carry no transit');
  assert.ok(Math.abs(ev('R.served') - before) < 1e-6, 'the fiber carries what it carried before');
  assert.deepEqual(errors, []);
});

test('#409 the tiers still spill onto fiber detours, and latency circuits still fly', () => {
  const { ev, errors } = load();
  world(ev);
  // A second, longer way to New York: Frankfurt has its own wave, so London can spill over it.
  ev("S.links.push({id:'fn',a:'fra',b:'nyc',kind:'wave',tier:0,km:6200,sub:true,cable:'grace',cut:0,mo:1});"
    + "S.biz.push({id:'hft1',type:'hft',city:'lon',city2:'nyc',bw:5,rate:1000,reqs:[],latMax:null,route:'fast',name:'hft1',mood:100,since:0,sites:null})");
  ev(`S.te={on:true,day:0,script:'${script}'};compute()`);
  assert.ok(ev('R.teMoved') > 0, 'traffic moved onto a fiber detour');
  assert.equal(ipInSky(ev), '');
  assert.ok(ev("Object.keys(R.ef).some(k=>k.startsWith('pie:')&&R.ef[k].eg['l2:hft1']>0)"), 'the latency circuit takes the lasers');
  assert.deepEqual(errors, []);
});
