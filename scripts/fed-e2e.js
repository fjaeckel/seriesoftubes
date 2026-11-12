#!/usr/bin/env node
// Multiplayer end to end: the real Go relay (built from relay/ with `go build`) against the real game page in Chromium.
// Not part of npm test or CI; run it by hand after changing either side:
//
//   node scripts/fed-e2e.js            [--keep] (leave the temp folder) [--headed] [--fakes N] (default 260)
//                                      [--quick] (skip the wait for the slot to end, and the leaderboard checks after it)
//   node scripts/fed-e2e.js --play     [--fakes N] (default 12) [--port P] sets up the same relay without TLS (the
//                                      game dials *.localhost nodes over ws:// from a localhost page, §9.1) and prints
//                                      two addresses to open in any browser, one player each; runs until Ctrl-C
//
// Everything runs on loopback: the relay serves TLS itself with a certificate made for the run (Chromium is told to
// ignore that it is self-signed), the page is served by a small static server, and a registry (servers.json) lists the
// relay plus four servers that exist only to vote, so a shun can really reach its threshold. Two browser contexts are
// two players. A Node client puts a few hundred signed records of made-up networks, so the relay's paging (backlogs,
// cursors) and its rate limit are exercised. The board only ranks finished 5-minute slots, so the run waits
// for the next slot boundary once (up to five minutes). Prints one line per step and exits non-zero on any failure.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { assemble, ROOT } = require('./lib/page');
const registry = require('./registry');

const arg = (k) => process.argv.includes(k);
const argv = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PLAY = arg('--play'), KEEP = arg('--keep'), HEADED = arg('--headed'), QUICK = arg('--quick');
const FAKES = Math.max(0, +argv('--fakes', PLAY ? 12 : 260) || 0);
const HOST = 'relay.localhost', SLOT = 300, DAY = 86400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

/* ---------- records signed in Node (the vectors' way) ---------- */
const b64 = (b) => Buffer.from(b).toString('base64url');
const sha = (x) => crypto.createHash('sha256').update(x).digest();
function canon(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
function keyOf(seed) {
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' });
  return { priv, pub: b64(crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12)) };
}
const sign = (k, kind, t, body) => { const r = { v: 1, kind, key: k.pub, t, body }; r.sig = b64(crypto.sign(null, Buffer.from(canon(r), 'utf8'), k.priv)); return r; };
const rid = (r) => b64(sha(canon(r)));
const asnOf = (pub) => 4200000000 + (sha(Buffer.from(pub, 'base64url')).readUInt32BE(0) % 94967295);
const AUTO = { peering: 'auto', transit: 'review', pni: 'review', swap: 'review', consortium: 'review', port: 'review' };
// box: any Key will do for made-up networks, which never deal (games derive theirs from the seed, §3.5).
const fakeAnn = (k, i, t) => sign(k, 'announce', t, { name: `Fake Net ${String(i).padStart(3, '0')}`, asn: asnOf(k.pub), box: k.pub, home: 'DE', day: 10 + i, founded: Math.floor(t / DAY),
  pops: ['fra', 'ams', 'lon'].slice(0, 1 + (i % 3)), ix: [], cust: i, mix: { content: 200, eyeball: 700, enterprise: 100 }, traffic: { in: 1000 + i, out: 500 },
  policy: 'open', rates: {}, auto: AUTO });
const fakeStats = (k, i, t) => sign(k, 'stats', t, { mode: 'normal', pops: Object.fromEntries(['fra', 'ams', 'lon', 'par', 'mad'].slice(0, 1 + (i % 5)).map((c) => [c, 1])),
  traffic: [], tier1: false, shareCountry: true, ...(i % 4 === 0 ? { ai: { model: 'e2e-model', harness: 'e2e' } } : {}) });

/* ---------- a raw protocol client (Node's WebSocket), for the made-up networks and the other servers' votes ---------- */
class Raw {
  constructor(url) { this.url = url; this.nid = 0; this.wait = new Map(); this.limited = 0; this.frames = []; }
  open() {
    return new Promise((res, rej) => {
      const ws = this.ws = new WebSocket(this.url, ['tubes-fed.1']);
      const t = setTimeout(() => rej(new Error('raw client: no welcome')), 10000);
      ws.onopen = () => ws.send(JSON.stringify({ m: 'hello', vers: [1], role: 'client' }));
      ws.onerror = (e) => rej(new Error('raw client: ' + (e.message || 'socket error')));
      ws.onmessage = (e) => {
        const f = JSON.parse(e.data);
        this.frames.push(f);
        if (f.m === 'welcome') { clearTimeout(t); this.welcome = f; res(f); return; }
        if (f.m === 'ping') { ws.send(JSON.stringify({ m: 'pong', id: f.id, now: now() })); return; }
        const q = this.wait.get(f.id);
        if (!q) return;
        q.got.push(f);
        if ((f.m === 'recs' || f.m === 'catalog') && f.more === true) return;
        this.wait.delete(f.id); q.res(q.got);
      };
    });
  }
  send(m) { const id = ++this.nid; return new Promise((res) => { this.wait.set(id, { res, got: [] }); this.ws.send(JSON.stringify({ ...m, id })); }); }
  // A request, waiting out rate_limited as the relay asks (the relay's token bucket: puts cost 1, sub 5, rank 10).
  async ask(m) {
    for (let i = 0; i < 50; i++) {
      const got = await this.send(m);
      if (got[0].m === 'err' && got[0].code === 'rate_limited') { this.limited++; await sleep(Math.min(5, got[0].retry || 1) * 1000); continue; }
      return got;
    }
    throw new Error('raw client: still rate limited');
  }
  async put(rec) { return (await this.ask({ m: 'put', rec }))[0]; }
  close() { try { this.ws.close(); } catch (e) { /* gone */ } }
}

