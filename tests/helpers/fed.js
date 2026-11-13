// Multiplayer test kit: keys and records signed in Node (the vectors' way), and a page whose federation runtime runs on
// a virtual clock with fake relay nodes instead of the network. Nothing here touches a real socket.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { load, cryptoBusy } = require('../harness');
const { until } = require('../net');

const b64 = (b) => Buffer.from(b).toString('base64url');
const sha = (x) => crypto.createHash('sha256').update(x).digest();
function canon(v) {
  if (typeof v === 'string') return '"' + v.replace(/[\\"]/g, (c) => '\\' + c) + '"';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => canon(k) + ':' + canon(v[k])).join(',') + '}';
}
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const KEYS = {};
// The vectors' keys: seed = SHA-256("tubes-fed.1 vector key <name>").
function key(name) {
  if (!KEYS[name]) {
    const seed = sha('tubes-fed.1 vector key ' + name);
    const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' });
    KEYS[name] = { seed: b64(seed), priv, pub: b64(crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12)) };
  }
  return KEYS[name];
}
const signText = (k, text) => b64(crypto.sign(null, Buffer.from(text, 'utf8'), k.priv));
function rec(name, kind, t, body) { const k = key(name), r = { v: 1, kind, key: k.pub, t, body }; r.sig = signText(k, canon(r)); return r; }
const rid = (r) => b64(sha(canon(r)));
// Sealed deals (§5.3), the vectors' way: a network's box key from its seed, and records sealed for another network.
const X_PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex');
const hkdf = (ikm, salt, info) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), 32));
function boxKey(name) {
  const k = key(name);
  if (!k.box) {
    const d = hkdf(Buffer.from(k.seed, 'base64url'), Buffer.alloc(0), 'tubes-fed v1 box'); d[0] &= 248; d[31] &= 127; d[31] |= 64;
    const priv = crypto.createPrivateKey({ key: Buffer.concat([X_PKCS8, d]), format: 'der', type: 'pkcs8' });
    k.box = { priv, pub: crypto.createPublicKey(priv).export({ format: 'jwk' }).x };
  }
  return k.box;
}
const box = (name) => boxKey(name).pub;
// A record from name, sealed for the network whose Ed25519 key is peer and whose box is peerBox: clear stays in clear,
// plain is sealed. Defaults: an offer keeps to in clear, a decline offer and to.
function sealRec(name, kind, t, body, peer, peerBox) {
  const keep = kind === 'decline' ? ['offer', 'to'] : ['to'], clear = {}, plain = {};
  for (const [k, v] of Object.entries(body)) (keep.includes(k) ? clear : plain)[k] = v;
  const me = key(name).pub, env = { v: 1, kind, key: me, t, body: clear };
  const shared = crypto.diffieHellman({ privateKey: boxKey(name).priv, publicKey: crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: peerBox }, format: 'jwk' }) });
  const salt = Buffer.concat([me, peer].sort().map((x) => Buffer.from(x, 'base64url')));
  const n = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', hkdf(shared, salt, 'tubes-fed v1 ' + kind), n);
  c.setAAD(Buffer.from(canon(env), 'utf8'));
  const ct = Buffer.concat([c.update(Buffer.from(canon(plain), 'utf8')), c.final(), c.getAuthTag()]);
  return rec(name, kind, t, { ...clear, enc: { n: b64(n), c: b64(ct) } });
}
// Opens a sealed record as the network name, the other party being peer (Ed25519 key) with box peerBox: the plain
// value, or null.
function openRec(name, r, peer, peerBox) {
  try {
    const me = key(name).pub, { sig, ...env } = r, { enc, ...body } = r.body;
    const shared = crypto.diffieHellman({ privateKey: boxKey(name).priv, publicKey: crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: peerBox }, format: 'jwk' }) });
    const salt = Buffer.concat([me, peer].sort().map((x) => Buffer.from(x, 'base64url')));
    const c = Buffer.from(enc.c, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', hkdf(shared, salt, 'tubes-fed v1 ' + r.kind), Buffer.from(enc.n, 'base64url'));
    d.setAAD(Buffer.from(canon({ ...env, body }), 'utf8')); d.setAuthTag(c.subarray(c.length - 16));
    return JSON.parse(Buffer.concat([d.update(c.subarray(0, c.length - 16)), d.final()]).toString('utf8'));
  } catch (e) { return null; }
}
const asn = (pub) => 4200000000 + (sha(Buffer.from(pub, 'base64url')).readUInt32BE(0) % 94967295);
const NOW = 1767312100;
// The registry the build would publish from the vectors' folder: Packet Lunch (two nodes: node1, node2) and Hop Shop.
const SERVERS_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'federation', 'vectors', 'registry', '016-build-servers-json.json'), 'utf8')).expect.servers_json;
const PL = SERVERS_JSON.servers[0], URL1 = 'wss://relay.example.net/fed', URL2 = 'wss://second.example.org:8443/fed';
// Packet Lunch as a registry entry in the cache (kv registry), for tests that write their own registry: its nodes and
// its operators (anna, ben, cleo), so the game checks its node and proves an operator key to it.
const PL_ENTRY = { id: PL.id, name: 'Packet Lunch', nodes: PL.server.body.nodes, operators: PL.server.body.operators, sync: 'open', noLogs: true };

