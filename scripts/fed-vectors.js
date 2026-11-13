#!/usr/bin/env node
// Regenerates the signed federation test vectors (docs/FEDERATION-PROTOCOL.md, federation/vectors/README.md):
// every vector that needs keys, signatures, hashes or record ids, made from fixed seeds so the files never change
// unless this script does. Ed25519 signatures are deterministic, so two runs write identical bytes.
//
//   node scripts/fed-vectors.js            rewrite the generated areas
//   node scripts/fed-vectors.js --check    exit 1 if any generated file on disk differs (for CI)
//
// Only the areas listed in GEN are written here (each is emptied first, so renamed vectors leave nothing behind).
// The rule and maths areas (canonical, slots, boards, quiet, shun, catalog, deals, majority, sync, wire) are written
// by hand, with the working in each description, so that neither the relay nor the game is the reference by accident.
// The expectations below (ok or which error, which proposal wins, what is pending) are literals chosen by hand; the
// script only fills in the keys, signatures and ids, and asserts where a literal depends on the order of two hashes.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'federation', 'vectors');
const GEN = ['signing', 'asn', 'records', 'receipts', 'proofs', 'auth', 'operators', 'registry', 'dedupe', 'rank', 'box'];
const NOW = 1767312100;          // 2026-01-02 00:01:40 UTC, the "now" of every generated vector
const T = NOW - 100;             // 1767312000, 2026-01-02 00:00:00 UTC: when most records were signed
const DAY = 86400;

// ---------- encoding, canonical JSON, keys, signatures ----------
const b64 = b => Buffer.from(b).toString('base64url');
const sha = x => crypto.createHash('sha256').update(x).digest();
function canon(v) {
  if (typeof v === 'string') return '"' + v.replace(/[\\"]/g, c => '\\' + c) + '"';
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || Object.is(v, -0)) throw new Error('not a canonical integer: ' + v);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => canon(k) + ':' + canon(v[k])).join(',') + '}';
  throw new Error('not a canonical value: ' + v);
}
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex'); // Ed25519 private key prefix, then the 32-byte seed
const KEYS = {};
function K(name) {
  if (!KEYS[name]) {
    const seed = sha('tubes-fed.1 vector key ' + name);
    const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' });
    const pub = b64(crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12));
    KEYS[name] = { seed, priv, pub };
  }
  return KEYS[name];
}
const pub = n => K(n).pub;
const signText = (n, text) => b64(crypto.sign(null, Buffer.from(text, 'utf8'), K(n).priv));
const MULTI = new Set(['operators', 'server']);
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function rec(kind, author, t, body) {
  const r = { v: 1, kind, key: pub(author), t, body };
  r.sig = signText(author, canon(r));
  return r;
}
function multi(kind, author, t, body, signers) {
  const r = { v: 1, kind, key: pub(author), t, body };
  const text = canon(r);
  r.sigs = signers.map(n => ({ key: pub(n), sig: signText(n, text) })).sort((a, b) => byStr(a.key, b.key));
  return r;
}
// Re-sign an envelope whose fields were changed by hand (keeps whichever of sig/sigs it has).
function resign(r, author, signers) {
  const { sig, sigs, ...rest } = r;
  if (sigs) {
    const text = canon(rest);
    return { ...rest, sigs: signers.map(n => ({ key: pub(n), sig: signText(n, text) })).sort((a, b) => byStr(a.key, b.key)) };
  }
  return { ...rest, sig: signText(author, canon(rest)) };
}
function rid(r) {
  if (MULTI.has(r.kind)) { const { sigs, ...rest } = r; return b64(sha(canon(rest))); }
  return b64(sha(canon(r)));
}
const asn = p => 4200000000 + (sha(Buffer.from(p, 'base64url')).readUInt32BE(0) % 94967295);
const clone = x => JSON.parse(JSON.stringify(x));
function swapText(text, from, to) {
  if (text.split(from).length !== 2) throw new Error('expected exactly one ' + from);
  return text.replace(from, to);
}

// ---------- sealed deals (5.3): X25519 from the identity seed, HKDF-SHA256, AES-256-GCM ----------
const X_PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex'); // X25519 private key prefix, then 32 bytes
const hkdf = (ikm, salt, info) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), 32));
// The box private key: HKDF over the Ed25519 seed, clamped (RFC 7748).
function boxPrivBytes(seed) { const d = hkdf(seed, Buffer.alloc(0), 'tubes-fed v1 box'); d[0] &= 248; d[31] &= 127; d[31] |= 64; return d; }
function BOX(name) {
  const k = K(name);
  if (!k.box) {
    const priv = crypto.createPrivateKey({ key: Buffer.concat([X_PKCS8, boxPrivBytes(k.seed)]), format: 'der', type: 'pkcs8' });
    k.box = { priv, pub: crypto.createPublicKey(priv).export({ format: 'jwk' }).x };
  }
  return k.box;
}
const boxPub = n => BOX(n).pub;
// The AES-256-GCM key between me and peer (an Ed25519 Key) whose box is peerBox, for one record kind.
function dealKey(me, peer, peerBox, kind) {
  const shared = crypto.diffieHellman({ privateKey: BOX(me).priv, publicKey: crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: peerBox }, format: 'jwk' }) });
  const salt = Buffer.concat([pub(me), peer].sort(byStr).map(k => Buffer.from(k, 'base64url')));
  return hkdf(shared, salt, 'tubes-fed v1 ' + kind);
}
const boxAad = env => { const { sig, ...r } = env; const { enc, ...body } = r.body; return canon({ ...r, body }); };
const vnonce = label => b64(sha('tubes-fed.1 vector nonce ' + label).subarray(0, 12));
function sealEnc(me, peer, peerBox, env, plain, n) {
  const c = crypto.createCipheriv('aes-256-gcm', dealKey(me, peer, peerBox, env.kind), Buffer.from(n, 'base64url'));
  c.setAAD(Buffer.from(boxAad(env), 'utf8'));
  return { n, c: b64(Buffer.concat([c.update(Buffer.from(canon(plain), 'utf8')), c.final(), c.getAuthTag()])) };
}
// A sealed offer or decline from author to the network named to: clear holds what stays in clear (to, and offer for a
// decline), plain what is sealed. The nonce comes from a label, so the files never change.
function sealed(kind, author, t, clear, plain, to, label) {
  const env = { v: 1, kind, key: pub(author), t, body: clear };
  return rec(kind, author, t, { ...clear, enc: sealEnc(author, pub(to), boxPub(to), env, plain, vnonce(label)) });
}

// ---------- output ----------
const OUT = new Map();
const pad = n => String(n).padStart(3, '0');
const COUNT = {};
function put(area, name, description, input, expect) {
  COUNT[area] = (COUNT[area] || 0) + 1;
  OUT.set(`${area}/${pad(COUNT[area])}-${name}.json`, JSON.stringify({ description, input, expect }, null, 2) + '\n');
}
function putCases(area, name, description, cases) {
  COUNT[area] = (COUNT[area] || 0) + 1;
  OUT.set(`${area}/${pad(COUNT[area])}-${name}.json`, JSON.stringify({ description, cases }, null, 2) + '\n');
}

// ---------- the cast ----------
// Networks: alice, bob, carol, mallory. Operators: anna, ben, cleo, dan. Nodes: node1, node2, node3.
const URL1 = 'wss://relay.example.net/fed', URL2 = 'wss://second.example.org:8443/fed', URL3 = 'wss://third.example.com';

const announceBody = () => ({
  name: 'Ping Floyd', asn: asn(pub('alice')), box: boxPub('alice'), home: 'DE', day: 412, founded: 20454,
  pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 37,
  mix: { content: 200, eyeball: 700, enterprise: 100 }, traffic: { in: 42000, out: 9000 },
  policy: 'selective', cond: { minMbps: 1000, maxRatio: 300, minShared: 2, rpki: true, tier1: false, ai: true },
  rates: {
    transit: { perGbps: 900, commit: [{ mbps: 10000, off: 100 }, { mbps: 100000, off: 250 }], term: 90 },
    pni: { setup: 5000, ports: [{ mbps: 10000, monthly: 1500 }, { mbps: 100000, monthly: 9000 }], term: 180 },
    ix: { ports: [{ mbps: 1000, monthly: 200 }, { mbps: 10000, monthly: 800 }], join: 'anyone', at: ['fra'] },
  },
  auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' },
});
const announceOpen = () => ({
  name: 'Lag Zeppelin', asn: asn(pub('bob')), box: boxPub('bob'), home: 'US', day: 0, founded: 20455,
  pops: [], ix: [], cust: 0, mix: { content: 0, eyeball: 1000, enterprise: 0 }, traffic: { in: 0, out: 0 },
  policy: 'open', rates: {},
  auto: { peering: 'auto', transit: 'decline', pni: 'decline', swap: 'decline', consortium: 'decline', port: 'decline' },
});
const statsBody = () => ({
  mode: 'normal', pops: { ams: 1, fra: 2, lon: 1 }, pies: 12,
  traffic: [{ key: pub('bob'), in: 1800, out: 2400 }, { key: pub('carol'), in: 300, out: 0 }],
  tier1: false, ai: { model: 'example-model-1', harness: 'tubes-mcp' }, shareCountry: true,
});
const statsMin = () => ({ mode: 'normal', pops: {}, traffic: [], tier1: false, shareCountry: false });
const GEN_BODY = () => ({ name: 'Packet Lunch', node: { key: pub('node1'), url: URL1 } });
const genesis = rec('genesis', 'anna', T - 40 * DAY, GEN_BODY());
const SID = rid(genesis);

// ======================================================================================
// signing: keys from seeds, signatures, record ids
// ======================================================================================
{
  const A = 'signing';
  put(A, 'keys-from-seeds',
    'Ed25519 public keys from 32-byte seeds. Each seed is SHA-256 of the UTF-8 text "tubes-fed.1 vector key <name>". ' +
    'WebCrypto imports a seed as PKCS#8: the 16 bytes 302e020100300506032b657004220420 followed by the seed; Go uses ' +
    'ed25519.NewKeyFromSeed. The key is the raw 32-byte public key, base64url without padding (43 characters).',
    { seeds: Object.fromEntries(['alice', 'bob', 'anna', 'node1'].map(n => [n, K(n).seed.toString('hex')])) },
    { keys: Object.fromEntries(['alice', 'bob', 'anna', 'node1'].map(n => [n, pub(n)])) });

  const r = rec('stats', 'alice', T, statsMin());
  const { sig, ...unsigned } = r;
  put(A, 'single-signer',
    'Sign a record: canonical JSON of the record without "sig", as UTF-8, signed with Ed25519 (deterministic, so the ' +
    'signature must match byte for byte). The record id is base64url(SHA-256(canonical JSON of the full record, sig included)).',
    { seed: K('alice').seed.toString('hex'), unsigned },
    { signed_text: canon(unsigned), sig, id: rid(r), record: r });

  const o = multi('operators', 'anna', T, { server: SID, prev: SID, action: 'add_operator', target: pub('ben') }, ['anna', 'ben']);
  const { sigs, ...ounsigned } = o;
  put(A, 'multi-signer',
    'A record with several signers (kinds operators and server) carries "sigs" instead of "sig": a list of {key, sig}, ' +
    'sorted by key (byte order), every one over the same text: canonical JSON of the record without "sigs". Its id is ' +
    'base64url(SHA-256(that same text)), so adding signatures never changes the id.',
    { seeds: { anna: K('anna').seed.toString('hex'), ben: K('ben').seed.toString('hex') }, unsigned: ounsigned },
    { signed_text: canon(ounsigned), sigs, id: rid(o), record: o });

  const n = rec('announce', 'alice', T, { ...announceOpen(), name: 'Café "Ping" \\ 📡', asn: asn(pub('alice')) });
  const { sig: nsig, ...nun } = n;
  put(A, 'non-ascii',
    'Canonical text is UTF-8 with every character other than " and \\ written literally, so a name with é, a quote, a ' +
    'backslash and an emoji signs as those bytes.',
    { seed: K('alice').seed.toString('hex'), unsigned: nun },
    { signed_text: canon(nun), sig: nsig, id: rid(n) });
}

