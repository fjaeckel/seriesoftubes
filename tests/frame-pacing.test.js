// The map's frame pacing (src/game/99-loop.js, mapStill()): while only the animation clock moves, the map is drawn at
// most 30 times a second; anything else that moves gets every frame; paused, it is drawn about once a second.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A second of frames at 60 Hz (each() runs before every frame), and how many of them drew the map.
const second = (ev, each = '') => ev(`(()=>{let n=0;const d=draw;draw=t=>{n++;return d(t);};
  try{for(let i=0;i<60;i++){window.__now=(window.__now||1000)+1000/60;${each};frame(__now);}}finally{draw=d;}return n;})()`);

test('ambient frames are drawn at most 30 times a second, the camera moving gets them all, paused about one', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;ACT.launchBB({city:'fra'});closeModal();UI.anim='on';UI.speed=1;autoPause=()=>false;");
  second(ev);  // the land picture and the first frames settle
  const ambient = second(ev);
  assert.ok(ambient >= 28 && ambient <= 31, `ambient: ${ambient} draws`);
  assert.equal(second(ev, 'cam.x+=0.5'), 60, 'the camera moving');
  assert.equal(second(ev, "UI.hover=UI.hover==='fra'?null:'fra'"), 60, 'the pointer over a city and off it');
  ev('UI.speed=0');
  second(ev);
  const paused = second(ev);
  assert.ok(paused <= 2, `paused: ${paused} draws`);
  ev("UI.anim='off';UI.speed=1");
  second(ev);
  assert.ok(second(ev) <= 2, 'animations off: nothing moves, nothing to draw');
  assert.deepEqual(errors, []);
});

// A day's steps on the page take half a frame at most before letting one through (RW.budget, rwGo()): 8 ms on a 60 Hz
// screen, 3 ms on a 240 Hz one. One long frame (a big save, a tab switch) does not move it much.
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
// asks: the very map one go would build. One that asks halfway finishes it at once.
test('idle frames build the diverse-paths map in slices, the same map as in one go', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();UI.speed=0;");
  const sig = "JSON.stringify([diversityMap.key,diversityMap.links,diversityMap.adj])";
  ev('diversityMap=null;DIVW=null;diversityPossible("fra","ams");');
  const once = ev(sig);
  ev('diversityMap=null;DIVW=null;');
  let frames = 0;
  for (; frames < 2000 && ev('!diversityMap'); frames++) ev('window.__now=(window.__now||1000)+4;diversityWarm(0.05);');
  assert.ok(frames > 3, `built over several frames: ${frames}`);
  assert.equal(ev(sig), once, 'the same map');
  // Halfway, an offer asks: the rest is built at once, and it is still the same map.
  ev('diversityMap=null;DIVW=null;diversityWarm(0.05);');
  assert.equal(ev('!diversityMap&&!!DIVW'), true, 'half built');
  assert.equal(ev('typeof diversityPossible("fra","ams")'), 'boolean');
  assert.equal(ev(sig), once, 'finished at once, the same map');
  assert.deepEqual(errors, []);
});

// The latency floors latency customers are offered against (80-geography-and-latency.js) are worked out ahead too, a
// few cities a frame, your POPs first: the same numbers as working one out when asked, even halfway through one.
test('idle frames work the latency floors out ahead, the same numbers as when asked', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();UI.speed=0;ACT.buildPop({city:'ams'});");
  const ref = ev("JSON.stringify(['fra','ams','nyc'].map(c=>Array.from(latFloor0(c))))");
  ev('LATF.clear();LATW=null;');
  let n = 0;
  for (; n < 5000 && !(ev("LATF.has('fra')&&LATF.has('ams')&&LATF.has('nyc')")); n++) ev('latWarm(0.05)');
  assert.ok(n > 3, `over several frames: ${n}`);
  assert.equal(ev("JSON.stringify(['fra','ams','nyc'].map(c=>Array.from(LATF.get(c))))"), ref, 'the same floors');
  // Halfway through a city, an offer asks about it: finished at once, the same numbers.
  ev("LATF.clear();LATW=null;latWarm(0.01);");
  const a = ev('LATW&&LATW.a');
  assert.ok(a, 'a city half done');
  assert.equal(ev(`JSON.stringify(['nyc','lon'].map(b=>latFloor('${a}',b)))`), ev(`JSON.stringify(['nyc','lon'].map(b=>latFloor0('${a}')[CIDX[b]]))`));
  assert.deepEqual(errors, []);
});
