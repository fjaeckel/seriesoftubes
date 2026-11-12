#!/usr/bin/env node
// What the multiplayer client costs the page, in real Chromium: how long it holds the main thread (long tasks over
// 50 ms, and all its tasks together) while it takes a big sub backlog, checks a ranking, rebuilds the snapshot of
// other players' networks and tallies shun votes. Not part of npm test or CI; run it by hand after changing the
// federation client:
//
//   node scripts/fed-perf.js [--base-ref REF | --base FILE] [--chrome PATH] [--rate N] (CPU slowdown, default 4,
//                            a mid-range phone) [--runs N] (default 3) [--nets N] (default 300) [--json FILE]
//                            [--profile] (self time by function during the backlog) [--trace] (what ran in each long task)
//
// The relay is a fake inside the page (FED.WS): it answers the handshake and serves records signed here in Node,
// with receipts from its node key, so every record goes through the client's real checks. The game is the
// big-network fixture, joined. Each version runs in its own browser; each run in a fresh context (empty IndexedDB).
// The CPU slowdown applies to the page's main thread; a worker runs at full speed, so compare busy and long tasks
// (what players feel as jank) rather than wall times.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const page = require('./lib/page');
const F = require('../tests/helpers/fed');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PROFILE = args.includes('--profile'), TRACE = args.includes('--trace'), RATE = +opt('--rate', 4), RUNS = +opt('--runs', 3), NETS = +opt('--nets', 300), EXE = opt('--chrome', process.env.PERF_CHROME);
const SAVE = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'big-network.json'), 'utf8');

/* ---------- records, signed here ---------- */
const now = Math.floor(Date.now() / 1000), SLOT = 300, slot = now - (now % SLOT), SRV = F.PL.id, NODE = F.key('perf node');
const ME = F.key('perf me'), CITIES = ['fra', 'ams', 'lon', 'par', 'mad', 'mil', 'waw', 'sto', 'vie', 'zrh'];
const rcpt = (r, t) => { const e = { v: 1, kind: 'receipt', key: NODE.pub, t, body: { rec: F.rid(r), server: SRV } }; e.sig = F.signText(NODE, F.canon(e)); return e; };
const item = (r, t = slot) => ({ rec: r, rcpt: [rcpt(r, t)] });
const name = (i) => 'perf' + i;
const AUTO = { peering: 'auto', transit: 'review', pni: 'review', swap: 'review', consortium: 'review', port: 'review' };
const ann = (i, t) => F.rec(name(i), 'announce', t, { name: `Perf Net ${i}`, asn: F.asn(F.key(name(i)).pub), box: F.box(name(i)), home: 'DE', day: 10 + i, founded: Math.floor(t / 86400) - 30,
  pops: CITIES.slice(0, 1 + (i % 8)), ix: CITIES.slice(0, 1 + Math.min(i % 3, i % 8)), cust: i, mix: { content: 200, eyeball: 700, enterprise: 100 }, traffic: { in: 1000 + i, out: 500 + i },
  policy: 'open', rates: {}, auto: AUTO });
// A stats record of network i with traffic to n partners (the networks after it).
const stats = (i, t, n, total) => F.rec(name(i), 'stats', t, { mode: 'normal', pops: Object.fromEntries(CITIES.slice(0, 1 + (i % 8)).map((c, j) => [c, 1 + j])),
  traffic: Array.from({ length: n }, (_, j) => ({ key: F.key(name((i + 1 + j) % total)).pub, in: 1000 + 37 * j + (t % 997), out: 800 + 11 * j })), tier1: false, shareCountry: false });
const frames = (items, id) => {
  const out = [];
  let cur = [], size = 0;
  const push = (more) => { out.push(JSON.stringify({ m: 'recs', id, items: cur, cursor: 'p' + out.length, more })); cur = []; size = 0; };
  for (const it of items) { const n = JSON.stringify(it).length; if (cur.length && (size + n > 60000 || cur.length >= 256)) push(true); cur.push(it); size += n; }
  push(false);
  return out;
};

