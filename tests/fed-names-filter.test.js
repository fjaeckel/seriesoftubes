// Multimode: a player-typed name with a slur or an obscenity in it shows as "AS?" to everyone else, however it is
// disguised; ordinary names, place names that happen to contain such letters, and every name the game itself uses pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('names with slurs or obscenities show as AS?, disguised or not', () => {
  const { ev, errors } = load({ seed: 1 });
  const shown = (n) => ev(`fedSafeName(${JSON.stringify(n)})`);
  for (const n of ['FUCK net', 'f.u.c.k networks', 'N1GGER', 'nіgger', 'Hitler Hosting', 'my ass', 'Ass Hat', 'Puta Networks',
    'Porn Peering', 'Shit Happens AS', 'Bullshit Backbone', 'Mierda Telecom', 'Vaffanculo Rete', 'Scheisse Netz', '씨발 네트워크'])
    assert.equal(shown(n), 'AS?', n);
  assert.deepEqual(errors, []);
});

test('ordinary names and place names pass untouched', () => {
  const { ev, errors } = load({ seed: 1 });
  const shown = (n) => ev(`fedSafeName(${JSON.stringify(n)})`);
  for (const n of ['Scunthorpe Fiber', 'Penistone Peering', 'Pornic Telecom', 'Bitche Backbone', 'Hancock Hosting', 'Peacock Packets',
    'Cockpit Cloud', 'Dickson Data', 'Nazionale Rete', 'Assassin Transit', 'Classic Carrier', 'Grape Networks', 'Therapist Telecom',
    'Shiitake Systems', 'Essex Exchange', 'Hell Hosting', 'Retardant Fire Net', 'Split Horizon & Co.', 'Bogon Voyage', 'Ünïcødé Net'])
    assert.equal(shown(n), ev(`fedSafeText(${JSON.stringify(n)})`), n);
  assert.deepEqual(errors, []);
});

test('a server description with such a word is not shown; an ordinary one is', () => {
  const { ev, errors } = load({ seed: 1 });
  assert.equal(ev(`fedSafeDesc('Open peering, EU hours, be nice <3')`), ev(`fedSafeText('Open peering, EU hours, be nice <3')`));
  assert.equal(ev(`fedSafeDesc('No sh1t peering, nazis welcome')`), '');
  assert.deepEqual(errors, []);
});

test('no name the game itself uses would be hidden', () => {
  const { ev, errors } = load({ seed: 1 });
  // The networks, their caches, the cities, and the names the game suggests for a new network (the ones players keep most).
  const bad = JSON.parse(ev(`JSON.stringify([...NETS.map(n=>n.name),...NETS.filter(n=>n.cache).map(n=>n.cache.name),...Object.values(CITY).map(c=>c.name),...NETWORK_NAMES].filter(n=>typeof n==='string'&&fedBadName(n)))`));
  assert.deepEqual(bad, []);
  assert.deepEqual(errors, []);
});
