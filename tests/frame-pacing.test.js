// How long a day may run on the page between two frames (src/game/99-loop.js, rwGo()): half a frame, from 3 to 8 ms.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test("a day's steps follow the screen: half a frame between two, from 3 to 8 ms", () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();UI.speed=0;");
  const run = (hz, n, extra = '') => ev(`(()=>{for(let i=0;i<${n};i++){window.__now=(window.__now||1000)+1000/${hz};${extra};frame(__now);}return RW.budget;})()`);
  assert.equal(run(240, 300), 3, 'a 240 Hz screen');
  const b = run(240, 1, '__now+=250');
  assert.ok(b < 6, `one long frame barely moves it: ${b}`);
  assert.equal(run(60, 300), 8, 'a 60 Hz screen');
  assert.ok(Math.abs(run(120, 300) - 1000 / 120 / 2) < 0.1, 'a 120 Hz screen: half its frame');
  assert.deepEqual(errors, []);
});

// A slow phone draws 20 frames a second: at 8 ms a slice, a big day there waited a 50 ms frame at almost every step and
// played a third slower than before the day was split. It gets half of its own frame, never more than 32 ms.
test("a device that cannot hold 50 frames a second gives a day half its frame, 32 ms at most", () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();UI.speed=0;");
  const run = (hz, n) => ev(`(()=>{for(let i=0;i<${n};i++){window.__now=(window.__now||1000)+1000/${hz};frame(__now);}return RW.budget;})()`);
  assert.equal(run(60, 300), 8, 'a 60 Hz screen keeps 8 ms');
  assert.ok(Math.abs(run(20, 300) - 25) < 0.5, `20 frames a second: half of 50 ms, ${ev('RW.budget')}`);
  assert.equal(run(8, 300), 32, 'never more than 32 ms');
  assert.equal(run(240, 400), 3, 'and back to 3 ms on a fast screen');
  assert.deepEqual(errors, []);
});

// The diverse-paths map new offers ask about (60-requirements.js) is built a millisecond a frame, before the first one
