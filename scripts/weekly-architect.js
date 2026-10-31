#!/usr/bin/env node
// The weekly Architect run generator, the twin of scripts/weekly-puzzle.js. Every Sunday .github/workflows/weekly-puzzle.yml
// runs it to publish site/architect/weekly/<key>.json, which the game fetches when Puzzles opens
// (src/game/60-features/98-architect-weekly.js). It plays the real game headless, so the briefs are judged by the game's
// own checklist and chaos monkey review.
//
//   node scripts/weekly-architect.js                  the week starting on the coming (or current) Sunday 06:00 Berlin, if missing
//   node scripts/weekly-architect.js --key 2026-W45   that week (--force replaces an existing file)
//   node scripts/weekly-architect.js --next 3         this week and the next two
//   node scripts/weekly-architect.js --check          re-play every week not over yet; one whose reference no longer
//                                                     earns three stars is regenerated with rev + 1; then validate every file
//   --page FILE / --dir DIR                           another build of the game / where the files live
//
// How a run is made: an HQ in a region the last weeks did not have, and its nearest cities as the sites to come. Then a
// reference architect plays it brief by brief, and each brief is designed against the network it has built so far, so
// every brief asks for something new: a site to connect, a site that one cut would strand made mission-critical, a ring
// it does not have yet, a latency cap its paths miss, a site that closes. The reference builds the cheapest fix it finds
// (connect to the nearest POP; for a site a cut strands, the cheapest tube from the stranded side to the rest on another
// trench or cable) until the game's review passes. Its tube count is the brief's plan, its spend plus a little the
// budget, and the whole run is then replayed from the file and must earn three stars.
const fs = require('node:fs');
const path = require('node:path');
const { game, world } = require('./weekly-puzzle');

const ROOT = path.join(__dirname, '..');
const SCHEMA = 1, HISTORY = 4, ATTEMPTS = 40, DEM_MAX = 380;
const NAMES = ['architect_weekly.name_all_roads_lead_to_hq', 'architect_weekly.name_the_hq_job', 'architect_weekly.name_hq_and_friends'];
const JOKES = ['architect_weekly.joke_hq_signed_the_lease', 'architect_weekly.joke_one_network_a_handful'];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const shuffle = (r, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ceil10k = (x) => Math.ceil(x / 10000) * 10000;
const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).map((f) => f.slice(0, -5)).sort() : []);
const J = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));

// ---------- playing the game ----------
// Load a run definition into the page as this week's, with the briefs known so far.
function stage(ev, key, hq, briefs) {
  ev(`UI.arWk={key:'${key}',def:{id:arWkId('${key}'),key:'${key}',wk:true,n:'',j:'',hq:'${hq}',via:[],budget:2e7,briefs:${JSON.stringify(briefs)},rev:1},at:Date.now()}`);
}
// Lay one tube the way a player does: a diverse trench when the pair already has one overland. The size is what all
// the traffic needs (100G, or 400G once there is more than 100G), smaller where a long cable cannot take it.
const tierFor = (ev) => (ev('S.pz.cities.reduce((a,c)=>a+(c===S.ar.hq?0:arDem(c)),0)') > 100 ? 2 : 1);
function lay(ev, a, b, via, tier) {
  if (!ev(`!!S.pops['${a}']`)) [a, b] = [b, a];
  const n = ev('S.links.length');
  for (let t = tier == null ? tierFor(ev) : tier; t >= 0; t--) {
    ev(`ACT.pzLinkTo({a:'${a}',b:'${b}'});ACT.pzVia({v:'${via}'});ACT.pzDiv({v:1});ACT.pzLink({tier:${t}});closeModal()`);
    if (ev('S.links.length') === n + 1) return [a, b, via, t];
    if (tier != null) break;
  }
  throw new Error(`could not lay ${a}-${b} ${via}`);
}
// One step of a reference, as the file keeps it: a tube [a, b, route, size], ['@rm', city] closing a POP, or
// ['@tier', n, size] resizing the n-th tube.
function step(ev, s) {
  if (s[0] === '@rm') { ev(`ACT.pzRmPop({city:'${s[1]}'})`); return; }
  if (s[0] === '@tier') { const n = ev(`(()=>{const l=S.links[${s[1]}];ACT.pzTier({id:l.id,tier:${s[2]}});return S.links[${s[1]}].tier;})()`); if (n !== s[2]) throw new Error(`could not resize tube ${s[1]}`); return; }
  lay(ev, s[0], s[1], s[2], s[3]);
}
// Room for the traffic: upsize the busiest tube that is not cut (or, when it cannot grow, lay a second one beside it).
function makeRoom(ev, W, steps, cut) {
  const ls = J(ev, `(()=>{${cut ? `for(const l of S.links)if(pzUnit(l)===${JSON.stringify(cut)})l.cut=1;` : ''}compute();const o=S.links.map((l,i)=>({i,a:l.a,b:l.b,cut:!!l.cut,tier:l.tier,u:(R.load[l.id]||0)/capOf(l)})).filter(x=>!x.cut).sort((x,y)=>y.u-x.u);for(const l of S.links)l.cut=0;compute();return o;})()`);
  for (const l of ls.slice(0, 3)) {
    if (l.tier < 2) { const t = ev(`(()=>{const l=S.links[${l.i}];ACT.pzTier({id:l.id,tier:${l.tier + 1}});return S.links[${l.i}].tier;})()`); if (t === l.tier + 1) { steps.push(['@tier', l.i, t]); return; } }
    const o = W.opts(l.a, l.b).filter((x) => !x.second).sort((x, y) => x.cost - y.cost)[0];
    if (o) { try { steps.push(lay(ev, o.a, o.b, o.via)); return; } catch (e) { /* try the next tube */ } }
  }
  throw new Error('no room to be made');
}
// What the review would say: the first cut that strands a mission-critical site or leaves a site short.
const reviewFail = (ev) => J(ev, `(()=>{let f=null;for(const u of [...new Set(S.links.map(pzUnit))]){const x=arCut(u);for(const l of x.ls)l.cut=0;if(x.gold.length||x.short.length){f={u,gold:x.gold,short:x.short,dark:x.dark};break;}}compute();return f;})()`);
const passes = (ev) => ev('arShowStart();arShowSkip();S.ar.passed===pzSig()');

