// Every UN member's capital is a city on the map (Vatican City is served from Rome, five kilometres away). Each region's
// list grows as its capitals arrive; a capital is there when a city of that country sits within 25 km of it, or carries
// its name (Tallinn is drawn south of its real spot so it does not sit on Helsinki).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const { ev } = load();
const cities = JSON.parse(ev('JSON.stringify(CITIES.filter(c=>!c.off).map(c=>({id:c.id,name:c.name,cc:c.cc,ll:[c.lon,c.lat],capital:!!c.capital})))'));
const R = Math.PI / 180, km = (a, b) => 6371 * Math.acos(Math.min(1, Math.sin(a[1] * R) * Math.sin(b[1] * R) + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.cos((a[0] - b[0]) * R)));
const at = (k, ll) => cities.find((c) => c.cc === k.slice(0, 2) && (km(c.ll, ll) < 25 || c.name === k.slice(3)));
const missing = (caps) => Object.entries(caps).filter(([k, ll]) => !at(k, ll)).map(([k]) => k);

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

const EUROPE = {
  'AL Tirana': [19.82, 41.33], 'AD Andorra la Vella': [1.52, 42.51], 'AT Vienna': [16.37, 48.21], 'BY Minsk': [27.56, 53.90], 'BE Brussels': [4.35, 50.85],
  'BA Sarajevo': [18.41, 43.86], 'BG Sofia': [23.32, 42.70], 'HR Zagreb': [15.98, 45.81], 'CY Nicosia': [33.38, 35.19], 'CZ Prague': [14.44, 50.08],
  'DK Copenhagen': [12.57, 55.68], 'EE Tallinn': [24.75, 59.44], 'FI Helsinki': [24.94, 60.17], 'FR Paris': [2.35, 48.86], 'DE Berlin': [13.40, 52.52],
  'GR Athens': [23.73, 37.98], 'HU Budapest': [19.04, 47.50], 'IS Reykjavik': [-21.94, 64.15], 'IE Dublin': [-6.26, 53.35], 'IT Rome': [12.50, 41.90],
  'LV Riga': [24.11, 56.95], 'LI Vaduz': [9.52, 47.14], 'LT Vilnius': [25.28, 54.69], 'LU Luxembourg': [6.13, 49.61], 'MT Valletta': [14.51, 35.90],
  'MD Chișinău': [28.86, 47.01], 'MC Monaco': [7.42, 43.74], 'ME Podgorica': [19.26, 42.44], 'NL Amsterdam': [4.90, 52.37], 'MK Skopje': [21.43, 41.99],
  'NO Oslo': [10.75, 59.91], 'PL Warsaw': [21.01, 52.23], 'PT Lisbon': [-9.14, 38.72], 'RO Bucharest': [26.10, 44.43], 'RU Moscow': [37.62, 55.76],
  'SM San Marino': [12.45, 43.94], 'RS Belgrade': [20.46, 44.79], 'SK Bratislava': [17.11, 48.15], 'SI Ljubljana': [14.51, 46.06], 'ES Madrid': [-3.70, 40.42],
  'SE Stockholm': [18.07, 59.33], 'CH Bern': [7.45, 46.95], 'UA Kyiv': [30.52, 50.45], 'GB London': [-0.13, 51.51],
};

test('every capital of Europe is a city', () => {
  assert.equal(Object.keys(EUROPE).length, 44, 'the 44 UN members in Europe (Turkey is with the Middle East)');
  assert.deepEqual(missing(EUROPE), []);
  // the islands land their real cables, and the group networks really serve the new countries
  for (const c of ['mla', 'nic']) assert.ok(ev(`CABLE_PAIRS.some(p=>p.cid==='peace'&&(p.a==='${c}'||p.b==='${c}'))`), `${c} on PEACE`);
  for (const [n, cc] of [['aat', 'HR'], ['tng', 'MD'], ['mts', 'BA'], ['mgt', 'MK'], ['vdp', 'AL'], ['tim', 'SM']]) assert.ok(ev(`[].concat(NET.${n}.cc).includes('${cc}')`), `${n} serves ${cc}`);
});

test('every capital of the Americas is a city', () => {
  assert.equal(Object.keys(AMERICAS).length, 35, 'the 35 UN members of the Americas');
  assert.deepEqual(missing(AMERICAS), []);
});

test('capitals are flagged, so the density rule lets small ones sit near a big city', () => {
  const unflagged = Object.entries(AMERICAS).map(([k, ll]) => at(k, ll))
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
