// Everything the server remembers: accounts, sessions, networks and their saved games.
// Plain JSON files in DATA_DIR, written atomically; fine for a team-sized server, no database to install.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(path.join(dir, 'snap'), { recursive: true });
    this.file = path.join(dir, 'db.json');
    this.users = new Map();     // id -> {id, name, uname, pw, created}
    this.unames = new Map();    // uname -> id
    this.sessions = new Map();  // tokenHash -> {uid, exp}
    this.nets = new Map();      // asn (number) -> network record
    this.timer = null;
    let db = {};
    try { db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const u of db.users || []) { this.users.set(u.id, u); this.unames.set(u.uname, u.id); }
    for (const [h, s] of Object.entries(db.sessions || {})) if (s.exp > Date.now()) this.sessions.set(h, s);
    for (const n of db.nets || []) this.nets.set(n.asn, n);
  }
  toJSON() { return { v: 1, users: [...this.users.values()], sessions: Object.fromEntries(this.sessions), nets: [...this.nets.values()] }; }
  save() { // debounced, atomic
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 400);
    this.timer.unref && this.timer.unref();
  }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.toJSON()), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  snapPath(asn, ext) { return path.join(this.dir, 'snap', `${Number(asn)}.${ext}`); }
  writeSnap(asn, json, view) {
    const w = (ext, data) => { const p = this.snapPath(asn, ext), t = p + '.tmp'; fs.writeFileSync(t, data, { mode: 0o600 }); fs.renameSync(t, p); };
    w('json', json); if (view) w('view', view);
  }
  readSnap(asn) { try { return fs.readFileSync(this.snapPath(asn, 'json'), 'utf8'); } catch (e) { return null; } }
  readView(asn) { try { return JSON.parse(fs.readFileSync(this.snapPath(asn, 'view'), 'utf8')); } catch (e) { return null; } }
  removeSnap(asn) { for (const e of ['json', 'view']) { try { fs.unlinkSync(this.snapPath(asn, e)); } catch (_) {} } }
}

module.exports = { Store };
