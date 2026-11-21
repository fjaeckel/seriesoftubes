#!/usr/bin/env node
// The federation authority file (docs/FEDERATION-PROTOCOL.md 11.5, docs/adr/0006-seriesoftubes-is-the-federation-authority.md):
// federation/bans.json and package.json "relayMin", signed with the authority key into _site/federation/authority.json.
//
//   node scripts/authority.js --check       check federation/bans.json, relayMin and that the pinned keys agree
//   node scripts/authority.js --keygen      make a new authority key: pins its public key everywhere, writes the
//                                           private seed to authority.key (never committed) for `gh secret set`
//   (the build calls build(out) itself; it signs only when AUTHORITY_KEY is set, as in the release workflow)
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { canon } = require('./registry');

const ROOT = path.join(__dirname, '..');
const KEYS = path.join(ROOT, 'federation', 'authority-keys.json');
const RELAY_KEYS = path.join(ROOT, 'relay', 'internal', 'authority', 'keys.json');
const GAME = path.join(ROOT, 'src', 'game', '60-features', '83-fed-authority.js');
const BANS = path.join(ROOT, 'federation', 'bans.json');
const REASONS = ['cheating', 'offensive_name', 'spam', 'abuse', 'legal'];
const GRACE = 604800; // relayMin applies 7 days after its release (13.1)
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const B64 = /^[A-Za-z0-9_-]{43}$/;

class Fault extends Error {}
const fail = (msg) => { throw new Fault(msg); };

function pinned() {
  const k = JSON.parse(fs.readFileSync(KEYS, 'utf8'));
  if (!Array.isArray(k) || k.length > 4 || !k.every((x) => typeof x === 'string' && B64.test(x)) || k.some((x, i) => i && !(x > k[i - 1])))
    fail('federation/authority-keys.json must be a sorted list of at most 4 keys');
  const relay = JSON.parse(fs.readFileSync(RELAY_KEYS, 'utf8'));
  if (JSON.stringify(relay) !== JSON.stringify(k)) fail('relay/internal/authority/keys.json differs from federation/authority-keys.json');
  const m = /^const FED_AUTH_KEYS=(\[[^\]]*\]);$/m.exec(fs.readFileSync(GAME, 'utf8'));
  if (!m || JSON.stringify(JSON.parse(m[1])) !== JSON.stringify(k)) fail('FED_AUTH_KEYS in 83-fed-authority.js differs from federation/authority-keys.json');
  return k;
}

// federation/bans.json: {"nets": [{key, reason}], "servers": [{id, reason}]}, each sorted by key or id, one entry per line.
function bans() {
  const b = JSON.parse(fs.readFileSync(BANS, 'utf8'));
  if (!b || typeof b !== 'object' || Object.keys(b).sort().join() !== 'nets,servers') fail('federation/bans.json must have exactly nets and servers');
  const list = (l, f, max) => {
    if (!Array.isArray(l) || l.length > max) fail(`federation/bans.json ${f === 'key' ? 'nets' : 'servers'}: a list of at most ${max}`);
    l.forEach((x, i) => {
      if (!x || Object.keys(x).sort().join() !== [f, 'reason'].sort().join()) fail(`federation/bans.json: entry ${i} must have exactly ${f} and reason`);
      if (typeof x[f] !== 'string' || !B64.test(x[f])) fail(`federation/bans.json: ${x[f]} is not a ${f === 'key' ? 'network key' : 'server identity'}`);
      if (!REASONS.includes(x.reason)) fail(`federation/bans.json: reason '${x.reason}' is not one of ${REASONS.join(', ')}`);
      if (i && !(x[f] > l[i - 1][f])) fail(`federation/bans.json: ${x[f]} is out of order or repeated (sort by ${f})`);
    });
    return l.map((x) => ({ [f]: x[f], reason: x.reason }));
  };
  return { nets: list(b.nets, 'key', 4096), servers: list(b.servers, 'id', 1024) };
}

