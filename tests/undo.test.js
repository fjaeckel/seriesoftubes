// Undo instead of "are you sure?": cancelling a transit port or a PNI by hand acts on one tap and a toast offers Undo,
// which puts back exactly what was there while the day has not moved on. Nothing about it is saved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

const game = () => {
  const g = load();
  g.ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'ntt',tier:1});compute();$('toasts').textContent=''");
  return g;
};
const undoBtn = (g) => g.ev("!!document.querySelector('#toasts .toast.undo [data-act=\"undo\"]')");

test('one tap cancels a transit port; Undo puts back the very same port, in its place', () => {
  const g = game(), { ev } = g;
  const before = ev('JSON.stringify([S.transit,S.inc,S.cash])'), id = ev('S.transit[0].id'), served = ev('R.served');
  ev("UI.t0=S.transit[0]");
  ev(`ACT.cancelTransit({id:'${id}'})`);
  assert.equal(ev(`S.transit.some(t=>t.id==='${id}')`), false, 'gone on the first tap');
  assert.ok(undoBtn(g), 'a toast offers Undo');
  assert.match(ev("document.querySelector('#toasts .toast.undo').textContent"), /cancelled/);
  assert.ok(!ev('JSON.stringify(S)').includes('"undo"'), 'nothing about Undo is in the save');
  ev("document.querySelector('#toasts .toast.undo [data-act=\"undo\"]').click()");
  assert.equal(ev('JSON.stringify([S.transit,S.inc,S.cash])'), before, 'exactly as it was');
  assert.equal(ev('S.transit[0]===UI.t0'), true, 'the same object, first in the list again');
  assert.equal(ev('R.served'), served);
  assert.equal(ev('UI.undo'), null);
  assert.equal(undoBtn(g), false, 'the toast is gone');
  assert.deepEqual(g.errors, []);
});

test('a PNI is removed and put back the same way', () => {
  const g = game(), { ev } = g;
  ev("S.pni.push({id:'p1',city:'fra',net:'ggl',tier:1,ready:0,n:1});compute()");
  const before = ev('JSON.stringify(S.pni)');
  ev("ACT.cancelPni({id:'p1'})");
  assert.equal(ev('S.pni.length'), 0);
  ev('ACT.undo()');
  assert.equal(ev('JSON.stringify(S.pni)'), before);
  assert.deepEqual(g.errors, []);
});

test('once the day moves on, Undo is gone; too late is said, nothing comes back', () => {
  const g = game(), { ev } = g;
  const id = ev('S.transit[0].id');
  ev(`ACT.cancelTransit({id:'${id}'})`);
  const u = ev('!!UI.undo');
  assert.ok(u);
  ev('dayTick()');
  ev('ACT.undo()');
  assert.equal(ev(`S.transit.some(t=>t.id==='${id}')`), false);
  assert.equal(ev('UI.undo'), null);
  assert.deepEqual(g.errors, []);
});

test('something else changed since (another port cancelled): the first Undo is replaced, the latest still works', () => {
  const g = game(), { ev } = g;
  const [a, b] = JSON.parse(ev('JSON.stringify(S.transit.map(t=>t.id))'));
  ev(`ACT.cancelTransit({id:'${a}'});ACT.cancelTransit({id:'${b}'})`);
  assert.equal(ev('document.querySelectorAll("#toasts .toast.undo").length'), 1, 'one Undo at a time');
  ev('ACT.undo()');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.transit.map(t=>t.id))')), [b], 'the last one came back');
  // A port bought after the cancel: putting the old list back would lose it, so Undo says it is too late.
  ev(`ACT.cancelTransit({id:'${b}'});ACT.buyTransit({city:'fra',net:'lvl',tier:1});ACT.undo()`);
  assert.equal(ev(`S.transit.some(t=>t.id==='${b}')`), false);
  assert.equal(ev("S.transit.length"), 1, 'the new port stays');
  assert.deepEqual(g.errors, []);
});

test('no Undo with ok (the dashboard asks twice itself; agents), and none when a goal came of it', () => {
  const g = game(), { ev } = g;
  ev("ACT.cancelTransit({id:S.transit[0].id,ok:1})");
  assert.equal(ev('UI.undo||null'), null);
  assert.equal(undoBtn(g), false);
  ev("{const c=checkGoals;checkGoals=()=>{c();S.done.fake=S.day;};}");
  ev("ACT.cancelTransit({id:S.transit[0].id})");
  assert.equal(ev('S.transit.length'), 0, 'it still cancels');
  assert.equal(ev('UI.undo||null'), null, 'but a goal (and its reward) cannot be taken back');
  assert.deepEqual(g.errors, []);
});

