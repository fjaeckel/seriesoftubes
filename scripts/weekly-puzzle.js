#!/usr/bin/env node
// The weekly puzzle generator. Every Sunday .github/workflows/weekly-puzzle.yml runs it to publish that week's
// puzzle as a static file, site/puzzles/weekly/<key>.json, which the game fetches when Puzzles opens
// (src/game/60-features/93-puzzles-weekly.js). It loads the real game headless (tests/harness.js), so it uses the
// game's own cities, cables, prices, week keys, file validator and star code.
//
//   node scripts/weekly-puzzle.js                    the week starting on the coming (or current) Sunday 06:00 Berlin, if missing
//   node scripts/weekly-puzzle.js --key 2026-W45     that week (--force replaces an existing file)
//   node scripts/weekly-puzzle.js --next 3           this week and the next two
//   node scripts/weekly-puzzle.js --check            regenerate weeks not over yet whose budget this game no longer verifies
//                                                    (see refresh()), then validate every file; fails only if that fails
//   --page FILE                                      play another build of the game (the live release), see the workflow
//   --dir DIR                                        where the files live (default site/puzzles/weekly)
//
// How a puzzle is made: pick a theme the last weeks did not have, choose 4-6 cities for it (avoiding last weeks'
// cities) and the traffic they carry (content in the first city, eyeballs in the others; a latency sprint adds a
// circuit with a latency cap). Search for the cheapest topology that connects them and the cheapest one that survives
// any single cut (a whole cable or a trench), then size each with the game's own routing (scripts/lib/puzzle-solver.js):
// links and routers big enough for every flow, after any single cut too, then as small as they can be. The budget is
// that N-1 build plus a little. Both reference builds are judged by the game's own star code and must earn their
// stars, or the candidate is thrown away and another one tried.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SV = require('./lib/puzzle-solver');
const SCHEMA = 2, HISTORY = 4, THEME_GAP = 3, REG_GAP = 2, ATTEMPTS = 40, KEEP = 6;
const THEMES = ['tour', 'ring', 'detour', 'ocean', 'islands', 'sprint'];

// ---------- the game, headless ----------
function game(file) {
  const { load } = require('../tests/harness');
  let g = load(file ? { file } : {});
  if (file && !g.ev("typeof pzWkValid==='function'")) {
    console.warn(`warning: ${file} has no published weekly puzzles yet; using src/ instead`);
    g = load();
  }
  SV.install(g.ev);
  // N-1 counts a whole cable as one failure (every segment of a cable shares its risk), as the solver does.
  if (g.ev("pzUnit({cable:'x',a:'a',b:'b'})") !== 'cab:x') throw new Error('this game counts cable segments separately; the solver would not match its N-1 check');
  return g;
}

// ---------- small helpers ----------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const shuffle = (r, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ceil10k = (x) => Math.ceil(x / 10000) * 10000;
function perms(a) { if (a.length <= 1) return [a]; const out = []; a.forEach((x, i) => { for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) out.push([x, ...p]); }); return out; }
function subsets(a) { const out = []; for (let m = 0; m < 1 << a.length; m++) out.push(a.filter((_, i) => m >> i & 1)); return out; }