// ======================================================================================
// asn
// ======================================================================================
{
  const names = ['alice', 'bob', 'carol', 'mallory', 'anna', 'node1'];
  putCases('asn', 'from-key',
    'ASN shown for a key: h = SHA-256 of the 32 raw key bytes; n = the first 4 bytes of h as an unsigned big-endian ' +
    'integer; ASN = 4200000000 + (n mod 94967295). The result is always in 4200000000..4294967294.',
    names.map(n => ({ input: { key: pub(n) }, expect: { asn: asn(pub(n)) } })));
}

// ======================================================================================
// records: validation of every kind, and hostile input
// ======================================================================================
{
  const A = 'records';
  const ok = (name, d, r) => put(A, name, d, { now: NOW, record: r }, { ok: true, kind: r.kind, id: rid(r) });
  const okText = (name, d, text, r) => put(A, name, d, { now: NOW, text }, { ok: true, kind: r.kind, id: rid(r) });
  const bad = (name, d, r, error) => put(A, name, d, { now: NOW, record: r }, { ok: false, error });
  const badText = (name, d, text, error) => put(A, name, d, { now: NOW, text }, { ok: false, error });

  const ann = rec('announce', 'alice', T, announceBody());
  const st = rec('stats', 'alice', T, statsBody());
  ok('announce-selective', 'A full announce: selective policy with conditions, transit, PNI and exchange rate cards.', ann);
  ok('announce-open-minimal', 'The smallest announce: open policy (so no cond), no POPs, empty rate card.', rec('announce', 'bob', T, announceOpen()));
  ok('stats-full', 'stats with POPs, pies, traffic with two networks, an AI declaration and shareCountry.', st);
  ok('stats-minimal', 'stats with nothing optional: no pies (no Pie in the Sky company), no ai (a human), empty lists.', rec('stats', 'alice', T, statsMin()));
  ok('stats-excluded-mode', 'A sandbox save may send stats (they are valid records); boards just never rank them.', rec('stats', 'alice', T, { ...statsMin(), mode: 'sandbox' }));
  const annId = rid(rec('announce', 'bob', T - 3600, announceOpen()));
  // Offers to someone are sealed (5.3): the relay sees to and the box. What they hold is checked in the box area.
  const peerOffer = sealed('offer', 'alice', T, { to: pub('bob') }, { deal: 'peering', basis: annId, terms: { at: ['fra', 'ams'], via: 'ix' } }, 'bob', 'records offer');
  ok('offer-sealed', 'A sealed offer to bob: only to and enc (a 12-byte nonce, a ciphertext with its 16-byte tag) are in clear.', peerOffer);
  ok('offer-consortium-open', 'A consortium project open to anyone: no "to", no basis, in clear.',
    rec('offer', 'carol', T, { deal: 'consortium', terms: { name: 'North Sea Noodle', a: 'ams', b: 'osl', members: 4, share: 2500000, pairs: 2 } }));
  const offerId = rid(sealed('offer', 'bob', T - 600, { to: pub('alice') }, { deal: 'pni', basis: rid(ann), terms: { at: 'fra', mbps: 10000, setup: 5000, monthly: 1500, term: 180 } }, 'alice', 'records pni'));
  ok('accept', 'accept names the offer and its author; nothing in it is sealed.', rec('accept', 'alice', T, { offer: offerId, to: pub('bob') }));
  ok('decline-sealed', 'decline names the offer and its author in clear; the reason is sealed.',
    sealed('decline', 'alice', T, { offer: offerId, to: pub('bob') }, { reason: 'conditions' }, 'bob', 'records decline'));
  ok('genesis', 'genesis: founding operator anna, first node node1. Its id is the server identity.', genesis);
  ok('operators', 'operators proposal (multi-signer): add ben, signed by anna and ben.',
    multi('operators', 'anna', T, { server: SID, prev: SID, action: 'add_operator', target: pub('ben') }, ['anna', 'ben']));
  ok('operators-set-node', 'operators proposal set_node carries the node\'s URL.',
    multi('operators', 'anna', T, { server: SID, prev: SID, action: 'set_node', target: pub('node2'), url: URL2 }, ['anna']));
  ok('server', 'server record (multi-signer), lists sorted by key.',
    multi('server', 'anna', T, { server: SID, head: SID, name: 'Packet Lunch', nodes: [{ key: pub('node1'), url: URL1 }], operators: [pub('anna')], sync: 'open', noLogs: true, langs: ['en', 'de'], desc: 'Small, friendly, always on.' }, ['anna']));
  ok('hide', 'hide: three lists of network keys.', rec('hide', 'anna', T, { server: SID, hide: [pub('mallory')], names: [pub('carol')], refuse: [] }));
  ok('shun', 'shun vote with a reason from the fixed list.', rec('shun', 'anna', T, { server: SID, target: pub('mallory'), reason: 'spam' }));
  ok('unshun', 'unshun withdraws this server\'s vote.', rec('unshun', 'anna', T, { server: SID, target: pub('mallory') }));
  ok('leave', 'leave has an empty body.', rec('leave', 'alice', T, {}));

  // equivalent wire forms: same record, same id
  const stText = canon(st);
  okText('wire-whitespace-and-order', 'The same stats record pretty-printed with keys in another order: records are compared, signed and hashed in canonical form, so this is valid and has the same id.',
    JSON.stringify(Object.fromEntries(Object.entries(st).reverse()), null, 2), st);
  okText('wire-number-forms', '1.2e1 is the integer 12 (numbers are read as IEEE-754 doubles and must be integral): valid, same id as "pies":12.',
    swapText(stText, '"pies":12', '"pies":1.2e1'), st);
  { const r = rec('announce', 'alice', T, { ...announceOpen(), name: 'Café/📡', asn: asn(pub('alice')) });
    okText('wire-escapes', 'A name written with \\u escapes (é as \\u00e9, 📡 as the pair \\ud83d\\udce1, "/" as \\/) is the same string as written literally: valid, same id.',
      swapText(canon(r), '"Café/📡"', '"Caf\\u00e9\\/\\ud83d\\udce1"'), r); }
  ok('name-40-emoji', 'A name of 40 emoji is 40 code points (80 UTF-16 units, 160 bytes): lengths count code points, so this is valid.',
    rec('announce', 'alice', T, { ...announceOpen(), name: '🛰'.repeat(40), asn: asn(pub('alice')) }));
  ok('time-future-edge', 't exactly now + 600 is accepted (clock skew allowance).', rec('stats', 'alice', NOW + 600, statsMin()));
  ok('time-stats-oldest', 'stats exactly 777600 s (9 days) old is still accepted.', rec('stats', 'alice', NOW - 777600, statsMin()));

  // --- JSON and value domain ---
  badText('json-truncated', 'Not JSON: cut short.', stText.slice(0, 60), 'bad_json');
  badText('json-trailing', 'Not JSON: text after the value.', stText + ' {}', 'bad_json');
  badText('json-raw-control', 'Not JSON: a raw tab inside a string (JSON requires it escaped).', swapText(stText, '"tubes-mcp"', '"tubes\tmcp"'), 'bad_json');
  bad('not-object', 'A record must be an object.', [st], 'bad_field');
  badText('number-fraction', 'A number that is not an integer.', swapText(stText, '"pies":12', '"pies":12.5'), 'bad_number');
  badText('number-negative-zero', '-0 is refused.', swapText(stText, '"pies":12', '"pies":-0'), 'bad_number');
  badText('number-unsafe', '2^53 is outside the safe range.', swapText(stText, '"pies":12', '"pies":9007199254740992'), 'bad_number');
  badText('number-overflow', '1e400 is not finite as a double.', swapText(stText, '"pies":12', '"pies":1e400'), 'bad_number');
  badText('null-value', 'null is not a value records may hold.', swapText(stText, '"pies":12', '"pies":null'), 'bad_value');
  badText('string-control-escape', 'A control character (U+0007) written as an escape.', swapText(stText, '"tubes-mcp"', '"tubes\\u0007mcp"'), 'bad_string');
  badText('string-lone-high-surrogate', 'A lone high surrogate escape. Go\'s encoding/json silently turns it into U+FFFD: scan the raw text first.', swapText(stText, '"tubes-mcp"', '"tubes\\ud800mcp"'), 'bad_string');
  badText('string-lone-low-surrogate', 'A lone low surrogate escape.', swapText(stText, '"tubes-mcp"', '"tubes\\udc00mcp"'), 'bad_string');
  badText('string-reversed-pair', 'A low surrogate followed by a high one is two lone surrogates.', swapText(stText, '"tubes-mcp"', '"tubes\\ude00\\ud83dmcp"'), 'bad_string');
  badText('name-dash', 'Object keys are [A-Za-z0-9_]{1,32}; a dash is refused even inside body.pops.', swapText(stText, '"ams":1', '"am-s":1'), 'bad_name');
  badText('name-non-ascii', 'Object keys are ASCII only.', swapText(stText, '"ams":1', '"äms":1'), 'bad_name');
  badText('name-empty', 'An empty object key.', swapText(stText, '"ams":1', '"":1'), 'bad_name');
  badText('name-too-long', 'An object key of 33 characters.', swapText(stText, '"ams":1', '"' + 'a'.repeat(33) + '":1'), 'bad_name');
  badText('too-deep', 'Depth 9 (record 1, body 2, then seven nested arrays): over the limit of 8, refused before any field is looked at.',
    swapText(stText, '"pies":12', '"pies":12,"x":[[[[[[[1]]]]]]]'), 'too_deep');
  badText('depth-8-unknown-field', 'Depth exactly 8 passes the value rules; this record is then refused only for its unknown field "x".',
    swapText(stText, '"pies":12', '"pies":12,"x":[[[[[[1]]]]]]'), 'unknown_field');

  // --- envelope ---
  { const { sig, ...r } = st; bad('missing-sig', 'No sig.', r, 'missing_field'); }
  { const { t, ...r } = st; bad('missing-t', 'No t.', r, 'missing_field'); }
  bad('envelope-unknown-field', 'An extra envelope field (here a would-be address) is refused, never stored.', { ...st, ip: '192.0.2.7' }, 'unknown_field');
  bad('version-2', 'v must be the integer 1.', resign({ ...st, v: 2 }, 'alice'), 'bad_version');
  bad('version-string', 'v as a string is not 1.', { ...st, v: '1' }, 'bad_version');
  bad('kind-unknown', 'Unknown kind.', resign({ ...st, kind: 'chat' }, 'alice'), 'bad_kind');
  bad('kind-receipt', 'Receipts are not records: a client cannot put one.', resign({ ...st, kind: 'receipt' }, 'alice'), 'bad_kind');
  bad('kind-single-with-sigs', 'A single-signer kind carrying sigs instead of sig: sig is missing.',
    (() => { const { sig, ...r } = st; return { ...r, sigs: [{ key: pub('alice'), sig }] }; })(), 'missing_field');
  bad('kind-multi-with-sig', 'A multi-signer kind carrying sig instead of sigs: sigs is missing.',
    (() => { const r = multi('operators', 'anna', T, { server: SID, prev: SID, action: 'add_operator', target: pub('ben') }, ['anna']); const { sigs, ...x } = r; return { ...x, sig: sigs[0].sig }; })(), 'missing_field');
  bad('t-not-integer', 't must be an integer: a string is refused.', { ...st, t: String(T) }, 'bad_field');
  bad('body-not-object', 'body must be an object.', resign({ ...st, body: [] }, 'alice'), 'bad_field');

  // --- keys and signatures ---
  bad('key-padded', 'base64url with "=" padding.', { ...st, key: st.key + '=' }, 'bad_key');
  bad('key-short', '42 characters.', { ...st, key: st.key.slice(0, 42) }, 'bad_key');
  bad('key-std-alphabet', 'A "+" from the standard alphabet.', { ...st, key: '+' + st.key.slice(1) }, 'bad_key');
  { // the last of 43 characters carries 2 unused bits, which must be zero
    const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = A64.indexOf(st.key[42]); const k2 = st.key.slice(0, 42) + A64[(last & ~3) | 1];
    bad('key-noncanonical-bits', 'Non-zero unused bits in the last character: decodes to the same bytes in lenient decoders but is not the canonical encoding. Decode, re-encode and compare.', { ...st, key: k2 }, 'bad_key');
  }
  { const s = Buffer.from(st.sig, 'base64url'); s[10] ^= 1; bad('sig-bit-flip', 'One bit of the signature flipped.', { ...st, sig: b64(s) }, 'bad_sig'); }
  bad('sig-other-key', 'Signed by mallory, claiming alice\'s key.', { ...st, sig: signText('mallory', canon((({ sig, ...r }) => r)(st))) }, 'bad_sig');
  bad('sig-tampered-body', 'Body changed after signing (POPs inflated).', { ...st, body: { ...st.body, pops: { ...st.body.pops, fra: 20 } } }, 'bad_sig');
  { // S + L: the same signature with a non-reduced scalar; RFC 8032 verifiers refuse it
    const s = Buffer.from(st.sig, 'base64url');
    const L = (1n << 252n) + 27742317777372353535851937790883648493n;
    let S = 0n; for (let i = 63; i >= 32; i--) S = (S << 8n) | BigInt(s[i]);
    S += L; for (let i = 32; i < 64; i++) { s[i] = Number(S & 0xffn); S >>= 8n; }
    bad('sig-malleated', 'The signature with S + L in place of S (not reduced mod L): refused by RFC 8032 verifiers, so the same message cannot gain a second valid signature.', { ...st, sig: b64(s) }, 'bad_sig');
  }
  bad('sig-short', 'Signature of 85 characters.', { ...st, sig: st.sig.slice(0, 85) }, 'bad_sig');

  // --- size and lists ---
  { const pops = {}; for (let i = 0; i < 5000; i++) pops['c' + String(i).padStart(4, '0')] = 1;
    badText('too-big', 'A stats record over 40960 bytes (5000 POP cities, given as text to keep the file small): refused for size before its list limits are looked at.', canon(rec('stats', 'alice', T, { ...statsMin(), pops })), 'too_big'); }
  { const pops = {}; for (let i = 0; i < 513; i++) pops['c' + String(i).padStart(3, '0')] = 1;
    bad('stats-pops-513', '513 POP cities (limit 512), within the size limit.', rec('stats', 'alice', T, { ...statsMin(), pops }), 'too_many'); }
  { const traffic = []; for (let i = 0; i < 257; i++) traffic.push({ key: pub('peer' + i), in: 1, out: 1 });
    traffic.sort((a, b) => byStr(a.key, b.key));
    bad('stats-traffic-257', '257 traffic entries (limit 256).', rec('stats', 'alice', T, { ...statsMin(), traffic }), 'too_many'); }
  bad('stats-traffic-duplicate', 'The same network twice in traffic.', rec('stats', 'alice', T, { ...statsMin(), traffic: [{ key: pub('bob'), in: 1, out: 1 }, { key: pub('bob'), in: 2, out: 2 }] }), 'duplicate');
  bad('stats-traffic-self', 'Traffic with one\'s own key.', rec('stats', 'alice', T, { ...statsMin(), traffic: [{ key: pub('alice'), in: 1, out: 1 }] }), 'bad_field');
  bad('stats-traffic-bad-key', 'A traffic entry whose key is not a key.', rec('stats', 'alice', T, { ...statsMin(), traffic: [{ key: 'bob', in: 1, out: 1 }] }), 'bad_key');
  bad('stats-mbps-over', 'Traffic over 1000000000 Mbps.', rec('stats', 'alice', T, { ...statsMin(), traffic: [{ key: pub('bob'), in: 1000000001, out: 1 }] }), 'bad_field');
  bad('announce-pops-duplicate', 'A city twice in pops.', rec('announce', 'alice', T, { ...announceBody(), pops: ['fra', 'ams', 'fra'] }), 'duplicate');

  // --- body schema ---
  { const b = statsMin(); delete b.tier1; bad('stats-missing-tier1', 'A required body field is missing.', rec('stats', 'alice', T, b), 'missing_field'); }
  bad('stats-ip-field', 'An unknown body field (an address) is refused: nothing outside the schema is ever stored or passed on.', rec('stats', 'alice', T, { ...statsMin(), ip: '192.0.2.7' }), 'unknown_field');
  bad('stats-country-field', 'The client never sends its country; a cc field in stats is unknown.', rec('stats', 'alice', T, { ...statsMin(), cc: 'DE' }), 'unknown_field');
  bad('stats-mode-unknown', 'mode outside the list.', rec('stats', 'alice', T, { ...statsMin(), mode: 'hardcore' }), 'bad_field');
  bad('stats-pops-zero', 'A POP count of 0 (cities without POPs are left out).', rec('stats', 'alice', T, { ...statsMin(), pops: { fra: 0 } }), 'bad_field');
  bad('stats-pops-bad-city', 'A city id outside ^[a-z0-9]{2,8}$ (upper case).', rec('stats', 'alice', T, { ...statsMin(), pops: { FRA: 1 } }), 'bad_field');
  bad('stats-ai-empty-model', 'ai.model empty.', rec('stats', 'alice', T, { ...statsMin(), ai: { model: '', harness: 'tubes-mcp' } }), 'bad_field');
  bad('stats-pies-negative', 'pies below 0.', rec('stats', 'alice', T, { ...statsMin(), pies: -1 }), 'bad_field');
  bad('announce-asn-mismatch', 'asn must equal the ASN derived from key.', rec('announce', 'alice', T, { ...announceBody(), asn: asn(pub('alice')) + 1 }), 'bad_field');
  bad('announce-ix-not-pop', 'An exchange city that is not one of the POPs.', rec('announce', 'alice', T, { ...announceBody(), ix: ['fra', 'nyc'] }), 'bad_field');
  { const b = announceBody(); delete b.cond; bad('announce-selective-no-cond', 'selective policy without cond.', rec('announce', 'alice', T, b), 'missing_field'); }
  bad('announce-open-with-cond', 'cond with a policy other than selective.', rec('announce', 'alice', T, { ...announceBody(), policy: 'open' }), 'bad_field');
  bad('announce-mix-sum', 'mix must add up to 1000.', rec('announce', 'alice', T, { ...announceBody(), mix: { content: 200, eyeball: 700, enterprise: 99 } }), 'bad_field');
  bad('announce-name-empty', 'An empty name.', rec('announce', 'alice', T, { ...announceBody(), name: '' }), 'bad_field');
  bad('announce-name-spaces', 'A name of spaces only.', rec('announce', 'alice', T, { ...announceBody(), name: '   ' }), 'bad_field');
  bad('announce-name-41', 'A name of 41 code points.', rec('announce', 'alice', T, { ...announceBody(), name: 'x'.repeat(41) }), 'bad_field');
  bad('announce-name-bidi', 'A name with a right-to-left override (U+202E), which could make one name look like another.', rec('announce', 'alice', T, { ...announceBody(), name: 'Ping ‮Floyd' }), 'bad_field');
  bad('announce-founded-future', 'founded after the day of t.', rec('announce', 'alice', T, { ...announceBody(), founded: 20456 }), 'bad_field');
  bad('announce-commit-order', 'Commit tiers must have strictly ascending mbps.',
    rec('announce', 'alice', T, (() => { const b = announceBody(); b.rates.transit.commit.reverse(); return b; })()), 'bad_field');
  bad('announce-auto-missing', 'auto must list all six deal kinds.', rec('announce', 'alice', T, (() => { const b = announceBody(); delete b.auto.port; return b; })()), 'missing_field');
  { const E = peerOffer.body.enc, re = (body, author = 'alice') => rec('offer', author, T, body);
    bad('offer-to-self', 'A sealed offer to oneself.', re({ to: pub('alice'), enc: E }), 'bad_field');
    bad('offer-sealed-no-enc', 'An offer with to and nothing sealed: enc is missing.', re({ to: pub('bob') }), 'missing_field');
    bad('offer-sealed-terms-in-clear', 'An offer to someone with its terms in clear: nothing but to and enc may travel.', re({ to: pub('bob'), enc: E, deal: 'peering' }), 'unknown_field');
    bad('offer-sealed-short-nonce', 'The nonce is exactly 12 bytes; 11 is refused.', re({ to: pub('bob'), enc: { n: b64(Buffer.alloc(11)), c: E.c } }), 'bad_field');
    bad('offer-sealed-no-tag', 'A ciphertext of 16 bytes holds only a tag and nothing sealed: at least 17.', re({ to: pub('bob'), enc: { n: E.n, c: b64(Buffer.alloc(16)) } }), 'bad_field');
    bad('offer-sealed-box-too-long', 'A ciphertext over 2048 bytes.', re({ to: pub('bob'), enc: { n: E.n, c: b64(Buffer.alloc(2049)) } }), 'bad_field');
    bad('offer-sealed-box-extra', 'enc has exactly n and c.', re({ to: pub('bob'), enc: { ...E, v: 1 } }), 'unknown_field');
    bad('offer-sealed-nonce-padded', 'The nonce in base64url with padding.', re({ to: pub('bob'), enc: { n: E.n + '==', c: E.c } }), 'bad_field');
    bad('offer-open-not-consortium', 'An offer without to is an open consortium project; any other deal needs to.', re({ deal: 'peering', basis: annId, terms: { at: ['fra'], via: 'ix' } }), 'missing_field');
    bad('offer-consortium-basis', 'A consortium offer must not have a basis.', re({ deal: 'consortium', basis: annId, terms: { name: 'North Sea Noodle', a: 'ams', b: 'osl', members: 4, share: 2500000, pairs: 2 } }, 'carol'), 'bad_field');
  }
  bad('decline-reason-in-clear', 'A sealed decline that also carries its reason in clear: the reason travels sealed only.', rec('decline', 'alice', T, { offer: offerId, to: pub('bob'), enc: peerOffer.body.enc, reason: 'conditions' }), 'unknown_field');
  bad('shun-free-text-reason', 'shun reasons come from a fixed list.', rec('shun', 'anna', T, { server: SID, target: pub('mallory'), reason: 'he was rude' }), 'bad_field');
  bad('shun-note', 'No free text anywhere in a vote.', rec('shun', 'anna', T, { server: SID, target: pub('mallory'), reason: 'spam', note: 'see thread' }), 'unknown_field');
  bad('leave-body', 'leave has an empty body.', rec('leave', 'alice', T, { why: 'bye' }), 'unknown_field');
  bad('genesis-http', 'Node URLs must be wss://.', rec('genesis', 'anna', T, { name: 'Packet Lunch', node: { key: pub('node1'), url: 'ws://relay.example.net/fed' } }), 'bad_field');
  bad('genesis-userinfo', 'No user info in node URLs.', rec('genesis', 'anna', T, { name: 'Packet Lunch', node: { key: pub('node1'), url: 'wss://me:pw@relay.example.net/fed' } }), 'bad_field');
  bad('genesis-ip-host', 'Node URLs name a host, not an IP address.', rec('genesis', 'anna', T, { name: 'Packet Lunch', node: { key: pub('node1'), url: 'wss://192.0.2.7/fed' } }), 'bad_field');
  bad('server-sync-unknown', 'sync outside standalone|selective|open.',
    multi('server', 'anna', T, { server: SID, head: SID, name: 'Packet Lunch', nodes: [{ key: pub('node1'), url: URL1 }], operators: [pub('anna')], sync: 'closed', noLogs: true, langs: [], desc: '' }, ['anna']), 'bad_field');
  {
    const ops = [pub('anna'), pub('ben')].sort(byStr).reverse();
    bad('server-operators-unsorted', 'Lists of keys in server records are sorted by key.',
      multi('server', 'anna', T, { server: SID, head: SID, name: 'Packet Lunch', nodes: [{ key: pub('node1'), url: URL1 }], operators: ops, sync: 'open', noLogs: true, langs: [], desc: '' }, ['anna']), 'bad_field');
  }
  {
    const r = multi('operators', 'anna', T, { server: SID, prev: SID, action: 'add_operator', target: pub('ben') }, ['anna', 'ben']);
    bad('sigs-unsorted', 'sigs must be sorted by key.', { ...r, sigs: r.sigs.slice().reverse() }, 'bad_field');
    bad('sigs-duplicate', 'The same signer twice.', { ...r, sigs: [r.sigs[0], r.sigs[0]] }, 'duplicate');
    const s = Buffer.from(r.sigs[1].sig, 'base64url'); s[3] ^= 4;
    bad('sigs-one-bad', 'One of two signatures does not verify: the whole record is refused.', { ...r, sigs: [r.sigs[0], { key: r.sigs[1].key, sig: b64(s) }] }, 'bad_sig');
    bad('sigs-without-author', 'The author (key) must be one of the signers.', multi('operators', 'anna', T, { server: SID, prev: SID, action: 'add_operator', target: pub('ben') }, ['ben']), 'bad_field');
    bad('operators-set-node-no-url', 'set_node needs url.', multi('operators', 'anna', T, { server: SID, prev: SID, action: 'set_node', target: pub('node2') }, ['anna']), 'missing_field');
    bad('operators-url-on-add-operator', 'url only goes with set_node.', multi('operators', 'anna', T, { server: SID, prev: SID, action: 'add_operator', target: pub('ben'), url: URL2 }, ['anna']), 'bad_field');
  }

  // --- time ---
  bad('time-too-new', 't more than 600 s ahead of now.', rec('stats', 'alice', NOW + 601, statsMin()), 'too_new');
  bad('time-before-epoch', 't before 2025-01-01 (1735689600).', rec('announce', 'alice', 1735689599, { ...announceBody(), founded: 20088 }), 'too_old');
  bad('time-stats-old', 'stats older than 777600 s (9 days).', rec('stats', 'alice', NOW - 777601, statsMin()), 'too_old');
  bad('time-offer-old', 'offer older than 30 days.', sealed('offer', 'alice', NOW - 30 * DAY - 1, { to: pub('bob') }, { deal: 'peering', basis: annId, terms: { at: ['fra'], via: 'ix' } }, 'bob', 'records old'), 'too_old');
  bad('time-shun-old', 'shun older than 90 days: an expired vote is refused.', rec('shun', 'anna', NOW - 90 * DAY - 1, { server: SID, target: pub('mallory'), reason: 'spam' }), 'too_old');
  ok('time-announce-old', 'announce has no maximum age.', rec('announce', 'alice', NOW - 365 * DAY, { ...announceBody(), founded: 20000 }));

  // --- stats: total (the network's whole traffic, optional) ---
  ok('stats-total', 'stats with total, the network\'s whole traffic in Mbps (optional; absent counts as 0).', rec('stats', 'alice', T, { ...statsMin(), total: 48000 }));
  bad('stats-total-over', 'total over 1000000000 Mbps.', rec('stats', 'alice', T, { ...statsMin(), total: 1000000001 }), 'bad_field');

  // --- waves: a rate card (rates.wave), auto.wave (optional) and wave offers ---
  const WAVE = { routes: [{ a: 'ams', b: 'fra' }, { a: 'fra', b: 'lon' }], sizes: [{ gbps: 100, monthly: 900 }, { gbps: 400, monthly: 2400 }], term: 90 };
  const annWave = w => { const b = announceBody(); b.rates.wave = w; b.auto.wave = 'review'; return b; };
  ok('announce-wave', 'An announce selling waves on two routes (cities in byte order), 100G and 400G, 90 days minimum; auto.wave set.', rec('announce', 'alice', T, annWave(WAVE)));
  ok('announce-wave-auto-absent', 'auto.wave is optional (announces from before wave deals): absent, wave requests are declined (10.10).', rec('announce', 'bob', T, announceOpen()));
  bad('announce-wave-route-order', 'A wave route\'s cities must be in byte order (a < b).', rec('announce', 'alice', T, annWave({ ...WAVE, routes: [{ a: 'fra', b: 'ams' }] })), 'bad_field');
  bad('announce-wave-route-same', 'A wave route from a city to itself (a < b fails).', rec('announce', 'alice', T, annWave({ ...WAVE, routes: [{ a: 'fra', b: 'fra' }] })), 'bad_field');
  bad('announce-wave-route-duplicate', 'The same route twice.', rec('announce', 'alice', T, annWave({ ...WAVE, routes: [{ a: 'ams', b: 'fra' }, { a: 'ams', b: 'fra' }] })), 'duplicate');
  bad('announce-wave-routes-many', 'More than 32 routes.', rec('announce', 'alice', T, annWave({ ...WAVE, routes: Array.from({ length: 33 }, (_, i) => ({ a: 'aa' + String(i).padStart(2, '0'), b: 'zz' })) })), 'too_many');
  bad('announce-wave-routes-empty', 'A wave card names at least one route.', rec('announce', 'alice', T, annWave({ ...WAVE, routes: [] })), 'bad_field');
  bad('announce-wave-size', 'Wave sizes are 100, 400, 800 or 1600 Gbps.', rec('announce', 'alice', T, annWave({ ...WAVE, sizes: [{ gbps: 200, monthly: 900 }] })), 'bad_field');
  bad('announce-wave-size-order', 'Sizes strictly ascending by gbps.', rec('announce', 'alice', T, annWave({ ...WAVE, sizes: [{ gbps: 400, monthly: 2400 }, { gbps: 100, monthly: 900 }] })), 'bad_field');

  // --- the box key in announce (5.1) ---
  { const b = announceBody(); delete b.box; bad('announce-no-box', 'An announce without box: nobody could seal a deal for it.', rec('announce', 'alice', T, b), 'missing_field'); }
  bad('announce-box-short', 'box is a Key: 32 bytes, 43 characters.', rec('announce', 'alice', T, { ...announceBody(), box: boxPub('alice').slice(0, 42) }), 'bad_key');

  // --- stats: transit customers and upstreams (the cone board), Tier 2 (all optional) ---
  const keysN = (p, n) => Array.from({ length: n }, (_, i) => pub(p + i)).sort(byStr);
  ok('stats-cone', 'stats listing its transit customers (cust) and upstreams (up), and tier2.', rec('stats', 'alice', T, { ...statsMin(), cust: [pub('bob'), pub('carol')].sort(byStr), up: [pub('dave')], tier1: false, tier2: true }));
  ok('stats-biggest', 'The largest stats a game can send fits the 40960-byte limit: 512 POP cities, 256 traffic entries at the maximum, 128 customers, 16 upstreams, an AI setup.',
    rec('stats', 'alice', T, { ...statsMin(), pops: Object.fromEntries(Array.from({ length: 512 }, (_, i) => ['c' + String(i).padStart(7, '0'), 1000])),
      traffic: keysN('t', 256).map(key => ({ key, in: 1000000000, out: 1000000000 })), total: 1000000000, pies: 10000000, cust: keysN('c', 128), up: keysN('u', 16),
      tier2: true, ai: { model: 'm'.repeat(64), harness: 'h'.repeat(64) } }));
  bad('stats-cust-129', '129 transit customers (limit 128).', rec('stats', 'alice', T, { ...statsMin(), cust: keysN('c', 129) }), 'too_many');
  bad('stats-up-17', '17 upstreams (limit 16).', rec('stats', 'alice', T, { ...statsMin(), up: keysN('u', 17) }), 'too_many');
  bad('stats-cust-self', 'Its own key as a transit customer.', rec('stats', 'alice', T, { ...statsMin(), cust: [pub('alice')] }), 'bad_field');
  bad('stats-up-self', 'Its own key as an upstream.', rec('stats', 'alice', T, { ...statsMin(), up: [pub('alice')] }), 'bad_field');
  bad('stats-cust-duplicate', 'The same customer twice.', rec('stats', 'alice', T, { ...statsMin(), cust: [pub('bob'), pub('bob')] }), 'duplicate');
  bad('stats-up-bad-key', 'An upstream that is not a key.', rec('stats', 'alice', T, { ...statsMin(), up: ['nope'] }), 'bad_key');
  bad('stats-tier2-string', 'tier2 is a Bool.', rec('stats', 'alice', T, { ...statsMin(), tier2: 'yes' }), 'bad_field');

  // --- report (5.10): a player tells its own server's operators about a network ---
  ok('report', 'report: a player tells its server\'s operators about a network, with a reason from the fixed list.', rec('report', 'bob', T, { server: SID, target: pub('mallory'), reason: 'offensive_name' }));
  bad('report-self', 'A network cannot report itself: target is not the author.', rec('report', 'bob', T, { server: SID, target: pub('bob'), reason: 'spam' }), 'bad_field');
  bad('report-free-text-reason', 'report reasons come from the same fixed list as shun votes.', rec('report', 'bob', T, { server: SID, target: pub('mallory'), reason: 'he was rude' }), 'bad_field');
  bad('report-note', 'No free text anywhere in a report.', rec('report', 'bob', T, { server: SID, target: pub('mallory'), reason: 'abuse', note: 'see chat' }), 'unknown_field');
  bad('time-report-old', 'report older than 30 days.', rec('report', 'bob', NOW - 30 * DAY - 1, { server: SID, target: pub('mallory'), reason: 'spam' }), 'too_old');

  // LAN servers (5, Url): a node may be named by a private, link-local or loopback address, never a public one.
  const gNode = (url) => rec('genesis', 'anna', T, { name: 'LAN Before Time', node: { key: pub('node1'), url } });
  ok('genesis-lan-ipv4', 'A LAN server: its node named by a private IPv4 address (192.168/16), as `relay lan` founds one.', gNode('wss://192.168.1.20:8443/fed'));
  ok('genesis-lan-ipv6', 'A LAN server named by an IPv6 unique local address (fc00::/7) in brackets, in RFC 5952 form.', gNode('wss://[fd12:3456::1]:8443/fed'));
  ok('genesis-lan-mdns', 'A LAN server named by its mDNS name (.local): a host name like any other.', gNode('wss://freds-laptop.local:8443/fed'));
  bad('genesis-public-ipv4', 'A public IPv4 address is refused: a server on the internet has a name.', gNode('wss://198.51.100.20/fed'), 'bad_field');
  bad('genesis-ipv4-leading-zero', 'One spelling per address: no leading zeros.', gNode('wss://192.168.001.20/fed'), 'bad_field');
  bad('genesis-ipv6-long-form', 'One spelling per address: IPv6 as RFC 5952 writes it (zeros compressed).', gNode('wss://[fd12:3456:0:0:0:0:0:1]/fed'), 'bad_field');
  bad('genesis-ipv6-public', 'A global IPv6 address is refused.', gNode('wss://[2001:db8::1]/fed'), 'bad_field');
  // Live states (5.11): checked where a state is expected (as: "state", a state frame); never a record.
  const okState = (name, d, r) => put(A, name, d, { now: NOW, as: 'state', record: r }, { ok: true, kind: r.kind, id: rid(r) });
  const badState = (name, d, r, error) => put(A, name, d, { now: NOW, as: 'state', record: r }, { ok: false, error });
  const live = rec('state', 'alice', NOW - 10, statsBody());
  okState('state-full', 'A live state (5.11): the envelope of a record with kind state and the body of a stats record. Checked where a state is expected (as: "state"); its id is that of any single-signer object.', live);
  okState('state-900-s-old', 'A live state may be up to 900 s old (its maximum age): t = now - 900 checks.', rec('state', 'alice', NOW - 900, statsMin()));
  badState('state-901-s-old', 'A live state 901 s old is too old.', rec('state', 'alice', NOW - 901, statsMin()), 'too_old');
  badState('state-too-new', 'A live state more than 600 s ahead of now is too new, like a record.', rec('state', 'alice', NOW + 601, statsMin()), 'too_new');
  badState('state-own-traffic', 'A live state is checked like stats: traffic with its own key is bad_field.', rec('state', 'alice', NOW, { ...statsMin(), traffic: [{ key: pub('alice'), in: 1, out: 1 }] }), 'bad_field');
  badState('state-stats-kind', 'Where a state is expected, a stats record is the wrong kind.', rec('stats', 'alice', T, statsMin()), 'bad_kind');
  bad('state-not-a-record', 'A live state is not a record: put (or anywhere a record is expected) refuses its kind.', live, 'bad_kind');
}

