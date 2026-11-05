// A few seeded random games (scripts/lib/route-fuzz.js), played move for move on main's page and on this checkout's:
// after every move and day both route identically and keep the same game state, and this checkout routes the same with
// the routing cache (RC) on and off. scripts/route-fuzz.js plays hundreds of these; here a handful, so CI stays quick.
// Without git's origin/main (a bare tarball), the base is this checkout's own page: the cache on/off check still runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const page = require('../scripts/lib/page');
const { openPage, playGame } = require('../scripts/lib/route-fuzz');
const { lit } = require('../scripts/lib/js-literal');

function pages() {
  const head = path.join(os.tmpdir(), `tubes-fuzz-test-${process.pid}-head.html`);
  fs.writeFileSync(head, page.assemble().html);
  let base = head;
  try { const b = path.join(os.tmpdir(), `tubes-fuzz-test-${process.pid}-base.html`); fs.writeFileSync(b, page.assembleRef('origin/main')); base = b; } catch (e) {}
  let P = { base: openPage(base, 'base'), head: openPage(head, 'head') };
  // A change to the world itself (cities, networks, cables) or to what links cost cannot route like main: there is no
  // same game to compare. Then the base is this checkout too, and the cache on/off check still runs; equivalence with
  // main resumes once it lands.
  const world = (p) => p.ev("JSON.stringify([CITIES.map(c=>[c.id,c.land,c.P]),NETS.map(n=>[n.id,n.pops,n.ix,n.share,n.price,n.up]),CABLES.map(c=>[c.id,c.pairs.map(q=>[q[0],q[1]])]),[1,300,3000].map(k=>[dfLeaseMo(k),waveMo(k,false,2),dfBuildCost(k)])])");
  if (base !== head && world(P.base) !== world(P.head)) { console.log('# route fuzz: the world or its prices differ from main, so both pages are this checkout'); P = { base: openPage(head, 'base'), head: P.head }; }
  return P;
}

test('random games route the same as main, with and without the routing cache, move for move', () => {
  const P = pages();
  // Seeds that start a normal game, a sandbox, a scenario and a puzzle, with transit, exchanges, PNIs and RouteScript.
  for (const seed of [20, 23, 27, 26]) {
    const g = playGame(P, seed, { moves: 35 });
    assert.equal(g.div, null, `seed ${seed} diverged: ${lit(g.div, null, 1)}`);
    assert.ok(g.moves >= 35, `seed ${seed} played its moves`);
    assert.deepEqual(g.errors, [], `seed ${seed}: no page errors`);
  }
});
