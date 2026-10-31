// The weekly Architect run: generated every Sunday (scripts/weekly-architect.js), checked by the game field by field,
// and played like the handmade runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./harness');
const { game } = require('../scripts/weekly-puzzle');
const AW = require('../scripts/weekly-architect');

const DIR = path.join(__dirname, '..', 'site', 'architect', 'weekly');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sot-arwk-'));

test('the generator makes the same run for the same week, and its reference earns three stars', () => {
  const g = game(), a = AW.generate(g, '2026-W50', tmp()), b = AW.generate(g, '2026-W50', tmp());
  assert.deepEqual(a, b, 'deterministic');
  assert.ok(a.briefs.length >= 6 && a.briefs.length <= 7);
  assert.ok(a.ref.steps.every((st) => st.length >= 1), 'every brief asks for a change: a tube, a bigger tube or a move');
  assert.ok(a.briefs.some((x) => x.gold), 'something is mission-critical');
  assert.ok(a.budget >= a.ref.spend && a.budget <= a.ref.spend * 1.1 + 10000, 'the budget sits just above the reference');
  assert.equal(AW.verify(g, a, '2026-W50').ok, true);
});

test('a grow brief makes the reference make room: a bigger tube or a second one', () => {
  const g = game(), d = tmp(), runs = ['2026-W47', '2026-W49', '2026-W53'].map((k) => AW.generate(g, k, d));
  const grows = runs.flatMap((j) => j.briefs.map((b, i) => [j, b, i]).filter(([, b]) => b.dem && !b.add));
  assert.ok(grows.length >= 1, 'some weeks grow a site');
  for (const [j, b, i] of grows) {
    const [c, gb] = Object.entries(b.dem)[0];
    assert.ok(gb > 100 || j.briefs.slice(0, i).some((x) => x.dem && x.dem[c] && x.dem[c] < gb), 'the site really grows');
    assert.ok(j.ref.steps[i].length >= 1, 'and that brief takes a change');
  }
  const { ev } = load();
  const [j, b] = grows[0];
  ev(`UI.arWk={key:'${j.key}',def:arWkValid(${JSON.stringify(j)},'${j.key}'),at:Date.now()}`);
  const c = Object.keys(b.dem)[0];
  assert.ok(ev(`UI.arWk.def.briefs.some(x=>x.t.includes(CITY['${c}'].name+' grows to'))`), 'the brief says so');
});

test('every published week is accepted and its reference still earns three stars', () => {
  const keys = AW.list(DIR);
  assert.ok(keys.length >= 3);
  assert.deepEqual(AW.check(game(), DIR, 0), []);
});

test('the game refuses a file that does not add up', () => {
  const { ev } = load();
  const j = JSON.parse(fs.readFileSync(path.join(DIR, AW.list(DIR)[0] + '.json'), 'utf8')), k = j.key;
  const ok = (o) => ev(`!!arWkValid(${JSON.stringify(o)},'${k}')`);
  assert.equal(ok(j), true);
  const bad = (f) => { const o = JSON.parse(JSON.stringify(j)); f(o); return ok(o); };
  assert.equal(ev(`!!arWkValid(${JSON.stringify(j)},'2030-W01')`), false, 'under another week');
  assert.equal(bad((o) => { o.extra = 1; }), false, 'an unknown field');
  assert.equal(bad((o) => { o.hq = 'atlantis'; }), false, 'an unknown HQ');
  assert.equal(bad((o) => { o.name.l = 'common.play'; }), false, 'a label it may not name');
  assert.equal(bad((o) => { o.briefs[0] = { tubes: 1 }; }), false, 'a brief that asks for nothing');
  assert.equal(bad((o) => { o.briefs[1].gold = [o.hq]; }), false, 'HQ made mission-critical');
  assert.equal(bad((o) => { o.briefs[1].gold = ['tok']; }), false, 'a site that is not in the run yet');
  assert.equal(bad((o) => { o.briefs.push({ lat: [o.hq, o.briefs[0].add[0], 0.5], tubes: 1 }); }), false, 'a latency cap below 1 ms');
  assert.equal(bad((o) => { o.budget = 1e9; }), false, 'a silly budget');
});

test('this week\'s run shows in Puzzles, plays like a handmade one and keeps its own stars', () => {
  const { ev, errors, dom } = load();
  const key = ev('pzWeekKey(new Date())'), j = AW.generate(game(), key, tmp());
  ev(`UI.arWk={key:'${key}',def:arWkValid(${JSON.stringify(j)},'${key}'),at:Date.now()}`);
  ev('ACT.puzzleMenu()');
  const row = dom.window.document.getElementById('arWk');
  assert.ok(row && row.querySelector('[data-act=pzArStart]'), 'a row with a Play button');
  assert.match(row.textContent, /This week’s Architect run/);
  row.querySelector('[data-act=pzArStart]').click();
  assert.equal(ev('S.ar.id'), 'wk-' + key);
  assert.match(ev('arBrief().t'), /signs up: connect it\./, 'the brief is written from what it asks');
  assert.equal(ev(`arHide('${j.briefs[1].add[0]}')`), true, 'the next brief\'s cities stay hidden');
  // The reference, played through: three stars, stored under the week, and no handmade run offered as "next".
  j.ref.steps.forEach((st, i) => {
    for (const s of st) AW.step(ev, s);
    ev('arShowStart();arShowSkip()');
    assert.ok(ev('S.ar.passed===pzSig()'), `brief ${i + 1} passes`);
    ev('ACT.pzArNext()');
  });
  assert.equal(ev(`arLoad().runs['wk-${key}'].st`), 3);
  assert.equal(ev("document.querySelector('#modalCard [data-act=pzArStart]')"), null, 'no "next run" after a weekly one');
  // A regenerated week (rev 2) starts its stars again.
  ev(`UI.arWk.def.rev=2;ACT.puzzleMenu()`);
  assert.match(dom.window.document.getElementById('arWk').textContent, /⬜⬜⬜/);
  assert.deepEqual(errors, []);
});
