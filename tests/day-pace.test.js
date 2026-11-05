// How fast days really come with the route worker (src/game/88-days/15-day-pace.js), for Settings › Diagnostic info:
// the speed asked, the speed held from the starts of the last days, how long a day takes and the slowest. Measured
// only: the clock starts days as it always did.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('Diagnostic info says the speed asked, the speed held and how long a day takes', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();UI.speed=8;");
  assert.equal(ev('diagPace()'), 'days: x8 asked · measuring');
  // A day every 400 ms (x8 asks one every 312.5), each taking 300 ms, one of them 700.
  ev('for(let i=0;i<14;i++){const t=1000+i*400;paceStart(t);paceEnd(t+(i===10?700:300));}');
  assert.equal(ev('diagPace()'), 'days: x8 asked · x6.3 held (one every 400 ms) · a day takes 333 ms, slowest 700');
  // Another speed: the measure starts again.
  ev('UI.speed=4;');
  assert.equal(ev('diagPace()'), 'days: x4 asked · measuring');
  ev('paceStart(9000);paceStart(9625);paceStart(10250);');
  assert.match(ev('diagPace()'), /^days: x4 asked · x4\.0 held \(one every 625 ms\)/);
  ev('UI.speed=0;');
  assert.equal(ev('diagPace()'), 'days: paused');
  assert.deepEqual(errors, []);
});

test('the clock with the worker feeds the measure and starts days as it always did', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();autoPause=()=>false;UI.speed=8;");
  // A stand-in worker day that ends at once: one day per 312.5 ms of clock, as before.
  ev(`window.__n=0;rwOn=()=>true;RW.w={postMessage(){},terminate(){}};rwDay=()=>{__n++;S.day++;rwDayDone();};
    for(let i=0;i<600;i++)runClock(1000/60);`);
  assert.equal(ev('__n'), Math.floor(600 * 1000 / 60 / 312.5), 'one day per 312.5 ms of clock');
  assert.equal(ev('PACE.st.length'), 13, 'the last days are measured');
  assert.match(ev('diagPace()'), /^days: x8 asked · x\d+\.\d held/);
  assert.deepEqual(errors, []);
});
