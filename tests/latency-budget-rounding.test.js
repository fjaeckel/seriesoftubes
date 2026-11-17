const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// #423: a path whose latency shows as exactly the customer's budget (42.2 ms of 42.2 ms) must count as within it.
// Latencies are shown to 0.1 ms, so the check compares at that precision too.
const start = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'nyc'})";
const pop = (c) => `S.pops['${c}']=S.pops['${c}']||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};S.pops['${c}'].rgen=RG.length-1;`;
const wave = (id, a, b) => `S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'wave',tier:6,n:1,km:kmBetween('${a}','${b}'),cut:0,mo:0,day:0,ready:0});`;
// The customer's budget is the path latency as the game shows it, rounded down (the reported case) or up.
const sign = (dir) => `(()=>{const b={id:'lc1',city:'nyc',city2:'chi',name:'Shortest Path Securities',type:'lowlat',bw:100,rate:500,reqs:['lat'],latMax:1,route:'fast',mood:100,since:S.day-30};S.biz.push(b);compute();
  b.latMax=+R.l2lat.lc1.toFixed(1)${dir};return b.id;})()`;

test('#423 a path that shows exactly the latency budget meets it', () => {
  const { ev, errors } = load();
  ev(start);
  ev(['nyc', 'chi'].map(pop).join('') + wave('nc', 'nyc', 'chi') + 'compute();');
  ev(sign(''));
  const lat = ev('R.l2lat.lc1'), max = ev("S.biz.find(b=>b.id==='lc1').latMax");
  assert.ok(isFinite(lat) && lat > 0, 'the circuit has a path');
  // Push the budget just under the real figure, as the save in the report had it (42.2 against 42.2x).
  ev(`S.biz.find(b=>b.id==='lc1').latMax=${max}`);
  ev(`R.l2lat.lc1=${max}+0.04`);
  assert.equal(ev("R.l2lat.lc1.toFixed(1)"), String(max.toFixed(1)), 'the player sees the budget exactly');
  assert.equal(ev("REQS.lat.ok(S.biz.find(b=>b.id==='lc1'))"), true, 'so the requirement is met');
  assert.match(ev("reqList(S.biz.find(b=>b.id==='lc1'))"), /✓/, 'and shown met');
  assert.equal(ev("lcBreach(S.biz.find(b=>b.id==='lc1'),S.day)"), 0, 'no SLA credit is owed');
  // A path that shows even 0.1 ms over the budget still misses it.
  ev(`R.l2lat.lc1=${max}+0.06`);
  assert.equal(ev("REQS.lat.ok(S.biz.find(b=>b.id==='lc1'))"), false, '0.1 ms over is over');
  ev(`R.l2lat.lc1=Infinity`);
  assert.equal(ev("REQS.lat.ok(S.biz.find(b=>b.id==='lc1'))"), false, 'no path never meets a budget');
  assert.deepEqual(errors, []);
});

test('#423 the move-path window does not call an exact-budget path over it', () => {
  const { ev, errors } = load();
  ev(start);
  ev(['nyc', 'chi'].map(pop).join('') + wave('nc', 'nyc', 'chi') + 'compute();');
  ev(sign(''));
  assert.equal(ev("latOk(R.l2lat.lc1+0.04, +(R.l2lat.lc1+0.04).toFixed(1))"), true);
  assert.equal(ev("latOk(42.24, 42.2)"), true, 'the reported case');
  assert.equal(ev("latOk(42.26, 42.2)"), false);
  assert.deepEqual(errors, []);
});