// ---------- the world, as the game prices it ----------
function world(ev) {
  const cities = JSON.parse(ev("JSON.stringify(Object.values(CITY).filter(c=>!c.off&&!c.cn).map(c=>({id:c.id,name:c.name,lands:lands(c),reg:c.reg,P:c.P,lon:c.lon,lat:c.lat,pop:pzPopCost(c.id)})))"));
  const C = Object.fromEntries(cities.map((c) => [c.id, c]));
  const cablePairs = JSON.parse(ev('JSON.stringify(CABLE_PAIRS.map(p=>[p.cid,p.a,p.b]))')).filter(([, a, b]) => C[a] && C[b]);
  const cabs = {}; for (const [cid, a, b] of cablePairs) { (cabs[a] = cabs[a] || new Set()).add(cid); (cabs[b] = cabs[b] || new Set()).add(cid); }
  const memo = new Map();
  // Every way to join a and b: overland (first wave, and a second one on a diverse route) and each cable.
  const opts = (a, b) => {
    const k = a < b ? a + '|' + b : b + '|' + a; if (memo.has(k)) return memo.get(k);
    const rs = JSON.parse(ev(`JSON.stringify(pzRoutes('${a}','${b}').filter(r=>!subWaveWhy(0,r.km,r.sub)).map(r=>({via:r.via,cab:r.cab,sub:r.sub,ms:r.ms,c:pzLinkCost(r,0,false),c2:r.sub?0:pzLinkCost(r,0,true)})))`));
    const out = [];
    for (const r of rs) {
      if (r.cab) out.push({ a, b, via: r.via, sub: true, ms: r.ms, cost: r.c, unit: 'cab:' + r.cab });
      else { out.push({ a, b, via: 'land', sub: false, ms: r.ms, cost: r.c, unit: `land:${k}:1` }); out.push({ a, b, via: 'land', sub: false, ms: r.ms, cost: r.c2, unit: `land:${k}:2`, second: true }); }
    }
    out.sort((x, y) => x.cost - y.cost || (x.unit < y.unit ? -1 : 1));
    memo.set(k, out); return out;
  };
  const km = (a, b) => { const A = C[a], B = C[b], r = Math.PI / 180, h = Math.sin((B.lat - A.lat) * r / 2) ** 2 + Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin((B.lon - A.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  return { cities, C, cablePairs, cabs, opts, km };
}

// ---------- judging a build (the game has the last word; this steers the search) ----------
function judge(W, P, links) {
  const nodes = new Set(); for (const l of links) { nodes.add(l.a); nodes.add(l.b); }
  // A second overland wave on a pair needs the first one.
  for (const l of links) if (l.second && !links.some((x) => x !== l && !x.second && x.via === 'land' && x.unit === l.unit.replace(/2$/, '1'))) return null;
  if (new Set(links.map((l) => l.unit)).size !== links.length) return null;
  const cost = [...nodes].reduce((s, c) => s + W.C[c].pop, 0) + links.reduce((s, l) => s + l.cost, 0);
  const comp = (skip) => { const adj = {}; for (const l of links) if (l.unit !== skip) { (adj[l.a] = adj[l.a] || []).push(l.b); (adj[l.b] = adj[l.b] || []).push(l.a); }
    const seen = new Set([P.cities[0]]), q = [P.cities[0]]; while (q.length) { const u = q.pop(); for (const v of adj[u] || []) if (!seen.has(v)) { seen.add(v); q.push(v); } } return seen; };
  const all = comp(null);
  if (!P.cities.every((c) => all.has(c))) return { ok: false, cost };
  if (P.avoid.some((c) => nodes.has(c))) return { ok: false, cost };
  if (P.noSub && links.some((l) => l.sub)) return { ok: false, cost };
  if (P.ring) { const nb = {}; for (const l of links) { (nb[l.a] = nb[l.a] || new Set()).add(l.b); (nb[l.b] = nb[l.b] || new Set()).add(l.a); }
    if (links.length !== nodes.size || ![...nodes].every((c) => nb[c].size === 2)) return { ok: false, cost }; }
  if (P.lat) { const [a, b, ms] = P.lat, d = { [a]: 0 }, done = new Set();
    for (;;) { let u = null; for (const k in d) if (!done.has(k) && (u === null || d[k] < d[u])) u = k; if (u === null || u === b) break; done.add(u);
      for (const l of links) { const v = l.a === u ? l.b : l.b === u ? l.a : null; if (v && !(d[v] <= d[u] + l.ms)) d[v] = d[u] + l.ms; } }
    if (!(d[b] <= ms)) return { ok: false, cost }; }
  const weak = [...new Set(links.map((l) => l.unit))].filter((u) => { const g = comp(u); return !P.cities.every((c) => g.has(c)); });
  return { ok: true, cost, n1: weak.length === 0, weak };
}

// ---------- the solver ----------
// Cheapest tree over a node set (Kruskal on each pair's cheapest way), with some links forced in.
function tree(W, nodes, forced = []) {
  const par = Object.fromEntries(nodes.map((n) => [n, n])), f = (x) => (par[x] === x ? x : (par[x] = f(par[x])));
  const out = [];
  for (const l of forced) { par[f(l.a)] = f(l.b); out.push(l); }
  const es = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const o = W.opts(nodes[i], nodes[j]).filter((x) => !x.second); if (o.length) es.push(o[0]); }
  es.sort((x, y) => x.cost - y.cost);
  for (const e of es) if (f(e.a) !== f(e.b)) { par[f(e.a)] = f(e.b); out.push(e); }
  return out.length - forced.length === nodes.length - 1 - forced.length ? out : null;
}
// Add the link that removes the most single points of failure per dollar, until none are left.
function harden(W, P, nodes, links) {
  links = links.slice();
  for (let guard = 0; guard < 12; guard++) {
    const j = judge(W, P, links); if (!j || !j.ok) return null; if (j.n1) return links;
    let best = null;
    for (let i = 0; i < nodes.length; i++) for (let k = i + 1; k < nodes.length; k++) for (const o of W.opts(nodes[i], nodes[k])) {
      if (links.some((l) => l.unit === o.unit)) continue;
      const jj = judge(W, P, [...links, o]); if (!jj || !jj.ok) continue;
      const gain = j.weak.length - jj.weak.length; if (gain <= 0) continue;
      const score = gain / o.cost; if (!best || score > best.score) best = { score, o };
    }
    if (!best) return null; links.push(best.o);
  }
  return null;
}
// Every simple cycle through the node set, each hop by one of its three cheapest ways, cheapest first.
function cycles(W, P, nodes, bound) {
  let best = null; const [h, ...rest] = nodes;
  if (nodes.length < 3) return null;
  for (const p of perms(rest)) {
    if (p[0] > p[p.length - 1]) continue; // each cycle once
    const ring = [h, ...p], hops = ring.map((x, i) => W.opts(x, ring[(i + 1) % ring.length]).filter((o) => !o.second).slice(0, 3));
    if (hops.some((o) => !o.length)) continue;
    const pop = ring.reduce((s, c) => s + W.C[c].pop, 0);
    const go = (i, acc, cost) => {
      if (cost >= Math.min(bound, best ? best.cost : Infinity)) return;
      if (i === hops.length) { const j = judge(W, P, acc); if (j && j.ok && j.n1) best = { cost: j.cost, links: acc.slice() }; return; }
      for (const o of hops[i]) { if (acc.some((l) => l.unit === o.unit)) continue; acc.push(o); go(i + 1, acc, cost + o.cost); acc.pop(); }
    };
    go(0, [], pop);
  }
  return best;
}
function solve(W, P) {
  const vias = P.via.filter((c) => !P.avoid.includes(c));
  let one = null, three = null, naive = null;
  const keep = (cur, links) => { if (!links) return cur; const j = judge(W, P, links); if (!j || !j.ok) return cur; return !cur || j.cost < cur.cost ? { cost: j.cost, links, n1: j.n1 } : cur; };
  for (const sub of subsets(vias)) {
    const nodes = [...P.cities, ...sub];
    const forced = P.lat ? [W.opts(P.lat[0], P.lat[1]).filter((o) => !o.second).sort((x, y) => x.ms - y.ms)[0]].filter(Boolean) : [];
    const ts = [tree(W, nodes), forced.length ? tree(W, nodes, forced) : null].filter(Boolean)
      // A via city left as a leaf is money for nothing.
      .filter((t) => sub.every((v) => t.filter((l) => l.a === v || l.b === v).length >= 2));
    if (!P.ring) for (const t of ts) {
      one = keep(one, t);
      // The obvious way to survive a cut: a second, different way along every hop of the tree.
      const dbl = t.slice(); let okd = true;
      for (const l of t) { const alt = W.opts(l.a, l.b).find((o) => o.unit !== l.unit && !dbl.some((x) => x.unit === o.unit)); if (!alt) { okd = false; break; } dbl.push(alt); }
      if (okd) { const j = judge(W, P, dbl); if (j && j.ok && j.n1 && (!naive || j.cost < naive.cost)) naive = { cost: j.cost, links: dbl }; if (j && j.ok && j.n1) three = keep(three, dbl); }
      const hd = harden(W, P, nodes, t); if (hd) three = keep(three, hd);
    }
    if (nodes.length <= 7) { const c = cycles(W, P, nodes, three ? three.cost : Infinity); if (c) { three = keep(three, c.links); if (P.ring) one = keep(one, c.links); } }
  }
  return { one, three, naive };
}

// ---------- themes: which cities, which twist ----------
function pools(W) {
  const byLand = {};
  for (const c of W.cities) { const k = c.lands[0] + '/' + c.reg; (byLand[k] = byLand[k] || []).push(c.id); }
  const big = Object.values(byLand).map((g) => g.filter((c) => W.C[c].P >= 100)).filter((g) => g.length >= 6);
  const isl = W.cities.filter((c) => byLand[c.lands[0] + '/' + c.reg].length === 1 && c.lands.length === 1 && (W.cabs[c.id] || new Set()).size >= 2).map((c) => c.id);
  return { big, isl };
}
const near = (W, c, from, n) => from.filter((x) => x !== c).sort((a, b) => W.km(c, a) - W.km(c, b)).slice(0, n);
function draft(W, theme, r, banned) {
  const { big, isl } = pools(W), free = (c) => !banned.has(c);
  const P = { theme, cities: [], via: [], avoid: [], noSub: false, ring: false, lat: null };
  if (theme === 'tour' || theme === 'ring' || theme === 'detour') {
    const g = pick(r, big).filter(free);
    if (g.length < 6) return null;
    if (theme === 'detour') {
      const hub = pick(r, g.slice().sort((a, b) => W.C[b].P - W.C[a].P).slice(0, 4)), around = near(W, hub, g, 8);
      if (around.length < 6) return null;
      const sh = shuffle(r, around); P.cities = sh.slice(0, 4); P.via = sh.slice(4, 6); P.avoid = [hub];
    } else {
      const seed = pick(r, g), n = theme === 'ring' ? 4 + Math.floor(r() * 2) : 4 + Math.floor(r() * 3);
      P.cities = [seed, ...shuffle(r, near(W, seed, g, n + 2)).slice(0, n - 1)];
      if (theme === 'tour') P.via = near(W, seed, g, n + 4).filter((c) => !P.cities.includes(c)).slice(0, 1);
      P.ring = theme === 'ring';
    }
  } else if (theme === 'ocean') {
    const land = (c) => W.C[c].lands[0], ok = W.cablePairs.filter(([, a, b]) => land(a) !== land(b) && free(a) && free(b) && big.some((g) => g.includes(a)) && big.some((g) => g.includes(b)));
    if (!ok.length) return null;
    const [, a, b] = pick(r, ok), ga = big.find((g) => g.includes(a)).filter(free), gb = big.find((g) => g.includes(b)).filter(free);
    const a2 = pick(r, near(W, a, ga, 3)), b2 = pick(r, near(W, b, gb, 3));
    if (!a2 || !b2) return null;
    P.cities = [a, a2, b, b2];
    // Other landing points on either shore that cross the same ocean: the stepping stones to a second crossing.
    const shores = W.cablePairs.filter(([, x, y]) => (land(x) === land(a) && land(y) === land(b)) || (land(x) === land(b) && land(y) === land(a))).flatMap(([, x, y]) => [x, y]);
    P.via = shuffle(r, [...new Set(shores)].filter((c) => free(c) && !P.cities.includes(c))).slice(0, 2);
  } else if (theme === 'islands') {
    const i0 = pick(r, isl.filter(free)); if (!i0) return null;
    const hops = W.cablePairs.filter(([, x, y]) => x === i0 || y === i0).map(([, x, y]) => (x === i0 ? y : x));
    const islN = near(W, i0, isl.filter((c) => free(c) && W.km(i0, c) < 4500), 3), main = near(W, i0, [...new Set(hops)].filter((c) => free(c) && !isl.includes(c)), 2);
    if (!islN.length || !main.length) return null;
    P.cities = [i0, ...shuffle(r, islN).slice(0, 1 + Math.floor(r() * 2)), main[0]];
    P.via = [...new Set([...islN, ...main, ...hops])].filter((c) => !P.cities.includes(c) && free(c)).sort((x, y) => W.km(i0, x) - W.km(i0, y)).slice(0, 3);
  } else if (theme === 'sprint') {
    const ok = [];
    for (const [, a, b] of W.cablePairs) { if (!free(a) || !free(b) || W.C[a].P < 100 || W.C[b].P < 100) continue;
      const o = W.opts(a, b).filter((x) => !x.second); if (o.length < 2) continue;
      const fast = o.slice().sort((x, y) => x.ms - y.ms)[0], cheap = o[0];
      if (fast.unit !== cheap.unit && fast.ms < cheap.ms * 0.94 && fast.ms >= 5) ok.push([a, b, fast.ms, cheap.ms]); }
    if (!ok.length) return null;
    const [a, b, fms, cms] = pick(r, ok.sort((x, y) => (x[0] + x[1] < y[0] + y[1] ? -1 : 1)));
    const ms = Math.ceil(fms * 1.04 + 0.5); if (ms >= cms) return null;
    const ga = big.find((g) => g.includes(a)) || [], gb = big.find((g) => g.includes(b)) || [];
    const extra = [...near(W, a, ga.filter(free), 2), ...near(W, b, gb.filter(free), 2)];
    P.cities = [a, b, ...shuffle(r, extra).slice(0, 1 + Math.floor(r() * 2))];
    P.via = W.cablePairs.filter(([, x, y]) => [x, y].includes(a) || [x, y].includes(b)).flatMap(([, x, y]) => [x, y]).filter((c, i, s) => s.indexOf(c) === i && free(c) && !P.cities.includes(c)).sort((x, y) => W.km(a, x) - W.km(a, y)).slice(0, 2);
    P.lat = [a, b, ms];
  }
  if (new Set([...P.cities, ...P.via, ...P.avoid]).size !== P.cities.length + P.via.length + P.avoid.length) return null;
  if (P.cities.length < 3 || P.cities.length > 6) return null;
  // The traffic: content in the first city, eyeballs in the others (less across an ocean, where waves are dear), and
  // for a sprint a circuit between its two cities under the latency cap.
  const far = theme === 'ocean' || theme === 'islands', sizes = far ? [5, 8, 10, 15] : [10, 20, 30, 40, 60];
  P.src = [P.cities[0]];
  P.dem = P.cities.slice(1).map((c) => ({ t: 'eye', a: c, g: pick(r, sizes) }));
  if (P.lat) P.dem.unshift({ t: 'l2', a: P.lat[0], b: P.lat[1], g: 10, ms: P.lat[2] });
  return P;
}

// ---------- names and jokes: labels and their fill-ins ----------
function words(ev, W, P, r) {
  const T = JSON.parse(ev(`JSON.stringify(PZ_WK_THEMES['${P.theme}'])`)), c = P.cities, last = c[c.length - 1];
  const fill = (l) => { const need = [...new Set([...ev(`EN['${l}']`).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))], p = {};
    for (const k of need) p[k] = k === 'hub' ? P.avoid[0] : k === 'reg' ? W.C[c[0]].reg : k === 'ms' ? P.lat[2] : k === 'n' ? c.length : k === 'a' ? (P.lat ? P.lat[0] : P.theme === 'tour' ? last : c[0]) : k === 'b' ? (P.lat ? P.lat[1] : c[2] || last) : null;
    return { l, p }; };
  return { name: fill(pick(r, T.names)), joke: fill(pick(r, T.jokes)) };
}

// ---------- one week ----------
function history(dir, key) {
  const keys = list(dir).filter((k) => k < key).slice(-HISTORY);
  const files = keys.map((k) => JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')));
  return { cities: new Set(files.flatMap((f) => [...(f.cities || []), ...(f.via || []), ...(f.avoid || [])])), themes: files.slice(-THEME_GAP).map((f) => f.theme),
    regs: files.slice(-REG_GAP).map((f) => f.cities && f.cities[0]).filter(Boolean) };
}
const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).map((f) => f.slice(0, -5)).sort() : []);

// A topology's links, sized for the traffic: every wave at the smallest size that carries it all (after any single cut
// too, for the N-1 build), as the game routes it, with the cheapest routers that fit.
const TIER_G = [10, 100, 400];
function size(ev, def, links, n1) {
  ev(`pzBegin(${JSON.stringify(def)})`);
  const tot = def.dem.reduce((a, f) => a + f.g, 0), t0 = Math.max(0, TIER_G.findIndex((g) => g >= tot));
  for (let t = t0; t < TIER_G.length; t++) {
    const L = [...links.map((l) => [l.a, l.b, l.via, t, 0]), ...def.dem.map((f, i) => f.ms ? ['@route', i, 'fast'] : null).filter(Boolean)], j = SV.judge(ev, L);
    if (n1 ? j.three : j.one) { const r = n1 ? SV.improve(ev, L) : { links: L, ...j }; return r; }
  }
  return null;
}
// Plays a sized build (links and routers) in the game and returns the stars it earns.
function play(ev, def, b) {
  ev(`localStorage.removeItem('sot-puzzles');pzBegin(${JSON.stringify(def)})`);
  SV.judge(ev, b.links); ev(`pzsApplyRt(${JSON.stringify(b.rt)})`);
  return JSON.parse(ev('JSON.stringify((({stars,spend,goal,n1,cheap})=>({stars,spend,goal,n1,cheap}))(pzEval()))'));
}
const fileOf = (key, P, budget, w, sol) => ({ v: SCHEMA, key, theme: P.theme, cities: P.cities, src: P.src, dem: P.dem, via: P.via, avoid: P.avoid, budget,
  twist: Object.assign({}, P.ring ? { ring: true } : {}, P.noSub ? { noSub: true } : {}),
  name: w.name, joke: w.joke, ref: { one: sol.one.cost, three: sol.three.cost } });
// The topology search reads a sprint's latency cap from its circuit.
const shape = (def) => { const l2 = def.dem.find((f) => f.t === 'l2' && f.ms); return { theme: def.theme, cities: def.cities, via: def.via, avoid: def.avoid, noSub: def.noSub, ring: def.ring, lat: l2 ? [l2.a, l2.b, l2.ms] : null }; };
// Topology, then sizes: the 1-star and 3-star references with their prices.
function sized(g, W, P, def) {
  const sol = solve(W, P); if (!sol.one || !sol.three) return null;
  const one = size(g.ev, def, sol.one.links, false), three = size(g.ev, def, sol.three.links, true);
  if (!one || !three) return null;
  // The three-star build delivers too: when it is the cheaper one (a ring, sized down), it is the one-star reference.
  const o = one.spend <= three.spend ? one : three;
  return { one: { cost: Math.round(o.spend), b: o }, three: { cost: Math.round(three.spend), b: three } };
}
// The game's own validator decides what a puzzle is; then both references must earn their stars.
function verify(g, W, j, key, known) {
  const { ev } = g, def = JSON.parse(ev(`JSON.stringify(pzWkValid(${JSON.stringify(j)},'${key}'))`));
  if (!def) return { ok: false, why: 'the game rejects the file' };
  const P = shape(def), sol = known || sized(g, W, P, def);
  if (!sol) return { ok: false, why: 'no build delivers the traffic and survives a cut' };
  if (sol.three.cost > def.budget) return { ok: false, why: `the cheapest N-1 build found costs ${sol.three.cost}, over the budget ${def.budget}` };
  const s1 = play(ev, def, sol.one.b), s3 = play(ev, def, sol.three.b);
  if (s1.stars < 1) return { ok: false, why: `the one-star reference earns ${s1.stars} stars` };
  if (s3.stars !== 3) return { ok: false, why: `the three-star reference earns ${s3.stars} stars (${JSON.stringify(s3)})` };
  return { ok: true, sol, s1, s3 };
}

// Three stars need the smart design: the budget sits just above the cheapest N-1 build found, sized for its traffic.
const budgetOf = (sol) => Math.max(50000, ceil10k(sol.three.cost * 1.05));

function generate(g, key, dir) {
  const { ev } = g, W = world(ev);
  if (ev(`pzWeekStart('${key}')`) == null) throw new Error(`${key} is not a week`);
  // Themes take turns (none of the last weeks' again); the week's own theme first, the others only if it finds nothing.
  const hist = history(dir, key), free = THEMES.filter((t) => !hist.themes.includes(t)), h = hash(key);
  const order = free.map((_, i) => free[(h + i) % free.length]);
  for (const theme of order) {
    const cands = [];
    for (let at = 0; at < ATTEMPTS && cands.length < KEEP; at++) {
      const r = rng(hash(`${key}|${theme}|${at}`)), P = draft(W, theme, r, hist.cities);
      // Not the same part of the world as the last two weeks.
      if (!P || hist.regs.some((c) => W.C[c] && W.C[c].reg === W.C[P.cities[0]].reg && W.C[c].lands[0] === W.C[P.cities[0]].lands[0])) continue;
      const sol = solve(W, P);
      if (!sol.one || !sol.three) continue;
      // Prefer puzzles where surviving a cut takes real thought: the obvious "double everything" costs a lot more.
      const smart = sol.naive ? sol.naive.cost / sol.three.cost : 1.05, slack = sol.three.cost / sol.one.cost;
      const score = Math.min(smart, 1.6) + Math.min(slack, 2) * 0.2 + r() * 0.05;
      cands.push({ P, score, w: words(ev, W, P, r) });
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      // Sized with the traffic: the budget sits just above the cheapest N-1 build found.
      const def = JSON.parse(ev(`JSON.stringify(pzWkValid(${JSON.stringify(fileOf(key, c.P, 1e6, c.w, { one: { cost: 0 }, three: { cost: 0 } }))},'${key}'))`));
      const sol = def && sized(g, W, c.P, def);
      if (!sol) { console.warn(`${key}: rejected a ${theme} puzzle: no build carries its traffic`); continue; }
      const j = fileOf(key, c.P, budgetOf(sol), c.w, sol), v = verify(g, W, j, key, sol);
      if (v.ok) return j;
      console.warn(`${key}: rejected a ${theme} puzzle: ${v.why}`);
    }
  }
  throw new Error(`${key}: no puzzle survived verification`);
}

// --check: every file is what the game accepts, under its own name, and the weeks still to come are solvable.
function check(g, dir, now = Date.now()) {
  const { ev } = g, W = world(ev), bad = [], keys = list(dir);
  for (const k of keys) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')); } catch (e) { bad.push(`${k}: not JSON`); continue; }
    if (!ev(`!!pzWkValid(${JSON.stringify(j)},'${k}')`)) { bad.push(`${k}: the game rejects it`); continue; }
    if (!j.ref || !Number.isInteger(j.ref.one) || !Number.isInteger(j.ref.three) || j.ref.one > j.ref.three || j.ref.three > j.budget) { bad.push(`${k}: bad ref`); continue; }
    if (ev(`pzWeekStart('${k}')`) + 7 * 864e5 > now) { const v = verify(g, W, j, k); if (!v.ok) bad.push(`${k}: ${v.why}`); }
  }
  const ip = path.join(dir, 'index.json');
  if (keys.length) {
    let idx = null; try { idx = JSON.parse(fs.readFileSync(ip, 'utf8')); } catch (e) { /* reported below */ }
    if (!idx || idx.v !== SCHEMA || JSON.stringify(idx.weeks) !== JSON.stringify(keys)) bad.push('index.json does not list exactly the weekly files');
  }
  return bad;
}
/* --check, first part: a release can change prices, cables or cities under weeks that are already published. Every
   week not over yet is re-solved with this game; when its budget no longer verifies it is regenerated, deterministically:
   the same puzzle (theme, cities, twist, name) with a new budget when that still works, else a fresh puzzle for the
   same key. Its rev goes up, so players' stars for that week (and only that week) start again; new references alone
   keep the rev. Past weeks can no longer be played, so they keep their stars and are only replaced when the game
   rejects them outright. Returns what changed and what could not be fixed. */
