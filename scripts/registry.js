#!/usr/bin/env node
// The federation server registry (docs/FEDERATION-PROTOCOL.md section 11) at build time, in Node, so that
// `npm run build` never needs Go. The relay (`relay check-registry`, `relay build-servers-json`) is the reference;
// CI builds servers.json with both and compares the bytes (ci.yml, job "relay").
//
//   node scripts/registry.js build <dir> <out>        write servers.json from the folder (11.3)
//   node scripts/registry.js check <file>...          steps 1 to 8 of 11.2, offline (the live challenge is the relay's)
//   node scripts/registry.js stamp <dir> --day <s> --answered <id>...
//                                                      the weekly liveness job: stamp listed/answered, drop the silent
//   node scripts/registry.js unpack <vector.json> <dir>  write a registry vector's files into a folder (for CI)
//
// servers.json is canon(value) (spec 2.3) and one newline: the spec fixes its value, this fixes its bytes, and
// `relay build-servers-json` writes the same. Nothing here reaches the page players load.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DAY = 86400, FILE_MAX = 65536, CHAIN_MAX = 64, EARLIEST = 1735689600, SKEW = 600, SILENT = 14 * DAY;
const LIMIT = { genesis: 2048, operators: 8192, server: 16384 };

class Fault extends Error { constructor(code, step, detail) { super(detail ? `${code}: ${detail}` : code); this.code = code; this.step = step; } }
const fail = (code, detail) => { throw new Fault(code, 0, detail); };

