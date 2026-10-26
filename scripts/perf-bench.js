#!/usr/bin/env node
// Performance benchmark on a very large network (tests/fixtures/big-network.json).
//
//   node scripts/perf-bench.js                                  time this checkout
//   node scripts/perf-bench.js --base OLD.html                  compare OLD.html (e.g. main) with this checkout
//   node scripts/perf-bench.js --base OLD.html --md out.md --summary "$GITHUB_STEP_SUMMARY"
//   node scripts/perf-bench.js --save my-export.json --base OLD.html    a player's save (plain or exported from the menu)
//   node scripts/perf-bench.js --base OLD.html --browser        also in real Chromium, as a desktop and as a phone
//
// Both versions load the same save in one process and are timed in alternating turns, so a busy machine slows
// them equally. Each number is the median of several runs. It also says whether both versions route the save's
// traffic identically, which catches unintended gameplay changes in a "pure speed" PR.
// Headless (jsdom, a recording canvas): it measures our JavaScript, not the browser's painting. --browser adds the
// same workloads in Chromium (scripts/perf-browser.js), where DOM work, layout and canvas drawing are real.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../tests/harness');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.join(__dirname, '..');
const HEAD = opt('--head', path.join(ROOT, 'site', 'index.html'));
const BASE = opt('--base', null);
const RUNS = +opt('--runs', 15);
// A plain save, or a file from the in-game "Export save", which wraps it as {app, version, exported, S}.
const RAW = JSON.parse(fs.readFileSync(opt('--save', path.join(ROOT, 'tests', 'fixtures', 'big-network.json')), 'utf8'));
const SAVE = JSON.stringify(RAW && RAW.app === 'series-of-tubes' && RAW.S ? RAW.S : RAW);

// What we time. Each body runs inside the game page; panels render two selections in turn, so nothing can be
// skipped as "unchanged" and every run does the same work.
const METRICS = [
  ['compute', 'Routing: compute()', 'compute()'],
  ['day', 'One game day: dayTick()', 'S.nextFail=S.day+99;S.nextEvent=S.day+99;dayTick()'],
  ['action', 'An action: after()', 'after()'],
  ['panels', 'Side panel and left list', "for(const f of [true,false]){UI.sel={type:'city',id:f?'fra':'ams'};UI.tab=f?'peer':'up';UI.left=f?'nets':'noc';UI.leftOpen=true;renderPanel();renderLeft();}"],
  ['dash', 'NOC dashboard tabs', "$('dash').hidden=false;for(const k of ['overview','conn','traffic','infra','cust']){UI.dtab=k;renderDash();}$('dash').hidden=true"],
  ['map', 'Map at three zoom levels', "for(const z of [1,3.2,7]){cam.x=CITY.fra.x;cam.y=CITY.fra.y;cam.z=z;draw(0);}"],
];

