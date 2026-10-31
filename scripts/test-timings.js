#!/usr/bin/env node
// Times each tests/*.test.js on its own and writes tests/durations.json (seconds per file), which
// `npm test -- --shard i/n` uses to split the files into parts of about equal time.
// Run it after adding or growing slow tests; it takes a few minutes. Files run as many at once as the
// machine has cores, so absolute numbers vary, but their sizes relative to each other are what count.
//
//   npm run test:timings
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests');
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