/* ---------- steps ---------- */
const results = [];
let failed = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try { const note = await fn(); results.push([name, true]); console.log(`PASS  ${name}${note ? `: ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); return true; }
  catch (e) { failed++; results.push([name, false]); console.log(`FAIL  ${name}: ${e && e.message ? e.message : e}`); if (process.env.FED_E2E_DEBUG) console.log(e && e.stack); return false; }
}
const must = (ok, msg) => { if (!ok) throw new Error(msg); };
async function until(fn, ms, what) {
  const end = Date.now() + ms; let last;
  for (;;) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } if (Date.now() > end) throw new Error(`timed out waiting for ${what}${last instanceof Error ? ` (${last.message})` : ''}`); await sleep(250); }
}

// playwright-core names the Chromium build it was made for; the cache may hold another one: take the newest there.
function chromeIn(want) {
  if (fs.existsSync(want)) return want;
  const m = /^(.*[\\/])chromium-(\d+)([\\/].*)$/.exec(want);
  if (!m || !fs.existsSync(m[1])) return want;
  const have = fs.readdirSync(m[1]).map((n) => /^chromium-(\d+)$/.exec(n)).filter(Boolean).map((x) => +x[1]).sort((a, b) => b - a)
    .map((v) => m[1] + 'chromium-' + v + m[3]).find((f) => fs.existsSync(f));
  return have || want;
}
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

