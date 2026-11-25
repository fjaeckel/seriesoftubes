// #484: which two cities may have your own subsea cable. Across the sea always; on one landmass when a real cable
// runs there or the sea lies between them (Jerusalem to Athens, Cairo to Singapore), never between two inland hubs;
// and Istanbul reaches the Mediterranean through the Turkish Straits.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#484 a cable may join landing stations the sea lies between, on one landmass too', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e12;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0");
    const why = (a, b) => ev(`ownCabWhy('${a}','${b}')`);
    // The issue's routes, which used to be "on land": each now has a sea route and may be laid.
    for (const [a, b] of [['jer', 'ath'], ['bey', 'ath'], ['ist', 'cai'], ['ist', 'ath'], ['cai', 'sin']]) {
      assert.equal(ev(`isSub('${a}','${b}')`), false, `${a}–${b} shares a landmass`);
      assert.equal(why(a, b), '', `${a}–${b}: ${why(a, b)}`);
      assert.ok(ev(`ownCabKm('${a}','${b}')`) < 2 * ev(`kmBetween('${a}','${b}')`), `${a}–${b} goes by a sensible sea route`);
    }
    // Those that already worked still do.
    for (const [a, b] of [['jer', 'mla'], ['jib', 'sin'], ['mrs', 'bcn']]) assert.equal(why(a, b), '', `${a}–${b}`);
    // Two inland hubs, or a coast with land in between, still dig fiber.
    for (const [a, b] of [['fra', 'par'], ['mrs', 'ham'], ['lis', 'bio'], ['mad', 'bcn']]) {
      assert.equal(ev(`seaCab('${a}','${b}')`), false, `${a}–${b}`);
      assert.match(why(a, b), /on land/);
    }
    // A sea route far longer than the land one is refused, and says why.
    ev("SEA_SHARES.set('ham|mrs',true)");
    assert.match(why('mrs', 'ham'), /more than twice the 1,189 km over land/);
    // The Turkish Straits: from Istanbul the route leaves through the Aegean, not round the Black Sea's shores.
    const p = JSON.parse(ev("JSON.stringify(seaRoutes('ist','cai')[0].pts)"));
    assert.ok(p.some(([lon, lat]) => lon > 23 && lon < 28 && lat > 35 && lat < 40), 'through the Aegean');
    // The link window offers it: Jerusalem to Athens shows the own-cable button and the cable can be ordered.
    ev("for(const city of ['jer','ath'])if(!S.pops[city])ACT.buildPop({city});UI.lmode='df';UI.dfSrc='build';openLinkModal('jer','ath')");
    assert.match(ev("$('modalCard').innerHTML"), /Lay your own subsea cable/);
    ev("UI.dfSrc='cable';UI.pending={a:'jer',b:'ath'};UI.seaDesign='standard';ACT.orderCable()");
    const l = JSON.parse(ev('JSON.stringify(S.links.at(-1))'));
    assert.deepEqual([l.a, l.b, l.own, l.sub], ['jer', 'ath', true, true]);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
