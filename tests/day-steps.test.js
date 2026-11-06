// The day as steps (dayRun() in src/game/88-days/10-day-tick.js): every routing a day needs, its own and the
// recomputes after a failure or the intern's jobs, is a yield the route worker answers in play. jsdom has no Worker, so
// a second page plays it: rwServe() there, messages cloned both ways the way postMessage clones them. A day played that
// way must be the day dayTick() plays, move for move, with a frame let through in the middle of each day.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
// The big network with an intern running every order, a failure and an event due soon, and its circuits on scenic
// routes, which read yesterday's R.efg. Ids come from Date.now(),
// so the clock stands still in every page.
const SETUP = `Date.now=()=>1.7e12;S=migrate(JSON.parse(${JSON.stringify(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();autoPause=()=>false;
  S.cash=1e9;ACT.salesHire({id:'eng'});closeModal();S.slAuto.on=true;
  S.ops.intern='tracy';S.ops.hired=S.day;for(const k in S.ops.on)S.ops.on[k]=true;S.ops.floor=0;for(const k in S.ops.cap)S.ops.cap[k]=0;
  S.nextFail=S.day+3;S.nextEvent=S.day+5;for(const b of S.biz)if(BIZ_T[b.type].l2&&b.city2)b.route='scenic';compute();__reseed(4242);`;
const open = (t, seed) => { const h = load({ seed }); t.after(() => h.dom.window.close()); h.dom.window.structuredClone = globalThis.structuredClone; return h; };
// The page, with a stand-in worker: what it posts waits in a queue until pump() hands it to the other page.
function played(t) {
  const page = open(t, 777), wk = open(t, 1);
  page.ev(SETUP);
  // No time to spare: every DAY_REST waits for the next "frame", which pump() gives it.
  page.ev('window.__q=[];window.__later=[];RW.budget=0;RW.later=f=>__later.push(f);rwOn=()=>!RW.dead;rwStart=()=>RW.w||(RW.w={postMessage:m=>__q.push(structuredClone(m)),terminate(){__q.length=0;}});');
  wk.ev('window.__out=null;window.postMessage=(m,tr)=>{__out=structuredClone(m,{transfer:tr});};');
  // Answers what is waiting, one message at a time; returns how many routings it served.
  let rests = 0, trials = 0;
  const pump = () => { let n = 0; for (;;) {
    if (page.ev('__later.length')) { rests++; page.ev('__later.shift()()'); continue; }
    if (!page.ev('__q.length')) break;
    if (page.ev('!!__q[0].trial')) trials++;
    wk.dom.window.__m = page.ev('__q.shift()'); wk.ev('rwServe(__m)'); page.dom.window.__a = wk.ev('__out');
    page.ev('rwDone(__a)'); n++; } return n; };
  // One message to the worker and its answer back (the trial test steps through a day with it).
  const pump1 = () => { if (!page.ev('__q.length')) return; wk.dom.window.__m = page.ev('__q.shift()'); wk.ev('rwServe(__m)'); page.dom.window.__a = wk.ev('__out'); page.ev('rwDone(__a)'); };
  return { ...page, pump, pump1, rests: () => rests, trials: () => trials };
}
// R.egDesc too, key for key and in order.
const STATE = "JSON.stringify({S,R:{served:R.served,demand:R.demand,rev:R.revMo,cost:R.costMo,load:R.load,useT:R.useT,usePni:R.usePni,egDesc:R.egDesc}})";
// Equal states, or which of their fields differ.
const same = (a, b, msg) => { if (a === b) return; const A = JSON.parse(a), B = JSON.parse(b), d = [];
  for (const o of ['S', 'R']) for (const k of new Set([...Object.keys(A[o]), ...Object.keys(B[o])])) if (JSON.stringify(A[o][k]) !== JSON.stringify(B[o][k])) d.push(`${o}.${k}`);
  assert.fail(`${msg}: ${d.join(', ')} differ`); };

