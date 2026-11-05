const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const start = "ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0";

test('Bilbao is on the map, on land and ready to take a POP; it has no exchange of its own', () => {
  const { ev, errors } = load();
  ev(start);
  assert.equal(ev("CITY.bio.name"), 'Bilbao');
  assert.equal(ev("CITY.bio.cc"), 'ES');
  assert.equal(ev("CITY.bio.land"), 'eu');
  assert.equal(ev("onLand(CITY.bio.x,CITY.bio.y)"), true);
  assert.equal(ev("!!CITY.bio.ix"), false, 'the exchange is in Madrid');
  assert.ok(ev("kmBetween('bio','mad')") > 250 && ev("kmBetween('bio','mad')") < 450);
  assert.equal(ev("isSub('bio','mad')"), false, 'reached overland from Madrid');
  assert.equal(ev("typeof CITY.sdr"), 'undefined', 'no Santander');
  ev("ACT.buildPop({city:'mad'});ACT.buildPop({city:'bio'})");
  assert.equal(ev("!!S.pops.bio"), true);
  assert.deepEqual(errors, []);
});

test('the transatlantic cables that come ashore on the Biscay coast land at Bilbao', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  const lands = id => JSON.parse(ev(`JSON.stringify(CABLES.find(c=>c.id==='${id}').pairs.map(p=>p.slice(0,2)))`));
  assert.deepEqual(lands('marea'), [['ash', 'bio']]);
  assert.deepEqual(lands('grace'), [['nyc', 'lon'], ['nyc', 'bio']]);
  assert.ok(lands('sol').some(p => p.join() === 'pdl,bio'));
  for (const [id, a, b] of [['marea', 'ash', 'bio'], ['grace', 'nyc', 'bio'], ['sol', 'pdl', 'bio']]) {
    assert.equal(ev(`cablesFor('${a}','${b}').map(c=>c.cid).includes('${id}')`), true, `${id} lands at Bilbao`);
  }
  for (const id of ['marea', 'grace', 'sol']) {
    assert.equal(ev(`CABLE_PAIRS.some(p=>p.cid==='${id}'&&(p.a==='mad'||p.b==='mad'))`), false, `${id} no longer ends at Madrid`);
  }
  assert.deepEqual(errors, []);
});

test('transit and peers in Bilbao: the big carriers, Drizzle Electric and Tangerine Telecom; old saves still load', () => {
  const { ev, errors } = load();
  ev(start);
  for (const n of ['lvl', 'cog', 'skl', 'drz', 'tng']) assert.equal(ev(`NET.${n}.pops.includes('bio')`), true, `${n} is in Bilbao`);
  assert.equal(ev("CITY_PDB.bio.join()"), '1,8,1341', 'PeeringDB: one facility, eight networks');
  ev("ACT.buildPop({city:'bio'})");
  for (const n of ['drz', 'tng']) {
    ev(`ACT.buyTransit({city:'bio',net:'${n}',tier:1})`);
    assert.equal(ev(`S.transit.some(t=>t.city==='bio'&&t.net==='${n}')`), true, `${n} sells transit in Bilbao`);
  }
  // A save from before: a Marea link between Ashburn and Madrid.
  ev("ACT.buildPop({city:'ash'});ACT.buildPop({city:'mad'})");
  const save = JSON.parse(ev("JSON.stringify(Object.assign(JSON.parse(JSON.stringify(S)),{links:[{id:'old1',a:'ash',b:'mad',kind:'wave',tier:2,km:6500,mo:100,cut:0,sub:true,cable:'marea',ready:0}]}))"));
  const out = JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${lit(JSON.stringify(save))})).links.map(l=>[l.a,l.b,l.cable]))`));
  assert.deepEqual(out, [['ash', 'mad', null]], 'the link survives as a plain subsea link');
  for (const z of [0.35, 1.4, 6]) ev(`cam.z=${z};draw(performance.now())`);
  assert.deepEqual(errors, []);
});

test('Marea leaves the American coast at Virginia Beach, not New Jersey, so its line does not cross the northeast', () => {
  const { ev, errors } = load();
  ev(start);
  const pts = JSON.parse(ev("JSON.stringify(CABLES.find(c=>c.id==='marea').pairs[0][2])"));
  assert.deepEqual(pts[0], [-75.7, 36.85], 'the first waypoint is off Virginia Beach');
  assert.ok(pts.every(([lo, la]) => ev(`(()=>{const p=proj(${lo},${la});return !onLand(p[0],p[1])})()`)), 'every waypoint is at sea');
  assert.deepEqual(errors, []);
});

test('Columbus III-and-a-half comes ashore in the south, near Cadiz, not on the Biscay coast', () => {
  const { ev, errors } = load();
  ev(start);
  const pair = JSON.parse(ev("JSON.stringify(CABLES.find(c=>c.id==='col3').pairs.find(p=>p[0]==='mia'&&p[1]==='mad'))"));
  assert.ok(pair, 'Miami to Madrid, as before, so old saves keep their Columbus links');
  const last = pair[2][pair[2].length - 1];
  assert.ok(last[1] < 37 && last[0] > -7 && last[0] < -5.5, `it lands on the Gulf of Cadiz (${last})`);
  assert.equal(ev("cablesFor('mia','bio').some(c=>c.cid==='col3')"), false, 'not at Bilbao');
  assert.ok(pair[2].every(([lo, la]) => ev(`(()=>{const p=proj(${lo},${la});return !onLand(p[0],p[1])})()`)), 'every waypoint is at sea');
  assert.deepEqual(errors, []);
});
