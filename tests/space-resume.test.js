// #299: Space pauses, and Space again plays at the speed you paused, not always at 1×.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;S.cash=1e9";

test('#299 Space resumes at the speed the game ran before the pause', () => {
  const { ev, dom, errors } = load();
  try {
    const space = () => dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    ev(start);
    for (const [key, v] of [['3', 4], ['4', 8], ['0', 0.5], ['2', 2]]) {
      dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
      assert.equal(ev('UI.speed'), v);
      space(); assert.equal(ev('UI.speed'), 0, 'Space pauses');
      space(); assert.equal(ev('UI.speed'), v, `Space plays at ${v}× again`);
    }
    // A speed that came from a loaded game (not from a speed button) comes back too.
    ev('UI.lastSpeed=undefined;setSpeed(4)');
    space(); space(); assert.equal(ev('UI.speed'), 4, 'a loaded game at 4× resumes at 4×');
    // The phone's play button and Space share the speed they come back to.
    ev('ACT.speed({v:8})'); space(); ev('ACT.phonePlay()'); assert.equal(ev('UI.speed'), 8);
    ev('ACT.phonePlay()'); space(); assert.equal(ev('UI.speed'), 8);
    // A window that paused the game for you: Space plays at the speed it stopped.
    ev('UI.lastSpeed=undefined;setSpeed(4);autoPause()'); assert.equal(ev('UI.speed'), 0);
    space(); assert.equal(ev('UI.speed'), 4, 'after a pause the game made itself');
    // Nothing new playing for the first time: 1×.
    ev('UI.lastSpeed=undefined;UI.speed=0'); space(); assert.equal(ev('UI.speed'), 1);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
