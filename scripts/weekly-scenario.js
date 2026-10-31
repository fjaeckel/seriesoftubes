#!/usr/bin/env node
// The weekly scenario generator, the twin of scripts/weekly-puzzle.js. Every Sunday .github/workflows/weekly-puzzle.yml
// runs both; this one publishes site/scenarios/weekly/<key>.json, which the game fetches when the Scenarios list opens
// (src/game/60-features/94-scenarios-weekly.js). It loads the real game headless, so it uses the game's own cities,
// cables, prices, week keys, file validator and goal code.
//
//   node scripts/weekly-scenario.js                  the week starting on the coming (or current) Sunday 06:00 Berlin, if missing
//   node scripts/weekly-scenario.js --key 2026-W45   that week (--force replaces an existing file)
//   node scripts/weekly-scenario.js --next 3         this week and the next two
//   node scripts/weekly-scenario.js --check          re-play every week not over yet with this game; a week its reference
//                                                    no longer wins is regenerated with rev + 1 (see refresh()); then
//                                                    validate every file. Fails only if that fails.
//   --page FILE / --dir DIR                          another build of the game / where the files live
//
// How a scenario is made: pick a theme the last weeks did not have (TEMPLATES, plain data), a home city from another part
// of the world than the last weeks', its rules and the reference plan (which links to build, in order). Then the
// reference player (scripts/lib/scenario-bot.js) plays it through the game's own actions with the scenario's seed. The
// goal's number is calibrated from that run (what the reference reached about three quarters of the way in), and the
// scenario is verified: not won on day 0, won by the reference with time to spare. Its finishing day is the par.
const fs = require('node:fs');
const path = require('node:path');
const BOT = require('./lib/scenario-bot');

const ROOT = path.join(__dirname, '..');
const SCHEMA = 1, HISTORY = 4, THEME_GAP = 4, REG_GAP = 3, ATTEMPTS = 12, AT = 0.8, MARGIN = 0.9;

// ---------- the templates: data only. `home` names a city pool, `goal` a goal type of the game, `plan` a planner ----------
const TEMPLATES = {
  budget: { goal: 'served', home: 'big', days: [240, 300], cash: [150000, 250000], lvl: 2, mods: ['pricey'], plan: 'spread', hops: 4 },
  spat: { goal: 'reach', home: 'big', days: [240, 300], cash: [500000, 800000], lvl: 2, rules: { spat: true }, plan: 'spread', hops: 3, tr2: true, avoid: ['cog'] },
  region: { goal: 'ix', home: 'ixrich', days: [270, 365], cash: [200000, 350000], lvl: 2, plan: 'exchanges', hops: 14 },
  event: { goal: 'event', home: 'big', days: [180, 240], cash: [500000, 900000], lvl: 2, plan: 'spread', hops: 2, sizes: [1600, 800, 400, 200] },
  flood: { goal: 'floods', home: 'big', days: [240, 300], cash: [1500000, 2500000], lvl: 3, rules: { ddos: true }, plan: 'spread', hops: 2, scrub: 1 },
  island: { goal: 'pops', home: 'island', days: [240, 365], cash: [250000, 500000], lvl: 3, plan: 'islands', hops: 3 },
  cable: { goal: 'path', home: 'landing', days: [270, 365], cash: [200000, 400000], lvl: 3, plan: 'detour', g: [400, 800], n: 45 },
  latency: { goal: 'lat', home: 'fast', days: [180, 270], cash: [300000, 600000], lvl: 3, plan: 'fast', n: 60 },
};

// ---------- the game, headless ----------
function game(file) {
  const { load } = require('../tests/harness');
  let g = load(file ? { file } : {});
  if (file && !g.ev("typeof wsValid==='function'")) { console.warn(`warning: ${file} has no weekly scenarios yet; using src/ instead`); g = load(); }
  return g;
}
const J = (ev, s) => JSON.parse(ev(`JSON.stringify(${s})`));

// ---------- small helpers ----------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const between = (r, [lo, hi], step) => lo + Math.floor(r() * ((hi - lo) / step + 1)) * step;
// A goal number players can read: two significant digits, rounded down.
const nice = (x) => { if (x < 10) return Math.max(1, Math.floor(x)); const p = 10 ** (Math.floor(Math.log10(x)) - 1); return Math.floor(x / p) * p; };

