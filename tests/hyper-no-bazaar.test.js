// #501: a Hyperscaler's capacity market stays closed (its own resale desk sells its glass), so the NOC tab must not
// offer a Lambda Bazaar button that does nothing. A carrier with dark fiber still gets it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const df = "S.links.push({id:'df1',a:'fra',b:'par',kind:'df',own:true,sys:'roadm',ch:['zr4'],km:Math.round(kmBetween('fra','par')*1.05),ready:0,day:0,cut:0,mo:100,trench:'own:df1',pairs:1});";
const noc = (ev) => ev("UI.left='noc';renderAll();document.getElementById('left').innerHTML");

test('#501 the NOC tab has no Lambda Bazaar button for a Hyperscaler, even with its own fiber', (t) => {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});" + df + 'compute()');
  assert.equal(ev('hyper()'), true);
  assert.equal(ev("bazNocBtn()"), '');
  assert.doesNotMatch(noc(ev), /data-act="marketOpen"/);
  assert.deepEqual(errors, []);
});

test('#501 a carrier with dark fiber still finds the Lambda Bazaar on the NOC tab', (t) => {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  ev("ACT.start({});for(const g of GOALS)S.done[g.id]=0;S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buildPop({city:'par'});" + df + 'compute()');
  assert.equal(ev('hyper()'), false);
  assert.match(noc(ev), /data-act="marketOpen"/);
  ev('ACT.marketOpen({})');
  assert.equal(ev('bazIsOpen()'), true, 'the button opens the window');
  assert.deepEqual(errors, []);
});
