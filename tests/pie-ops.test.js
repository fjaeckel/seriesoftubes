// The intern's launch order: keeps crusts topped up through the Crusts tab's own quote and queue, within a monthly budget.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A normal game with open gates (real money), a company, a factory, a pad in Singapore and a hired intern.
const BASE = "ACT.start({});S.cash=1e11;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;" +
  "S.rules=makeRules('sandbox');S.rules.preset='freeze';S.mode='normal';for(const c of ['sin','fra'])if(!S.pops[c])ACT.buildPop({city:c});compute()";
const COMPANY = "ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});S.pie.stock=400;compute()";
const HIRE = "ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal()";
function game(t, company = true) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE); if (company) h.ev(COMPANY); h.ev(HIRE);
  return h;
}
const keys = (h) => { h.ev('opsModal()'); return [...h.dom.window.document.querySelectorAll('#modalCard [data-act="opsToggle"]')].map(b => JSON.parse(b.dataset.args).k); };

test('the launch order only shows once the rocket company exists', t => {
  const h = game(t, false);
  assert.ok(!keys(h).includes('pie'), 'no company: no launch order');
  h.ev(COMPANY);
  assert.ok(keys(h).includes('pie'));
  assert.equal(h.ev('S.ops.on.pie'), false, 'off until switched on');
  assert.deepEqual(h.errors, []);
});

test('the intern books launches to a crust, paying exactly what the Crusts tab charges', t => {
  const h = game(t), { ev } = h;
  ev("S.ops.on.pie=true;S.ops.p.pie={cr:'short'};S.ops.cap.pie=0");
  const c0 = ev('S.cash');
  ev('opsDay(S.day)');
  const n = ev('S.pie.q.length');
  assert.ok(n >= 2, 'several launches booked');
  assert.equal(ev("S.pie.q.every(L=>L.cr==='short'&&L.rk==='falcon'&&!L.test)"), true);
  assert.equal(ev('S.pie.q.every(L=>L.day<=S.day+leadDays(PIE_PREP+PIE_OPS_AHEAD))'), true, 'nothing booked months ahead');
  const paid = ev('S.pie.q.reduce((a,L)=>a+L.paid,0)');
  assert.equal(c0 - ev('S.cash'), paid);
  assert.equal(ev('S.ops.spent.pie'), paid, 'booked against the order');
  // The same launches by hand cost the same.
  const B = game(t);
  const b0 = B.ev('S.cash');
  for (let i = 0; i < n; i++) B.ev("ACT.pieLaunch({rk:'falcon',cr:'short'})");
  assert.equal(b0 - B.ev('S.cash'), paid);
  assert.match(ev('opsLine(S.ops.log[0])'), /booked \d+ launches \(Shortcrust/);
  // The next day the pad is booked up: nothing more.
  ev('opsDay(S.day+1)');
  assert.equal(ev('S.pie.q.length'), n);
  assert.deepEqual(h.errors, []); assert.deepEqual(B.errors, []);
});

test('the monthly budget stops it, and a full crust needs nothing', t => {
  const h = game(t), { ev } = h;
  ev("S.ops.on.pie=true;S.ops.p.pie={cr:'short'};S.ops.cap.pie=100e6;opsDay(S.day)");
  assert.equal(ev('S.pie.q.length'), 1, 'one launch fits under 100M');
  assert.equal(ev("JSON.stringify(S.ops.log[0].r.find(x=>x[0]==='broke')[2])"), '["pie"]');
  const B = game(t);
  B.ev("pieCohort('short',CRUSTS.short.full,false);S.ops.on.pie=true;S.ops.p.pie={cr:'short',goal:100};S.ops.cap.pie=0;opsDay(S.day)");
  assert.equal(B.ev('S.pie.q.length'), 0);
  B.ev("S.ops.p.pie.goal=60;S.pie.crusts.short.cohorts=[{n:Math.ceil(CRUSTS.short.full*0.6),day:S.day,las:false}];opsDay(S.day)");
  assert.equal(B.ev('S.pie.q.length'), 0, 'at 60% with a 60% goal');
  assert.deepEqual(h.errors, []); assert.deepEqual(B.errors, []);
});

test('"every crust in use" tops up the crusts that have pies, and renews worn-out ones', t => {
  const h = game(t), { ev } = h;
  ev("S.ops.on.pie=true;S.ops.cap.pie=0;opsDay(S.day)");
  assert.equal(ev('S.pie.q.length'), 0, 'no crust in use yet');
  // A crust baked long ago: its pies are wearing out, so the intern sends more.
  ev("S.pie.crusts.frozen.cohorts=[{n:CRUSTS.frozen.full,day:0,las:false}];S.day=CRUSTS.frozen.life-100;S.pie.pads[0].next=S.day;compute()");
  assert.ok(ev("pieLive('frozen')") < ev('CRUSTS.frozen.full'));
  ev('opsDay(S.day)');
  assert.ok(ev("S.pie.q.length") > 0);
  assert.equal(ev("S.pie.q.every(L=>L.cr==='frozen')"), true);
  assert.deepEqual(h.errors, []);
});

test('saves: junk settings are repaired, an old save loads with the order off', t => {
  const h = game(t), { ev } = h;
  ev("S.ops.p.pie={cr:'pluto',goal:300,rk:'catapult'};S.ops.cap.pie=123;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("opsP('pie','cr')+opsP('pie','goal')+opsP('pie','rk')"), 'all100cheap');
  assert.equal(ev("opsCap('pie')"), 250e6);
  ev("delete S.ops.on.pie;delete S.ops.spent.pie;S.ops.log=[{d:1,i:'kevin',r:[['pie',2,['short','pluto']]]}];S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ops.on.pie'), false);
  assert.equal(ev("JSON.stringify(S.ops.log[0].r[0][2])"), '["short"]');
  assert.deepEqual(h.errors, []);
});
