// #345: a flood was shared between every scrubbing center by size, so a customer in a city with its own center still
// had part of each attack hauled across an ocean. The nearest center with room now takes the flood, and only what it
// cannot clean spills to the next nearest, as the city panel promises ("a center here keeps the detour short").
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Frankfurt and New York joined over Amsterdam, a DDoS-protection customer in Frankfurt under attack, centers always on.
function setup(ev, scrubs, gbps) {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("for(const c of ['ams','nyc'])ACT.buildPop({city:c});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.pending={a:'ams',b:'nyc'};ACT.buildLink({tier:1});closeModal()");
  ev(`S.biz.push({id:'s',type:'scrub',name:'Shield Co',city:'fra',bw:10,rate:100,mood:80,since:0,reqs:[]});S.scrubs=${lit(scrubs)};S.scrubMode='always'`);
  ev(`S.ev.ddos={id:'atk',city:'fra',tgt:'s',vec:'dns',gbps:${gbps},start:S.day,until:S.day+2,bh:false};compute()`);
}
const parts = (ev) => JSON.parse(ev("(()=>{const m=ddosReport(ddosAll()[0]);return JSON.stringify(m.parts.map(p=>[p.city,Math.round(p.a),Math.round(p.cleaned)]))})()"));
const why = (ev) => ev("bizWhy(S.biz.find(b=>b.id==='s')).join(' ')");

test('#345 a center in the target\'s own city takes the whole flood when it has room', () => {
  const { ev, errors } = load();
  setup(ev, [{ city: 'nyc', tier: 2 }, { city: 'fra', tier: 1 }], 550);
  assert.deepEqual(parts(ev), [['fra', 550, 550]], 'nothing is sent to the bigger center in New York');
  assert.ok(!ev("R.haul.some(q=>q.to==='nyc')"), 'no haul across the Atlantic');
  assert.equal(ev("scrubFar('fra')"), null);
  assert.doesNotMatch(why(ev), /hauled to/);
  assert.deepEqual(errors, []);
});

test('#345 what the nearest center cannot clean spills to the next nearest', () => {
  const { ev, errors } = load();
  setup(ev, [{ city: 'nyc', tier: 1 }, { city: 'ams', tier: 0 }, { city: 'fra', tier: 0 }], 550);
  assert.deepEqual(parts(ev), [['fra', 100, 100], ['ams', 100, 100], ['nyc', 350, 350]]);
  assert.equal(ev("ddosReport(ddosAll()[0]).over"), 0, 'all of it is cleaned');
  // Most of it crossed the Atlantic, so the customer minds.
  assert.match(why(ev), /hauled to New York/);
  assert.deepEqual(errors, []);
});

test('#345 a flood bigger than every center is pulled in by the nearest, and the rest is not cleaned', () => {
  const { ev, errors } = load();
  setup(ev, [{ city: 'ams', tier: 0 }, { city: 'fra', tier: 0 }], 300);
  assert.deepEqual(parts(ev), [['fra', 200, 100], ['ams', 100, 100]]);
  assert.equal(Math.round(ev("ddosReport(ddosAll()[0]).over")), 100);
  // A center whose POP is down takes nothing: the next nearest does.
  ev("S.scrubs.push({city:'nyc',tier:0});S.pops.ams.down=S.day+5;S.ev.ddos.gbps=150;compute()");
  assert.deepEqual(parts(ev), [['fra', 100, 100], ['nyc', 50, 50]]);
  assert.deepEqual(errors, []);
});