// ======================================================================================
// box: sealed deals (5.3): the box key from the seed, sealing, opening, what an opened offer holds
// ======================================================================================
{
  const A = 'box';
  const hex = n => K(n).seed.toString('hex');
  putCases(A, 'derive',
    'The box key (5.1) from an identity seed: HKDF-SHA256 with the 32-byte Ed25519 seed as key material, an empty salt and ' +
    'info "tubes-fed v1 box", 32 bytes, clamped as RFC 7748 says (byte 0 &= 248, byte 31 &= 127, byte 31 |= 64), is the ' +
    'X25519 private key; box is its public key, base64url (43 characters).',
    ['alice', 'bob', 'carol'].map(n => ({ input: { seed: hex(n) }, expect: { box: boxPub(n) } })));

  const annB = rid(rec('announce', 'bob', T - 3600, announceOpen()));
  const clear = { to: pub('bob') }, plain = { deal: 'peering', basis: annB, terms: { at: ['fra', 'ams'], via: 'ix' } };
  const env = { v: 1, kind: 'offer', key: pub('alice'), t: T, body: clear };
  const n = vnonce('box offer'), offer = sealed('offer', 'alice', T, clear, plain, 'bob', 'box offer');
  put(A, 'seal-offer',
    'Sealing an offer from alice to bob. shared = X25519(alice\'s box private key, bob\'s box). key = HKDF-SHA256(shared, ' +
    'salt = the 32 raw bytes of each of the two Ed25519 keys, the one whose Key text sorts first (byte order) first, info = ' +
    '"tubes-fed v1 offer" (the record kind), 32 bytes). aad = canonical JSON of the record without sig and without body.enc. ' +
    'c = AES-256-GCM(key, nonce n, plaintext = canonical JSON of what is sealed, aad), the 16-byte tag appended. Gives enc.',
    { seed: hex('alice'), peer: pub('bob'), peerBox: boxPub('bob'), envelope: env, plain, nonce: n },
    { aad: boxAad(env), key: dealKey('alice', pub('bob'), boxPub('bob'), 'offer').toString('hex'), enc: offer.body.enc });
  const open = (name, d, who, peer, record, expect) => put(A, name, d, { seed: hex(who), peer: pub(peer), peerBox: boxPub(peer), record }, expect);
  open('open-offer-recipient', 'bob opens the offer: X25519 is symmetric, so his box private key with alice\'s box gives the same key.', 'bob', 'alice', offer, { ok: true, plain });
  open('open-offer-author', 'alice opens her own offer (another device with her save), with bob\'s box.', 'alice', 'bob', offer, { ok: true, plain });
  open('open-third-party', 'carol cannot open it: her key with alice\'s box is not the key it was sealed with.', 'carol', 'alice', offer, { ok: false });
  open('open-changed-t', 'The same box in a record whose t changed (signed again by alice): the aad differs, so opening fails.', 'bob', 'alice', resign({ ...offer, t: T + 1 }, 'alice'), { ok: false });
  open('open-changed-to', 'The same box in a record now addressed to carol (signed again): bob, with the right key, still fails on the aad.', 'bob', 'alice', resign({ ...offer, body: { ...offer.body, to: pub('carol') } }, 'alice'), { ok: false });
  { const c = Buffer.from(offer.body.enc.c, 'base64url'); c[0] ^= 1;
    open('open-tampered', 'One bit of the ciphertext flipped (the record signed again): the tag does not match.', 'bob', 'alice', resign({ ...offer, body: { ...offer.body, enc: { ...offer.body.enc, c: b64(c) } } }, 'alice'), { ok: false }); }
  const offId = rid(offer), dec = sealed('decline', 'bob', T + 60, { offer: offId, to: pub('alice') }, { reason: 'declined' }, 'alice', 'box decline');
  open('open-decline', 'bob\'s decline, sealed for alice with info "tubes-fed v1 decline": the offer and to stay in clear, the reason is sealed.', 'alice', 'bob', dec, { ok: true, plain: { reason: 'declined' } });
  { const d2 = { ...dec, kind: 'offer', body: { to: pub('alice'), enc: dec.body.enc } };
    open('open-other-kind', 'A decline\'s box moved into an offer (signed again): the kind is in the key\'s info, so it does not open.', 'alice', 'bob', resign(d2, 'bob'), { ok: false }); }

  // What an opened offer holds is checked like an offer in clear (5.3): the plaintext with the record's to.
  const ann = rec('announce', 'alice', T, announceBody());
  const terms = (name, d, author, body, expect, kind = 'offer') => put(A, name, d, { kind, author: pub(author), body }, expect);
  const ok = { ok: true };
  terms('terms-transit', 'An opened transit offer: commit, price per Gbps, term in days, where.', 'bob', { to: pub('alice'), deal: 'transit', basis: rid(ann), terms: { mbps: 10000, perGbps: 810, term: 90, at: ['fra'] } }, ok);
  terms('terms-pni', 'An opened PNI offer.', 'bob', { to: pub('alice'), deal: 'pni', basis: rid(ann), terms: { at: 'fra', mbps: 10000, setup: 5000, monthly: 1500, term: 180 } }, ok);
  terms('terms-port', 'An opened exchange port offer.', 'bob', { to: pub('alice'), deal: 'port', basis: rid(ann), terms: { at: 'fra', mbps: 1000, monthly: 200, term: 30 } }, ok);
  terms('terms-swap', 'A capacity swap: no rate card, so basis is optional and absent here.', 'alice', { to: pub('carol'), deal: 'swap', terms: { give: { a: 'lon', b: 'nyc', mbps: 10000 }, take: { a: 'ams', b: 'nyc', mbps: 10000 }, term: 365 } }, ok);
  terms('terms-wave', 'A 400G wave on alice\'s card.', 'bob', { to: pub('alice'), deal: 'wave', basis: rid(ann), terms: { a: 'ams', b: 'fra', gbps: 400, monthly: 2400, term: 90 } }, ok);
  terms('terms-consortium-invite', 'A consortium project offered to one network (with to): sealed like any offer to someone.', 'carol', { to: pub('alice'), deal: 'consortium', terms: { name: 'North Sea Noodle', a: 'ams', b: 'osl', members: 4, share: 2500000, pairs: 2 } }, ok);
  terms('terms-to-self', 'An offer to oneself.', 'alice', { to: pub('alice'), deal: 'peering', basis: annB, terms: { at: ['fra'], via: 'ix' } }, { ok: false, error: 'bad_field' });
  terms('terms-peering-no-basis', 'Peering, transit, PNI, port and wave offers need a basis.', 'alice', { to: pub('bob'), deal: 'peering', terms: { at: ['fra'], via: 'ix' } }, { ok: false, error: 'missing_field' });
  terms('terms-deal-unknown', 'deal outside the list.', 'alice', { to: pub('bob'), deal: 'merger', basis: annB, terms: {} }, { ok: false, error: 'bad_field' });
  terms('terms-wave-no-basis', 'A wave offer needs a basis (the card it takes).', 'bob', { to: pub('alice'), deal: 'wave', terms: { a: 'ams', b: 'fra', gbps: 400, monthly: 2400, term: 90 } }, { ok: false, error: 'missing_field' });
  terms('terms-wave-route-order', 'The route in a wave offer is written as on the card: a < b.', 'bob', { to: pub('alice'), deal: 'wave', basis: rid(ann), terms: { a: 'fra', b: 'ams', gbps: 400, monthly: 2400, term: 90 } }, { ok: false, error: 'bad_field' });
  terms('terms-wave-size', 'A wave offer for a size that does not exist.', 'bob', { to: pub('alice'), deal: 'wave', basis: rid(ann), terms: { a: 'ams', b: 'fra', gbps: 10, monthly: 2400, term: 90 } }, { ok: false, error: 'bad_field' });
  terms('terms-extra', 'Nothing but the fields of 5.3 in an opened offer.', 'bob', { to: pub('alice'), deal: 'pni', basis: rid(ann), terms: { at: 'fra', mbps: 10000, setup: 5000, monthly: 1500, term: 180 }, note: 'hi' }, { ok: false, error: 'unknown_field' });
  terms('decline-reason', 'An opened decline holds {reason} from the fixed list.', 'alice', { reason: 'depeer' }, ok, 'decline');
  terms('decline-free-text', 'decline reasons come from a fixed list; free text is refused even sealed.', 'alice', { reason: 'you smell' }, { ok: false, error: 'bad_field' }, 'decline');
}

