// The published weekly puzzle: Sunday 06:00 Berlin weeks, the generator (scripts/weekly-puzzle.js), its --check,
// and the game's fetch: only when Puzzles opens, validated strictly, with the seeded weekly as the fallback.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./harness');
const G = require('../scripts/weekly-puzzle');

const DIR = path.join(__dirname, '..', 'site', 'puzzles', 'weekly');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-weekly-'));
const committed = () => G.list(DIR).map((k) => JSON.parse(fs.readFileSync(path.join(DIR, k + '.json'), 'utf8')));
const tick = () => new Promise((r) => setTimeout(r, 30));

test('weeks start Sunday 06:00 Berlin, in winter and in summer, and keys run across New Year', () => {
  const { ev, errors } = load();
  const key = (iso) => ev(`pzWeekKey(new Date('${iso}'))`), start = (k) => ev(`new Date(pzWeekStart('${k}')).toISOString()`);
  // Winter (CET, UTC+1): 06:00 Berlin is 05:00 UTC.
  assert.equal(key('2026-11-01T04:59:59Z'), '2026-W44');
  assert.equal(key('2026-11-01T05:00:00Z'), '2026-W45', 'the week starting Sunday 1 Nov is named after its Monday');
  assert.equal(key('2026-11-07T23:00:00Z'), '2026-W45', 'Saturday night is still the same week');
  assert.equal(start('2026-W45'), '2026-11-01T05:00:00.000Z');
  // Summer (CEST, UTC+2): 06:00 Berlin is 04:00 UTC.
  assert.equal(key('2026-07-05T03:59:00Z'), '2026-W27');
  assert.equal(key('2026-07-05T04:00:00Z'), '2026-W28');
  // The weekends the clocks change: the change is at 01:00 UTC that same Sunday, before the week starts.
  assert.equal(start('2026-W14'), '2026-03-29T04:00:00.000Z', 'spring forward: first CEST Sunday');
  assert.equal(start('2026-W13'), '2026-03-22T05:00:00.000Z');
  assert.equal(start('2026-W44'), '2026-10-25T05:00:00.000Z', 'fall back: first CET Sunday');
  assert.equal(start('2026-W43'), '2026-10-18T04:00:00.000Z');
  assert.equal(key('2026-03-29T03:59:00Z'), '2026-W13');
  assert.equal(key('2026-03-29T04:00:00Z'), '2026-W14');
  assert.equal(key('2026-10-25T04:59:00Z'), '2026-W43');
  assert.equal(key('2026-10-25T05:00:00Z'), '2026-W44');
  // New Year: 2026 has 53 ISO weeks, 2027 has 52.
  assert.equal(key('2026-12-27T05:00:00Z'), '2026-W53');
  assert.equal(key('2027-01-03T04:59:00Z'), '2026-W53');
  assert.equal(key('2027-01-03T05:00:00Z'), '2027-W01');
  assert.equal(key('2027-12-26T05:00:00Z'), '2027-W52');
  assert.equal(key('2028-01-02T05:00:00Z'), '2028-W01');
  assert.equal(ev("pzKeyAdd('2026-W53',1)"), '2027-W01');
  assert.equal(ev("pzPrevKey('2027-W01')"), '2026-W53');
  assert.equal(ev("pzPrevKey('2028-W01')"), '2027-W52');
  assert.equal(ev("pzWeekStart('2027-W53')"), null, '2027 has no week 53');
  assert.equal(ev("pzWeekStart('2026-W00')"), null);
  assert.equal(ev("pzWeekStart('nope')"), null);
  // Every week of ten years: 7 days apart (give or take the DST hour), keys round-trip, never two Sundays the same key.
  let k = '2026-W01', seen = new Set();
  for (let i = 0; i < 522; i++) {
    const t = ev(`pzWeekStart('${k}')`), n = ev(`pzKeyAdd('${k}',1)`), tn = ev(`pzWeekStart('${n}')`);
    assert.equal(new Date(t).getUTCDay(), 0, `${k} starts on a Sunday`);
    assert.ok([7 * 864e5, 7 * 864e5 - 3600e3, 7 * 864e5 + 3600e3].includes(tn - t), `${k} → ${n}`);
    assert.equal(ev(`pzWeekKey(${t})`), k);
    assert.equal(ev(`pzWeekKey(${t - 1})`), ev(`pzPrevKey('${k}')`));
    assert.ok(!seen.has(k)); seen.add(k); k = n;
  }
  // The countdown.
  assert.equal(ev("pzWkNext(Date.parse('2026-10-29T14:00:00Z'))"), 'Next weekly puzzle in 2 d 15 h');
  assert.equal(ev("pzWkNext(Date.parse('2026-11-01T03:20:00Z'))"), 'Next weekly puzzle in 1 h 40 min');
  assert.deepEqual(errors, []);
});

