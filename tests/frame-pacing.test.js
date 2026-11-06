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

// The diverse-paths map new offers ask about (60-requirements.js) is built a millisecond a frame, before the first one