// ======================================================================================
// receipts
// ======================================================================================
{
  const A = 'receipts';
  const st = rec('stats', 'alice', T, statsBody());                       // shareCountry true
  const st0 = rec('stats', 'bob', T, statsMin());                         // shareCountry false
  const ann = rec('announce', 'alice', T, announceBody());
  const SLOT = T;                                                          // T is a multiple of 300
  const R = (record, body, node = 'node1', t = SLOT, signer = node) => {
    const r = { v: 1, kind: 'receipt', key: pub(node), t, body };
    r.sig = signText(signer, canon(r));
    return r;
  };
  const nodes = [pub('node1'), pub('node2')].sort(byStr);
  const go = (name, d, record, receipt, expect) => put(A, name, d, { now: NOW, server: SID, nodes, record, receipt }, expect);
  go('valid-with-country', 'A stats record with shareCountry true gets the country the node looked up (cc).', st, R(st, { rec: rid(st), server: SID, cc: 'DE' }), { ok: true });
  go('valid-no-country', 'shareCountry false: no cc.', st0, R(st0, { rec: rid(st0), server: SID }), { ok: true });
  go('valid-shared-but-unknown', 'shareCountry true but the node has no country for the connection: cc is simply absent.', st, R(st, { rec: rid(st), server: SID }), { ok: true });
  go('valid-announce', 'Every record received from a client gets a receipt; only stats may carry cc.', ann, R(ann, { rec: rid(ann), server: SID }), { ok: true });
  go('valid-second-node', 'Any node of the server may sign.', st0, R(st0, { rec: rid(st0), server: SID }, 'node2'), { ok: true });
  go('cc-not-shared', 'cc on a record whose author did not share their country.', st0, R(st0, { rec: rid(st0), server: SID, cc: 'DE' }), { ok: false, error: 'bad_field' });
  go('cc-on-announce', 'cc only goes with stats.', ann, R(ann, { rec: rid(ann), server: SID, cc: 'DE' }), { ok: false, error: 'bad_field' });
  go('cc-lower-case', 'cc is two upper-case letters.', st, R(st, { rec: rid(st), server: SID, cc: 'de' }), { ok: false, error: 'bad_field' });
  go('not-a-slot', 'Receipt times are rounded down to the 5-minute slot: t must be a multiple of 300.', st, R(st, { rec: rid(st), server: SID }, 'node1', SLOT + 7), { ok: false, error: 'bad_field' });
  go('city-field', 'Nothing finer than a country, ever: an unknown field is refused.', st, R(st, { rec: rid(st), server: SID, cc: 'DE', city: 'Berlin' }), { ok: false, error: 'unknown_field' });
  go('wrong-record', 'The receipt names another record.', st, R(st0, { rec: rid(st0), server: SID }), { ok: false, error: 'bad_field' });
  go('wrong-server', 'The receipt names another server.', st, R(st, { rec: rid(st), server: rid(ann) }), { ok: false, error: 'bad_field' });
  go('not-a-node', 'Signed by a key that is not one of the server\'s nodes.', st, R(st, { rec: rid(st), server: SID }, 'node3'), { ok: false, error: 'not_node' });
  go('bad-sig', 'Claims node1, signed by node2.', st, R(st, { rec: rid(st), server: SID }, 'node1', SLOT, 'node2'), { ok: false, error: 'bad_sig' });
  go('future', 'A receipt more than 600 s in the future.', st, R(st, { rec: rid(st), server: SID }, 'node1', T + 900), { ok: false, error: 'too_new' });
}