// The reference architect: fix what the checklist and the review find, cheapest first, until the brief passes.
function solveBrief(ev, W, steps) {
  for (let guard = 0; guard < 24; guard++) {
    for (const c of J(ev, 'S.pz.avoid.filter(c=>S.pops[c])')) { ev(`ACT.pzRmPop({city:'${c}'})`); steps.push(['@rm', c]); }
    const e = J(ev, '(()=>{const e=arEval(),r=[...arReach(S.ar.hq,arAdj())];return {conn:e.conn,lat:e.lat,rings:e.rings,ready:e.ready,why:e.why,r,miss:e.sites.filter(s=>!s.ok).map(s=>s.c)};})()');
    const best = (from, to, skip) => { let o = null; for (const a of from) for (const b of to) if (a !== b) for (const x of W.opts(a, b)) if (!x.second && x.unit !== skip && (!o || x.cost < o.cost)) o = x; return o; };
    if (!e.conn) { const c = e.miss[0], o = best([c], e.r); if (!o) throw new Error(`no way to ${c}`); steps.push(lay(ev, o.a, o.b, o.via)); continue; }
    if (e.lat && !e.lat.ok) { const os = W.opts(e.lat.a, e.lat.b).filter((x) => !x.second && x.ms <= e.lat.cap).sort((x, y) => x.cost - y.cost); if (!os.length) throw new Error('latency cap out of reach'); steps.push(lay(ev, os[0].a, os[0].b, os[0].via)); continue; }
    const rg = e.rings.find((x) => !x.ok);
    if (rg) { const cs = rg.cs, has = J(ev, 'S.links.map(l=>edgeKey(l))'); let done = false;
      for (let i = 0; i < cs.length && !done; i++) { const a = cs[i], b = cs[(i + 1) % cs.length]; if (has.includes(ev(`edgeKey({a:'${a}',b:'${b}'})`))) continue; const o = best([a], [b]); if (o) { steps.push(lay(ev, o.a, o.b, o.via)); done = true; } }
      if (!done) throw new Error('ring out of reach'); continue; }
    if (!e.ready) { if (/thin/i.test(e.why) || J(ev, 'arEval().sites.some(s=>!s.full)')) { makeRoom(ev, W, steps, null); continue; } throw new Error(`not ready: ${e.why}`); }
    const f = reviewFail(ev); if (!f) return;
    if (f.short.length && !f.gold.length) { makeRoom(ev, W, steps, f.u); continue; }
    // A cut strands a mission-critical site: join the stranded side to the rest another way.
    const rest = J(ev, `Object.keys(S.pops).filter(c=>!${JSON.stringify(f.dark)}.includes(c))`), o = best(f.dark, rest, f.u);
    if (!o) throw new Error('no second way'); steps.push(lay(ev, o.a, o.b, o.via));
  }
  throw new Error('the brief would not pass');
}