// Weeks already out are not compared with a fresh run: a later release may change prices, and a published week stays as
// it was (--check still makes sure the weeks not over yet can be solved).
test('generator: deterministic for a week', () => {
  const g = G.game(), a = tmp(), b = tmp();
  const first = G.list(DIR).slice(-3)[0];
  const keys = Math.min(3, G.list(DIR).length);
  for (const d of [a, b]) for (let i = 0; i < keys; i++) G.writeWeek(d, G.generate(g, g.ev(`pzKeyAdd('${first}',${i})`), d));
  for (const k of G.list(a)) {
    assert.equal(fs.readFileSync(path.join(a, k + '.json'), 'utf8'), fs.readFileSync(path.join(b, k + '.json'), 'utf8'), `${k} twice the same`);
  }
  assert.ok(G.list(DIR).length >= 3, 'the release ships with weeklies in place');
});

test('generator: a quarter of weeks, all verified, varied, small and in the schema', () => {
  const g = G.game(), d = tmp();
  let k = '2027-W10';
  const out = [];
  for (let i = 0; i < 12; i++, k = g.ev(`pzKeyAdd('${k}',1)`)) { const j = G.generate(g, k, d); G.writeWeek(d, j); out.push(j); }
  assert.deepEqual(G.check(g, d, 0), [], 'every week verifies: both references earn their stars in the game');
  for (let i = 1; i < out.length; i++) {
    assert.notEqual(out[i].theme, out[i - 1].theme, `${out[i].key}: not last week's theme`);
    for (const c of out[i].cities) assert.ok(!out[i - 1].cities.includes(c), `${out[i].key}: ${c} was a city last week too`);
  }
  assert.ok(new Set(out.map((j) => j.theme)).size >= 5, 'most themes come round in a quarter');
  for (const j of out) {
    assert.ok(j.cities.length >= 3 && j.cities.length <= 6);
    assert.ok(j.ref.one <= j.ref.three && j.ref.three <= j.budget && j.budget <= j.ref.three * 1.06 + 10000, `${j.key}: budget ${j.budget} just above the N-1 build ${j.ref.three}`);
    assert.ok(JSON.stringify(j).length < 900, 'small file');
    assert.ok(j.dem.length >= 2 && j.src.length === 1 && j.dem.every((f) => f.g > 0), `${j.key}: it carries traffic`);
    assert.deepEqual(Object.keys(j), ['v', 'key', 'theme', 'cities', 'src', 'dem', 'via', 'avoid', 'budget', 'twist', 'name', 'joke', 'ref']);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'index.json'), 'utf8')).weeks, out.map((j) => j.key));
});

