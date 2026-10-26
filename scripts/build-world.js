#!/usr/bin/env node
// Regenerates the real-world data block in site/index.html (between the WORLD markers).
//
//   node scripts/build-world.js [--cache .cache/world] [--check]
//
// Sources (downloaded into the cache directory with curl when missing):
//   * GeoNames cities15000: where people live (https://download.geonames.org/export/dump/)
//   * PeeringDB: which networks have facilities where, which exchanges exist and who is on them
//     (https://www.peeringdb.com/api, CC0-ish public data, self-reported by the networks)
//
// What comes out: every metro with 100k+ people plus every metro that hosts a registered
// interconnection facility or exchange, the PoP list of each game network (the metros where it has a
// facility record or an exchange port), and each metro's exchanges with their real membership.
// It does not touch the game design (shares, prices, policies), only names, places and presence.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const NETS = require('./data/networks.js');
const BASE = require('./data/base-cities.json');
// --bogon: publish the game's cartoon names (and scrambled AS numbers) instead of the real ones, for contributing upstream.
const BOGON = process.argv.includes('--bogon') ? require('./data/bogon-names.json') : null;

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CACHE = path.resolve(opt('--cache', path.join(__dirname, '..', '.cache', 'world')));
const HTML = path.join(__dirname, '..', 'site', 'index.html');
const BEGIN = '/*__WORLD_BEGIN__*/', END = '/*__WORLD_END__*/';

const SRC = {
  'cities15000.zip': 'https://download.geonames.org/export/dump/cities15000.zip',
  'countryInfo.txt': 'https://download.geonames.org/export/dump/countryInfo.txt',
  'airports.dat': 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat',
  ...Object.fromEntries(['fac', 'ix', 'ixfac', 'ixlan', 'net', 'netfac', 'netixlan', 'carrierfac'].map((t) => [t + '.json', `https://www.peeringdb.com/api/${t}?depth=0`])),
};
fs.mkdirSync(CACHE, { recursive: true });
for (const [f, url] of Object.entries(SRC)) {
  const p = path.join(CACHE, f);
  if (!fs.existsSync(p)) { console.error('downloading', url); execFileSync('curl', ['-fsS', '--retry', '3', '-m', '600', '-o', p, url], { stdio: 'inherit' }); }
}
const pdb = (t) => JSON.parse(fs.readFileSync(path.join(CACHE, t + '.json'), 'utf8')).data.filter((r) => !r.status || r.status === 'ok');
const places = execFileSync('unzip', ['-p', path.join(CACHE, 'cities15000.zip'), 'cities15000.txt'], { maxBuffer: 1 << 28 }).toString('utf8').split('\n').filter(Boolean).map((l) => {
  const f = l.split('\t');
  return { gid: f[0], name: f[1], ascii: f[2], lat: +f[4], lon: +f[5], code: f[7], cc: f[8], pop: +f[14] || 0 };
});
const continent = {};
for (const l of fs.readFileSync(path.join(CACHE, 'countryInfo.txt'), 'utf8').split('\n')) { if (l[0] === '#' || !l) continue; const f = l.split('\t'); continent[f[0]] = f[8]; }