test('a day whose routings the worker answers is the day dayTick() plays', (t) => {
  const ref = open(t, 777), p = played(t);
  ref.ev(SETUP);
  // The page itself never routes, the failure on day 3 (failureRun()) and the sales desk's trials (offerTrial())
  // included: they are steps like the others, routed by the worker.
  p.ev('window.__pc=0;window.__tr=0;const c0=compute;compute=function(){__pc++;return c0.apply(this,arguments);};');
  let served = 0, extra = 0;
  for (let i = 0; i < 12; i++) {
    ref.ev('dayTick()');
    p.ev('rwDay()');
    assert.equal(p.ev('!!RW.job'), true, 'the day waits for the worker');
    const n = p.pump(); served += n; if (n > 1) extra++;
    assert.equal(p.ev('!!RW.job'), false);
    same(p.ev(STATE), ref.ev(STATE), `day ${i + 1}`);
  }
  // Each day routes once, and some days again after a failure, an event or the intern's jobs: all in the worker.
  assert.ok(served > 12 && extra > 0, `routings served: ${served}, days with more than one: ${extra}`);
  assert.ok(ref.ev('S.inc.length') > 0 || ref.ev('S.stats.incidents') > 0, 'a failure happened');
  assert.equal(p.ev('__pc'), 0, 'no routing on the page');
  assert.ok(p.trials() > 0, `sales trials the worker ran: ${p.trials()}`);
  assert.ok(p.ev('S.ops.log.some(e=>e.r.some(([k])=>k==="caches"))'), 'the intern racked cache boxes');
  // A frame through before the intern's shift, after each of the orders on duty (decommissioning aside), and after
  // each job of an order (a generator's yields).
  const orders = p.ev('OPS_ORDER.slice(0,-1).filter(k=>S.ops.on[k]).length');
  assert.ok(orders > 3, `orders on duty: ${orders}`);
  assert.ok(p.rests() > 12 * (1 + orders), `each day let a frame through before the shift, between its orders and its jobs: ${p.rests()}`);
  assert.deepEqual([...ref.errors, ...p.errors], []);
});

test('a half day is never saved, and a worker lost mid-day finishes it on the page', (t) => {
  const ref = open(t, 777), p = played(t);
  ref.ev(SETUP);
  ref.ev('dayTick()');
  p.ev("window.__saves=0;const s0=save;save=(...a)=>{if(!RW.job)__saves++;return s0(...a);};rwDay()");
  p.ev('save()');
  assert.equal(p.ev('UI.saveDue'), true, 'saving waits for the end of the day');
  p.ev('rwKill()');
  assert.equal(p.ev('RW.job&&RW.job.rest'), true, 'the day goes on on the page, up to its rest');
  assert.equal(p.pump(), 0, 'with no worker left');
  assert.equal(p.ev('!!RW.job'), false, 'the day is over');
  assert.equal(p.ev('UI.saveDue'), false, 'and saved');
  same(p.ev(STATE), ref.ev(STATE), 'the day');
  assert.deepEqual([...ref.errors, ...p.errors], []);
});

test('an action while the worker routes stands; another network loaded mid-day gets none of that day', (t) => {
  const p = played(t);
  p.ev('rwDay()');
  // The action routes on the page as always: the worker's answer is stale, and the day goes on with the action's R.
  p.ev('after()');
  assert.equal(p.pump() >= 1, true);
  assert.equal(p.ev('!!RW.job'), false);
  assert.equal(p.ev('S.day'), p.ev('S.hist[S.hist.length-1].d'), 'the day was finished');
  // A new game while a day is in flight: the old day's steps never touch it.
  p.ev('rwDay()');
  const day = p.ev('S.day');
  p.ev(`window.__old=S;S=migrate(JSON.parse(${JSON.stringify(BIG)}));compute();`);
  const fresh = p.ev('JSON.stringify(S.hist)');
  p.pump();
  assert.equal(p.ev('JSON.stringify(S.hist)'), fresh);
  assert.equal(p.ev('__old.day'), day);
  assert.deepEqual(p.errors, []);
});

// A sales trial the worker is routing when the player acts (an action routes on the page): its answer was for the game
// as it was, so the trial runs again on the page, on the game as it is now.
test("a sales trial overtaken by the player's action runs again on the page", (t) => {
  const p = played(t);
  p.ev("window.__ot=0;const ot=offerTrial;offerTrial=(...a)=>{__ot++;return ot(...a);};");
  let found = false;
  for (let d = 0; d < 20 && !found; d++) {
    p.ev('rwDay()');
    // Hand the worker one message at a time until a trial is the one waiting.
    for (let k = 0; k < 400 && p.ev('!!RW.job'); k++) {
      if (p.ev('__later.length')) { p.ev('__later.shift()()'); continue; }
      if (!found && p.ev('__q.length&&!!__q[0].trial')) { found = true; p.ev('compute()'); }
      p.pump1();
    }
  }
  assert.ok(found, 'the sales desk trialled an offer');
  assert.equal(p.ev('__ot'), 1, 'the overtaken trial ran on the page');
  assert.deepEqual(p.errors, []);
});

