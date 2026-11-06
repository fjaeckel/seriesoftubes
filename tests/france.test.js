const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0";
const NEW = { lys: ['Lyon', 'Quenelle-IX'], tls: ['Toulouse', 'Cassoulet-IX'], lil: ['Lille', 'Maroilles-IX'], bod: ['Bordeaux', 'Claret-IX'],
  sxb: ['Strasbourg', 'Choucroute-IX'], rns: ['Rennes', 'Galette-IX'], nte: ['Nantes', ''] };

test('Lyon, Toulouse, Lille, Bordeaux, Strasbourg, Rennes and Nantes are French cities on land, with a seller of transit each', () => {
  const { ev, errors } = load();
  ev(start);
  for (const [id, [name, ix]] of Object.entries(NEW)) {
    assert.equal(ev(`CITY.${id}.name`), name);
    assert.equal(ev(`CITY.${id}.cc`), 'FR');
    assert.equal(ev(`CITY.${id}.ix`), ix);
    assert.equal(ev(`onLand(CITY.${id}.x,CITY.${id}.y)`), true, `${id} is on drawn land`);
    assert.equal(ev(`NETS.some(n=>sellsAt(n,'${id}'))`), true, `${id} has a transit seller`);
    assert.equal(ev(`CITY_PDB.${id}.length`), 3, `${id} has calibration`);
  }
  assert.deepEqual(errors, []);
});

test('SF-Error Telecom, Boy-Egg Telecom, Ov-Hatch Cloud and Scale-Away carry the real ASNs, and Orange and Free reach the new cities', () => {
  const { ev, errors } = load();
  ev(start);
  assert.deepEqual(['sfe', 'byg', 'ovh', 'sca'].map((n) => ev(`NET.${n}.asn`)), [15557, 5410, 16276, 12876]);
  assert.deepEqual(['sfe', 'byg', 'ovh', 'sca'].map((n) => ev(`NET.${n}.name`)), ['SF-Error Telecom', 'Boy-Egg Telecom', 'Ov-Hatch Cloud', 'Scale-Away']);
  for (const c of Object.keys(NEW)) for (const n of ['tng', 'fre', 'sfe', 'byg']) assert.equal(ev(`NET.${n}.pops.includes('${c}')`), true, `${n} is in ${c}`);
  assert.equal(ev("NET.ovh.pops.includes('sxb')&&NET.ovh.ix.includes('sxb')"), true, 'Ov-Hatch is on Choucroute-IX in Strasbourg');
  for (const c of ['lys', 'tls', 'lil', 'bod', 'sxb']) assert.equal(ev(`NET.cog.pops.includes('${c}')`), true, `Cogentle is in ${c}, where PeeringDB lists Cogent`);
  assert.equal(ev("NET.adt.pops.includes('tls')"), true, 'Andorra’s telco comes up to Toulouse');
  assert.equal(ev("NETS.filter(n=>n.type!=='cdn'&&[].concat(n.cc||[]).includes('FR')&&n.pops.includes('lys')).length>=4"), true, 'four consumer networks in Lyon');
  assert.deepEqual(errors, []);
});

test('Ami-Tea comes ashore at Bordeaux and Dunno-ant at Nantes, and Dunno-ant starts at Virginia Beach, not New Jersey', () => {
  const { ev, errors } = load();
  ev(start);
  const pairs = (id) => JSON.parse(ev(`JSON.stringify(CABLES.find(c=>c.id==='${id}').pairs.map(p=>p.slice(0,2)))`));
  assert.deepEqual(pairs('amitie'), [['nyc', 'lon'], ['nyc', 'bod']]);
  assert.deepEqual(pairs('dunant'), [['ash', 'nte']]);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(CABLES.find(c=>c.id==='dunant').pairs[0][2][0])")), [-75.7, 36.85]);
  for (const id of ['amitie', 'dunant']) {
    const wp = JSON.parse(ev(`JSON.stringify(CABLES.find(c=>c.id==='${id}').pairs.flatMap(p=>p[2].map(w=>{const q=proj(w[0],w[1]);return onLand(q[0],q[1])})))`));
    assert.ok(wp.every((x) => !x), `${id}: every waypoint is at sea`);
  }
  assert.equal(ev("CABLE_PAIRS.some(p=>p.cid==='dunant'&&(p.a==='par'||p.b==='par'))"), false, 'nothing lands in inland Paris any more');
  for (const z of [0.35, 1.4, 6]) ev(`cam.z=${z};draw(performance.now())`);
  assert.deepEqual(errors, []);
});
