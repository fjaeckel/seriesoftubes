#!/usr/bin/env node
// Runs every tests/*.test.js, each file in its own process, as many at once as the machine has cores. New test
// files are picked up on their own, so adding one never touches package.json (and never conflicts with someone
// else adding theirs).
//
//   npm test                                   everything
//   npm test -- tests/peering.test.js          just these files (other arguments go to node --test)
//   npm test -- --shard 2/4                    one of four parts of about equal time
//   npm test -- --shard 2/4 --list             which files that part holds, without running them
//   node scripts/test.js --plan 6              the split into 6 parts as JSON (CI's plan job: one list per runner)
//   npm test -- --timings out.json             also write each file's seconds to out.json (CI merges these into
//                                              the durations the next run splits by)
//   TEST_JOBS=1 npm test                       one file at a time, as it used to be
//   npm test -- --stress 8 tests/x.test.js     hunt a flaky test: 8 copies of these files at once, on a machine kept
//                                              busier than CI ever is, and how many runs failed (and why)
//
// Parts are balanced by tests/durations.json, each file's typical seconds. CI keeps it fresh in its cache from every
// run on main (.github/workflows/ci.yml); npm run test:timings rewrites the committed copy. A file missing from it
// counts as a typical one, so a stale list only makes the parts a little uneven.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests');
const args = process.argv.slice(2);

const list = args.includes('--list');
if (list) args.splice(args.indexOf('--list'), 1);
let stress = 0;
const ti = args.indexOf('--stress');
if (ti >= 0) {
  stress = parseInt(args[ti + 1], 10);
  if (!(stress >= 1)) { console.error('--stress wants a count, like --stress 8'); process.exit(2); }
  args.splice(ti, 2);
}
let timings = null;
const tmi = args.indexOf('--timings');
if (tmi >= 0) { timings = args[tmi + 1]; args.splice(tmi, 2); if (!timings) { console.error('--timings wants a file'); process.exit(2); } }
let plan = 0;
const pi = args.indexOf('--plan');
if (pi >= 0) { plan = parseInt(args[pi + 1], 10); args.splice(pi, 2); if (!(plan >= 1)) { console.error('--plan wants a count, like --plan 6'); process.exit(2); } }
let shard = null;
const si = args.indexOf('--shard');
if (si >= 0) {
  const m = /^(\d+)\/(\d+)$/.exec(args[si + 1] || '');
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.error('--shard wants i/n, like 2/4'); process.exit(2); }
  shard = [+m[1], +m[2]];
  args.splice(si, 2);
}

let files = args.some((a) => a.endsWith('.test.js')) ? [] :
  fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('tests', f));

// Longest first, each onto the part with the least so far: parts within a file's length of each other.
function part(list, i, n) {
  let dur = {};
  try { dur = JSON.parse(fs.readFileSync(path.join(dir, 'durations.json'), 'utf8')); } catch (e) { /* none yet: by count */ }
  const known = list.map((f) => dur[f.replace(/\\/g, '/')]).filter((s) => s > 0).sort((a, b) => a - b);
  const typical = known.length ? known[known.length >> 1] : 1;
  const w = (f) => dur[f.replace(/\\/g, '/')] > 0 ? dur[f.replace(/\\/g, '/')] : typical;
  const load = Array(n).fill(0), out = Array.from({ length: n }, () => []);
  for (const f of list.slice().sort((a, b) => w(b) - w(a) || a.localeCompare(b))) {
    let k = 0;
    for (let j = 1; j < n; j++) if (load[j] < load[k]) k = j;
    load[k] += w(f); out[k].push(f);
  }
  return out[i - 1].sort();
}
if (plan) {
  console.log(JSON.stringify(Array.from({ length: plan }, (_, i) => part(files, i + 1, plan).join(' '))));
  process.exit(0);
}
if (shard && files.length) {
  files = part(files, shard[0], shard[1]);
  console.log(`# part ${shard[0]}/${shard[1]}: ${files.length} files`);
  if (list) { for (const f of files) console.log(f); process.exit(0); }
  // node --test with no files would run every test it can find: an empty part has nothing to do.
  if (!files.length) process.exit(0);
}

const jobs = Math.max(1, parseInt(process.env.TEST_JOBS, 10) || os.availableParallelism());
// Stress: N runs of the same files at once, each its own node --test, so they fight for the CPU the way the four
// CI parts and their own parallel files do (and worse). A test that only passes on a quiet machine fails here.
if (stress) {
  if (!args.some((a) => a.endsWith('.test.js'))) { console.error('--stress wants the test files to run, like tests/agent-relay.test.js'); process.exit(2); }
  const runs = Array.from({ length: stress }, (_, i) => new Promise((res) => {
    const c = spawn(process.execPath, ['--test', '--test-reporter=dot', ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('close', (code) => res({ i: i + 1, code, out }));
  }));
  Promise.all(runs).then((rs) => {
    const bad = rs.filter((r) => r.code !== 0);
    for (const r of bad) console.log(`\n--- run ${r.i} failed ---\n${r.out.slice(-4000)}`);
    console.log(`\n# stress: ${rs.length - bad.length} of ${rs.length} runs passed, ${stress} at once on ${os.availableParallelism()} cores`);
    process.exit(bad.length ? 1 : 0);
  });
  return;
}
const rep = timings ? ['--test-reporter=spec', '--test-reporter-destination=stdout',
  `--test-reporter=${path.join(__dirname, 'lib', 'timings-reporter.js')}`, `--test-reporter-destination=${timings}`] : [];
const r = spawnSync(process.execPath, ['--test', `--test-concurrency=${jobs}`, ...rep, ...args, ...files], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
