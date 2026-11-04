const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e8;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1})";

test('an exchange port steps down one size at a time, and stops at the smallest', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.buyIx({city:'fra',tier:1,signed:1})");
  assert.equal(ev("S.ixp.fra"), 1, 'joined at 100G');
  assert.ok(ev("ixPortMo('fra',0)") < ev("ixPortMo('fra',1)"));
  assert.match(ev("ixSection('fra')"), /Downgrade 10G/, 'one button, naming the next size down');
  const cash = ev("S.cash");
  ev("ACT.downIx({city:'fra'})");
  assert.equal(ev("S.ixp.fra"), 0, 'down to 10G');
  assert.ok(ev("S.cash") >= cash - 1e6, 'a downgrade costs nothing up front');
  assert.doesNotMatch(ev("ixSection('fra')"), /Downgrade/, 'nothing below the smallest port');
  ev("ACT.downIx({city:'fra'})");
  assert.equal(ev("S.ixp.fra"), 0, 'the smallest port stays');
  ev("ACT.downIx({city:'ams'})");
  assert.equal(ev("S.ixp.ams"), undefined, 'a port you do not have stays that way');
  ev("compute()");
  assert.ok(ev("ixCap('fra')") <= 10 * ev("(S.ixn||{}).fra||1"), 'capacity follows the smaller port');
  assert.deepEqual(errors, []);
});

test('a transit port steps down one size at a time, with a button naming the next size down', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.pops.fra.rgen=3;ACT.buyTransit({city:'fra',net:'cog',tier:2})");
  const id = ev("S.transit.find(t=>t.net==='cog'&&t.city==='fra').id");
  assert.equal(ev("S.transit.find(t=>t.id==='" + id + "').tier"), 2);
  ev("UI.tab='up'");
  assert.match(ev("cityPanel('fra')"), /Downgrade 100G/, 'one button, naming the next size down');
  ev(`ACT.downT({id:'${id}'})`);
  assert.equal(ev(`S.transit.find(t=>t.id==='${id}').tier`), 1, 'down one size');
  ev(`ACT.downT({id:'${id}'})`);
  assert.equal(ev(`S.transit.find(t=>t.id==='${id}').tier`), 0, 'and one more');
  ev(`ACT.downT({id:'${id}'})`);
  assert.equal(ev(`S.transit.find(t=>t.id==='${id}').tier`), 0, 'the smallest port stays');
  ev("ACT.downT({id:'nope'})");
  assert.deepEqual(errors, []);
});

test('a PNI steps down one size at a time, but not while an augment is on order', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.pops.fra.rgen=3;S.pni.push({id:'pt1',net:'cog',city:'fra',tier:2});UI.tab='peer';compute()");
  assert.match(ev("cityPanel('fra')"), /Downgrade 100G/, 'one button, naming the next size down');
  ev("ACT.downP({id:'pt1'})");
  assert.equal(ev("S.pni.find(p=>p.id==='pt1').tier"), 1, 'down one size');
  ev("S.pni.find(p=>p.id==='pt1').up={tier:1,n:2,ready:S.day+30};ACT.downP({id:'pt1'})");
  assert.equal(ev("S.pni.find(p=>p.id==='pt1').tier"), 1, 'an augment on order blocks it');
  ev("S.pni.find(p=>p.id==='pt1').up=null;ACT.downP({id:'pt1'})");
  assert.equal(ev("pniMin('cog')"), 1, 'Cogentle, a Tier 1, sells no 10G PNIs');
  assert.equal(ev("S.pni.find(p=>p.id==='pt1').tier"), 1, 'so its PNI stops at 100G');
  assert.doesNotMatch(ev("cityPanel('fra')"), /Downgrade 10G/, 'and offers no 10G step');
  ev("S.pni.push({id:'pt2',net:'cmc',city:'fra',tier:0});ACT.downP({id:'pt2'})");
  assert.equal(ev("S.pni.find(p=>p.id==='pt2').tier"), 0, 'the smallest port stays');
  ev("S.pni.find(p=>p.id==='pt1').tier=1;S.pni.find(p=>p.id==='pt1').ready=S.day+9;ACT.downP({id:'pt1'})");
  assert.equal(ev("S.pni.find(p=>p.id==='pt1').tier"), 1, 'a PNI that is not up yet stays');
  assert.deepEqual(errors, []);
});
