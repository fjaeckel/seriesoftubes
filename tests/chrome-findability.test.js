const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.nextFail=1e9;S.nextEvent=1e9";

test('Escape closes the window on top first: a window over the NOC dashboard, then the dashboard, then the city', () => {
  const { ev, dom, errors } = load();
  const w = dom.window, key = k => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  ev(start); ev("selectCity('fra');ACT.dash();ACT.keys()");
  assert.equal(ev("$('dash').hidden"), false); assert.equal(ev("$('modal').hidden"), false);
  key('Escape');
  assert.equal(ev("$('modal').hidden"), true, 'the window on top goes first');
  assert.equal(ev("$('dash').hidden"), false, 'the dashboard under it stays');
  key('Escape'); assert.equal(ev("$('dash').hidden"), true, 'then the dashboard');
  assert.ok(ev("!!UI.sel"), 'the city is still open');
  key('Escape'); assert.equal(ev("UI.sel"), null, 'then the city panel');
  // The same over the bank.
  ev("ACT.bank();ACT.keys()"); key('Escape');
  assert.equal(ev("$('modal').hidden"), true); assert.equal(ev("$('bankBox').hidden"), false);
  key('Escape'); assert.equal(ev("$('bankBox').hidden"), true);
  assert.deepEqual(errors, []);
});

test('another tab of the left panel starts at its top; the daily re-render keeps your place', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.leftTab({t:'nets'});$('leftBody').scrollTop=500;renderLeft()");
  assert.equal(ev("$('leftBody').scrollTop"), 500, 'a re-render does not move the list');
  ev("ACT.leftTab({t:'nets'})"); assert.equal(ev("$('leftBody').scrollTop"), 500, 'nor does the tab you are on');
  ev("ACT.leftTab({t:'noc'})"); assert.equal(ev("$('leftBody').scrollTop"), 0, 'a different tab starts at the top');
  // Phones: the tab bar does the same.
  ev("window.innerWidth=390;renderAll();ACT.phoneTab({t:'nets'});$('leftBody').scrollTop=400;ACT.phoneTab({t:'goals'})");
  assert.equal(ev("$('leftBody').scrollTop"), 0);
  assert.deepEqual(errors, []);
});

test('every button in the HUD says what it is: text, or a tooltip and a name for screen readers', () => {
  const { ev, dom, errors } = load();
  ev(start);
  for (const b of dom.window.document.querySelectorAll('#hud button')) {
    const what = b.id || b.dataset.act + (b.dataset.args || '');
    if (b.querySelector('.lbl')) continue;   // a chip with its own caption
    if (/^\d×$/.test(b.textContent.trim())) continue;   // 1× 2× 4× 8× read as they are
    assert.ok(b.getAttribute('title'), `${what} has a tooltip`);
    assert.ok(b.getAttribute('aria-label'), `${what} has a name`);
  }
  // The speed chip is about time (and the NOC dashboard): How to play, sound and the NOC's own window are menu tiles.
  const sp = [...dom.window.document.querySelectorAll('#hud .speed button')].map(b => b.dataset.act);
  assert.deepEqual([...new Set(sp)], ['speed', 'dash', 'mute']);
  ev("ACT.menu()");
  for (const t of dom.window.document.querySelectorAll('#modalCard .mtile')) assert.ok(t.textContent.trim().length > 2, `${t.dataset.act} tile has a caption`);
  assert.deepEqual(errors, []);
});

test('Find a city: Down and Up move through the results and Enter takes the highlighted one', () => {
  const { ev, dom, errors } = load();
  const w = dom.window;
  ev(start); ev("findOpen()");
  const inp = w.document.getElementById('findIn'), key = k => inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  inp.value = 'germany'; inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  const want = ev("findCities('germany')"), on = () => [...w.document.querySelectorAll('#findList .findrow')].findIndex(r => r.classList.contains('on'));
  assert.ok(want.length > 2); assert.equal(on(), 0, 'the first result is highlighted');
  key('ArrowDown'); key('ArrowDown'); assert.equal(on(), 2);
  key('ArrowUp'); assert.equal(on(), 1);
  key('ArrowUp'); key('ArrowUp'); assert.equal(on(), 0, 'it stops at the top');
  key('ArrowDown'); key('Enter');
  assert.equal(ev("$('modal').hidden"), true);
  assert.equal(ev("UI.sel&&UI.sel.id"), want[1], 'Enter opened the highlighted city');
  // Typing again starts from the first result.
  ev("findOpen()"); const i2 = w.document.getElementById('findIn');
  i2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  i2.value = 'amster'; i2.dispatchEvent(new w.Event('input', { bubbles: true }));
  i2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(ev("UI.sel&&UI.sel.id"), 'ams');
  assert.deepEqual(errors, []);
});

test('the side panels grow on a wide screen, and a crowded HUD can drop its extras before it wraps', () => {
  const { dom, errors } = load();
  const css = [...dom.window.document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert.match(css, /#left\{[^}]*width:clamp\(300px,24vw,420px\)/);
  assert.match(css, /#panel\{[^}]*width:clamp\(370px,25vw,440px\)/);
  assert.match(css, /#hud\.fit5 #hCust\{display:none\}/);
  assert.deepEqual(errors, []);
});
