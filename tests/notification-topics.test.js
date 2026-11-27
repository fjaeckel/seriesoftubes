// #498 and #443: what the day announces has a topic, and each topic pops up all of it, only trouble and milestones, or
// nothing (the NOC log keeps it). Everything and Quiet set every topic at once, a topic can be set by hand, trouble in a
// topic can stop the clock, and a toast can send its own topic to the log. What the player's own taps say always shows.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const game = (opts = {}) => {
  const g = load(opts);
  g.ev("ACT.start({});UI.speed=0;closeModal();S.cash=1e7;S.log=[];$('toasts').textContent=''");
  return g;
};
const shown = (g) => g.ev("$('toasts').textContent");
const clear = (g) => g.ev("$('toasts').textContent='';S.log=[]");
// A notice from the day, about topic c.
const day = (g, c, html, kind = '', actions = '[]') => g.ev(`UI.tick=true;try{ntc('${c}',${JSON.stringify(html)},'${kind}',${actions})}finally{UI.tick=false}`);

test('settings from before topics carry over: quiet becomes the Quiet preset, the pause switches pause their topics', () => {
  const g = load({ storage: { 'sot-prefs': JSON.stringify({ quiet: true, pauseFurious: false, pauseIncident: true, warnUnhappy: false }) } });
  assert.equal(g.ev('ncPreset()'), 'quiet');
  assert.equal(g.ev("ncPause('cust')"), false);
  assert.equal(g.ev("ncPause('inc')"), true);
  assert.equal(g.ev("pref('warnUnhappy')"), false, 'the rest stays');
  assert.deepEqual(JSON.parse(g.ev("localStorage.getItem('sot-prefs')")), { warnUnhappy: false, np: 'quiet', npz: { cust: false, inc: true } });
  // Junk from storage is ignored, never trusted.
  const j = load({ storage: { 'sot-prefs': JSON.stringify({ np: 'loud', nc: { money: 7, conf: '0', constructor: 1 }, npz: { inc: 'yes' } }) } });
  j.ev("ACT.start({})");
  assert.equal(j.ev('ncPreset()'), 'all');
  assert.equal(j.ev("ncLevel('money')"), 2);
  assert.equal(j.ev("ncLevel('conf')"), 2);
  assert.equal(j.ev("ncPause('inc')"), false);
  assert.deepEqual(g.errors.concat(j.errors), []);
});

test('Quiet: loan offers and conference reminders stay in the log, trouble, milestones and deals pop up (#498)', () => {
  const g = game();
  g.ev("ACT.ncSet({v:'p:quiet'})");
  clear(g);
  // A real loan offer, as the bank's day sends it.
  g.ev("UI.tick=true;try{catDo('money',()=>spawnLoanOffer(false))}finally{UI.tick=false}");
  assert.doesNotMatch(shown(g), /would like to lend you/, 'no loan offer pops up');
  assert.ok(g.ev("S.log.some(e=>/would like to lend you/.test(e.t))"), 'it is in the NOC log');
  assert.equal(g.ev('S.loanOffers.length'), 1, 'and the offer is still there in the bank');
  // A real conference reminder, 30 days out.
  g.ev("(()=>{const cf=CONFS.find(c=>!c.cap),d=confDay(cf,0);S.day=d-30;UI.tick=true;try{catDo('conf',()=>confTick(d-30))}finally{UI.tick=false}})()");
  assert.doesNotMatch(shown(g), /in 30 days/);
  assert.ok(g.ev("S.log.some(e=>/in 30 days/.test(e.t))"));
  day(g, 'world', 'Golden Week! Demand is up.');
  assert.doesNotMatch(shown(g), /Golden Week/);
  day(g, 'world', 'Sanctions!', 'bad');
  assert.match(shown(g), /Sanctions/, 'trouble pops up');
  day(g, 'goal', 'Level 3!', 'goal');
  assert.match(shown(g), /Level 3/, 'milestones pop up');
  day(g, 'deals', 'A consortium is selling seats on a new cable.', 'goal');
  assert.match(shown(g), /consortium is selling seats/, 'deals pop up');
  // What the player's own taps say always shows.
  g.ev("ncSetLevel('money',0);toast('You paid the bank','good')");
  assert.match(shown(g), /You paid the bank/);
  assert.deepEqual(g.errors, []);
});