// ---------- designing a run ----------
// The brief kinds after the first two. Each is designed against the reference network as it stands, or refused (null).
function design(kind, ev, W, r, s) {
  const pops = J(ev, 'S.pz.cities'), gold = J(ev, 'S.ar.gold'), hq = s.hq, next = () => s.todo.shift(), dem = (c) => { const g = Math.min(s.room, pick(r, [10, 20, 20, 30])); s.room -= g; return { [c]: g }; };
  const weak = J(ev, `S.pz.cities.filter(c=>c!==S.ar.hq&&!S.ar.gold.includes(c)&&[...new Set(S.links.map(pzUnit))].some(u=>arDark(u).includes(c)))`);
  if (kind === 'gold') { if (!weak.length) return null; const c = weak.sort((a, b) => W.km(hq, b) - W.km(hq, a))[0]; return { gold: [c] }; }
  if (kind === 'addgold') { if (!s.todo.length || s.room < 10) return null; const c = next(); return { add: [c], dem: dem(c), gold: [c] }; }
  if (kind === 'move') { const c = pops.filter((x) => x !== hq && !gold.includes(x) && !(s.lat || []).includes(x)).sort((a, b) => W.km(hq, b) - W.km(hq, a))[0];
    if (!c || !s.todo.length || s.room < 10) return null; const n = next(); return { drop: [c], add: [n], dem: dem(n), gold: [n] }; }
  if (kind === 'lat') { let bestP = null;
    for (const a of pops) for (const b of pops) { if (a >= b) continue; const cur = J(ev, `arLat('${a}','${b}')`), os = W.opts(a, b).filter((x) => !x.second); if (cur == null || !os.length) continue;
      const ms = Math.min(...os.map((x) => x.ms)), cap = Math.ceil(ms * 1.12 * 10) / 10; if (cap < 2 || cap >= cur * 0.85) continue;
      if (!bestP || cur / cap > bestP.k) bestP = { a, b, cap, k: cur / cap }; }
    if (!bestP) return null; s.lat = [bestP.a, bestP.b]; return { lat: [bestP.a, bestP.b, bestP.cap] }; }
  if (kind === 'grow') { const cs = pops.filter((c) => c !== hq).map((c) => [c, ev(`arDem('${c}')`)]).sort((x, y) => y[1] - x[1]); if (!cs.length || s.room < 60) return null;
    const [c, d] = cs[0], g = d + Math.min(s.room, pick(r, [60, 90, 120])); s.room -= g - d; return { dem: { [c]: g } }; }
  if (kind === 'ring') { const cs = pops.filter((c) => c !== hq).sort((a, b) => W.km(hq, a) - W.km(hq, b)).slice(0, 2); if (cs.length < 2) return null;
    const ring = [hq, ...cs]; if (ev(`arRingOk(${JSON.stringify(ring)})`)) return null; return { ring }; }
  return null;
}

