const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { load } = require('./harness');
const { mannWhitneyP } = require('../scripts/perf-stats');

test('perf bench: the Mann–Whitney p-values match SciPy', () => {
  // scipy.stats.mannwhitneyu(a, b, alternative='two-sided', method='asymptotic', use_continuity=True)
  const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-6 + 1e-3 * b, `${a} vs ${b}`);
  close(mannWhitneyP([1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16]), 0.0009391056991171899);
  close(mannWhitneyP([5, 1, 4, 2, 3, 6, 8, 7], [2, 6, 1, 7, 3, 8, 4, 5]), 1);
  close(mannWhitneyP([10, 10, 12, 12, 14, 15, 15, 16, 18, 20], [11, 12, 12, 13, 15, 15, 17, 19, 21, 22]), 0.42367207100291315);
  close(mannWhitneyP([100, 104, 98, 110, 95, 120, 101, 99, 103, 97, 105, 140, 96, 102, 108],
    [118, 122, 115, 130, 112, 125, 119, 121, 117, 135, 114, 160, 113, 120, 128]), 0.0001739079497761901);
  assert.equal(mannWhitneyP([3, 3, 3], [3, 3, 3]), 1, 'all ties');
});

test('perf bench: runs end to end on a small save and compares a version with itself', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'})");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
  const save = path.join(dir, 'save.json'), js = path.join(dir, 'out.json');
  fs.writeFileSync(save, JSON.stringify({ app: 'series-of-tubes', version: 'test', S: JSON.parse(ev('JSON.stringify(S)')) }));
  const md = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'perf-bench.js'), '--save', save,
    '--base', path.join(__dirname, '..', 'site', 'index.html'), '--runs', '3', '--json', js], { encoding: 'utf8' });
  assert.match(md, /2 POPs/, 'reads an exported save');
  assert.match(md, /Routing results are identical to the base/);
  assert.match(md, /\| Routing: compute\(\) \|/);
  const out = JSON.parse(fs.readFileSync(js, 'utf8'));
  assert.equal(out.results.compute.samples.head.length, 3);
  assert.deepEqual(out.errors, []);
});
