// The intern's line system swap asks first whether a day without the fiber still serves everything (opsDark(),
// 95-standing-orders.js). That test routes the whole network: in play the route worker answers it, like a sales trial,
// so the shift never routes on the page. jsdom has no Worker: a second page plays it (rwServe()), messages cloned both
// ways. The shift played that way is the shift opsDay() plays; an action while the worker routes makes the page test again.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// tests/intern-optical-upgrade.test.js's network: a full, hot fiber Frankfurt–Amsterdam and the long way round through
// Paris on two waves, big enough (tier 4) to carry the day without the fiber, or not (tier 0).
const base = tier => "Date.now=()=>1.7e12;ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=6;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "for(const c of ['ams','par'])ACT.buildPop({city:c});for(const c of ['fra','ams','par']){S.pops[c].rgen=mainRG(3);S.pops[c].routers=2;}ACT.launchBB({city:'ams'});" +
  "S.transit=[];ACT.buyTransit({city:'fra',net:'cog',tier:2});" +
  "S.links=[{id:'f',a:'fra',b:'ams',kind:'df',own:true,sys:'lite',ch:Array(16).fill('zr4'),km:450,trench:'t1',ready:0,cut:0,mo:1,pairs:1}," +
  `{id:'w1',a:'fra',b:'par',kind:'wave',tier:${tier},km:480,cut:0,mo:1},{id:'w2',a:'par',b:'ams',kind:'wave',tier:${tier},km:430,cut:0,mo:1}];compute();` +
  "ACT.opsHire({id:'annie'});S.ops.floor=0;S.ops.cap.optup=0;closeModal();S.ops.on.optup=true;S.ops.p.optup={at:80};R.load.f=dfCap(S.links[0])*0.9";
const open = (t) => { const h = load(); t.after(() => h.dom.window.close()); h.dom.window.structuredClone = globalThis.structuredClone; return h; };
// The page with a stand-in worker (tests/day-steps.test.js): what it posts waits until pump() hands it to the other page.
function played(t, tier) {
  const page = open(t), wk = open(t);
  page.ev(base(tier));
  page.ev('window.__q=[];window.__later=[];RW.budget=0;RW.later=f=>__later.push(f);rwOn=()=>!RW.dead;rwStart=()=>RW.w||(RW.w={postMessage:m=>__q.push(structuredClone(m)),terminate(){__q.length=0;}});');
  page.ev('window.__pc=0;{const c0=compute;compute=function(){__pc++;return c0.apply(this,arguments);};}');
  wk.ev('window.__out=null;window.postMessage=(m,tr)=>{__out=structuredClone(m,{transfer:tr});};');
  let dark = 0;
  const one = () => { if (page.ev('!!(__q[0].trial&&__q[0].trial.dark)')) dark++; wk.dom.window.__m = page.ev('__q.shift()'); wk.ev('rwServe(__m)'); page.dom.window.__a = wk.ev('__out'); page.ev('rwMsg(__a)'); };
  const pump = () => { for (;;) { if (page.ev('__later.length')) { page.ev('__later.shift()()'); continue; } if (!page.ev('__q.length')) break; one(); } };
  return { ...page, pump, one, dark: () => dark };
}
const STATE = "JSON.stringify({links:S.links,cash:S.cash,log:S.ops.log,spent:S.ops.spent,no:OPTUP_NO.get('f')??null,served:R.served})";

for (const [tier, sys] of [[4, 'roadm'], [0, 'lite']]) {
  test(`the dark fiber test goes to the worker and plays as on the page (waves of tier ${tier}: ${sys})`, (t) => {
    const ref = open(t), p = played(t, tier);
    ref.ev(base(tier));
    ref.ev('opsDay(S.day)');
    p.ev('rwGo(opsRun(S.day))');
    assert.equal(p.ev('!!(__q.length||__later.length)'), true, 'the shift waits for the worker');
    p.pump();
    assert.equal(p.ev('!!RW.job'), false, 'the shift is over');
    assert.equal(p.ev(STATE), ref.ev(STATE));
    assert.equal(p.ev('S.links[0].sys'), sys);
    assert.equal(p.dark(), 1, 'the worker tested the fiber dark');
    assert.equal(p.ev('__pc'), 0, 'no routing on the page');
    assert.equal(p.ev("S.links[0].eqDown===undefined||S.links[0].eqDown>S.day"), true);
    assert.deepEqual([...ref.errors, ...p.errors], []);
  });
}

test('an action while the worker tests the fiber: the page tests it again on the game as it is', (t) => {
  const ref = open(t), p = played(t, 4);
  ref.ev(base(4));
  ref.ev('opsDay(S.day)');
  p.ev('rwGo(opsRun(S.day))');
  // Up to the dark fiber's trial, then an action (it routes on the page, as always), then the worker's stale answer.
  for (let i = 0; i < 50 && !p.ev('!!(__q[0]&&__q[0].trial&&__q[0].trial.dark)'); i++) { if (p.ev('__later.length')) p.ev('__later.shift()()'); else if (p.ev('__q.length')) p.one(); else break; }
  assert.equal(p.ev('!!(__q[0].trial&&__q[0].trial.dark)'), true, 'the trial is in flight');
  p.ev('__pc=0;after()');
  p.pump();
  assert.equal(p.ev('__pc'), 2, "the action's routing, and the test made again here");
  assert.equal(p.ev(STATE), ref.ev(STATE));
  assert.equal(p.ev('S.links[0].sys'), 'roadm');
  assert.deepEqual([...ref.errors, ...p.errors], []);
});
