// Every UN member's capital is a city on the map (Vatican City is served from Rome, five kilometres away). Each region's
// list grows as its capitals arrive; a capital is there when a city of that country sits within 25 km of it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const { ev } = load();
const cities = JSON.parse(ev('JSON.stringify(CITIES.filter(c=>!c.off).map(c=>({id:c.id,cc:c.cc,ll:[c.lon,c.lat],capital:!!c.capital})))'));
const R = Math.PI / 180, km = (a, b) => 6371 * Math.acos(Math.min(1, Math.sin(a[1] * R) * Math.sin(b[1] * R) + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.cos((a[0] - b[0]) * R)));
const missing = (caps) => Object.entries(caps).filter(([k, ll]) => !cities.some((c) => c.cc === k.slice(0, 2) && km(c.ll, ll) < 25)).map(([k]) => k);

const AMERICAS = {
  'AG Saint John\'s': [-61.85, 17.12], 'BS Nassau': [-77.35, 25.05], 'BB Bridgetown': [-59.62, 13.10], 'BZ Belmopan': [-88.77, 17.25], 'BO Sucre': [-65.26, -19.03],
  'BR Brasília': [-47.88, -15.79], 'CA Ottawa': [-75.70, 45.42], 'CL Santiago': [-70.67, -33.45], 'CO Bogotá': [-74.07, 4.71], 'CR San José': [-84.08, 9.93],
  'CU Havana': [-82.37, 23.11], 'DM Roseau': [-61.39, 15.30], 'DO Santo Domingo': [-69.93, 18.49], 'EC Quito': [-78.47, -0.18], 'SV San Salvador': [-89.19, 13.69],
  'GD Saint George\'s': [-61.75, 12.05], 'GT Guatemala City': [-90.51, 14.63], 'GY Georgetown': [-58.16, 6.80], 'HT Port-au-Prince': [-72.34, 18.54],
  'HN Tegucigalpa': [-87.19, 14.07], 'JM Kingston': [-76.79, 17.97], 'MX Mexico City': [-99.13, 19.43], 'NI Managua': [-86.25, 12.13], 'PA Panama City': [-79.52, 8.98],
  'PY Asunción': [-57.58, -25.26], 'PE Lima': [-77.04, -12.05], 'KN Basseterre': [-62.72, 17.30], 'LC Castries': [-60.99, 14.01], 'VC Kingstown': [-61.22, 13.16],
  'SR Paramaribo': [-55.20, 5.85], 'TT Port of Spain': [-61.51, 10.66], 'US Washington': [-77.04, 38.91], 'UY Montevideo': [-56.16, -34.90], 'VE Caracas': [-66.90, 10.49],
  'AR Buenos Aires': [-58.38, -34.60],
};

test('every capital of the Americas is a city', () => {
  assert.equal(Object.keys(AMERICAS).length, 35, 'the 35 UN members of the Americas');
  assert.deepEqual(missing(AMERICAS), []);
});

test('capitals are flagged, so the density rule lets small ones sit near a big city', () => {
  const unflagged = Object.entries(AMERICAS).map(([k, ll]) => cities.find((c) => c.cc === k.slice(0, 2) && km(c.ll, ll) < 25))
    .filter((c) => c && !['BS', 'BB', 'BR', 'CA', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'GT', 'JM', 'MX', 'PA', 'PY', 'PE', 'TT', 'US', 'UY', 'VE', 'AR'].includes(c.cc)).filter((c) => !c.capital).map((c) => c.id);
  assert.deepEqual(unflagged, []);
});

test('the eastern Caribbean: Flow and Digicel on every island, each landing ECFS and Southern Caribbean Fiber', () => {
  for (const c of ['anu', 'bas', 'dom', 'slu', 'svd', 'gnd']) {
    assert.ok(ev(`NET.llt.pops.includes('${c}')&&NET.dgc.pops.includes('${c}')`), `${c}: Flow and Digicel`);
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.cid==='ecfs'&&(p.a==='${c}'||p.b==='${c}'))&&CABLE_PAIRS.some(p=>p.cid==='scf'&&(p.a==='${c}'||p.b==='${c}'))`), `${c}: both cables`);
    assert.ok(ev(`NETS.some(n=>sellsAt(n,'${c}'))`), `${c}: someone sells transit`);
  }
  // the old pairs stay, so links in old saves keep their cable
  assert.ok(ev("CABLE_PAIRS.some(p=>p.cid==='ecfs'&&p.a==='sju'&&p.b==='fdf')"));
  assert.ok(ev("isSub('pap','sdq')") === false, 'Haiti and the Dominican Republic share Hispaniola');
});
