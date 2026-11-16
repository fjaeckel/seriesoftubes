const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const mods = ['pioneer','outcast','autarky'];
const start = (ev, city, selected) => ev(`beginGame('Badge Test','${city}',${lit({mode:'normal',preset:'oncall',rules:{mods:selected}})});if(UI.pendGame)ACT.pitchSkip()`);

test('Master of the Internet needs a Sydney Tier 1 win with all three modes', () => {
  const { ev, errors } = load();
  assert.equal(ev('BADGES.at(-1).id'), 'syd_master');
  start(ev, 'syd', mods);
  assert.equal(ev("BADGES.find(b=>b.id==='syd_master').ok()"), false, 'a game in progress has not reached Tier 1');
  ev('S.won=true;checkBadges()');
  assert.notEqual(ev('S.ach.syd_master'), undefined);
  assert.equal(ev('S.achP.syd_master'), 'oncall');
  assert.deepEqual(errors, []);
});

test('the Sydney badge is not earned without Sydney, Tier 1, or every mode', () => {
  for (const [city, selected, won] of [
    ['syd', mods, false],
    ['fra', mods, true],
    ['syd', ['pioneer','outcast'], true],
    ['syd', ['pioneer','autarky'], true],
    ['syd', ['outcast','autarky'], true],
  ]) {
    const { ev, errors } = load();
    start(ev, city, selected);
    if (won) ev('S.won=true;checkBadges()');
    else ev('checkBadges()');
    assert.equal(ev('S.ach.syd_master'), undefined, `${city}, ${selected.join('+')}, won=${won}`);
    assert.deepEqual(errors, []);
  }
});

test('a save joined to Multimode cannot earn the single-player badge', () => {
  const { ev, errors } = load();
  start(ev, 'syd', mods);
  ev('S.fed=fedNewState();S.fed.on=true;S.won=true;checkBadges()');
  assert.equal(ev('S.ach.syd_master'), undefined);
  assert.deepEqual(errors, []);
});