/* A fake relay node. up: answers at all (false: connections fail); mute: takes frames and never answers.
   feed: items its sub sends; ranks: what it answers a rank request (an object merged into the ranks frame, or a
   function (frame, socket) giving one; {m: 'err', code} answers an error); facets and netstats likewise for facets and
   nets; why: what it answers rankwhy ({items, slot} for one recs frame, or a function; none: not_found); asks: the
   rank, rankwhy, facets and nets requests it got; refuse: an error code for every put. Like the relay
   (§9.3), it sends shun votes and players' reports only to a session that proved one of its server's operator keys (ops: by default
   Packet Lunch's, anna, ben and cleo) and only on a sub that asks for them; excl (null: never sent) is the excluded
   list it sends after a session's first sub and on exclude(), with reasons to a session that proved an excluded key; impl:
   what its welcome says it runs; update: an update notice it sends right after an operator key's ack. feats: what its
   welcome lists (default ['state']: it takes live states, which it keeps in states, and ranks the boards of now). */
class Node {
  constructor(net, url, o = {}) { Object.assign(this, { net, url, server: o.server || PL.id, key: key(o.key || 'node1'), up: true, mute: false, feed: [], ranks: null, facets: null, netstats: null, why: null, asks: [], gossip: [], puts: [], refuse: null, socks: new Set(), hellos: 0, feats: o.feats || ['state'], states: [],
    ops: o.ops || ['anna', 'ben', 'cleo'].map((n) => key(n).pub), auths: [], excl: null, reasons: null }); }
  sendExcl(ws) { const m = { m: 'excluded', keys: this.excl, more: false }; if (this.reasons && [...(ws.proved || [])].some((k) => this.excl.includes(k))) m.reasons = this.reasons; this.send(ws, m); }
  exclude(keys, reasons = null) { this.excl = keys; this.reasons = reasons; for (const ws of this.socks) if (ws.exSent) this.sendExcl(ws); }
  send(ws, m) { if (!this.mute) this.net.later(() => ws.onmessage && ws.onmessage({ data: JSON.stringify(m) })); }
  take(ws, text) {
    const f = JSON.parse(text);
    if (this.mute) return;
    if (f.m === 'hello') { this.hellos++; this.send(ws, { m: 'welcome', ver: 1, server: this.server, node: this.key.pub, now: this.net.now(), ...(this.impl ? { impl: this.impl } : {}), ...(this.feats.length ? { feats: this.feats } : {}) }); }
    else if (f.m === 'state') { this.states.push(f.rec); if (f.id) this.send(ws, { m: 'ack', id: f.id, rid: rid(f.rec), dup: false }); }
    else if (f.m === 'challenge') { const p = { v: 1, kind: 'proof', key: this.key.pub, t: this.net.now(), body: { nonce: f.nonce, server: this.server } }; p.sig = signText(this.key, canon(p)); this.send(ws, { m: 'proof', id: f.id, proof: p }); }
    else if (f.m === 'put') { this.puts.push(f.rec); this.send(ws, this.refuse ? { m: 'err', id: f.id, code: this.refuse } : { m: 'ack', id: f.id, rid: rid(f.rec), dup: false }); }
    else if (f.m === 'auth') { this.auths.push(f); (ws.proved || (ws.proved = new Set())).add(f.key); const op = this.ops.includes(f.key); if (op) ws.op = true; this.send(ws, { m: 'ack', id: f.id, op }); if (op && this.update) this.send(ws, { m: 'update', ...this.update }); }
    else if (f.m === 'sub') {
      const vote = (it) => !!it && !!it.rec && ['shun', 'unshun', 'report'].includes(it.rec.kind);
      this.send(ws, { m: 'recs', id: f.id, items: this.feed.filter((it) => !vote(it) || ws.op && f.kinds.includes(it.rec.kind)), cursor: 'c1', more: false });
      if (this.excl && !ws.exSent) { ws.exSent = true; this.sendExcl(ws); }
    }
    else if (f.m === 'rank' || f.m === 'nets' || f.m === 'facets') {
      this.asks.push(f);
      const o = { rank: this.ranks, nets: this.netstats, facets: this.facets }[f.m], a = typeof o === 'function' ? o(f, ws) : o;
      const base = { rank: { m: 'ranks', slot: 0, n: 0, rows: [], me: null }, nets: { m: 'netstats', nets: [], reports: [] }, facets: { m: 'facets', models: [], harnesses: [], from: [], homes: [] } }[f.m];
      this.send(ws, a && a.m === 'err' ? { ...a, id: f.id } : { ...base, ...a, id: f.id });
    }
    else if (f.m === 'rankwhy') {
      this.asks.push(f);
      const w = typeof this.why === 'function' ? this.why(f, ws) : this.why;
      this.send(ws, w ? { m: 'recs', id: f.id, items: [], cursor: '', more: false, ...w } : { m: 'err', id: f.id, code: 'not_found' });
    }
    else if (f.m === 'servers') this.send(ws, { m: 'catalog', id: f.id, entries: this.gossip });
    else if (f.m === 'ping') this.send(ws, { m: 'pong', id: f.id, now: this.net.now() });
  }
  // Every connection drops at once (the server was killed).
  kill() { this.up = false; for (const ws of this.socks) ws.drop(); }
}
class Net {
  constructor() { this.nodes = new Map(); this.opened = []; this.t = 0; this.timers = []; this.seq = 0; this.vis = true; this.t0 = NOW; }
  node(url, o) { const n = new Node(this, url, o); this.nodes.set(url, n); return n; }
  now() { return this.t0 + Math.floor(this.t / 1000); }
  later(f) { setImmediate(f); }
  open(url) {
    const net = this, n = this.nodes.get(url);
    const ws = { url, readyState: 0, closed: false,
      send(t) { if (!ws.closed && n && n.up) n.take(ws, t); },
      close() { ws.closed = true; if (n) n.socks.delete(ws); },
      drop() { if (ws.closed) return; ws.closed = true; if (n) n.socks.delete(ws); net.later(() => ws.onclose && ws.onclose({})); } };
    this.opened.push(url);
    if (n && n.up) { n.socks.add(ws); this.later(() => ws.onopen && ws.onopen({})); } else ws.drop();
    return ws;
  }
  // Virtual timers: FED.set/FED.clear in the page.
  set(f, ms) { const id = ++this.seq; this.timers.push({ id, at: this.t + Math.max(0, ms), f }); return id; }
  clear(id) { this.timers = this.timers.filter((x) => x.id !== id); }
  // Moves the clock on, running every timer due on the way, in order.
  advance(ms) { const end = this.t + ms;
    for (;;) { this.timers.sort((a, b) => a.at - b.at || a.id - b.id); const x = this.timers[0]; if (!x || x.at > end) break; this.timers.shift(); this.t = Math.max(this.t, x.at); x.f(); }
    this.t = end; }
  pending() { return this.timers.map((x) => x.at - this.t).sort((a, b) => a - b); }
}
// Lets promises, WebCrypto and the fake sockets run.
// Then, while any WebCrypto call is still running on Node's thread pool (slow machines), waits for it and lets its result
// run on: turns alone do not see the thread pool. Bounded, so a stuck call still fails the test instead of hanging it.
const settle = async (n = 30) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
  for (let w = 0; cryptoBusy.n > 0 && w < 5000; w++) {
    await new Promise((r) => setTimeout(r, 1));
    if (cryptoBusy.n === 0) for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
  }
};