const R = Math.PI / 180;
const hav = (a, b) => { const dLa = (b.lat - a.lat) * R, dLo = (b.lon - a.lon) * R, x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
const lower = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ---------- metros: cluster places into cities ---------- */
const CELL = 0.5; // degrees; grid for neighbour lookups
const grid = new Map();
const cellKey = (lat, lon) => Math.floor(lat / CELL) + ',' + Math.floor(lon / CELL);
const metros = [];
function addToGrid(m) { const k = cellKey(m.lat, m.lon); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(m); }
function nearest(p, maxKm, pred, rad) {
  const spanLat = Math.ceil(maxKm / 111 / CELL), spanLon = Math.ceil(maxKm / (111 * Math.max(0.2, Math.cos(p.lat * R))) / CELL);
  let best = null, bd = maxKm;
  const ci = Math.floor(p.lat / CELL), cj = Math.floor(p.lon / CELL);
  for (let i = -spanLat; i <= spanLat; i++) for (let j = -spanLon; j <= spanLon; j++) {
    const l = grid.get((ci + i) + ',' + (cj + j)); if (!l) continue;
    for (const m of l) { if (pred && !pred(m)) continue; const d = hav(p, m); if (d < bd && d <= (rad ? rad(m) : maxKm)) { bd = d; best = m; } }
  }
  return best;
}
const baseCc = {};
for (const b of BASE) {
  let best = null, bd = 1e9; for (const p of places) { const d = hav(b, p); if (d < bd) { bd = d; best = p; } }
  baseCc[b.id] = best.cc;
  const m = { id: b.id, name: b.name, cc: best.cc, lat: b.lat, lon: b.lon, pop: 0, base: true, snap: b.id === 'ash' ? 30 : 55, facs: [], ixs: [] };
  metros.push(m); addToGrid(m);
}
// Hong Kong, Macau and Taiwan are not "China" for the game's licence rules; Singapore/Johor merge across the border on purpose.
for (const p of places.slice().sort((a, b) => b.pop - a.pop || (a.gid < b.gid ? -1 : 1))) {
  const m = nearest(p, 40, (x) => x.base || x.cc === p.cc, (x) => (x.base ? 40 : 25));
  if (m) { m.pop += p.pop; continue; }
  const nm = { id: 'g' + p.gid, name: /[^\u0000-ɏ]/.test(p.name) ? p.ascii : p.name, cc: p.cc, lat: p.lat, lon: p.lon, pop: p.pop, base: false, facs: [], ixs: [] };
  metros.push(nm); addToGrid(nm);
}

/* ---------- facilities -> metros ---------- */
const facs = pdb('fac');
const placeByName = new Map();
for (const p of places) { for (const k of new Set([lower(p.name), lower(p.ascii)])) { const key = p.cc + '|' + k; const o = placeByName.get(key); if (!o || o.pop < p.pop) placeByName.set(key, p); } }
const facMetro = new Map();
let facGeo = 0, facLost = 0, facNew = 0;
for (const f of facs) {
  let pt = f.latitude && f.longitude ? { lat: f.latitude, lon: f.longitude } : null;
  if (!pt) { const p = placeByName.get(f.country + '|' + lower(f.city)); if (p) { pt = { lat: p.lat, lon: p.lon }; facGeo++; } }
  if (!pt) { facLost++; continue; }
  let m = nearest(pt, 55, (x) => x.base, (x) => x.snap) || nearest(pt, 35);
  if (!m) { m = { id: 'f' + f.id, name: String(f.city || f.name).split(',')[0].trim(), cc: f.country, lat: pt.lat, lon: pt.lon, pop: 0, base: false, facs: [], ixs: [] }; metros.push(m); addToGrid(m); facNew++; }
  m.facs.push(f); facMetro.set(f.id, m);
}

/* ---------- exchanges ---------- */
const ixs = pdb('ix'), ixfac = pdb('ixfac'), ixlan = pdb('ixlan'), nixl = pdb('netixlan');
const lanToIx = new Map(ixlan.map((l) => [l.id, l.ix_id]));
const ixMembers = new Map();
for (const r of nixl) { const ix = r.ix_id || lanToIx.get(r.ixlan_id); if (!ix) continue; if (!ixMembers.has(ix)) ixMembers.set(ix, new Set()); ixMembers.get(ix).add(r.asn); }
const ixFacs = new Map();
for (const r of ixfac) { if (!ixFacs.has(r.ix_id)) ixFacs.set(r.ix_id, []); ixFacs.get(r.ix_id).push(r.fac_id); }
const ixMetro = new Map();
for (const ix of ixs) {
  const tally = new Map();
  for (const fid of ixFacs.get(ix.id) || []) { const m = facMetro.get(fid); if (m) tally.set(m, (tally.get(m) || 0) + 1); }
  let m = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0].id < b[0].id ? -1 : 1))[0];
  m = m && m[0];
  if (!m) { const p = placeByName.get(ix.country + '|' + lower(ix.city)); if (p) m = nearest(p, 55, (x) => x.base, (x) => x.snap) || nearest(p, 35); }
  if (m) ixMetro.set(ix.id, m);
}
const exchanges = new Map(); // metro -> [{id,name,size,asns}]
for (const ix of ixs) {
  const m = ixMetro.get(ix.id), mem = ixMembers.get(ix.id);
  if (!m || !mem) continue;
  if (!exchanges.has(m)) exchanges.set(m, []);
  exchanges.get(m).push({ pid: ix.id, name: ix.name.replace(/\s+/g, ' ').trim(), size: mem.size, asns: mem });
}
const KEEP_IX = 4;
for (const [m, l] of exchanges) {
  l.sort((a, b) => b.size - a.size || a.pid - b.pid);
  const seen = new Set(), keep = [];
  for (const x of l) { if (seen.has(lower(x.name))) continue; if (keep.length >= KEEP_IX) break; if (x.size < (keep.length ? 8 : 3)) continue; seen.add(lower(x.name)); keep.push(x); }
  m.ixs = keep;
}

