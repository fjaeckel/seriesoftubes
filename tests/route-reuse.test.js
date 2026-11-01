const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = (t) => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.ev(`S=migrate(JSON.parse(${JSON.stringify(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();`); return h; };
const rj = (ev) => ev("JSON.stringify(R,(k,v)=>k==='attack'||k==='parent'?(v&&v.id):v)");

test('reusing the routing with unchanged demand gives what compute() gives', (t) => {
  const { ev, errors } = big(t);
  const a = rj(ev), fl = ev('JSON.stringify(R.fl.map(f=>[f.rem,f.gt,f.gi,f.gp,f.gh,f.ti,f.ii]))');
  const ef = ev('JSON.stringify(Object.keys(R.ef).map(k=>R.ef[k]))');
  assert.equal(ev('routeDay()'), true, 'nothing changed: reused');
  assert.equal(rj(ev), a);
  assert.equal(ev('JSON.stringify(R.fl.map(f=>[f.rem,f.gt,f.gi,f.gp,f.gh,f.ti,f.ii]))'), fl);
  assert.equal(ev('JSON.stringify(Object.keys(R.ef).map(k=>R.ef[k]))'), ef);
  assert.deepEqual(errors, []);
});

test('a change to the network, an incident or an old base routes in full', (t) => {
  const { ev, errors } = big(t);
  const again = (setup) => { ev('compute()'); ev(setup); return ev('routeDay()'); };
  assert.equal(again(''), true);
  assert.equal(again('S.links[0].cut=S.day+3'), false, 'a cut link');
  ev('S.links[0].cut=0');
  assert.equal(again("S.transit[0].pref='high'"), false, 'a preference');
  ev("S.transit[0].pref='normal'");
  assert.equal(again('S.pops[Object.keys(S.pops)[1]].down=S.day+2'), false, 'a POP down');
  ev('S.pops[Object.keys(S.pops)[1]].down=0');
  assert.equal(again('S.ev.viral=S.day+5'), false, 'an event');
  ev('S.ev.viral=0');
  assert.equal(again('S.pni.pop()'), false, 'a PNI gone');
  assert.equal(again('S.day+=REUSE.maxAge'), false, 'base too old');
  assert.equal(again('REUSE.on=false'), false, 'switched off');
  assert.deepEqual(errors, []);
});

test('scaled demand stays close to a full routing, and one that no longer fits routes in full', (t) => {
  const { ev, errors } = big(t);
  // A few per cent more demand everywhere: the reuse either holds within a fraction of a per cent or falls back.
  ev('for(const c in S.pops){const p=S.pops[c];if(p.bb)p.bb.d*=1.01;}');
  const fast = ev('routeDay()');
  const got = JSON.parse(ev('JSON.stringify({s:R.served,d:R.demand,c:R.citySrv})'));
  ev('compute()');
  const ref = JSON.parse(ev('JSON.stringify({s:R.served,d:R.demand,c:R.citySrv})'));
  assert.ok(Math.abs(got.d - ref.d) < 1e-6 * ref.d, 'demand is today\'s');
  assert.ok(Math.abs(got.s - ref.s) < 0.01 * ref.s, `served within 1% (${got.s} / ${ref.s}, reused: ${fast})`);
  // Ten times the demand cannot fit where the base had room: full routing.
  ev('for(const c in S.pops){const p=S.pops[c];if(p.bb)p.bb.d*=10;}');
  assert.equal(ev('routeDay()'), false);
  assert.deepEqual(errors, []);
});
