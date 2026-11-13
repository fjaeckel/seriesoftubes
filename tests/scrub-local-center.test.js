// #345: a DDoS-protection customer in a city with its own scrubbing center was still told its attacks are hauled to a
// far center, and lost happiness for it, because the flood is shared by size with every other center. The city panel
// and help promise that a center in the customer's city keeps the detour short, so the local center must count.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt and New York joined over Amsterdam, a DDoS-protection customer in Frankfurt under attack, centers always on.
function setup(ev, scrubs) {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("for(const c of ['ams','nyc'])ACT.buildPop({city:c});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.pending={a:'ams',b:'nyc'};ACT.buildLink({tier:1});closeModal()");
  ev(`S.biz.push({id:'s',type:'scrub',name:'Shield Co',city:'fra',bw:10,rate:100,mood:80,since:0,reqs:[]});S.scrubs=${scrubs};S.scrubMode='always'`);
  ev("S.ev.ddos={id:'atk',city:'fra',tgt:'s',vec:'dns',gbps:550,start:S.day,until:S.day+2,bh:false};compute()");
}

test('#345 a customer with a scrubbing center in its own city is not told its attacks are hauled away', () => {
  const { ev, errors } = load();
  setup(ev, "[{city:'fra',tier:1},{city:'nyc',tier:0}]");
  assert.ok(ev("R.haul.some(q=>q.to==='nyc'&&q.ms>=SCRUB_FAR_MS)"), 'part of the flood is still shared with New York');
  assert.equal(ev("scrubFar('fra')"), null, 'but Frankfurt has its own center, so the customer does not mind');
  assert.doesNotMatch(ev("bizWhy(S.biz.find(b=>b.id==='s')).join(' ')"), /hauled to/);
  assert.deepEqual(errors, []);
});

test('#345 without a local center the far haul still bothers the customer', () => {
  const { ev, errors } = load();
  setup(ev, "[{city:'ams',tier:1},{city:'nyc',tier:0}]");
  const q = JSON.parse(ev("JSON.stringify(scrubFar('fra'))"));
  assert.equal(q && q.to, 'nyc');
  assert.match(ev("bizWhy(S.biz.find(b=>b.id==='s')).join(' ')"), /hauled to New York/);
  // A center in Frankfurt whose POP is down does not help either.
  ev("S.scrubs.push({city:'fra',tier:0});compute();S.pops.fra.down=S.day+5");
  assert.equal(JSON.parse(ev("JSON.stringify(scrubFar('fra'))")).to, 'nyc');
  assert.deepEqual(errors, []);
});