/* ---------- networks ---------- */
const allNets = [...Object.entries(NETS.existing).map(([id, v]) => ({ id, ...v })), ...NETS.added];
const netRows = pdb('net'), carrierfac = pdb('carrierfac');
const rowByAsn = new Map(netRows.map((r) => [r.asn, r]));
const asnToNet = new Map();
for (const n of allNets) for (const a of n.asns) { if (asnToNet.has(a)) throw new Error('ASN ' + a + ' in two networks'); asnToNet.set(a, n.id); }
// Sibling ASNs of the same organisation in PeeringDB count too (regional ASNs, "International" ASNs...).
const netOrg = new Map(); // game net -> PeeringDB net ids
for (const n of allNets) {
  const orgs = new Set(n.asns.map((a) => rowByAsn.get(a)).filter(Boolean).map((r) => r.org_id));
  const rows = netRows.filter((r) => orgs.has(r.org_id));
  netOrg.set(n.id, new Set(rows.map((r) => r.id)));
  for (const r of rows) if (!asnToNet.has(r.asn)) asnToNet.set(r.asn, n.id);
}
const netIdToGame = new Map();
for (const [g, ids] of netOrg) for (const i of ids) if (!netIdToGame.has(i)) netIdToGame.set(i, g);
for (const n of allNets) for (const a of n.asns) { const r = rowByAsn.get(a); if (r) netIdToGame.set(r.id, n.id); }
const netPops = new Map(allNets.map((n) => [n.id, new Set()]));
const netIx = new Map(allNets.map((n) => [n.id, []]));
for (const r of pdb('netfac')) { const id = netIdToGame.get(r.net_id); const m = id && facMetro.get(r.fac_id); if (m) netPops.get(id).add(m); }
const carrierOf = new Map(); for (const n of allNets) for (const c of n.carriers || []) carrierOf.set(c, n.id);
for (const r of carrierfac) { const id = carrierOf.get(r.carrier_id); const m = id && facMetro.get(r.fac_id); if (m) netPops.get(id).add(m); }
for (const m of metros) {
  for (const x of m.ixs) { x.nets = []; for (const a of x.asns) { const id = asnToNet.get(a); if (id && !x.nets.includes(id)) x.nets.push(id); } }
  // The biggest exchange of a metro always stays; a challenger nobody in the game is on would only be dead weight.
  m.ixs = m.ixs.filter((x, i) => i === 0 || x.nets.length > 0);
  m.ixs.forEach((x, i) => {
    x.id = i === 0 ? m.id : m.id + '~' + (i + 1);
    for (const id of x.nets) { netIx.get(id).push(x.id); netPops.get(id).add(m); }
  });
}
// Networks that publish (almost) no facilities get an estimated footprint, flagged as such in the game.
const estimated = new Set();
for (const [id, e] of Object.entries(NETS.est)) {
  if (netPops.get(id).size >= 3 && !e.force) continue;
  estimated.add(id);
  const pool = metros.filter((m) => !m.base && e.cc.includes(m.cc) || m.base && e.cc.includes(m.cc)).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)).slice(0, e.top);
  for (const m of pool) netPops.get(id).add(m);
  for (const b of e.plus || []) netPops.get(id).add(metros.find((m) => m.id === b));
}

/* ---------- which metros become cities ---------- */
const keep = metros.filter((m) => m.base || m.pop >= 100000 || m.facs.length || m.ixs.length);
keep.sort((a, b) => (a.base === b.base ? 0 : a.base ? -1 : 1) || b.pop - a.pop || (a.id < b.id ? -1 : 1));
const keepSet = new Set(keep);
const order = new Map(keep.map((m, i) => [m, i]));