test('#443 construction delays: news, not trouble; Quiet keeps them in the log, Everything pops them up', () => {
  const g = game();
  const delay = () => g.ev(`(()=>{const l={id:'x1',kind:'df',own:true,a:'fra',b:'par',ready:S.day+30,sub:false};S.links.push(l);const r=Math.random;
    Math.random=()=>0.001;UI.tick=true;try{const g0=dayPost(S.day);for(let s=g0.next();!s.done;s=g0.next())if(s.value!==DAY_REST)compute();}finally{UI.tick=false;Math.random=r;S.links=S.links.filter(x=>x!==l);}
    return S.log.find(e=>/Construction delay/.test(e.t))?.k??'none'})()`);
  g.ev("ACT.ncSet({v:'p:all'});compute()");
  const k = delay();
  assert.notEqual(k, 'none', 'the day announced a delay');
  assert.equal(k, '', 'as plain news, not as trouble');
  assert.match(shown(g), /Construction delay/, 'Everything: it pops up');
  clear(g);
  g.ev("ACT.ncSet({v:'p:quiet'})");
  delay();
  assert.doesNotMatch(shown(g), /Construction delay/, 'Quiet: only in the log');
  assert.ok(g.ev("S.log.some(e=>/Construction delay/.test(e.t))"));
  assert.deepEqual(g.errors, []);
});

test('a topic set by hand overrides the preset; picking a preset again sets every topic', () => {
  const g = game();
  g.ev("ACT.ncSet({v:'p:all'});ACT.ncSet({v:'c:build:0'})");
  assert.equal(g.ev('ncCustom()'), true);
  day(g, 'build', 'Your fiber is finished', 'goal');
  assert.doesNotMatch(shown(g), /fiber is finished/, 'Log only: not even a milestone');
  day(g, 'peer', 'A network joined your exchange');
  assert.match(shown(g), /joined your exchange/, 'the other topics as the preset has them');
  g.ev("ACT.ncSet({v:'c:build:1'})");
  clear(g);
  day(g, 'build', 'Your fiber is finished', 'goal');
  assert.match(shown(g), /fiber is finished/, 'Important: milestones and trouble');
  g.ev("ACT.ncSet({v:'p:all'})");
  assert.equal(g.ev('ncCustom()'), false);
  assert.equal(g.ev("ncLevel('build')"), 2);
  assert.deepEqual(g.errors, []);
});

test('trouble in a paused topic stops the clock, says so, and offers Resume; customers pause by default', () => {
  const g = game();
  assert.equal(g.ev("ncPause('cust')"), true);
  assert.equal(g.ev("ncPause('inc')"), false);
  g.ev('UI.speed=2');
  day(g, 'inc', 'Fiber cut', 'bad');
  assert.equal(g.ev('UI.speed'), 2, 'outages do not pause unless asked');
  day(g, 'cust', 'Kilobyte Kebab is furious', 'bad');
  assert.equal(g.ev('UI.speed'), 0, 'a furious customer does');
  assert.match(shown(g), /Game paused/);
  assert.ok(g.ev(`!!document.querySelector('#toasts .toast:not(.tq) [data-act="speed"]')`), 'with Resume on the toast');
  // Any topic can pause, even one that only logs: the toast that stopped the clock shows.
  g.ev("ACT.ncSet({v:'c:world:0'});ACT.ncSet({v:'z:world'});UI.speed=1");
  clear(g);
  day(g, 'world', 'Sanctions!', 'bad');
  assert.equal(g.ev('UI.speed'), 0);
  assert.match(shown(g), /Sanctions/);
  // Good news never pauses.
  g.ev('UI.speed=1');
  day(g, 'world', 'Grant: +$30k', 'good');
  assert.equal(g.ev('UI.speed'), 1);
  assert.deepEqual(g.errors, []);
});

