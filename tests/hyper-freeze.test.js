// Launch freezes, phase 6 (38-hyper-freeze.js): a game studio tenant announces a launch ahead, its traffic spikes for
// two or three days, the network is frozen from the day before (every FREEZE_ACTS action refuses, the intern's too);
// served at least 90% the studio is delighted, less is a funny disaster; saves; the card's banner on a phone and desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// The director (38-hyper-director.js) lets these systems in at their level, once introduced, with budget to spend: a
// test of the system itself starts with all three.
const DIR = 'Object.assign(S.hs.dir,{b:9,i:Object.fromEntries(Object.keys(HS_DIR_INTRO).map(k=>[k,0]))});';
// A Hyperscaler at home in Frankfurt with a Server Barn (1.5 Tbps) and transit there; a game studio tenant signed a month ago.
function net(t, seed = 7) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;ACT.buyTransit({city:S.home,net:'cog',tier:4});S.hs.rg.fra.t=1;S.offers=[];" +
    "(()=>{const o=hsOffer('game','fra',40);o.id='g1';S.offers.push(o);ACT.accept({id:'g1'});const b=S.biz.find(b=>b.id==='g1');b.since=S.day-30;b.mood=60})();" + DIR + "compute()");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const announce = (ev) => { ev('S.hs.lfn=S.day;S.log=[];hsLfDay(S.day)'); return J(ev, 'S.hs.lf'); };
// The launch days, one by one, as the day does them: routing, then the day's step.
const launch = (ev) => ev('for(S.day=S.hs.lf.from;S.hs.lf;S.day++){compute();hsLfDay(S.day)}');

test('a launch is announced ahead; the network freezes from the day before: every frozen action refuses', (t) => {
  const { ev, errors } = net(t);
  const L = announce(ev);
  assert.equal(L.id, 'g1');
  const d = ev('S.day');
  assert.ok(L.from - d >= 10 && L.from - d <= 14, 'ten days to two weeks ahead');
  assert.ok(L.until - L.from >= 2 && L.until - L.from <= 3, 'two or three days');
  assert.ok(L.f >= 3 && L.f <= 5);
  assert.match(ev('JSON.stringify(S.log)'), /nobody load-tested it/);
  assert.equal(ev('chFrozen()'), null, 'not yet frozen');
  assert.match(ev('hsCard()'), /🚀 .* launches .*Change freeze/);
  // The day before: frozen. Building, buying, the edge stack, the resale desk all refuse; the intern goes through ACT too.
  ev('S.day=S.hs.lf.from-1;S.log=[]');
  assert.match(ev('chFrozen().show'), /the launch of /);
  const pops = ev('Object.keys(S.pops).length'), cash = ev('S.cash');
  ev("ACT.buildPop({city:'lon'});ACT.hsEdge({city:'fra'});ACT.hsRegion({city:'par'});ACT.buyTransit({city:'par',net:'cog',tier:1})");
  assert.equal(ev('Object.keys(S.pops).length'), pops);
  assert.equal(ev("!!S.hs.edge.fra||!!S.hs.rg.par||S.transit.some(x=>x.city==='par')"), false);
  assert.equal(ev('S.cash'), cash);
  assert.match(ev('JSON.stringify(S.log)'), /Change freeze for the launch of/);
  assert.ok(ev("['buildPop','hsEdge','hsRegion','hsReplica','hsPath','hsrTake','addPair'].every(k=>FREEZE_ACTS.includes(k))"));
  assert.match(ev('hsCard()'), /🧊/);
  // Things that do not touch the network still work.
  ev("S.offers.push(Object.assign(hsOffer('startup','fra',5),{id:'s1'}));ACT.decline({id:'s1'})");
  assert.equal(ev("S.offers.some(o=>o.id==='s1')"), false);
  assert.deepEqual(errors, []);
});

