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

const MIDEAST = {
  'AF Kabul': [69.17, 34.53], 'AM Yerevan': [44.51, 40.18], 'AZ Baku': [49.87, 40.41], 'BH Manama': [50.59, 26.23], 'GE Tbilisi': [44.79, 41.72],
  'IR Tehran': [51.39, 35.69], 'IQ Baghdad': [44.37, 33.31], 'IL Jerusalem': [35.21, 31.77], 'JO Amman': [35.93, 31.95], 'KZ Astana': [71.45, 51.17],
  'KW Kuwait City': [47.99, 29.38], 'KG Bishkek': [74.59, 42.87], 'LB Beirut': [35.50, 33.89], 'OM Muscat': [58.41, 23.59], 'PK Islamabad': [73.05, 33.68],
  'QA Doha': [51.53, 25.29], 'SA Riyadh': [46.68, 24.71], 'SY Damascus': [36.29, 33.51], 'TJ Dushanbe': [68.77, 38.56], 'TR Ankara': [32.86, 39.93],
  'TM Ashgabat': [58.38, 37.95], 'AE Abu Dhabi': [54.37, 24.45], 'UZ Tashkent': [69.24, 41.30], 'YE Sanaa': [44.19, 15.37],
};

const AFRICA = {
  'AO Luanda': [13.23, -8.84], 'BF Ouagadougou': [-1.53, 12.37], 'BI Gitega': [29.92, -3.43], 'BJ Porto-Novo': [2.63, 6.50], 'BW Gaborone': [25.91, -24.65],
  'CD Kinshasa': [15.27, -4.32], 'CF Bangui': [18.56, 4.39], 'CG Brazzaville': [15.24, -4.27], 'CI Yamoussoukro': [-5.28, 6.82], 'CM Yaoundé': [11.50, 3.87],
  'CV Praia': [-23.51, 14.93], 'DJ Djibouti': [43.15, 11.59], 'DZ Algiers': [3.06, 36.75], 'EG Cairo': [31.24, 30.04], 'ER Asmara': [38.93, 15.32],
  'ET Addis Ababa': [38.75, 9.03], 'GA Libreville': [9.45, 0.39], 'GH Accra': [-0.19, 5.60], 'GM Banjul': [-16.58, 13.45], 'GN Conakry': [-13.68, 9.64],
  'GQ Malabo': [8.78, 3.75], 'GW Bissau': [-15.60, 11.86], 'KE Nairobi': [36.82, -1.29], 'KM Moroni': [43.26, -11.70], 'LR Monrovia': [-10.80, 6.30],
  'LS Maseru': [27.48, -29.31], 'LY Tripoli': [13.19, 32.89], 'MA Rabat': [-6.84, 34.02], 'MG Antananarivo': [47.52, -18.88], 'ML Bamako': [-8.00, 12.64],
  'MR Nouakchott': [-15.98, 18.09], 'MU Port Louis': [57.50, -20.16], 'MW Lilongwe': [33.79, -13.96], 'MZ Maputo': [32.57, -25.97], 'NA Windhoek': [17.08, -22.56],
  'NE Niamey': [2.11, 13.51], 'NG Abuja': [7.49, 9.06], 'RW Kigali': [30.06, -1.94], 'SC Victoria': [55.45, -4.62], 'SD Khartoum': [32.53, 15.50],
  'SL Freetown': [-13.23, 8.48], 'SN Dakar': [-17.45, 14.69], 'SO Mogadishu': [45.32, 2.05], 'SS Juba': [31.58, 4.86], 'ST São Tomé': [6.73, 0.34],
  'SZ Mbabane': [31.14, -26.31], 'TD N’Djamena': [15.04, 12.13], 'TG Lomé': [1.22, 6.13], 'TN Tunis': [10.18, 36.81], 'TZ Dodoma': [35.74, -6.16],
  'UG Kampala': [32.58, 0.35], 'ZA Pretoria': [28.19, -25.75], 'ZM Lusaka': [28.32, -15.39], 'ZW Harare': [31.05, -17.83],
};

const ASIAPAC = {
  'AU Canberra': [149.13, -35.28], 'BD Dhaka': [90.41, 23.81], 'BN Bandar Seri Begawan': [114.94, 4.89], 'BT Thimphu': [89.64, 27.47], 'CN Beijing': [116.40, 39.90],
  'FJ Suva': [178.44, -18.14], 'FM Palikir': [158.16, 6.92], 'ID Jakarta': [106.85, -6.21], 'IN New Delhi': [77.21, 28.61], 'JP Tokyo': [139.69, 35.69],
  'KH Phnom Penh': [104.92, 11.56], 'KI Tarawa': [172.98, 1.33], 'KP Pyongyang': [125.76, 39.04], 'KR Seoul': [126.98, 37.57], 'LA Vientiane': [102.63, 17.97],
  'LK Sri Jayawardenepura Kotte': [79.89, 6.89], 'MH Majuro': [171.38, 7.09], 'MM Naypyidaw': [96.13, 19.76], 'MN Ulaanbaatar': [106.92, 47.92], 'MV Malé': [73.51, 4.18],
  'MY Kuala Lumpur': [101.69, 3.14], 'NP Kathmandu': [85.32, 27.72], 'NR Yaren': [166.92, -0.55], 'NZ Wellington': [174.78, -41.29], 'PG Port Moresby': [147.18, -9.44],
  'PH Manila': [120.98, 14.60], 'PW Ngerulmud': [134.62, 7.50], 'SB Honiara': [159.95, -9.43], 'SG Singapore': [103.82, 1.35], 'TH Bangkok': [100.50, 13.76],
  'TL Dili': [125.57, -8.56], 'TO Nukuʻalofa': [-175.20, -21.14], 'TV Funafuti': [179.19, -8.52], 'VN Hanoi': [105.85, 21.03], 'VU Port Vila': [168.32, -17.73],
  'WS Apia': [-171.76, -13.83],
};

test('the five tables are the 193 UN members, each once', () => {
  const all = [AMERICAS, EUROPE, MIDEAST, ASIAPAC, AFRICA].flatMap((t) => Object.keys(t).map((k) => k.slice(0, 2)));
  assert.equal(all.length, 193);
  assert.equal(new Set(all).size, 193);
});

test('every capital of Africa is a city', () => {
  assert.equal(Object.keys(AFRICA).length, 54);
  assert.deepEqual(missing(AFRICA), []);
});

test('every capital of Asia and the Pacific is a city', () => {
  assert.equal(Object.keys(ASIAPAC).length, 36);
  assert.deepEqual(missing(ASIAPAC), []);
});

test('every capital of the Middle East, the Caucasus and Central Asia is a city', () => {
  assert.equal(Object.keys(MIDEAST).length, 24);
  assert.deepEqual(missing(MIDEAST), []);
  // Bahrain is an island on its cables; the groups already in the game serve the new countries they really run
  assert.ok(ev("CITY.bah.land!==CITY.ruh.land&&CABLE_PAIRS.some(p=>p.cid==='falcon'&&(p.a==='bah'||p.b==='bah'))"));
  for (const [n, cc] of [['stc', 'KW'], ['ord', 'IQ'], ['tng', 'JO'], ['mgf', 'TJ'], ['zai', 'BH']]) assert.ok(ev(`[].concat(NET.${n}.cc).includes('${cc}')`), `${n} serves ${cc}`);
});

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
