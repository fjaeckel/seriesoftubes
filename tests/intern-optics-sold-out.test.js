// #487: a fiber whose every lit Gbps is sold as managed waves carries nothing for you (dfCap() is 0) and goes offline.
// The "Light more fiber" order only lit fiber with no channels when it saw no capacity, so it never lit the one more
// optic that brings it back.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=4;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});S.pops.fra.rgen=2;ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});S.pops.ams.rgen=2;compute();" +
  "ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();" +
  "S.links.push({id:'f',a:'fra',b:'ams',kind:'df',sys:'roadm',ch:['zr4','zr4'],km:450,sub:false,ready:0,cut:0,mo:1,trench:'f'});compute()";
// Managed waves of 100G on the fiber, `n` of them.
const sell = (n) => `S.biz.push({id:'mw',type:'mwave',link:'f',slots:${n},g:100,rate:5000,name:'Managed',city:'fra',city2:'ams',bw:1,reqs:[],mood:80,since:0,day:0,route:'normal',what:'x'});compute()`;
const nCh = "S.links.find(l=>l.id==='f').ch.length";

test('#487 the intern lights one more optic on a fiber sold out to managed waves', (t) => {
  const { ev, errors, dom } = load();
  t.after(() => dom.window.close());
  ev(BASE);
  const lit = ev("dfLit(S.links.find(l=>l.id==='f'))");
  ev(sell(Math.round(lit / 100)));
  assert.equal(ev("dfCap(S.links.find(l=>l.id==='f'))"), 0, 'every Gbps is sold');
  ev("S.ops.on.optics=true;opsDay(S.day);compute()");
  assert.equal(ev(nCh), 3, 'one more optic, for your own traffic');
  assert.ok(ev("dfCap(S.links.find(l=>l.id==='f'))") > 0, 'the fiber carries your traffic again');
  ev("opsDay(S.day+1)");
  assert.equal(ev(nCh), 3, 'and no more while it is not hot');
  assert.deepEqual(errors, []);
});

test('#487 a lit fiber with room to spare and no traffic gets nothing', (t) => {
  const { ev, errors, dom } = load();
  t.after(() => dom.window.close());
  ev(BASE);
  ev(sell(1));
  ev("S.ops.on.optics=true;opsDay(S.day)");
  assert.equal(ev(nCh), 2);
  assert.deepEqual(errors, []);
});