test('--check passes on the committed files and rejects tampered ones', () => {
  const g = G.game();
  // Weeks still to come are re-solved; past ones are checked the way the game reads them. check() only reports;
  // refresh() (the first half of --check) is what fixes.
  assert.deepEqual(G.check(g, DIR), [], 'committed weeklies verify');
  const bad = (edit, why) => {
    const d = tmp();
    for (const k of G.list(DIR).slice(-3)) fs.copyFileSync(path.join(DIR, k + '.json'), path.join(d, k + '.json'));
    G.writeIndex(d);
    const k = G.list(d)[0], f = path.join(d, k + '.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r = edit(j, d, k); fs.writeFileSync(f, typeof r === 'string' ? r : JSON.stringify(j));
    assert.notDeepEqual(G.check(g, d, 0), [], why);
  };
  bad((j) => { j.budget = Math.floor(j.ref.three * 0.8 / 10000) * 10000; j.ref.three = j.budget - 1; }, 'a budget nobody can earn three stars under');
  bad((j) => { j.cities[0] = 'xxx'; }, 'an unknown city');
  bad((j) => { j.name.l = 'puzzles.hello_world'; }, 'a label that is not a weekly name');
  bad((j) => { j.joke.p = { hub: 'fra' }; }, 'parameters the label does not take');
  bad((j) => { j.extra = '<img src=x onerror=alert(1)>'; }, 'an unknown field');
  bad((j) => { j.key = '2030-W01'; }, 'a file under another week\'s name');
  bad((j) => { j.dem.push({ t: 'l2', a: j.cities[0], b: j.cities[1], g: 10, ms: 1 }); }, 'an impossible latency target');
  bad((j) => { j.dem[0].g = 5000; }, 'more traffic than a puzzle carries');
  bad(() => '{nope', 'not JSON');
  bad((j, d) => { fs.writeFileSync(path.join(d, 'index.json'), '{"v":1,"weeks":[]}'); }, 'an index that misses weeks');
});

test('--check regenerates a published week when new prices break its budget, and only then', () => {
  const g = G.game(), d = tmp();
  for (const k of G.list(DIR)) fs.copyFileSync(path.join(DIR, k + '.json'), path.join(d, k + '.json'));
  G.writeIndex(d);
  const read = (k) => JSON.parse(fs.readFileSync(path.join(d, k + '.json'), 'utf8')), [k0, k1] = G.list(d).slice(-2);
  assert.deepEqual(G.refresh(g, d, 0), { fixed: [], bad: [] }, 'the committed weeks still verify: nothing changes');
  // Prices went up: the old budget no longer buys the N-1 build. The same puzzle comes back with a budget that does.
  const old = read(k0), j = read(k0); j.budget = Math.floor(j.ref.three * 0.8 / 10000) * 10000; j.ref.three = j.budget - 1;
  fs.writeFileSync(path.join(d, k0 + '.json'), JSON.stringify(j));
  const r = G.refresh(g, d, 0);
  assert.deepEqual(r.bad, []);
  assert.equal(r.fixed.length, 1, r.fixed.join('; '));
  const n = read(k0);
  assert.equal(n.rev, 2, 'a new revision');
  assert.deepEqual([n.theme, n.cities, n.via, n.avoid, n.twist, n.name, n.joke], [old.theme, old.cities, old.via, old.avoid, old.twist, old.name, old.joke], 'the same puzzle');
  assert.ok(n.budget >= n.ref.three && n.ref.three > j.budget);
  assert.deepEqual(G.check(g, d, 0), [], 'and it verifies');
  assert.deepEqual(G.refresh(g, d, 0), { fixed: [], bad: [] }, 'deterministic and settled: a second run changes nothing');
  // A week the game rejects (a city that is gone) gets a fresh puzzle under the same key.
  const b = read(k1); b.cities[0] = 'xxx'; fs.writeFileSync(path.join(d, k1 + '.json'), JSON.stringify(b));
  assert.equal(G.refresh(g, d, 0).fixed.length, 1);
  assert.equal(read(k1).key, k1);
  assert.equal(read(k1).rev, 2);
  assert.deepEqual(G.check(g, d, 0), []);
  // Weeks that are over cannot be played again: their stars stay, so a broken budget there is left alone.
  const e = read(k0); e.budget = 50000; fs.writeFileSync(path.join(d, k0 + '.json'), JSON.stringify(e));
  assert.deepEqual(G.refresh(g, d, 8.64e15), { fixed: [], bad: [] });
});

test('stars belong to the revision of the week they were earned on', () => {
  const { ev, errors } = load();
  const j = committed()[0], k = j.key, ok = (o) => ev(`!!pzWkValid(${JSON.stringify(o)},'${k}')`);
  assert.equal(ev(`pzWkValid(${JSON.stringify(j)},'${k}').rev`), 1, 'a first edition is rev 1');
  assert.ok(ok({ ...j, rev: 2 }));
  for (const rev of [1, 0, '2', 2.5, 1000]) assert.equal(ok({ ...j, rev }), false, `rev ${rev}`);
  ev(`localStorage.setItem('sot-puzzles',JSON.stringify({wk:{'${k}':{st:3,sp:1},'2026-W01':{st:2,sp:5}}}))`);
  assert.equal(ev(`pzWkRec(pzLoad(),pzWkValid(${JSON.stringify(j)},'${k}')).st`), 3, 'same week, same revision: the stars stand');
  const d2 = `pzWkValid(${JSON.stringify({ ...j, rev: 2 })},'${k}')`;
  assert.equal(ev(`pzWkRec(pzLoad(),${d2})`), null, 'regenerated: that week starts again');
  ev(`pzBegin(${d2});pzRecord({stars:1,spend:9})`);
  const p = JSON.parse(ev("localStorage.getItem('sot-puzzles')"));
  assert.deepEqual(p.wk[k], { st: 1, sp: 9, rv: 2 }, 'a lower score on the new revision replaces the old one');
  assert.deepEqual(p.wk['2026-W01'], { st: 2, sp: 5 }, 'other weeks keep theirs');
  assert.equal(ev(`pzWkRec(pzLoad(),${d2}).st`), 1);
  assert.deepEqual(errors, []);
});

test('the page never asks for a weekly puzzle on load, only when Puzzles opens', async () => {
  const { ev, errors } = load();
  ev("window.__f=[];window.fetch=(u,o)=>{__f.push(String(u));return Promise.resolve({ok:false,json:()=>Promise.reject()})}");
  ev("showTitle();for(let i=0;i<5;i++)frame(performance.now()+i*1000);renderAll()");
  assert.equal(ev("__f.filter(u=>/puzzles/.test(u)).length"), 0, 'nothing on the title screen');
  assert.equal(ev("UI.pzWk===undefined"), true);
  ev("ACT.start({});for(let i=0;i<3;i++)dayTick();renderAll()");
  assert.equal(ev("__f.filter(u=>/puzzles/.test(u)).length"), 0, 'nothing while playing');
  ev('ACT.puzzleMenu({})');
  const key = ev('pzWeekKey(new Date())');
  assert.deepEqual(ev("JSON.stringify(__f.filter(u=>/puzzles/.test(u)))"), JSON.stringify([`puzzles/weekly/${key}.json`]), 'one relative, same-origin request');
  ev('closeModal();ACT.puzzleMenu({})');
  assert.equal(ev("__f.filter(u=>/puzzles/.test(u)).length"), 1, 'once is enough while it is loading');
  await tick();
  assert.deepEqual(errors, []);
});

test('the published puzzle is played when it is good, the seeded one when it is missing, offline or bad', async () => {
  const src = committed()[1], { ev, dom, errors } = load();
  const key = ev('pzWeekKey(new Date())'), good = { ...src, key };
  const serve = (how) => { ev(`UI.pzWk=null;window.fetch=()=>${how}`); ev('ACT.puzzleMenu({})'); };
  const seeded = JSON.parse(ev('JSON.stringify(pzWeekly())'));
  for (const [how, why] of [
    ["Promise.resolve({ok:false,status:404,json:()=>Promise.reject()})", 'missing'],
    ["Promise.reject(new TypeError('offline'))", 'offline'],
    ["Promise.resolve({ok:true,json:()=>Promise.reject(new SyntaxError('x'))})", 'not JSON'],
    [`Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify({ ...good, cities: ['fra', 'nope', 'ams'] })})})`, 'an unknown city'],
    [`Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify({ ...good, key: '2020-W01' })})})`, 'another week'],
  ]) {
    serve(how);
    await tick();
    assert.equal(ev('UI.pzWk.st'), 'fb', why);
    assert.deepEqual(JSON.parse(ev('JSON.stringify(pzWkDef().cities)')), seeded.cities, `${why}: the seeded weekly stands in`);
    assert.match(ev("document.getElementById('pzWk').textContent"), new RegExp(`Weekly puzzle ${key}`));
    assert.equal(ev("document.querySelector('#pzWk [data-act=pzWeekly]').disabled"), false);
  }
  // While it loads, the button waits a moment.
  ev("UI.pzWk=null;window.fetch=()=>new Promise(()=>{})");
  ev('ACT.puzzleMenu({})');
  assert.match(ev("document.getElementById('pzWk').textContent"), /Loading this week/);
  assert.equal(ev("document.querySelector('#pzWk [data-act=pzWeekly]').disabled"), true);
  // The good one.
  serve(`Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify(good)})})`);
  await tick();
  assert.equal(ev('UI.pzWk.st'), 'ok');
  const row = ev("document.getElementById('pzWk').textContent");
  assert.ok(row.includes(ev('pzName(pzWkDef())')), 'its pun name');
  assert.ok(row.includes(ev('pzTxt(pzWkDef().wj)')), 'its joke');
  assert.match(row, /New this Sunday!/);
  assert.match(row, /Next weekly puzzle in \d+ (d \d+ h|h \d+ min)/);
  ev("document.querySelector('#pzWk [data-act=pzWeekly]').click()");
  assert.equal(ev('S.pz.key'), key);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.pz.cities)')), good.cities);
  assert.equal(ev('S.pz.budget'), good.budget);
  assert.match(ev("document.getElementById('pzBox').textContent"), new RegExp(ev('pzTxt(S.pz.wj)').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Solve it with three stars: the share line and the streak use the published key.
  // The generator's sized 3-star reference, played into this puzzle (links, routers, routes).
  const SV = require('../scripts/lib/puzzle-solver');SV.install(ev);
  const def = JSON.parse(ev('JSON.stringify(pzWkDef())')), sol = G.sized({ ev }, G.world(ev), G.shape(def), def).three.b;
  ev('pzBegin(pzWkDef())');
  SV.judge(ev, sol.links);
  ev(`pzsApplyRt(${JSON.stringify(sol.rt)});pzAfter()`);
  assert.equal(ev('pzEval().stars'), 3);
  assert.match(ev('pzShareText(pzEval())'), new RegExp(`^Series of Tubes puzzle ${key} ⭐⭐⭐ \\$[\\d.]+[kM] · seriesoftub\\.es$`));
  const p = JSON.parse(ev("localStorage.getItem('sot-puzzles')"));
  assert.equal(p.wk[key].st, 3);
  assert.equal(p.streak.last, key);
  ev('ACT.pzLeave({})');
  assert.doesNotMatch(ev("document.querySelector('.door[data-door=puzzle]').textContent"), /New this Sunday/, 'played: no badge');
  void dom;
  assert.deepEqual(errors, []);
});

test('the file is checked field by field', () => {
  const { ev, errors } = load();
  const j = committed()[0], k = j.key, ok = (o) => ev(`!!pzWkValid(${JSON.stringify(o)},'${k}')`);
  assert.ok(ok(j));
  const no = (edit, why) => { const o = JSON.parse(JSON.stringify(j)); edit(o); assert.equal(ok(o), false, why); };
  no((o) => { o.v = 3; }, 'a newer schema');
  no((o) => { o.v = 1; }, 'an old file without traffic');
  no((o) => { o.dem = []; }, 'no traffic');
  no((o) => { o.dem = [{ t: 'warp', a: o.cities[0], g: 1 }]; }, 'an unknown kind of flow');
  no((o) => { o.dem = [{ ...o.dem[0], g: 1.5 }, ...o.dem.slice(1)]; }, 'fractional gigabits');
  no((o) => { o.src = []; }, 'eyeballs with nowhere to pull from');
  no((o) => { o.cities = o.cities.slice(0, -1); }, 'cities that do not match the traffic');
  no((o) => { o.theme = 'constructor'; }, 'an unknown theme');
  no((o) => { o.cities = ['fra']; }, 'too few cities');
  no((o) => { o.cities = [...o.cities, o.cities[0]]; }, 'a city twice');
  no((o) => { o.via = [o.cities[0]]; }, 'a goal city as a stepping stone');
  no((o) => { o.cities[0] = 'pek'; }, 'a city that needs a licence');
  no((o) => { o.budget = '240000'; }, 'a budget as text');
  no((o) => { o.budget = 1e9; }, 'a silly budget');
  no((o) => { o.twist = { ring: 'yes' }; }, 'a twist that is not true');
  no((o) => { o.twist = { avoidAll: true }; }, 'an unknown twist');
  no((o) => { o.name = { l: 'puzzles_weekly.name_tour_de_reg', p: { reg: 'XX' } }; }, 'an unknown region');
  no((o) => { o.name = { l: 'puzzles_weekly.name_race_to_b', p: { b: '<b>' } }; }, 'markup as a city');
  no((o) => { o.joke = 'Ha ha'; }, 'raw English');
  no((o) => { o.__proto__ = { budget: 1 }; o.extra = 1; }, 'extra fields');
  assert.equal(ev(`pzWkValid(null,'${k}')`), null);
  assert.equal(ev(`pzWkValid([],'${k}')`), null);
  // Every label a theme may use exists in English, and every file names its text in the player's language.
  assert.ok(ev("Object.values(PZ_WK_THEMES).every(T=>[T.t,...T.names,...T.jokes].every(l=>typeof EN[l]==='string'))"));
  for (const f of committed()) {
    const d = ev(`JSON.stringify(pzWkValid(${JSON.stringify(f)},'${f.key}'))`);
    assert.ok(d, f.key);
    assert.doesNotMatch(ev(`(d=>pzTxt(d.wn)+' '+pzTxt(d.wj))(${d})`), /\{|puzzles_weekly\./, `${f.key}: filled in`);
  }
  assert.deepEqual(errors, []);
});

test('weekly puzzle in every language and on a 360 px phone', async () => {
  const f = committed()[0];
  for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
    const { ev, errors } = load({ lang });
    const key = ev('pzWeekKey(new Date())');
    ev(`window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify({ ...f, key })})})`);
    ev("innerWidth=360;innerHeight=740;dispatchEvent(new Event('resize'));showTitle()");
    ev('ACT.puzzleMenu({})');
    await tick();
    const row = ev("document.getElementById('pzWk').textContent");
    assert.doesNotMatch(row, /puzzles(_weekly)?\.|\{/, `${lang}: no raw labels or placeholders`);
    assert.notEqual(ev('pzName(pzWkDef())'), ev("EN[pzWkDef().wn.l]"), `${lang}: translated name`);
    ev("document.querySelector('#pzWk [data-act=pzWeekly]').click()");
    assert.equal(ev("document.getElementById('pzBox').hidden"), false);
    assert.doesNotMatch(ev("document.getElementById('pzBox').textContent"), /puzzles(_weekly)?\./);
    assert.deepEqual(errors, [], lang);
  }
});
