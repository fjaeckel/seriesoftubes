#!/usr/bin/env node
// Runs every tests/*.test.js, each file in its own process, as many at once as the machine has cores. New test
// files are picked up on their own, so adding one never touches package.json (and never conflicts with someone
// else adding theirs).
//
//   npm test                                   everything
//   npm test -- tests/peering.test.js          just these files (other arguments go to node --test)
//   npm test -- --shard 2/4                    one of four parts of about equal time (CI runs the four at once)
//   npm test -- --shard 2/4 --list             which files that part holds, without running them
//   TEST_JOBS=1 npm test                       one file at a time, as it used to be
//
// Parts are balanced by tests/durations.json, each file's typical seconds (refresh: npm run test:timings).
// A file missing from it counts as a typical one, so a stale list only makes the parts a little uneven.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests');
const args = process.argv.slice(2);

const list = args.includes('--list');
if (list) args.splice(args.indexOf('--list'), 1);
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
if (shard && files.length) {
  files = part(files, shard[0], shard[1]);
  console.log(`# part ${shard[0]}/${shard[1]}: ${files.length} files`);
  if (list) { for (const f of files) console.log(f); process.exit(0); }
  // node --test with no files would run every test it can find: an empty part has nothing to do.
  if (!files.length) process.exit(0);
}

const jobs = Math.max(1, parseInt(process.env.TEST_JOBS, 10) || os.availableParallelism());
const r = spawnSync(process.execPath, ['--test', `--test-concurrency=${jobs}`, ...args, ...files], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