/* A page with the federation runtime wired to a Net. opts.registry: what the site's servers.json answers (an object,
   or null for a 404); the rest goes to load(). */
function fedPage(opts = {}) {
  const net = opts.net || new Net();
  const page = load({ crypto: true, idb: true, ...opts });
  const w = page.dom.window;
  w.__net = net;
  w.__fetch = async () => (opts.registry ? { ok: true, text: async () => JSON.stringify(opts.registry) } : { ok: false, text: async () => '' });
  page.ev(`FED.WS=u=>__net.open(u);FED.now=()=>__net.now();FED.set=(f,ms)=>__net.set(f,ms);FED.clear=t=>__net.clear(t);
    FED.rand=()=>0.5;FED.visible=()=>__net.vis;FED.fetch=u=>__fetch(u);`);
  return { ...page, net, w };
}
// Starts a normal game and joins it to url; resolves with the join result (null when joined).
async function joinGame(p, url = URL1, start = 'ACT.start({})') {
  p.ev(start);
  const r = await p.ev(`fedJoin(${JSON.stringify(url)})`);
  await settle();
  return r;
}

module.exports = { b64, sha, canon, key, rec, rid, asn, box, sealRec, openRec, NOW, SERVERS_JSON, PL, PL_ENTRY, URL1, URL2, Net, fedPage, joinGame, settle, until, signText };
