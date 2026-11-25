const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A stand-in for the browser's AudioContext: starts suspended, like one made before any tap.
const fake = "window.AudioContext=function(){FAKE_AC.made++;this.state='suspended';this.currentTime=0;this.destination={};this.resume=()=>{FAKE_AC.resumed++;this.state='running';return Promise.resolve();};" +
  "this.createOscillator=()=>({frequency:{},connect:(g)=>g,start(){},stop(){}});this.createGain=()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect:(d)=>d});};window.FAKE_AC={made:0,resumed:0};AC=null;";

test('the audio context is made ahead of the first tap, and the tap only wakes it', () => {
  const { ev, errors } = load();
  ev(fake + "UI.muted=false;audioEarly()");
  assert.equal(ev("FAKE_AC.made"), 1, 'made a moment after loading');
  assert.equal(ev("AC.state"), 'suspended', 'and silent until a tap');
  ev("audioInit()");
  assert.equal(ev("FAKE_AC.made"), 1, 'the tap does not make another');
  assert.equal(ev("FAKE_AC.resumed"), 1, 'it wakes the one there is');
  ev("audioInit()");
  assert.equal(ev("FAKE_AC.resumed"), 1, 'a running one is left alone');
  assert.deepEqual(errors, []);
});

test('muted players get no audio context until they tap, as before', () => {
  const { ev, errors } = load();
  ev(fake + "UI.muted=true;audioEarly()");
  assert.equal(ev("FAKE_AC.made"), 0);
  ev("audioInit()");
  assert.equal(ev("FAKE_AC.made"), 1, 'a tap still makes one, so unmuting later plays sound');
  assert.deepEqual(errors, []);
});

test('a refused resume is caught, not an unhandled rejection', async () => {
  const { ev, errors } = load();
  ev(fake + "UI.muted=false;audioEarly();AC.resume=()=>Promise.reject(new Error('not allowed'))");
  ev("audioInit()");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(errors, []);
});