// The rest of what used to route on the page in a day: a DDoS that a failure starts (and Auto-RTBH pulling a plug), an
// event that cuts cables or power, and the chaos monkey's snip. Each is a step the worker routes, and the day is still
// the day dayTick() plays.
test('DDoS, cable and power events and the chaos monkey route in the worker too, and the day stays the same', (t) => {
  // A visiting monkey does the breaking instead of the failures: failures first, then the monkey.
  const MONKEY = 'S.monkey={on:1,start:S.day,until:S.day+60,snip:S.day+1,n:0,hurt:0,c:S.home,next:S.day};';
  const FORCE = `S.ddosAuto={rtbh:true};mkElig=()=>true;S.monkey={on:0,next:S.day+999};S.nextFail=S.day+1;S.nextEvent=S.day+2;
    failureRun=eval('('+failureRun.toString().replace('if(only)type=only;',"type=S.day%2?'ddos':'cut';")+')');
    fireEvent=eval('('+fireEvent.toString().replace('const e=pick(opts);',"const e=['redsea','typhoon','baltic','runet'].find(x=>opts.includes(x))||'redsea';")+')');__reseed(99);`;
  const ref = open(t, 777), p = played(t);
  ref.ev(SETUP); ref.ev(FORCE); p.ev(FORCE);
  // The reference routes an event on the spot, the way it always did (no deferred routing).
  ref.ev('eventRun=function*(){fireEvent();};');
  ref.ev("window.__dd=0;const da=ddosAttack;ddosAttack=(...a)=>{const r=da(...a);if(r)__dd++;return r;};window.__ev=0;const fe=fireEvent;fireEvent=(...a)=>{__ev++;return fe(...a);};");
  p.ev('window.__pc=0;const c0=compute;compute=function(){__pc++;return c0.apply(this,arguments);};');
  for (let i = 0; i < 12; i++) {
    if (i === 6) for (const h of [ref, p]) h.ev(MONKEY);
    for (const h of [ref, p]) h.ev('S.nextFail=S.day+1;S.nextEvent=S.day+1;');
    ref.ev('dayTick()');
    p.ev('rwDay()'); p.pump();
    same(p.ev(STATE), ref.ev(STATE), `day ${i + 1}`);
  }
  assert.ok(ref.ev('__dd') > 0, `DDoS attacks started: ${ref.ev('__dd')}`);
  assert.ok(ref.ev('S.monkey.n') > 0, `the monkey snipped: ${ref.ev('S.monkey.n')}`);
  assert.ok(ref.ev('__ev') > 2, `events: ${ref.ev('__ev')}`);
  assert.equal(p.ev('__pc'), 0, 'no routing on the page');
  assert.deepEqual([...ref.errors, ...p.errors], []);
});

// Quiet notifications keep the day's own news to the NOC log (UI.tick, 95-modals/10-toasts.js). Play goes through the
// worker's steps, not dayTick(): every step of the day is announced as the day's, on both sides of each routing.
test('quiet notifications hold while the worker plays the day', (t) => {
  const p = played(t);
  p.ev("window.__tc=[];const t0=toast;toast=function(m,k){__tc.push(!!UI.tick);return t0.apply(this,arguments);};");
  for (let i = 0; i < 12; i++) { p.ev('rwDay()'); p.pump(); }
  const calls = JSON.parse(p.ev('JSON.stringify(__tc)'));
  assert.ok(calls.length > 0, 'the days had news');
  assert.deepEqual(calls.filter((x) => !x), [], 'every toast of the day came with UI.tick set');
  assert.equal(p.ev('UI.tick'), false, 'and it is off between days');
  assert.deepEqual(p.errors, []);
});

// What the player does while a step waits for the worker: the step goes on with the game as it is by then.
const TICK_ERR = "window.__te=[];tickErr=e=>__te.push(String(e&&e.stack||e));";

