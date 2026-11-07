#!/usr/bin/env node
// Times each tests/*.test.js on its own and writes tests/durations.json (seconds per file), which
// `npm test -- --shard i/n` uses to split the files into parts of about equal time.
// Run it after adding or growing slow tests; it takes a few minutes. Files run as many at once as the
// machine has cores, so absolute numbers vary, but their sizes relative to each other are what count.
//
//   npm run test:timings
//   node scripts/test-timings.js --merge DIR   (CI) fold the parts' --timings files into it
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests');

// --merge DIR: fold the timings CI's parts wrote (scripts/test.js --timings) into tests/durations.json. Files that are
// gone drop out; files no part ran keep their old time.
const mi = process.argv.indexOf('--merge');
if (mi >= 0) {
  const from = process.argv[mi + 1], dur = path.join(dir, 'durations.json');
  let out = {};
  try { out = JSON.parse(fs.readFileSync(dur, 'utf8')); } catch (e) { /* none yet */ }
  let n = 0;
  for (const f of fs.readdirSync(from, { recursive: true }).filter((f) => String(f).endsWith('.json'))) {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(from, String(f)), 'utf8')))) if (v > 0) { out[k] = v; n++; }
  }
  const have = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).map((f) => 'tests/' + f));
  const sorted = Object.fromEntries(Object.keys(out).filter((k) => have.has(k)).sort().map((k) => [k, out[k]]));
  fs.writeFileSync(dur, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`merged ${n} timings; tests/durations.json has ${Object.keys(sorted).length} of ${have.size} files`);
  process.exit(0);
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => 'tests/' + f);
const jobs = Math.max(1, parseInt(process.env.TEST_JOBS, 10) || os.availableParallelism());
const out = {};
let next = 0, failed = 0;

function run() {
  if (next >= files.length) return Promise.resolve();
  const f = files[next++], t = performance.now();
  return new Promise((res) => {
    const p = spawn(process.execPath, ['--test', f], { cwd: root, stdio: 'ignore' });
    p.on('close', (code) => {
      out[f] = Math.round((performance.now() - t) / 100) / 10;
      if (code) { failed++; console.log(`✗ ${f} failed (timed anyway)`); }
      console.log(`${String(out[f]).padStart(6)}s ${f}`);
      res();
    });
  }).then(run);
}

Promise.all(Array.from({ length: jobs }, run)).then(() => {
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  fs.writeFileSync(path.join(dir, 'durations.json'), JSON.stringify(sorted, null, 1) + '\n');
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  console.log(`${files.length} files, ${Math.round(sum)} s in all; wrote tests/durations.json${failed ? ` (${failed} failed)` : ''}`);
});
