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

test('a whole category goes off and comes back, with the kinds the level brings later', t => {
  const { ev, errors } = game(t, 'shark');
  ev("ACT.salesAuto();ACT.salesCat({c:'circ'});closeModal()");
  const no = JSON.parse(ev('JSON.stringify(S.slAuto.no)'));
  for (const k of ['l2vpn', 'hft', 'sdwan', 'ai', 'agi', 'mars', 'l3vpn']) assert.ok(no.includes(k), k);
  for (const k of ['dia', 'game', 'event', 'wwave', 'pizza']) assert.ok(!no.includes(k), k);
  offer(ev, 'office'); offer(ev, 'wire', { type: 'l2vpn', city2: 'ams', rate: 9000 });
  ev('slAutoDay(S.day)');
  assert.deepEqual(ids(ev, 'biz'), ['office']);
  assert.deepEqual(ids(ev, 'offers'), ['wire'], 'circuits wait for you');
  // One circuit back on: the category is partly on, so the next press switches it all off again.
  ev("ACT.salesKind({t:'l2vpn'});closeModal()");
  assert.equal(ev("S.slAuto.no.includes('l2vpn')"), false);
  ev("ACT.salesCat({c:'circ'});closeModal()");
  assert.equal(ev("S.slAuto.no.includes('l2vpn')"), true);
  ev("ACT.salesCat({c:'circ'});closeModal()");
  assert.equal(ev("'no' in S.slAuto"), false, 'all off, then all on');
  // All puts every kind back at once.
  ev("ACT.salesCat({c:'game'});ACT.salesKind({t:'dia'});ACT.salesKinds({m:'all'});closeModal()");
  assert.equal(ev("'no' in S.slAuto"), false);
  ev("ACT.salesCat({c:'pirate'});ACT.salesKinds({m:'pirate'});closeModal()");
  assert.equal(ev("'no' in S.slAuto"), false);
  assert.deepEqual(errors, []);
});

test('the sheet on a phone: All by default, Custom fans the kinds out in categories', t => {
  const { ev, dom, errors } = game(t, 'eng');
  dom.window.innerWidth = 360; dom.window.innerHeight = 640;
  const doc = dom.window.document, card = () => doc.getElementById('modalCard');
  const q = (sel) => card().querySelector(sel), qa = (sel) => [...card().querySelectorAll(sel)];
  ev('salesModal()');
  assert.equal(q('[data-act="salesKinds"][data-args*="all"]').getAttribute('aria-pressed'), 'true', 'All is picked');
  assert.equal(qa('[data-act="salesCat"]').length, 0, 'and nothing else is shown');
  assert.equal(qa('[data-act="salesKind"]').length, 0);
  q('[data-act="salesKinds"][data-args*="custom"]').click();
  assert.equal(q('[data-act="salesKinds"][data-args*="custom"]').getAttribute('aria-pressed'), 'true');
  const cats = () => qa('[data-act="salesCat"]').map(b => JSON.parse(b.dataset.args).c);
  // Level 4 without any special offers: no fibre, capacity or orbit yet.
  assert.deepEqual(cats(), ['net', 'circ', 'game', 'event']);
  assert.equal(qa('[data-act="salesKind"]').length, 0, 'kinds stay folded');
  // A wave offer brings its category.
  ev("S.offers.push({id:'w',city:'fra',name:'w',type:'wwave',bw:1,rate:0,reqs:[],exp:60});salesModal()");
  assert.deepEqual(cats(), ['net', 'circ', 'game', 'event', 'cap']);
  q('[data-act="salesCatOpen"][data-args*="circ"]').click();
  const kinds = qa('[data-act="salesKind"]').map(b => JSON.parse(b.dataset.args).t);
  assert.ok(kinds.includes('l2vpn') && kinds.includes('hft') && !kinds.includes('dia'), kinds.join());
  q('[data-act="salesKind"][data-args*="l2vpn"]').click();
  assert.equal(ev('JSON.stringify(S.slAuto.no)'), '["l2vpn"]');
  assert.equal(q('[data-act="salesKind"][data-args*="l2vpn"]').getAttribute('aria-pressed'), 'false', 'still unfolded after the redraw');
  assert.match(q('[data-act="salesCat"][data-args*="circ"]').textContent, /Private circuits: \d+ of \d+/);
  assert.match(q('[data-act="salesCat"][data-args*="net"]').textContent, /Internet access: all/);
  // A category switched off lists only the kinds the level has: cloud gaming (level 8) is off, but not shown.
  q('[data-act="salesCat"][data-args*="game"]').click();
  assert.equal(ev("S.slAuto.no.includes('cgame')"), true);
  assert.match(q('[data-act="salesCatOpen"][data-args*="game"]').textContent, /1 kind$/);
  assert.match(q('[data-act="salesCat"][data-args*="game"]').textContent, /Gaming: none/);
  // A reload with a kind off opens on Custom; All puts everything back and folds the categories away.
  ev('S=migrate(JSON.parse(JSON.stringify(S)));UI.slCust=null;salesModal()');
  assert.equal(q('[data-act="salesKinds"][data-args*="custom"]').getAttribute('aria-pressed'), 'true');
  q('[data-act="salesKinds"][data-args*="all"]').click();
  assert.equal(ev("'no' in S.slAuto"), false);
  assert.equal(qa('[data-act="salesCat"]').length, 0);
  assert.deepEqual(errors, []);
});