// ---------- the world, as the game sees it ----------
function world(ev) {
  const cities = J(ev, `Object.values(CITY).filter(c=>pzCityOk(c.id)).map(c=>({id:c.id,reg:c.reg,P:c.P,land:lands(c)[0],nl:lands(c).length,ix:ixIdsIn(c.id).length,lon:c.lon,lat:c.lat}))`);
  const C = Object.fromEntries(cities.map((c) => [c.id, c]));
  const pairs = J(ev, 'CABLE_PAIRS.map(p=>[p.cid,p.a,p.b])').filter(([, a, b]) => C[a] && C[b]);
  const byLand = {}; for (const c of cities) (byLand[c.land] = byLand[c.land] || []).push(c.id);
  const km = (a, b) => { const A = C[a], B = C[b], r = Math.PI / 180, h = Math.sin((B.lat - A.lat) * r / 2) ** 2 + Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin((B.lon - A.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const cabs = (c) => pairs.filter(([, a, b]) => a === c || b === c);
  const pools = {
    big: cities.filter((c) => c.P >= 150 && byLand[c.land].length >= 5).map((c) => c.id),
    ixrich: cities.filter((c) => c.ix && cities.filter((x) => x.reg === c.reg && x.land === c.land && x.ix && km(c.id, x.id) < 2500).length >= 9).map((c) => c.id),
    island: cities.filter((c) => byLand[c.land].length <= 2 && c.nl === 1 && cabs(c.id).length >= 2).map((c) => c.id),
    landing: cities.filter((c) => c.P >= 100 && cabs(c.id).length >= 3).map((c) => c.id),
    fast: cities.filter((c) => c.P >= 100 && cabs(c.id).length >= 2).map((c) => c.id),
  };
  return { cities, C, pairs, byLand, km, cabs, pools };
}
const near = (W, c, from, n) => from.filter((x) => x !== c).sort((a, b) => W.km(c, a) - W.km(c, b)).slice(0, n);

// ---------- drafts: a template, a home, rules, the goal's fixed parameters and the reference plan ----------
// Plans are lists of steps for the reference player: {k:'hop',v:[a,b,tier,via]} lights a wave a-b (a new POP at b).
function draft(g, W, theme, r, hist) {
  const T = TEMPLATES[theme], free = (c) => !hist.cities.has(c) && !hist.regs.includes(W.C[c].reg);
  const homes = W.pools[T.home].filter(free); if (!homes.length) return null;
  const home = pick(r, homes), H = W.C[home];
  const f = { theme, city: home, cash: between(r, T.cash, 50000), days: between(r, T.days, 10), lvl: T.lvl, rules: { ...(T.rules || {}) }, mods: (T.mods || []).slice() };
  const plan = { home, bb: true, ix: true, steps: [], avoid: T.avoid || [], tr2: !!T.tr2, scrub: T.scrub || 0 };
  const hop = (a, b, t = 1, via = null) => plan.steps.push({ k: 'hop', v: [a, b, t, via] });
  const land = W.byLand[H.land].filter((c) => c !== home && W.km(home, c) < 1500);
  let goal = null, words = {};
  if (T.plan === 'spread') {
    // Overland to the nearest big cities, each from the closest POP already built.
    const to = near(W, home, land.filter((c) => W.C[c].P >= 60), T.hops); if (to.length < Math.min(2, T.hops)) return null;
    const built = [home]; for (const c of to) { hop(near(W, c, built, 1)[0], c); built.push(c); }
    if (theme === 'budget') goal = { t: 'served', p: { g: 0 } };
    if (theme === 'spat') goal = { t: 'reach', p: { r: 99, g: 0 } };
    if (theme === 'flood') goal = { t: 'floods', p: { n: 0, big: 0 } };
    if (theme === 'event') { const day = Math.round(f.days * (0.6 + r() * 0.15)); goal = { t: 'event', p: { city: home, g: 0, day, dur: 3 + Math.floor(r() * 3) } }; plan.event = { city: home, day }; words = { day }; }
  } else if (T.plan === 'exchanges') {
    const to = near(W, home, W.cities.filter((c) => c.reg === H.reg && c.land === H.land && c.ix).map((c) => c.id), T.hops); if (to.length < T.hops) return null;
    const built = [home]; for (const c of to) { hop(near(W, c, built, 1)[0], c); built.push(c); }
    plan.allIx = true; goal = { t: 'ix', p: { reg: H.reg, n: 0 } }; words = { reg: H.reg };
  } else {
    // Cable work: plan inside the game, which knows each pair's cables under this scenario's rules.
    let a = home, b = null, cs = null;
    if (theme === 'cable') {
      // Cut one cable everywhere it lands; the goal is its far end, the long way round.
      const mine = W.cabs(home).filter(([, x, y]) => W.C[x].land !== W.C[y].land && W.C[x === home ? y : x].P >= 60);
      if (!mine.length) return null;
      const [cid, x, y] = pick(r, mine); b = x === home ? y : x;
      // The whole cable, and every other cable straight from home to its far end: the corridor is closed.
      const cut = new Set([cid, ...W.pairs.filter(([, p, q]) => (p === home && q === b) || (p === b && q === home)).map(([c]) => c)]);
      f.rules.banPairs = W.pairs.filter(([c, p, q]) => c === cid || (cut.has(c) && [p, q].includes(home) && [p, q].includes(b))).map(([c, p, q]) => `${c}:${p}-${q}`);
      if (f.rules.banPairs.length > 40) return null;
      const gb = pick(r, T.g); plan.tier = J(g.ev, `LT.findIndex(x=>x.g>=${gb})`);
      goal = { t: 'path', p: { a, b, g: gb, n: T.n } }; words = { cab: cid, a, b };
    } else if (theme === 'island') {
      const hops = W.cabs(home).map(([, x, y]) => (x === home ? y : x)).filter((c, i, s) => s.indexOf(c) === i && W.km(home, c) < 6000);
      if (hops.length < 2) return null;
      // The nearest islands a cable away, and one more island further out.
      const isl = W.pools.island.filter((c) => c !== home && W.km(home, c) < 9000 && !hops.includes(c));
      cs = [...near(W, home, hops, 2), ...near(W, home, isl, 1 + Math.floor(r() * 2))];
      if (cs.length < 3) return null;
      goal = { t: 'pops', p: { cs } };
    } else if (theme === 'latency') {
      // Far enough that the fast way takes more than one cable.
      const ok = W.cities.filter((c) => c.P >= 100 && c.land !== H.land && W.km(home, c.id) > 5000 && W.km(home, c.id) < 11000 && W.cabs(c.id).length >= 2).map((c) => c.id);
      if (!ok.length) return null; b = pick(r, ok); goal = { t: 'lat', p: { a, b, ms: 0, n: T.n } }; words = { a, b };
    }
    plan.targets = cs || [b]; plan.fast = theme === 'latency';
    f.goal = goal;
    return { f, plan, words, T };
  }
  f.goal = goal;
  return { f, plan, words, T };
}

// ---------- names and descriptions: labels and their fill-ins ----------
function texts(ev, d, r) {
  const T = J(ev, `WS_THEMES['${d.f.theme}']`), p = d.f.goal.p;
  const fill = (l) => { const need = [...new Set([...ev(`EN['${l}']`).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))], o = {};
    for (const k of need) o[k] = k === 'city' ? d.f.city : k === 'ms' ? p.ms : k === 'g' ? p.g : k === 'n' ? p.n : d.words[k];
    return { l, p: o }; };
  return { name: fill(pick(r, T.names)), desc: fill(pick(r, T.descs)) };
}

// ---------- playing a draft ----------
const fileOf = (key, d, seed, extra) => ({ v: SCHEMA, key, theme: d.f.theme, city: d.f.city, cash: d.f.cash, days: d.f.days, lvl: d.f.lvl, rules: d.f.rules, mods: d.f.mods, goal: d.f.goal, ...extra, seed, ref: d.plan });
// Cable plans are made in the game, once the scenario's rules are in force: the shortest chain of POPs to each target.
function cablePlan(ev, plan) {
  if (!plan.targets) return plan;
  const steps = J(ev, `(()=>{const home=S.scn.home,T=${JSON.stringify(plan.targets)},fast=${!!plan.fast},out=[],have=new Set([home]);
    const ok=c=>pzCityOk(c)&&cityOn(c)&&!cnCity(c);
    const edges=u=>{const o=[];for(const p of CABLE_PAIRS){const v=p.a===u?p.b:p.b===u?p.a:null;if(!v||!ok(v))continue;const cs=cablesOk(u,v);if(!cs.length)continue;
      const c=cs.slice().sort((x,y)=>x.km*(CAB[x.cid].lat||1)-y.km*(CAB[y.cid].lat||1))[0];o.push([v,c.km*(CAB[c.cid].lat||1)/200,c.cid]);}
      for(const c of CITIES)if(c.id!==u&&ok(c.id)&&!isSub(u,c.id)&&kmBetween(u,c.id)<(fast?4000:1800))o.push([c.id,kmBetween(u,c.id)*1.3/200,null]);return o;};
    for(const t of T){if(have.has(t))continue;const d={},pv={},done=new Set();for(const h of have)d[h]=0;
      for(;;){let u=null;for(const k in d)if(!done.has(k)&&(u===null||d[k]<d[u]))u=k;if(u===null||u===t)break;done.add(u);for(const [v,w,cid] of edges(u)){const nd=d[u]+(fast?w:1+w/1000);if(!(d[v]<=nd)){d[v]=nd;pv[v]=[u,cid];}}}
      if(d[t]===undefined)return null;const chain=[];for(let v=t;!have.has(v);v=pv[v][0])chain.unshift([pv[v][0],v,${plan.tier || 1},pv[v][1]]);for(const h of chain){out.push({k:'hop',v:h});have.add(h[1]);}}
    return out;})()`);
  return steps ? { ...plan, steps } : null;
}
// Starts the draft in the game (so its rules apply), finishes the plan, and plays it with the reference player.
function run(g, file, plan, days) {
  const { ev } = g;
  ev(`localStorage.removeItem('sot-wkscn');wsBegin(${JSON.stringify(file)},'Ref');if(UI.pendGame)ACT.pitchSkip()`);
  const p = cablePlan(ev, plan); if (!p || (plan.targets && p.steps.length < 2)) return null;
  return { plan: p, res: BOT.play(ev, { ...file, ref: p }, p, { days, stop: false }) };
}

// The goal's number, from the reference run: what it held about three quarters of the way in.
function calibrate(g, d, key, seed) {
  const { f } = d, p = f.goal.p, t = f.goal.t, at = Math.round(f.days * AT);
  // The validator wants a complete goal: start from placeholders the game accepts.
  const probe = JSON.parse(JSON.stringify(f.goal));
  if (t === 'served') probe.p.g = 50000; if (t === 'reach') probe.p.g = 50000; if (t === 'ix') probe.p.n = 60; if (t === 'floods') probe.p.n = 60;
  if (t === 'event') probe.p.g = 10; if (t === 'lat') probe.p.ms = 400;
  // Probed with placeholder numbers; the real name and text are filled in once the numbers are known.
  const tmp = { ...d, f: { ...f, goal: probe } }, file = fileOf(key, tmp, seed, { ...texts(g.ev, tmp, rng(1)), par: 1 });
  if (t === 'event') {
    // The biggest event the reference delivers in full.
    for (const size of d.T.sizes) { probe.p.g = size; file.goal = probe; const o = run(g, { ...file }, { ...d.plan, event: { ...d.plan.event, g: size } }, p.day + p.dur + 1); if (o && g.ev('(S.stats.evFull||0)>=1')) { p.g = size; return { plan: o.plan }; } }
    return null;
  }
  if (t === 'lat') {
    const o = run(g, file, d.plan, at); if (!o) return null;
    const best = g.ev(`bestLat('${p.a}','${p.b}')`); if (!isFinite(best)) return null;
    p.ms = Math.ceil(best * 1.03 + 0.5); return { plan: o.plan };
  }
  const o = run(g, file, d.plan, at); if (!o) return null;
  const m = o.res.m, v = m[m.length - 1];
  if (t === 'served') p.g = nice(Math.min(...m.slice(-14)));
  if (t === 'reach') { if (g.ev('R.reach') < 0.99) return null; p.g = nice(Math.min(...m.slice(-14))); }
  if (t === 'ix') p.n = Math.floor(v);
  if (t === 'floods') { p.n = Math.floor(v); p.big = Math.min(5, g.ev('S.stats.ddosOkBig||0')); }
  if ((p.g !== undefined && p.g < 5) || (p.n !== undefined && p.n < 2)) return null;
  return { plan: o.plan };
}

// The game's validator decides what a scenario is; then it must need play, and the reference must win with time to spare.
function verify(g, j) {
  const { ev } = g;
  if (!ev(`!!wsValid(${JSON.stringify(j)},'${j.key}')`)) return { ok: false, why: 'the game rejects the file' };
  // Played with the longest clock the game allows, so a late win still shows its day (the days change nothing else).
  const res = BOT.play(ev, { ...j, days: 400 }, j.ref, { stop: true });
  if (res.won0) return { ok: false, why: 'won on day 0' };
  if (!res.won) return { ok: false, why: `the reference does not win in ${j.days} days` };
  if (res.won > j.days * MARGIN) return { ok: false, late: res.won, why: `the reference wins only on day ${res.won} of ${j.days}` };
  if (res.won < 40) return { ok: false, why: `the reference wins already on day ${res.won} of ${j.days}` };
  return { ok: true, par: res.won };
}

// ---------- one week ----------
const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).map((f) => f.slice(0, -5)).sort() : []);
function history(W, dir, key) {
  const files = list(dir).filter((k) => k < key).slice(-HISTORY).map((k) => JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')));
  return { themes: files.slice(-THEME_GAP).map((f) => f.theme), regs: files.slice(-REG_GAP).map((f) => W.C[f.city] && W.C[f.city].reg).filter(Boolean), cities: new Set(files.map((f) => f.city)) };
}
function generate(g, key, dir) {
  const { ev } = g, W = world(ev);
  if (ev(`pzWeekStart('${key}')`) == null) throw new Error(`${key} is not a week`);
  const hist = history(W, dir, key), free = Object.keys(TEMPLATES).sort().filter((t) => !hist.themes.includes(t)), h = hash('scn|' + key);
  const order = free.map((_, i) => free[(h + i) % free.length]);
  for (const theme of order) {
    for (let at = 0; at < ATTEMPTS; at++) {
      const r = rng(hash(`${key}|${theme}|${at}`)), d = draft(g, W, theme, r, hist);
      if (!d) continue;
      const seed = 1 + (hash(`${key}|seed|${at}`) % 2147483646), c = calibrate(g, d, key, seed);
      if (!c) { console.warn(`${key}: rejected a ${theme} scenario in ${d.f.city}: no goal to calibrate`); continue; }
      d.plan = c.plan;
      const w = texts(ev, d, r), j = fileOf(key, d, seed, { name: w.name, desc: w.desc, par: 1 });
      let v = verify(g, j);
      // A goal with a fixed bar (a path, a set of POPs, a latency) gets the days the reference needed, and a third more.
      const day = v.ok ? v.par : v.late;
      if (day && ['path', 'pops', 'lat'].includes(j.goal.t)) { j.days = Math.min(365, Math.max(180, Math.ceil(day / 0.7 / 10) * 10)); v = verify(g, j); }
      if (v.ok) { j.par = v.par; return order0(j); }
      console.warn(`${key}: rejected a ${theme} scenario in ${d.f.city}: ${v.why}`);
    }
  }
  throw new Error(`${key}: no scenario survived verification`);
}
// Fields in a fixed order, so files diff well.
const order0 = (j) => { const o = {}; for (const k of ['v', 'key', 'rev', 'theme', 'city', 'cash', 'days', 'lvl', 'rules', 'mods', 'goal', 'name', 'desc', 'seed', 'par', 'ref']) if (j[k] !== undefined) o[k] = j[k]; return o; };

// --check: every file is what the game accepts, under its own name, listed in the index; weeks not over yet still verify.
function check(g, dir, now = Date.now()) {
  const { ev } = g, bad = [], keys = list(dir);
  for (const k of keys) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')); } catch (e) { bad.push(`${k}: not JSON`); continue; }
    if (!ev(`!!wsValid(${JSON.stringify(j)},'${k}')`)) { bad.push(`${k}: the game rejects it`); continue; }
    if (!j.ref || !Array.isArray(j.ref.steps)) { bad.push(`${k}: no reference plan`); continue; }
    if (ev(`pzWeekStart('${k}')`) + 7 * 864e5 > now) { const v = verify(g, j); if (!v.ok) bad.push(`${k}: ${v.why}`); else if (v.par !== j.par) bad.push(`${k}: par is ${j.par}, the reference wins on day ${v.par}`); }
  }
  let idx = null; try { idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { /* reported below */ }
  if (keys.length && (!idx || idx.v !== SCHEMA || JSON.stringify(idx.weeks) !== JSON.stringify(keys))) bad.push('index.json does not list exactly the weekly files');
  return bad;
}
/* --check, first part: a release can change prices, cables or the simulation under weeks already published. Every week
   not over yet is re-played with this game. Still won with time to spare: only its par follows. Not any more: it is
   regenerated for the same key, deterministically, with rev + 1, so last week's wins for it no longer show. Past weeks
   are only replaced when the game rejects them outright. */
function refresh(g, dir, now = Date.now()) {
  const { ev } = g, fixed = [], bad = [];
  for (const k of list(dir)) {
    let j = null; try { j = JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')); } catch (e) { /* regenerated */ }
    const valid = !!j && ev(`!!wsValid(${JSON.stringify(j)},'${k}')`) && j.ref && Array.isArray(j.ref.steps), live = ev(`pzWeekStart('${k}')`) + 7 * 864e5 > now;
    if (valid && !live) continue;
    const v = valid ? verify(g, j) : null;
    if (v && v.ok) { if (v.par !== j.par) { j.par = v.par; writeWeek(dir, j); fixed.push(`${k}: new par ${v.par}`); } continue; }
    const rev = (j && Number.isInteger(j.rev) && j.rev >= 2 ? j.rev : 1) + 1;
    let n; try { n = order0({ ...generate(g, k, dir), rev }); } catch (e) { bad.push(`${k}: could not regenerate (${e.message})`); continue; }
    writeWeek(dir, n); fixed.push(`${k}: regenerated as rev ${rev}, a ${n.theme} scenario in ${n.city}`);
  }
  let idx = null; try { idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { /* rewritten */ }
  if (list(dir).length && (!idx || idx.v !== SCHEMA || JSON.stringify(idx.weeks) !== JSON.stringify(list(dir)))) { writeIndex(dir); fixed.push('index.json rewritten'); }
  return { fixed, bad };
}
const writeIndex = (dir) => fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: SCHEMA, weeks: list(dir) }) + '\n');
const writeWeek = (dir, j) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, j.key + '.json'), JSON.stringify(j) + '\n'); writeIndex(dir); };

