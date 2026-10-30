// #200: a forgotten tab with an older game must not overwrite the save a newer tab wrote.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});save(true)");
// Another tab opens the game: it claims the save and writes its own, newer network.
const otherTab = (ev) => ev("localStorage.setItem('sot-save-tab','other-tab');localStorage.setItem('sot-save-v1',JSON.stringify({...JSON.parse(localStorage.getItem('sot-save-v1')),name:'Newer',day:999}))");
const saved = (ev) => ev("JSON.parse(localStorage.getItem('sot-save-v1'))");

test('#200 an older tab stops saving once another tab has opened the game, and says so', () => {
  const { dom, ev, errors } = load();
  start(ev);
  assert.ok(saved(ev).day < 999);
  otherTab(ev);
  ev("S.cash=4242;save()");
  ev("save(true)"); // leaving the page tries too
  assert.equal(saved(ev).name, 'Newer');
  assert.equal(saved(ev).day, 999);
  const modal = dom.window.document.getElementById('modal');
  assert.equal(modal.hidden, false);
  assert.match(modal.textContent, /open in another tab/);
  assert.ok(modal.querySelector('[data-act="tabReload"]'));
  assert.ok(modal.querySelector('[data-act="tabTakeOver"]'));
  // Closing it does not make the tab save again: the next autosave asks again.
  ev("closeModal();UI.lastSave=0;save()");
  assert.equal(saved(ev).name, 'Newer');
  assert.equal(modal.hidden, false);
  assert.deepEqual(errors, []);
});

test('#200 keep playing here takes the save back, and the other tab is the one that stops', () => {
  const { dom, ev, errors } = load();
  start(ev);
  otherTab(ev);
  ev("S.cash=4242;save()");
  assert.equal(saved(ev).day, 999);
  ev("ACT.tabTakeOver()");
  assert.equal(saved(ev).cash, 4242);
  assert.notEqual(ev("localStorage.getItem('sot-save-tab')"), 'other-tab');
  assert.equal(dom.window.document.getElementById('modal').hidden, true);
  ev("S.cash=77;save(true)");
  assert.equal(saved(ev).cash, 77);
  assert.deepEqual(errors, []);
});

test('#200 a tab that opens later loads the newest save and owns it', () => {
  const first = load();
  start(first.ev);
  const storage = { 'sot-save-v1': first.ev("localStorage.getItem('sot-save-v1')"), 'sot-save-tab': 'first-tab', 'sot-tut': '1' };
  const { dom, ev, errors } = load({ storage });
  assert.equal(ev("UI.started"), true);
  assert.notEqual(ev("localStorage.getItem('sot-save-tab')"), 'first-tab');
  ev("S.cash=55;save(true)");
  assert.equal(saved(ev).cash, 55);
  assert.equal(dom.window.document.getElementById('modal').hidden, true);
  assert.deepEqual(errors, []);
});

test('#200 the other-tab warning fits a phone, in Italian too', () => {
  for (const lang of [undefined, 'it']) {
    const { dom, ev, errors } = load(lang ? { lang } : {});
    ev('window.innerWidth=360;window.innerHeight=640');
    start(ev);
    otherTab(ev);
    ev("save()");
    const card = dom.window.document.getElementById('modalCard');
    assert.equal(card.querySelectorAll('button[data-act^="tab"]').length, 2);
    if (lang) assert.doesNotMatch(card.textContent, /open in another tab/);
    assert.doesNotMatch(card.innerHTML, /save\.[a-z_]{6,}/); // no raw labels
    assert.deepEqual(errors, []);
  }
});