// ======================================================================================
// proofs: the challenge a node answers (clients, other nodes, relay check-registry)
// ======================================================================================
{
  const A = 'proofs';
  const nonce = b64(sha('tubes-fed.1 vector nonce'));
  const P = (over = {}, signer = 'node1') => {
    const r = { v: 1, kind: 'proof', key: pub('node1'), t: NOW - 5, body: { nonce, server: SID }, ...over };
    const { sig, ...un } = r;
    return { ...un, sig: signText(signer, canon(un)) };
  };
  const go = (name, d, proof, expect) => put(A, name, d, { now: NOW, nonce, server: SID, node: pub('node1'), proof }, expect);
  go('valid', 'The node signs {nonce, server} with its node key, t its own clock.', P(), { ok: true });
  go('valid-skew', 't 300 s behind now is still fresh.', P({ t: NOW - 300 }), { ok: true });
  go('stale', 't more than 300 s from now: a recorded proof cannot be replayed later.', P({ t: NOW - 301 }), { ok: false, error: 'bad_challenge' });
  go('future', 't more than 300 s ahead.', P({ t: NOW + 301 }), { ok: false, error: 'bad_challenge' });
  go('other-nonce', 'A proof for another nonce.', P({ body: { nonce: b64(sha('another nonce')), server: SID } }), { ok: false, error: 'bad_challenge' });
  go('other-server', 'A proof naming another server.', P({ body: { nonce, server: b64(sha('another server')) } }), { ok: false, error: 'bad_challenge' });
  go('other-node', 'A valid proof by node2 when node1 was asked.', (() => { const r = { v: 1, kind: 'proof', key: pub('node2'), t: NOW - 5, body: { nonce, server: SID } }; return { ...r, sig: signText('node2', canon(r)) }; })(), { ok: false, error: 'bad_challenge' });
  go('kind-receipt', 'Signed objects are told apart by kind: a receipt is not a proof.', P({ kind: 'receipt' }), { ok: false, error: 'bad_challenge' });
  go('bad-sig', 'Claims node1, signed by node2.', P({}, 'node2'), { ok: false, error: 'bad_sig' });
}