const cleanFac = (s, city) => { let t = String(s).replace(/\s+/g, ' ').trim(); const i = t.lastIndexOf(' - '); if (i > 12) t = t.slice(0, i); return t.length > 46 ? t.slice(0, 45).trim() + '…' : t; };
const dcOf = (m) => { const f = m.facs.slice().sort((a, b) => (b.net_count || 0) - (a.net_count || 0) || a.id - b.id)[0]; return f ? cleanFac(f.name) : ''; };
const round = (v, d = 2) => +v.toFixed(d);

function bogonize(world) {
  for (const [id, n] of Object.entries(world.nets)) if (BOGON.nets[id]) Object.assign(n, BOGON.nets[id]);
  // The cartoon world keeps the footprints its authors drew, on top of whatever PeeringDB says, so the game's own scenarios still work.
  const cityIds = new Set([...world.cities.map((c) => c[0]), ...Object.keys(world.base)]);
  const union = (csv, extra) => [...new Set([...(csv ? csv.split(',') : []), ...extra.filter((c) => cityIds.has(c))])].join(',');
  for (const [id, n] of Object.entries(world.nets)) { const u = BOGON.up[id]; if (!u) continue; n.pops = union(n.pops, u.pops || []); n.ix = union(n.ix, Array.isArray(u.ix) ? u.ix : []); }
  for (const a of world.added) if (BOGON.nets[a.id]) Object.assign(a, BOGON.nets[a.id]);
  const label = new Map(world.cities.map((c) => [c[0], c[1]]));
  for (const [m, list] of Object.entries(world.ix)) list.forEach((x, i) => {
    const id = i ? m + '~' + (i + 1) : m;
    x[0] = (i ? BOGON.xix[id] : BOGON.cityIx[m]) || (label.get(m) || m.toUpperCase()) + '-IX' + (i ? ' ' + (i + 1) : '');
  });
  for (const c of world.cities) { c[6] = world.ix[c[0]] ? world.ix[c[0]][0][0] : ''; c[7] = ''; }
  for (const [m, b] of Object.entries(world.base)) { b.ix = world.ix[m] ? world.ix[m][0][0] : BOGON.cityIx[m] || ''; if (!b.ix) delete b.ix; b.dc = BOGON.dc[m] || ''; }
}

/* ---------- short codes: what operators actually write in router names ---------- */
// IATA airport codes (OpenFlights) matched by place, with the codes the industry uses where they differ from the
// airport (Moscow is msk, Tokyo is tyo, Seoul is sel). The curated base cities keep their ids unless listed here.
const CODE_OVERRIDE = { mos: 'msk', tok: 'tyo', kyv: 'iev', cbo: 'cmb', atn: 'atl', lag: 'los', stg: 'str', icn: 'sel', ash: 'iad', tor: 'yyz', mtl: 'yul', hou: 'iah', dal: 'dfw', sha: 'sha', pek: 'pek', rek: 'rkv' };
const airports = [];
for (const l of fs.readFileSync(path.join(CACHE, 'airports.dat'), 'utf8').split('\n')) {
  const f = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { f.push(cur); cur = ''; } else cur += ch; } f.push(cur);
  if (!/^[A-Z]{3}$/.test(f[4] || '') || f[12] !== 'airport') continue;
  airports.push({ iata: f[4].toLowerCase(), name: lower(f[1]), city: lower(f[2]), lat: +f[6], lon: +f[7] });
}
const apGrid = new Map();
for (const a of airports) { const k = Math.floor(a.lat) + ',' + Math.floor(a.lon); if (!apGrid.has(k)) apGrid.set(k, []); apGrid.get(k).push(a); }
const used = new Set(Object.values(CODE_OVERRIDE));
for (const m of keep) if (m.base && !CODE_OVERRIDE[m.id]) used.add(m.id);
const codeOf = {};
for (const m of keep) {
  if (m.base) { codeOf[m.id] = CODE_OVERRIDE[m.id] || m.id; continue; }
}
for (const m of keep) {
  if (m.base) continue;
  const nm = lower(m.name), cand = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const a of apGrid.get((Math.floor(m.lat) + i) + ',' + (Math.floor(m.lon) + j)) || []) { const d = hav(m, a); if (d <= 90) cand.push({ a, d, hit: a.city === nm || a.city.startsWith(nm) || nm.startsWith(a.city) }); }
  const intl = (c) => /international/.test(c.a.name) ? 1 : 0;
  cand.sort((x, y) => (y.hit - x.hit) || (intl(y) - intl(x)) || (x.d - y.d));
  let code = (cand.find((c) => c.hit && !used.has(c.a.iata)) || cand.find((c) => !used.has(c.a.iata) && c.d < 40) || {}).a;
  code = code && code.iata;
  if (!code) { const w = lower(m.name).replace(/[^a-z]/g, ''); for (const t of [w.slice(0, 3), w.replace(/[aeiou]/g, '').slice(0, 3), w.slice(0, 4), w.slice(0, 2) + w.slice(-1)]) if (t.length >= 3 && !used.has(t)) { code = t; break; } }
  if (!code) { let n = 2; const w = (lower(m.name).replace(/[^a-z]/g, '') + 'xxx').slice(0, 2); while (used.has(w + n)) n++; code = w + n; }
  used.add(code); codeOf[m.id] = code;
}

