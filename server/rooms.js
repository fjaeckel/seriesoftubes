// One running game per network. The game is the browser's own code (site/index.html) in jsdom; the server
// ticks it, applies players' commands to it and pushes snapshots to everybody on the team.
'use strict';
const { load } = require('./headless');

const DAY_MS = 2500;      // same as the browser: one in-game day per 2.5 s at 1x
const STEP_MS = 250;
const SEND_EVERY_MS = 900;

class Room {
  constructor(host, net) {
    this.host = host; this.net = net; this.asn = net.asn;
    this.clients = new Map();   // res -> {uid, name, role}
    this.chat = [];
    this.acc = 0; this.speed = 1; this.dirty = false; this.lastSent = 0; this.lastSaved = Date.now(); this.lastTouch = Date.now();
    this.stateJson = ''; this.version = 0; this.viewCache = null; this.viewAt = 0; this.saveDirty = false;
  }
  init() {
    const g = load({ seed: false, url: 'http://localhost/', server: true });
    this.g = g; this.ev = g.ev; this.win = g.dom.window;
    const snap = this.host.store.readSnap(this.asn);
    if (snap) { this.win.__snap = snap; this.ev('serverLoad(__snap)'); }
    else { this.win.__nm = this.net.name; this.ev(`serverBegin(__nm,${JSON.stringify(this.net.home)},${this.asn})`); }
    this.ev('serverDrain()');
    this.refresh(); this.persist();
  }
  refresh() {
    this.stateJson = this.ev('JSON.stringify(serverState())');
    this.speed = this.ev('UI.speed');
    this.version++; this.dirty = true;
  }
  get online() { return new Set([...this.clients.values()].map((c) => c.uid)).size; }
  presence() {
    const by = new Map();
    for (const c of this.clients.values()) by.set(c.uid, { name: c.name, role: c.role });
    return [...by.values()];
  }
  send(res, event, data) { try { res.write(`event: ${event}\ndata: ${data}\n\n`); } catch (_) {} }
  broadcast(event, data) { for (const res of this.clients.keys()) this.send(res, event, data); }
  sendState(res) { this.send(res, 'state', `{"v":${this.version},"d":${this.stateJson}}`); }
  add(res, who) {
    this.clients.set(res, who); this.lastTouch = Date.now();
    this.send(res, 'hello', JSON.stringify({ asn: this.asn, name: this.net.name, role: who.role, you: who.name, chat: this.chat.slice(-30) }));
    this.sendState(res); this.broadcast('presence', JSON.stringify(this.presence()));
  }
  remove(res) { this.clients.delete(res); this.lastTouch = Date.now(); this.broadcast('presence', JSON.stringify(this.presence())); }
  say(who, text) {
    const m = { who, text: String(text).slice(0, 300), t: Date.now() };
    this.chat.push(m); if (this.chat.length > 60) this.chat.shift();
    this.broadcast('chat', JSON.stringify(m));
  }
  /** Run a player's command in the shared game. Returns what the browser needs to update itself. */
  exec(who, act, args, ctx, dom) {
    this.win.__cmd = JSON.stringify({ act, args, ctx, dom });
    const r = JSON.parse(this.ev('(()=>{const c=JSON.parse(__cmd);return JSON.stringify(remoteExec(c.act,c.args,c.ctx,c.dom));})()'));
    this.ev('serverDrain()'); // the actor sees the messages in the reply; the others get a short note below
    if (r.ok) {
      const notes = r.msgs.filter((m) => m[1] !== 'bad').slice(0, 2);
      for (const [h, k] of notes) for (const res of this.clients.keys()) if (this.clients.get(res).name !== who) this.send(res, 'toast', JSON.stringify([`<b>${escapeHtml(who)}</b> · ${h}`, k]));
    }
    this.viewCache = null; this.refresh(); this.saveDirty = true; this.lastTouch = Date.now();
    return r;
  }
  step(dt, now) {
    if (this.clients.size === 0 && this.host.idlePause) return;
    if (this.speed > 0) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= DAY_MS && n < 4) { this.acc -= DAY_MS; this.ev('serverTick()'); n++; }
      if (n) {
        for (const [h, k] of JSON.parse(this.ev('JSON.stringify(serverDrain())'))) this.broadcast('toast', JSON.stringify([h, k]));
        this.refresh(); this.saveDirty = true;
      }
    }
    if (this.dirty && now - this.lastSent >= SEND_EVERY_MS) { this.lastSent = now; this.dirty = false; for (const res of this.clients.keys()) this.sendState(res); }
    if (this.saveDirty && now - this.lastSaved > 60e3) this.persist();
  }
  /** The route viewer's data, a few seconds old at most. */
  view() {
    const now = Date.now();
    if (!this.viewCache || now - this.viewAt > 4000) { this.viewCache = this.ev('JSON.stringify(routeView())'); this.viewAt = now; }
    return this.viewCache;
  }
  summary() {
    return JSON.parse(this.ev('JSON.stringify({tier:tierLabel(),day:S.day,cash:Math.round(S.cash),reach:+(R.reach||0).toFixed(3),pops:Object.keys(S.pops).length,peak:+((S.stats&&S.stats.peak)||0).toFixed(1),lost:!!S.lost,won:!!S.won})'));
  }
  persist() {
    const s = this.summary();
    Object.assign(this.net, { summary: s });
    this.host.store.writeSnap(this.asn, this.ev('JSON.stringify(S)'), this.view());
    this.host.store.save(); this.lastSaved = Date.now(); this.saveDirty = false;
  }
  close() {
    try { this.persist(); } catch (_) {}
    for (const res of this.clients.keys()) { this.send(res, 'bye', '{}'); try { res.end(); } catch (_) {} }
    this.clients.clear();
    try { this.win.close(); } catch (_) {}
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class GameHost {
  constructor({ store, maxGames = 25, idlePause = true, idleUnloadMs = 5 * 60e3 } = {}) {
    this.store = store; this.maxGames = maxGames; this.idlePause = idlePause; this.idleUnloadMs = idleUnloadMs;
    this.rooms = new Map();
    this.last = Date.now();
    this.timer = setInterval(() => this.step(), STEP_MS);
    this.timer.unref && this.timer.unref();
  }
  /** The loaded room for a network, loading it from its save if needed. */
  get(asn) {
    asn = Number(asn);
    let r = this.rooms.get(asn);
    if (r) return r;
    const net = this.store.nets.get(asn);
    if (!net) return null;
    if (this.rooms.size >= this.maxGames) this.evict();
    if (this.rooms.size >= this.maxGames) throw Object.assign(new Error('The server is running as many networks as it can right now. Try again in a few minutes.'), { status: 503 });
    r = new Room(this, net); r.init(); this.rooms.set(asn, r);
    return r;
  }
  evict() {
    const idle = [...this.rooms.values()].filter((r) => r.clients.size === 0).sort((a, b) => a.lastTouch - b.lastTouch)[0];
    if (idle) { idle.close(); this.rooms.delete(idle.asn); }
  }
  step() {
    const now = Date.now(), dt = Math.min(1000, now - this.last); this.last = now;
    for (const r of [...this.rooms.values()]) {
      try { r.step(dt, now); } catch (e) { console.error('room', r.asn, e); }
      if (r.clients.size === 0 && now - r.lastTouch > this.idleUnloadMs) { r.close(); this.rooms.delete(r.asn); }
    }
  }
  drop(asn) { const r = this.rooms.get(Number(asn)); if (r) { r.clients.clear(); try { r.win.close(); } catch (_) {} this.rooms.delete(Number(asn)); } }
  closeAll() { clearInterval(this.timer); for (const r of this.rooms.values()) r.close(); this.rooms.clear(); }
  online(asn) { const r = this.rooms.get(Number(asn)); return r ? r.online : 0; }
}

module.exports = { GameHost, Room, escapeHtml };