async function main() {
  // The relay's local control socket lives in its data folder, and Unix socket paths are short: keep the folder short.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir().length < 60 ? os.tmpdir() : '/tmp', 'fe2e-'));
  const procs = [];
  let browser = null, web = null;
  const cleanup = async () => {
    try { if (browser) await browser.close(); } catch (e) { /* gone */ }
    for (const p of procs) try { p.kill('SIGTERM'); } catch (e) { /* gone */ }
    if (web) web.close();
    if (!KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log(`kept ${tmp}`);
  };
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
  const bin = path.join(tmp, 'relay');
  const relay = (dir, ...a) => execFileSync(bin, [a[0], '--data', dir, ...a.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ctl = (cmd, ...a) => JSON.parse(relay(path.join(tmp, 'd1'), cmd, ...a));
  let relayLog = '';
  const P = {};
  try {
    const wport = PLAY && +argv('--port', 0) || await freePort(), [port, mport] = [await freePort(), await freePort()];
    const URL1 = `wss://${HOST}:${port}/fed`;

    await step('build the relay (go build)', async () => {
      execFileSync('go', ['build', '-o', bin, './cmd/relay'], { cwd: path.join(ROOT, 'relay'), stdio: ['ignore', 'pipe', 'pipe'] });
      return path.relative(ROOT, bin) === bin ? bin : 'ok';
    });

    // Server 1 serves; servers 2 to 5 only exist in the registry, so their operators can vote.
    const srv = [];
    await step('found five servers (relay init, genesis) and build servers.json', async () => {
      for (let i = 1; i <= 5; i++) {
        const d = path.join(tmp, 'd' + i), url = i === 1 ? URL1 : `wss://vote${i}.localhost:9/fed`;
        relay(d, 'init', '--url', url);
        const out = relay(d, 'genesis', '--name', i === 1 ? 'E2E Tubes' : `E2E Voter ${i}`, '--sync', i === 1 ? 'standalone' : 'open', '--langs', 'en');
        const id = /identity: (\S+)/.exec(out)[1];
        srv.push({ i, d, id, url, op: keyOf(Buffer.from(fs.readFileSync(path.join(d, 'operator.key'), 'utf8').trim(), 'base64url')) });
      }
      const dir = path.join(tmp, 'servers'), today = Math.floor(now() / DAY) * DAY;
      fs.mkdirSync(dir);
      for (const s of srv) {
        const f = JSON.parse(execFileSync(bin, ['registry-file', '--data', s.d], { cwd: tmp, encoding: 'utf8' }));
        Object.assign(f, { listed: today - 40 * DAY, answered: today });
        fs.writeFileSync(path.join(dir, s.id + '.json'), JSON.stringify(f, null, 2));
      }
      const out = path.join(tmp, 'site', 'federation', 'servers.json');
      const v = registry.build(dir, out);
      must(v.servers.length === 5, `servers.json has ${v.servers.length} servers, not 5`);
      // The relay builds the same file byte for byte.
      execFileSync(bin, ['build-servers-json', dir, path.join(tmp, 'servers-go.json')], { stdio: 'ignore' });
      const go = fs.readFileSync(path.join(tmp, 'servers-go.json'), 'utf8'), js = fs.readFileSync(out, 'utf8');
      must(go === js, 'relay build-servers-json and scripts/registry.js disagree');
      return `server ${srv[0].id.slice(0, 8)}…`;
    });

    await step(PLAY ? 'relay serves plain ws on loopback' : 'relay serves TLS on loopback', async () => {
      if (!PLAY) execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', `/CN=${HOST}`,
        '-addext', `subjectAltName=DNS:${HOST}`, '-keyout', path.join(tmp, 'tls.key'), '-out', path.join(tmp, 'tls.crt')], { stdio: 'ignore' });
      const cf = path.join(srv[0].d, 'config.json'), c = JSON.parse(fs.readFileSync(cf, 'utf8'));
      Object.assign(c, { listen: `127.0.0.1:${port}`, metrics: `127.0.0.1:${mport}`, registry: path.join(tmp, 'site', 'federation', 'servers.json') },
        PLAY ? {} : { tlsCert: path.join(tmp, 'tls.crt'), tlsKey: path.join(tmp, 'tls.key') });
      fs.writeFileSync(cf, JSON.stringify(c, null, 2));
      const p = spawn(bin, ['serve', '--data', srv[0].d], { stdio: ['ignore', 'pipe', 'pipe'] });
      procs.push(p);
      p.stdout.on('data', (b) => { relayLog += b; });
      p.stderr.on('data', (b) => { relayLog += b; });
      await until(() => new Promise((res) => { const s = net.connect(port, '127.0.0.1', () => { s.end(); res(true); }); s.on('error', () => res(false)); }), 15000, 'the relay port');
      await until(() => { try { return ctl('status').serving; } catch (e) { return false; } }, 15000, 'relay status serving');
      const st = ctl('status');
      must(st.registry === 5, `relay knows ${st.registry} registry servers, not 5`);
      return `${URL1}, registry ${st.registry}`;
    });

    // The page: assembled from src/ as players get it, static files from site/, servers.json from this run.
    await step('serve the game page', async () => {
      const { html } = assemble({ dev: false });
      const SITE = path.join(ROOT, 'site'), own = path.join(tmp, 'site');
      const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
      web = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x').pathname;
        if (u === '/' || u === '/index.html') { res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' }); return res.end(html); }
        const rel = path.normalize(decodeURIComponent(u)).replace(/^([/\\]|\.\.)+/, '');
        for (const base of [own, SITE]) {
          const f = path.join(base, rel);
          if (f.startsWith(base + path.sep) && fs.statSync(f, { throwIfNoEntry: false })?.isFile()) {
            res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
            return fs.createReadStream(f).pipe(res);
          }
        }
        res.writeHead(404); res.end();
      });
      await new Promise((r) => web.listen(wport, '127.0.0.1', r));
      return `http://127.0.0.1:${wport}/`;
    });

    // Made-up networks first, so the players' backlogs and boards are long enough to need several pages.
    const fakes = [];
    let raw = null;
    await step(`put ${FAKES} made-up networks (announce + stats) through a raw client`, async () => {
      if (!PLAY) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // the run's own self-signed certificate, loopback only
      raw = new Raw(`${PLAY ? 'ws' : 'wss'}://127.0.0.1:${port}/fed`);
      const w = await raw.open();
      must(w.server === srv[0].id, 'welcome names another server');
      const t = now();
      for (let i = 0; i < FAKES; i++) {
        const k = keyOf(sha('fed-e2e fake ' + i));
        const a = fakeAnn(k, i, t), s = fakeStats(k, i, t);
        for (const r of [a, s]) { const x = await raw.put(r); must(x.m === 'ack' && x.rid === rid(r), `put ${r.kind} ${i}: ${JSON.stringify(x).slice(0, 200)}`); must(x.rcpt && x.rcpt.kind === 'receipt', 'ack without receipt'); }
        fakes.push({ k, a, s });
      }
      const st = ctl('status');
      must(st.kinds.announce >= FAKES && st.kinds.stats >= FAKES, `relay holds ${st.kinds.announce} announces, ${st.kinds.stats} stats`);
      return `${raw.limited} rate_limited answers waited out`;
    });

    await step('raw client: sub backlog is paged, every page carries a cursor', async () => {
      const pages = await raw.ask({ m: 'sub', kinds: ['announce'], since: '' });
      const items = pages.flatMap((p) => p.items);
      must(items.length >= FAKES, `backlog has ${items.length} announces`);
      must(pages.every((p) => p.m === 'recs' && typeof p.cursor === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(p.cursor)), 'a page without a valid cursor');
      must(pages.slice(0, -1).every((p) => p.more === true) && pages.at(-1).more === false, 'more flags wrong');
      must(FAKES < 130 || pages.length > 1, 'one page for a long backlog');
      // Resuming from the middle page's cursor gives exactly what came after it.
      if (pages.length > 1) {
        const mid = pages[0].cursor, rest = (await raw.ask({ m: 'sub', kinds: ['announce'], since: mid })).flatMap((p) => p.items);
        must(rest.length === items.length - pages[0].items.length, `resume from page 1 gave ${rest.length}, wanted ${items.length - pages[0].items.length}`);
      }
      return `${items.length} records in ${pages.length} pages, cursor ${pages.at(-1).cursor}`;
    });

    // --play: no browser of ours; two addresses with different origins (so separate saves), each on an invite.
    if (PLAY) {
      const inv = `/#join=${URL1}`;
      console.log(`\nReady. Relay ${URL1.replace('wss:', 'ws:')} (server "E2E Tubes"), no TLS. Open one address per player:
  Player 1: http://localhost:${wport}${inv}
  Player 2: http://127.0.0.1:${wport}${inv}
Name your network, start a Normal game, and the join sheet opens: press Join. Then menu > Multiplayer: the looking
glass finds the other player, its Deals button asks for peering. Ctrl-C stops (the relay is thrown away; the games
stay in the browser).`);
      await new Promise(() => {}); // until Ctrl-C (SIGINT cleans up)
    }

    // The browsers.
    const { chromium } = require('playwright-core');
    // The full Chromium of the Playwright cache (its new headless mode), so no separate headless shell is needed.
    const exe = process.env.FED_E2E_CHROME || chromeIn(chromium.executablePath());
    /* The page is opened as http://game.test, not a loopback name: from a loopback page the game would dial *.localhost
       nodes over plain ws:// (§9.1, development), and this run tests TLS. Chromium is told to treat it as secure, as
       WebCrypto needs. */
    const PAGE = `http://game.test:${wport}/`;
    browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, headless: !HEADED,
      args: ['--ignore-certificate-errors', `--host-resolver-rules=MAP ${HOST} 127.0.0.1, MAP game.test 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${PAGE.slice(0, -1)}`] });

    const players = {};
    async function player(name) {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const p = { name, ctx, page, errors: [], frames: [], sent: [] };
      page.on('pageerror', (e) => p.errors.push(String(e.message || e)));
      page.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
      page.on('websocket', (ws) => {
        if (!ws.url().startsWith('wss://')) return;
        ws.on('framereceived', (f) => { try { p.frames.push(JSON.parse(f.payload)); } catch (e) { /* not JSON */ } });
        ws.on('framesent', (f) => { try { p.sent.push(JSON.parse(f.payload)); } catch (e) { /* not JSON */ } });
      });
      await page.goto(PAGE, { waitUntil: 'load' });
      await page.evaluate((nm) => { const i = document.getElementById('nmIn'); if (i) i.value = nm; UI.pitched = true; ACT.start({}); }, name);
      await page.waitForFunction(() => typeof S !== 'undefined' && S && UI.started);
      await page.evaluate(() => { try { closeModal(); } catch (e) { /* none */ } });
      players[name] = p;
      return p;
    }
    const ev = (p, f, a) => p.page.evaluate(f, a);
    const click = async (p, sel) => { await p.page.locator(sel).first().click(); };

    for (const nm of ['Alice Net', 'Bob Net']) {
      await step(`${nm}: joins the server through the join sheet`, async () => {
        const p = await player(nm);
        await ev(p, () => ACT.fuOpen({ v: 'join' }));
        await p.page.waitForSelector('.fedui [data-act="fuJoin"]', { timeout: 15000 });
        const card = await p.page.locator('.fu-srv', { hasText: 'E2E Tubes' }).first();
        await card.locator('[data-act="fuJoin"]').click();
        await until(() => ev(p, () => fedStatus().state === 'connected'), 20000, 'connected');
        const ch = p.sent.find((f) => f.m === 'challenge'), pr = p.frames.find((f) => f.m === 'proof');
        must(ch && pr, 'the client did not check the node with a challenge (is the server in its registry?)');
        must(p.sent.some((f) => f.m === 'sub'), 'no sub');
        const au = p.sent.find((f) => f.m === 'auth');
        must(au && p.frames.some((f) => f.m === 'ack' && f.id === au.id) && p.sent.indexOf(au) < p.sent.findIndex((f) => f.m === 'sub'), 'the game did not prove its key before its sub');
        await until(() => p.frames.some((f) => f.m === 'excluded'), 30000, 'the excluded list after the sub\'s backlog');
        return `node checked with a challenge, ${p.frames.filter((f) => f.m === 'catalog').length} catalog frame(s)`;
      });
    }
    const A = players['Alice Net'], B = players['Bob Net'];
    if (!A || !B) throw new Error('players did not start');

    await step('both announce; the relay lists them', async () => {
      const pa = await until(() => { const l = ctl('players'); const a = l.find((x) => x.name === 'Alice Net'), b = l.find((x) => x.name === 'Bob Net'); return a && b && [a, b]; }, 30000, 'both announces at the relay');
      P.A = pa[0].key; P.B = pa[1].key;
      const keys = await ev(A, () => S.fed.key.pub);
      must(keys === P.A, 'relay lists another key for Alice');
      return `Alice ${P.A.slice(0, 8)}…, Bob ${P.B.slice(0, 8)}…`;
    });

    await step('each player sees the other (and the made-up networks) from the paged sub', async () => {
      for (const [me, other] of [[A, P.B], [B, P.A]]) {
        await until(() => ev(me, async (k) => (await fedNetworks()).some((n) => n.key === k), other), 30000, `${me.name} to see the other player`);
        const n = await ev(me, async () => (await fedNetworks()).length);
        must(n >= FAKES + 1, `${me.name} knows ${n} networks`);
        const recs = me.frames.filter((f) => f.m === 'recs' && f.id === me.sent.find((s) => s.m === 'sub').id);
        must(FAKES < 130 || recs.length > 1, `${me.name}: backlog came in ${recs.length} frame(s)`);
        const cur = await ev(me, async () => fedGet('kv', 'cursor:' + S.fed.servers[0]));
        must(typeof cur === 'string' && cur === recs.at(-1).cursor, `${me.name}: saved cursor ${cur} is not the last page's ${recs.at(-1) && recs.at(-1).cursor}`);
      }
      return 'both';
    });

    await step('reconnect resumes from the saved cursor (nothing sent twice)', async () => {
      const before = B.frames.length;
      const subs = B.sent.filter((f) => f.m === 'sub').length;
      await ev(B, () => { const c = [...FED.live.conns.values()][0]; fedDrop(c, 'test'); });
      await until(() => B.sent.filter((f) => f.m === 'sub').length > subs && ev(B, () => fedStatus().state === 'connected'), 30000, 'Bob to reconnect');
      const sub = B.sent.filter((f) => f.m === 'sub').at(-1);
      must(sub.since !== '', 'the sub after reconnect did not pass the cursor');
      await sleep(1500);
      const again = B.frames.slice(before).filter((f) => f.m === 'recs' && f.id === sub.id).flatMap((f) => f.items);
      must(again.length < 20, `${again.length} records sent again after reconnect`);
      return `since ${sub.since}, ${again.length} new`;
    });

    // Bob reviews peering requests and sells PNIs on review.
    await step('Bob publishes terms (peering on review, a PNI rate card)', async () => {
      await ev(B, () => ACT.fpTermsSet({ terms: JSON.stringify({ pol: 'open', auto: { peering: 'review', pni: 'review' }, rates: { pni: { setup: 1000, ports: [{ mbps: 10000, monthly: 500 }], term: 30 } } }) }));
      await until(() => ev(A, async (k) => { await fedPlayRefresh(); const a = FEDN.ann.get(k); return !!a && a.rec.body.auto.peering === 'review' && !!a.rec.body.rates.pni; }, P.B), 30000, 'Alice to see Bob\'s new terms');
    });

    await step('Alice finds Bob in the looking glass, asks for peering; Bob accepts in his NOC queue', async () => {
      // With more networks than the game makes places of (48), Bob is not one yet: the glass's Deals button makes him one.
      await ev(A, (k) => ACT.fuOpen({ v: 'net', key: k, back: 'glass' }), P.B);
      await until(async () => (await A.page.locator('#modalCard [data-act="fpNet"]').count()) > 0, 15000, 'the Deals button in the looking glass');
      await click(A, '#modalCard [data-act="fpNet"]');
      const btns = A.page.locator('#modal [data-act="fpReq"]');
      await until(async () => (await btns.count()) > 0, 10000, 'request buttons');
      // Neither runs an exchange yet: peer over a PNI where both have a POP.
      await A.page.locator('#modal select[data-chg="fpPick"][data-args*="peering.via"]').selectOption('pni');
      let clicked = false;
      for (let i = 0; i < await btns.count(); i++) {
        const a = JSON.parse(await btns.nth(i).getAttribute('data-args'));
        if (a.deal === 'peering' && !(await btns.nth(i).isDisabled())) { await btns.nth(i).click(); clicked = true; break; }
      }
      if (!clicked) await ev(A, (k) => ACT.fpReq({ key: k, deal: 'peering', via: 'pni', at: 'fra' }), P.B);
      const d = await until(() => ev(A, (k) => S.fed.deals.find((x) => x.key === k && x.deal === 'peering'), P.B), 10000, 'Alice\'s waiting deal');
      must(d.st === 'wait', `Alice's deal is ${d.st}, not waiting for review`);
      await until(() => ev(B, () => S.fedp && S.fedp.rq.length > 0), 30000, 'the request in Bob\'s queue');
      await ev(B, () => { closeModal(); ACT.fpQueue(); });
      await B.page.locator('[data-act="fpAccept"]').first().click();
      await until(() => ev(A, (k) => { const x = S.fed.deals.find((y) => y.key === k && y.deal === 'peering'); return x && x.st === 'run'; }, P.B), 30000, 'Alice\'s deal to run');
      const bd = await ev(B, (k) => S.fed.deals.find((x) => x.key === k && x.deal === 'peering'), P.A);
      must(bd && bd.st === 'run', 'Bob has no running deal');
      return clicked ? 'requested with the sheet\'s button' : 'requested with ACT.fpReq (no enabled button)';
    });

    await step('Alice asks Bob for a PNI; Bob declines; Alice sees it declined', async () => {
      const r = await ev(A, (k) => ACT.fpReq({ key: k, deal: 'pni', at: 'fra', mbps: 10000 }), P.B);
      must(r === null || r === undefined, `request refused: ${JSON.stringify(r)}`);
      await until(() => ev(B, () => S.fedp.rq.some((q) => q.rec.body.deal === 'pni')), 30000, 'the PNI request at Bob');
      await ev(B, () => { closeModal(); ACT.fpQueue(); });
      await B.page.locator('[data-act="fpDecline"]').first().click();
      await until(() => ev(A, (k) => { const x = S.fed.deals.find((y) => y.key === k && y.deal === 'pni'); return x && x.st === 'over'; }, P.B), 30000, 'Alice\'s PNI to end');
      const kinds = ctl('status').kinds;
      must(kinds.offer >= 2 && kinds.accept >= 1 && kinds.decline >= 1, `relay holds ${JSON.stringify(kinds)}`);
      return `relay: ${kinds.offer} offers, ${kinds.accept} accept, ${kinds.decline} decline`;
    });

    // Deals are private (§5.3, §9.3): only Alice's and Bob's sessions get their offers, accepts and declines, sealed.
    await step('a third party gets none of Alice and Bob\'s deal records; what the relay keeps of them is sealed', async () => {
      const kinds = ['offer', 'accept', 'decline'], isDeal = (it) => !!it && !!it.rec && kinds.includes(it.rec.kind);
      const authed = async (k) => { const c = new Raw(raw.url), w = await c.open(), t = now();
        const sig = b64(crypto.sign(null, Buffer.from(canon({ m: 'auth', key: k.pub, node: w.node, server: w.server, t }), 'utf8'), k.priv));
        const a = (await c.ask({ m: 'auth', key: k.pub, t, sig }))[0]; must(a.m === 'ack', `auth: ${JSON.stringify(a)}`); return c; };
      const ids = await ev(A, (k) => S.fed.deals.filter((d) => d.key === k).map((d) => d.id), P.B);
      must(ids.length >= 2, `Alice has ${ids.length} deals with Bob`);
      // A session that proved nothing (the raw client) and one that proved another network's key: nothing, live,
      // from the backlog or by id.
      const third = await authed(fakes[1].k);
      for (const [who, c] of [['an anonymous session', raw], ['another network', third]]) {
        const items = (await c.ask({ m: 'sub', kinds, since: '' })).flatMap((p) => p.items || []);
        must(!items.some(isDeal), `${who} got ${items.filter(isDeal).length} deal records`);
        const got = (await c.ask({ m: 'fetch', ids })).flatMap((p) => p.items || []);
        must(!got.length, `${who} fetched ${got.length} of Alice's offers`);
        must(!c.frames.some((f) => f.m === 'recs' && (f.items || []).some(isDeal)), `${who} saw a deal record live`);
      }
      third.close();
      // Alice's own key gets them all, as the relay keeps them: to (and offer) in clear, the rest a box.
      const seed = await ev(A, () => S.fed.key.priv), ak = keyOf(Buffer.from(seed, 'base64url'));
      const mine = await authed(ak), items = (await mine.ask({ m: 'sub', kinds, since: '' })).flatMap((p) => p.items || []).filter(isDeal);
      mine.close();
      const offers = items.filter((it) => it.rec.kind === 'offer' && it.rec.key === ak.pub), decl = items.filter((it) => it.rec.kind === 'decline');
      must(offers.length >= 2 && decl.length >= 1, `Alice's session got ${offers.length} offers, ${decl.length} declines`);
      for (const it of offers) must(JSON.stringify(Object.keys(it.rec.body).sort()) === '["enc","to"]', `an offer in clear: ${JSON.stringify(it.rec.body).slice(0, 120)}`);
      for (const it of decl) must(JSON.stringify(Object.keys(it.rec.body).sort()) === '["enc","offer","to"]', `a decline in clear: ${JSON.stringify(it.rec.body).slice(0, 120)}`);
      return `third parties saw 0 of ${items.length}; Alice's ${offers.length} offers and ${decl.length} declines are sealed`;
    });

    // Waves between players: Bob lights a route between two of his POPs and sells waves on it; Alice buys a 400G one.
    await step('Bob sells waves on a route he lit; Alice asks for 400G, Bob accepts; Alice routes over it, Bob books it', async () => {
      const route = await ev(B, () => {
        const h = S.home, x = h === 'ams' ? 'fra' : 'ams', [a, b] = [h, x].sort();
        S.cash = 1e8; if (!S.pops[x]) ACT.buildPop({ city: x });
        S.links.push({ id: 'E2EWV', a, b, kind: 'df', own: true, sys: 'roadm', ch: ['tp16'], km: Math.round(kmBetween(a, b) * 1.05), ready: 0, day: 0, cut: 0, mo: 100, trench: 'own:E2EWV', pairs: 1 });
        after();
        return fedWaveLit().includes(a + '|' + b) ? [a, b] : null;
      });
      must(route, 'Bob has no lit route');
      const [a, b] = route;
      await ev(B, (r) => ACT.fpTermsSet({ terms: JSON.stringify({ pol: 'open', auto: { peering: 'review', pni: 'review', wave: 'review' },
        rates: { pni: { setup: 1000, ports: [{ mbps: 10000, monthly: 500 }], term: 30 }, wave: { routes: [{ a: r[0], b: r[1] }], sizes: [{ gbps: 100, monthly: 1e9 }, { gbps: 400, monthly: 1e9 }], term: 30 } } }) }), route);
      const price = await ev(B, () => S.fedp.rates.wave.sizes[1].monthly);
      must(price === await ev(B, (r) => fedWaveCeil(r[0], r[1], 400), route), `Bob's 400G price ${price} is not capped at the computer-run price`);
      await until(() => ev(A, async (k) => { await fedPlayRefresh(); const x = FEDN.ann.get(k); return !!x && !!x.rec.body.rates.wave && !!fedNetOf(k); }, P.B), 30000, 'Alice to see Bob\'s wave card');
      // Alice: POPs at both ends with routers that take 400G, and customers at the far end.
      await ev(A, (r) => { S.cash = 1e8; for (const c of r) { if (!S.pops[c]) ACT.buildPop({ city: c }); S.pops[c].rgen = Math.max(1, S.pops[c].rgen || 0); } ACT.launchBB({ city: r[0] === S.home ? r[1] : r[0] }); after(); }, route);
      const miss = await ev(A, ([k, r]) => fedOffer(k, 'wave', { at: r.join('|'), mbps: 400000 }).miss, [P.B, route]);
      must(!miss.length, `Alice still misses ${JSON.stringify(miss)}`);
      const r = await ev(A, ([k, rt]) => ACT.fpReq({ key: k, deal: 'wave', at: rt.join('|'), mbps: 400000 }), [P.B, route]);
      must(r === null || r === undefined, `request refused: ${JSON.stringify(r)}`);
      await until(() => ev(B, () => S.fedp.rq.some((q) => q.rec.body.deal === 'wave')), 30000, 'the wave request at Bob');
      await ev(B, () => { closeModal(); ACT.fpQueue(); });
      const id = await ev(B, () => S.fedp.rq.find((q) => q.rec.body.deal === 'wave').id);
      await B.page.locator(`[data-act="fpAccept"][data-args*="${id}"]`).first().click();
      await until(() => ev(A, (k) => { const x = S.fed.deals.find((y) => y.key === k && y.deal === 'wave'); return x && x.st === 'run'; }, P.B), 30000, 'Alice\'s wave to run');
      const got = await ev(A, () => { compute(); const l = S.links.find((x) => x.fwv); return l && { g: LT[l.tier].g, load: R.load[l.id] || 0, cost: R.cost.fed || 0 }; });
      must(got && got.g === 400, `Alice has no 400G wave link: ${JSON.stringify(got)}`);
      must(got.load > 0, 'no traffic over Alice\'s wave');
      must(got.cost >= price, `Alice is billed ${got.cost}, not ${price}`);
      const bob = await ev(B, () => { compute(); const l = S.links.find((x) => x.id === 'E2EWV'); return { rev: R.rev.fed || 0, sold: mwG(l), deal: S.fed.deals.some((d) => d.deal === 'wave' && d.role === 'sell' && d.on) }; });
      must(bob.deal && bob.rev >= price && bob.sold === 400, `Bob's books: ${JSON.stringify(bob)}`);
      return `${a}–${b} 400G at ${price}/mo, ${Math.round(got.load * 1000)} Mbps over it, Bob earns ${bob.rev}`;
    });

    await step('a shun: Alice votes from the game with the operator key, four other servers vote, everyone excludes the target', async () => {
      const target = fakes[0];
      // Alice imports server 1's operator key through the sheet.
      await ev(A, () => ACT.fuOpen({ v: 'opkey' }));
      await A.page.fill('#fuOpIn', fs.readFileSync(path.join(srv[0].d, 'operator.key'), 'utf8').trim());
      await click(A, '[data-act="fuOpKeyGo"]');
      await until(() => ev(A, async () => !!(await fedOpKey())), 10000, 'operator key imported');
      const r = await ev(A, (a) => fedOpShun(a.srv, a.key, 'spam'), { srv: srv[0].id, key: target.k.pub });
      must(r && r.ok, `the game's shun was refused: ${JSON.stringify(r)}`);
      // The other four servers' operators vote too (signed here, put through the raw client).
      for (const s of srv.slice(1)) {
        const v = sign(s.op, 'shun', now(), { server: s.id, target: target.k.pub, reason: 'spam' });
        const a = await raw.put(v);
        must(a.m === 'ack', `vote of ${s.id.slice(0, 8)}: ${JSON.stringify(a)}`);
      }
      // A vote from a server nobody knows is refused.
      const stranger = keyOf(sha('fed-e2e stranger'));
      const bad = await raw.put(sign(stranger, 'shun', now(), { server: b64(sha('nowhere')), target: target.k.pub, reason: 'spam' }));
      must(bad.m === 'err' && bad.code === 'unknown_server', `a stranger's vote: ${JSON.stringify(bad)}`);
      await until(() => ctl('players').find((x) => x.key === target.k.pub).shunned, 10000, 'the relay to count the shun');
      for (const p of [A, B]) {
        try { await until(() => ev(p, async (k) => (await fedShunned()).includes(k), target.k.pub), 30000, `${p.name} to exclude the target`); }
        catch (e) { const d = await ev(p, async (k) => ({ excl: await fedExclInfo(k), votes: ((await fedGet('kv', 'votes')) || []).length }), target.k.pub); throw new Error(e.message + ' ' + JSON.stringify(d)); }
      }
      // Bob is no operator: no vote reached his game, only the outcome.
      const isVote = (it) => it && it.rec && (it.rec.kind === 'shun' || it.rec.kind === 'unshun');
      must(!B.frames.some((f) => (f.m === 'recs' || f.m === 'push') && (f.items || []).some(isVote)), 'a shun vote reached Bob\'s game');
      must(!B.sent.some((f) => f.m === 'sub' && f.kinds.some((k) => k === 'shun' || k === 'unshun')), 'Bob\'s game asked for votes');
      must(B.sent.some((f) => f.m === 'auth' && f.key === P.B) && !B.sent.some((f) => f.m === 'auth' && f.key !== P.B), 'Bob proved his own key only');
      must(B.frames.some((f) => f.m === 'excluded' && f.keys.includes(target.k.pub) && !f.reasons), 'Bob got no excluded list naming the target (or got reasons)');
      must(await ev(B, async () => (await fedGet('kv', 'votes')) === null), 'votes stored in Bob\'s browser');
      // Alice proved the operator key and follows the votes.
      const opAuth = A.sent.find((f) => f.m === 'auth' && f.key === srv[0].op.pub);
      must(opAuth && A.frames.some((f) => f.m === 'ack' && f.id === opAuth.id && f.op === true), 'the relay did not take Alice\'s operator key');
      const aVotes = A.frames.filter((f) => f.m === 'recs').flatMap((f) => f.items || []).filter(isVote).length;
      must(aVotes >= 5, `Alice's game got ${aVotes} votes`);
      const info = await ev(A, (k) => fedShunInfo(k), target.k.pub);
      must(info.shunned && info.votes === 5 && info.reasons.spam === 5, `Alice's tally ${JSON.stringify(info)}`);
      // The target's own session proves its key and learns the reasons given, without counts.
      const own = new Raw(raw.url);
      const w = await own.open(), t = now();
      const sig = b64(crypto.sign(null, Buffer.from(canon({ m: 'auth', key: target.k.pub, node: w.node, server: w.server, t }), 'utf8'), target.k.priv));
      const ack = (await own.ask({ m: 'auth', key: target.k.pub, t, sig }))[0];
      must(ack.m === 'ack' && ack.op === false, `the target's auth: ${JSON.stringify(ack)}`);
      const badAuth = (await own.ask({ m: 'auth', key: target.k.pub, t: t - 700, sig }))[0];
      must(badAuth.m === 'err' && badAuth.code === 'bad_sig', `an auth with the wrong t: ${JSON.stringify(badAuth)}`);
      await own.ask({ m: 'sub', kinds: ['announce', 'shun', 'unshun'], since: '' }).then((pages) => must(!pages.flatMap((p) => p.items).some(isVote), 'the target got votes'));
      const ex = await until(() => own.frames.find((f) => f.m === 'excluded'), 10000, 'the target\'s excluded frame');
      must(ex.keys.includes(target.k.pub) && JSON.stringify(ex.reasons) === '["spam"]', `the target's excluded frame: ${JSON.stringify({ ...ex, keys: ex.keys.length })}`);
      own.close();
      return `target ${target.k.pub.slice(0, 8)}… shunned at the relay and in both games; Bob saw 0 votes, Alice ${aVotes}, the target the reasons ${JSON.stringify(ex.reasons)}`;
    });

    await step('operator panel: the chain is read with a sub, ended by its unsub, the connection stays', async () => {
      const hellos = A.sent.filter((f) => f.m === 'hello').length;
      const ch = await ev(A, async (id) => { const c = await fedOpChain(id); return c && { ops: c.chain.ops.length, pending: c.pending.length }; }, srv[0].id);
      must(ch && ch.ops === 1, `chain: ${JSON.stringify(ch)}`);
      await sleep(1000);
      const sub = A.sent.filter((f) => f.m === 'sub').at(-1), un = A.sent.filter((f) => f.m === 'unsub').at(-1);
      must(un && un.id === sub.id, 'the unsub does not name its sub');
      must(A.frames.some((f) => f.m === 'ack' && f.id === un.id), 'the relay did not acknowledge the unsub');
      must(A.sent.filter((f) => f.m === 'hello').length === hellos && await ev(A, () => fedStatus().state === 'connected'), 'the connection dropped');
    });

    await step('stats reach the relay with a receipt slot', async () => {
      await until(async () => (await ev(A, () => S.fed.last > 0)) && (await ev(B, () => S.fed.last > 0)), 30000, 'both games to send stats');
      const st = ctl('status');
      must(st.kinds.stats >= FAKES + 2, `relay holds ${st.kinds.stats} stats`);
      return `${st.kinds.stats} stats held`;
    });

    if (!QUICK) await step('leaderboard: after the slot ends, the relay ranks; both games get the top rows and their own row, no records', async () => {
      const slotEnd = (Math.floor(now() / SLOT) + 1) * SLOT;
      console.log(`      waiting ${slotEnd - now() + 3} s for the 5-minute slot to end…`);
      await sleep((slotEnd - now() + 3) * 1000);
      const rows = ctl('board');
      const names = new Set(rows.map((r) => r.name || r.key));
      must(rows.some((r) => r.key === P.A) && rows.some((r) => r.key === P.B), 'relay board lacks a player');
      must(!rows.some((r) => r.key === fakes[0].k.pub), 'relay board still ranks the shunned network');
      for (const p of [A, B]) {
        const v = await ev(p, async () => { const v = await fedRankView({ board: 'pops', measure: 'total', division: 'all' }); return { keys: v.rows.map((r) => r.key), me: v.me, n: v.n, at: v.at }; });
        must(v.keys.length === Math.min(50, v.n) && v.n >= FAKES, `${p.name}: ${v.keys.length} rows of ${v.n}`);
        must(v.me && Number.isInteger(v.me.rank) && v.me.rank >= 1, `${p.name}: own row ${JSON.stringify(v.me)}`);
        must(!v.keys.includes(fakes[0].k.pub), `${p.name}'s board ranks the shunned network`);
        must(v.at === null, `${p.name}: not a fresh answer`);
        // Both players, side by side: a slice of just the two of them.
        const two = await ev(p, async (k) => { const c = FED.live.conns.get(S.fed.servers[0]);
          const a = await fedAskRetry(c, { m: 'rank', board: 'pops', measure: 'total', division: 'all', filters: { keys: k } }); return a && a.rows.map((r) => r.key); }, [P.A, P.B].sort());
        must(two && two.includes(P.A) && two.includes(P.B), `${p.name}: the two players' slice ${JSON.stringify(two)}`);
        must(!p.sent.some((f) => f.m === 'board') && !p.frames.some((f) => f.m === 'recs' && f.items && f.items.some((it) => it.rec && it.rec.kind === 'stats' && it.rec.key !== P.A && it.rec.key !== P.B && !p.sent.some((s) => s.m === 'rankwhy' && s.id === f.id))), `${p.name} downloaded board records`);
      }
      // And through the sheet.
      await ev(A, () => ACT.fuOpen({ v: 'boards' }));
      await until(async () => (await A.page.locator('#modalCard .fu-me').count()) > 0 && (await A.page.locator('#modalCard').innerText()).includes('Fake Net'), 20000, 'Alice\'s own row and the others on her board sheet');
      must(!(await A.page.locator('#modalCard').innerText()).includes('Fake Net 000'), 'the shunned network is on Alice\'s board sheet');
      return `relay board ${rows.length} rows (${names.size} names)`;
    });

    if (!QUICK) await step('an honest relay passes the games\' checks of its rankings (rankwhy)', async () => {
      const out = [];
      for (const p of [A, B]) {
        const r = await ev(p, async () => { const c = FED.live.conns.get(S.fed.servers[0]), res = [];
          for (const board of ['pops', 'traffic', 'total']) { const req = fedRankReq({ board }, []), a = fedRanksOk(await fedAskRetry(c, req)); res.push(a ? await fedRankCheck(c, req, a) : 'no answer'); }
          return { res, bad: Object.keys(await fedUntrusted()).length }; });
        must(r.res.every((x) => x === true) && r.bad === 0, `${p.name}: checks ${JSON.stringify(r)}`);
        must(p.sent.some((f) => f.m === 'rankwhy'), `${p.name} never asked rankwhy`);
        out.push(`${p.name} ${r.res.length} boards checked`);
      }
      return out.join(', ');
    });

    await step('a burst of rank requests from one game: rate_limited answers are waited out', async () => {
      const t0 = Date.now(), from = A.frames.length, sent = A.sent.length;
      const r = await ev(A, async () => { const c = FED.live.conns.get(S.fed.servers[0]);
        return Promise.all(Array.from({ length: 12 }, (_, i) => fedAskRetry(c, { m: 'rank', board: ['pops', 'traffic', 'total', 'pies'][i % 4], measure: 'total', division: 'all' }).then((a) => a && a.m))); });
      const lim = A.frames.slice(from).filter((f) => f.m === 'err' && f.code === 'rate_limited').length;
      const log = () => JSON.stringify({ s: (Date.now() - t0) / 1000, sent: A.sent.slice(sent).filter((f) => f.m === 'rank').map((f) => f.id),
        got: A.frames.slice(from).filter((f) => f.m === 'err' || f.m === 'ranks').map((f) => f.m === 'err' ? `${f.id}:${f.code}:${f.retry}` : `${f.id}:ranks`) });
      must(r.every((m) => m === 'ranks'), `rank requests gave ${JSON.stringify(r)} ${log()}`);
      must(lim > 0, 'the relay never rate-limited the burst (nothing was tested)');
      must(await ev(A, () => fedStatus().state === 'connected'), 'the burst dropped the connection');
      return `12 rankings, ${lim} rate_limited answers waited out`;
    });

    await step('metrics and logs: counts only, no addresses', async () => {
      const m = await (await fetch(`http://127.0.0.1:${mport}/metrics`)).text();
      for (const k of ['relay_connections_total', 'relay_records_out_total', 'relay_refused_total']) must(m.includes(k), `no ${k} in /metrics`);
      // Its own listening address is the only one it may print.
      const addr = relayLog.split('\n').filter((l) => !/msg="relay serving"/.test(l)).find((l) => /127\.0\.0\.1|::1|\[::/.test(l));
      must(!addr, `the relay log holds an address: ${addr}`);
      must(!/127\.0\.0\.1/.test(m), '/metrics holds an address');
      const lim = /relay_refused_total\{code="rate_limited"\} (\d+)/.exec(m);
      return `rate_limited refusals ${lim ? lim[1] : 0}`;
    });

    await step('Bob leaves for good; Alice forgets him', async () => {
      await ev(B, () => ACT.fuOpen({ v: 'quit' }));
      await click(B, '[data-act="fuQuit"]');
      await until(() => ev(B, () => !S.fed.on && !S.fed.key), 15000, 'Bob to leave');
      await until(() => ev(A, async (k) => !(await fedNetworks()).some((n) => n.key === k), P.B), 30000, 'Alice to drop Bob');
      must(ctl('status').kinds.leave >= 1, 'no leave at the relay');
    });

    // A real browser has Worker: every record, receipt and registry entry was checked there, none on the page.
    await step('records were checked in the federation worker, never on the page', async () => {
      const out = [];
      for (const p of [A, B]) {
        const st = await ev(p, () => ({ ...FW.stat, dead: FW.dead, w: !!FW.w }));
        must(st.w && !st.dead && st.n > 0 && st.items > 0 && st.local === 0, `${p.name}: ${JSON.stringify(st)}`);
        out.push(`${p.name} ${st.n} batches, ${st.items} items`);
      }
      return out.join(', ');
    });

    await step('no page errors in either game', async () => {
      const errs = [...A.errors, ...B.errors].filter((e) => !/favicon|ERR_|404/.test(e));
      must(!errs.length, errs.slice(0, 5).join(' | '));
    });
    raw.close();
  } catch (e) {
    failed++;
    console.log(`FAIL  (setup) ${e && e.stack ? e.stack : e}`);
  } finally {
    if (failed && relayLog) console.log('--- relay log (last 40 lines) ---\n' + relayLog.trim().split('\n').slice(-40).join('\n'));
    await cleanup();
  }
  console.log(`${results.filter((r) => r[1]).length}/${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}

main();
