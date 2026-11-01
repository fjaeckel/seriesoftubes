const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('new landing hubs have stations and usable cable pairs', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Landings','fra',{mode:'sandbox'})");
  for (const [city, cables] of [
    ['yyt', ['gcon', 'pers']], ['psu', ['twoaf', 'falcon', 'eassy']],
    ['nic', ['medn', 'cadm']], ['tlv', ['blue', 'jona']],
    ['myr', ['firmina', 'anjam']], ['chq', ['silph']], ['drn', ['silph']],
    ['sll', ['g2a']], ['nkc', ['ace']], ['bey', ['cadm']],
    ['ngo', ['juno']], ['kch', ['ewsc']], ['buf', ['clake']], ['dlc', ['dyc']],
  ]) {
    assert.ok(ev(`landing('${city}')`), `${city} has a landing station`);
    assert.ok(ev(`NETS.some(n=>sellsAt(n,'${city}'))`), `${city} has transit`);
    for (const cable of cables) assert.ok(ev(`cablesFor('${city}',CAB.${cable}.pairs.find(p=>p.includes('${city}')).find(x=>typeof x==='string'&&x!=='${city}')).some(p=>p.cid==='${cable}'&&p.km>0)`), `${city} can lease ${cable}`);
  }
  assert.ok(ev("!!cablePair('silph','chq','drn')"), 'Silphium lands at Chania and Derna');
  assert.ok(ev("!!cablePair('g2a','sll','hga')"), 'Salalah reaches the Berbera landing and Hargeisa backhaul');
  assert.deepEqual(errors, []);
});

test('new stations keep their coordinates and the original cable anchors', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  for (const [city, lon, lat] of [['yyt', -52.70931, 47.56494], ['myr', -78.88669, 33.68906], ['chq', 24.02921, 35.51124], ['drn', 22.63669, 32.76704]]) {
    assert.ok(Math.abs(ev(`CITY.${city}.lon`) - lon) < 0.02, `${city} longitude`);
    assert.ok(Math.abs(ev(`CITY.${city}.lat`) - lat) < 0.02, `${city} latitude`);
    assert.ok(ev(`onLand(CITY.${city}.x,CITY.${city}.y)`), `${city} is drawn on land`);
  }
  assert.equal(ev("CAB.gcon.pairs[0].slice(0,2).join()"), 'rek,mtl');
  assert.equal(ev("CAB.medn.pairs[0].slice(0,2).join()"), 'ist,mrs');
  assert.deepEqual(errors, []);
});

test('all original cable pairs keep their order and geometry', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  const legacy = require('./fixtures/legacy-cables.json');
  const pairs = Object.entries(legacy.pairs).map(([id, count]) => [id, JSON.parse(ev(`JSON.stringify(CAB.${id}.pairs.slice(0,${count}))`))]);
  const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
  assert.equal(hash, legacy.hash, 'new landings never replace or reorder saved routes');
  assert.deepEqual(errors, []);
});
