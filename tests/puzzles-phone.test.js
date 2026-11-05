// Puzzles on a phone are fixed overlays that never scroll: a bar pinned at the top with the puzzle's state, the one
// thing to do and a chip per flow; a city or a link opens a card at the bottom split into tabs. Architect runs get the
// same bar. A desktop keeps the side card.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const phone = (ev, w = 360, h = 740) => ev(`innerWidth=${w};innerHeight=${h};dispatchEvent(new Event('resize'))`);
const q = (dom, s) => dom.window.document.querySelector(s);
const qa = (dom, s) => [...dom.window.document.querySelectorAll(s)];

test('the bar: name, three stars, the money, undo and the menu; the goal to work on; a chip per flow', () => {
  const { ev, dom, errors } = load();
  phone(ev);
  ev("pzBegin(pzDef('baltic'))");
  const box = q(dom, '#pzBox');
  assert.ok(box.classList.contains('dock'));
  assert.equal(qa(dom, '#pzBox .pzd-bar .pzd-st').length, 3, 'three stars');
  assert.ok(q(dom, '#pzBox .pzd-bar [data-act="pzUndo"]') && q(dom, '#pzBox .pzd-bar [data-act="puzzleMenu"]'));
  assert.match(q(dom, '#pzBox .pzd-bar .pzd-bud').textContent, /\$/, 'the money');
  assert.equal(qa(dom, '#pzBox .pzd-st.cur').length, 1, 'the goal being worked on is marked');
  assert.ok(q(dom, '#pzBox .pzd-goal [data-act="pzLook"]'), 'Show me');
  const flows = ev('S.pz.dem.length');
  assert.equal(qa(dom, '#pzBox .pzd-chips [data-act="pzCity"]').length, flows, 'one chip per flow');
  assert.ok(qa(dom, '#pzBox .pzd-chip.none').length > 0, 'nothing built: the chips say nothing arrives');
  assert.equal(q(dom, '#pzBox .pztop'), null, 'not the desktop card');
  assert.deepEqual(errors, []);
});

test('a chip opens its city’s card; the card’s tabs switch, and the choice is kept for the next city', () => {
  const { ev, dom, errors } = load();
  phone(ev);
  ev("pzBegin(pzDef('baltic'));ACT.pzPop({city:'fra'})");
  const c = ev("S.pz.dem[0].a");
  ev(`document.querySelector('#pzBox [data-act="pzCity"]').click()`);
  assert.equal(ev("UI.sel&&UI.sel.id"), c, 'the chip picked its city');
  ev("selectCity('fra')");
  const tabs = qa(dom, '#panelBody .pzd-tabs button').map((b) => b.dataset.args);
  assert.ok(tabs.length >= 2, 'tabs');
  assert.ok(q(dom, '#panelBody [data-act="pzLinkTo"]'), 'Links first: where to lease a wave');
  assert.equal(q(dom, '#panelBody .pzd-models'), null, 'the models wait in their own tab');
  ev(`document.querySelector('#panelBody .pzd-tabs button:nth-child(2)').click()`);
  assert.equal(qa(dom, '#panelBody .pzd-model').length, ev('PZ_RG.length'), 'every router model, in a grid');
  assert.equal(q(dom, '#panelBody [data-act="pzLinkTo"]'), null);
  ev("ACT.pzPop({city:'tll'});selectCity('tll')");
  assert.ok(q(dom, '#panelBody .pzd-models'), 'the next city opens on the same tab');
  ev("ACT.pzTab({k:'city',t:'nonsense'})");
  assert.ok(q(dom, '#panelBody [data-act="pzLinkTo"]'), 'an unknown tab falls back to Links');
  assert.deepEqual(errors, []);
});

