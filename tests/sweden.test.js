// #206: Sweden beyond Stockholm. Gothenburg sits between Oslo and Copenhagen, Malmö across the Øresund from
// Copenhagen, and Haparanda on the land border with Finland, where the fibre crosses to Tornio.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#206 Gothenburg, Malmö and Haparanda are Swedish cities with transit, and Gothenburg and Malmö have exchanges', () => {
  const { ev, errors } = load();
  for (const c of ['got', 'mmx', 'hpa']) {
    assert.equal(ev(`CITY.${c}.cc`), 'SE', `${c} is in Sweden`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} sells transit`);
  }
  assert.ok(ev("!!CITY.got.ix&&!!CITY.mmx.ix"), 'Netnod Gothenburg and SONIX Malmö');
  assert.equal(ev('CITY.hpa.ix'), '', 'Haparanda waits for a player-founded exchange');
  assert.ok(ev("CITY.got.P>CITY.mmx.P&&CITY.mmx.P>CITY.hpa.P&&CITY.sto.P>CITY.got.P"), 'sized like the real cities');
  // Swedish homes get their own networks in the new cities, not only in Stockholm.
  for (const n of ['tlt', 'tnr']) for (const c of ['got', 'mmx']) assert.ok(ev(`NET.${n}.pops.includes('${c}')`), `${n} in ${c}`);
  assert.deepEqual(errors, []);
});

test('#206 Gothenburg sits between Oslo and Copenhagen, Malmö next to Copenhagen, and Haparanda reaches Finland over land', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const km = (a, b) => ev(`kmBetween('${a}','${b}')`);
  assert.ok(km('got', 'osl') < km('cph', 'osl') && km('got', 'cph') < km('cph', 'osl'), 'Oslo to Copenhagen can stop in Gothenburg');
  assert.ok(km('mmx', 'cph') < 40, 'the Øresund is short');
  for (const [a, b] of [['mmx', 'cph'], ['got', 'osl'], ['hpa', 'hel']]) assert.equal(ev(`isSub('${a}','${b}')`), false, `${a}–${b} over land`);
  // The carrier whose fibre crosses the border there sells transit on both sides.
  assert.ok(ev("NET.gdc.price>0&&NET.gdc.pops.includes('hpa')&&NET.gdc.pops.includes('hel')"));
  ev("S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'got'});ACT.buyTransit({city:'got',net:'gdc',tier:1});compute()");
  assert.ok(ev("S.transit.some(t=>t.city==='got'&&t.net==='gdc')"), 'a POP in Gothenburg can buy transit there');
  ev('cam.x=CITY.mmx.x;cam.y=CITY.mmx.y;cam.z=5;draw(0)');
  assert.deepEqual(errors, []);
});
