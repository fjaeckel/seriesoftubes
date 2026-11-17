// #305, #308: your own subsea cable lands on the city's dot, also where the map nudges a city off its exact spot.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#305 an own subsea cable ends on both cities, nudged or not', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e12;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0");
    // Fujairah, Karachi, Dubai, Barcelona and Osaka are all drawn a few pixels away from their exact lon/lat.
    for (const [a, b] of [['fuj', 'bom'], ['khi', 'bom'], ['dxb', 'bom'], ['bcn', 'mrs'], ['osa', 'tpe']]) {
      ev(`for(const city of ['${a}','${b}'])if(!S.pops[city])ACT.buildPop({city});UI.lmode='df';UI.dfSrc='cable';UI.pending={a:'${a}',b:'${b}'};UI.seaDesign='standard';ACT.orderCable()`);
      const l = JSON.parse(ev('JSON.stringify(S.links.at(-1))'));
      assert.deepEqual([l.a, l.b, l.own, l.sub, Array.isArray(l.seaPath)], [a, b, true, true, true], `${a}–${b} cable ordered`);
      ev('GEO.clear()');
      const g = JSON.parse(ev('JSON.stringify(linkGeom(S.links.at(-1)).pts)'));
      const A = JSON.parse(ev(`JSON.stringify([CITY.${a}.x,CITY.${a}.y])`)), B = JSON.parse(ev(`JSON.stringify([CITY.${b}.x,CITY.${b}.y])`));
      const W = ev('W'), at = (p, c) => Math.abs(p[1] - c[1]) < 1e-9 && Math.abs(((p[0] - c[0]) % W + W + W / 2) % W - W / 2) < 1e-9;
      assert.ok(at(g[0], A), `${a}–${b} starts on ${a}: ${g[0]} vs ${A}`);
      assert.ok(at(g[g.length - 1], B), `${a}–${b} ends on ${b}: ${g[g.length - 1]} vs ${B}`);
      // The map line keeps the surveyed route in between, and the saved path stays the real one.
      assert.equal(g.length, l.seaPath.length);
      const ll = JSON.parse(ev(`JSON.stringify([CITY.${a}.lon,CITY.${a}.lat])`));
      assert.ok(Math.abs(l.seaPath[0][0] - ll[0]) < 1e-9 && Math.abs(l.seaPath[0][1] - ll[1]) < 1e-9, 'saved path starts at the real landing');
    }
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

// #416: inland hubs where the game's cables land (Nairobi, Johannesburg, Khartoum, Atlanta, Montreal) had no sea within
// reach of their marker, so a cable of your own could not start there. It now starts from the shore where their cables
// come ashore, the overland leg counted in its length. Bogotá's cables now land on the coast (tests/colombia-coast.test.js).
test('#416 an own subsea cable lands in inland cable hubs, and every cable landing has a sea route', () => {
  const { ev, errors, dom } = load();
  try {
    ev("ACT.start({});S.cash=1e12;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0");
    assert.deepEqual(JSON.parse(ev('JSON.stringify(CITIES.filter(c=>landing(c.id)&&!seaPorts(c.id).length).map(c=>c.id))')), [], 'every landing city has a port');
    for (const [a, b] of [['mrs', 'nbo'], ['jed', 'krt'], ['mia', 'ctg']]) assert.equal(ev(`ownCabWhy('${a}','${b}')`), '', `${a}–${b} can be laid`);
    // Marseille–Nairobi: comes ashore near Mombasa, about as long as the cable already on that route.
    const km = ev("seaRoutes('mrs','nbo')[0].km"), have = ev("CABLE_PAIRS.find(p=>p.cid==='eassy'&&[p.a,p.b].includes('nbo')&&[p.a,p.b].includes('mrs')).km");
    assert.ok(km > 0.7 * have && km < 1.4 * have, `${Math.round(km)} km against the cable's ${Math.round(have)} km`);
    ev("for(const city of ['mrs','nbo'])if(!S.pops[city])ACT.buildPop({city});UI.lmode='df';UI.dfSrc='cable';UI.pending={a:'mrs',b:'nbo'};UI.seaDesign='standard';ACT.orderCable()");
    const l = JSON.parse(ev('JSON.stringify(S.links.at(-1))'));
    assert.deepEqual([l.a, l.b, l.own, l.sub], ['mrs', 'nbo', true, true], 'ordered');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