// ======================================================================================
// auth: a client proves a key to one node of one server (9.3); operators get the shun votes
// ======================================================================================
{
  const A = 'auth';
  // The signed text is the canonical JSON of {m: "auth", key, node, server, t}: no kind, so never a record.
  const F = (who, t, over = {}, signer = who, node = pub('node1'), server = SID) =>
    ({ m: 'auth', id: 7, key: pub(who), t, sig: signText(signer, canon({ m: 'auth', key: pub(who), node, server, t })), ...over });
  const go = (name, d, auth, expect) => put(A, name, d, { now: NOW, node: pub('node1'), server: SID, auth }, expect);
  go('valid', 'alice signs {m: "auth", key, node, server, t} (canonical JSON) with her key; the node checks it against its own key and server.', F('alice', NOW - 5), { ok: true });
  go('valid-operator', 'An operator proves the operator key the same way (whether it operates the server is the node\'s state, not this check).', F('anna', NOW), { ok: true });
  go('valid-skew', 't 600 s behind now is still accepted.', F('alice', NOW - 600), { ok: true });
  go('stale', 't more than 600 s behind now.', F('alice', NOW - 601), { ok: false, error: 'too_old' });
  go('future', 't more than 600 s ahead.', F('alice', NOW + 601), { ok: false, error: 'too_new' });
  go('other-node', 'Signed for node2: shown to node1, it does not verify.', F('alice', NOW, {}, 'alice', pub('node2')), { ok: false, error: 'bad_sig' });
  go('other-server', 'Signed for another server.', F('alice', NOW, {}, 'alice', pub('node1'), b64(sha('another server'))), { ok: false, error: 'bad_sig' });
  go('other-t', 'The frame\'s t is not the signed t.', F('alice', NOW, { t: NOW - 1 }), { ok: false, error: 'bad_sig' });
  go('other-signer', 'Claims alice, signed by mallory.', F('alice', NOW, {}, 'mallory'), { ok: false, error: 'bad_sig' });
  go('bad-key', 'key is not a Key.', F('alice', NOW, { key: 'alice' }), { ok: false, error: 'bad_key' });
  go('bad-sig-format', 'sig is not a Sig.', F('alice', NOW, { sig: 'AAAA' }), { ok: false, error: 'bad_sig' });
}

