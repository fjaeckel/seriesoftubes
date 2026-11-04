// #273: a latency offer only asks for a ceiling something you can build meets. Pevek–Anadyr is 635 km apart as the
// crow flies, but only a 1,717 km sea route joins them, so a 4.3 ms ceiling can never be met.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Spawn many mars offers from a network at Pevek and Anadyr only: most are between the two.
const marsOnly = "eval('('+spawnOffer.toString().replace('const t=pick(types)',\"const t='mars'\")+')')";
const spawn = (ev, n) => ev(`(()=>{S.offers=[];const f=${marsOnly};for(let i=0;i<${n};i++)f();return JSON.stringify(S.offers.map(o=>[o.city,o.city2,o.latMax]));})()`);
const start = (ev, cities) => ev(`ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=13;S.pops={};for(const c of ${JSON.stringify(cities)})S.pops[c]={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};compute()`);

test('#273 no latency offer between Pevek and Anadyr: no buildable path meets the straight-line ceiling', () => {
  const { ev, errors } = load();
  start(ev, ['pvs', 'dyr']);
  assert.ok(ev('lvl()') >= 13, 'mars offers are unlocked');
  assert.equal(ev("latMaxOf('pvs','dyr')"), 4.3);
  const pair = o => [o[0], o[1]].sort().join('-') === 'dyr-pvs';
  const offers = JSON.parse(spawn(ev, 60));
  assert.ok(offers.length > 0, 'mars offers still spawn');
  assert.deepEqual(offers.filter(pair), [], 'but none asks for 4.3 ms between Pevek and Anadyr');
  assert.ok(!(ev("latFloor('pvs','dyr')") <= 4.3), 'nothing on the map gets there in 4.3 ms');
  // Even with the player's own Low latency cable, 7.7 ms is the best there is.
  ev("S.links.push({id:'own1',a:'pvs',b:'dyr',kind:'df',own:true,sub:true,seaDesign:'express',sys:'roadm',ch:[],km:1717,cable:null,mo:1,trench:'own:own1',cut:0,day:0,ready:0,pairs:1});compute()");
  assert.ok(ev("bestLat('pvs','dyr')") > 4.3);
  assert.deepEqual(JSON.parse(spawn(ev, 60)).filter(pair), []);
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
