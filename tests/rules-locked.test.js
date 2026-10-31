// The rules follow from the mode when a save loads: an edited or imported save cannot change them (2.0).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('a loaded save gets the rules of its mode, whatever its rules say', () => {
  const { ev, errors } = load();
  ev("beginGame('T','fra',{mode:'normal'});if(UI.pendGame)ACT.pitchSkip()");
  const base = JSON.parse(ev('JSON.stringify(packSave(S))'));
  const loadAs = (mut) => { const s = JSON.parse(JSON.stringify(base)); mut(s); ev(`S=migrate(JSON.parse(${JSON.stringify(JSON.stringify(s))}))`); return JSON.parse(ev('JSON.stringify(S.rules)')); };
  const preset = (p, o) => JSON.parse(ev(`JSON.stringify(makeRules('${p}'${o ? ',' + JSON.stringify(o) : ''}))`));
  // Normal games keep one of the three Normal presets, with nothing changed.
  for (const p of ['freeze', 'oncall', 'bgp']) assert.deepEqual(loadAs(s => { s.rules = { preset: p }; }), preset(p));
  assert.deepEqual(loadAs(s => { s.rules = { preset: 'oncall', money: 'infinite', gates: 'open', chaos: 'none', lead: 'quick' }; }), preset('oncall'), 'no free money or open gates in On-call');
  assert.deepEqual(loadAs(s => { s.rules = { preset: 'freeze', clock: false }; }), preset('freeze'), 'the clock always runs');
  assert.deepEqual(loadAs(s => { s.rules = { preset: 'puzzle' }; }), preset('oncall'), 'no puzzle rules (clock off for ever) in a Normal game');
  assert.deepEqual(loadAs(s => { s.rules = { preset: 'sandbox' }; }), preset('oncall'), 'no sandbox powers without the sandbox tag');
  assert.deepEqual(loadAs(s => { delete s.rules; }), preset('oncall'), 'a save from before 2.0 is On-call');
  // Sandboxes keep only their chaos.
  assert.deepEqual(loadAs(s => { s.mode = 'sandbox'; s.rules = { preset: 'sandbox', chaos: 'spicy', clock: false, money: 'normal' }; }), preset('sandbox', { chaos: 'spicy' }));
  assert.deepEqual(loadAs(s => { s.mode = 'sandbox'; s.rules = { preset: 'bgp' }; }), preset('sandbox'));
  // Scenarios and the weekly run on On-call.
  const scn = { id: 'pac', rules: {}, days: 1095, name: 'x', mods: [] };
  for (const r of [{ preset: 'bgp' }, { preset: 'oncall', chaos: 'none' }, { preset: 'sandbox' }, { preset: 'freeze' }])
    assert.deepEqual(loadAs(s => { s.mode = 'scenario'; s.scn = scn; s.rules = r; }), preset('oncall'), JSON.stringify(r));
  assert.deepEqual(loadAs(s => { s.mode = 'scenario'; s.scn = { ...scn, id: 'weekly', key: '2026-W44' }; s.rules = { preset: 'freeze' }; }), preset('oncall'), 'the weekly too');
  assert.deepEqual(errors, []);
});

test('a save that claims to be a puzzle loads as a Normal On-call game with the clock running', () => {
  const { ev, errors } = load();
  ev("beginGame('T','fra',{mode:'normal'});if(UI.pendGame)ACT.pitchSkip()");
  const s = JSON.parse(ev('JSON.stringify(packSave(S))'));
  s.mode = 'puzzle'; s.rules = { preset: 'puzzle' };
  ev(`S=migrate(JSON.parse(${JSON.stringify(JSON.stringify(s))}));UI.started=true;compute()`);
  assert.equal(ev('S.mode'), 'normal');
  assert.equal(ev('pzOn()'), false);
  assert.equal(ev("rule('clock')"), true);
  ev('for(let i=0;i<3;i++)dayTick()');
  assert.equal(ev('S.day'), 3, 'days pass');
  ev(`UI.importing=JSON.parse(${JSON.stringify(JSON.stringify(s))});ACT.importGo()`);
  assert.equal(ev('S.mode'), 'normal');
  assert.equal(ev('rulePreset()'), 'oncall');
  assert.deepEqual(errors, []);
});