function refresh(g, dir, now = Date.now()) {
  const { ev } = g, W = world(ev), fixed = [], bad = [];
  for (const k of list(dir)) {
    const f = path.join(dir, k + '.json');
    let j = null; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* regenerated below */ }
    const valid = !!j && ev(`!!pzWkValid(${JSON.stringify(j)},'${k}')`), live = ev(`pzWeekStart('${k}')`) + 7 * 864e5 > now;
    if (valid && !live) continue;
    const v = valid ? verify(g, W, j, k) : null;
    if (v && v.ok) {
      if (j.ref && j.ref.one === v.sol.one.cost && j.ref.three === v.sol.three.cost) continue;
      j.ref = { one: v.sol.one.cost, three: v.sol.three.cost }; writeWeek(dir, j); fixed.push(`${k}: new references`); continue;
    }
    const rev = (j && Number.isInteger(j.rev) && j.rev >= 2 ? j.rev : 1) + 1;
    let n = null;
    if (valid) {
      const def = JSON.parse(ev(`JSON.stringify(pzWkValid(${JSON.stringify(j)},'${k}'))`));
      const sol = sized(g, W, shape(def), def);
      if (sol) {
        const c = Object.assign({}, j, { budget: budgetOf(sol), ref: { one: sol.one.cost, three: sol.three.cost }, rev });
        if (verify(g, W, c, k, sol).ok) n = c;
      }
    }
    if (!n) { try { n = Object.assign(generate(g, k, dir), { rev }); } catch (e) { bad.push(`${k}: could not regenerate (${e.message})`); continue; } }
    writeWeek(dir, n); fixed.push(`${k}: regenerated as rev ${rev}${n.theme === (j && j.theme) && JSON.stringify(n.cities) === JSON.stringify(j.cities) ? ', same puzzle, new budget ' + n.budget : ', a new ' + n.theme + ' puzzle'}`);
  }
  let idx = null; try { idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { /* rewritten */ }
  if (list(dir).length && (!idx || idx.v !== SCHEMA || JSON.stringify(idx.weeks) !== JSON.stringify(list(dir)))) { writeIndex(dir); fixed.push('index.json rewritten'); }
  return { fixed, bad };
}
const writeIndex = (dir) => fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: SCHEMA, weeks: list(dir) }) + '\n');
const writeWeek = (dir, j) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, j.key + '.json'), JSON.stringify(j) + '\n'); writeIndex(dir); };