const world = {
  snapshot: new Date().toISOString().slice(0, 10),
  cc: {},
  base: {},
  code: {},
  cities: [],
  ix: {},
  nets: {},
  added: NETS.added.map((n) => ({ id: n.id, name: n.name, asn: n.asns[0], type: n.type, pol: n.pol, ...(n.minIx ? { minIx: n.minIx, minPni: n.minPni } : {}), share: n.share, ...(n.price ? { price: n.price } : {}), col: n.col })),
};
for (const m of keep) {
  if (codeOf[m.id] !== m.id) world.code[m.id] = codeOf[m.id];
  const cont = continent[m.cc];
  world.cc[m.cc] = cont === 'NA' ? 'AM' : cont === 'SA' ? 'SA' : cont === 'EU' ? 'EU' : cont === 'AF' ? 'AF' : cont === 'OC' ? 'OC' : 'AS';
  const exch = m.ixs.map((x) => [x.name, x.nets.join(','), x.size]);
  if (exch.length) world.ix[m.id] = exch;
  if (m.base) { world.base[m.id] = { cc: baseCc[m.id], dc: dcOf(m), ...(exch.length ? { ix: exch[0][0] } : {}) }; continue; }
  const P = Math.max(8, Math.min(900, Math.round(m.pop / 12000)));
  world.cities.push([m.id, m.name, m.cc, round(m.lon), round(m.lat), P, exch.length ? exch[0][0] : '', dcOf(m)]);
}
for (const n of allNets) {
  const pops = [...netPops.get(n.id)].filter((m) => keepSet.has(m)).sort((a, b) => order.get(a) - order.get(b)).map((m) => m.id);
  world.nets[n.id] = { name: n.name, asn: n.asns[0], pops: pops.join(','), ix: netIx.get(n.id).join(','), ...(estimated.has(n.id) ? { est: 1 } : {}) };
}
// Unlisted ASNs are fine; but warn about game networks with no presence at all.
for (const n of allNets) if (!world.nets[n.id].pops) console.error('warning: no PeeringDB presence for', n.id, n.name);

if (BOGON) bogonize(world);
const block = `${BEGIN}\n// Generated by scripts/build-world.js from PeeringDB and GeoNames (${world.snapshot}). Do not edit by hand.\nconst WORLD=${JSON.stringify(world)};\n${END}`;
const html = fs.readFileSync(HTML, 'utf8');
const bi = html.indexOf(BEGIN), ei = html.indexOf(END);
if (bi < 0 || ei < 0) { console.error('markers missing in', HTML, '- add', BEGIN, 'and', END); process.exit(1); }
const out = html.slice(0, bi) + block + html.slice(ei + END.length);
console.error(`${keep.length} metros (${world.cities.length} new), ${facs.length} facilities (${facGeo} geocoded by name, ${facLost} lost, ${facNew} new metros), ${[...exchanges.values()].reduce((a, l) => a + l.length, 0)} exchanges, ${Object.values(world.ix).reduce((a, l) => a + l.length, 0)} kept`);
console.error('block size', (block.length / 1024).toFixed(0), 'KB');
if (args.includes('--check')) { if (out !== html) { console.error('site/index.html is out of date; run node scripts/build-world.js'); process.exit(1); } } else fs.writeFileSync(HTML, out);
if (args.includes('--stats')) for (const n of allNets) console.error(n.id.padEnd(4), n.name.padEnd(26), String(world.nets[n.id].pops.split(',').filter(Boolean).length).padStart(4), 'pops', String(world.nets[n.id].ix.split(',').filter(Boolean).length).padStart(4), 'ix');
