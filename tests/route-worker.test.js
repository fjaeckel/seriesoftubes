// The route worker (src/game/80-simulation/28-route-worker.js): jsdom has no Worker, so these check the parts that
// decide whether its answer is the same as routing on the page: R packed, cloned the way postMessage clones it, and
// unpacked gives the same R; a day split around its routing is the same day; tests stay on the synchronous path.
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

test('R packed, cloned and unpacked is the same R, lazy parts and key order included', (t) => {
  const { ev, errors } = big(t);
  const want = ev(SIG);
  ev("{const {o,p,tr}=rwPack(R);const c=structuredClone({o,p},{transfer:tr});R=rwUnpack(c.o,c.p);UI.hotMap=hotByCity();}");
  assert.equal(ev(SIG), want);
  assert.equal(ev('pniFlows(Object.keys(S.pops)[0])!==null'), true, 'the PNI list reads the unpacked flows');
  assert.deepEqual(errors, []);
});

test('the worker side routes what it is sent: same R as routing on the page', (t) => {
  const { ev, errors } = big(t);
  // rwServe() in the page itself stands in for the worker: it posts back what the worker would.
  ev("window.__got=null;window.postMessage=(m)=>{window.__got=m;};");
  ev("{window.__R0=R;const prev={load:R.load,l2route:R.l2route,efg:rwEfgOut(R.efg)};const keep=S;window.__S0=JSON.stringify(S);rwServe(structuredClone({seq:1,S,...prev}));S=keep;}");
  ev("R=rwUnpack(structuredClone(__got.R),__got.ef)");
  const fromWorker = ev(SIG);
  ev('R=__R0;S=JSON.parse(__S0);compute()');
  assert.equal(ev('JSON.stringify(S)'), ev('__S0'), 'routing does not change S');
  assert.equal(ev(SIG), fromWorker);
  assert.deepEqual(errors, []);
});

test('a day split around its routing is the same day; tests never use the worker', (t) => {
  const a = big(t), b = big(t);
  for (const h of [a, b]) h.ev('S.nextFail=S.nextEvent=S.day+99;__reseed(4242)');
  a.ev('for(let i=0;i<3;i++)dayTick()');
  // Every routing it asks for done by hand (a DAY_REST is only a place to let a frame through, not a routing).
  b.ev("for(let i=0;i<3;i++){const g=dayRun();for(let s=g.next();!s.done;s=g.next())if(s.value!==DAY_REST)compute();}");
  const st = "JSON.stringify({day:S.day,cash:S.cash,moods:S.biz.map(b=>b.mood),offers:S.offers.length,served:R.served})";
  assert.equal(b.ev(st), a.ev(st));
  assert.equal(a.ev('rwOn()'), false);
  assert.deepEqual([...a.errors, ...b.errors], []);
});
