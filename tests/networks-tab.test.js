const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const START = "ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;ACT.launchBB({city:S.home});UI.left='nets';UI.leftOpen=true;ACT.netFilter({f:'all'})";
const names = "[...document.querySelectorAll('#leftBody .netr .nm')].map(e=>e.firstChild.textContent.trim())";

test('the Networks tab finds a network by name or AS number, long tail included', () => {
  const { ev, dom, errors } = load();
  ev(START);
  const doc = dom.window.document;
  assert.ok(doc.getElementById('nlQ'), 'a search box');
  const n = JSON.parse(ev("JSON.stringify((n=>({name:n.name,asn:n.asn}))(NETS.filter(n=>!n.tail&&!n.fed)[60]))"));
  ev(`ACT.nlFind({q:${JSON.stringify(n.name.toLowerCase())}})`);
  assert.ok(JSON.parse(ev(`JSON.stringify(${names})`)).includes(n.name));
  ev(`ACT.nlFind({q:'AS${n.asn}'})`);
  assert.deepEqual(JSON.parse(ev(`JSON.stringify(${names})`)).filter(x => x === n.name), [n.name]);
  const tail = ev("NETS.find(n=>n.tail).name");
  ev(`UI.tailOpen=false;ACT.nlFind({q:${JSON.stringify(tail)}})`);
  assert.ok(JSON.parse(ev(`JSON.stringify(${names})`)).includes(tail), 'a search looks through the long tail');
  ev("ACT.nlFind({q:'zzzzqqqq'})");
  assert.equal(doc.querySelectorAll('#leftBody .netr').length, 0);
  assert.match(doc.querySelector('#leftBody .empty').textContent, new RegExp(ev("tr('pni_list.nothing_matches')")));
  ev("document.querySelector('#leftBody [data-act=nlClear]').click()");
  assert.equal(doc.querySelectorAll('#leftBody .netr').length, 25);
  assert.equal(doc.getElementById('nlQ').value, '');
  assert.deepEqual(errors, []);
});

test('typing in the Networks search keeps the focus and the caret', () => {
  const { ev, dom, errors } = load();
  ev(START);
  const doc = dom.window.document, box = doc.getElementById('nlQ');
  box.focus(); box.value = 'co'; box.setSelectionRange(2, 2);
  box.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(ev('UI.nlQ'), 'co');
  assert.equal(doc.activeElement.id, 'nlQ');
  assert.equal(doc.activeElement.value, 'co');
  ev('UI._lh=null;renderLeft()');
  assert.equal(doc.activeElement.id, 'nlQ', 'the daily re-render leaves the box alone');
  assert.deepEqual(errors, []);
});

test('type chips filter the Networks tab', () => {
  const { ev, dom, errors } = load();
  ev(START + ";ACT.nlType({t:'cdn'})");
  const doc = dom.window.document;
  const tags = [...doc.querySelectorAll('#leftBody .netr .neth .tag')].map(e => e.className);
  assert.ok(tags.length > 0);
  assert.ok(doc.querySelectorAll('#leftBody .netr .neth .tag.cdn').length === doc.querySelectorAll('#leftBody .netr').length);
  assert.equal(doc.querySelector('#leftBody [data-act=nlType][aria-pressed=true]').textContent, ev('TYPE_L.cdn'));
  ev("ACT.nlType({t:'cdn'})");
  assert.equal(ev('UI.nlT'), '');
  assert.ok(doc.querySelector('#leftBody .netr .tag.t1'), 'tapping the chip again shows every type');
  assert.deepEqual(errors, []);
});

test('Networks rows are compact and unfold one at a time; a focused network shows everything', () => {
  const { ev, dom, errors } = load();
  ev(START + ";ACT.buyTransit({city:S.home,net:NETS.find(n=>sellsAt(n,S.home)).id,tier:1});compute();ACT.netFilter({f:'all'})");
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll('#leftBody .netd').length, 0, 'nothing unfolded at first');
  assert.equal(doc.querySelectorAll('#leftBody .netr [data-act=goConn]').length, 0);
  const id = ev('S.transit[0].net'), blurb = ev(`NET['${id}'].blurb`);
  assert.ok(!doc.getElementById('leftBody').textContent.includes(blurb));
  const head = [...doc.querySelectorAll('#leftBody button.neth')].find(b => JSON.parse(b.dataset.args).id === id);
  assert.ok(head.querySelector('.pchip'), 'the connection chip stays on the compact row');
  head.click();
  assert.equal(doc.querySelectorAll('#leftBody .netd').length, 1);
  assert.ok(doc.querySelector('#leftBody .netd').textContent.includes(blurb));
  assert.ok(doc.querySelector('#leftBody .netd [data-act=goConn]'), 'the jump to your transit port');
  const other = ev(`NETS.find(n=>!n.tail&&!n.fed&&n.id!=='${id}').id`);
  ev(`ACT.nlOpen({id:'${other}'})`);
  assert.equal(doc.querySelectorAll('#leftBody .netd').length, 1, 'one at a time');
  assert.equal(doc.querySelector('#leftBody .netr.open button.neth').getAttribute('aria-expanded'), 'true');
  ev(`ACT.nlOpen({id:'${other}'})`);
  assert.equal(doc.querySelectorAll('#leftBody .netd').length, 0, 'a second tap folds it');
  ev(`ACT.netFocus({id:'${id}'})`);
  assert.equal(doc.querySelectorAll('#leftBody .netr').length, 1);
  assert.ok(doc.querySelector('#leftBody .netd').textContent.includes(blurb));
  assert.ok(doc.querySelector('#leftBody .netd [data-act=goConn]'));
  assert.ok(doc.querySelector('#leftBody .netd [data-act=meetGo]'), 'where to meet them');
  dom.window.innerWidth = 360; ev('UI._lh=null;renderAll()');
  assert.ok(doc.getElementById('nlQ'), 'the search box is there on a phone');
  assert.deepEqual(errors, []);
});
