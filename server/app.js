// The whole server: static game files, the JSON API the game client talks to, and the realtime stream.
'use strict';
const http = require('node:http');
const { WebSocketServer } = require('ws');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store');
const auth = require('./auth');
const { GameHost } = require('./rooms');
const { World } = require('./world');
const H = require('./http');

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
    return sessionOfToken(h && /^Bearer /i.test(h) ? h.slice(7).trim() : null);
  }
  function sessionOfToken(tok) {
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
  const peeringOf = (n) => {
    const row = (a) => { const o = store.nets.get(a); return o ? { asn: a, name: o.name } : null; };
    return {
      peers: (n.peers || []).map(row).filter(Boolean), incoming: (n.peerIn || []).map(row).filter(Boolean), outgoing: (n.peerOut || []).map(row).filter(Boolean),
      policy: { pol: 'open', min: 0, fee: 0, ...(n.policy || {}) }, ixes: host.exchanges(n.asn),
      sessions: (host.peerMap().get(n.asn) || []),
    };
  };

  const cleanName = (s, max = 24) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
  const netMeta = (n) => ({ asn: n.asn, name: n.name, tier: (n.summary || {}).tier || 'Tier 3', day: (n.summary || {}).day || 0, reach: (n.summary || {}).reach, pops: (n.summary || {}).pops || 1, online: host.online(n.asn), members: Object.keys(n.members).length, created: n.created });
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
    if (!sess) throw new H.HttpError(401, 'Log in first.');
    const user = sess.user;
    let mm;
    if (m === 'POST' && p === '/api/logout') { store.sessions.delete(auth.tokenHash(sess.token)); store.save(); return H.json(res, 200, { ok: true }); }
    if (m === 'GET' && p === '/api/me') {
      const nets = [...store.nets.values()].filter((n) => n.members[user.id]).map((n) => ({ ...netMeta(n), role: n.members[user.id] }));
      return H.json(res, 200, { user: publicUser(user), networks: nets });
    }
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
    // Peering between teams: one network asks another, the other accepts, and both see each other as a peer.
    if (sub === 'peering' && m === 'GET') return H.json(res, 200, peeringOf(net));
    if (m === 'POST' && sub === 'policy') {
      if (role === 'viewer') throw new H.HttpError(403, 'Viewers cannot change the peering policy.');
      const b = await H.readJson(req, 1024), pol = String(b.pol || '');
      if (!['open', 'selective', 'restrictive', 'paid'].includes(pol)) throw new H.HttpError(400, 'Policy must be open, selective, restrictive or paid.');
      const num = (v, max) => { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0; };
      net.policy = { pol, min: num(b.min, 100000), fee: num(b.fee, 1e6) };
      store.save(); host.teamSync();
      return H.json(res, 200, peeringOf(net));
    }
    if (m === 'POST' && (sub === 'peerreq' || sub === 'peeracc' || sub === 'peerdel')) {
      if (role === 'viewer') throw new H.HttpError(403, 'Viewers cannot change peering.');
      if (!limiter.allow('peer:' + user.id, 20, 3600e3)) throw new H.HttpError(429, 'Too many peering changes. Try again later.');
      const asn = Number((await H.readJson(req, 1024)).asn), other = store.nets.get(asn);
      if (!other || asn === net.asn) throw new H.HttpError(404, 'No network with that AS number on this server.');
      net.peers = net.peers || []; net.peerIn = net.peerIn || []; net.peerOut = net.peerOut || [];
      other.peers = other.peers || []; other.peerIn = other.peerIn || []; other.peerOut = other.peerOut || [];
      const pull = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };
      let note = '';
      if (sub === 'peerreq') {
        if (net.peers.includes(asn)) throw new H.HttpError(400, 'You already peer with them.');
        if (net.peerIn.includes(asn)) { pull(net.peerIn, asn); pull(other.peerOut, net.asn); net.peers.push(asn); other.peers.push(net.asn); note = `AS${net.asn} and AS${asn} now peer.`; }
        else if (!net.peerOut.includes(asn)) { net.peerOut.push(asn); other.peerIn.push(net.asn); note = `AS${net.asn} (${net.name}) asked AS${asn} for peering.`; }
      } else if (sub === 'peeracc') {
        if (!net.peerIn.includes(asn)) throw new H.HttpError(400, 'They have not asked you.');
        pull(net.peerIn, asn); pull(other.peerOut, net.asn); net.peers.push(asn); other.peers.push(net.asn); note = `AS${net.asn} and AS${asn} now peer.`;
      } else {
        pull(net.peers, asn); pull(other.peers, net.asn); pull(net.peerIn, asn); pull(other.peerOut, net.asn); pull(net.peerOut, asn); pull(other.peerIn, net.asn);
        note = `AS${net.asn} ended peering with AS${asn}.`;
      }
      store.save();
      host.teamSync();
      for (const n of [net, other]) { const r = host.rooms.get(n.asn); if (r && note) r.say('NOC', note); }
      return H.json(res, 200, peeringOf(net));
    }
    if (m === 'POST' && sub === 'cmd') {
      const r = command(net, user, role, await H.readJson(req, 16 * 1024));
      return H.json(res, 200, { ...r, st: JSON.parse(host.get(net.asn).envelope()) }); // the fresh state rides along, so the page updates at once
    }
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
      if ((req.method === 'GET' || req.method === 'HEAD') && files(req, res, url.pathname)) return;
      H.html(res, 404, '<!doctype html><meta charset="utf-8"><title>Not found</title><p>Not found. <a href="/">Back to the game</a>');
    } catch (e) {
      if (res.headersSent) { try { res.end(); } catch (_) {} return; }
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      const wantsJson = url.pathname.startsWith('/api/');
      if (wantsJson) H.json(res, status, { error: status >= 500 ? 'Something broke on the server.' : e.message });
      else H.html(res, status, '<!doctype html><meta charset="utf-8"><title>Error</title><p>' + String(status >= 500 ? 'Something broke on the server.' : e.message).replace(/[<>&]/g, '') + ' <a href="/">Back to the game</a>');
    }
  });
  /* ---------- WebSocket: commands and state over one open connection ----------
     Frames are `event\njson`, the same events as the SSE stream, plus `ack` for a command. */
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: { threshold: 1024 } });
  const refuse = (socket, code, text) => { try { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch (_) {} socket.destroy(); };
  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://x'), mm = url.pathname.match(/^\/api\/networks\/(\d{1,10})\/ws$/);
      if (!mm) return refuse(socket, 404, 'Not Found');
      const o = req.headers.origin;
      if (o) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        let same = false; try { same = new URL(o).host === host; } catch (_) {}
        const allowed = cfg.allowOrigin && (cfg.allowOrigin === '*' || cfg.allowOrigin.split(',').map((x) => x.trim()).includes(o));
        if (!same && !allowed) return refuse(socket, 403, 'Forbidden');
      }
      if (!limiter.allow('ws:' + ipOf(req), 60, 60e3)) return refuse(socket, 429, 'Too Many Requests');
      wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws, Number(mm[1])));
    } catch (e) { refuse(socket, 400, 'Bad Request'); }
  });
  function onSocket(ws, asn) {
    let client = null, user = null, net = null, room = null, alive = true;
    const out = (event, obj) => { try { if (ws.readyState === 1) ws.send(`${event}\n${typeof obj === 'string' ? obj : JSON.stringify(obj)}`); } catch (_) {} };
    const fail = (status, error) => { out('error', { status, error }); try { ws.close(4000 + (status % 1000)); } catch (_) {} };
    const authT = setTimeout(() => { if (!client) fail(408, 'Say who you are first.'); }, 5000);
    const hb = setInterval(() => { if (!alive) return ws.terminate(); alive = false; try { ws.ping(); } catch (_) {} }, 25e3);
    ws.on('pong', () => { alive = true; });
    ws.on('error', () => {});
    ws.on('close', () => { clearTimeout(authT); clearInterval(hb); if (room && client) room.remove(client); });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
      if (!m || typeof m !== 'object') return;
      try {
        if (!client) {
          if (m.t !== 'auth') return;
          const sess = sessionOfToken(String(m.token || ''));
          if (!sess) return fail(401, 'Log in first.');
          user = sess.user; net = store.nets.get(asn);
          if (!net) return fail(404, 'No network with that AS number');
          const role = roleOf(net, user);
          if (!role) return fail(403, 'You are not on this team.');
          room = host.get(net.asn);
          if ([...room.clients.values()].filter((c) => c.uid === user.id).length >= 5 || room.clients.size >= 60) return fail(429, 'Too many open connections to this network.');
          clearTimeout(authT);
          client = { ws, end() { try { ws.close(); } catch (_) {} } };
          room.add(client, { uid: user.id, name: user.name, role });
          return;
        }
        const role = roleOf(net, user);
        if (!role) return fail(403, 'You are not on this team.');
        if (m.t === 'ping') return out('pong', {});
        if (m.t === 'cmd') {
          let ack;
          try { ack = { id: m.id, ...command(net, user, role, m) }; } catch (e) { ack = { id: m.id, ok: false, msgs: [[e.status ? e.message : 'Something broke on the server.', 'bad']], ui: {} }; if (!e.status) console.error(e); }
          return out('ack', ack);
        }
        if (m.t === 'chat') {
          if (role === 'viewer') return out('toast', ['<b>Viewers cannot chat.</b>', 'bad']);
          if (!limiter.allow('chat:' + user.id, 10, 10e3)) return out('toast', ['<b>Slow down a little.</b>', 'bad']);
          const text = cleanName(m.text, 300); if (text) room.say(user.name, text);
        }
      } catch (e) { if (!e.status) console.error(e); fail(e.status || 500, e.status ? e.message : 'Something broke on the server.'); }
    });
  }
  server.requestTimeout = 30e3;
  server.headersTimeout = 15e3;

  return {
    server, store, host, world, cfg,
    listen: (port, hostname) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, hostname, () => resolve(server.address())); }),
    close: () => new Promise((resolve) => { host.closeAll(); store.flush(); for (const c of wss.clients) c.terminate(); server.closeAllConnections && server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

module.exports = { createApp };