// ======================================================================================
// operators: the operator and node lists from genesis and majority-signed proposals
// ======================================================================================
const P1 = multi('operators', 'anna', T - 30 * DAY, { server: SID, prev: SID, action: 'add_operator', target: pub('ben') }, ['anna']);
const P2 = multi('operators', 'anna', T - 20 * DAY, { server: SID, prev: rid(P1), action: 'add_operator', target: pub('cleo') }, ['anna', 'ben']);
const P3 = multi('operators', 'ben', T - 10 * DAY, { server: SID, prev: rid(P2), action: 'set_node', target: pub('node2'), url: URL2 }, ['ben', 'cleo']);
const sorted = a => a.slice().sort(byStr);
const nodesOf = list => list.map(([n, url]) => ({ key: pub(n), url })).sort((a, b) => byStr(a.key, b.key));
{
  const A = 'operators';
  const go = (name, d, records, expect, now = NOW) => put(A, name, d, { now, genesis, records }, expect);
  const ids = rs => rs.map(rid);
  go('genesis-only', 'A new server: the founder is the only operator, the first node the only node, the head is the genesis id (the server identity).',
    [], { head: SID, operators: [pub('anna')], nodes: nodesOf([['node1', URL1]]), pending: [] });
  go('one-of-one', 'With one operator, its own signature is a majority (1 * 2 > 1): adding ben takes effect.',
    [P1], { head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]), pending: [] });
  const P2a = multi('operators', 'anna', T - 20 * DAY, P2.body, ['anna']);
  go('one-of-two-pending', 'With two operators one signature is not a majority (1 * 2 > 2 is false): the proposal is pending.',
    [P1, P2a], { head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]), pending: ids([P2a]) }, T - 20 * DAY + 3600);
  go('two-of-two', 'Both sign: effective. Then set_node by ben, signed by ben and cleo: 2 of 3, effective.',
    [P1, P2, P3], { head: rid(P3), operators: sorted([pub('anna'), pub('ben'), pub('cleo')]), nodes: nodesOf([['node1', URL1], ['node2', URL2]]), pending: [] });
  go('order-independent', 'The same records in any order give the same lists.',
    [P3, P2, P1], { head: rid(P3), operators: sorted([pub('anna'), pub('ben'), pub('cleo')]), nodes: nodesOf([['node1', URL1], ['node2', URL2]]), pending: [] });
  const Px = multi('operators', 'anna', T - 1 * DAY, { server: SID, prev: rid(P1), action: 'add_operator', target: pub('dan') }, ['anna', 'dan']);
  go('non-operator-signature', 'dan signs his own addition: signatures from keys that are not current operators do not count, so 1 of 2: pending.',
    [P1, Px], { head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]), pending: ids([Px]) });
  // two proposals on the same head, both with a majority: the lower id wins (asserted below)
  const Qa = multi('operators', 'anna', T - 5 * DAY, { server: SID, prev: rid(P1), action: 'add_operator', target: pub('cleo') }, ['anna', 'ben']);
  const Qb = multi('operators', 'ben', T - 5 * DAY, { server: SID, prev: rid(P1), action: 'add_operator', target: pub('dan') }, ['anna', 'ben']);
  const [win, lose, winner] = rid(Qa) < rid(Qb) ? [Qa, Qb, 'cleo'] : [Qb, Qa, 'dan'];
  if (winner !== 'cleo') throw new Error('seed change: update the description of competing-proposals');
  go('competing-proposals', 'Two proposals on the same head both reach a majority (anna and ben sign both). The one with the lower record id (byte order) wins; here that is the one adding cleo. The other no longer follows the head: void, not pending.',
    [P1, lose, win], { head: rid(win), operators: sorted([pub('anna'), pub('ben'), pub(winner)]), nodes: nodesOf([['node1', URL1]]), pending: [] });
  const stale = multi('operators', 'anna', T - 2 * DAY, { server: SID, prev: SID, action: 'add_operator', target: pub('dan') }, ['anna']);
  go('stale-prev', 'A proposal whose prev is no longer the head is void, even though anna alone was a majority at genesis.',
    [P1, stale], { head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]), pending: [] });
  const Pe = multi('operators', 'anna', NOW - 14 * DAY, { server: SID, prev: rid(P1), action: 'add_operator', target: pub('cleo') }, ['anna']);
  go('pending-expired', 'Pending proposals expire 14 days (1209600 s) after their t: at exactly t + 1209600 it is no longer pending.',
    [P1, Pe], { head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]), pending: [] });
  go('pending-last-second', 'At t + 1209599 it is still pending.',
    [P1, Pe], { head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]), pending: ids([Pe]) }, NOW - 1);
  const late = multi('operators', 'anna', T - 25 * DAY, P2.body, ['anna', 'ben']);
  go('expiry-does-not-undo', 'A proposal that reached its majority stays applied however old it is: expiry only drops pending ones.',
    [P1, late], { head: rid(late), operators: sorted([pub('anna'), pub('ben'), pub('cleo')]), nodes: nodesOf([['node1', URL1]]), pending: [] });
  const last = multi('operators', 'anna', T, { server: SID, prev: SID, action: 'remove_operator', target: pub('anna') }, ['anna']);
  go('remove-last-operator', 'Removing the only operator cannot apply: void.', [last], { head: SID, operators: [pub('anna')], nodes: nodesOf([['node1', URL1]]), pending: [] });
  const lastNode = multi('operators', 'anna', T, { server: SID, prev: SID, action: 'remove_node', target: pub('node1') }, ['anna']);
  go('remove-last-node', 'Removing the only node cannot apply: void.', [lastNode], { head: SID, operators: [pub('anna')], nodes: nodesOf([['node1', URL1]]), pending: [] });
  const outsider = multi('operators', 'dan', T, { server: SID, prev: SID, action: 'add_operator', target: pub('dan') }, ['anna', 'dan']);
  go('proposer-not-operator', 'The author of a proposal must be a current operator, even if a majority signed: void.',
    [outsider], { head: SID, operators: [pub('anna')], nodes: nodesOf([['node1', URL1]]), pending: [] });
  const N1 = multi('operators', 'anna', T - 3 * DAY, { server: SID, prev: SID, action: 'set_node', target: pub('node1'), url: URL3 }, ['anna']);
  const N2 = multi('operators', 'anna', T - 2 * DAY, { server: SID, prev: rid(N1), action: 'set_node', target: pub('node2'), url: URL2 }, ['anna']);
  const N3 = multi('operators', 'anna', T - 1 * DAY, { server: SID, prev: rid(N2), action: 'remove_node', target: pub('node1') }, ['anna']);
  go('nodes-move', 'set_node on an existing node changes its URL; on a new key it adds the node; remove_node drops one.',
    [N1, N2, N3], { head: rid(N3), operators: [pub('anna')], nodes: nodesOf([['node2', URL2]]), pending: [] });
  const dupAdd = multi('operators', 'anna', T, { server: SID, prev: rid(P1), action: 'add_operator', target: pub('ben') }, ['anna', 'ben']);
  go('add-existing-operator', 'Adding someone who is already an operator cannot apply: void.', [P1, dupAdd], { head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]), pending: [] });
  const g2 = rec('genesis', 'anna', T - 39 * DAY, GEN_BODY());
  const foreign = multi('operators', 'anna', T, { server: rid(g2), prev: rid(g2), action: 'add_operator', target: pub('dan') }, ['anna']);
  go('other-server', 'A proposal for another server identity is ignored.', [foreign], { head: SID, operators: [pub('anna')], nodes: nodesOf([['node1', URL1]]), pending: [] });

  // server records against the chain
  const chain = [P1, P2, P3];
  const SB = (head, ops, nodes) => ({ server: SID, head, name: 'Packet Lunch', nodes, operators: ops, sync: 'selective', noLogs: true, langs: ['en'], desc: '' });
  const ops3 = sorted([pub('anna'), pub('ben'), pub('cleo')]);
  const nodes2 = nodesOf([['node1', URL1], ['node2', URL2]]);
  const srv = (name, d, server, expect) => put(A, name, d, { now: NOW, genesis, records: chain, server }, expect);
  srv('server-valid', 'A server record at the head, lists equal to the chain, signed by 2 of 3 operators.', multi('server', 'cleo', T, SB(rid(P3), ops3, nodes2), ['ben', 'cleo']), { ok: true });
  srv('server-older-head', 'A server record made at an earlier head is still valid against the lists at that head.',
    multi('server', 'anna', T - 25 * DAY, SB(rid(P1), sorted([pub('anna'), pub('ben')]), nodesOf([['node1', URL1]])), ['anna', 'ben']), { ok: true });
  srv('server-minority', 'Signed by 1 of 3 operators.', multi('server', 'cleo', T, SB(rid(P3), ops3, nodes2), ['cleo']), { ok: false, error: 'no_majority' });
  srv('server-lists-differ', 'The node list does not match the chain at its head.', multi('server', 'cleo', T, SB(rid(P3), ops3, nodesOf([['node1', URL1]])), ['ben', 'cleo']), { ok: false, error: 'bad_chain' });
  srv('server-unknown-head', 'head is not on the chain.', multi('server', 'cleo', T, SB(rid(stale), ops3, nodes2), ['ben', 'cleo']), { ok: false, error: 'bad_chain' });
}

// ======================================================================================
// registry: relay check-registry, and the servers.json the build makes
// ======================================================================================
{
  const A = 'registry';
  const server1 = multi('server', 'anna', T - 9 * DAY, { server: SID, head: rid(P3), name: 'Packet Lunch', nodes: nodesOf([['node1', URL1], ['node2', URL2]]), operators: sorted([pub('anna'), pub('ben'), pub('cleo')]), sync: 'open', noLogs: true, langs: ['en', 'de'], desc: 'Small, friendly, always on.' }, ['anna', 'ben']);
  const file1 = { v: 1, genesis, chain: [P1, P2, P3], server: server1, listed: 1764633600, answered: 1767225600 };
  const g2 = rec('genesis', 'dan', T - 5 * DAY, { name: 'Hop Shop', node: { key: pub('node3'), url: URL3 } });
  const S2 = rid(g2);
  const srv2 = (over = {}, signers = ['dan']) => multi('server', 'dan', T - 5 * DAY, { server: S2, head: S2, name: 'Hop Shop', nodes: nodesOf([['node3', URL3]]), operators: [pub('dan')], sync: 'selective', noLogs: true, langs: ['fr'], desc: '', ...over }, signers);
  const file2 = { v: 1, genesis: g2, chain: [], server: srv2() };
  const F1 = SID + '.json', F2 = S2 + '.json';
  const go = (name, d, files, check, expect, base) => put(A, name, d, base ? { files, check, base } : { files, check }, expect);
  go('valid-chain', 'A server with three operators: genesis, two additions and a node, server record signed by 2 of 3, noLogs true. (The live check that a node answers the challenge is not part of these vectors; see proofs.)',
    { [F1]: file1, [F2]: file2 }, F1, { ok: true });
  go('valid-new', 'A new server with one operator, no listed/answered stamps yet.', { [F1]: file1, [F2]: file2 }, F2, { ok: true });
  const FX = (F2[0] === 'A' ? 'B' : 'A') + F2.slice(1);
  go('filename-mismatch', 'The file name must be <genesis id>.json.', { [FX]: file2 }, FX, { ok: false, error: 'id_mismatch' });
  go('no-logs-false', 'Registered servers must declare noLogs true.', { [F2]: { ...file2, server: srv2({ noLogs: false }) } }, F2, { ok: false, error: 'no_logs' });
  go('name-taken', 'Names are unique across the folder, compared with A-Z lowered to a-z only.', { [F1]: file1, [F2]: { ...file2, server: srv2({ name: 'PACKET LUNCH' }) } }, F2, { ok: false, error: 'name_taken' });
  go('server-minority', 'The server record needs a strict majority of the operators at its head: 1 of 3 is not.',
    { [F1]: { ...file1, server: multi('server', 'anna', server1.t, server1.body, ['anna']) } }, F1, { ok: false, error: 'no_majority' });
  go('chain-gap', 'A chain must link each proposal to the one before (prev); a missing link is refused.', { [F1]: { ...file1, chain: [P1, P3] } }, F1, { ok: false, error: 'bad_chain' });
  go('chain-not-majority', 'Every proposal in the chain must have had its majority: P2 signed by anna alone (1 of 2) is refused.',
    { [F1]: { ...file1, chain: [P1, multi('operators', 'anna', P2.t, P2.body, ['anna']), P3] } }, F1, { ok: false, error: 'no_majority' });
  go('server-head-behind', 'In the registry the server record must be at the last head of the chain.',
    { [F1]: { ...file1, server: multi('server', 'anna', T - 25 * DAY, { ...server1.body, head: rid(P1), operators: sorted([pub('anna'), pub('ben')]), nodes: nodesOf([['node1', URL1]]) }, ['anna', 'ben']) } }, F1, { ok: false, error: 'bad_chain' });
  go('genesis-tampered', 'The genesis name changed after signing.', { [F1]: { ...file1, genesis: { ...genesis, body: { ...genesis.body, name: 'Packet Brunch' } } } }, F1, { ok: false, error: 'bad_sig' });
  go('unknown-field', 'Only v, genesis, chain, server, listed and answered.', { [F2]: { ...file2, contact: 'dan@example.org' } }, F2, { ok: false, error: 'unknown_field' });
  go('bad-json', 'The file is not JSON.', { [F2]: { text: '{"v":1,' } }, F2, { ok: false, error: 'bad_json' });
  go('too-big', 'Over 65536 bytes (a description padded with spaces outside the records).', { [F2]: { text: JSON.stringify(file2).replace('{', '{' + ' '.repeat(65536)) } }, F2, { ok: false, error: 'too_big' });
  go('stamp-changed', 'listed and answered are written only by the weekly job: an operator\'s pull request may not change them (compared with the file on the base branch).',
    { [F1]: { ...file1, answered: 1767312000 } }, F1, { ok: false, error: 'bad_field' }, file1);
  go('stamp-kept', 'The same change with the stamps untouched passes.',
    { [F1]: { ...file1, server: multi('server', 'anna', T - 8 * DAY, { ...server1.body, desc: 'Small, friendly, mostly on.' }, ['anna', 'cleo']) } }, F1, { ok: true }, file1);

  put(A, 'build-servers-json',
    'The build turns the folder into _site/federation/servers.json (the site path federation/servers.json): v 1, asOf = the greatest "answered" of all files (0 if none), servers = one entry per file sorted by id, each {id, genesis, chain, server} plus listed and answered when present. Files are assumed checked already.',
    { files: { [F2]: file2, [F1]: file1 } },
    { servers_json: { v: 1, asOf: 1767225600, servers: [{ id: SID, ...(({ v, ...x }) => x)(file1) }, { id: S2, ...(({ v, ...x }) => x)(file2) }].sort((a, b) => byStr(a.id, b.id)) } });
  // The registry lists servers anyone can reach: a LAN server (an address or a .local name) is valid but not listed.
  for (const [name, url] of [['local-url-ip', 'wss://192.168.1.20:8443/fed'], ['local-url-mdns', 'wss://freds-laptop.local:8443/fed']]) {
    const g = rec('genesis', 'erin', T - 5 * DAY, { name: 'LAN Before Time', node: { key: pub('node3'), url } }), id = rid(g);
    const sr = multi('server', 'erin', T - 5 * DAY, { server: id, head: id, name: 'LAN Before Time', nodes: [{ key: pub('node3'), url }], operators: [pub('erin')], sync: 'standalone', noLogs: true, langs: ['en'], desc: '' }, ['erin']);
    go(name, `A node named ${url.includes('.local') ? 'by an mDNS (.local) name' : 'by a private address'}: fine for an invite, refused by the registry.`, { [id + '.json']: { v: 1, genesis: g, chain: [], server: sr } }, id + '.json', { ok: false, error: 'local_url' });
  }
}

