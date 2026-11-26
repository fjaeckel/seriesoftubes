// #490: an AI run offer that two things block said only the first; fixing it showed the next. Every reason shows at once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(t) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;S.hs.rg.par={t:0,ready:0,mw:5};S.hs.rg.fra.t=0;" +
    "S.hs.jo.push({id:'j1',n:'Overfit and Sons',a:'fra',b:'par',g:12800,wk:6,tb:12800*TB_DAY*42,fee:5000000,exp:S.day+20});compute()");
  return h;
}

test('#490 an AI run lists every region short of slots and power, on the card and in the refusal', (t) => {
  const { ev, dom, errors } = net(t);
  // no power to spare anywhere either
  ev('hsMwFree=()=>0');
  const why = ev("hsTrainWhy('fra','par',12800)");
  for (const re of [/Frankfurt needs 16 free compute slots/, /Paris needs 16 free compute slots/, /Frankfurt has no \d+ MW/, /Paris has no \d+ MW/]) assert.match(why, re);
  ev("ACT.hsJobTake({id:'j1'})");
  assert.equal(ev('S.hs.jobs.length'), 0, 'still refused');
  assert.match(ev("document.getElementById('toasts').textContent"), /Paris has no \d+ MW/, 'the refusal names every reason');
  // on a phone, each reason on its own line in the offer
  ev("window.innerWidth=360;renderAll()");
  const row = ev("hsOfferRow(S.hs.jo[0])");
  const d = dom.window.document.createElement('div'); d.innerHTML = row;
  const w = d.querySelector('.why');
  assert.ok(w, 'the offer says why');
  assert.equal(w.querySelectorAll('br').length, 3, 'four reasons, one per line');
  // one reason fixed: the rest stay
  ev('S.hs.rg.fra.t=S.hs.rg.par.t=3');
  assert.doesNotMatch(ev("hsTrainWhy('fra','par',12800)"), /compute slots/);
  assert.match(ev("hsTrainWhy('fra','par',12800)"), /Frankfurt has no \d+ MW.*Paris has no \d+ MW/);
  ev('hsMwFree=()=>1e6');
  assert.equal(ev("hsTrainWhy('fra','par',12800)"), '', 'nothing in the way, nothing said');
  assert.deepEqual(errors, []);
});