module.exports = { game, generate, verify, check, refresh, list, writeWeek, TEMPLATES };

if (require.main === module) {
  const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const dir = path.resolve(ROOT, opt('--dir', 'site/scenarios/weekly')), g = game(opt('--page') && path.resolve(opt('--page')));
  if (args.includes('--check')) {
    const r = refresh(g, dir);
    for (const x of r.fixed) console.log(`fixed: ${x}`);
    const bad = [...r.bad, ...check(g, dir)];
    for (const b of bad) console.error(`error: ${b}`);
    console.log(bad.length ? `${bad.length} problem(s)` : `${list(dir).length} weekly scenario(s) OK`);
    process.exit(bad.length ? 1 : 0);
  }
  const first = opt('--key') || g.ev(`pzWeekKey(Date.now()+12*3600e3)`), n = +opt('--next', 1);
  for (let i = 0; i < n; i++) {
    const key = g.ev(`pzKeyAdd('${first}',${i})`);
    if (!key) { console.error(`error: ${first} is not a week`); process.exit(1); }
    if (fs.existsSync(path.join(dir, key + '.json')) && !args.includes('--force')) { console.log(`${key}: already there`); continue; }
    const j = generate(g, key, dir); writeWeek(dir, j);
    console.log(`${key}: ${j.theme} in ${j.city}, ${j.days} days, goal ${j.goal.t} ${JSON.stringify(j.goal.p)}, par ${j.par}`);
  }
}