function workloads() {
  const t0 = Date.now();
  // The sub backlog: NETS announces, 8 stats each (traffic to 10 others), sealed offers and declines to this player
  // and between others (which this player cannot open).
  const sub = [], anns = [];
  for (let i = 0; i < NETS; i++) { const a = ann(i, now - 3600); anns.push(a); sub.push(item(a)); }
  for (let k = 0; k < 8; k++) for (let i = 0; i < NETS; i++) sub.push(item(stats(i, now - 3000 + k * 300 + (i % 100), 10, NETS), slot - (8 - k) * SLOT));
  for (let i = 0; i < 150; i++) {
    const t = now - 600 + i, n = name(i), peer = i % 2 ? ME.pub : F.key(name(i + 1)).pub, pbox = i % 2 ? F.box('perf me') : F.box(name(i + 1));
    sub.push(item(i % 4 === 1 ? F.sealRec(n, 'decline', t, { offer: F.rid(anns[i]), to: peer, reason: 'declined' }, peer, pbox)
      : F.sealRec(n, 'offer', t, { to: peer, deal: 'peering', basis: F.rid(anns[i]), terms: { at: ['fra'], via: 'ix' } }, peer, pbox)));
  }
  // A traffic row worth checking: one network with a stats record in every slot of both windows (576), traffic to 50
  // partners, and 6 records of each partner.
  const why = [], K = 0;
  for (let s = 1; s <= 576; s++) why.push(item(stats(K, slot - s * SLOT + 20, 50, NETS), slot - s * SLOT));
  for (let j = 1; j <= 50; j++) for (let s = 1; s <= 6; s++) why.push(item(stats(j, slot - s * 96 * SLOT + 30, 10, NETS), slot - s * 96 * SLOT));
  why.push(item(anns[K]));
  console.error(`signed ${sub.length} backlog records and ${why.length} rankwhy records in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { sub: frames(sub, 999999999), why: frames(why, 999999999), whyKey: F.key(name(K)).pub, n: { sub: sub.length, why: why.length } };
}

/* ---------- the page side: a fake relay node, and the workloads ---------- */
const FAKE = ({ SRV, NODE, ME, SEED, SUB, WHY }) => {
  window.__fp = { sub: SUB, why: WHY, lt: [], n: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__fp.lt.push(e.duration); }).observe({ type: 'longtask', buffered: true });
  const later = (ws, t) => setTimeout(() => { if (!ws.closed && ws.onmessage) ws.onmessage({ data: t }); }, 0);
  const send = (ws, o) => later(ws, JSON.stringify(o));
  const serve = (ws, id, list) => { for (const t of list) later(ws, t.replace('999999999', String(id))); };
  FED.fetch = async () => ({ ok: false, text: async () => '' });
  FED.WS = () => {
    const ws = { closed: false, close() { ws.closed = true; },
      send(text) {
        const f = JSON.parse(text);
        if (f.m === 'hello') send(ws, { m: 'welcome', ver: 1, server: SRV, node: NODE, now: Math.floor(Date.now() / 1000) });
        else if (f.m === 'auth') send(ws, { m: 'ack', id: f.id, op: false });
        else if (f.m === 'sub') { window.__fp.subAt = performance.now(); if (f.kinds.includes('announce')) serve(ws, f.id, window.__fp.sub); }
        else if (f.m === 'put') send(ws, { m: 'ack', id: f.id, dup: false });
        else if (f.m === 'servers') send(ws, { m: 'catalog', id: f.id, entries: [] });
        else if (f.m === 'rankwhy') { if (f.key === window.__fp.whyKey) serve(ws, f.id, window.__fp.why.map((t) => t.replace('{"m":"recs",', `{"m":"recs","slot":${window.__fp.slot},`))); else send(ws, { m: 'recs', id: f.id, items: [], cursor: '', more: false, slot: window.__fp.slot }); }
        else if (f.m === 'ping') send(ws, { m: 'pong', id: f.id, now: Math.floor(Date.now() / 1000) });
        else if (f.m === 'nets') send(ws, { m: 'netstats', id: f.id, nets: [], reports: [] });
      } };
    setTimeout(() => ws.onopen && ws.onopen({}), 0);
    return ws;
  };
  S.fed = fedNewState(); Object.assign(S.fed, { key: { pub: ME, priv: SEED }, servers: ['wss://relay.example.net/fed'], on: true, joined: fedDiv(fedNow(), FED_DAY) });
  window.__fp.bad = {};
  // What the game itself does meanwhile: actions (after()) and their routing (compute()), with what asked for them.
  window.__fp.game = { after: 0, compute: 0, ms: 0, by: {} };
  const af = after, co = compute;
  after = (...a) => { const g = window.__fp.game; g.after++; const w = (new Error().stack.split('\n')[2] || '').trim().split(' ')[1]; g.by[w] = (g.by[w] || 0) + 1; return af(...a); };
  compute = (...a) => { const g = window.__fp.game, t = performance.now(); g.compute++; try { return co(...a); } finally { g.ms += performance.now() - t; } };
  const chk = fedCheck;
  fedCheck = async (...a) => { const r = await chk(...a); if (!r.ok) window.__fp.bad[r.error] = (window.__fp.bad[r.error] || 0) + 1; return r; };
  fedWake();
};

function chromium() {
  for (const m of EXE ? ['playwright-core', 'playwright'] : ['playwright', 'playwright-core']) { try { return require(m).chromium; } catch (e) { /* next */ } }
  throw new Error('needs playwright-core (npm ci) and --chrome PATH, or a local playwright');
}

async function serveFile(html) {
  const s = http.createServer((q, r) => { if (q.url === '/' || q.url === '/index.html') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); } else { r.writeHead(404); r.end(); } });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return s;
}

async function run(browser, url, W) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e.message || e)));
  await p.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
  await p.goto(url, { waitUntil: 'load' });
  await p.evaluate((s) => { S = migrate(JSON.parse(s)); UI.started = true; UI.pitched = true; UI.speed = 0; closeModal(); compute(); renderAll(); }, SAVE);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const busy = async () => { const m = (await cdp.send('Performance.getMetrics')).metrics; return 1000 * m.find((x) => x.name === 'TaskDuration').value; };
  // One measured step: wall time, main-thread task time, and the long tasks while it ran.
  const step = async (fn, arg) => {
    await p.evaluate(() => { window.__fp && (window.__fp.lt = []); });
    const b0 = await busy();
    const r = await p.evaluate(fn, arg);
    await p.waitForTimeout(100);
    const b1 = await busy(), lt = await p.evaluate(() => window.__fp.lt.slice());
    return { wall: r.wall, busy: b1 - b0, lt: lt.length, ltMs: lt.reduce((a, b) => a + b, 0), ltMax: lt.length ? Math.max(...lt) : 0, ...r };
  };
  const out = {};
  if (PROFILE) await cdp.send('Profiler.enable');
  await p.evaluate(FAKE, { SRV, NODE: NODE.pub, ME: ME.pub, SEED: ME.seed, SUB: W.sub, WHY: W.why });
  await p.evaluate((k) => { window.__fp.whyKey = k; }, W.whyKey);
  // 1. The sub backlog, from the first page to the last page's cursor kept.
  if (PROFILE) await cdp.send('Profiler.start');
  if (TRACE) await p.context().browser().startTracing(p, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  out.sub = await step(async (last) => {
    const t0 = performance.now();
    for (;;) { if (await fedGet('kv', 'cursor:wss://relay.example.net/fed#' + S.fed.key.pub) === last) break; await new Promise((r) => setTimeout(r, 25)); }
    return { wall: performance.now() - (window.__fp.subAt || t0), nets: (await fedNetworks()).length, deals: FED.dpend.length };
  }, 'p' + (W.sub.length - 1));
  if (PROFILE) out.profile = top((await cdp.send('Profiler.stop')).profile);
  if (TRACE) out.long = longTasks(JSON.parse(await p.context().browser().stopTracing()));
  out.sub.rejected = await p.evaluate(() => window.__fp.bad);
  out.sub.game = await p.evaluate(() => { const g = window.__fp.game; window.__fp.game = { after: 0, compute: 0, ms: 0, by: {} }; return g; });
  // 2. The snapshot of other players' networks, twice: changed (the game routes again), then unchanged.
  out.snap = await step(async () => { const t = performance.now(); await fedPlayRefresh(); return { wall: performance.now() - t, n: S.fedn ? S.fedn.nets.length : 0 }; });
  out.snap2 = await step(async () => { const t = performance.now(); await fedPlayRefresh(); return { wall: performance.now() - t }; });
  // 3. A ranking spot check of a traffic row with hundreds of records (fedRankOne on them, after checking each). The
  // row's true value is worked out first (not timed), so the check matches; that also times fedRankOne alone.
  const one = await p.evaluate(async () => {
    const sl = fedSlot(fedNow()), key = window.__fp.whyKey, recs = [];let ann = null;
    for (const t of window.__fp.why) for (const it of JSON.parse(t).items) { const r = it.rec; if (r.kind === 'announce') { ann = r.body; continue; }
      recs.push({ id: await fedId(r), key: r.key, slot: it.rcpt[0].t, t: r.t, body: r.body, cc: null }); }
    const q = { now: sl, board: 'traffic', measure: 'level', division: 'all', exclude: [], cities: null, filters: {} };
    const t = performance.now(), x = fedRankOne(q, key, recs, ann);
    window.__fp.whyVal = x.value;window.__fp.slot = sl;return { ms: performance.now() - t, value: x.value };
  });
  out.why = await step(async () => {
    const c = FED.live.conns.values().next().value, sl = window.__fp.slot, key = window.__fp.whyKey;
    const req = fedRankReq({ board: 'traffic', measure: 'level', division: 'all' }, [], 50);
    const a0 = { m: 'ranks', slot: sl, n: 1, rows: [{ key, value: window.__fp.whyVal }], me: null };
    const t = performance.now(), r = await fedRankCheck(c, req, a0);
    return { wall: performance.now() - t, ok: r };
  });
  out.why.rankOne = one.ms;
  // 4. An operator's shun tally: 4096 votes over 400 targets from 20 voting servers, every target looked up.
  out.shun = await step(async () => {
    const asOf = fedNow(), servers = [], votes = [];
    for (let i = 0; i < 20; i++) servers.push({ id: fedB64(new Uint8Array(32).fill(i + 1)), operators: [fedB64(new Uint8Array(32).fill(100 + i))], listed: asOf - 40 * 86400, answered: asOf });
    for (let i = 0; i < 4096; i++) { const s = servers[i % 20];
      votes.push({ id: fedB64(new Uint8Array(32).fill(i % 251)) + i, rec: { kind: i % 7 ? 'shun' : 'unshun', key: s.operators[0], t: asOf - (i % 500) * 3600, body: { server: s.id, target: fedB64(new Uint8Array(32).fill(i % 200)), reason: 'spam' } } }); }
    await fedPut('kv', 'registry', { asOf, at: asOf, servers });
    await fedPut('kv', 'votes', votes);
    FED.vgen++;
    const t = performance.now(), T = await fedShunTally(fedNow());
    let n = 0;
    for (const k of T.targets.keys()) { await fedShunInfo(k); n++; }
    return { wall: performance.now() - t, n };
  });
  out.worker = await p.evaluate(() => (typeof FW === 'object' ? { used: FW.stat ? { ...FW.stat } : null } : null));
  out.errors = errors;
  await ctx.close();
  return out;
}

// The tasks over 50 ms of a trace (the page's main thread), each with what ran in it: [ms, what].
function longTasks(tr) {
  const ev = tr.traceEvents, main = ev.find((e) => e.name === 'thread_name' && e.args.name === 'CrRendererMain');
  const on = ev.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X');
  const long = on.filter((e) => e.name === 'RunTask' && e.dur > 50000);
  return long.map((t) => { const inner = on.filter((e) => e !== t && e.ts >= t.ts && e.ts < t.ts + t.dur && e.dur > 5000);
    return [Math.round(t.dur / 1000), inner.map((e) => e.name + (e.args && e.args.data ? ':' + (e.args.data.functionName || e.args.data.type || '') : '') + ' ' + Math.round(e.dur / 1000)).slice(0, 8).join(', ')]; });
}
// Self time by function, the 25 biggest, from a CPU profile.
function top(prof) {
  const self = new Map(), dt = new Map();
  for (let i = 0; i < prof.samples.length; i++) dt.set(prof.samples[i], (dt.get(prof.samples[i]) || 0) + (prof.timeDeltas[i + 1] || 0));
  for (const n of prof.nodes) { const k = (n.callFrame.functionName || '(anon)') + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + (dt.get(n.id) || 0) / 1000); }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' ' + v.toFixed(0));
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

async function main() {
  const W = workloads();
  const head = page.shipped().html;
  const base = opt('--base') ? fs.readFileSync(opt('--base'), 'utf8') : opt('--base-ref') ? page.assembleRef(opt('--base-ref')) : null;
  const vers = [['head', head], ...(base ? [['base', base]] : [])];
  const res = {};
  for (const [k, html] of vers) {
    const srv = await serveFile(html), url = `http://127.0.0.1:${srv.address().port}/`;
    const browser = await chromium().launch(EXE ? { executablePath: EXE } : {});
    try { res[k] = []; for (let i = 0; i < RUNS; i++) { const r = await run(browser, url, W); res[k].push(r); console.error(k, i, JSON.stringify(r)); } }
    finally { await browser.close(); srv.close(); }
  }
  const rows = [['sub', `Sub backlog: ${W.n.sub} records`], ['snap', 'Snapshot rebuild (changed, routes again)'], ['snap2', 'Snapshot rebuild (unchanged)'],
    ['why', `Ranking spot check: ${W.n.why} records`], ['shun', 'Shun tally: 4096 votes, every target']];
  const cell = (l, f) => { const v = l.map(f); return median(v); };
  const fmt = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
  console.log(`\nChromium, ${RATE}x CPU slowdown, median of ${RUNS} runs. busy: main-thread task time; long: tasks over 50 ms (count, total ms, longest).\n`);
  console.log('| Workload | ' + vers.map(([k]) => `${k} wall | ${k} busy | ${k} long`).join(' | ') + ' |');
  console.log('|---|' + vers.map(() => '---:|---:|---:').join('|') + '|');
  for (const [k, label] of rows) {
    console.log(`| ${label} | ` + vers.map(([v]) => { const l = res[v].map((r) => r[k]);
      return `${fmt(cell(l, (x) => x.wall))} ms | ${fmt(cell(l, (x) => x.busy))} ms | ${cell(l, (x) => x.lt)} / ${fmt(cell(l, (x) => x.ltMs))} / ${fmt(cell(l, (x) => x.ltMax))}`; }).join(' | ') + ' |');
  }
  for (const [v] of vers) { const e = res[v].flatMap((r) => r.errors); if (e.length) console.log(`\n${v} page errors: ${[...new Set(e)].join('; ')}`); }
  for (const [v] of vers) console.log(`${v}: federation worker ${JSON.stringify(res[v][0].worker)}; rankwhy check ${res[v].map((r) => r.why.ok).join(',')}; networks ${res[v][0].sub.nets}, snapshot ${res[v][0].snap.n}`);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(res, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
