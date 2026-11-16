// The route worker (src/game/80-simulation/28-route-worker.js): jsdom has no Worker, so these check the parts that
// decide whether its answer is the same as routing on the page: R packed, cloned the way postMessage clones it, and
// unpacked gives the same R; tests stay on the synchronous path (a day split around its routings: tests/day-steps.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = (t) => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.dom.window.structuredClone = globalThis.structuredClone;   // what postMessage does between the threads
  h.ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();autoPause=()=>false;compute();`); return h; };
// R with its lazy parts (R.ef, R.fl) read out, attacks by id.
const SIG = "(()=>{const o={};for(const k in R)o[k]=R[k];o.ef={};for(const k in R.ef)o.ef[k]=R.ef[k];o.fl=(R.fl||[]).map(f=>[f.c,f.n,f.junk,f.rem,f.gt,f.gi,f.gp,f.gh,f.ti,f.ii]);return JSON.stringify(o,(k,v)=>k==='attack'?(v&&v.id):k==='ports'?undefined:v);})()";

// R.efg, which the next day's routing reads: every link's sums, Map order included (they cross as typed arrays).
const EFG = "JSON.stringify(Object.entries(R.efg).map(([k,e])=>[k,[...e.t.g],e.t.v,e.t.n,e.t.d]))";

test('R packed, cloned and unpacked is the same R, lazy parts and key order included', (t) => {
  const { ev, errors } = big(t);
  const want = ev(SIG), efg = ev(EFG);
  ev("{const {o,p,tr}=rwPack(R);const c=structuredClone({o,p},{transfer:tr});R=rwUnpack(c.o,c.p);UI.hotMap=hotByCity();}");
  assert.equal(ev(EFG), efg);
  assert.equal(ev(SIG), want);
  // Sent back to the worker after an action, a link's sums still clone whole.
  assert.equal(ev("JSON.stringify(Object.entries(structuredClone(rwEfgOut(R.efg))).map(([k,t])=>[k,[...t.g],t.v,t.n,t.d]))"), efg);
  assert.equal(ev('pniFlows(Object.keys(S.pops)[0])!==null'), true, 'the PNI list reads the unpacked flows');
  // Tests never use the worker (a day stepped through it is tests/day-steps.test.js).
  assert.equal(ev('rwOn()'), false);
  assert.deepEqual(errors, []);
});

test('the worker side routes what it is sent: same R as routing on the page', (t) => {
  const { ev, errors } = big(t);
  // rwServe() in the page itself stands in for the worker: it posts back what the worker would.
  ev("window.__got=null;window.postMessage=(m)=>{window.__got=m;};");
  ev("{window.__R0=R;const prev={load:R.load,l2route:R.l2route,efg:rwEfgOut(R.efg)};const keep=S;window.__S0=JSON.stringify(S);rwServe(structuredClone({seq:1,S,...prev}));S=keep;}");
  ev("R=rwUnpack(structuredClone(__got.R),__got.ef)");
  const fromWorker = ev(SIG), hot = ev('JSON.stringify(structuredClone(__got.hot))');
  ev('R=__R0;S=JSON.parse(__S0);compute()');
  assert.equal(ev('JSON.stringify(S)'), ev('__S0'), 'routing does not change S');
  assert.equal(ev(SIG), fromWorker);
  // The full ports it found come along (the page no longer works them out again), key order included.
  assert.equal(hot, ev('JSON.stringify(UI.hotMap)'));
  assert.ok(Object.keys(JSON.parse(hot)).length > 5, 'some ports are full on the big network');
  assert.deepEqual(errors, []);
});