test('everything that costs money or loses customers keeps its two taps', () => {
  const g = game(), { ev } = g;
  ev("S.links.push({id:'l1',a:'fra',b:'ams',kind:'wave',km:450,cap:10,mo:900,day:0,ready:0});compute()");
  ev("ACT.rmLink({id:'l1'})");
  assert.equal(ev("S.links.some(l=>l.id==='l1')"), true, 'a link asks first');
  assert.equal(ev('UI.confirm'), 'l1');
  // An exchange port (retention offers, quotes kept), a customer: still two taps, and no Undo on the second.
  const ix = ev("ixIdsIn('fra')[0]");
  ev(`S.ixp['${ix}']=1;compute();UI.confirm=null;ACT.cancelIx({city:'${ix}'})`);
  assert.equal(ev(`S.ixp['${ix}']`), 1, 'an exchange port asks first');
  const B = bigGame(), bid = B.ev("S.biz.find(b=>!BIZ_T[b.type].event).id");
  B.ev(`UI.confirm=null;ACT.dropBiz({id:'${bid}'})`);
  assert.equal(B.ev(`S.biz.some(b=>b.id==='${bid}')`), true, 'a customer asks first');
  B.ev(`ACT.dropBiz({id:'${bid}'})`);
  assert.equal(B.ev(`S.biz.some(b=>b.id==='${bid}')`), false);
  assert.equal(B.ev('UI.undo||null'), null, 'and losing a customer offers no Undo');
  assert.deepEqual(B.errors, []);
  assert.equal(ev("[...UNDO_ACTS].sort().join()"), 'cancelPni,cancelTransit', 'only these two act on one tap');
});

// The whole save, byte for byte: JSON of S before the tap and after Undo are the same string, on a fresh network and on
// the late-game fixture (where a port carries traffic, incidents and goals), for both actions that offer Undo.
const bigGame = () => {
  const g = load();
  g.dom.window.__big = BIG;
  // after() once first: loading the fixture by hand skips the badges a real load would have handed out already.
  g.ev("S=migrate(JSON.parse(window.__big));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();after();$('toasts').textContent=''");
  return g;
};
for (const [name, mk] of [['a fresh network', game], ['the late-game fixture', bigGame]]) {
  test(`Undo gives back the very same save, byte for byte (${name})`, () => {
    const g = mk(), { ev } = g;
    for (const [act, list] of [['cancelTransit', 'transit'], ['cancelPni', 'pni']]) {
      if (list === 'pni' && !ev('S.pni.length')) ev("S.pni.push({id:'p1',city:'fra',net:'ggl',tier:1,ready:0,n:1});compute();after()");
      for (const pick of ['[0]', `[S.${list}.length-1]`]) {
        const before = ev('JSON.stringify(S)'), id = ev(`S.${list}${pick}.id`);
        ev(`ACT.${act}({id:'${id}'})`);
        assert.equal(ev(`S.${list}.some(x=>x.id==='${id}')`), false, `${act}: gone on one tap`);
        assert.notEqual(ev('JSON.stringify(S)'), before);
        assert.ok(undoBtn(g), `${act}: Undo is offered`);
        ev('ACT.undo()');
        assert.equal(ev('JSON.stringify(S)'), before, `${act} ${pick}: S is exactly as it was`);
      }
    }
    assert.deepEqual(g.errors, []);
  });
}

test('nothing about Undo is saved: the stored game after Undo is the stored game before the tap', () => {
  const g = game(), { ev } = g;
  // What save() itself writes each time (a counter and a clock in S.sv and the slot list) is left out; the rest must match.
  const stored = () => JSON.parse(ev("JSON.stringify(Object.keys(localStorage).filter(k=>k.startsWith('sot-save')).map(k=>{const s=JSON.parse(localStorage.getItem(k));delete s.sv;return s;}))"));
  ev('save(true)');
  const before = stored();
  ev('ACT.cancelTransit({id:S.transit[0].id});save(true)');
  assert.ok(ev('!!UI.undo'));
  assert.ok(!JSON.stringify(stored()).includes('undo'), 'the save in the middle knows nothing of Undo');
  assert.notDeepEqual(stored(), before);
  ev('ACT.undo();save(true)');
  assert.deepEqual(stored(), before);
  // A game loaded from that save while Undo was offered: the old Undo does nothing to it.
  ev('ACT.cancelTransit({id:S.transit[0].id})');
  const n = ev('S.transit.length');
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute();ACT.undo()');
  assert.equal(ev('S.transit.length'), n, 'another S (a load): too late');
  assert.deepEqual(g.errors, []);
});

test('an Undo toast is never pushed off by the notices that follow it, even with room for one', () => {
  const g = game(), { ev } = g;
  ev('window.matchMedia=window.matchMedia||(q=>({matches:/coarse/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));window.innerWidth=844;window.innerHeight=390');
  ev('ACT.cancelTransit({id:S.transit[0].id})');
  ev("for(let i=0;i<4;i++)toast('<b>Port running hot</b> '+'abcd'[i],'bad')");
  assert.ok(undoBtn(g), 'Undo still on screen');
  assert.ok(ev('!!UI.undo'));
  ev('ACT.undo()');
  assert.equal(ev('S.transit.length'), 2);
});
