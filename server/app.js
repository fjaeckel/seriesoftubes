// The whole server: static game files, the JSON API the game client talks to, the realtime stream,
// and the plain-HTML AS pages (/as/<asn>, /search) that need no client-side JavaScript.
'use strict';
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store');
const auth = require('./auth');
const { GameHost } = require('./rooms');
const { World } = require('./world');
const H = require('./http');
const P = require('./pages');

const PKG = require('../package.json');
const MAX_PER_USER = 5;

function createApp(opts = {}) {
  const cfg = {
    dataDir: opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
    siteDir: opts.siteDir || process.env.SITE_DIR || path.join(__dirname, '..', 'site'),
    allowOrigin: opts.allowOrigin !== undefined ? opts.allowOrigin : (process.env.ALLOW_ORIGIN || ''),
    registration: opts.registration || process.env.REGISTRATION || 'open',      // open | closed
    serverCode: opts.serverCode !== undefined ? opts.serverCode : (process.env.SERVER_CODE || ''), // required to sign up when set
    trustProxy: opts.trustProxy !== undefined ? opts.trustProxy : process.env.TRUST_PROXY === '1',
    maxGames: +(opts.maxGames || process.env.MAX_GAMES || 25),
    maxNets: +(opts.maxNets || process.env.MAX_NETWORKS || 500),
    idlePause: opts.idlePause !== undefined ? opts.idlePause : process.env.IDLE_PAUSE !== '0',
  };
  const store = new Store(cfg.dataDir);
  const world = new World();
  const host = new GameHost({ store, maxGames: cfg.maxGames, idlePause: cfg.idlePause });
  const limiter = new auth.Limiter();
  const version = PKG.version;
  const date = new Date().toISOString().slice(0, 10);

  const files = H.staticFiles(cfg.siteDir, (name, buf) => {
    if (!/^(index\.html|sitemap\.xml|llms\.txt)$/.test(name)) return buf;
    return Buffer.from(buf.toString('utf8').replace(/__VERSION__/g, version).replace(/__BUILD_DATE__/g, date));
  });

  /* ---------- helpers ---------- */
  const ipOf = (req) => (cfg.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';
  const publicUser = (u) => ({ id: u.id, name: u.name });
  function sessionOf(req) {
    const h = req.headers.authorization;
    const tok = h && /^Bearer /i.test(h) ? h.slice(7).trim() : null;
    if (!tok) return null;
    const s = store.sessions.get(auth.tokenHash(tok));
    if (!s || s.exp < Date.now()) return null;
    const user = store.users.get(s.uid);
    return user ? { user, token: tok } : null;
  }
  function login(res, user, extra = {}) {
    const token = auth.newToken();
    store.sessions.set(auth.tokenHash(token), { uid: user.id, exp: Date.now() + 30 * 864e5 });
    store.save();
    return { token };
  }
  const roleOf = (net, user) => (user && net.members[user.id]) || null;
  const needNet = (asn) => { const n = store.nets.get(Number(asn)); if (!n) throw new H.HttpError(404, 'No network with that AS number'); return n; };
  const cleanName = (s, max = 24) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
  const netMeta = (n) => ({ asn: n.asn, name: n.name, tier: (n.summary || {}).tier || 'Tier 3', day: (n.summary || {}).day || 0, reach: (n.summary || {}).reach, pops: (n.summary || {}).pops || 1, online: host.online(n.asn), members: Object.keys(n.members).length, created: n.created });
  const directory = () => [...store.nets.values()].map(netMeta).sort((a, b) => b.online - a.online || a.asn - b.asn);
  const memberList = (n) => Object.entries(n.members).map(([uid, role]) => ({ id: uid, name: (store.users.get(uid) || {}).name || '?', role }));

  async function register(ip, body) {
    if (cfg.registration === 'closed') throw new H.HttpError(403, 'Sign-ups are closed on this server.');
    if (!limiter.allow('reg:' + ip, 5, 3600e3)) throw new H.HttpError(429, 'Too many sign-ups from here. Try again later.');
    if (cfg.serverCode && String(body.code || '') !== cfg.serverCode) throw new H.HttpError(403, 'This server needs its invite code to sign up.');
    const name = String(body.name || '').trim();
    if (!auth.validUsername(name.toLowerCase())) throw new H.HttpError(400, 'Usernames are 3 to 20 letters, digits, - or _, and start with a letter or digit.');
    if (!auth.validPassword(body.password)) throw new H.HttpError(400, 'Passwords need at least 8 characters.');
    if (store.unames.has(name.toLowerCase())) throw new H.HttpError(409, 'That username is taken.');
    const user = { id: auth.id(), name, uname: name.toLowerCase(), pw: await auth.hashPassword(body.password), created: Date.now() };
    store.users.set(user.id, user); store.unames.set(user.uname, user.id); store.save();
    return user;
  }
  async function authenticate(ip, body) {
    if (!limiter.allow('login:' + ip, 10, 60e3)) throw new H.HttpError(429, 'Too many attempts. Wait a minute.');
    const uname = String(body.name || '').trim().toLowerCase();
    if (!limiter.allow('loginu:' + uname, 10, 5 * 60e3)) throw new H.HttpError(429, 'Too many attempts for that account. Wait a few minutes.');
    const u = store.users.get(store.unames.get(uname));
    const ok = await auth.verifyPassword(String(body.password || ''), u && u.pw);
    if (!u || !ok) throw new H.HttpError(401, 'Wrong username or password.');
    return u;
  }
  function createNetwork(user, body) {
    const name = cleanName(body.name);
    if (!name) throw new H.HttpError(400, 'Give the network a name.');
    const chk = world.asnCheck(body.asn);
    if (chk.err) throw new H.HttpError(400, chk.err);
    const asn = chk.n;
    if (store.nets.has(asn)) throw new H.HttpError(409, `AS${asn} is already taken by ${store.nets.get(asn).name}.`);
    if (!world.city(body.home)) throw new H.HttpError(400, 'Pick a home city from the list.');
    if (store.nets.size >= cfg.maxNets) throw new H.HttpError(503, 'This server is full.');
    if (!limiter.allow('mk:' + user.id, 8, 3600e3)) throw new H.HttpError(429, 'You are creating networks too fast.');
    if ([...store.nets.values()].filter((n) => n.owner === user.id).length >= MAX_PER_USER) throw new H.HttpError(400, `You can own up to ${MAX_PER_USER} networks.`);
    const net = { asn, name, owner: user.id, members: { [user.id]: 'owner' }, invite: auth.newCode(12), home: body.home, created: Date.now(), summary: { tier: 'Tier 3', day: 0, pops: 1 } };
    store.nets.set(asn, net);
    try { host.get(asn); } catch (e) { store.nets.delete(asn); throw e; }
    store.save();
    return net;
  }
  /** Run an action for a member and return what the browser (or the HTML form) needs. */
  function command(net, user, role, body) {
    if (role !== 'owner' && role !== 'operator') throw new H.HttpError(403, 'Viewers cannot change the network.');
    if (!limiter.allow('cmd:' + user.id, 30, 5000)) throw new H.HttpError(429, 'Slow down a little.');
    const act = String(body.act || '');
    if (!/^[A-Za-z0-9]{1,40}$/.test(act)) throw new H.HttpError(400, 'Bad action name.');
    const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? body.args : {};
    const ctx = body.ctx && typeof body.ctx === 'object' && !Array.isArray(body.ctx) ? body.ctx : {};
    if (JSON.stringify([args, ctx, body.dom || null]).length > 8000) throw new H.HttpError(413, 'That command is too big.');
    const room = host.get(net.asn);
    return room.exec(user.name, act, args, ctx, body.dom && typeof body.dom === 'object' ? body.dom : null);
  }
  function playerView(asn) {
    const room = host.rooms.get(Number(asn));
    if (room) return JSON.parse(room.view());
    return store.readView(asn);
  }
  function seenBy(netAsn) {
    const out = [];
    for (const n of store.nets.values()) {
      const v = playerView(n.asn); if (!v) continue;
      const rel = [];
      if (v.upstreams.some((u) => u.asn === netAsn)) rel.push('upstream');
      const p = v.peers.find((x) => x.asn === netAsn); if (p) rel.push('peer (' + [...new Set(p.sessions.map((s) => s.kind))].join(', ') + ')');
      if (rel.length) out.push({ asn: n.asn, name: n.name, rel: rel.join(' + ') });
    }
    return out;
  }

  /* ---------- JSON API ---------- */
  async function api(req, res, url, sess) {
    const m = req.method, p = url.pathname, ip = ipOf(req);
    if (!limiter.allow('api:' + ip, 600, 60e3)) throw new H.HttpError(429, 'Too many requests.');
    if (p === '/api/health') return H.json(res, 200, { ok: true, version, players: store.users.size, networks: store.nets.size, running: host.rooms.size, cities: world.cityCount, registration: cfg.registration, needsCode: !!cfg.serverCode });
    if (m === 'POST' && p === '/api/register') {
      const u = await register(ip, await H.readJson(req));
      const s = login(res, u); return H.json(res, 200, { token: s.token, user: publicUser(u) });
    }
    if (m === 'POST' && p === '/api/login') {
      const u = await authenticate(ip, await H.readJson(req));
      const s = login(res, u); return H.json(res, 200, { token: s.token, user: publicUser(u) });
    }
    if (m === 'GET' && p === '/api/networks') return H.json(res, 200, directory());
    if (m === 'GET' && p === '/api/search') {
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 60).toLowerCase();
      if (!q) return H.json(res, 200, { players: [], nets: [] });
      const qa = q.replace(/^as/, '');
      const players = directory().filter((n) => String(n.asn) === qa || n.name.toLowerCase().includes(q)).slice(0, 25);
      return H.json(res, 200, { players, nets: world.netsByName(qa).map((n) => ({ asn: n.asn, name: n.name, type: n.type })) });
    }
    let mm;
    if (m === 'GET' && (mm = p.match(/^\/api\/as\/(\d{1,10})$/))) {
      const asn = +mm[1], net = store.nets.get(asn);
      if (net) { const v = playerView(asn); return H.json(res, v ? 200 : 404, v ? { player: true, meta: netMeta(net), view: v } : { error: 'No data yet' }); }
      const np = world.netPage(asn); if (!np) throw new H.HttpError(404, 'Nobody has that AS number here');
      return H.json(res, 200, { player: false, net: np, seenBy: seenBy(asn) });
    }
    if (!sess) throw new H.HttpError(401, 'Log in first.');
    const user = sess.user;
    if (m === 'POST' && p === '/api/logout') { store.sessions.delete(auth.tokenHash(sess.token)); store.save(); return H.json(res, 200, { ok: true }); }
    if (m === 'GET' && p === '/api/me') {
      const nets = [...store.nets.values()].filter((n) => n.members[user.id]).map((n) => ({ ...netMeta(n), role: n.members[user.id] }));
      return H.json(res, 200, { user: publicUser(user), networks: nets });
    }
    if (m === 'GET' && p === '/api/cities') return H.json(res, 200, world.cityMatches(String(url.searchParams.get('q') || '').slice(0, 40)));
    if (m === 'GET' && (mm = p.match(/^\/api\/cities\/([A-Za-z0-9:_-]{1,40})$/))) { const c = world.city(mm[1]); if (!c) throw new H.HttpError(404, 'No such city'); return H.json(res, 200, { ...c, card: world.cityCard(mm[1]) }); }
    if (m === 'GET' && p === '/api/asn') { const r = world.asnCheck(url.searchParams.get('asn')); if (!r.err && store.nets.has(r.n)) r.err = `AS${r.n} is already taken by ${store.nets.get(r.n).name}.`; return H.json(res, 200, r); }
    if (m === 'POST' && p === '/api/networks') {
      const net = createNetwork(user, await H.readJson(req));
      return H.json(res, 200, { ...netMeta(net), role: 'owner', invite: net.invite });
    }
    if (!(mm = p.match(/^\/api\/networks\/(\d{1,10})(?:\/([a-z]+))?$/))) throw new H.HttpError(404, 'Not found');
    const net = needNet(mm[1]), sub = mm[2] || '', role = roleOf(net, user);
    if (m === 'POST' && sub === 'join') {
      if (role) return H.json(res, 200, { ...netMeta(net), role });
      if (!limiter.allow('join:' + user.id, 10, 3600e3)) throw new H.HttpError(429, 'Too many tries.');
      const body = await H.readJson(req);
      if (String(body.invite || '').trim().toLowerCase() !== net.invite) throw new H.HttpError(403, 'That invite code is wrong.');
      net.members[user.id] = 'operator'; store.save();
      return H.json(res, 200, { ...netMeta(net), role: 'operator' });
    }
    if (!role) throw new H.HttpError(403, 'You are not on this team.');
    if (m === 'GET' && sub === '') return H.json(res, 200, { ...netMeta(net), role, members: memberList(net), invite: role === 'owner' ? net.invite : undefined, home: net.home });
    if (m === 'GET' && sub === 'stream') {
      const room = host.get(net.asn);
      if ([...room.clients.values()].filter((c) => c.uid === user.id).length >= 5 || room.clients.size >= 60) throw new H.HttpError(429, 'Too many open connections to this network.');
      res.writeHead(200, { ...H.SEC, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      room.add(res, { uid: user.id, name: user.name, role });
      const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch (_) {} }, 20e3);
      req.on('close', () => { clearInterval(ka); room.remove(res); });
      return;
    }
    if (m === 'POST' && sub === 'cmd') return H.json(res, 200, command(net, user, role, await H.readJson(req, 16 * 1024)));
    if (m === 'POST' && sub === 'chat') {
      if (role === 'viewer') throw new H.HttpError(403, 'Viewers cannot chat.');
      if (!limiter.allow('chat:' + user.id, 10, 10e3)) throw new H.HttpError(429, 'Slow down a little.');
      const text = cleanName((await H.readJson(req, 2048)).text, 300); if (!text) throw new H.HttpError(400, 'Say something first.');
      host.get(net.asn).say(user.name, text); return H.json(res, 200, { ok: true });
    }
    if (role === 'owner') {
      if (m === 'POST' && sub === 'invite') { net.invite = auth.newCode(12); store.save(); return H.json(res, 200, { invite: net.invite }); }
      if (m === 'POST' && sub === 'member') {
        const b = await H.readJson(req), uid = String(b.uid || '');
        if (!net.members[uid] || net.members[uid] === 'owner') throw new H.HttpError(400, 'Pick a member other than the owner.');
        if (b.role === 'remove') delete net.members[uid]; else if (b.role === 'operator' || b.role === 'viewer') net.members[uid] = b.role; else throw new H.HttpError(400, 'Role must be operator, viewer or remove.');
        store.save(); return H.json(res, 200, { members: memberList(net) });
      }
      if (m === 'DELETE' && sub === '') {
        const b = await H.readJson(req).catch(() => ({}));
        if (String(b.confirm || '') !== String(net.asn)) throw new H.HttpError(400, 'Send {"confirm": "<AS number>"} to delete the network.');
        host.drop(net.asn); store.nets.delete(net.asn); store.removeSnap(net.asn); store.save();
        return H.json(res, 200, { ok: true });
      }
    }
    throw new H.HttpError(404, 'Not found');
  }

  /* ---------- plain HTML pages ---------- */
  async function pages(req, res, url) {
    const m = req.method, p = url.pathname;
    const V = { version };
    let mm;
    if ((m === 'GET' || m === 'HEAD') && p === '/search') {
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 60), ql = q.toLowerCase(), qa = ql.replace(/^as/, '');
      const all = directory();
      const players = q ? all.filter((n) => String(n.asn) === qa || n.name.toLowerCase().includes(ql)) : [];
      if (/^\d+$/.test(qa) && (store.nets.has(+qa) || world.byAsn.has(+qa))) return H.redirect(res, '/as/' + +qa);
      return H.html(res, 200, P.searchPage({ q, players, nets: q ? world.netsByName(qa) : [], all, ...V }));
    }
    if ((m === 'GET' || m === 'HEAD') && (mm = p.match(/^\/as\/(?:AS)?(\d{1,10})$/i))) {
      const asn = +mm[1], net = store.nets.get(asn);
      if (net) {
        const v = playerView(asn);
        if (!v) return H.html(res, 200, P.notFoundPage({ what: `AS${asn} (${net.name}) has no data yet. It appears after the network has been started once.`, ...V }));
        return H.html(res, 200, P.playerAsPage({ v, meta: { online: host.online(asn) }, ...V }));
      }
      const np = world.netPage(asn);
      if (np) return H.html(res, 200, P.worldAsPage({ n: np, seenBy: seenBy(asn), ...V }));
      return H.html(res, 404, P.notFoundPage({ what: `Nobody has AS${asn} in this world. It could be yours: start a network and pick it.`, ...V }));
    }
    return false;
  }

  /* ---------- the server ---------- */
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      const o = req.headers.origin;
      if (url.pathname.startsWith('/api/') && o && cfg.allowOrigin && (cfg.allowOrigin === '*' || cfg.allowOrigin.split(',').map((s) => s.trim()).includes(o))) {
        res.setHeader('Access-Control-Allow-Origin', cfg.allowOrigin === '*' ? '*' : o);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, { ...H.SEC }); return res.end(); }
      const sess = sessionOf(req);
      if (url.pathname.startsWith('/api/')) return await api(req, res, url, sess);
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (/^\/(as|search)(\/|$)/.test(url.pathname)) { const done = await pages(req, res, url); if (done !== false) return; }
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && files(req, res, url.pathname)) return;
      H.html(res, 404, P.notFoundPage({ what: 'That page does not exist.', version }));
    } catch (e) {
      if (res.headersSent) { try { res.end(); } catch (_) {} return; }
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      const wantsJson = url.pathname.startsWith('/api/');
      if (wantsJson) H.json(res, status, { error: status >= 500 ? 'Something broke on the server.' : e.message });
      else H.html(res, status, P.notFoundPage({ what: status >= 500 ? 'Something broke on the server.' : e.message, version }));
    }
  });
  server.requestTimeout = 30e3;
  server.headersTimeout = 15e3;

  return {
    server, store, host, world, cfg,
    listen: (port, hostname) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, hostname, () => resolve(server.address())); }),
    close: () => new Promise((resolve) => { host.closeAll(); store.flush(); server.closeAllConnections && server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

module.exports = { createApp };
