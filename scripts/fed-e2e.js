#!/usr/bin/env node
// Multiplayer end to end: the real Go relay (built from relay/ with `go build`) against the real game page in Chromium, Firefox or WebKit.
// Not part of npm test or CI; run it by hand after changing either side:
//
//   node scripts/fed-e2e.js            [--keep] (leave the temp folder) [--headed] [--fakes N] (default 260)
//                                      [--browser chromium|firefox|webkit] (default chromium; also for --lan; the
//                                      engines' differences are handled in launchEngine)
//                                      [--quick] (skip the wait for the slot to end, and the leaderboard checks after it;
//                                      the newcomer steps still wait once for a new slot: one stats per slot)
//   node scripts/fed-e2e.js --play     [--fakes N] (default 12) [--port P] sets up the same relay without TLS (the
//                                      game dials *.localhost nodes over ws:// from a localhost page, §9.1) and prints
//                                      two addresses to open in any browser, one player each; runs until Ctrl-C
//   node scripts/fed-e2e.js --lan      [--headed] a LAN party: `relay lan` on 127.0.0.1 with its own self-signed
//                                      certificate, no registry and no internet; one player opens the relay's page,
//                                      takes the invite link (an IP address) and joins (docs/HOSTING.md, LAN party)
//
// Everything runs on loopback: the relays serve TLS themselves with a certificate made for the run (the browser is told
// to ignore that it is self-signed, the relays trust it through RELAY_TEST_ROOTS), the page is served by a small static
// server, and a registry (servers.json) lists five servers, so a shun can really reach its threshold: server 1 serves,
// server 2 serves too with two nodes and syncs with server 1 (both open and listed: no neighbours configured), servers 3 to 5
// exist only to vote. Browser contexts are players: Alice and Bob on server 1, Dave on server 2. A Node client puts a few hundred signed records of made-up networks, so the relay's paging (backlogs,
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
const PLAY = arg('--play'), KEEP = arg('--keep'), HEADED = arg('--headed'), QUICK = arg('--quick'), LAN = arg('--lan');
const BROWSER = argv('--browser', 'chromium');
if (!['chromium', 'firefox', 'webkit'].includes(BROWSER)) { console.error(`--browser ${BROWSER}: chromium, firefox or webkit`); process.exit(2); }
const FAKES = Math.max(0, +argv('--fakes', PLAY ? 12 : 260) || 0);
const HOST = 'relay.localhost', SLOT = 300, DAY = 86400;
// The second serving server's two nodes (the two-server step).
const HOSTS2 = ['relay2.localhost', 'relay2b.localhost'];
// The relay runs as this release; the update feed of the run announces the next minor one.
const RELAY_VER = require('../package.json').version, NEXT_VER = RELAY_VER.replace(/^(\d+)\.(\d+)\..*$/, (_, a, b) => `${a}.${+b + 1}.0`);
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

/* ---------- the browser engines ----------
   The game page must be on a host that is not loopback (from a loopback page the game dials *.localhost nodes over
   plain ws://, §9.1, and these runs test TLS), and still a secure context (WebCrypto). All three engines resolve
   *.localhost to loopback themselves; the page's name, game.test, needs help, per engine:
   - Chromium: --host-resolver-rules maps it, --unsafely-treat-insecure-origin-as-secure makes http://game.test secure;
   - Firefox: the prefs network.dns.localDomains and dom.securecontext.allowlist do the same;
   - WebKit has neither: the page is https://game.test with the run's self-signed certificate (so a secure context),
     and the browser goes through a small proxy of the run that sends the run's names to 127.0.0.1.
   Certificates: the context's ignoreHTTPSErrors everywhere (Chromium's full run also passes --ignore-certificate-errors,
   as it always did). Firefox has no isMobile: its phone is a plain small viewport. */