// Play a run from scratch: stage, start, then brief by brief design (when designing) or follow the file, solve, review, next.
function play(g, W, key, hq, plan, r, sites) {
  const { ev } = g, briefs = [], steps = [], s = { hq, todo: sites.slice(), room: DEM_MAX, lat: null };
  const first = () => { const c = s.todo.shift(), g0 = Math.min(s.room, pick(r, [20, 30, 40])); s.room -= g0; return { add: [c], dem: { [c]: g0 } }; };
  for (let i = 0; i < plan.length; i++) {
    let b = null;
    if (plan[i] === 'add1') b = first();
    else if (plan[i] === 'add2') { if (s.todo.length < 2) throw new Error('not enough sites'); const a = s.todo.shift(), c = s.todo.shift(), ga = Math.min(s.room, 20); s.room -= ga; const gc = Math.min(s.room, pick(r, [10, 20])); s.room -= gc; b = { add: [a, c], dem: { [a]: ga, [c]: gc } }; }
    // A kind that cannot be made here gives way to one the run has not had yet, then to a new mission-critical site.
    else for (const k of [plan[i], ...['lat', 'ring', 'move', 'grow', 'gold'].filter((x) => !plan.slice(0, i).includes(x) && x !== plan[i]), 'addgold']) { b = design(k, ev, W, r, s); if (b) { plan[i] = k; break; } }
    if (!b) throw new Error(`brief ${i + 1}: nothing left to ask`);
    b.tubes = 9; briefs.push(b); stage(ev, key, hq, briefs.map((x) => Object.assign({ t: '' }, x)));
    if (i === 0) ev(`ACT.pzArStart({id:arWkId('${key}')})`); else ev('ACT.pzArNext()');
    if (ev('S.ar.bi') !== i) throw new Error(`brief ${i + 1} did not start`);
    const st = []; solveBrief(ev, W, st); steps.push(st);
    b.tubes = ev('S.links.filter(l=>(l.br|0)===S.ar.bi).length');
    if (!st.length) throw new Error(`brief ${i + 1} asks for nothing new`);
    ev(`UI.arWk.def.briefs[${i}].tubes=${b.tubes}`);
    if (!passes(ev)) throw new Error(`brief ${i + 1}: the review does not pass`);
  }
  return { briefs, steps, spend: ev('arSpend()') };
}

// Replay a file the way a player would, from its own reference: it must pass every brief and earn three stars.
function verify(g, j, key) {
  const { ev } = g, def = J(ev, `arWkValid(${JSON.stringify(j)},'${key}')`);
  if (!def) return { ok: false, why: 'the game rejects it' };
  if (!j.ref || !Array.isArray(j.ref.steps) || j.ref.steps.length !== def.briefs.length) return { ok: false, why: 'no reference' };
  try {
    ev(`UI.arWk={key:'${key}',def:arWkValid(${JSON.stringify(j)},'${key}'),at:Date.now()}`);
    ev(`ACT.pzArStart({id:arWkId('${key}')})`);
    for (let i = 0; i < def.briefs.length; i++) {
      for (const st of j.ref.steps[i]) step(ev, st);
      if (!passes(ev)) return { ok: false, why: `brief ${i + 1} does not pass` };
      if (i < def.briefs.length - 1) ev('ACT.pzArNext()');
    }
    const sp = ev('arSpend()'), stars = ev(`arStars(${sp})`);
    ev('arStop(true)');
    return stars === 3 ? { ok: true, spend: sp } : { ok: false, why: `the reference earns ${stars} stars (spend ${sp}, budget ${j.budget})` };
  } catch (e) { return { ok: false, why: e.message }; }
}