test('🔕 on a toast from the day sends its topic to the log, puts its toasts away, and Undo puts it back', () => {
  const g = game();
  g.ev("ACT.ncSet({v:'p:all'})");
  g.ev("toast('You clicked something','good')");
  assert.equal(g.ev("document.querySelectorAll('#toasts .tmute').length"), 0, 'what a tap says has no 🔕');
  clear(g);
  day(g, 'conf', 'NANOG comes to Chicago in 30 days.');
  day(g, 'conf', 'RIPE comes to Prague in 30 days.');
  day(g, 'peer', 'A network joined your exchange');
  assert.equal(g.ev("document.querySelector('#toasts .toast:not(.tq) .tmute').getAttribute('aria-label')"), 'Only log these from now on: Conferences');
  g.ev("document.querySelector('#toasts .toast:not(.tq) .tmute').click()");
  assert.equal(g.ev("ncLevel('conf')"), 0);
  assert.doesNotMatch(shown(g), /NANOG|RIPE/, 'both conference toasts went');
  assert.match(shown(g), /Conferences<\/b>|Conferences now only go to the NOC log/);
  day(g, 'conf', 'DENOG comes to Frankfurt in 30 days.');
  assert.doesNotMatch(shown(g), /DENOG/);
  g.ev(`[...document.querySelectorAll('#toasts .toast [data-act="ncSet"]')].find(b=>/Undo/.test(b.textContent)).click()`);
  assert.equal(g.ev("ncLevel('conf')"), 2, 'Undo puts the topic back');
  assert.match(shown(g), /joined your exchange/, 'the other topic was never touched');
  assert.deepEqual(g.errors, []);
});

test('Settings: the preset, and every topic on its own line at 360 px with its pause switch', () => {
  const g = game();
  g.ev("window.innerWidth=360;window.innerHeight=640;ACT.settings({})");
  const n = (sel) => g.ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  assert.equal(n('#modal .setline.nct'), 0, 'topics folded away at first');
  g.ev(`document.querySelector('#modal [data-act="ncSet"][data-args*=\\'"f"\\']').click()`);
  assert.equal(n('#modal .setline.nct'), g.ev('NCATS.length'));
  for (const l of JSON.parse(g.ev("JSON.stringify([...document.querySelectorAll('#modal .setline.nct')].map(l=>[l.children.length,l.querySelectorAll('.seg .b').length]))")))
    assert.deepEqual(l, [2, 4], 'a label, then one control: three levels and ⏸');
  g.ev(`document.querySelector('#modal [data-act="ncSet"][data-args*=\\'"c:money:0"\\']').click()`);
  assert.equal(g.ev("ncLevel('money')"), 0);
  assert.ok(g.ev(`document.querySelector('#modal [data-act="ncSet"][data-args*=\\'"c:money:0"\\']').classList.contains('pink')`), 'the line shows what is on');
  assert.match(g.ev("$('modal').textContent"), /Custom: you set some topics yourself/);
  g.ev(`document.querySelector('#modal [data-act="ncSet"][data-args*=\\'"z:inc"\\']').click()`);
  assert.equal(g.ev("ncPause('inc')"), true);
  assert.equal(g.ev(`document.querySelector('#modal [data-act="ncSet"][data-args*=\\'"z:inc"\\']').getAttribute('aria-pressed')`), 'true');
  assert.equal(g.ev('UI.setOpen&&!$("modal").hidden'), true, 'Settings stay open');
  assert.deepEqual(g.errors, []);
});

test('a whole day of a big network: every notice the day sends has a topic', () => {
  const g = game();
  g.ev("ACT.launchBB({city:'fra'});S.cash=-5000;compute();window.__c=[];const __o=toast;toast=function(h,k){if(UI.tick)__c.push(NCAT||'other');return __o.apply(this,arguments)}");
  for (let i = 0; i < 120; i++) g.ev('dayTick()');
  const cs = JSON.parse(g.ev('JSON.stringify(__c)'));
  assert.ok(cs.length > 5, 'the day had things to say');
  assert.deepEqual(cs.filter((c) => c === 'other'), [], 'none left without a topic');
  assert.ok(cs.includes('money'), 'being in the red is about money');
  assert.deepEqual(g.errors, []);
});
