#!/usr/bin/env node
// Many random games, played move for move on main's page and on this checkout's, compared after every move and day
// (scripts/lib/route-fuzz.js). For refactors that promise identical routing.
//
//   node scripts/route-fuzz.js                          300 games against origin/main
//   node scripts/route-fuzz.js --games 50 --from 1000   games with seeds 1000..1049
//   node scripts/route-fuzz.js --seed 1234 -v           one game, every move printed (to replay a divergence)
//   node scripts/route-fuzz.js --save tests/fixtures/big-network.json --games 10 --moves 30   from a big network
//   node scripts/route-fuzz.js --jobs 2 --base OLD.html --out fuzz.json
// Exit code 1 when any game diverged; each divergence is printed with its seed and its last moves.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);

function child() {
  const { openPage, playGame } = require('./lib/route-fuzz');
  const base = openPage(opt('--base'), 'base'), head = openPage(opt('--head'), 'head');
  process.on('message', (m) => {
    if (m.stop) process.exit(0);
    const t = Date.now();
    let res;
    try { res = playGame({ base, head }, m.seed, { moves: m.moves, save: m.save }); } catch (e) { res = { seed: m.seed, div: { where: 'driver crashed', error: String(e.stack || e) }, log: [] }; }
    process.send({ seed: m.seed, ms: Date.now() - t, start: res.start, moves: res.moves, days: res.days, div: res.div, acts: res.acts, log: m.verbose || res.div ? res.log : null, errors: res.errors });
  });
  process.send({ ready: true });
}

function parent() {
  const page = require('./lib/page');
  const tmp = (n) => path.join(os.tmpdir(), `tubes-fuzz-${process.pid}-${n}.html`);
  const BASE = opt('--base', null) || (() => { const f = tmp('base'); fs.writeFileSync(f, page.assembleRef(opt('--base-ref', 'origin/main'))); return f; })();
  const HEAD = opt('--head', null) || (() => { const f = tmp('head'); fs.writeFileSync(f, page.assemble().html); return f; })();
  const one = opt('--seed', null);
  const from = +opt('--from', 1), games = one ? 1 : +opt('--games', 300);
  const seeds = one ? [+one] : Array.from({ length: games }, (_, i) => from + i);
  const jobs = Math.max(1, Math.min(+opt('--jobs', Math.max(1, os.cpus().length)), seeds.length));
  const verbose = has('-v');
  const moves = opt('--moves', null) ? +opt('--moves') : undefined;
  // --save FILE: every game starts from this save (a plain one, or an export from the menu) instead of a new network.
  const RAW = opt('--save', null) ? JSON.parse(fs.readFileSync(opt('--save'), 'utf8')) : null;
  const save = RAW ? JSON.stringify(RAW.app === 'series-of-tubes' && RAW.S ? RAW.S : RAW) : undefined;
  const results = [];
  let next = 0, live = 0;
  const t0 = Date.now();
  const done = () => {
    const div = results.filter((r) => r.div), tot = (k) => results.reduce((a, r) => a + (r[k] || 0), 0);
    const kinds = {};
    for (const r of results) if (r.start) { const k = r.start.kind + (r.start.kind === 'normal' || r.start.kind === 'sandbox' ? ':' + r.start.preset : ''); kinds[k] = (kinds[k] || 0) + 1; }
    console.log(`\n${results.length} games, ${tot('moves')} moves, ${tot('days')} days in ${((Date.now() - t0) / 1000).toFixed(0)} s. Starts: ${JSON.stringify(kinds)}`);
    const acts = {};for (const r of results) for (const k in r.acts || {}) acts[k] = (acts[k] || 0) + r.acts[k];
    if (has('--acts')) console.log('Actions pressed: ' + Object.entries(acts).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', '));
    const errs = [...new Set(results.flatMap((r) => r.errors || []))];
    if (errs.length) console.log('Page errors:\n' + errs.slice(0, 10).map((e) => '  ' + e.slice(0, 200)).join('\n'));
    if (div.length) {
      console.log(`\n${div.length} games diverged:`);
      for (const r of div) console.log(JSON.stringify({ seed: r.seed, start: r.start, ...r.div }, null, 1).slice(0, 4000));
    } else console.log('No divergence: identical routing and game state in every game, cached and uncached.');
    const out = opt('--out', null);
    if (out) fs.writeFileSync(out, JSON.stringify(results, null, 1));
    process.exit(div.length ? 1 : 0);
  };
  for (let j = 0; j < jobs; j++) {
    const c = fork(__filename, ['--child', '--base', BASE, '--head', HEAD], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    live++;
    const feed = () => { if (next < seeds.length) c.send({ seed: seeds[next++], moves, verbose, save }); else c.send({ stop: true }); };
    c.on('message', (m) => {
      if (!m.ready) {
        results.push(m);
        const tag = m.div ? 'DIVERGED at ' + m.div.where : 'ok';
        console.log(`seed ${m.seed} ${m.start ? m.start.kind + ' ' + (m.start.id || m.start.preset) + ' ' + m.start.city : ''}: ${m.moves} moves, ${m.days} days, ${(m.ms / 1000).toFixed(1)} s, ${tag}`);
        if (verbose && m.log) console.log(m.log.map((l) => '  ' + l).join('\n'));
      }
      feed();
    });
    c.on('exit', () => { if (--live === 0) done(); });
  }
}

if (has('--child')) child(); else parent();
