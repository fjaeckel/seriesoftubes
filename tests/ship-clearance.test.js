// Cable ships at anchor keep clear of their port's marker, so a tap on the city picks the city; and the map zooms in
// further than before, for dense regions like Boston or Washington.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const J = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));
// Marseille has two club ships in port. Zoomed out, a few km of sea is no distance on screen.
const view = (ev, z) => ev(`ACT.start({});S.fleet=S.fleet||{};UI.sel=null;const C=CITY.mrs;cam.x=C.x;cam.y=C.y;cam.z=${z};draw(0)`);
const city = ev => J(ev, "(()=>{const C=CITY.mrs,[x,y]=toS(C.x,C.y,0);return {x,y}})()");
const ships = ev => J(ev, "SHIP_HITS.filter(h=>h.it.s&&h.it.s.home==='mrs').map(h=>({x:h.x,y:h.y,r:h.r}))");

test('ships at anchor keep clear of their port on screen, at any zoom', () => {
  for (const z of [1.2, 3, 8]) {
    const { ev, errors } = load();
    view(ev, z);
    const c = city(ev), s = ships(ev);
    assert.ok(s.length >= 1, `a Marseille ship is drawn at zoom ${z}`);
    const min = ev('SHIP_CLEAR*iconScale()');
    for (const h of s) assert.ok(Math.hypot(h.x - c.x, h.y - c.y) >= min - 0.01, `at zoom ${z} the ship is ${min} px or more from the city`);
    assert.deepEqual(errors, []);
  }
});

test("a tap on the city's marker picks the city, even with a ship close by", () => {
  const { ev, errors } = load();
  view(ev, 1.2);
  const c = city(ev);
  // Put a ship's hit circle right over the city, as the old anchorage could.
  ev(`SHIP_HITS.unshift({x:${c.x},y:${c.y + 6},r:20,it:SHIP_HITS.find(h=>h.it.s).it})`);
  ev(`(()=>{const r=cv.getBoundingClientRect();UI.drag={mode:'pan',moved:false,sx:${c.x}+r.left,sy:${c.y}+r.top};endPtr({pointerId:1,clientX:${c.x}+r.left,clientY:${c.y}+r.top})})()`);
  assert.deepEqual(J(ev, 'UI.sel'), { type: 'city', id: 'mrs' });
  assert.deepEqual(errors, []);
});

test('the map zooms in twice as far as before', () => {
  const { ev, errors } = load();
  ev("ACT.start({});cam.z=1;for(let i=0;i<60;i++)zoomAt(100,100,1.2)");
  assert.equal(ev('cam.z'), 32);
  ev('draw(0)');
  assert.deepEqual(errors, []);
});
