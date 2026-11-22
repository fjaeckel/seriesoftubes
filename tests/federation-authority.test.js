// The authority (docs/FEDERATION-PROTOCOL.md 11.5, ADR 0006): seriesoftub.es's signed federation/authority.json. The
// game refuses to join a banned server or an out-of-date relay, leaves banned servers out of its list, and treats a
// banned network as excluded and confirmed. The file the build signs (scripts/authority.js) is the one the game reads.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fedPage, joinGame, settle, until, NOW, PL, PL_ENTRY, URL1, rec, key, canon } = require('./helpers/fed');
const authority = require('../scripts/authority');

const AUTH = key('seriesoftub.es authority'), M = key('mallory').pub;
// An authority file signed at t: banned nets and servers (abuse, legal), relayMin from `from`.
function file(t, { nets = [], servers = [], relayMin, from } = {}) {
  const body = { ...(relayMin ? { relayMin, relayMinFrom: from } : {}), nets: nets.slice().sort().map((k) => ({ key: k, reason: 'abuse' })),
    servers: servers.slice().sort().map((id) => ({ id, reason: 'legal' })) };
  return canon(rec('seriesoftub.es authority', 'authority', t, body));
}
// A page whose site answers authority.json with text (and servers.json with nothing), the authority key pinned.
function page(text, o = {}) {
  const p = fedPage(o);
  p.w.__fetch = async (u) => (String(u).endsWith('authority.json') && text ? { ok: true, text: async () => text } : { ok: false, text: async () => '' });
  p.ev(`FED_AUTH_KEYS.push(${JSON.stringify(AUTH.pub)})`);
  return p;
}
const run = async (p, ms = 3000) => { for (let t = 0; t < ms; t += 250) { p.net.advance(250); await settle(); } };
const spy = (n) => { n.got = []; const take = n.take.bind(n); n.take = (ws, text) => { n.got.push(JSON.parse(text)); take(ws, text); }; return n; };

test('the build signs what the game verifies, and the pinned keys agree everywhere', async () => {
  assert.doesNotThrow(() => authority.pinned(), 'federation/authority-keys.json, the relay and the game pin the same keys');
  const seed = crypto.randomBytes(32).toString('base64url');
  const priv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seed, 'base64url')]), format: 'der', type: 'pkcs8' });
  const pub = crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12).toString('base64url');
  assert.throws(() => authority.make('5.1.1', NOW, seed, []), /not one of the keys/, 'a key that is not pinned is refused at build');
  assert.equal(authority.make('5.1.1', NOW, null, [pub]), null, 'no key: no file');
  const text = authority.make('5.1.1', NOW, seed, [pub]);
  const p = page(null);
  const r = await p.ev(`fedAuthCheck(${JSON.stringify(text)},${NOW},[${JSON.stringify(pub)}]).then(r=>r.ok?{t:r.a.t,nets:r.a.nets.size,servers:r.a.servers.size}:r)`);
  const b = authority.bans();
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { t: NOW, nets: b.nets.length, servers: b.servers.length });
  assert.equal(JSON.parse(JSON.stringify(await p.ev(`fedAuthCheck(${JSON.stringify(text)},${NOW})`))).error, 'not_authority', 'the build key is not the pinned key here');
  assert.deepEqual(p.errors, []);
});

test('relayMin applies seven days after its release, from the CHANGELOG date', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.relayMin === undefined ? null : typeof authority.relayMin(pkg.version).relayMinFrom, pkg.relayMin === undefined ? null : 'number');
  if (pkg.relayMin) {
    const m = require('node:fs').readFileSync(require.resolve('../CHANGELOG.md'), 'utf8').match(new RegExp(`^## \\[${pkg.relayMin.replace(/\./g, '\\.')}\\] — (\\d{4}-\\d{2}-\\d{2})`, 'm'));
    assert.equal(authority.relayMin(pkg.version).relayMinFrom, Date.parse(m[1] + 'T00:00:00Z') / 1000 + 604800);
  }
  assert.doesNotThrow(() => authority.bans(), 'federation/bans.json checks');
});

test('a banned server is not joined, is said to be cut off, and is left out of the server list', async () => {
  const p = page(file(NOW - 60, { servers: [PL.id] }));
  const n = spy(p.net.node(URL1));
  await p.ev(`fedPut('kv','registry',${JSON.stringify({ asOf: NOW, at: NOW, servers: [PL_ENTRY] })})`);
  await joinGame(p);
  await run(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev(`(FED.st[${JSON.stringify(URL1)}]||{}).cut`)) === 'banned')), 'cut off as banned');
  assert.ok(!n.got.some((f) => f.m === 'sub' || f.m === 'auth'), 'nothing past the welcome');
  assert.equal(await p.ev('fedServersAllowed().then(l=>l.length)'), 0, 'not offered in the list');
  assert.equal(await p.ev('fedServers().then(l=>l.length)'), 1, 'still known to the catalog');
  assert.ok(await p.ev('fedErrs().some(e=>e.why==="banned")'), 'in the error log');
  assert.deepEqual(p.errors, []);
});

