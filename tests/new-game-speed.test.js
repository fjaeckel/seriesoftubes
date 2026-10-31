const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#186 a new network starts at half speed, even after a game at 8×', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});ACT.speed({v:8})");
  assert.equal(ev('UI.speed'), 8);
  ev("ACT.newgame();ACT.start({})");
  assert.equal(ev('UI.speed'), 0.5, 'normal game');
  assert.ok(dom.window.document.getElementById('sp0.5').classList.contains('on'), 'the HUD shows ½×');
  ev("ACT.speed({v:0});ACT.newgame();UI.mode='sandbox';ACT.start({})");
  assert.equal(ev('UI.speed'), 0.5, 'sandbox, and a paused game does not stay paused');
  ev("ACT.speed({v:4});ACT.startScn({id:SCN[0].id,sure:1})");
  assert.equal(ev('UI.speed'), 0.5, 'scenario');
  ev("ACT.speed({v:2});ACT.startWeekly({sure:1})");
  assert.equal(ev('UI.speed'), 0.5, 'weekly challenge');
  assert.deepEqual(errors, []);
});

test('#186 on a phone, play after pause resumes at half speed, not the old game\'s speed', () => {
  const { ev, errors } = load();
  ev("window.innerWidth=360;ACT.start({});ACT.phoneSpeed();ACT.phoneSpeed();ACT.phoneSpeed()");
  assert.notEqual(ev('UI.lastSpeed'), 0.5);
  ev("ACT.newgame();ACT.start({});if(UI.pendGame)ACT.pitchSkip();ACT.phonePlay();ACT.phonePlay()");
  assert.ok(ev("UI.started&&!UI.pendGame"), "the new game is running");
  assert.equal(ev('UI.speed'), 0.5);
  assert.deepEqual(errors, []);
});

test('#186 a saved game still continues at the speed it was saved at', () => {
  const a = load();
  a.ev("ACT.start({});ACT.speed({v:4});save(true)");
  const b = load({ storage: { 'sot-save-v1': a.ev("slotRaw(UI.slot)") } });
  assert.equal(b.ev('UI.speed'), 4);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});
