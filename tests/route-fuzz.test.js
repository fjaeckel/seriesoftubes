// A few seeded random games (scripts/lib/route-fuzz.js), played move for move on main's page and on this checkout's:
// after every move and day both route identically and keep the same game state, and this checkout routes the same with
// the routing cache (RC) on and off. scripts/route-fuzz.js plays hundreds of these; here a handful, so CI stays quick.
// Without git's origin/main (a bare tarball), the base is this checkout's own page: the cache on/off check still runs.
// Between moves this checkout's page also draws the 2D map (tests/helpers/map-2d-kit.js): kept pictures against fresh
// ones and tubes against main's formulas. The base page never draws, so a game that parts from it shows the map changed it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const page = require('../scripts/lib/page');
const { openPage, playGame, rng } = require('../scripts/lib/route-fuzz');
const { lit } = require('../scripts/lib/js-literal');
const { KIT, problems } = require('./helpers/map-2d-kit');

function pages() {
  const head = path.join(os.tmpdir(), `tubes-fuzz-test-${process.pid}-head.html`);
  fs.writeFileSync(head, page.assemble().html);
  let base = head;
  try { const b = path.join(os.tmpdir(), `tubes-fuzz-test-${process.pid}-base.html`); fs.writeFileSync(b, page.assembleRef('origin/main')); base = b; } catch (e) {}
  let P = { base: openPage(base, 'base'), head: openPage(head, 'head') };
  // A change to the world itself (cities, networks, cables, AI campuses, the kinds of customers that call), to what links cost or to where each city's
  // traffic goes (locSh(), #48) cannot route like main: there is no same game to compare. Then the base is this checkout
  // too, and the cache on/off check still runs; equivalence with main resumes once it lands.
  const world = (p) => p.ev("JSON.stringify([CITIES.map(c=>[c.id,c.land,c.P]),NETS.map(n=>[n.id,n.pops,n.ix,n.share,n.price,n.up]),CABLES.map(c=>[c.id,c.pairs.map(q=>[q[0],q[1]])]),[1,300,3000].map(k=>[dfLeaseMo(k),waveMo(k,false,2),dfBuildCost(k)]),Object.keys(BIZ_T).map(t=>[t,BIZ_T[t].lv||1,BIZ_T[t].opts]),MEGA.map(m=>m.c),['nyc','fra','sin'].map(c=>typeof locSh==='function'?Array.from(locSh(NSH,c)):null)])");
  if (base !== head && world(P.base) !== world(P.head)) { console.log('# route fuzz: the world or its prices differ from main, so both pages are this checkout'); P = { base: openPage(head, 'base'), head: P.head }; }
  return P;
}

test('random games route the same as main, with and without the routing cache, move for move, and the 2D map draws them right', () => {
  const P = pages();
  // The map on this checkout's page only, its clock set by hand so nothing depends on how fast the test runs.
  P.head.ev(`window.__T=100000;Object.defineProperty(performance,'now',{value:()=>__T,configurable:true});mapGl(false);${KIT}`);
  // Seeds that start a normal game, a sandbox, a scenario and a puzzle, with transit, exchanges, PNIs and RouteScript.
  for (const seed of [20, 23, 27, 26]) {
    const r = rng(seed * 7919), found = [];
    let checks = 0;
    const g = playGame(P, seed, { moves: 35, onMove: () => {
      const out = JSON.parse(P.head.ev(`JSON.stringify(__M2D.check(${lit(Array.from({ length: 9 }, () => r()))}))`));
      if (out) checks++;
      found.push(...problems(out, `seed ${seed}`));
    } });
    assert.equal(g.div, null, `seed ${seed} diverged: ${lit(g.div, null, 1)}`);
    // (a puzzle's walk is shorter: a city outside the puzzle has no panel, so nothing to press there)
    assert.ok(g.moves >= (g.start.kind === 'puzzle' ? 20 : 35), `seed ${seed} played its moves`);
    assert.ok(checks >= 20, `seed ${seed}: the map was checked (${checks})`);
    assert.deepEqual(found.slice(0, 5), [], `seed ${seed}: the 2D map`);
    assert.deepEqual(g.errors, [], `seed ${seed}: no page errors`);
  }
});