// ---------- canonical JSON (2.3) ----------
function canon(v) {
  if (typeof v === 'string') return '"' + v.replace(/[\\"]/g, (c) => '\\' + c) + '"';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => canon(k) + ':' + canon(v[k])).join(',') + '}';
}
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest();
const b64 = (b) => Buffer.from(b).toString('base64url');
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- values a record may hold (2.1, 2.2) ----------
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function values(v, depth) {
  if (v === null) fail('bad_value');
  if (typeof v === 'number') { if (!Number.isSafeInteger(v) || Object.is(v, -0)) fail('bad_number'); return; }
  if (typeof v === 'string') { if (!v.isWellFormed() || /[\u0000-\u001f]/.test(v)) fail('bad_string'); return; }
  if (typeof v === 'boolean') return;
  if (depth > 8) fail('too_deep');
  if (Array.isArray(v)) { for (const x of v) values(x, depth + 1); return; }
  for (const [k, x] of Object.entries(v)) { if (!/^[A-Za-z0-9_]{1,32}$/.test(k)) fail('bad_name'); values(x, depth + 1); }
}

// ---------- field types (3.1, 5) ----------
const b64ok = (s, n) => typeof s === 'string' && s.length === Math.ceil(n * 4 / 3) && /^[A-Za-z0-9_-]*$/.test(s) && b64(Buffer.from(s, 'base64url')) === s;
const isKey = (s) => b64ok(s, 32), isSig = (s) => b64ok(s, 64), isId = (s) => b64ok(s, 32);
const BIDI = /[‪-‮⁦-⁩]/;
const points = (s) => [...s].length;
const isName = (s) => typeof s === 'string' && points(s) >= 1 && points(s) <= 40 && !/^ +$/.test(s) && !BIDI.test(s);
const isText = (s, n) => typeof s === 'string' && points(s) <= n && !BIDI.test(s);
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const URL_RE = new RegExp(`^wss://(${LABEL}(?:\\.${LABEL})+|[0-9.]+|\\[[0-9a-f:]+\\])(?::([1-9][0-9]{0,4}))?(?:/[A-Za-z0-9._~/-]*)?$`);
// A local address a Url may name (5): private or link-local IPv4, loopback, IPv6 ULA; one spelling each.
function localV4(h) {
  const p = h.split('.');
  if (p.length !== 4 || !p.every((x) => /^(0|[1-9][0-9]{0,2})$/.test(x) && +x <= 255)) return false;
  const [a, b] = p.map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
function localV6(h) {
  const halves = h.split('::');
  if (halves.length > 2) return false;
  const part = (s) => (s === '' ? [] : s.split(':'));
  const head = part(halves[0]), tail = halves.length === 2 ? part(halves[1]) : [];
  if (![...head, ...tail].every((g) => /^[0-9a-f]{1,4}$/.test(g))) return false;
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return false;
  const g = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail].map((x) => parseInt(x, 16));
  // RFC 5952: no leading zeros, the longest run (2 or more, the first on a tie) of zero groups as ::.
  let at = -1, len = 0;
  for (let i = 0; i < 8; i++) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > len && j - i >= 2) { at = i; len = j - i; } if (j > i) i = j - 1; }
  const hex = g.map((x) => x.toString(16));
  const text = at < 0 ? hex.join(':') : `${hex.slice(0, at).join(':')}::${hex.slice(at + len).join(':')}`;
  if (text !== h) return false;
  return (g[0] & 0xfe00) === 0xfc00 || h === '::1';
}
function isUrl(s) {
  if (typeof s !== 'string' || !/^[\x20-\x7e]*$/.test(s) || s.length > 200) return false;
  const m = URL_RE.exec(s);
  if (!m || (m[2] !== undefined && +m[2] > 65535)) return false;
  const h = m[1];
  if (h[0] === '[') return localV6(h.slice(1, -1));
  if (/^[0-9.]+$/.test(h)) return localV4(h);
  return true;
}
// The registry lists servers the internet can reach: a host name, not an address or an mDNS (.local) name (11.2).
const isPublicUrl = (s) => isUrl(s) && !/^wss:\/\/(\[|[0-9.]+(?:[:/]|$))/.test(s) && !/^wss:\/\/[^/:]+\.local(?:[:/]|$)/.test(s);
// Exactly these members: missing first (in table order), then unknown.
function shape(o, fields, optional = []) {
  if (!isObj(o)) fail('bad_field');
  for (const f of fields) if (!(f in o) && !optional.includes(f)) fail('missing_field', f);
  for (const f of Object.keys(o)) if (!fields.includes(f)) fail('unknown_field', f);
}
// A sorted set of strings: duplicate for a repeat, bad_field out of order.
function sortedSet(list, ok, max, min = 0) {
  if (!Array.isArray(list)) fail('bad_field');
  if (list.length > max) fail('too_many');
  if (list.length < min) fail('bad_field');
  list.forEach((x, i) => { if (!ok(x)) fail('bad_field'); if (i && x === list[i - 1]) fail('duplicate'); if (i && x < list[i - 1]) fail('bad_field'); });
}
function node(n) { shape(n, ['key', 'url']); if (!isKey(n.key)) fail('bad_key'); if (!isUrl(n.url)) fail('bad_field', 'url'); }

const BODY = {
  genesis(b) {
    shape(b, ['name', 'node']);
    if (!isName(b.name)) fail('bad_field', 'name');
    node(b.node);
  },
  operators(b) {
    shape(b, ['server', 'prev', 'action', 'target', 'url'], ['url']);
    if (!isId(b.server)) fail('bad_field', 'server');
    if (!isId(b.prev)) fail('bad_field', 'prev');
    if (!['add_operator', 'remove_operator', 'set_node', 'remove_node'].includes(b.action)) fail('bad_field', 'action');
    if (!isKey(b.target)) fail('bad_key', 'target');
    if (b.action === 'set_node' ? !('url' in b) : 'url' in b) fail(b.action === 'set_node' ? 'missing_field' : 'bad_field', 'url');
    if ('url' in b && !isUrl(b.url)) fail('bad_field', 'url');
  },
  server(b) {
    shape(b, ['server', 'head', 'name', 'nodes', 'operators', 'sync', 'noLogs', 'langs', 'desc']);
    if (!isId(b.server)) fail('bad_field', 'server');
    if (!isId(b.head)) fail('bad_field', 'head');
    if (!isName(b.name)) fail('bad_field', 'name');
    if (!Array.isArray(b.nodes)) fail('bad_field', 'nodes');
    if (b.nodes.length > 16) fail('too_many', 'nodes');
    if (!b.nodes.length) fail('bad_field', 'nodes');
    b.nodes.forEach((n, i) => { node(n); if (i && n.key === b.nodes[i - 1].key) fail('duplicate', 'nodes'); if (i && n.key < b.nodes[i - 1].key) fail('bad_field', 'nodes'); });
    sortedSet(b.operators, isKey, 16, 1);
    if (!['standalone', 'selective', 'open'].includes(b.sync)) fail('bad_field', 'sync');
    if (typeof b.noLogs !== 'boolean') fail('bad_field', 'noLogs');
    if (!Array.isArray(b.langs)) fail('bad_field', 'langs');
    if (b.langs.length > 8) fail('too_many', 'langs');
    b.langs.forEach((l, i) => { if (typeof l !== 'string' || !/^[a-z]{2}$/.test(l)) fail('bad_field', 'langs'); if (b.langs.indexOf(l) !== i) fail('duplicate', 'langs'); });
    if (!isText(b.desc, 280)) fail('bad_field', 'desc');
  },
};

function verify(key, text, sig) {
  try {
    const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key, 'base64url')]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(text, 'utf8'), pub, Buffer.from(sig, 'base64url'));
  } catch { return false; }
}

