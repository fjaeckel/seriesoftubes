// #321: a subsea link to or from a coast where no cable lands yet (Iqaluit, Adamstown, Murmansk) said
// "Cables from Iqaluit reach . Hop through one of those." It now says what can actually reach that city.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const card = (ev, a, b) => ev(`UI.lmode='wave';openLinkModal('${a}','${b}');const t=$('modalCard').textContent;closeModal();t`);

test('#321 no cable lands in Iqaluit: no empty list, the only way in is your own cable', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=1;for(const g of GOALS)S.done[g.id]=0");
  assert.ok(!ev("cabOpen()"));
  for (const [a, b] of [['yfb', 'nuk'], ['nuk', 'yfb'], ['nyc', 'pcn']]) {
    const t = card(ev, a, b), city = ev(`CITY['${b === 'nuk' ? a : b}'].name`);
    assert.doesNotMatch(t, /reach \.|Hop through/, `${a}→${b}: ${t}`);
    assert.ok(t.includes(ev(`tr('link_modal.no_subsea_cable_lands_in_city_own',{city:'${city}'})`)), `${a}→${b}: ${t}`);
    assert.match(t, /level 9 or Tier 1/, `${a}→${b} points at the level that unlocks your own cable`);
  }
  // once you can lay one, the button to do it is right there
  ev("S.lvl=9");
  assert.ok(ev("cabOpen()"));
  assert.match(card(ev, 'yfb', 'nuk'), /Lay your own subsea cable|Surveying/);
  assert.deepEqual(errors, []);
});

test('#321 a coast with no cable but a road in: reach it overland, never "hop through" cables that miss it', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=1;for(const g of GOALS)S.done[g.id]=0");
  for (const [a, b, c] of [['nyc', 'mmk', 'mmk'], ['dks', 'nyc', 'dks']]) {
    const t = card(ev, a, b);
    assert.doesNotMatch(t, /Hop through/, `${a}→${b}: ${t}`);
    assert.ok(t.includes(ev(`tr('link_modal.no_subsea_cable_lands_in_city_land',{city:CITY.${c}.name})`)), `${a}→${b}: ${t}`);
  }
  // two cities that both have cables, just not a shared one, still get the cities to hop through
  const t = card(ev, 'nuk', 'syd');
  assert.match(t, /Hop through one of those/);
  assert.doesNotMatch(t, /reach \./);
  assert.deepEqual(errors, []);
});