module.exports = { game, generate, check, refresh, solve, sized, shape, world, writeWeek, writeIndex, list };

if (require.main === module) {
  const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const dir = path.resolve(ROOT, opt('--dir', 'site/puzzles/weekly')), g = game(opt('--page') && path.resolve(opt('--page')));
  if (args.includes('--check')) {
    // Fix what a release's new prices broke, then check everything; only what could not be fixed fails.
    const r = refresh(g, dir);
    for (const x of r.fixed) console.log(`fixed: ${x}`);
    const bad = [...r.bad, ...check(g, dir)];
    for (const b of bad) console.error(`error: ${b}`);
    console.log(bad.length ? `${bad.length} problem(s)` : `${list(dir).length} weekly puzzle(s) OK`);
    process.exit(bad.length ? 1 : 0);
  }
  // By default the week that holds "12 hours from now": run early on Sunday, that is the week starting that morning.
  const first = opt('--key') || g.ev(`pzWeekKey(Date.now()+12*3600e3)`), n = +opt('--next', 1);
  for (let i = 0; i < n; i++) {
    const key = g.ev(`pzKeyAdd('${first}',${i})`);
    if (!key) { console.error(`error: ${first} is not a week`); process.exit(1); }
    if (fs.existsSync(path.join(dir, key + '.json')) && !args.includes('--force')) { console.log(`${key}: already there`); continue; }
    const j = generate(g, key, dir); writeWeek(dir, j);
    console.log(`${key}: ${j.theme}, ${j.cities.join(' ')}${j.via.length ? ' via ' + j.via.join(' ') : ''}${j.avoid.length ? ' avoid ' + j.avoid.join(' ') : ''}, budget ${j.budget} (1★ ${j.ref.one}, 3★ ${j.ref.three})`);
  }
}