// 7.1 steps 3 to 8 for one record of the kind expected here; returns its id.
function record(r, kind, now) {
  values(r, 1);
  if (!isObj(r)) fail('bad_field');
  if (!('v' in r)) fail('missing_field', 'v');
  if (r.v !== 1) fail('bad_version');
  if (!('kind' in r)) fail('missing_field', 'kind');
  if (r.kind !== kind) fail('bad_kind', `${r.kind} where ${kind} belongs`);
  const multi = kind !== 'genesis', fields = ['v', 'kind', 'key', 't', 'body', multi ? 'sigs' : 'sig'];
  shape(r, fields);
  if (!isKey(r.key)) fail('bad_key');
  if (!Number.isSafeInteger(r.t)) fail('bad_field', 't');
  if (!isObj(r.body)) fail('bad_field', 'body');
  if (multi) {
    if (!Array.isArray(r.sigs)) fail('bad_field', 'sigs');
    if (r.sigs.length > 16) fail('too_many', 'sigs');
    if (!r.sigs.length) fail('bad_field', 'sigs');
    r.sigs.forEach((s, i) => {
      shape(s, ['key', 'sig']);
      if (!isKey(s.key)) fail('bad_key');
      if (!isSig(s.sig)) fail('bad_sig');
      if (i && s.key === r.sigs[i - 1].key) fail('duplicate', 'sigs');
      if (i && s.key < r.sigs[i - 1].key) fail('bad_field', 'sigs');
    });
  } else if (!isSig(r.sig)) fail('bad_sig');
  if (bytes(canon(r)) > LIMIT[kind]) fail('too_big');
  BODY[kind](r.body);
  const { sig, sigs, ...unsigned } = r, text = canon(unsigned);
  if (multi) {
    for (const s of r.sigs) if (!verify(s.key, text, s.sig)) fail('bad_sig');
    if (!r.sigs.some((s) => s.key === r.key)) fail('bad_field', 'author is not among sigs');
  } else if (!verify(r.key, text, r.sig)) fail('bad_sig');
  if (r.t < EARLIEST) fail('too_old');
  if (r.t > now + SKEW) fail('too_new');
  return b64(sha(multi ? text : canon(r)));
}

// 8.1, one applied proposal: the next state, or the reason it cannot be one.
const majority = (signers, ops) => signers.filter((k) => ops.includes(k)).length * 2 > ops.length;
function apply(st, p) {
  const { action, target, url } = p.body, ops = st.operators, nodes = st.nodes;
  if (!ops.includes(p.key)) fail('bad_chain', 'proposed by a key that is not an operator');
  let next;
  if (action === 'add_operator' && !ops.includes(target) && ops.length < 16) next = { operators: [...ops, target].sort(byStr), nodes };
  else if (action === 'remove_operator' && ops.includes(target) && ops.length >= 2) next = { operators: ops.filter((k) => k !== target), nodes };
  else if (action === 'set_node' && (nodes.some((n) => n.key === target) || nodes.length < 16)) next = { operators: ops, nodes: [...nodes.filter((n) => n.key !== target), { key: target, url }].sort((a, b) => byStr(a.key, b.key)) };
  else if (action === 'remove_node' && nodes.some((n) => n.key === target) && nodes.length >= 2) next = { operators: ops, nodes: nodes.filter((n) => n.key !== target) };
  else fail('bad_chain', `${action} cannot apply`);
  if (!majority(p.sigs.map((s) => s.key), ops)) fail('no_majority', 'a proposal in the chain');
  return next;
}