test('a link’s card: sizes first, then what it carries, then its routing', () => {
  const { ev, dom, errors } = load();
  phone(ev);
  ev("pzBegin(pzDef('baltic'));ACT.pzPop({city:'fra'});ACT.pzLinkTo({a:'fra',b:'tll'});ACT.pzLink({tier:1});closeModal();selectLink(S.links[0].id)");
  assert.equal(qa(dom, '#panelBody .pzd-tiers [data-act="pzTier"]').length, ev('PZ_TIERS.length'));
  assert.ok(q(dom, '#panelBody [data-act="pzRmLink"]'));
  ev("ACT.pzTab({k:'link',t:'routing'})");
  assert.ok(q(dom, '#panelBody .pzd-routing [data-act="setMetric"]'), 'the metric buttons');
  assert.equal(q(dom, '#panelBody .pzd-tiers'), null);
  ev("ACT.pzTab({k:'link',t:'traffic'})");
  assert.match(q(dom, '#panelBody').textContent, /Gbps/);
  assert.deepEqual(errors, []);
});

test('nothing on a phone scrolls by design: the bar and the card’s body have no scroll of their own', () => {
  const { ev, errors } = load();
  const rules = JSON.parse(ev(`JSON.stringify([...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.media&&/max-width: ?760px/.test(r.media.mediaText))
    .flatMap(m=>[...m.cssRules]).map(r=>({sel:r.selectorText||'',ov:r.style.getPropertyValue('overflow')+r.style.getPropertyValue('overflow-y'),mh:r.style.getPropertyValue('max-height')})))`));
  const dock = rules.find((r) => r.sel === '#pzBox.dock');
  assert.ok(dock && dock.ov === 'visible' && dock.mh === 'none', 'the bar is as tall as it needs, never a scroll box');
  assert.ok(!rules.some((r) => /pzd-/.test(r.sel) && /auto|scroll/.test(r.ov)), 'no part of the bar or the cards scrolls');
  assert.deepEqual(errors, []);
});

test('Reset moves to the menu on a phone; the desktop keeps its own', () => {
  const { ev, dom, errors } = load();
  phone(ev);
  ev("pzBegin(pzDef('baltic'));ACT.pzPop({city:'fra'});ACT.puzzleMenu()");
  assert.ok(q(dom, '#modalCard [data-act="pzReset"]'), 'in the menu');
  ev(`document.querySelector('#modalCard [data-act="pzReset"]').click()`);
  assert.equal(ev('Object.keys(S.pops).length'), 0, 'it resets');
  assert.equal(q(dom, '#modal').hidden, true, 'and closes the menu');
  const d = load();
  d.ev("innerWidth=1280;innerHeight=800;dispatchEvent(new Event('resize'));pzBegin(pzDef('baltic'));ACT.puzzleMenu()");
  assert.equal(d.dom.window.document.querySelector('#modalCard [data-act="pzReset"]'), null, 'not in the desktop menu');
  assert.ok(d.dom.window.document.querySelector('#pzBox .pzfoot [data-act="pzReset"]'), 'it is on the card');
  assert.deepEqual(errors, []);
});

test('an architect run gets the same bar: its brief, the sites as chips and the review with its button', () => {
  const { ev, dom, errors } = load();
  phone(ev);
  ev('ACT.pzArStart({id:AR_RUNS[0].id});closeModal()');
  assert.ok(q(dom, '#pzBox').classList.contains('dock'));
  assert.ok(q(dom, '#pzBox .pzd-bar [data-act="puzzleMenu"]'));
  assert.ok(q(dom, '#pzBox .arbrief').textContent.length > 10, 'the brief');
  assert.ok(qa(dom, '#pzBox .arsite').length >= 2, 'the sites');
  assert.ok(q(dom, '#pzBox .pzd-goal [data-act="pzArGo"]'), 'the review and its button');
  assert.deepEqual(errors, []);
});

test('turning a tablet-sized window into a phone redraws the puzzle in the bar, and back', () => {
  const { ev, dom, errors } = load();
  ev("innerWidth=1280;innerHeight=800;dispatchEvent(new Event('resize'));pzBegin(pzDef('baltic'))");
  assert.equal(q(dom, '#pzBox').classList.contains('dock'), false);
  phone(ev);
  assert.equal(q(dom, '#pzBox').classList.contains('dock'), true);
  ev("innerWidth=1280;innerHeight=800;dispatchEvent(new Event('resize'))");
  assert.equal(q(dom, '#pzBox').classList.contains('dock'), false);
  assert.deepEqual(errors, []);
});