function generate(g, key, dir) {
  const { ev } = g, W = world(ev);
  // The regions of the last weeks, so the HQ moves around the world.
  const past = list(dir).filter((k) => k < key).map((k) => { try { return JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')).hq; } catch (e) { return null; } });
  const recent = past.slice(-HISTORY).map((c) => W.C[c] && W.C[c].reg), used = past.slice(-12);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const r = rng(hash(`architect|${key}|${attempt}`));
    const hqs = W.cities.filter((c) => !used.includes(c.id) && (!recent.includes(c.reg) || attempt >= ATTEMPTS / 2));
    const hq = pick(r, hqs).id;
    const near = W.cities.filter((c) => c.id !== hq && c.reg === W.C[hq].reg && W.km(hq, c.id) < 2500).sort((a, b) => W.km(hq, a.id) - W.km(hq, b.id)).slice(0, 8).map((c) => c.id);
    if (near.length < 6) continue;
    const mid = shuffle(r, ['lat', 'ring', 'move', 'addgold', 'grow']).slice(0, r() < 0.5 ? 2 : 3);
    const plan = ['add1', 'add2', 'gold', ...mid, 'gold'];
    const sites = [...near.slice(0, 3), ...shuffle(r, near.slice(3))];
    try {
      const run = play(g, W, key, hq, plan, r, sites);
      const jk = pick(r, JOKES), j = { v: SCHEMA, key, hq, budget: ceil10k(run.spend * 1.06), name: { l: pick(r, NAMES), p: { hq } }, joke: { l: jk, p: jk === JOKES[0] ? { hq } : {} }, briefs: run.briefs, ref: { spend: run.spend, steps: run.steps } };
      const v = verify(g, j, key);
      if (!v.ok) { if (process.env.DEBUG) console.warn(`${key} #${attempt}: ${v.why}`); continue; }
      return j;
    } catch (e) { if (process.env.DEBUG) console.warn(`${key} #${attempt} (${hq}): ${e.message}`); }
  }
  throw new Error(`${key}: no run survived verification`);
}

// --check: every file is what the game accepts, under its own name, and the weeks still to come earn three stars.
function check(g, dir, now = Date.now()) {
  const { ev } = g, bad = [], keys = list(dir);
  for (const k of keys) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')); } catch (e) { bad.push(`${k}: not JSON`); continue; }
    if (!ev(`!!arWkValid(${JSON.stringify(j)},'${k}')`)) { bad.push(`${k}: the game rejects it`); continue; }
    if (ev(`pzWeekStart('${k}')`) + 7 * 864e5 > now) { const v = verify(g, j, k); if (!v.ok) bad.push(`${k}: ${v.why}`); }
  }
  if (keys.length) {
    let idx = null; try { idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { /* reported below */ }
    if (!idx || idx.v !== SCHEMA || JSON.stringify(idx.weeks) !== JSON.stringify(keys)) bad.push('index.json does not list exactly the weekly files');
  }
  return bad;
}
// A release can change prices under weeks already out: a week not over yet whose reference no longer earns three stars
// is regenerated with its rev up, so players' stars for that week (only that week) start again. Past weeks stay.
function refresh(g, dir, now = Date.now()) {
  const { ev } = g, fixed = [], bad = [];
  for (const k of list(dir)) {
    let j = null; try { j = JSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8')); } catch (e) { /* regenerated below */ }
    const valid = !!j && ev(`!!arWkValid(${JSON.stringify(j)},'${k}')`), live = ev(`pzWeekStart('${k}')`) + 7 * 864e5 > now;
    if (valid && (!live || verify(g, j, k).ok)) continue;
    const rev = (j && Number.isInteger(j.rev) && j.rev >= 2 ? j.rev : 1) + 1;
    try { writeWeek(dir, Object.assign(generate(g, k, dir), { rev })); fixed.push(`${k}: regenerated as rev ${rev}`); } catch (e) { bad.push(`${k}: could not regenerate (${e.message})`); }
  }
  let idx = null; try { idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { /* rewritten */ }
  if (list(dir).length && (!idx || idx.v !== SCHEMA || JSON.stringify(idx.weeks) !== JSON.stringify(list(dir)))) { writeIndex(dir); fixed.push('index.json rewritten'); }
  return { fixed, bad };
}
const writeIndex = (dir) => fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: SCHEMA, weeks: list(dir) }) + '\n');
const writeWeek = (dir, j) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, j.key + '.json'), JSON.stringify(j) + '\n'); writeIndex(dir); };
const say = (j) => `${j.key}: HQ ${j.hq}, ${j.briefs.length} briefs (${j.briefs.map((b) => Object.keys(b).filter((k) => k !== 'tubes' && (k !== 'dem' || !b.add)).map((k) => (k === 'dem' ? 'grow' : k)).join('+')).join(', ')}), budget ${j.budget}, reference ${j.ref.spend}`;

module.exports = { generate, verify, check, refresh, writeWeek, writeIndex, list, say, step };

if (require.main === module) {
  const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const dir = path.resolve(ROOT, opt('--dir', 'site/architect/weekly')), g = game(opt('--page') && path.resolve(opt('--page')));
  if (!g.ev("typeof arWkValid==='function'")) { console.log('This game has no weekly Architect runs yet.'); process.exit(0); }
  if (args.includes('--check')) {
    const r = refresh(g, dir);
    for (const x of r.fixed) console.log(`fixed: ${x}`);
    const bad = [...r.bad, ...check(g, dir)];
    for (const b of bad) console.error(`error: ${b}`);
    console.log(bad.length ? `${bad.length} problem(s)` : `${list(dir).length} weekly Architect run(s) OK`);
    process.exit(bad.length ? 1 : 0);
  }
  const first = opt('--key') || g.ev(`pzWeekKey(Date.now()+12*3600e3)`), n = +opt('--next', 1);
  for (let i = 0; i < n; i++) {
    const key = g.ev(`pzKeyAdd('${first}',${i})`);
    if (!key) { console.error(`error: ${first} is not a week`); process.exit(1); }
    if (fs.existsSync(path.join(dir, key + '.json')) && !args.includes('--force')) { console.log(`${key}: already there`); continue; }
    const j = generate(g, key, dir); writeWeek(dir, j); console.log(say(j));
  }
}
