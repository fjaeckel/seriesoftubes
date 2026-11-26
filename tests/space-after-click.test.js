// #381: Space after clicking a button pauses the game, instead of pressing that button again.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#381 Space pauses after a button was clicked, and still presses a button reached with Tab', () => {
  const { ev, dom, errors } = load();
  try {
    const w = dom.window, d = w.document;
    ev("ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;S.cash=1e9;ACT.speed({v:1});renderAll()");
    const b = d.querySelector('#hud [data-act], [data-act]');
    assert.ok(b, 'a button to click');
    const space = t => { const k = new w.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }); t.dispatchEvent(k); return k; };
    // Clicked with the mouse: it keeps focus, and Space pauses instead of pressing it again.
    b.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true }));
    b.focus();
    assert.equal(d.activeElement, b);
    const k = space(b);
    assert.equal(ev('UI.speed'), 0, 'Space paused the game');
    assert.ok(k.defaultPrevented, 'the browser does not press the button too');
    assert.notEqual(d.activeElement, b, 'the clicked button lets go of focus');
    space(d.body); assert.equal(ev('UI.speed'), 1, 'Space plays again');
    // Reached with Tab: Space presses the button, as keyboards expect.
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    b.focus();
    const k2 = space(b);
    assert.equal(ev('UI.speed'), 1, 'Space on a button reached with Tab does not pause');
    assert.ok(!k2.defaultPrevented, 'and the browser presses the button');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('#381 Space pauses after the bank or a window is closed with a click (Chrome focuses clicked buttons)', () => {
  const { ev, dom, errors } = load();
  try {
    const w = dom.window, d = w.document;
    ev("ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;S.cash=1e9;ACT.speed({v:1});renderAll()");
    const space = t => { const k = new w.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }); t.dispatchEvent(k); return k; };
    // Click like Chrome: pointerdown, the button takes focus, then the click.
    const click = b => { b.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true })); b.focus(); b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 })); };
    const opener = d.querySelector('[data-act="bank"]');
    assert.ok(opener, 'a Bank button');
    click(opener);
    assert.equal(d.getElementById('bankBox').hidden, false, 'the bank opened');
    click(d.querySelector('#bankBox [data-act="bankClose"]'));
    assert.equal(d.getElementById('bankBox').hidden, true, 'the bank closed');
    assert.notEqual(d.activeElement, opener, 'a click does not hand focus back to the Bank button');
    assert.ok(!d.getElementById('bankBox').contains(d.activeElement), 'nor leave it on the hidden close button');
    const t = d.activeElement || d.body;
    const k = space(t);
    assert.equal(ev('UI.speed'), 0, 'Space paused the game');
    assert.ok(k.defaultPrevented, 'and pressed no button');
    assert.equal(d.getElementById('bankBox').hidden, true, 'the bank stayed shut');
    space(d.body); assert.equal(ev('UI.speed'), 1, 'Space plays again');
    // A keyboard still gets its place back: Escape closes the bank and focus returns to the Bank button.
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    opener.focus(); ev('ACT.bank()');
    d.getElementById('bankCard').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    assert.equal(d.getElementById('bankBox').hidden, true);
    assert.equal(d.activeElement, opener, 'Escape hands focus back');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
