// #273: a latency offer only asks for a ceiling something you can build meets. Iqaluit and Nuuk are about 750 km apart
// as the crow flies, but no cable lands in Iqaluit and no road reaches it, so a 5.5 ms ceiling can never be met.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Spawn many mars offers from a network at two cities only: most are between the two.
const marsOnly = "eval('('+spawnOffer.toString().replace('const t=pick(types)',\"const t='mars'\")+')')";
const spawn = (ev, n) => ev(`(()=>{S.offers=[];const f=${marsOnly};for(let i=0;i<${n};i++)f();return JSON.stringify(S.offers.map(o=>[o.city,o.city2,o.latMax]));})()`);
const start = (ev, cities) => ev(`ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=13;S.pops={};for(const c of ${lit(cities)})S.pops[c]={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};compute()`);

test('#273 no latency offer between Iqaluit and Nuuk: no buildable path meets the straight-line ceiling', () => {
  const { ev, errors } = load();
  start(ev, ['yfb', 'nuk']);
  assert.ok(ev('lvl()') >= 13, 'mars offers are unlocked');
  assert.equal(ev("latMaxOf('yfb','nuk')"), 5.5);
  const pair = o => [o[0], o[1]].sort().join('-') === 'nuk-yfb';
  const offers = JSON.parse(spawn(ev, 60));
  assert.ok(offers.length > 0, 'mars offers still spawn');
  assert.deepEqual(offers.filter(pair), [], 'but none asks for 5.5 ms between Iqaluit and Nuuk');
  assert.ok(!(ev("latFloor('yfb','nuk')") <= 5.5), 'nothing on the map gets there in 5.5 ms');
  // Even with the player's own Low latency cable round Baffin Island's coast, the best is above the ceiling.
  ev("S.links.push({id:'own1',a:'yfb',b:'nuk',kind:'df',own:true,sub:true,seaDesign:'express',sys:'roadm',ch:[],km:1300,cable:null,mo:1,trench:'own:own1',cut:0,day:0,ready:0,pairs:1});compute()");
  assert.ok(ev("bestLat('yfb','nuk')") > 5.5);
  assert.deepEqual(JSON.parse(spawn(ev, 60)).filter(pair), []);
  assert.deepEqual(errors, []);
});

test('#273 Pevek–Anadyr is Russian fiber over land now, so its 4.3 ms offers can be met and do come', () => {
  const { ev, errors } = load();
  start(ev, ['pvs', 'dyr']);
  assert.ok(ev("latFloor('pvs','dyr')") <= ev("latMaxOf('pvs','dyr')"));
  assert.ok(JSON.parse(spawn(ev, 60)).some(o => [o[0], o[1]].sort().join('-') === 'dyr-pvs'));
  assert.deepEqual(errors, []);
});

test('#273 latency offers still come where a build meets the ceiling', () => {
  const { ev, errors } = load();
  start(ev, ['lon', 'nyc']);
  const offers = JSON.parse(spawn(ev, 60));
  assert.ok(offers.length > 0, 'London–New York has latency offers');
  for (const [a, b, max] of offers) assert.ok(ev(`latFloor('${a}','${b}')`) <= max, `${a}–${b} within ${max} ms is buildable`);
  // The floor is what bestLat() would read on the links it describes: a wave on the fastest London–New York cable.
  const f = ev("latFloor('lon','nyc')"), c = ev("Math.min(...cablesFor('lon','nyc').map(c=>c.km*Math.min(0.9,CAB[c.cid].lat||1)))/200+0.05");
  assert.ok(Math.abs(f - c) < 1e-9);
  assert.deepEqual(errors, []);
});
