// The sales desk signs only the kinds of deal you let it (#497): a kind switched off is left to the player, neither
// signed nor declined (src/game/60-features/39-sales-auto.js, the fold in 93-ui/58-sales-panel.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Frankfurt with 400G transit, level 4, nothing breaking, Change Freeze (no fat fingers).
const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=4;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');S.offers=[];S.biz=[];" +
  "ACT.launchBB({city:'fra'});S.pops.fra.rgen=3;ACT.buyTransit({city:'fra',net:'lvl',tier:3});compute()";
function game(t, who) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  if (who) h.ev(`ACT.salesHire({id:'${who}'});closeModal()`);
  return h;
}
const offer = (ev, id, extra = {}) => ev(`S.offers.push(${lit({ id, city: 'fra', name: id, type: 'dia', bw: 1, rate: 6000, reqs: [], exp: 60, ...extra })})`);
const ids = (ev, k) => JSON.parse(ev(`JSON.stringify(S.${k}.map(x=>x.id))`));

test('a kind switched off is left to you: the desk neither signs nor declines it, and signs it again once it is back on', t => {
  const { ev, errors } = game(t, 'shark');
  ev("ACT.salesAuto();ACT.salesKind({t:'game'});closeModal()");
  assert.equal(ev('JSON.stringify(S.slAuto.no)'), '["game"]');
  offer(ev, 'office'); offer(ev, 'frag', { type: 'game', rate: 600 });
  ev('slAutoDay(S.day)');
  assert.deepEqual(ids(ev, 'biz'), ['office'], 'the enterprise signs, the game servers do not');
  assert.deepEqual(ids(ev, 'offers'), ['frag'], 'and they still wait for you');
  // Under the minimum, a kind that is off is not declined either: it is yours to answer.
  ev('ACT.salesMin();ACT.salesMin();closeModal()');
  assert.equal(ev('S.slAuto.min'), 5000);
  ev('slAutoDay(S.day)');
  assert.deepEqual(ids(ev, 'offers'), ['frag']);
  assert.equal(ev('S.slAuto.wk.x'), 0, 'nothing declined');
  // Back on: the desk handles it again (here: declined, it pays less than the minimum).
  ev("ACT.salesKind({t:'game'});closeModal()");
  assert.equal(ev("'no' in S.slAuto"), false, 'no list left once every kind is on');
  ev('slAutoDay(S.day)');
  assert.deepEqual(ids(ev, 'offers'), []);
  assert.equal(ev('S.slAuto.wk.x'), 1);
  // By hand, a kind that is off still signs as always.
  ev("ACT.salesKind({t:'dia'});closeModal()");
  offer(ev, 'mine');
  ev('slAutoDay(S.day)');
  assert.deepEqual(ids(ev, 'offers'), ['mine']);
  ev("ACT.accept({id:'mine'})");
  assert.deepEqual(ids(ev, 'biz'), ['office', 'mine']);
  assert.deepEqual(errors, []);
});

test('nobody at the desk: the kinds cannot be changed; an unknown kind is ignored', t => {
  const { ev, errors } = game(t);
  ev("ACT.salesKind({t:'dia'})");
  assert.equal(ev("'no' in S.slAuto"), false);
  ev("ACT.salesHire({id:'eng'});closeModal();ACT.salesKind({t:'pirate'});ACT.salesKind({t:'__proto__'});closeModal()");
  assert.equal(ev("'no' in S.slAuto"), false);
  assert.deepEqual(errors, []);
});

test('saves: the kinds that are off survive a reload, junk is repaired, and an old save loads as before', t => {
  const { ev, errors } = game(t, 'eng');
  ev("ACT.salesKind({t:'l2vpn'});ACT.salesKind({t:'dia'});closeModal();S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('JSON.stringify(S.slAuto.no)'), '["dia","l2vpn"]', 'kept, sorted');
  ev("S.slAuto.no=['game','game','pirate',7,null,'__proto__','dia'];S=migrate(S)");
  assert.equal(ev('JSON.stringify(S.slAuto.no)'), '["dia","game"]');
  ev("S.slAuto.no='dia';S=migrate(S)");
  assert.equal(ev("'no' in S.slAuto"), false);
  ev("S.slAuto.no=[];S=migrate(S)");
  assert.equal(ev("'no' in S.slAuto"), false, 'an empty list is not saved');
  assert.equal(ev('JSON.stringify(slAutoNew())'), '{"on":false,"min":0,"wk":null,"rep":null}', 'a new game signs every kind');
  assert.deepEqual(errors, []);
});

test('the sheet on a phone: a fold with one button per kind, which switches the kind and stays open', t => {
  const { ev, dom, errors } = game(t, 'eng');
  dom.window.innerWidth = 360; dom.window.innerHeight = 640;
  const doc = dom.window.document, card = () => doc.getElementById('modalCard');
  ev("S.offers.push({id:'w',city:'fra',name:'w',type:'wwave',bw:1,rate:0,reqs:[],exp:60})");
  ev('salesModal()');
  const fold = () => card().querySelector('details.sl-kinds');
  assert.ok(fold(), 'the fold is in the sheet');
  assert.equal(fold().open, false, 'folded at first');
  assert.match(fold().querySelector('summary').textContent, /all/);
  const kinds = () => [...card().querySelectorAll('[data-act="salesKind"]')].map(b => JSON.parse(b.dataset.args).t);
  const ks = kinds();
  for (const k of ['dia', 'game', 'host', 'l2vpn', 'isp', 'gpu', 'ai', 'wwave']) assert.ok(ks.includes(k), k);
  for (const k of ['cgame', 'agi', 'pizza', 'pairs', 'provedor']) assert.ok(!ks.includes(k), `${k} is not on offer yet`);
  fold().querySelector('summary').click();
  assert.equal(fold().open, true);
  card().querySelector('[data-act="salesKind"][data-args*="l2vpn"]').click();
  assert.equal(ev('JSON.stringify(S.slAuto.no)'), '["l2vpn"]');
  assert.equal(fold().open, true, 'still open after the redraw');
  const b = card().querySelector('[data-act="salesKind"][data-args*="l2vpn"]');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  assert.match(b.className, /ghost/);
  assert.match(fold().querySelector('summary').textContent, /1 left to you/);
  assert.ok(kinds().includes('l2vpn'), 'a kind that is off stays listed');
  assert.deepEqual(errors, []);
});
