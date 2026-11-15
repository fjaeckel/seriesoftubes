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