test('an out-of-date relay is not joined once relayMin is due; a current one is', async () => {
  const p = page(file(NOW - 60, { relayMin: '5.2.0', from: NOW - 1 }));
  const n = spy(p.net.node(URL1));
  n.impl = { name: 'tubes-relay', version: '5.1.9' };
  await joinGame(p);
  await run(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev(`(FED.st[${JSON.stringify(URL1)}]||{}).cut`)) === 'outdated')), 'cut off as out of date');
  assert.ok(!n.got.some((f) => f.m === 'sub'));
  assert.deepEqual(p.errors, []);

  const q = page(file(NOW - 60, { relayMin: '5.2.0', from: NOW - 1 }));
  const m = spy(q.net.node(URL1));
  m.impl = { name: 'tubes-relay', version: '5.2.0' };
  await joinGame(q);
  await run(q);
  assert.ok(m.got.some((f) => f.m === 'sub'), 'a relay at relayMin is joined');
  assert.equal(await q.ev(`(FED.st[${JSON.stringify(URL1)}]||{}).cut||''`), '');
  assert.deepEqual(q.errors, []);
});

test('the version of a relay at a local address is not checked', async () => {
  const LAN = 'wss://192.168.1.20:8443/fed';
  const p = page(file(NOW - 60, { relayMin: '5.2.0', from: NOW - 1 }));
  const n = spy(p.net.node(LAN));
  n.impl = { name: 'tubes-relay', version: 'dev' };
  assert.equal(await p.ev(`fedAuthRefuse({relayMin:'5.2.0',from:${NOW - 1},nets:new Map(),servers:new Map()},{srv:'x',url:${JSON.stringify(LAN)},impl:{name:'tubes-relay',version:'dev'}})`), '');
  assert.equal(await p.ev(`fedAuthRefuse({relayMin:'5.2.0',from:${NOW - 1},nets:new Map(),servers:new Map()},{srv:'x',url:${JSON.stringify(URL1)},impl:{name:'tubes-relay',version:'dev'}})`), 'outdated');
  assert.deepEqual(p.errors, []);
});

test('a banned network is excluded and confirmed whatever the servers say, and its own game is told why', async () => {
  const p = page(file(NOW - 60, { nets: [M] }));
  p.net.node(URL1);
  await joinGame(p);
  await run(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedConfirmed()')).includes(M))), 'confirmed by the authority alone');
  const info = JSON.parse(JSON.stringify(await p.ev(`fedExclInfo(${JSON.stringify(M)})`)));
  assert.equal(info.shunned, true);
  assert.equal(info.confirmed, true);
  assert.equal(info.banned, 'abuse');
  // The banned network's own game: the home view says seriesoftub.es banned it.
  await p.ev("FED.auth.nets.set(S.fed.key.pub,'cheating');FED.xgen++");
  await p.ev("ACT.fuOpen({v:'home'})");
  await settle(40);
  assert.ok(await until(async () => (await settle(5), /seriesoftub\.es banned your network/.test(p.dom.window.document.body.textContent))), 'the home view says so');
  assert.deepEqual(p.errors, []);
});

test('an older or unsigned file never replaces a newer one, and the newest is kept for the next page', async () => {
  const p = page(file(NOW - 60, { nets: [M] }));
  p.net.node(URL1);
  await joinGame(p);
  await run(p);
  assert.ok(await until(async () => (await settle(5), (await p.ev('FED.auth&&FED.auth.t')) === NOW - 60)));
  p.w.__fetch = async () => ({ ok: true, text: async () => file(NOW - 120, {}) });
  await p.ev('FED.authAt=0;fedAuthLoad()');
  assert.equal(await p.ev('FED.auth.nets.size'), 1, 'an older file is ignored');
  p.w.__fetch = async () => ({ ok: true, text: async () => canon(rec('dan', 'authority', NOW, { nets: [], servers: [] })) });
  await p.ev('FED.authAt=0;fedAuthLoad()');
  assert.equal(await p.ev('FED.auth.nets.size'), 1, 'a file from another key is ignored');
  assert.equal(await p.ev("fedGet('kv','authority').then(o=>o&&o.t)"), NOW - 60, 'kept in the store');
  assert.deepEqual(p.errors, []);
});

test('signing by hand needs a pinned key, and the bans as committed', () => {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-')), keyFile = path.join(dir, 'x.key');
  fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('base64url') + '\n');
  let err = '';
  try { execFileSync(process.execPath, [require.resolve('../scripts/authority.js'), '--sign', '--key', keyFile, '--out', path.join(dir, 'a.json')], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { err = String(e.stderr); }
  assert.match(err, /not one of the keys in federation\/authority-keys\.json|not committed/, 'an unpinned key signs nothing');
  assert.ok(!fs.existsSync(path.join(dir, 'a.json')));
});
