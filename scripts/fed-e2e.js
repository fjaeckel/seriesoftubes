#!/usr/bin/env node
// Multiplayer end to end: the real Go relay (built from relay/ with `go build`) against the real game page in Chromium.
// Not part of npm test or CI; run it by hand after changing either side:
//
//   node scripts/fed-e2e.js            [--keep] (leave the temp folder) [--headed] [--fakes N] (default 260)
//                                      [--quick] (skip the wait for the slot to end, and the board checks after it)
//   node scripts/fed-e2e.js --play     [--fakes N] (default 12) [--port P] sets up the same relay without TLS (the
//                                      game dials *.localhost nodes over ws:// from a localhost page, §9.1) and prints
//                                      two addresses to open in any browser, one player each; runs until Ctrl-C
//
// Everything runs on loopback: the relay serves TLS itself with a certificate made for the run (Chromium is told to
// ignore that it is self-signed), the page is served by a small static server, and a registry (servers.json) lists the
// relay plus four servers that exist only to vote, so a shun can really reach its threshold. Two browser contexts are
// two players. A Node client puts a few hundred signed records of made-up networks, so the relay's paging (backlogs,
// boards, cursors) and its rate limit are exercised. The board only ranks finished 5-minute slots, so the run waits
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
const fakeAnn = (k, i, t) => sign(k, 'announce', t, { name: `Fake Net ${String(i).padStart(3, '0')}`, asn: asnOf(k.pub), home: 'DE', day: 10 + i, founded: Math.floor(t / DAY),
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
  // A request, waiting out rate_limited as the relay asks (the relay's token bucket: puts cost 1, sub 5, board 20).
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
        try { await until(() => ev(p, async (k) => (await fedShunned()).includes(k), target.k.pub), 30000, `${p.name} to count the shun`); }
        catch (e) { const d = await ev(p, async (k) => ({ info: await fedShunInfo(k), votes: ((await fedGet('kv', 'votes')) || []).length, voters: [...(await fedVoters()).keys()].length, reg: !!(await fedGet('kv', 'registry')) }), target.k.pub); throw new Error(e.message + ' ' + JSON.stringify(d)); }
      }
      return `target ${target.k.pub.slice(0, 8)}… shunned at the relay and in both games`;
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

    if (!QUICK) await step('leaderboard: after the slot ends, both games rank both players and the made-up networks', async () => {
      const slotEnd = (Math.floor(now() / SLOT) + 1) * SLOT;
      console.log(`      waiting ${slotEnd - now() + 3} s for the 5-minute slot to end…`);
      await sleep((slotEnd - now() + 3) * 1000);
      const rows = ctl('board');
      const names = new Set(rows.map((r) => r.name || r.key));
      must(rows.some((r) => r.key === P.A) && rows.some((r) => r.key === P.B), 'relay board lacks a player');
      must(!rows.some((r) => r.key === fakes[0].k.pub), 'relay board still ranks the shunned network');
      for (const p of [A, B]) {
        const n = await ev(p, async () => { const u = S.fed.servers[0]; return fedBoardFetch(u); });
        must(n >= FAKES, `${p.name}: board fetch gave ${n} records`);
        const v = await ev(p, async () => { const v = await fedBoardView({ board: 'pops', measure: 'total', division: 'all' }); return v.rows.map((r) => r.key); });
        must(v.includes(P.A) && v.includes(P.B), `${p.name}'s board lacks a player`);
        must(!v.includes(fakes[0].k.pub), `${p.name}'s board ranks the shunned network`);
        const frames = p.frames.filter((f) => f.m === 'recs' && f.id === p.sent.filter((s) => s.m === 'board').at(-1).id);
        must(FAKES < 130 || frames.length > 1, `${p.name}: board came in ${frames.length} frame(s)`);
      }
      // And through the sheet.
      await ev(A, () => ACT.fuOpen({ v: 'boards' }));
      await until(async () => (await A.page.locator('#modalCard .fu-me').count()) > 0 && (await A.page.locator('#modalCard').innerText()).includes('Fake Net'), 20000, 'Alice\'s own row and the others on her board sheet');
      must(!(await A.page.locator('#modalCard').innerText()).includes('Fake Net 000'), 'the shunned network is on Alice\'s board sheet');
      return `relay board ${rows.length} rows (${names.size} names)`;
    });

    await step('a burst of board requests from one game: rate_limited answers are waited out', async () => {
      const t0 = Date.now(), from = A.frames.length, sent = A.sent.length;
      const r = await ev(A, async () => { const u = S.fed.servers[0]; return Promise.all([1, 2, 3, 4, 5, 6].map(() => fedBoardFetch(u))); });
      const lim = A.frames.filter((f) => f.m === 'err' && f.code === 'rate_limited').length;
      const log = () => JSON.stringify({ s: (Date.now() - t0) / 1000, sent: A.sent.slice(sent).filter((f) => f.m === 'board').map((f) => f.id),
        got: A.frames.slice(from).filter((f) => f.m === 'err' || f.m === 'recs' && !f.more).map((f) => f.m === 'err' ? `${f.id}:${f.code}:${f.retry}` : `${f.id}:end`) });
      must(r.every((n) => Number.isInteger(n) && (QUICK || n > 0)), `board fetches gave ${JSON.stringify(r)} ${log()}`);
      must(lim > 0, 'the relay never rate-limited the burst (nothing was tested)');
      must(await ev(A, () => fedStatus().state === 'connected'), 'the burst dropped the connection');
      return `6 boards, ${lim} rate_limited answers waited out`;
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