// ======================================================================================
// dedupe: storing what arrives, once per record id; multi-signer copies merge their signatures
// ======================================================================================
{
  const A = 'dedupe';
  const s1 = rec('stats', 'alice', T, statsMin());
  const s2 = rec('stats', 'alice', T + 60, statsMin());
  const pa = multi('operators', 'anna', T, { server: SID, prev: rid(P1), action: 'add_operator', target: pub('cleo') }, ['anna']);
  const pb = multi('operators', 'anna', T, pa.body, ['ben']); // ben's signature alone: author not among signers
  const pab = multi('operators', 'anna', T, pa.body, ['anna', 'ben']);
  const bent = (() => { const s = Buffer.from(pab.sigs[1].sig, 'base64url'); s[0] ^= 1; return { ...pab, sigs: [pab.sigs[0], { key: pab.sigs[1].key, sig: b64(s) }] }; })();
  const go = (name, d, arrivals, expect) => put(A, name, d, { now: NOW, arrivals }, expect);
  go('same-record-twice', 'The same record arriving twice (two nodes, two paths) is stored once.', [{ record: s1 }, { record: s1 }], { stored: [{ id: rid(s1) }], results: ['stored', 'duplicate'] });
  go('same-record-other-text', 'The same record as different text (pretty-printed) has the same id: stored once.',
    [{ record: s1 }, { text: JSON.stringify(s1, null, 1) }], { stored: [{ id: rid(s1) }], results: ['stored', 'duplicate'] });
  go('two-records-same-slot', 'Two stats from one key in the same slot are two records: both stored (boards pick one, see slots).',
    [{ record: s1 }, { record: s2 }], { stored: [rid(s1), rid(s2)].sort(byStr).map(id => ({ id })), results: ['stored', 'stored'] });
  go('merge-signatures', 'A proposal signed by anna, then the same proposal signed by anna and ben: one id, the signatures are merged (union, sorted by key).',
    [{ record: pa }, { record: pab }], { stored: [{ id: rid(pa), sigs: pab.sigs.map(s => s.key) }], results: ['stored', 'merged'] });
  go('merge-adds-nothing', 'A copy with no new signature changes nothing.', [{ record: pab }, { record: pa }], { stored: [{ id: rid(pa), sigs: pab.sigs.map(s => s.key) }], results: ['stored', 'duplicate'] });
  go('merge-bad-copy', 'A copy with one signature that does not verify is refused as a whole; what was stored stays.',
    [{ record: pa }, { record: bent }], { stored: [{ id: rid(pa), sigs: [pub('anna')] }], results: ['stored', 'bad_sig'] });
  go('invalid-not-stored', 'A record that fails validation is not stored and does not block the valid one with other content.',
    [{ record: pb }, { record: pa }], { stored: [{ id: rid(pa), sigs: [pub('anna')] }], results: ['bad_field', 'stored'] });
}

// ---------- rank (9.5, 10.12): what a node answers a rank request ----------
// Records are taken as checked (like the boards vectors); real keys, because rows carry each key's ASN (3.4).
{
  const A = 'rank', now = 1767398410, c = 1767398400, s = 1767225600 + 300 * 500, DAYN = Math.floor(now / DAY);
  const st = (id, name, body, cc) => ({ id, key: pub(name), slot: s, t: s + 20, ...(cc ? { cc } : {}),
    body: { mode: 'normal', traffic: [], tier1: false, shareCountry: !!cc, ...body } });
  const records = [
    st('r1', 'alice', { pops: { fra: 5 } }, 'DE'),
    st('r2', 'bob', { pops: { nyc: 4 }, ai: { model: 'm1', harness: 'h1' } }, 'US'),
    st('r3', 'carol', { pops: { fra: 3 }, tier1: true }),
    st('r4', 'mallory', { pops: { fra: 2 } }),
  ];
  const announces = [
    { key: pub('alice'), name: 'Ping Floyd', home: 'DE', policy: 'open', founded: DAYN - 3, day: 40 },
    { key: pub('bob'), name: 'Packet Ninjas', home: 'US', policy: 'selective', founded: DAYN - 100, day: 2000 },
    { key: pub('carol'), name: 'Hop Scotch', home: 'FR', policy: 'open', founded: DAYN - 400, day: 500 },
  ];
  const R = {
    alice: { key: pub('alice'), value: 5, name: 'Ping Floyd', asn: asn(pub('alice')), ai: false, home: 'DE', cc: 'DE' },
    bob: { key: pub('bob'), value: 4, name: 'Packet Ninjas', asn: asn(pub('bob')), ai: true, home: 'US', cc: 'US' },
    carol: { key: pub('carol'), value: 3, name: 'Hop Scotch', asn: asn(pub('carol')), ai: false, home: 'FR' },
    mallory: { key: pub('mallory'), value: 2, asn: asn(pub('mallory')), ai: false },
  };
  const rows = (...l) => l.map((x, i) => (typeof x === 'string' ? { rank: i + 1, ...R[x] } : { rank: i + 1, ...x }));
  const req = (filters, o = {}) => ({ m: 'rank', id: 1, board: 'pops', measure: 'total', division: 'all', ...(filters ? { filters } : {}), ...o });
  const cs = [];
  const add = (request, expect, o = {}) => cs.push({ input: { now, request, me: o.me || null, excluded: o.excluded || [], names: o.names || [], records, announces }, expect: { slot: c, at: now, ...expect } });
  add(req(), { n: 4, rows: rows('alice', 'bob', 'carol', 'mallory'), me: { rank: 3, value: 3 } }, { me: pub('carol') });
  add(req(null, { n: 2 }), { n: 4, rows: rows('alice', 'bob'), me: { rank: 3, value: 3 } }, { me: pub('carol') });
  add(req({ home: 'DE' }), { n: 1, rows: rows('alice'), me: { rank: null, value: 3 } }, { me: pub('carol') });
  add(req(), { n: 3, rows: rows('alice', { ...R.bob, name: undefined }, 'carol'), me: null }, { me: pub('mallory'), excluded: [pub('mallory')], names: [pub('bob')] });
  add(req(null, { division: 'ai' }), { n: 1, rows: rows('bob'), me: null });
  add(req({ model: 'm2' }), { n: 0, rows: [], me: null });
  add(req({ cities: ['fra'] }), { n: 3, rows: rows('alice', 'carol', 'mallory'), me: null });
  add(req({ tier1: true }), { n: 1, rows: rows('carol'), me: null });
  add(req({ from: 'US' }), { n: 1, rows: rows('bob'), me: null });
  add(req({ ageMax: 6 }), { n: 1, rows: rows('alice'), me: null });
  add(req({ ageMin: 91 }), { n: 2, rows: rows('bob', 'carol'), me: null });
  add(req({ dayMin: 1000 }), { n: 1, rows: rows('bob'), me: null });
  add(req({ policy: 'selective' }), { n: 1, rows: rows('bob'), me: null });
  add(req({ keys: [pub('mallory'), pub('carol')].sort(byStr) }), { n: 2, rows: rows('carol', 'mallory'), me: null });
  add(req({ from: 'germany' }), { error: 'bad_field' });
  add(req(null, { board: 'money' }), { error: 'bad_field' });
  // The cone board: nobody lists transit here, so every network is listed with 0 (key order breaks the tie).
  add(req(null, { board: 'cone' }), { n: 4, rows: rows(...['alice', 'bob', 'carol', 'mallory'].sort((x, y) => byStr(pub(x), pub(y))).map(x => ({ ...R[x], value: 0 }))), me: null });
  for (const x of cs) if (x.expect.error) { delete x.expect.slot; delete x.expect.at; }
  for (const x of cs) for (const r of x.expect.rows || []) for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  putCases(A, 'slices', 'now = 1767398410, so c = 1767398400; one stats record each at slot i = 500 of the windows. POPs: alice 5 (fra, from DE), bob 4 (nyc, an AI on model m1, from US), carol 3 (fra, Tier 1), mallory 2 (fra, no announce: no name or home). Announces: alice home DE, open, founded 3 days ago, game day 40; bob home US, selective, 100 days, day 2000; carol home FR, open, 400 days, day 500. at is the time of the snapshot of live states the ranking reads (here now: none are held, 10.13). me is the key the session proved: its rank in the slice (null when the filters leave it out), none when it is not on the board. excluded: networks the server leaves off; names: networks shown without their name. A filter with a value that is not allowed: bad_field.', cs);
}

// ---------- write or check ----------
const check = process.argv.includes('--check');
let diff = 0;
for (const area of GEN) {
  const dir = path.join(DIR, area);
  const want = [...OUT.keys()].filter(k => k.startsWith(area + '/')).map(k => k.slice(area.length + 1));
  const have = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  if (check) {
    for (const f of new Set([...want, ...have])) {
      const a = fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : null;
      if (a !== OUT.get(area + '/' + f)) { diff++; console.error('differs: federation/vectors/' + area + '/' + f); }
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of have) if (!want.includes(f)) fs.unlinkSync(path.join(dir, f));
    for (const f of want) fs.writeFileSync(path.join(dir, f), OUT.get(area + '/' + f));
  }
}
if (check && diff) { console.error(diff + ' generated vector file(s) out of date: run node scripts/fed-vectors.js'); process.exit(1); }
console.log((check ? 'checked ' : 'wrote ') + OUT.size + ' files: ' + GEN.map(a => `${a} ${COUNT[a] || 0}`).join(', '));