test('launch day: the studio\'s traffic spikes; served in full it is delighted', (t) => {
  const { ev, errors } = net(t);
  const want0 = ev('R.hs.ten.g1.want');
  const L = announce(ev);
  ev('S.day=S.hs.lf.from;compute()');
  assert.ok(Math.abs(ev('R.hs.ten.g1.want') - want0 * L.f) < 1e-6, 'the spike');
  assert.match(ev('hsCard()'), /Launch of .*×/);
  ev('S.log=[]');
  launch(ev);
  assert.equal(ev('S.hs.lf'), undefined, 'over');
  assert.equal(ev('chFrozen()'), null, 'unfrozen');
  assert.equal(ev("S.biz.find(b=>b.id==='g1').mood"), 85, 'happier');
  assert.match(ev('JSON.stringify(S.log)'), /launched without a hitch/);
  assert.ok(ev('S.hs.lfn') >= ev('S.day') + 59, 'the next one is months away');
  ev('compute()');
  assert.ok(Math.abs(ev('R.hs.ten.g1.want') - want0) < 1e-6, 'back to normal');
  assert.deepEqual(errors, []);
});

test('a launch the network cannot carry is a disaster; a studio that leaves takes its launch with it', (t) => {
  const { ev, errors } = net(t);
  announce(ev);
  // No front door on launch day: nothing reaches the players.
  ev('S.log=[];S.day=S.hs.lf.from;S.transit=[]');
  launch(ev);
  assert.equal(ev("S.biz.find(b=>b.id==='g1').mood"), 20);
  const log = ev('JSON.stringify(S.log)');
  assert.match(log, /💥/);
  assert.match(log, /it needed 90%/);
  // Another launch (past the director's quiet stretch after the first), and the studio leaves before it.
  ev("S.hs.dir.c=null;S.hs.dir.q=0;S.hs.lfn=S.day;hsLfDay(S.day);S.biz=S.biz.filter(b=>b.id!=='g1');S.log=[];hsLfDay(S.day)");
  assert.equal(ev('S.hs.lf'), undefined);
  assert.match(ev('JSON.stringify(S.log)'), /change freeze is off/);
  // Without a studio, nothing is announced.
  ev('S.hs.lfn=S.day;hsLfDay(S.day)');
  assert.equal(ev('S.hs.lf'), undefined);
  assert.equal(ev('S.hs.lfn'), ev('S.day') + 30);
  assert.deepEqual(errors, []);
});

test('saves keep a launch; junk is repaired; the banner on a phone and a desktop', (t) => {
  const { ev, dom, errors } = net(t);
  announce(ev);
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  assert.deepEqual([back.hs.lf, back.hs.lfn], [s.hs.lf, s.hs.lfn]);
  const old = { ...s, hs: { ...s.hs } };
  delete old.hs.lf; delete old.hs.lfn;
  const o = J(ev, `migrate(${JSON.stringify(old)}).hs`);
  assert.deepEqual([o.lf, o.lfn], [undefined, s.day + 60]);
  const junk = { ...s, hs: { ...s.hs, lf: { id: 'g1', g: 99, from: 'x', until: 99, f: 'big', q: -1, k: 'z' }, lfn: 'later' } };
  const m = J(ev, `migrate(${JSON.stringify(junk)}).hs`);
  assert.deepEqual(m.lf, { id: 'g1', g: 7, ann: 0, from: 0, until: 5, f: 3, q: 0, k: 0 });
  assert.equal(m.lfn, 0);
  assert.equal(ev(`migrate(${JSON.stringify({ ...s, hs: { ...s.hs, lf: { id: 'nobody', from: 3, until: 5 } } })}).hs.lf===undefined`), true, 'a launch of a tenant that is gone');
  ev(`S=migrate(${JSON.stringify(junk)});compute();for(let i=0;i<3;i++)dayTick()`);
  ev(`S=migrate(${JSON.stringify(s)});compute()`);
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};S.day=S.hs.lf.from-3;renderAll()`);
    assert.match(dom.window.document.body.textContent, /launches .* Change freeze/);
    ev('S.day=S.hs.lf.from-1;renderAll()');
    assert.match(dom.window.document.body.textContent, /Change freeze for the launch of/);
  }
  assert.deepEqual(errors, []);
});
