// Coming back online with a big joined save: a sub backlog pours in page after page. The snapshot of other networks is
// rebuilt once the backlog calms down (not once a second while it pours in), what is kept about each network goes to
// IndexedDB once per page (fedAnnBatch), and the routing the rebuild needs runs in the route worker (afterOff,
// rwRouteOff), not on the page. jsdom has no Worker: a second page plays the route worker, as in day-steps.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const SETUP = `Date.now=()=>1.7e12;S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();autoPause=()=>false;compute();UI.rk=routeKey();UI.rkR=R;`;
const open = (t, seed = 777) => { const h = load({ seed }); t.after(() => h.dom.window.close()); h.dom.window.structuredClone = globalThis.structuredClone; return h; };
// Virtual timers for FED.set: adv(ms) moves the clock and runs what is due.
const CLOCK = `window.__t=0;window.__tm=[];FED.set=(f,ms)=>{const x={f,at:__t+ms};__tm.push(x);return x;};FED.clear=x=>{const i=__tm.indexOf(x);if(i>=0)__tm.splice(i,1);};
  window.adv=ms=>{const end=__t+ms;for(;;){__tm.sort((a,b)=>a.at-b.at);const x=__tm[0];if(!x||x.at>end)break;__tm.shift();__t=x.at;x.f();}__t=end;};
  window.__runs=0;fedPlayRefresh=()=>{__runs++;return Promise.resolve();};`;

test('a backlog pouring in is rebuilt once it calms down, and at least every FEDP_HOLD', (t) => {
  const p = open(t);
  p.ev(CLOCK);
  // Pages with more behind them, one a second for 8 s: nothing yet; the last page then rebuilds 1 s later, once.
  for (let i = 0; i < 8; i++) { p.ev("fedEmit('records',{server:'x',n:256,more:true})"); p.ev('adv(1000)'); }
  assert.equal(p.ev('__runs'), 0, 'held while pages keep coming');
  p.ev("fedEmit('records',{server:'x',n:40,more:false})");
  p.ev('adv(1000)');
  assert.equal(p.ev('__runs'), 1, 'one rebuild for the whole backlog');
  // A backlog whose last page brings nothing new (no event): the calm timer rebuilds it.
  p.ev("fedEmit('records',{server:'x',n:256,more:true})");
  p.ev('adv(FEDP_CALM-1)');
  assert.equal(p.ev('__runs'), 1);
  p.ev('adv(1)');
  assert.equal(p.ev('__runs'), 2, 'rebuilt FEDP_CALM after the last page');
  // A backlog that never ends still gets a rebuild every FEDP_HOLD.
  for (let i = 0; i < 25; i++) { p.ev("fedEmit('records',{server:'x',n:256,more:true})"); p.ev('adv(1000)'); }
  assert.equal(p.ev('__runs'), 3, 'one rebuild in 25 s of pages, at FEDP_HOLD');
  // Live records (no backlog) keep the old pace: 1 s after the first, not pushed back by the next.
  p.ev('adv(FEDP_HOLD)');
  const r0 = p.ev('__runs');
  p.ev("fedEmit('records',{server:'x',n:1})"); p.ev('adv(600)'); p.ev("fedEmit('records',{server:'x',n:1})"); p.ev('adv(400)');
  assert.equal(p.ev('__runs'), r0 + 1);
});

test('a batch reads and writes the ann store through memory and writes it back once', async (t) => {
  const p = open(t);
  await p.ev("fedPut('ann','a',{heard:1,rec:null}).then(()=>fedPut('ann','b',{heard:2,rec:null}))");
  const r = JSON.parse(await p.ev(`(async()=>{const out={};
    await fedAnnBatch(['a','b','c'],async()=>{
      await fedHeard('a',5);await fedDel('ann','b');await fedPut('ann','c',{heard:9,rec:null});
      out.inA=(await fedGet('ann','a')).heard;out.inB=await fedGet('ann','b');out.allIn=(await fedAll('ann')).map(([k,v])=>k+v.heard).sort();
      // Not written yet: the store itself still has the deleted entry. (jsdom has no IndexedDB: the memory fallback
      // hands out its own objects, so a changed entry cannot be told apart there.)
      out.storeB=!!(await fedGet0('ann','b'));
      // A batch inside a batch joins it.
      await fedAnnBatch(['d'],async()=>{await fedPut('ann','d',{heard:3,rec:null});});out.storeD=await fedGet0('ann','d');});
    out.after=(await fedAll('ann')).map(([k,v])=>k+v.heard).sort();out.ab=FEDDB.ab;return JSON.stringify(out);})()`));
  assert.deepEqual(r, { inA: 5, inB: null, allIn: ['a5', 'c9'], storeB: true, storeD: null, after: ['a5', 'c9', 'd3'], ab: null });
});