const STEP = (n, fn) => { try { return fn(); } catch (e) { if (e instanceof Fault) e.step = n; throw e; } };
const lowerName = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

// Parse a registry file's text: step 1. Returns the file object.
function parseFile(buf) {
  return STEP(1, () => {
    if (buf.length > FILE_MAX) fail('too_big');
    let f;
    try { f = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf)); } catch { fail('bad_json'); }
    shape(f, ['v', 'genesis', 'chain', 'server', 'listed', 'answered'], ['listed', 'answered']);
    if (f.v !== 1) fail('bad_field', 'v');
    if (!Array.isArray(f.chain) || f.chain.length > CHAIN_MAX) fail('bad_field', 'chain');
    for (const k of ['listed', 'answered']) if (k in f && !(Number.isSafeInteger(f[k]) && f[k] >= 0 && f[k] % DAY === 0)) fail('bad_field', k);
    return f;
  });
}

// Steps 2 to 8 of 11.2 for a parsed file. names: lowered server names of the other files; base: the file on the
// base branch (parsed) or undefined.
function checkFile(name, f, { now, names = [], base } = {}) {
  const gid = STEP(2, () => {
    const g = record(f.genesis, 'genesis', now);
    f.chain.forEach((p) => record(p, 'operators', now));
    record(f.server, 'server', now);
    return g;
  });
  STEP(3, () => { if (name !== `${gid}.json`) fail('id_mismatch', `the genesis id is ${gid}`); });
  const heads = new Map();
  let st = { operators: [f.genesis.key], nodes: [f.genesis.body.node], head: gid };
  heads.set(gid, st);
  STEP(4, () => f.chain.forEach((p, i) => {
    if (p.body.server !== gid || p.body.prev !== st.head) fail('bad_chain', `chain[${i}] does not follow the one before`);
    st = { ...apply(st, p), head: b64(sha(canon((({ sigs, ...x }) => x)(p)))) };
    heads.set(st.head, st);
  }));
  STEP(5, () => {
    const b = f.server.body;
    if (b.server !== gid || b.head !== st.head) fail('bad_chain', 'the server record is not at the last head');
    if (canon(b.operators) !== canon(st.operators) || canon(b.nodes) !== canon(st.nodes)) fail('bad_chain', 'lists differ from the chain');
    if (!majority(f.server.sigs.map((s) => s.key), st.operators)) fail('no_majority', 'the server record');
  });
  STEP(6, () => {
    if (f.server.body.noLogs !== true) fail('no_logs');
    const urls = [f.genesis.body.node.url, ...f.chain.filter((p) => 'url' in p.body).map((p) => p.body.url), ...f.server.body.nodes.map((n) => n.url)];
    const u = urls.find((x) => !isPublicUrl(x));
    if (u) fail('local_url', u);
  });
  STEP(7, () => { if (names.includes(lowerName(f.server.body.name))) fail('name_taken', f.server.body.name); });
  STEP(8, () => { if (base) for (const k of ['listed', 'answered']) if (base[k] !== f[k]) fail('bad_field', `${k} is written by the weekly job only`); });
  return gid;
}

// A folder (or {name: Buffer}) in, the check result per file out: {name, file, id} or {name, error}.
function checkFolder(files, { now = Math.floor(Date.now() / 1000), base = {} } = {}) {
  const parsed = Object.entries(files).map(([name, buf]) => { try { return { name, file: parseFile(buf) }; } catch (e) { return { name, error: e }; } });
  const nameOf = (p) => (p.file && isObj(p.file.server) && isObj(p.file.server.body) && typeof p.file.server.body.name === 'string' ? lowerName(p.file.server.body.name) : null);
  return parsed.map((p) => {
    if (p.error) return p;
    const names = parsed.filter((o) => o !== p).map(nameOf).filter((n) => n !== null);
    try { return { ...p, id: checkFile(p.name, p.file, { now, names, base: base[p.name] }) }; } catch (e) { if (!(e instanceof Fault)) throw e; return { name: p.name, error: e }; }
  });
}

