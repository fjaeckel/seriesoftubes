// The federation server registry at build time (docs/FEDERATION-PROTOCOL.md section 11): scripts/registry.js turns
// federation/servers/ into servers.json the way `relay build-servers-json` does, and checks files as
// `relay check-registry --offline` does. CI compares the two builds byte for byte; these tests hold the Node side to
// the shared vectors.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const R = require('../scripts/registry');

const root = path.join(__dirname, '..');
const VEC = path.join(root, 'federation', 'vectors', 'registry');
const vectors = fs.readdirSync(VEC).filter((f) => f.endsWith('.json')).sort().map((f) => [f, JSON.parse(fs.readFileSync(path.join(VEC, f), 'utf8'))]);
const asFiles = (files) => Object.fromEntries(Object.entries(files).map(([n, f]) => [n, Buffer.from('text' in f ? f.text : JSON.stringify(f, null, 2))]));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-registry-'));
// Every registry vector's records are signed in early 2026; the kinds kept in the registry have no maximum age.
const NOW = 1767312100;

test('registry: an empty folder (or none at all) builds a valid empty list', () => {
  const dir = tmp(), out = path.join(dir, 'out', 'servers.json');
  fs.writeFileSync(path.join(dir, 'README.md'), '# not a server\n');
  R.build(dir, out);
  assert.equal(fs.readFileSync(out, 'utf8'), '{"asOf":0,"servers":[],"v":1}\n');
  R.build(path.join(dir, 'missing'), out);
  assert.equal(fs.readFileSync(out, 'utf8'), '{"asOf":0,"servers":[],"v":1}\n');
});

test('registry: the build-servers-json vector, value and bytes', () => {
  const [, v] = vectors.find(([f]) => f.endsWith('-build-servers-json.json'));
  const value = R.serversJson(R.checkFolder(asFiles(v.input.files), { now: NOW }));
  assert.deepEqual(value, v.expect.servers_json);
  // The bytes: canonical JSON (spec 2.3) and one newline, what the relay writes too.
  assert.equal(R.serversText(value), R.canon(v.expect.servers_json) + '\n');
  assert.match(R.serversText(value), /^\{"asOf":1767225600,"servers":\[\{"answered":1767225600,"chain":\[\{"body":\{"action":"add_operator",[^\n]*\}\],"v":1\}\n$/, 'members sorted, no layout, one final newline');
  // From a folder on disk, as the build reads it.
  const dir = tmp();
  for (const [n, f] of Object.entries(v.input.files)) fs.writeFileSync(path.join(dir, n), JSON.stringify(f, null, 2) + '\n');
  R.build(dir, path.join(dir, 'servers.json'), { now: NOW });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'servers.json'), 'utf8')), v.expect.servers_json);
});

test('registry: every check vector gives the expected result (steps 1 to 8)', () => {
  let n = 0;
  for (const [f, v] of vectors) {
    if (v.expect.servers_json) continue;
    const base = v.input.base ? { [v.input.check]: v.input.base } : {};
    const r = R.checkFolder(asFiles(v.input.files), { now: NOW, base }).find((x) => x.name === v.input.check);
    assert.deepEqual(r.error ? { ok: false, error: r.error.code } : { ok: true }, v.expect, `${f}: ${r.error && r.error.message}`);
    n++;
  }
  assert.ok(n >= 15, `ran the check vectors (${n})`);
});

test('registry: files that fail a check are left out of servers.json, and asOf follows those kept', () => {
  const [, v] = vectors.find(([f]) => f.endsWith('-build-servers-json.json'));
  const files = asFiles(v.input.files), [a, b] = Object.keys(files).sort();
  const bad = { ...files, [a]: Buffer.from(files[a].toString().replace('"noLogs": true', '"noLogs": false')) };
  const kept = R.serversJson(R.checkFolder(bad, { now: NOW }));
  assert.deepEqual(kept.servers.map((s) => s.id + '.json'), [b]);
  assert.equal(kept.asOf, Math.max(0, ...kept.servers.map((s) => s.answered || 0)));
  // A record from the future (more than 600 s ahead) is not valid yet.
  assert.deepEqual(R.serversJson(R.checkFolder(files, { now: 1767312100 - 400 * 86400 })).servers, []);
});

test('registry: the weekly stamp sets listed, refreshes answered and drops servers silent for 14 days', () => {
  const dir = tmp(), D = 86400, day = 20500 * D;
  const w = (id, f) => fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ v: 1, genesis: {}, chain: [], server: {}, ...f }));
  w('new', {});                                          // first seen today, silent: listed, kept
  w('up', { listed: day - 30 * D, answered: day - 7 * D }); // answers: answered today
  w('week', { listed: day - 30 * D, answered: day - 7 * D }); // silent one week: kept
  w('gone', { listed: day - 30 * D, answered: day - 14 * D }); // silent two weeks: removed
  w('never', { listed: day - 14 * D });                  // listed two weeks ago, never answered: removed
  const r = R.stamp(dir, day, ['up']);
  assert.deepEqual(r, { stamped: ['up'], listed: ['new'], removed: ['gone', 'never'], silent: ['new', 'week'] });
  const read = (id) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
  assert.equal(read('new').listed, day);
  assert.equal(read('new').answered, undefined);
  assert.equal(read('up').answered, day);
  assert.equal(read('week').answered, day - 7 * D);
  assert.ok(!fs.existsSync(path.join(dir, 'gone.json')) && !fs.existsSync(path.join(dir, 'never.json')));
});

test('registry: the site build ships servers.json from federation/servers/', () => {
  const OUT = tmp();
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, OUT, VERSION: '1.2.3', BUILD_DATE: '2026-11-12' } });
  const text = fs.readFileSync(path.join(OUT, 'federation', 'servers.json'), 'utf8');
  const want = R.serversText(R.serversJson(R.checkFolder(R.readFolder(path.join(root, 'federation', 'servers')))));
  assert.equal(text, want);
  const v = JSON.parse(text);
  assert.equal(v.v, 1);
  assert.ok(Array.isArray(v.servers));
  // Every file in the registry folder is a server file or this README: anything else would be silently ignored.
  for (const f of fs.readdirSync(path.join(root, 'federation', 'servers'))) assert.match(f, /^([A-Za-z0-9_-]{43}\.json|README\.md)$/, f);
});
