const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const { ev } = load();
const J = (s) => JSON.parse(ev(`JSON.stringify(${s})`));
const R = Math.PI / 180, km = (a, b) => 6371 * Math.acos(Math.min(1, Math.sin(a[1] * R) * Math.sin(b[1] * R) + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.cos((a[0] - b[0]) * R)));
const cities = J('CITIES.filter(c=>!c.off).map(c=>({id:c.id,name:c.name,cc:c.cc,ll:[c.lon,c.lat]}))');
// A capital is on the map when a city of its country sits within 25 km of it.
const has = (cc, ll) => cities.some((c) => c.cc === cc && km(c.ll, ll) < 25);

test('every US state capital and Washington, DC is a city', () => {
  const caps = { Montgomery: [-86.30, 32.37], Juneau: [-134.42, 58.30], Phoenix: [-112.07, 33.45], 'Little Rock': [-92.29, 34.75], Sacramento: [-121.49, 38.58],
    Denver: [-104.99, 39.74], Hartford: [-72.68, 41.76], Dover: [-75.52, 39.16], Tallahassee: [-84.28, 30.44], Atlanta: [-84.39, 33.75], Honolulu: [-157.86, 21.31],
    Boise: [-116.20, 43.62], Springfield: [-89.65, 39.80], Indianapolis: [-86.16, 39.77], 'Des Moines': [-93.61, 41.59], Topeka: [-95.68, 39.05], Frankfort: [-84.87, 38.20],
    'Baton Rouge': [-91.15, 30.45], Augusta: [-69.78, 44.31], Annapolis: [-76.49, 38.98], Boston: [-71.06, 42.36], Lansing: [-84.56, 42.73], 'Saint Paul': [-93.09, 44.95],
    Jackson: [-90.18, 32.30], 'Jefferson City': [-92.17, 38.58], Helena: [-112.03, 46.59], Lincoln: [-96.70, 40.81], 'Carson City': [-119.77, 39.16], Concord: [-71.54, 43.21],
    Trenton: [-74.76, 40.22], 'Santa Fe': [-105.94, 35.69], Albany: [-73.76, 42.65], Raleigh: [-78.64, 35.78], Bismarck: [-100.78, 46.81], Columbus: [-82.99, 39.96],
    'Oklahoma City': [-97.52, 35.47], Salem: [-123.03, 44.94], Harrisburg: [-76.88, 40.27], Providence: [-71.41, 41.82], Columbia: [-81.03, 34.00], Pierre: [-100.35, 44.37],
    Nashville: [-86.78, 36.16], Austin: [-97.74, 30.27], 'Salt Lake City': [-111.89, 40.76], Montpelier: [-72.58, 44.26], Richmond: [-77.44, 37.54], Olympia: [-122.90, 47.04],
    Charleston: [-81.63, 38.35], Madison: [-89.40, 43.07], Cheyenne: [-104.82, 41.14], Washington: [-77.04, 38.91] };
  assert.equal(Object.keys(caps).length, 51);
  assert.deepEqual(Object.entries(caps).filter(([, ll]) => !has('US', ll)).map(([n]) => n), []);
});

test('every Canadian provincial and territorial capital, and Greenland on its cables', () => {
  const caps = { Victoria: [-123.37, 48.43], Edmonton: [-113.49, 53.55], Regina: [-104.62, 50.45], Winnipeg: [-97.14, 49.90], Toronto: [-79.38, 43.65], 'Quebec City': [-71.21, 46.81],
    Fredericton: [-66.64, 45.96], Halifax: [-63.57, 44.65], Charlottetown: [-63.13, 46.24], "St. John's": [-52.71, 47.56], Whitehorse: [-135.06, 60.72], Yellowknife: [-114.37, 62.45],
    Iqaluit: [-68.52, 63.75], Ottawa: [-75.70, 45.42] };
  assert.deepEqual(Object.entries(caps).filter(([, ll]) => !has('CA', ll)).map(([n]) => n), []);
  // Greenland: no road and no fiber over the ice, so each town is its own landmass, reached on Greenland Connect's real landings.
  const gl = J("CITIES.filter(c=>c.cc==='GL').map(c=>({id:c.id,land:c.land,cab:CABLE_PAIRS.some(p=>p.a===c.id||p.b===c.id)}))");
  assert.deepEqual(gl.map((c) => c.id).sort(), ['aas', 'nuk', 'qaq', 'sis']);
  assert.equal(new Set(gl.map((c) => c.land)).size, 4, 'one landmass per town');
  assert.ok(gl.every((c) => c.cab), 'every town lands a cable');
  for (const [a, b] of [['rek', 'qaq'], ['qaq', 'nuk'], ['nuk', 'yyt'], ['nuk', 'sis'], ['sis', 'aas']])
    assert.ok(J(`CABLES.some(c=>c.pairs.some(p=>(p[0]==='${a}'&&p[1]==='${b}')||(p[0]==='${b}'&&p[1]==='${a}')))`), `${a}–${b} has a cable`);
  assert.ok(J("CABLES.find(c=>c.id==='gcon').pairs.some(p=>p[0]==='rek'&&p[1]==='mtl')"), 'the old Reykjavik–Montreal pair stays for saves');
});

test('who sells transit in the new cities', () => {
  const sellers = (c) => J(`NETS.filter(n=>sellsAt(n,'${c}')).map(n=>n.id)`);
  for (const c of ['was', 'aus', 'pir', 'mpv']) assert.ok(sellers(c).includes('lvl'), `${c}: Level Tree`);
  for (const c of ['yeg', 'ywg', 'yxe', 'yqb']) assert.ok(sellers(c).includes('drz'), `${c}: on its exchange, per PeeringDB`);
  assert.ok(sellers('yqr').includes('skt'), 'Regina: SaskTell-Tale');
  for (const c of ['yfc', 'yyg', 'yyt']) assert.ok(sellers(c).includes('bal'), `${c}: Bell Alien`);
  for (const c of ['yxy', 'yzf']) assert.deepEqual(sellers(c), ['nwt'], `${c}: only the north's carrier`);
  for (const c of ['nuk', 'qaq', 'sis', 'aas']) assert.deepEqual(sellers(c), ['tus'], `${c}: only Too Sassy`);
  // Iqaluit has only satellites: nobody sells, but a beach takes your own cable.
  assert.deepEqual(sellers('yfb'), []);
  assert.equal(J("CITY.yfb.beach"), true);
});

test('a game still starts and runs a month in a new capital', () => {
  const { ev: e, errors } = load();
  e("ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;S.cash=1e8;ACT.buildPop({city:'aus'});ACT.buildPop({city:'nuk'});for(let i=0;i<30;i++)dayTick()");
  assert.ok(e("!!S.pops.aus&&!!S.pops.nuk"));
  assert.deepEqual(errors, []);
});