function readFolder(dir) {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => [n, fs.readFileSync(path.join(dir, n))]));
}

// 11.3: the value of servers.json from checked files.
function serversJson(results) {
  const ok = results.filter((r) => r.id).sort((a, b) => byStr(a.id, b.id));
  const servers = ok.map(({ id, file: { v, ...rest } }) => ({ id, ...rest }));
  return { v: 1, asOf: Math.max(0, ...servers.map((s) => s.answered || 0)), servers };
}
const serversText = (value) => canon(value) + '\n';

function build(dir, out, opts) {
  const results = checkFolder(readFolder(dir), opts);
  for (const r of results) if (r.error) console.warn(`registry: ${path.join(dir, r.name)}: step ${r.error.step}: ${r.error.message} (left out of servers.json)`);
  const value = serversJson(results);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serversText(value));
  return value;
}

// The weekly job (federation-liveness.yml): `answered` ids answered the live challenge today. Sets `listed` where
// missing, `answered` for those that answered, and deletes files silent for 14 days (by `answered`, or by `listed`
// when a file never answered). The files themselves are the state (spec 11.1), so no other state is kept.
function stamp(dir, day, answered) {
  const report = { stamped: [], listed: [], removed: [], silent: [] };
  for (const name of Object.keys(readFolder(dir))) {
    const p = path.join(dir, name), id = name.slice(0, -5), f = JSON.parse(fs.readFileSync(p, 'utf8'));
    const was = JSON.stringify(f);
    if (!('listed' in f)) { f.listed = day; report.listed.push(id); }
    if (answered.includes(id)) { f.answered = day; report.stamped.push(id); }
    else {
      const last = f.answered ?? f.listed;
      if (day - last >= SILENT) { fs.rmSync(p); report.removed.push(id); continue; }
      report.silent.push(id);
    }
    if (JSON.stringify(f) !== was) fs.writeFileSync(p, JSON.stringify(f, null, 2) + '\n');
  }
  return report;
}

module.exports = { isUrl, isPublicUrl, canon, checkFolder, checkFile, parseFile, serversJson, serversText, build, stamp, readFolder, Fault };

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  const usage = () => { console.error('usage: registry.js build <dir> <out> | check <file>... | stamp <dir> --day <s> --answered <id>... | unpack <vector.json> <dir>'); process.exit(2); };
  if (cmd === 'build') {
    if (args.length !== 2) usage();
    const v = build(args[0], args[1]);
    console.log(`servers.json: ${v.servers.length} server(s), asOf ${v.asOf}`);
  } else if (cmd === 'check') {
    if (!args.length) usage();
    let bad = 0;
    for (const f of args) {
      const dir = path.dirname(f), name = path.basename(f), files = readFolder(dir);
      files[name] = fs.readFileSync(f);
      const r = checkFolder(files).find((x) => x.name === name);
      if (r.error) { bad++; console.log(`${f}: step ${r.error.step}: ${r.error.message}`); } else console.log(`${f}: ok (steps 1 to 7; step 8 and the live challenge are the relay's)`);
    }
    process.exit(bad ? 1 : 0);
  } else if (cmd === 'stamp') {
    const dir = args[0], i = args.indexOf('--day'), j = args.indexOf('--answered');
    const day = +args[i + 1];
    if (!dir || i < 0 || !Number.isSafeInteger(day) || day % DAY) usage();
    const answered = j < 0 ? [] : args.slice(j + 1).filter((a) => !a.startsWith('--'));
    console.log(JSON.stringify(stamp(dir, day, answered), null, 2));
  } else if (cmd === 'unpack') {
    if (args.length !== 2) usage();
    const v = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    fs.mkdirSync(args[1], { recursive: true });
    for (const [n, f] of Object.entries(v.input.files)) fs.writeFileSync(path.join(args[1], n), 'text' in f ? f.text : JSON.stringify(f, null, 2) + '\n');
  } else usage();
}