// The page with a stand-in route worker (another page), as in day-steps.test.js.
function played(t) {
  const page = open(t, 777), wk = open(t, 1);
  page.ev(SETUP);
  page.ev('window.__q=[];window.__later=[];RW.budget=0;RW.later=f=>__later.push(f);rwOn=()=>!RW.dead;rwStart=()=>RW.w||(RW.w={postMessage:m=>__q.push(structuredClone(m)),terminate(){__q.length=0;}});');
  page.ev('window.__pc=0;{const c0=compute;compute=function(){__pc++;return c0.apply(this,arguments);};}');
  wk.ev('window.__out=null;window.postMessage=(m,tr)=>{__out=structuredClone(m,{transfer:tr});};');
  const pump = () => { let n = 0; for (;;) {
    if (page.ev('__later.length')) { page.ev('__later.shift()()'); continue; }
    if (!page.ev('__q.length')) break;
    wk.dom.window.__m = page.ev('__q.shift()'); wk.ev('rwServe(__m)'); page.dom.window.__a = wk.ev('__out'); page.ev('rwMsg(__a)'); n++; } return n; };
  return { ...page, pump };
}
const ROUTED = 'JSON.stringify({served:R.served,demand:R.demand,rev:R.revMo,cost:R.costMo,load:R.load,useT:R.useT,usePni:R.usePni})';

test('afterOff routes in the route worker, and after() then finds the routing done', (t) => {
  const p = played(t), ref = open(t);
  ref.ev(SETUP);
  const CHANGE = 'S.links.splice(0,3);';
  ref.ev(CHANGE + 'after()');
  p.ev('window.__after=0;{const a0=after;after=function(){__after++;return a0.apply(this,arguments);};}');
  p.ev(CHANGE + 'afterOff()');
  assert.equal(p.ev('!!RW.job'), true, 'the routing waits for the worker');
  assert.equal(p.ev('__after'), 0, 'the rest of after() waits for R');
  // No day is half done: a save (even a forced one, the tab being hidden) neither waits for it nor routes it here.
  p.ev('save(true)');
  assert.equal(p.ev('!!RW.job'), true, 'still in the worker');
  assert.equal(p.ev('__pc'), 0);
  assert.equal(p.pump(), 1);
  assert.equal(p.ev('!!RW.job'), false);
  assert.equal(p.ev('__after'), 1);
  assert.equal(p.ev('__pc'), 0, 'no routing on the page, not even in after()');
  assert.equal(p.ev(ROUTED), ref.ev(ROUTED), 'the same routing as after() on the page');
});

test('afterOff with a day in flight routes once the day is done; an action meanwhile routes on the page as always', (t) => {
  const p = played(t);
  p.ev('rwDay()');
  assert.equal(p.ev('!!RW.job'), true);
  p.ev('S.links.splice(0,3);afterOff()');
  assert.equal(p.ev('RW.off.length'), 1, 'waits for the day');
  p.pump();
  assert.equal(p.ev('!!RW.job'), false);
  assert.equal(p.ev('RW.off'), null);
  assert.equal(p.ev('__pc'), 0, 'day and rebuild both routed in the worker');
  assert.equal(p.ev('UI.rk===routeKey()&&UI.rkR===R'), true, 'after() found the routing done');
  const mine = p.ev(ROUTED);
  p.ev('compute()');
  assert.equal(p.ev(ROUTED), mine, 'R is the routing of the game as it is');
  // An action while the worker routes: its own routing on the page stands, the worker's answer is dropped.
  p.ev('__pc=0;S.links.splice(0,2);afterOff()');
  p.ev('S.links.splice(0,1);after()');
  assert.equal(p.ev('__pc'), 1);
  p.pump();
  assert.equal(p.ev('__pc'), 1, 'nothing routed again');
  const act = p.ev(ROUTED);
  p.ev('compute()');
  assert.equal(p.ev(ROUTED), act);
});