const PAGE_TLS = BROWSER === 'webkit';
const pageURL = (wport) => `${PAGE_TLS ? 'https' : 'http'}://game.test:${wport}/`;
const pageServer = (handler, tls) => tls ? require('node:https').createServer({ key: fs.readFileSync(tls.key), cert: fs.readFileSync(tls.crt) }, handler) : http.createServer(handler);
// The run's names (hosts, and *.localhost) go to 127.0.0.1; anything else (the page's web fonts) where it really is.
async function loopProxy(hosts) {
  const to = (h) => (hosts.includes(h) || /\.localhost$/.test(h) || h === 'localhost' ? '127.0.0.1' : h);
  const s = http.createServer((req, res) => {
    const u = new URL(req.url);
    const up = http.request({ host: to(u.hostname), port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  s.on('connect', (req, sock, head) => {
    const i = req.url.lastIndexOf(':'), host = req.url.slice(0, i).replace(/^\[|\]$/g, '');
    const up = net.connect(+req.url.slice(i + 1), to(host), () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) up.write(head); up.pipe(sock); sock.pipe(up); });
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return s;
}
// hosts: names to send to 127.0.0.1 besides *.localhost; chromeArgs: more Chromium switches.
async function launchEngine(PAGE, hosts, chromeArgs = []) {
  const type = require('playwright-core')[BROWSER], o = { headless: !HEADED };
  let proxy = null;
  if (BROWSER === 'chromium') {
    // The full Chromium of the Playwright cache (its new headless mode), so no separate headless shell is needed.
    const exe = process.env.FED_E2E_CHROME || chromeIn(type.executablePath());
    if (fs.existsSync(exe)) o.executablePath = exe;
    o.args = [...chromeArgs, `--host-resolver-rules=${hosts.map((h) => `MAP ${h} 127.0.0.1`).join(', ')}`, `--unsafely-treat-insecure-origin-as-secure=${PAGE.slice(0, -1)}`];
  } else if (BROWSER === 'firefox') {
    o.firefoxUserPrefs = { 'network.dns.localDomains': hosts.join(','), 'dom.securecontext.allowlist': new URL(PAGE).hostname };
  } else {
    proxy = await loopProxy(hosts);
    o.proxy = { server: `http://127.0.0.1:${proxy.address().port}` };
  }
  return { browser: await type.launch(o), proxy };
}
const phone = (width, height) => ({ ignoreHTTPSErrors: true, viewport: { width, height }, ...(BROWSER === 'firefox' ? {} : { isMobile: true, hasTouch: true }) });

async function main() {
  // The relay's local control socket lives in its data folder, and Unix socket paths are short: keep the folder short.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir().length < 60 ? os.tmpdir() : '/tmp', 'fe2e-'));
  const procs = [];
  let browser = null, web = null, proxy = null;
  const cleanup = async () => {
    try { if (browser) await browser.close(); } catch (e) { /* gone */ }
    for (const p of procs) try { p.kill('SIGTERM'); } catch (e) { /* gone */ }
    if (web) web.close();
    if (proxy) proxy.close();
    // Relays may still be writing as they stop: retry the removal a few times.
    if (!KEEP) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); else console.log(`kept ${tmp}`);
  };
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
  const bin = path.join(tmp, 'relay');
  const relay = (dir, ...a) => execFileSync(bin, [a[0], '--data', dir, ...a.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ctl = (cmd, ...a) => JSON.parse(relay(path.join(tmp, 'd1'), cmd, ...a));
  const ctl2 = (cmd, ...a) => JSON.parse(relay(path.join(tmp, 'd2'), cmd, ...a));
  let relayLog = '';
  const logs2 = { d2: '', d2b: '' };
  const P = {};
  // The two-server step: server 2 serves too (two nodes), and the two servers sync. Not with --play (no TLS there).
  const TWO = !PLAY;
  const TLS = { tlsCert: path.join(tmp, 'tls.crt'), tlsKey: path.join(tmp, 'tls.key') }, REG = path.join(tmp, 'site', 'federation', 'servers.json');
  const conf = (d, o) => { const cf = path.join(d, 'config.json'), c = JSON.parse(fs.readFileSync(cf, 'utf8')); fs.writeFileSync(cf, JSON.stringify(Object.assign(c, o), null, 2)); };
  const portUp = (p) => until(() => new Promise((res) => { const s = net.connect(p, '127.0.0.1', () => { s.end(); res(true); }); s.on('error', () => res(false)); }), 15000, `port ${p}`);
  // Starts `relay serve` on a data folder; the other nodes of the run trust the run's certificate (RELAY_TEST_ROOTS).
  const serveRelay = async (d, p, sink) => {
    const r = spawn(bin, ['serve', '--data', d], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(PLAY ? {} : { RELAY_TEST_ROOTS: TLS.tlsCert }) } });
    procs.push(r);
    r.stdout.on('data', sink); r.stderr.on('data', sink);
    await portUp(p);
    await until(() => { try { return JSON.parse(relay(d, 'status')).serving; } catch (e) { return false; } }, 15000, `relay status serving (${path.basename(d)})`);
    return r;
  };
  const stopRelay = async (r) => { r.kill('SIGTERM'); await until(() => r.exitCode !== null || r.signalCode !== null, 15000, 'a relay to stop'); };
  try {
    const wport = PLAY && +argv('--port', 0) || await freePort(), [port, mport] = [await freePort(), await freePort()];
    const URL1 = `wss://${HOST}:${port}/fed`;
    const [port2, port2b] = [await freePort(), await freePort()], URL2 = `wss://${HOSTS2[0]}:${port2}/fed`, URL2B = `wss://${HOSTS2[1]}:${port2b}/fed`;
    let r2 = null, r2b = null;

    await step('build the relay (go build)', async () => {
      // Stamped like a release, so it compares itself with the update feed (a "dev" build never does).
      execFileSync('go', ['build', '-ldflags', `-X main.version=${RELAY_VER}`, '-o', bin, './cmd/relay'], { cwd: path.join(ROOT, 'relay'), stdio: ['ignore', 'pipe', 'pipe'] });
      return path.relative(ROOT, bin) === bin ? bin : 'ok';
    });

    /* Server 1 serves; servers 3 to 5 only exist in the registry, so their operators can vote. Server 2 ("E2E Pipes")
       votes too and, but with --play, serves as well: open like server 1, with two nodes (2 and 2b), all syncing. */
    const srv = [];
    await step(TWO ? 'found five servers (relay init, genesis; server 2 with a second node) and build servers.json' : 'found five servers (relay init, genesis) and build servers.json', async () => {
      if (!PLAY) execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', `/CN=${HOST}`,
        '-addext', `subjectAltName=${[HOST, ...HOSTS2, 'game.test'].map((h) => 'DNS:' + h).join(',')}`, '-keyout', TLS.tlsKey, '-out', TLS.tlsCert], { stdio: 'ignore' });
      for (let i = 1; i <= 5; i++) {
        const d = path.join(tmp, 'd' + i), url = i === 1 ? URL1 : i === 2 && TWO ? URL2 : `wss://vote${i}.localhost:9/fed`;
        relay(d, 'init', '--url', url);
        const out = relay(d, 'genesis', '--name', i === 1 ? 'E2E Tubes' : i === 2 ? 'E2E Pipes' : `E2E Voter ${i}`, '--sync', i === 1 && !TWO ? 'standalone' : 'open', '--langs', 'en');
        const id = /identity: (\S+)/.exec(out)[1];
        srv.push({ i, d, id, url, op: keyOf(Buffer.from(fs.readFileSync(path.join(d, 'operator.key'), 'utf8').trim(), 'base64url')) });
      }
      if (TWO) {
        // Server 2's second node: its operator adds it (one operator, so a majority at once) and describes the server
        // again so the server record lists both nodes; that record goes into the registry, where games learn nodes.
        const d2b = path.join(tmp, 'd2b'), nk = /Node key:\s+(\S+)/.exec(relay(d2b, 'init', '--url', URL2B))[1];
        srv[1].d2b = d2b; srv[1].nk2b = nk;
        conf(srv[1].d, { listen: `127.0.0.1:${port2}`, ...TLS, registry: REG });
        const tmpR = await serveRelay(srv[1].d, port2, () => {});
        const ops = (...a) => execFileSync(bin, ['ops', a[0], '--data', srv[1].d, ...a.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        ops('propose', 'add-node', nk, '--url', URL2B);
        ops('server');
        const st = JSON.parse(relay(srv[1].d, 'status'));
        await stopRelay(tmpR);
        must(st.nodes === 2, `server 2 has ${st.nodes} nodes`);
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
      // The update feed beside it, as the site build writes it, announcing a newer relay that fixes a security issue.
      fs.writeFileSync(path.join(tmp, 'site', 'federation', 'relay.json'), JSON.stringify({ v: 1, version: NEXT_VER, released: new Date().toISOString().slice(0, 10),
        security: true, notes: `https://github.com/fjaeckel/seriesoftubes/releases/tag/v${NEXT_VER}` }) + '\n');
      return `server ${srv[0].id.slice(0, 8)}…`;
    });

    await step(PLAY ? 'relay serves plain ws on loopback' : 'relay serves TLS on loopback', async () => {
      conf(srv[0].d, { listen: `127.0.0.1:${port}`, metrics: `127.0.0.1:${mport}`, registry: REG, ...(PLAY ? {} : TLS) });
      await serveRelay(srv[0].d, port, (b) => { relayLog += b; });
      const st = ctl('status');
      must(st.registry === 5, `relay knows ${st.registry} registry servers, not 5`);
      return `${URL1}, registry ${st.registry}`;
    });

    // Server 2: its first node, then its second node joins. No neighbours anywhere: servers 1 and 2 are open and in the
    // run's registry, so they find each other there (10.9).
    if (TWO) await step('server 2 serves too: two nodes, no neighbours configured', async () => {
      r2 = await serveRelay(srv[1].d, port2, (b) => { logs2.d2 += b; });
      // No --from: the second node finds server 2's nodes in this run's servers.json, as a listed server's would.
      execFileSync(bin, ['join', '--data', srv[1].d2b, srv[1].id, '--registry', REG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, RELAY_TEST_ROOTS: TLS.tlsCert } });
      const seeds = JSON.parse(fs.readFileSync(path.join(srv[1].d2b, 'config.json'), 'utf8')).seeds;
      must(seeds && seeds[0] === URL2 && !seeds.includes(URL2B), `join found ${JSON.stringify(seeds)} in the registry, not ${URL2}`);
      conf(srv[1].d2b, { listen: `127.0.0.1:${port2b}`, ...TLS, registry: REG });
      r2b = await serveRelay(srv[1].d2b, port2b, (b) => { logs2.d2b += b; });
      const st = await until(() => { const x = ctl2('status'); return x.peers.some((p) => p.same && p.node === srv[1].nk2b && p.synced) && x; }, 60000, 'server 2\'s nodes to sync with each other');
      return `${URL2} and ${URL2B}, ${st.peers.length} peer session(s) at node 2`;
    });

    // The page: assembled from src/ as players get it, static files from site/, servers.json from this run.
    await step('serve the game page', async () => {
      const { html } = assemble({ dev: false });
      const SITE = path.join(ROOT, 'site'), own = path.join(tmp, 'site');
      const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
      web = pageServer((req, res) => {
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
      }, PAGE_TLS && !PLAY ? { key: path.join(tmp, 'tls.key'), crt: path.join(tmp, 'tls.crt') } : null);
      await new Promise((r) => web.listen(wport, '127.0.0.1', r));
      return PLAY ? `http://127.0.0.1:${wport}/` : pageURL(wport);
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
Name your network: "Play with others" is on with the invited server picked. Start building and sign the charter:
the game joins (or switch it off, start, and join from menu > Multiplayer). Then menu > Multiplayer: the looking
glass finds the other player, its Deals button asks for peering. Ctrl-C stops (the relay is thrown away; the games
stay in the browser).`);
      await new Promise(() => {}); // until Ctrl-C (SIGINT cleans up)
    }

    // The browsers: the page is game.test, not a loopback name, and a secure context (see launchEngine).
    const PAGE = pageURL(wport);
    ({ browser, proxy } = await launchEngine(PAGE, [HOST, ...HOSTS2, 'game.test'], ['--ignore-certificate-errors']));

    const players = {};
    // title: start from the title screen's "Play with others" switch instead of joining from the menu afterwards.
    // srvName: the server card to pick on the title screen.
    async function player(name, title, srvName = 'E2E Tubes') {
      const ctx = await browser.newContext(phone(390, 844));
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
      if (title) {
        await page.locator('#fsTog').click();
        await page.locator('#fsList .fs-srv', { hasText: srvName }).first().click();
        await page.evaluate((nm) => { const i = document.getElementById('nmIn'); if (i) i.value = nm; UI.pitched = true; }, name);
        await page.locator('#modalCard .tcta [data-act="start"]').click();
        await page.waitForFunction(() => typeof S !== 'undefined' && S && UI.started);
        await page.locator('#modalCard [data-act="charter"]').first().click();
      } else {
        await page.evaluate((nm) => { const i = document.getElementById('nmIn'); if (i) i.value = nm; UI.pitched = true; ACT.start({}); }, name);
        await page.waitForFunction(() => typeof S !== 'undefined' && S && UI.started);
      }
      await page.evaluate(() => { try { closeModal(); } catch (e) { /* none */ } });
      players[name] = p;
      return p;
    }
    const ev = (p, f, a) => p.page.evaluate(f, a);
    const click = async (p, sel) => { await p.page.locator(sel).first().click(); };

    // Alice joins from the join sheet, Bob from the title screen's switch: both ways stay covered.
    for (const nm of ['Alice Net', 'Bob Net']) {
      const title = nm === 'Bob Net';
      await step(`${nm}: joins the server ${title ? 'by starting with "Play with others" on' : 'through the join sheet'}`, async () => {
        const p = await player(nm, title);
        if (title) {
          await until(() => ev(p, () => fedStatus().state === 'connected'), 20000, 'connected after the charter');
          must(await ev(p, () => !UI.fu && !document.querySelector('#modalCard .fedui')), 'the join sheet opened');
          must(await ev(p, () => /Joined E2E Tubes/.test(document.getElementById('toasts').textContent + JSON.stringify(S.log || []))), 'no "Joined" notice');
        } else {
          await ev(p, () => ACT.fuOpen({ v: 'join' }));
          await p.page.waitForSelector('.fedui [data-act="fuJoin"]', { timeout: 15000 });
          const card = await p.page.locator('.fu-srv', { hasText: 'E2E Tubes' }).first();
          await card.locator('[data-act="fuJoin"]').click();
          await until(() => ev(p, () => fedStatus().state === 'connected'), 20000, 'connected');
        }
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
        const cur = await ev(me, async () => fedGet('kv', 'cursor:' + S.fed.servers[0] + '#' + S.fed.key.pub));
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
      await sleep(1100); // two announces of one network in the same second tie on t (§10.11): publish in a new second
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
      await sleep(1100); // two announces of one network in the same second tie on t (§10.11): publish in a new second
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

    // Newcomers (§10.10) and the customer cone (§10.4). Bob has played long enough (driven: his join day moved 100 days
    // back); Alice joined today, so she buys from him at the newcomer price, and both games must agree on it.
    // The relay takes one stats record per network and slot from a game (§5.2), so everything the stats must show is
    // set up first, then the run waits once for the next slot and has both games send one (statsNow).
    const statsNow = (p) => ev(p, async () => { const M = FED.live; S.fed.last = 0; M.body = ''; FED.clear(M.statsT); await fedStatsTick(M); fedFlushSoon(); });
    // The stats bodies of k the relay took (an ack for the put; a refused one is put again later).
    const sentStats = (p, k) => p.sent.filter((f) => f.m === 'put' && f.rec && f.rec.kind === 'stats' && f.rec.key === k && p.frames.some((a) => a.m === 'ack' && a.id === f.id)).map((f) => f.rec.body);
    await step('newcomer Alice buys transit from established Bob at the newcomer price; both games agree on it', async () => {
      await ev(B, () => { S.fed.joined -= 100; });
      await sleep(1100); // two announces of one network in the same second tie on t (§10.11): publish in a new second
      await ev(B, () => ACT.fpTermsSet({ terms: JSON.stringify({ pol: 'open', auto: { peering: 'review', pni: 'review', wave: 'review', transit: 'auto' },
        rates: { pni: { setup: 1000, ports: [{ mbps: 10000, monthly: 500 }], term: 30 }, transit: { perGbps: 400, commit: [{ mbps: 10000, off: 100 }], term: 30 } } }) }));
      const today = Math.floor(now() / DAY);
      await until(() => ev(A, async (k) => { await fedPlayRefresh(); const a = FEDN.ann.get(k); return !!a && !!a.rec.body.rates.transit && a.rec.body.founded <= Math.floor(fedNow() / 86400) - 30; }, P.B), 30000, 'Alice to see Bob\'s transit card and his join day');
      must(await ev(A, () => fedIsNew(S.fed.joined, fedNow())), 'Alice is not a newcomer');
      const card = await ev(B, () => S.fedp.rates.transit.perGbps), want = Math.floor(Math.floor(card * 900 / 1000) * 750 / 1000);
      const r = await ev(A, (k) => ACT.fpReq({ key: k, deal: 'transit', mbps: 10000 }), P.B);
      must(r === null || r === undefined, `request refused: ${JSON.stringify(r)}`);
      const a = await until(() => ev(A, (k) => S.fed.deals.find((d) => d.key === k && d.deal === 'transit' && d.st === 'run'), P.B), 15000, 'Alice\'s transit to run');
      must(a.terms.perGbps === want && a.terms.founded === today, `Alice's terms ${JSON.stringify(a.terms)}, want ${want} and founded ${today}`);
      const b = await until(() => ev(B, (k) => S.fed.deals.find((d) => d.key === k && d.deal === 'transit' && d.st === 'run'), P.A), 30000, 'Bob\'s side of the deal');
      must(b.role === 'sell' && b.id === a.id && canon(b.terms) === canon(a.terms), `Bob's deal ${JSON.stringify(b)}`);
      return `card ${card} per Gbps (the computer-run ceiling of a young game), ${want} for a newcomer (commit tier, then 25% off), the same in both games`;
    });

    // A made-up network that joined 40 days ago and buys transit from Bob: the one his cone may count (Alice is new).
    const carol = keyOf(sha('fed-e2e carol'));
    await step('an established made-up network buys transit from Bob, with traffic both ways', async () => {
      const t = now(), ca = sign(carol, 'announce', t, { ...fakeAnn(carol, 999, t).body, name: 'Old Timer Net', founded: Math.floor(t / DAY) - 40 });
      const cs = sign(carol, 'stats', t, { mode: 'normal', pops: { fra: 1 }, traffic: [{ key: P.B, in: 5000, out: 5000 }], up: [P.B], tier1: false, shareCountry: false });
      for (const r of [ca, cs]) { const x = await raw.put(r); must(x.m === 'ack', `put ${r.kind}: ${JSON.stringify(x).slice(0, 160)}`); }
      // Bob's side of that deal is driven: its offer would come from a game, which the made-up network has not.
      await until(() => ev(B, async (k) => { await fedPlayRefresh(); return FEDN.ann.has(k); }, carol.pub), 30000, 'Bob to know the made-up network');
      await ev(B, (k) => { const id = 'E2E' + 'c'.repeat(40), t = fedNow();
        S.fed.deals.push({ id, deal: 'transit', key: k, name: 'Old Timer Net', asn: 1, start: t - 60, end: t + 30 * 86400, terms: { mbps: 1000, perGbps: 400, term: 30, at: ['fra'] }, role: 'sell', st: 'run', on: false, rep: 0, why: '', ai: false }); }, carol.pub);
      const tr = await until(async () => { await sleep(1000); return ev(B, async (k) => { await fedNetsFetch(fedPlayKeys(S)); await fedPlayRefresh(); compute(); const d = S.fed.deals.find((x) => x.key === k);
        const e = d && d.on && d.rep > 0 && fedStatsBody().traffic.find((x) => x.key === k); return e && e.in > 0 && e.out > 0 && e; }, carol.pub); }, 30000, 'Bob\'s deal to run, with traffic both ways in his next stats');
      return `Bob reports ${tr.in}/${tr.out} Mbps with it`;
    });

    await step('mentor dividend, set up: Bob\'s first look at newcomer Alice; she grows to 10 POPs', async () => {
      // Bob's first look at his newcomer: what she has now never pays.
      await until(async () => { await sleep(1000); return ev(B, async (k) => { await fedNetsFetch(fedPlayKeys(S)); await fedPlayRefresh(); return S.fedp.ment.some((x) => x.k === k && x.m === 'seen'); }, P.A); }, 30000, 'Bob\'s first look at Alice');
      must(!(await ev(B, (k) => S.fedp.ment.some((x) => x.k === k && x.v > 0), P.A)), 'paid at the first look');
      // Heard on 3 UTC days needs 3 days; driven: Bob's game saw her on the two days before.
      await ev(B, (k) => { const d = Math.floor(fedNow() / 86400), h = S.fedp.heard.find((x) => x.k === k); if (h) h.d = [...new Set([d - 2, d - 1, ...h.d])].sort((a, b) => a - b).slice(0, 3); else S.fedp.heard.push({ k, d: [d - 2, d - 1] }); }, P.A);
      // Alice grows to 10 POPs in service (driven: cash and builds).
      const pops = await ev(A, () => { S.cash = 1e9; for (const c of ['fra', 'ams', 'lon', 'par', 'mad', 'mil', 'vie', 'waw', 'sto', 'cph', 'bru', 'zrh']) if (!S.pops[c] && CITY[c] && Object.keys(S.pops).length < 12) ACT.buildPop({ city: c }); after(); return Object.keys(fedStatsBody().pops).length; });
      must(pops >= 10, `Alice has ${pops} POPs in service`);
      return `Alice's next stats: ${pops} POPs`;
    });

    await step('their stats confirm each other (Bob: cust Alice and the made-up network; Alice: up Bob); Bob\'s mentor bonus', async () => {
      const slotEnd = (Math.floor(now() / SLOT) + 1) * SLOT;
      console.log(`      waiting ${slotEnd - now() + 2} s for the next slot (one stats record per network and slot)…`);
      await sleep((slotEnd - now() + 2) * 1000);
      await statsNow(A); await statsNow(B);
      const sa = await until(() => sentStats(A, P.A).find((b) => (b.up || []).includes(P.B) && Object.keys(b.pops).length >= 10), 60000, 'Alice\'s stats with up and 10 POPs');
      const sb = await until(() => sentStats(B, P.B).find((b) => (b.cust || []).includes(P.A) && (b.cust || []).includes(carol.pub) && b.traffic.some((x) => x.key === carol.pub && x.in > 0 && x.out > 0)), 60000, 'Bob\'s stats with both customers');
      must(!(sa.cust || []).includes(P.B) && !(sb.up || []).includes(P.A) && typeof sb.tier2 === 'boolean', 'a side listed the wrong way round, or no tier2');
      let paid;
      try { paid = await until(async () => { await sleep(1000); return ev(B, async (k) => { await fedNetsFetch(fedPlayKeys(S)); await fedPlayRefresh(); return S.fedp.ment.find((x) => x.k === k && x.m === 'pops' && x.v > 0); }, P.A); }, 30000, 'Bob\'s bonus'); }
      catch (e) { throw new Error(e.message + ' ' + JSON.stringify(await ev(B, async (k) => { const st = await fedNetsStats(), f = (x) => { const a = FEDN.ann.get(x); return a && a.rec ? a.rec.body.founded : null; };
        return { st: st.get(k), heard: S.fedp.heard, ment: S.fedp.ment.filter((x) => x.k === k), mentees: [...fedMentees(S, fedNow(), f).keys()].length }; }, P.A))); }
      await ev(B, async () => { await fedNetsFetch(fedPlayKeys(S)); await fedPlayRefresh(); });
      const n = await ev(B, (k) => S.fedp.ment.filter((x) => x.k === k && x.m === 'pops').length, P.A);
      must(n === 1, `${n} entries for one milestone`);
      await ev(B, () => { closeModal(); ACT.dash(); });
      must(/Mentor bonus/.test(await ev(B, () => fedPlayCard())), 'no mentor line in the players card');
      return `Alice up ${sa.up.length}, Bob cust ${sb.cust.length}; bonus ${paid.v}`;
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
      // The votes came in the frames above; the game checks and stores them one batch after another.
      const info = await until(() => ev(A, async (k) => { const i = await fedShunInfo(k); return i.votes === 5 && i; }, target.k.pub), 15000, 'Alice\'s tally to count five votes')
        .catch(async (e) => { throw new Error(e.message + ' ' + JSON.stringify(await ev(A, async (k) => ({ info: await fedShunInfo(k), stored: ((await fedGet('kv', 'votes')) || []).map((v) => v.rec.body.server.slice(0, 6)), vgen: FED.vgen }), target.k.pub))); });
      must(info.shunned && info.reasons.spam === 5, `Alice's tally ${JSON.stringify(info)}`);
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

    /* ---------- two servers (§9.4, §10.9): server 2 ("E2E Pipes", nodes 2 and 2b) syncs with server 1 ---------- */
    let D = null;
    const authedAt = async (url, k) => { const c = new Raw(url), w = await c.open(), t = now();
      const sig = b64(crypto.sign(null, Buffer.from(canon({ m: 'auth', key: k.pub, node: w.node, server: w.server, t }), 'utf8'), k.priv));
      const a = (await c.ask({ m: 'auth', key: k.pub, t, sig }))[0]; must(a.m === 'ack', `auth: ${JSON.stringify(a)}`); return c; };
    // Everything a session gets from a sub of these kinds, from the start.
    const subAll = async (c, kinds) => (await c.ask({ m: 'sub', kinds, since: '' })).flatMap((p) => p.items || []);
    if (TWO) await step('two servers find each other in the registry: one session between them, dialled by the lower identity; relay status shows it with the relay version', async () => {
      const peerOf = (st, id) => st.peers.find((p) => p.server === id && !p.same && p.synced);
      const ctl2b = () => JSON.parse(relay(srv[1].d2b, 'status'));
      // One session per pair of servers (10.9): across server 2's two nodes, exactly one with server 1.
      const pairs = () => { const a = ctl('status'), b = ctl2('status'), c = ctl2b(), with1 = [...b.peers, ...c.peers].filter((p) => p.server === srv[0].id);
        return { a, b, c, n1: a.peers.filter((p) => p.server === srv[1].id), n2: with1 }; };
      const one = (x) => x.n1.length === 1 && x.n2.length === 1 && x.n1[0].synced && x.n2[0].synced && x.n1[0].dialled === (srv[0].id < srv[1].id) && x.n2[0].dialled === (srv[1].id < srv[0].id);
      await until(() => one(pairs()), 60000, 'one session between the two servers');
      await sleep(3000);
      const x = pairs();
      must(one(x), `not one session per pair: server 1 has ${JSON.stringify(x.n1)}, server 2 ${JSON.stringify(x.n2)}`);
      const auto1 = x.a.auto.find((p) => p.server === srv[1].id);
      must(auto1 && auto1.up && auto1.dials === (srv[0].id < srv[1].id ? 'this node' : 'peer') && x.n1[0].auto, `server 1's automatic peers: ${JSON.stringify(x.a.auto)}`);
      const s1 = x.a, s2 = x.b, p1 = x.n1, p2 = x.n2[0];
      must(p1.every((p) => p.relay === RELAY_VER) && p2.relay === RELAY_VER, `peer versions: server 1 sees ${JSON.stringify(p1)}, server 2 sees ${JSON.stringify(p2)}`);
      must(s2.peers.some((p) => p.same && p.node === srv[1].nk2b && p.relay === RELAY_VER), `server 2's node 2b missing from its peers: ${JSON.stringify(s2.peers)}`);
      must(s1.sync === 'open' && s2.sync === 'open', `sync ${s1.sync}, ${s2.sync}`);
      return `one session (dialled by server ${srv[0].id < srv[1].id ? 1 : 2}, relay ${p1[0].relay}); server 1 dials ${x.a.auto.filter((p) => p.dials === 'this node').length} of its ${x.a.auto.length} automatic peers`;
    });

    let raw2 = null;
    if (TWO) await step('records put on server 1 reach server 2: Alice\'s announce and stats, with server 1\'s receipts', async () => {
      raw2 = new Raw(`wss://127.0.0.1:${port2}/fed`);
      must((await raw2.open()).server === srv[1].id, 'server 2\'s welcome names another server');
      const node1 = ctl('status').node;
      let got = null;
      for (let i = 0; i < 30 && !got; i++) {
        const it = await subAll(raw2, ['announce', 'stats']), a = it.find((x) => x.rec.kind === 'announce' && x.rec.key === P.A), s = it.find((x) => x.rec.kind === 'stats' && x.rec.key === P.A);
        if (a && s) got = { a, s, n: it.length }; else await sleep(2000);
      }
      must(got, 'Alice\'s announce and stats never reached server 2');
      for (const x of [got.a, got.s]) must((x.rcpt || []).some((r) => r.key === node1 && r.body.server === srv[0].id), `${x.rec.kind} without server 1's receipt: ${JSON.stringify(x.rcpt)}`);
      const pl = await until(() => ctl2('players').find((x) => x.key === P.A), 30000, 'Alice in server 2\'s players');
      must(pl.name === 'Alice Net', `server 2 lists ${JSON.stringify(pl)}`);
      return `server 2's backlog: ${got.n} announces and stats, Alice's with server 1's receipt`;
    });

    if (TWO) await step('Dave joins server 2 only (from the title screen) and sees Alice; his looking glass shows server 1, its relay and the sync', async () => {
      D = await player('Dave Net', true, 'E2E Pipes');
      await until(() => ev(D, () => fedStatus().state === 'connected'), 30000, 'Dave connected');
      // The card joins one of the server's nodes (whichever the game picks); the other is for failing over.
      const joined = await ev(D, () => S.fed.servers);
      must(joined.length === 1 && [URL2, URL2B].includes(joined[0]), `Dave joined ${JSON.stringify(joined)}`);
      must(D.sent.some((f) => f.m === 'challenge') && D.frames.some((f) => f.m === 'welcome' && f.server === srv[1].id), 'Dave did not check server 2\'s node');
      await until(() => ev(D, async (k) => (await fedNetworks()).some((n) => n.key === k), P.A), 30000, 'Dave to see Alice');
      P.D = await ev(D, () => S.fed.key.pub);
      await until(() => ctl('players').find((x) => x.key === P.D), 30000, 'Dave\'s announce at server 1');
      // Server 1's catalog entry came to Dave through server 2 (gossip): seen, its relay's version, the sync.
      await ev(D, (id) => ACT.fuOpen({ v: 'server', id, back: 'glass' }), srv[0].id);
      const txt = await until(async () => { const t = await D.page.locator('#modalCard').innerText(); return /E2E Pipes/.test(t) && t.includes(`relay ${RELAY_VER}`) && t; }, 30000, 'server 1\'s page in Dave\'s looking glass (relay version, syncs with E2E Pipes)')
        .catch(async (e) => { throw new Error(`${e.message}: ${(await D.page.locator('#modalCard').innerText()).replace(/\s+/g, ' ').slice(0, 600)}`); });
      must(txt.includes(`${HOST}:${port}`), 'no node address on server 1\'s page');
      await ev(D, () => ACT.fuOpen({ v: 'glass' }));
      await until(async () => { const g = await D.page.locator('#modalCard').innerText(); return g.includes('E2E Tubes') && g.includes('Alice Net'); }, 15000, 'server 1 and Alice in Dave\'s looking glass');
      await ev(D, () => ACT.fuClose());
      const ent = await ev(D, async (id) => (await fedServers()).find((s) => s.id === id), srv[0].id);
      return `server 1 seen ${ent && ent.seen ? now() - ent.seen + ' s ago' : '?'} via gossip; Dave ${P.D.slice(0, 8)}…`;
    });

    if (TWO) await step('boards of now: Alice builds a POP; within 15 s her, Bob\'s (server 1) and Dave\'s (server 2, by propagation) boards of now show it, server 2\'s 24-hour board within 45 s', async () => {
      const value = (p) => ev(p, async (k) => { const v = await fedRankView({ board: 'pops', measure: 'now', division: 'all' });
        const r = v.rows.find((x) => x.key === k); return r ? r.value : k === S.fed.key.pub && v.me ? v.me.value : null; }, P.A);
      // Alice is live everywhere first (her states every 10 s), then she builds.
      const before = await until(async () => { const a = await value(A), d = await value(D); return a !== null && a === d && a; }, 30000, 'Alice on the boards of now of both servers');
      const t0 = Date.now();
      const want = await ev(A, () => { S.cash = 1e9; const c = ['mil', 'vie', 'waw', 'sto', 'cph', 'bru', 'zrh', 'dub', 'lis', 'ath'].find((x) => CITY[x] && !S.pops[x]); ACT.buildPop({ city: c }); after(); return Object.keys(fedStatsBody().pops).length; });
      must(want > before, `Alice's POPs did not grow (${before} -> ${want})`);
      const seen = {};
      await until(async () => { for (const [nm, p] of [['Alice', A], ['Bob', B], ['Dave', D]]) if (!seen[nm] && await value(p) === want) seen[nm] = Date.now() - t0; return Object.keys(seen).length === 3; }, 15000, `${want} POPs on every board of now`);
      const st = A.sent.filter((f) => f.m === 'state');
      must(st.length >= 2 && st.every((f) => f.rec && f.rec.kind === 'state' && f.rec.key === P.A), `Alice sent ${st.length} state frame(s)`);
      const gaps = st.slice(1).map((f, i) => f.rec.t - st[i].rec.t);
      must(gaps.every((g) => g >= 5), `states closer than 5 s: ${JSON.stringify(gaps)}`);
      // The 24-hour board reads the running slot from the live states too (§10.13): server 2 shows it within 45 s.
      const day = (p) => ev(p, async (k) => { const v = await fedRankView({ board: 'pops', measure: 'total', division: 'all' });
        const r = v.rows.find((x) => x.key === k); return r ? r.value : null; }, P.A);
      await until(async () => { if (!seen.day && await day(D) === want) seen.day = Date.now() - t0; return !!seen.day; }, 45000, `${want} POPs on server 2's 24-hour board`);
      const cost = await ev(A, () => FED.stCost);
      return `${before} -> ${want} POPs: Alice ${seen.Alice} ms, Bob ${seen.Bob} ms, Dave (server 2) ${seen.Dave} ms, on server 2's 24-hour board ${seen.day} ms; ${st.length} states sent, ${(cost.ms / Math.max(1, cost.n)).toFixed(2)} ms each on the page`;
    });

    if (TWO) await step('a sealed deal across servers: Dave (server 2) asks Alice (server 1) for peering, she accepts in her queue; third parties on either server get none of it', async () => {
      // Alice reviews peering now, so the deal needs her accept (an automatic one binds without, §10.10).
      await sleep(1100); // two announces of one network in the same second tie on t (§10.11): publish in a new second
      await ev(A, () => ACT.fpTermsSet({ terms: JSON.stringify({ pol: 'open', auto: { peering: 'review' }, rates: {} }) }));
      await until(() => ev(D, async (k) => { await fedPlayRefresh(); const a = FEDN.ann.get(k); return !!a && a.rec.body.auto.peering === 'review'; }, P.A), 30000, 'Dave to see Alice\'s new terms (through server 2)');
      await ev(D, (k) => ACT.fuOpen({ v: 'net', key: k, back: 'glass' }), P.A);
      await until(async () => (await D.page.locator('#modalCard [data-act="fpNet"]').count()) > 0, 15000, 'the Deals button in Dave\'s looking glass');
      await click(D, '#modalCard [data-act="fpNet"]');
      await ev(D, () => { closeModal(); S.cash = 1e8; if (!S.pops.fra) ACT.buildPop({ city: 'fra' }); after(); });
      const r = await ev(D, (k) => ACT.fpReq({ key: k, deal: 'peering', via: 'pni', at: 'fra' }), P.A);
      must(r === null || r === undefined, `request refused: ${JSON.stringify(r)}`);
      const id = await until(() => ev(D, (k) => { const d = S.fed.deals.find((x) => x.key === k && x.deal === 'peering'); return d && d.id; }, P.A), 10000, 'Dave\'s deal');
      must((await ev(D, (x) => S.fed.deals.find((y) => y.id === x).st, id)) === 'wait', 'Dave\'s deal is not waiting for Alice');
      await until(() => ev(A, (x) => S.fedp.rq.some((y) => y.id === x), id), 30000, 'Dave\'s request in Alice\'s queue');
      await ev(A, () => { closeModal(); ACT.fpQueue(); });
      await A.page.locator(`[data-act="fpAccept"][data-args*="${id}"]`).first().click();
      await until(() => ev(D, (x) => { const d = S.fed.deals.find((y) => y.id === x); return d && d.st === 'run'; }, id), 45000, 'Dave\'s deal to run').catch(async (e) => {
        const seed = await ev(D, () => S.fed.key.priv), dk = keyOf(Buffer.from(seed, 'base64url')), per = {};
        for (const [n, u] of [['node 1', raw.url], ['node 2', `wss://127.0.0.1:${port2}/fed`], ['node 2b', `wss://127.0.0.1:${port2b}/fed`]]) {
          const c = await authedAt(u, dk); per[n] = (await subAll(c, ['offer', 'accept', 'decline'])).filter((x) => x.rec.key === P.D || x.rec.body.to === P.D).map((x) => x.rec.kind).join(','); c.close();
        }
        const st = (p) => ev(p, (x) => { const d = S.fed.deals.find((y) => y.id === x); return { deal: d && { st: d.st, why: d.why, role: d.role }, rq: S.fedp.rq.filter((q) => q.id === x).length, conn: [...FED.live.conns.values()].map((c) => [c.node, c.phase]) }; }, id);
        throw new Error(`${e.message}: Dave ${JSON.stringify(await st(D))}, Alice ${JSON.stringify(await st(A))}, deal records per node ${JSON.stringify(per)}, Alice sent ${A.sent.filter((f) => f.m === 'put' && f.rec && f.rec.kind === 'accept').length} accept(s)`);
      });
      await ev(A, () => closeModal());
      const ad = await until(() => ev(A, (x) => S.fed.deals.find((y) => y.id === x && y.st === 'run'), id), 30000, 'Alice\'s side of the deal');
      must(ad.key === P.D, `Alice's deal ${JSON.stringify(ad)}`);
      // Dave's own session gets the offer and Alice's accept, sealed; nobody else gets them.
      const isDD = (it) => !!it && !!it.rec && ['offer', 'accept', 'decline'].includes(it.rec.kind) && (it.rec.key === P.D || (!!it.rec.body && it.rec.body.to === P.D));
      const seed = await ev(D, () => S.fed.key.priv), dk = keyOf(Buffer.from(seed, 'base64url'));
      const mine = await authedAt(raw2.url, dk), own = (await subAll(mine, ['offer', 'accept'])).filter(isDD);
      mine.close();
      if (!(own.some((x) => x.rec.kind === 'offer' && x.rec.key === P.D) && own.some((x) => x.rec.kind === 'accept' && x.rec.key === P.A))) {
        const per = {};
        for (const [n, u] of [['node 1', raw.url], ['node 2', raw2.url], ['node 2b', `wss://127.0.0.1:${port2b}/fed`]]) {
          const c = await authedAt(u, dk); per[n] = (await subAll(c, ['offer', 'accept'])).filter(isDD).map((x) => x.rec.kind).join(','); c.close();
        }
        const dn = await ev(D, () => [...FED.live.conns.values()][0].node);
        throw new Error(`Dave's session on server 2 got ${own.map((x) => x.rec.kind).join(',') || 'nothing'}; per node ${JSON.stringify(per)}; Dave is on ${dn}`);
      }
      for (const x of own) must(x.rec.kind !== 'offer' || JSON.stringify(Object.keys(x.rec.body).sort()) === '["enc","to"]', `an offer in clear: ${JSON.stringify(x.rec.body).slice(0, 120)}`);
      const ids = own.map((x) => rid(x.rec)), out = [];
      for (const [where, anon] of [['server 1', raw], ['server 2', raw2]]) {
        const third = await authedAt(anon.url, fakes[3].k);
        for (const [who, c] of [['an anonymous session', anon], ['another network', third]]) {
          const items = await subAll(c, ['offer', 'accept', 'decline']);
          must(!items.some(isDD), `${who} on ${where} got ${items.filter(isDD).length} of Dave and Alice's deal records`);
          const got = (await c.ask({ m: 'fetch', ids })).flatMap((p) => p.items || []);
          must(!got.length, `${who} on ${where} fetched ${got.length} of them`);
          must(!c.frames.some((f) => f.m === 'recs' && (f.items || []).some(isDD)), `${who} on ${where} saw one live`);
        }
        third.close();
        out.push(where);
      }
      must(!B.frames.some((f) => (f.m === 'recs' || f.m === 'push') && (f.items || []).some(isDD)), 'Bob\'s game got one of Dave and Alice\'s deal records');
      return `deal ${id.slice(0, 8)}… runs in both games; Dave's session got ${own.length} sealed records; third parties on ${out.join(' and ')}, and Bob, got 0`;
    });

    if (TWO) await step('the shun counts on server 2 too: votes travel between servers, Dave\'s game excludes the target', async () => {
      const target = fakes[0].k.pub;
      await until(() => { const x = ctl2('players').find((y) => y.key === target); return x && x.shunned; }, 30000, 'server 2 to count the shun');
      await until(() => ev(D, async (k) => (await fedShunned()).includes(k), target), 30000, 'Dave to exclude the target');
      must(!D.frames.some((f) => (f.m === 'recs' || f.m === 'push') && (f.items || []).some((it) => it && it.rec && (it.rec.kind === 'shun' || it.rec.kind === 'unshun'))), 'a vote reached Dave\'s game');
      const votes = (await subAll(raw2, ['shun'])).length;
      must(votes === 0, `an anonymous session on server 2 got ${votes} votes`);
      return `target ${target.slice(0, 8)}… excluded at server 2 and in Dave's game`;
    });

    if (TWO) await step('failover: the node of server 2 Dave is on stops; his game reconnects to the other one', async () => {
      const at = await ev(D, () => [...FED.live.conns.values()][0].node);
      must([URL2, URL2B].includes(at), `Dave is on ${at}`);
      // Stop the node Dave is on; the other one must take him.
      const [stop, to, toDir] = at === URL2 ? [r2, URL2B, srv[1].d2b] : [r2b, URL2, srv[1].d];
      const toKey = JSON.parse(relay(toDir, 'status')).node;
      const welcomes = D.frames.filter((f) => f.m === 'welcome').length;
      raw2.close();
      await stopRelay(stop);
      await until(() => ev(D, (u) => { const c = [...FED.live.conns.values()][0]; return fedStatus().state === 'connected' && c.node === u; }, to), 60000, `Dave on ${to}`);
      const w = D.frames.filter((f) => f.m === 'welcome').slice(welcomes).find((f) => f.node === toKey);
      must(w && w.server === srv[1].id, `no welcome from ${to}`);
      await until(() => JSON.parse(relay(toDir, 'status')).clients >= 1, 15000, 'the other node to count Dave');
      // Still in the federation: a new record of Alice's arrives through node 2b.
      await sleep(1100); // two announces of one network in the same second tie on t (§10.11): publish in a new second
      const t0 = now();
      await ev(A, () => ACT.fpTermsSet({ terms: JSON.stringify({ pol: 'open', auto: { peering: 'auto' }, rates: {} }) }));
      await until(() => ev(D, async ([k, t]) => { await fedPlayRefresh(); const a = FEDN.ann.get(k); return !!a && a.rec.t >= t; }, [P.A, t0]), 45000, 'Alice\'s new announce at Dave through node 2b');
      return `${at} → ${to}; Alice's new terms reached Dave there`;
    });

    await step('update notice: Alice (operator) sees the banner, Bob gets no update frame; the looking glass shows the relay version', async () => {
      const st = ctl('status');
      must(st.version === RELAY_VER, `relay status version ${st.version}`);
      must(st.update && st.update.version === NEXT_VER && st.update.security === true && st.update.source === 'feed', `relay status update ${JSON.stringify(st.update)}`);
      must(/relay update available/.test(relayLog), 'the relay did not log the update');
      // The welcome says what the node runs, to every game.
      for (const p of [A, B]) must(p.frames.some((f) => f.m === 'welcome' && f.impl && f.impl.version === RELAY_VER), `${p.name}'s welcome has no impl`);
      const upd = await until(() => A.frames.find((f) => f.m === 'update'), 15000, 'Alice\'s update frame');
      must(upd.version === NEXT_VER && upd.security === true && upd.notes === `https://github.com/fjaeckel/seriesoftubes/releases/tag/v${NEXT_VER}`, `update frame ${JSON.stringify(upd)}`);
      must(!B.frames.some((f) => f.m === 'update'), 'Bob, no operator, got an update frame');
      await ev(A, (id) => ACT.fuOpen({ v: 'server', id }), srv[0].id);
      await A.page.waitForSelector('.fedui .fu-upd.bad', { timeout: 15000 });
      const banner = await A.page.locator('.fedui .fu-upd').first().textContent();
      must(banner.includes('Security update available') && banner.includes(NEXT_VER), `Alice's banner: ${banner}`);
      const href = await A.page.locator('.fedui .fu-upd a').first().getAttribute('href');
      must(href === upd.notes, `banner link ${href}`);
      await ev(B, (id) => ACT.fuOpen({ v: 'server', id }), srv[0].id);
      await B.page.waitForSelector('.fedui .fu-relays', { timeout: 15000 });
      const relays = await B.page.locator('.fedui .fu-relays').first().textContent();
      must(relays.includes(`relay ${RELAY_VER}`), `Bob's looking glass: ${relays}`);
      must(await B.page.locator('.fedui .fu-upd').count() === 0, 'Bob sees an update banner');
      for (const p of [A, B]) await ev(p, () => ACT.fuClose());
      return `relay ${RELAY_VER}, feed ${NEXT_VER} (security): Alice's banner, Bob none; looking glass "${relays.trim()}"`;
    });

    await step('update notice without relay.json: a second relay asks (a stand-in for) GitHub\'s releases API', async () => {
      const GH_VER = RELAY_VER.replace(/^(\d+)\..*$/, (_, a) => `${+a + 1}.0.0`), notes = `https://github.com/fjaeckel/seriesoftubes/releases/tag/v${GH_VER}`;
      const asked = [];
      const gh = http.createServer((req, res) => {
        asked.push({ url: req.url, ua: req.headers['user-agent'], accept: req.headers.accept, auth: req.headers.authorization, cookie: req.headers.cookie });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ tag_name: `v${GH_VER}`, html_url: notes, published_at: new Date().toISOString(), body: 'notes' }));
      });
      await new Promise((r) => gh.listen(0, '127.0.0.1', r));
      // Server 3's folder (server 2 serves already), with a registry folder that has servers.json and no relay.json.
      const d = srv[2].d, noFeed = path.join(tmp, 'nofeed'), cf = path.join(d, 'config.json'), c = JSON.parse(fs.readFileSync(cf, 'utf8'));
      fs.mkdirSync(noFeed, { recursive: true });
      fs.copyFileSync(path.join(tmp, 'site', 'federation', 'servers.json'), path.join(noFeed, 'servers.json'));
      delete c.metrics;
      Object.assign(c, { listen: `127.0.0.1:${await freePort()}`, registry: path.join(noFeed, 'servers.json') });
      fs.writeFileSync(cf, JSON.stringify(c, null, 2));
      let log = '';
      const p = spawn(bin, ['serve', '--data', d], { stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, RELAY_RELEASES_URL: `http://127.0.0.1:${gh.address().port}/repos/fjaeckel/seriesoftubes/releases/latest` } });
      procs.push(p);
      p.stdout.on('data', (b) => { log += b; });
      p.stderr.on('data', (b) => { log += b; });
      try {
        const st = await until(() => { try { const s = JSON.parse(relay(d, 'status')); return s.update && s; } catch (e) { return false; } }, 15000, 'the second relay\'s update');
        must(st.update.version === GH_VER && st.update.source === 'github' && st.update.security === false && st.update.notes === notes, `update ${JSON.stringify(st.update)}`);
        must(/from GitHub releases/.test(st.update.says), `says ${st.update.says}`);
        must(asked.length >= 1 && asked[0].url === '/repos/fjaeckel/seriesoftubes/releases/latest', `asked ${JSON.stringify(asked)}`);
        must(asked[0].ua === `tubes-relay/${RELAY_VER}` && asked[0].accept === 'application/vnd.github+json' && !asked[0].auth && !asked[0].cookie, `headers ${JSON.stringify(asked[0])}`);
        must(/update feed: not read/.test(log) && /relay update available/.test(log), 'the second relay did not log the fallback');
        return `relay.json missing: ${GH_VER} from the stand-in GitHub API, ${asked.length} request(s), User-Agent "${asked[0].ua}"`;
      } finally {
        p.kill('SIGTERM');
        gh.close();
      }
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

    // Reports (§5.10): for the operators of the server they name, and nobody else.
    await step('a report: Bob reports a made-up network from the sheet; Alice (operator) sees it; nobody else gets it', async () => {
      const target = fakes[1], isRep = (it) => it && it.rec && it.rec.kind === 'report';
      await until(() => ev(B, async (k) => (await fedNetworks()).some((n) => n.key === k), target.k.pub), 15000, 'Bob to know the network');
      await ev(B, (k) => ACT.fuReport({ key: k }), target.k.pub);
      await B.page.waitForSelector('#modalCard .fedui[data-fu="report"] [data-act="fuRepPick"][data-args*="spam"]', { timeout: 15000 });
      await click(B, '#modalCard [data-act="fuRepPick"][data-args*="spam"]');
      await click(B, '#modalCard [data-act="fuRepGo"]');
      const put = await until(() => B.sent.find((f) => f.m === 'put' && f.rec && f.rec.kind === 'report'), 15000, 'Bob\'s report');
      must(put.rec.key === P.B && put.rec.body.server === srv[0].id && put.rec.body.target === target.k.pub && put.rec.body.reason === 'spam', `Bob's report ${JSON.stringify(put.rec.body)}`);
      must(B.frames.some((f) => f.m === 'ack' && f.id === put.id), 'the relay did not take Bob\'s report');
      await until(() => ctl('status').kinds.report === 1, 10000, 'the relay to hold the report');
      // Alice proved the operator key: her game follows reports and lists it in the operator panel.
      must(A.sent.some((f) => f.m === 'sub' && f.kinds.join() === 'report'), 'Alice\'s game does not follow reports');
      await until(() => ev(A, async (a) => (await fedReportsFor(a.srv)).some((x) => x.target === a.k && x.reasons.spam === 1), { srv: srv[0].id, k: target.k.pub }), 15000, 'Alice\'s game to keep the report');
      await ev(A, (id) => ACT.fuOpen({ v: 'server', id }), srv[0].id);
      await A.page.waitForFunction(() => /Reports from players[\s\S]*Spam 1 · 1 player reported it/.test(document.querySelector('#modalCard').textContent), null, { timeout: 15000 });
      await ev(A, () => ACT.fuClose());
      // Bob (no operator) never got a report record, his own neither, and never asked.
      must(!B.frames.some((f) => (f.m === 'recs' || f.m === 'push') && (f.items || []).some(isRep)), 'a report reached Bob\'s game');
      must(!B.sent.some((f) => f.m === 'sub' && f.kinds.includes('report')), 'Bob\'s game asked for reports');
      // A third client, with a network key of its own proved: no report by sub (backlog or live) or by fetch.
      const third = new Raw(raw.url), w = await third.open(), t = now(), k3 = keyOf(sha('fed-e2e third'));
      const sig = b64(crypto.sign(null, Buffer.from(canon({ m: 'auth', key: k3.pub, node: w.node, server: w.server, t }), 'utf8'), k3.priv));
      must((await third.ask({ m: 'auth', key: k3.pub, t, sig }))[0].m === 'ack', 'the third client\'s auth');
      const back = (await third.ask({ m: 'sub', kinds: ['report', 'announce'], since: '' })).flatMap((pg) => pg.items);
      must(back.length >= FAKES && !back.some(isRep), `the third client's backlog holds ${back.filter(isRep).length} reports`);
      const got = (await third.ask({ m: 'fetch', ids: [rid(put.rec)] })).flatMap((pg) => pg.items || []);
      must(!got.length, 'the third client fetched the report');
      const again = sign(fakes[2].k, 'report', now(), { server: srv[0].id, target: target.k.pub, reason: 'abuse' });
      must((await raw.put(again)).m === 'ack', 'a second report through the raw client');
      await until(() => ev(A, async (a) => (await fedReportsFor(a.srv)).some((x) => x.target === a.k && x.reporters.length === 2), { srv: srv[0].id, k: target.k.pub }), 15000, 'Alice\'s game to get the second report live');
      await sleep(500);
      must(!third.frames.some((f) => (f.m === 'recs' || f.m === 'push') && (f.items || []).some(isRep)), 'a live report reached the third client');
      must(!B.frames.some((f) => (f.m === 'recs' || f.m === 'push') && (f.items || []).some(isRep)), 'a live report reached Bob');
      third.close();
      return `Bob's report and a second one reached Alice's panel; Bob and a third client got 0`;
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
      // The customer cone (§10.4): Bob sells transit to Alice and to the made-up network that joined 40 days ago.
      // Alice is a newcomer, so she does not count: his cone is 1, and 0 without the made-up network's records.
      const cone = (await raw.ask({ m: 'rank', board: 'cone', measure: 'total', division: 'all', filters: { keys: [P.A, P.B, carol.pub].sort() } }))[0];
      const bob = cone.rows && cone.rows.find((r) => r.key === P.B);
      must(bob && bob.value === 1, `Bob's cone on the relay: ${JSON.stringify(cone).slice(0, 300)}`);
      const alone = await ev(A, async ([b, c]) => { const conn = FED.live.conns.get(S.fed.servers[0]), srvs = await fedServers();
        const w = await fedAskRetry(conn, { m: 'rankwhy', board: 'cone', measure: 'total', division: 'all', filters: {}, key: b }, true);
        const q = { now: w.slot, board: 'cone', measure: 'total', division: 'all', exclude: await fedServerExcl(conn), cities: null, filters: {} }, at = { srv: conn.srv, nodeKey: conn.nodeKey };
        const all = await fedWhyRun(w.items, fedNow(), at, fwSrvs(srvs), b, q), only = await fedWhyRun(w.items.filter((it) => it.rec.key !== c), fedNow(), at, fwSrvs(srvs), b, q);
        return [all && all.value, only && only.value]; }, [P.B, carol.pub]);
      must(alone[0] === 1 && alone[1] === 0, `Bob's cone from the records: ${JSON.stringify(alone)} (with, without the made-up network)`);
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
          for (const board of ['pops', 'traffic', 'total', 'cone']) { const req = fedRankReq({ board }, []), a = fedRanksOk(await fedAskRetry(c, req)); res.push(a ? await fedRankCheck(c, req, a) : 'no answer'); }
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
      for (const k of ['relay_connections_total', 'relay_records_out_total', 'relay_refused_total', `relay_build_info{version="${RELAY_VER}"} 1`,
        'relay_update_available{security="true"} 1', `relay_latest_version_info{version="${NEXT_VER}"} 1`]) must(m.includes(k), `no ${k} in /metrics`);
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
      for (const p of [A, B, D].filter(Boolean)) {
        const st = await ev(p, () => ({ ...FW.stat, dead: FW.dead, w: !!FW.w }));
        must(st.w && !st.dead && st.n > 0 && st.items > 0 && st.local === 0, `${p.name}: ${JSON.stringify(st)}`);
        out.push(`${p.name} ${st.n} batches, ${st.items} items`);
      }
      return out.join(', ');
    });

    await step('no page errors in any game', async () => {
      // Dave's game lost its node on purpose (failover): WebKit logs that as an error of its own words.
      const errs = [...A.errors, ...B.errors, ...(D ? D.errors.filter((e) => !/^WebSocket connection to 'wss:\/\/relay2b?\.localhost:\d+\/fed' failed/.test(e)) : [])].filter((e) => !/favicon|ERR_|404/.test(e));
      must(!errs.length, errs.slice(0, 5).join(' | '));
    });
    raw.close();
  } catch (e) {
    failed++;
    console.log(`FAIL  (setup) ${e && e.stack ? e.stack : e}`);
  } finally {
    if (failed && relayLog) console.log('--- relay log (last 40 lines) ---\n' + relayLog.trim().split('\n').slice(-40).join('\n'));
    for (const [k, l] of Object.entries(logs2)) if (failed && l) console.log(`--- relay log ${k} (last 25 lines) ---\n` + l.trim().split('\n').slice(-25).join('\n'));
    await cleanup();
  }
  console.log(`${results.filter((r) => r[1]).length}/${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}

/* --lan: `relay lan` as a LAN party host runs it, on loopback (127.0.0.1 is a local address a node URL may name, like
   a LAN's 192.168.x.y). The context's ignoreHTTPSErrors stands in for the player accepting the certificate warning once;
   the page is served by a static server standing in for GitHub Pages, with no servers.json: nothing from the internet. */
async function lanMain() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir().length < 60 ? os.tmpdir() : '/tmp', 'fe2l-'));
  let proc = null, browser = null, web = null, proxy = null, out = '', log = '';
  const cleanup = async () => {
    try { if (browser) await browser.close(); } catch (e) { /* gone */ }
    try { if (proc) proc.kill('SIGTERM'); } catch (e) { /* gone */ }
    if (web) web.close();
    if (proxy) proxy.close();
    // Relays may still be writing as they stop: retry the removal a few times.
    if (!KEEP) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); else console.log(`kept ${tmp}`);
  };
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
  const bin = path.join(tmp, 'relay'), data = path.join(tmp, 'lan');
  const ctl = (cmd) => JSON.parse(execFileSync(bin, [cmd, '--data', data], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  try {
    const [port, wport] = [await freePort(), await freePort()];
    const NODE = `wss://127.0.0.1:${port}/fed`;
    let invite = null, cert = null;

    await step('build the relay (go build)', async () => {
      execFileSync('go', ['build', '-o', bin, './cmd/relay'], { cwd: path.join(ROOT, 'relay'), stdio: ['ignore', 'pipe', 'pipe'] });
    });

    await step('relay lan: founds a standalone server, makes its certificate, prints the invite', async () => {
      proc = spawn(bin, ['lan', '--data', data, '--listen', `127.0.0.1:${port}`, '--name', 'E2E LAN Party'], { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stdout.on('data', (b) => { out += b; });
      proc.stderr.on('data', (b) => { log += b; });
      await until(() => /relay serving/.test(log), 20000, 'the relay to serve');
      invite = (out.match(/https:\/\/seriesoftub\.es\/#join=\S+/) || [])[0];
      must(invite === `https://seriesoftub.es/#join=${NODE}`, `printed invite ${invite}`);
      must(out.includes(`https://127.0.0.1:${port}/`), 'no page address printed');
      const st = ctl('status');
      must(st.serving, 'status: not serving');
      return invite;
    });

    await step('its certificate: self-signed, for 127.0.0.1 and localhost, a year', async () => {
      const tls = require('node:tls');
      cert = await new Promise((res, rej) => {
        const s = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, () => { const c = s.getPeerCertificate(); const why = s.authorizationError; s.end(); res({ c, why }); });
        s.on('error', rej);
      });
      must(/SELF_SIGNED/.test(String(cert.why)), `not refused as self-signed by default (${cert.why})`);
      const san = cert.c.subjectaltname || '';
      must(/IP Address:127\.0\.0\.1/.test(san) && /DNS:localhost/.test(san), `SANs ${san}`);
      const days = (Date.parse(cert.c.valid_to) - Date.now()) / 86400e3;
      must(days > 360 && days < 366, `valid for ${days.toFixed(0)} days`);
      return `${san.split(', ').length} names, ${days.toFixed(0)} days`;
    });

    await step('serve the game page (no servers.json: offline)', async () => {
      const { html } = assemble({ dev: false });
      const SITE = path.join(ROOT, 'site');
      const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
      // WebKit's page is https (launchEngine): a certificate of its own for the stand-in of GitHub Pages.
      const tls = PAGE_TLS && { key: path.join(tmp, 'page.key'), crt: path.join(tmp, 'page.crt') };
      if (tls) execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', '/CN=game.test',
        '-addext', 'subjectAltName=DNS:game.test', '-keyout', tls.key, '-out', tls.crt], { stdio: 'ignore' });
      web = pageServer((req, res) => {
        const u = new URL(req.url, 'http://x').pathname;
        if (u === '/' || u === '/index.html') { res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' }); return res.end(html); }
        const rel = path.normalize(decodeURIComponent(u)).replace(/^([/\\]|\.\.)+/, '');
        const f = path.join(SITE, rel);
        if (!rel.startsWith('federation') && f.startsWith(SITE + path.sep) && fs.statSync(f, { throwIfNoEntry: false })?.isFile()) {
          res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
          return fs.createReadStream(f).pipe(res);
        }
        res.writeHead(404); res.end();
      }, tls);
      await new Promise((r) => web.listen(wport, '127.0.0.1', r));
    });

    const PAGE = pageURL(wport);
    // No --ignore-certificate-errors here: only the context's ignoreHTTPSErrors, the stand-in for "accept the warning".
    ({ browser, proxy } = await launchEngine(PAGE, ['game.test']));
    const ctx = await browser.newContext(phone(360, 740));
    const page = await ctx.newPage();
    const errors = [], frames = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('websocket', (ws) => { if (ws.url().startsWith('wss://127.0.0.1')) ws.on('framereceived', (f) => { try { frames.push(JSON.parse(f.payload)); } catch (e) { /* not JSON */ } }); });
    let link = null;

    await step("the relay's own page (what a player opens first): the invite for the address used, nothing loaded", async () => {
      const reqs = [];
      page.on('request', (r) => reqs.push(r.url()));
      const r = await page.goto(`https://127.0.0.1:${port}/`, { waitUntil: 'load' });
      must(r.status() === 200, `status ${r.status()}`);
      link = await page.locator('a.go').getAttribute('href');
      must(link === invite, `page invite ${link}`);
      must(reqs.length === 1, `the page loaded more: ${reqs.join(' ')}`);
      must(await page.locator('script').count() === 0, 'a script on the page');
      page.removeAllListeners('request');
      return link;
    });

    await step('a player follows the invite (an IP address) on a new game: joins the LAN server over wss', async () => {
      // The link opens seriesoftub.es; here the same page from the stand-in server, with the same fragment.
      await page.goto(PAGE + link.slice(link.indexOf('#')), { waitUntil: 'load' });
      await page.waitForSelector('#fsList .fs-srv.on', { timeout: 15000 });
      must(await page.evaluate(() => UI.fs && UI.fs.on && UI.fs.inv), 'the title switch is not on with the invite');
      await page.evaluate(() => { const i = document.getElementById('nmIn'); if (i) i.value = 'LAN Net'; UI.pitched = true; });
      await page.locator('#modalCard .tcta [data-act="start"]').click();
      await page.waitForFunction(() => typeof S !== 'undefined' && S && UI.started);
      await page.locator('#modalCard [data-act="charter"]').first().click();
      await until(() => page.evaluate(() => fedStatus().state === 'connected'), 30000, 'connected');
      const w = frames.find((f) => f.m === 'welcome');
      must(w && w.server === ctl('status').server, 'welcome from another server');
      must(await page.evaluate((u) => S.fed.servers.length === 1 && S.fed.servers[0] === u, NODE), 'the save joined another URL');
      return `server ${w.server.slice(0, 8)}…`;
    });

    await step('the relay lists the player; the log holds no address but its own', async () => {
      const l = await until(() => { const x = ctl('players'); return x.find((p) => p.name === 'LAN Net') && x; }, 30000, 'the announce at the relay');
      const addr = log.split('\n').filter((x) => !/msg="relay serving"/.test(x)).find((x) => /127\.0\.0\.1|::1|\[::/.test(x));
      must(!addr, `the relay log holds an address: ${addr}`);
      return `${l.length} network(s)`;
    });

    await step('relay lan again: same server, same certificate (players accept once)', async () => {
      const st = ctl('status');
      proc.kill('SIGTERM');
      await until(() => proc.exitCode !== null || proc.signalCode !== null, 10000, 'the relay to stop');
      out = ''; log = '';
      proc = spawn(bin, ['lan', '--data', data, '--listen', `127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stdout.on('data', (b) => { out += b; });
      proc.stderr.on('data', (b) => { log += b; });
      await until(() => /relay serving/.test(log), 20000, 'the relay to serve again');
      must(/Same certificate/.test(out) && out.includes('E2E LAN Party'), `second start said:\n${out}`);
      must(ctl('status').server === st.server, 'another server');
      await until(() => page.evaluate(() => fedStatus().state === 'connected'), 60000, 'the game to reconnect');
    });

    await step('no page errors', async () => {
      // The relay was restarted on purpose: WebKit logs the lost connection in words of its own.
      const errs = errors.filter((e) => !/favicon|ERR_|404/.test(e) && !e.startsWith(`WebSocket connection to '${NODE}' failed`));
      must(!errs.length, errs.slice(0, 5).join(' | '));
    });
  } catch (e) {
    failed++;
    console.log(`FAIL  (setup) ${e && e.stack ? e.stack : e}`);
  } finally {
    if (failed && (out || log)) console.log('--- relay lan output ---\n' + (out + log).trim().split('\n').slice(-40).join('\n'));
    await cleanup();
  }
  console.log(`${results.filter((r) => r[1]).length}/${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}

if (LAN) lanMain(); else main();