test('a customer dropped while a sales trial routes: the trial runs again on the customers left', (t) => {
  const p = played(t);
  p.ev(TICK_ERR);
  p.ev("window.__ot=0;const ot=offerTrial;offerTrial=(...a)=>{__ot++;return ot(...a);};");
  let found = false;
  for (let d = 0; d < 20 && !found; d++) {
    p.ev('rwDay()');
    for (let k = 0; k < 400 && p.ev('!!RW.job'); k++) {
      if (p.ev('__later.length')) { p.ev('__later.shift()()'); continue; }
      // A trial the offer passes, the last customer among the happy ones: that customer goes, and the trial's list of
      // who was happy (indices in S.biz) now points one past the end.
      if (!found && p.ev('__q.length&&!!__q[0].trial&&!!__q[0].trial.hx&&__q[0].trial.hx.includes(S.biz.length-1)&&!!offerTrial(__q[0].trial.b,__q[0].trial.hx)')) {
        found = true; p.ev('__ot=0;const b=S.biz[S.biz.length-1];UI.confirm=b.id;ACT.dropBiz({id:b.id});');
      }
      p.pump1();
    }
  }
  assert.ok(found, 'the desk trialled an offer');
  assert.equal(p.ev('__ot'), 1, 'the overtaken trial ran again on the page');
  assert.equal(p.ev('JSON.stringify(__te)'), '[]');
  assert.equal(p.ev('!!RW.job'), false);
  assert.equal(p.ev('S.day'), p.ev('S.hist[S.hist.length-1].d'), 'the day was finished');
  assert.deepEqual(p.errors, []);
});

test("the intern's PNI round never orders again what the player ordered while it waited", (t) => {
  // The round's batch, then its first rest: the player orders every PNI of the batch by hand meanwhile.
  const ROUND = (hand) => `while(S.day%7!==3)S.day++;S.ops.on.pni=true;
    const pb=pniBatch;pniBatch=(...a)=>window.__b=pb(...a);
    window.__b=null;const X=opsShift(),it=OPS_RUN.pni(X),n0=S.pni.length;let hand=0;
    for(let s=it.next();!s.done;s=it.next())if(__b&&${hand}&&!hand){hand=1;const af=after;after=()=>{};try{for(const q of __b.orders)ACT.pni({city:q.city,net:q.net,tier:q.g1?-1:q.tier});}finally{after=af;}compute();window.__h=S.pni.length;}
    window.__n=S.pni.length-n0;`;
  const key = "S.pni.map(p=>p.city+'|'+p.net)";
  const ref = open(t, 777), p = open(t, 777);
  ref.ev(SETUP); p.ev(SETUP);
  ref.ev(ROUND(false));
  assert.ok(ref.ev('__b.orders.length') > 0 && ref.ev('__n') > 0, `the intern orders PNIs: ${ref.ev('__n')} of ${ref.ev('__b.orders.length')}`);
  p.ev(ROUND(true));
  assert.ok(p.ev('__h') > p.ev('S.pni.length') - p.ev('__n'), 'the player ordered some by hand');
  assert.equal(p.ev('S.pni.length'), p.ev('__h'), 'the intern ordered nothing more');
  const keys = p.ev(key);
  assert.equal(new Set(keys).size, keys.length, 'one PNI per city and network');
  assert.deepEqual([...ref.errors, ...p.errors], []);
});

test('an incident repaired while its routing runs: the failure and the monkey still tell its own story', (t) => {
  const p = open(t, 777);
  p.ev(SETUP);
  // On land: a repair clears the incident (at sea it would charter a ship).
  p.ev("S.rules.sea='timer';S.inc=[];");
  // Repaired before the answer, the only incident there was: nothing left to read as "the last one".
  p.ev(`const g=failureRun('cut');g.next();window.__i=S.inc[S.inc.length-1];ACT.fixInc({id:__i.id});g.next();`);
  assert.equal(p.ev('S.inc.length'), 0);
  assert.equal(p.ev('typeof __i.impact'), 'number', 'its impact is its own');
  // An older incident stands: the new one's impact is not pinned on it.
  p.ev(`runNow(failureRun('cut'));window.__a=S.inc[S.inc.length-1];__a.impact=-7;
    const g2=failureRun('cut');g2.next();window.__b=S.inc[S.inc.length-1];ACT.fixInc({id:__b.id});g2.next();`);
  assert.equal(p.ev('__a!==__b&&S.inc.includes(__a)&&!S.inc.includes(__b)'), true);
  assert.equal(p.ev('__a.impact'), -7, 'the older incident keeps its impact');
  assert.equal(p.ev('typeof __b.impact'), 'number');
  // The monkey's snip, the same way.
  p.ev(`S.monkey={on:1,start:S.day,until:S.day+60,snip:S.day,n:0,hurt:0,c:S.home,next:S.day};
    const g3=mkSnipRun();g3.next();window.__c=S.inc[S.inc.length-1];ACT.fixInc({id:__c.id});g3.next();`);
  assert.equal(p.ev('__a.impact'), -7, 'the older incident keeps its impact');
  assert.equal(p.ev('typeof __c.impact'), 'number');
  assert.deepEqual(p.errors, []);
});
