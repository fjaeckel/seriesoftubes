const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/app');
const { load } = require('../server/headless');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out'); await wait(50); } }

async function boot(opts = {}) {
  const dir = opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'sot-test-'));
  const app = createApp({ dataDir: dir, ...opts });
  const a = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${a.port}`;
  const api = async (method, p, body, token, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (_) {}
    return { s: r.status, b: j, text, h: r.headers };
  };
  const signup = async (name, password = 'correct horse battery') => (await api('POST', '/api/register', { name, password })).b;
  return { app, dir, base, api, signup, close: () => app.close() };
}

test('accounts: sign up, log in, wrong passwords, duplicate names, bad input', async () => {
  const s = await boot();
  try {
    const a = await s.api('POST', '/api/register', { name: 'Alice', password: 'correct horse' });
    assert.equal(a.s, 200); assert.ok(a.b.token); assert.equal(a.b.user.name, 'Alice');
    assert.equal((await s.api('POST', '/api/register', { name: 'alice', password: 'another pass' })).s, 409, 'names are case-insensitive');
    assert.equal((await s.api('POST', '/api/register', { name: 'x', password: 'long enough' })).s, 400);
    assert.equal((await s.api('POST', '/api/register', { name: 'bobby', password: 'short' })).s, 400);
    assert.equal((await s.api('POST', '/api/login', { name: 'ALICE', password: 'wrong wrong' })).s, 401);
    const ok = await s.api('POST', '/api/login', { name: 'alice', password: 'correct horse' });
    assert.equal(ok.s, 200);
    assert.equal((await s.api('GET', '/api/me', null, ok.b.token)).b.user.name, 'Alice');
    assert.equal((await s.api('GET', '/api/me')).s, 401);
    assert.equal((await s.api('GET', '/api/me', null, 'garbage')).s, 401);
    await s.api('POST', '/api/logout', null, ok.b.token);
    assert.equal((await s.api('GET', '/api/me', null, ok.b.token)).s, 401, 'logging out kills the token');
    s.app.store.flush();
    const db = fs.readFileSync(path.join(s.dir, 'db.json'), 'utf8');
    assert.ok(!db.includes('correct horse') && !db.includes(a.b.token), 'no plain passwords or tokens on disk');
  } finally { await s.close(); }
});

test('accounts: brute force is throttled, closed servers and server codes work', async () => {
  const s = await boot();
  try {
    await s.signup('carol');
    let last = 0;
    for (let i = 0; i < 14; i++) last = (await s.api('POST', '/api/login', { name: 'carol', password: 'nope nope nope' })).s;
    assert.equal(last, 429);
  } finally { await s.close(); }
  const closed = await boot({ registration: 'closed' });
  try { assert.equal((await closed.api('POST', '/api/register', { name: 'dave', password: 'long enough' })).s, 403); } finally { await closed.close(); }
  const coded = await boot({ serverCode: 'tubes-2026' });
  try {
    assert.equal((await coded.api('POST', '/api/register', { name: 'erin', password: 'long enough' })).s, 403);
    assert.equal((await coded.api('POST', '/api/register', { name: 'erin', password: 'long enough', code: 'tubes-2026' })).s, 200);
  } finally { await coded.close(); }
});

test('networks: any free AS number, no reserved or real ones, no duplicates, owner and invite', async () => {
  const s = await boot();
  try {
    const A = (await s.signup('alice')).token, B = (await s.signup('bob')).token;
    const make = (asn, tok = A, extra = {}) => s.api('POST', '/api/networks', { name: 'Net ' + asn, asn, home: 'fra', ...extra }, tok);
    assert.equal((await make('3356')).s, 400, 'AS3356 is Lumen');
    assert.equal((await make('0')).s, 400);
    assert.equal((await make('23456')).s, 400);
    assert.equal((await make('abc')).s, 400);
    assert.equal((await make('64512', A, { home: 'nowhere' })).s, 400);
    assert.equal((await make('64512', A, { name: '' })).s, 400);
    const ok = await make('64512');
    assert.equal(ok.s, 200); assert.equal(ok.b.role, 'owner'); assert.ok(ok.b.invite);
    assert.equal((await make('AS64512', B)).s, 409, 'taken by alice');
    assert.equal((await s.api('GET', '/api/asn?asn=64512', null, B)).b.err.includes('already taken'), true);
    assert.equal((await make('4200000007', B)).s, 200, 'every player can pick their own');
    const dir = (await s.api('GET', '/api/networks')).b;
    assert.deepEqual(dir.map((n) => n.asn).sort((a, b) => a - b), [64512, 4200000007]);
    assert.ok(!JSON.stringify(dir).includes(ok.b.invite), 'the directory never leaks invite codes');
    // joining
    assert.equal((await s.api('POST', '/api/networks/64512/join', { invite: 'wrong' }, B)).s, 403);
    assert.equal((await s.api('GET', '/api/networks/64512', null, B)).s, 403, 'not on the team yet');
    assert.equal((await s.api('POST', '/api/networks/64512/join', { invite: ok.b.invite }, B)).b.role, 'operator');
    const info = (await s.api('GET', '/api/networks/64512', null, B)).b;
    assert.equal(info.invite, undefined, 'operators do not see the invite code');
    assert.deepEqual(info.members.map((m) => m.role).sort(), ['operator', 'owner']);
  } finally { await s.close(); }
});

test('commands: operators change the shared network, viewers cannot, strangers cannot, junk is refused', async () => {
  const s = await boot();
  try {
    const A = (await s.signup('alice')).token, B = (await s.signup('bob')).token, C = (await s.signup('carl')).token;
    const net = (await s.api('POST', '/api/networks', { name: 'Team', asn: '64600', home: 'fra' }, A)).b;
    await s.api('POST', '/api/networks/64600/join', { invite: net.invite }, B);
    const cmd = (tok, act, args = {}, ctx = {}) => s.api('POST', '/api/networks/64600/cmd', { act, args, ctx }, tok);
    const r = await cmd(B, 'launchBB', { city: 'fra' });
    assert.equal(r.s, 200); assert.equal(r.b.ok, true); assert.ok(r.b.msgs.length);
    assert.equal((await cmd(C, 'launchBB', { city: 'fra' })).s, 403, 'strangers cannot');
    assert.equal((await cmd(A, 'bogusAction')).b.ok, false);
    assert.equal((await cmd(A, 'start')).b.ok, false, 'local actions are not commands');
    assert.equal((await cmd(A, 'x'.repeat(60))).s, 400);
    assert.equal((await cmd(A, 'launchBB', { blob: 'x'.repeat(9000) })).s, 413);
    // demote bob to viewer
    const bobId = (await s.api('GET', '/api/networks/64600', null, A)).b.members.find((m) => m.name === 'bob').id;
    assert.equal((await s.api('POST', '/api/networks/64600/member', { uid: bobId, role: 'viewer' }, B)).s, 404, 'only the owner can');
    assert.equal((await s.api('POST', '/api/networks/64600/member', { uid: bobId, role: 'viewer' }, A)).s, 200);
    assert.equal((await cmd(B, 'addRouter', { city: 'fra' })).s, 403, 'viewers cannot change anything');
    assert.equal((await s.api('POST', '/api/networks/64600/member', { uid: bobId, role: 'remove' }, A)).s, 200);
    assert.equal((await s.api('GET', '/api/networks/64600', null, B)).s, 403);
  } finally { await s.close(); }
});

test('realtime: a team shares one world; everybody sees every change; the server runs the clock', async () => {
  const s = await boot();
  try {
    const A = (await s.signup('alice')).token, B = (await s.signup('bob')).token;
    const net = (await s.api('POST', '/api/networks', { name: 'Team', asn: '64601', home: 'fra' }, A)).b;
    await s.api('POST', '/api/networks/64601/join', { invite: net.invite }, B);
    // a real browser client (the game page in jsdom) as bob
    const g = load({ seed: false, url: s.base + '/' });
    g.dom.window.fetch = (u, o) => fetch(new URL(u, s.base), o);
    g.dom.window.TextDecoder = TextDecoder;
    g.ev(`MP.token=${JSON.stringify(B)};mpEnter(64601)`);
    await until(() => g.ev('!!S&&MP.status==="live"'));
    assert.equal(g.ev('S.name'), 'Team'); assert.equal(g.ev('S.asn'), 64601); assert.equal(g.ev('MP.role'), 'operator');
    assert.equal(g.ev('MP.on&&!!MP.orig.buyTransit'), true, 'actions are wrapped into commands');
    // alice builds something over the API; bob's page follows
    await s.api('POST', '/api/networks/64601/cmd', { act: 'launchBB', args: { city: 'fra' } }, A);
    await until(() => g.ev('!!(S.pops.fra&&S.pops.fra.bb)'));
    // bob clicks in his own UI; the command runs on the server and the snapshot comes back
    g.ev("ACT.buyTransit({city:'fra',net:'cog',tier:1})");
    await until(() => g.ev('S.transit.length===1'));
    // the server ticks the shared clock by itself, at the speed anyone chose
    const d0 = g.ev('S.day');
    g.ev('ACT.speed({v:8})');
    await until(() => g.ev('UI.speed') === 8 && g.ev('S.day') > d0 + 1, 9000);
    assert.equal(g.ev('MP.presence.length'), 1);
    assert.deepEqual(g.errors, []);
    g.ev('mpStop()');
  } finally { await s.close(); }
});

test('networks survive a restart, and an idle network does not run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sot-test-'));
  let s = await boot({ dir });
  let day;
  try {
    const A = (await s.signup('alice')).token;
    await s.api('POST', '/api/networks', { name: 'Keeper', asn: '64602', home: 'ams' }, A);
    await s.api('POST', '/api/networks/64602/cmd', { act: 'launchBB', args: { city: 'ams' } }, A);
    day = s.app.host.rooms.get(64602).ev('S.day');
    await wait(1500);
    assert.equal(s.app.host.rooms.get(64602).ev('S.day'), day, 'nobody connected: the clock is paused');
  } finally { await s.close(); }
  s = await boot({ dir });
  try {
    const t = (await s.api('POST', '/api/login', { name: 'alice', password: 'correct horse battery' })).b.token;
    assert.ok(t, 'accounts persist');
    const as = await s.api('GET', '/api/as/64602');
    assert.equal(as.s, 200); assert.equal(as.b.view.name, 'Keeper'); assert.equal(as.b.view.pops.length, 1, 'public data is served without loading the game');
    assert.equal(s.app.host.rooms.size, 0);
    await s.api('POST', '/api/networks/64602/cmd', { act: 'addRouter', args: { city: 'ams' } }, t);
    const room = s.app.host.rooms.get(64602);
    assert.equal(room.ev('S.day'), day);
    assert.ok(room.ev('!!S.pops.ams.bb'), 'the saved game came back with its state');
  } finally { await s.close(); }
});

test('public AS pages: player networks, real networks, search; all plain HTML', async () => {
  const s = await boot();
  try {
    const A = (await s.signup('alice')).token;
    await s.api('POST', '/api/networks', { name: 'Page <b>Test</b>', asn: '64603', home: 'fra' }, A);
    await s.api('POST', '/api/networks/64603/cmd', { act: 'launchBB', args: { city: 'fra' } }, A);
    await s.api('POST', '/api/networks/64603/cmd', { act: 'buyTransit', args: { city: 'fra', net: 'cog', tier: 1 } }, A);
    const get = async (p) => { const r = await fetch(s.base + p, { redirect: 'manual' }); return { s: r.status, t: await r.text(), h: r.headers }; };
    const pg = await get('/as/64603');
    assert.equal(pg.s, 200);
    assert.match(pg.t, /AS64603/); assert.match(pg.t, /Cogent/); assert.match(pg.t, /AS174/); assert.match(pg.t, /Upstreams/); assert.match(pg.t, /100\.\d+\.\d+\.0\/22/);
    assert.ok(!pg.t.includes('<b>Test</b>'), 'names are escaped');
    assert.ok(!/<script/i.test(pg.t), 'no JavaScript at all');
    assert.match(pg.t, /work of fiction|Fiction/);
    const real = await get('/as/3356');
    assert.equal(real.s, 200); assert.match(real.t, /Lumen/); assert.match(real.t, /Player networks using it/);
    const cg = await get('/as/174');
    assert.match(cg.t, /Page bTest\/b/, 'Cogent shows the player who buys transit from it (markup characters are stripped from names)');
    assert.equal((await get('/as/65000')).s, 404);
    const sr = await get('/search?q=64603'); assert.equal(sr.s, 303);
    const sn = await get('/search?q=cloudf'); assert.match(sn.t, /AS13335/);
    const all = await get('/search'); assert.equal(all.s, 200); assert.match(all.t, /Player networks/); assert.match(all.t, /64603/);
    assert.equal((await get('/lite')).s, 404, 'the old lite pages are gone');
    assert.equal(pg.h.get('x-frame-options'), 'DENY');
  } finally { await s.close(); }
});

test('static files: the game, compressed, and nothing outside the site folder', async () => {
  const s = await boot();
  try {
    const r = await fetch(s.base + '/', { headers: { 'Accept-Encoding': 'br' } });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-encoding'), 'br');
    assert.ok(+r.headers.get('content-length') < 400000, 'brotli makes the page a third of its size');
    const plain = await (await fetch(s.base + '/', { headers: { 'Accept-Encoding': 'identity' } })).text();
    assert.ok(plain.includes('Series of Tubes') && !plain.includes('__VERSION__'), 'version placeholders are filled in');
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/server/app.js']) assert.equal((await fetch(s.base + p)).status, 404, p);
  } finally { await s.close(); }
});

test('server health and CORS', async () => {
  const s = await boot({ allowOrigin: 'https://seriesoftub.es' });
  try {
    const h = await s.api('GET', '/api/health');
    assert.equal(h.b.ok, true); assert.ok(h.b.cities > 4000);
    const ok = await fetch(s.base + '/api/health', { headers: { Origin: 'https://seriesoftub.es' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://seriesoftub.es');
    const no = await fetch(s.base + '/api/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
  } finally { await s.close(); }
});
