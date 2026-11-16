const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// The intern grows exchanges you founded: the next fabric when traffic outgrows Headroom, or when every seat is taken and a
// network is waiting to join. A hired intern, no cash floor, no fat fingers (Change Freeze), and your own exchange in Nantes.
const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});ACT.buildPop({city:'nte'});compute()";
function game(t, own = true) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  h.ev("ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal()");
  if (own) h.ev("ACT.foundIx({city:'nte'});compute()");
  return h;
}
const on = (ev, cap) => ev(`S.ops.on.fabric=true;S.ops.p.fabric={x:1.5};${cap === undefined ? '' : `S.ops.cap.fabric=${cap};`}`);
const shift = ev => ev('opsDay(S.day)');
const fab = ev => ev('S.myIx.nte.fab|0');
// Traffic on the exchange, as the day's routing would have left it.
const busy = (ev, g) => ev(`R.useIx=R.useIx||{};R.useIx.nte=${g}`);
const fill = ev => ev('const m=S.myIx.nte;while(m.members.length<myFab("nte").max)m.members.push(myIxCands("nte")[0].id)');

test('the order shows only once you run an exchange, and starts off', t => {
  const A = game(t, false);
  assert.equal(A.ev("opsShow(OPSK.fabric)"), false, 'no exchange of your own: not on the list');
  A.ev("ACT.foundIx({city:'nte'})");
  assert.equal(A.ev("opsShow(OPSK.fabric)"), true);
  assert.equal(A.ev('S.ops.on.fabric'), false);
  A.ev("UI.opsOpen=true;opsModal()");
  assert.match(A.ev("document.body.textContent"), /Grow your exchanges/);
  assert.deepEqual(A.errors, []);
});

test('traffic past Headroom gets the next fabric, at exactly what the click costs', t => {
  const A = game(t), B = game(t);
  on(A.ev); busy(A.ev, 300); // 400G fabric, 300G × 1.5 = 450G wanted
  const a0 = A.ev('S.cash'); shift(A.ev);
  assert.equal(fab(A.ev), 1, 'upgraded to 1.6T');
  const b0 = B.ev('S.cash'); B.ev("ACT.myIxUp({city:'nte'})");
  assert.equal(a0 - A.ev('S.cash'), b0 - B.ev('S.cash'), 'same price as the button');
  assert.ok(a0 - A.ev('S.cash') > 0);
  assert.match(A.ev('opsLine(S.ops.log[0])'), /upgraded the fabric of /);
  assert.match(A.ev('opsLine(S.ops.log[0])'), new RegExp(A.ev('S.myIx.nte.name').replace(/[-]/g, '\\-')));
  // One step a night: 1.6T carries 300G with room to spare, so nothing more.
  shift(A.ev);
  assert.equal(fab(A.ev), 1);
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
});

test('a full exchange with networks at the door grows; a quiet one with seats free does not', t => {
  const A = game(t);
  on(A.ev); busy(A.ev, 10);
  shift(A.ev);
  assert.equal(fab(A.ev), 0, 'quiet, seats free: nothing to do');
  fill(A.ev);
  assert.ok(A.ev('myIxCands("nte").length') > 0, 'someone still wants in');
  shift(A.ev);
  assert.equal(fab(A.ev), 1, 'full: the next fabric opens more seats');
  assert.ok(A.ev('S.myIx.nte.members.length<myFab("nte").max'));
  // Nobody left to join (a quiet corner of the map): a full exchange stays as it is.
  fill(A.ev); A.ev('window.myIxCands0=myIxCands;myIxCands=()=>[]');
  shift(A.ev);
  assert.equal(fab(A.ev), 1, 'no candidates left: no upgrade for seats nobody takes');
  A.ev('myIxCands=window.myIxCands0');
  assert.deepEqual(A.errors, []);
});

test('the budget, the customer level and a flood all hold the intern back', t => {
  const A = game(t);
  on(A.ev, 50000); busy(A.ev, 300);
  shift(A.ev);
  assert.equal(fab(A.ev), 0, 'a $60k fabric is over a $50k month');
  assert.ok(A.ev("S.ops.log[0].r.some(r=>r[0]==='broke'&&r[2].includes('fabric'))"), 'logged as the budget running out');
  on(A.ev, 250000); A.ev("S.myIx.nte.fab=1"); busy(A.ev, 2000);
  A.ev('S.lvl=2;S.done={}');
  assert.equal(A.ev('lvl()'), 2);
  shift(A.ev); assert.equal(fab(A.ev), 1, '6.4T waits for customer level 3');
  A.ev('S.lvl=3;for(const g of GOALS)S.done[g.id]=0');
  A.ev("S.ev.ddos={until:S.day+2}");
  assert.ok(A.ev('ddosAll().length') > 0);
  shift(A.ev); assert.equal(fab(A.ev), 1, 'a flood is not traffic to build for');
  A.ev('S.ev.ddos=null'); shift(A.ev);
  assert.equal(fab(A.ev), 2, 'and once it is over, the busy exchange grows');
  assert.deepEqual(A.errors, []);
});

test('an old save without the order loads with it off, and a member still joins as before', t => {
  const A = game(t);
  const s = JSON.parse(A.ev('JSON.stringify(S)'));
  delete s.ops.on.fabric; delete s.ops.p.fabric; delete s.ops.cap.fabric; delete s.ops.spent.fabric;
  A.ev(`S=${JSON.stringify(s)};sanitize(S);compute()`);
  assert.equal(A.ev('S.ops.on.fabric'), false);
  assert.equal(A.ev('S.ops.spent.fabric'), 0);
  A.ev('S.myIx.nte.next=S.day');
  const n0 = A.ev('S.myIx.nte.members.length');
  A.ev('dayTick()');
  assert.equal(A.ev('S.myIx.nte.members.length'), n0 + 1, 'joining uses the same list of candidates');
  assert.deepEqual(A.errors, []);
});