// relayMin from package.json, and when it applies: its CHANGELOG date at 00:00 UTC plus 7 days. null when unset.
function relayMin(version) {
  const v = require(path.join(ROOT, 'package.json')).relayMin;
  if (v === undefined) return null;
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(v)) fail(`package.json relayMin '${v}' is not a version x.y.z`);
  const n = (s) => s.split('.').map(Number), a = n(v), b = n(version);
  if (a[0] > b[0] || a[0] === b[0] && (a[1] > b[1] || a[1] === b[1] && a[2] > b[2])) fail(`package.json relayMin ${v} is newer than this version ${version}`);
  const m = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').match(new RegExp(`^## \\[${v.replace(/\./g, '\\.')}\\] — (\\d{4}-\\d{2}-\\d{2})`, 'm'));
  if (!m) fail(`package.json relayMin ${v} has no released section in CHANGELOG.md`);
  return { relayMin: v, relayMinFrom: Date.parse(m[1] + 'T00:00:00Z') / 1000 + GRACE };
}

const seedOf = (s) => { const b = Buffer.from(String(s).trim(), 'base64url'); if (b.length !== 32 || b.toString('base64url') !== String(s).trim()) fail('AUTHORITY_KEY is not a 32-byte base64url seed'); return b; };
const privOf = (seed) => crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' });
const pubOf = (priv) => crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12).toString('base64url');

// The signed file for version at now (unix seconds), or null without a key.
function make(version, now, seedText, keys = pinned()) {
  const body = { ...(relayMin(version) || {}), ...bans() };
  if (!seedText) return null;
  const priv = privOf(seedOf(seedText)), key = pubOf(priv);
  if (!keys.includes(key)) fail('AUTHORITY_KEY is not one of the keys in federation/authority-keys.json');
  const env = { v: 1, kind: 'authority', key, t: now, body };
  env.sig = crypto.sign(null, Buffer.from(canon(env), 'utf8'), priv).toString('base64url');
  const text = canon(env);
  if (Buffer.byteLength(text) > 524288) fail('authority.json would be over 524288 bytes');
  return text;
}

// The build: writes out/federation/authority.json when AUTHORITY_KEY is set; otherwise checks the inputs and says so.
function build(out, version, now = Math.floor(Date.now() / 1000)) {
  const text = make(version, now, process.env.AUTHORITY_KEY);
  if (text === null) { console.log('authority.json: not signed (no AUTHORITY_KEY); relays and games keep the one they hold'); return false; }
  fs.writeFileSync(path.join(out, 'federation', 'authority.json'), text + '\n');
  return true;
}

function keygen() {
  const seed = crypto.randomBytes(32), pub = pubOf(privOf(seed)), keys = JSON.parse(fs.readFileSync(KEYS, 'utf8'));
  if (keys.length >= 4) fail('four keys are pinned already: drop the oldest first');
  const next = [...new Set([...keys, pub])].sort();
  const json = JSON.stringify(next) + '\n';
  fs.writeFileSync(KEYS, json);
  fs.writeFileSync(RELAY_KEYS, json);
  const g = fs.readFileSync(GAME, 'utf8');
  fs.writeFileSync(GAME, g.replace(/^const FED_AUTH_KEYS=\[[^\]]*\];$/m, `const FED_AUTH_KEYS=${JSON.stringify(next)};`));
  const file = path.join(ROOT, 'authority.key');
  fs.writeFileSync(file, seed.toString('base64url') + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`New authority key ${pub}, pinned in federation/authority-keys.json, the relay and the game.`);
  console.log(`Its private seed is in authority.key (never commit it). Store it as the release secret, then delete the file:`);
  console.log(`  gh secret set AUTHORITY_KEY --repo fjaeckel/seriesoftubes < authority.key && rm authority.key`);
}

if (require.main === module) {
  try {
    if (process.argv.includes('--keygen')) keygen();
    else if (process.argv.includes('--check')) { pinned(); bans(); relayMin(require(path.join(ROOT, 'package.json')).version); console.log('authority inputs: ok'); }
    else { console.error('usage: node scripts/authority.js --check | --keygen'); process.exit(2); }
  } catch (e) { if (e instanceof Fault) { console.error('error: ' + e.message); process.exit(1); } throw e; }
}

module.exports = { build, make, bans, relayMin, pinned, Fault };