function open(file) {
  const { ev, errors } = load({ file, seed: 777 });
  ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();renderAll();`);
  const time = (body) => ev(`(()=>{const t=performance.now();${body};return performance.now()-t;})()`);
  // What the network carries, to tell a pure speed-up from a change in how traffic is routed.
  const outcome = () => ev(`(()=>{compute();const r=[R.served,R.demand,R.reach,R.peered,JSON.stringify(R.egT),...Object.keys(R.citySrv).sort().map(c=>R.citySrv[c]),...S.links.map(l=>R.load[l.id]||0)];
    return r.map(x=>typeof x==='number'?x.toFixed(6):x).join('|');})()`);
  const size = JSON.parse(ev("JSON.stringify({pops:Object.keys(S.pops).length,links:S.links.length,pni:S.pni.length,caches:S.caches.length,customers:S.biz.length,ix:Object.keys(S.ixp).length})"));
  return { ev, errors, time, outcome, size };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const ms = (x) => x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);

(async () => {
const head = open(HEAD), base = BASE ? open(BASE) : null;
const sameOutcome = base ? base.outcome() === head.outcome() : null;
const res = {};
for (const [k, , body] of METRICS) {
  const h = [], b = [];
  for (const v of [head, base].filter(Boolean)) { v.time(body); v.time(body); }   // warm up
  for (let i = 0; i < RUNS; i++) {
    // Alternate who goes first, so drift over the run lands on both sides.
    if (base && i % 2) { b.push(base.time(body)); h.push(head.time(body)); } else { h.push(head.time(body)); if (base) b.push(base.time(body)); }
  }
  res[k] = { head: median(h), base: base ? median(b) : null, samples: { head: h, base: base ? b : null } };
}
const errs = [...head.errors, ...(base ? base.errors : [])];
const browser = args.includes('--browser') ? await require('./perf-browser').runBrowser({ head: HEAD, base: BASE, save: SAVE, metrics: METRICS, runs: RUNS, exe: opt('--chrome', process.env.PERF_CHROME) }) : null;

const { mannWhitneyP } = require('./perf-stats');
const pOf = (r) => (r.samples && r.samples.base ? mannWhitneyP(r.samples.head, r.samples.base) : 1);
const verdict = (r, noise = 2) => {
  if (r.base == null) return '';
  const ratio = r.head / (r.base || 1e-9);
  if (Math.abs(r.head - r.base) < noise || pOf(r) >= 0.01) return '≈';
  if (ratio >= 1.5) return '🔴 slower';
  if (ratio >= 1.15) return '⚠️ slower';
  if (ratio <= 0.85) return '🟢 faster';
  return '≈';
};
const pct = (r) => r.base == null ? '' : `${r.head >= r.base ? '+' : ''}${(((r.head - r.base) / (r.base || 1e-9)) * 100).toFixed(0)}%`;
const pTxt = (r) => { const p = pOf(r); return p < 0.001 ? '<0.001' : p.toFixed(p < 0.1 ? 3 : 2); };
// One table per environment, all the same shape. `noise` is the absolute floor below which nothing counts.
const table = (res, noise) => (base ? '| What | Base | This PR | Change | p | |\n|---|--:|--:|--:|--:|---|\n' : '| What | Time |\n|---|--:|\n') +
  METRICS.map(([k, label]) => { const r = res[k]; return base ? `| ${label} | ${ms(r.base)} | ${ms(r.head)} | ${pct(r)} | ${pTxt(r)} | ${verdict(r, noise)} |` : `| ${label} | ${ms(r.head)} |`; }).join('\n') + '\n';
const slowIn = (res, noise) => METRICS.filter(([k]) => /slower/.test(verdict(res[k], noise))).map(([, l]) => l);

const s = head.size;
let md = `## Performance on a big network\n\n${s.pops} POPs · ${s.links} links · ${s.pni} PNIs · ${s.caches} cache boxes · ${s.ix} IX ports · ${s.customers} customers. Median of ${RUNS} runs, in milliseconds.\n\n`;
md += `### Headless (jsdom)\n\nOur JavaScript only: jsdom has no layout and its DOM is far slower than a browser's, so trust the routing rows most here.\n\n` + table(res, 2);
const slow = base ? slowIn(res, 2) : [];
const { PROFILES } = browser ? require('./perf-browser') : { PROFILES: [] };
for (const p of PROFILES) {
  md += `\n### Chromium ${browser.version}: ${p.key === 'phone' ? 'phone' : 'desktop'}\n\n${p.key === 'phone' ? 'A 390×844 screen at 3× pixel density, with the CPU slowed down 4× like a mid-range Android.' : 'A 1280×800 window at full speed.'} Real DOM, layout and canvas.\n\n` + table(browser.profiles[p.key], 2 * p.rate);
  if (base) slow.push(...slowIn(browser.profiles[p.key], 2 * p.rate).map((l) => `${l} (Chromium ${p.key})`));
}
if (base) {
  md += `\n${sameOutcome ? '✅ Routing results are identical to the base.' : '⚠️ Routing results differ from the base: traffic is carried differently. Expected if this PR changes gameplay; a bug if it only promises to be faster.'}\n`;
  md += slow.length ? `\n**Slower:** ${slow.join(', ')}. Please explain or fix before merging.\n` : '\nNo slowdowns beyond noise.\n';
}
for (const [where, list] of [['', errs], [' in Chromium', browser ? browser.errors : []]]) {
  if (list.length) md += `\n⚠️ Page errors${where} while benchmarking:\n\n${list.slice(0, 5).map((e) => '- `' + String(e).slice(0, 200).replace(/`/g, "'") + '`').join('\n')}\n`;
}
md += `\n<sub>scripts/perf-bench.js · A row only counts as slower or faster when it moved by 15% or more and p &lt; 0.01 (Mann–Whitney U), and by more than 2 ms (8 ms on the phone). Headless Chromium draws the canvas in software; phones usually use the GPU.</sub>\n`;

console.log(md);
const out = opt('--md', null); if (out) fs.writeFileSync(out, md);
const sum = opt('--summary', null); if (sum) fs.appendFileSync(sum, md + '\n');
const js = opt('--json', null); if (js) fs.writeFileSync(js, JSON.stringify({ size: s, runs: RUNS, results: res, sameOutcome, errors: errs, browser }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
