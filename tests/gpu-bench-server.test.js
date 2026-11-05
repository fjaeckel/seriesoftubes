// npm run bench:gpu serves the game on this machine: only its own page may talk to it (no other site in the
// browser, no DNS rebinding), and what it prints or writes holds no terminal control characters.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const { until, freePort, kill } = require('./net');

const ROOT = path.join(__dirname, '..');

function req(port, { method = 'GET', p = '/', host, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: host || `localhost:${port}`, ...headers } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject); if (body !== undefined) r.write(body); r.end();
  });
}

test('the benchmark server answers only its own page', async (t) => {
  const port = await freePort(), out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bench-')), 'out.md');
  const srv = spawn(process.execPath, [path.join(ROOT, 'scripts', 'gpu-bench.js'), '--port', String(port), '--host', '127.0.0.1', '--out', out], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (c) => { log += c; }); srv.stderr.on('data', (c) => { log += c; });
  t.after(() => kill(srv));
  await until(() => /Ctrl\+C|Error/.test(log) || srv.exitCode !== null);
  assert.match(log, /Ctrl\+C/, 'the server started');

  // DNS rebinding: a request for another host name gets nothing.
  assert.equal((await req(port, { p: '/__bench/save.json', host: `evil.example:${port}` })).status, 421);
  assert.equal((await req(port, { p: '/__bench/save.json' })).status, 200);

  // A POST from another site, or with no origin at all, is refused and writes nothing.
  const md = 'ok\u001b]52;c;Zm9v\u0007\u001b[2Jdone';
  const post = (origin) => req(port, { method: 'POST', p: '/__bench/results', headers: { 'content-type': 'text/plain', ...(origin ? { origin } : {}) }, body: JSON.stringify({ md }) });
  assert.equal((await post('https://evil.example')).status, 403);
  assert.equal((await post(null)).status, 403);
  assert.equal(fs.existsSync(out), false);

  // Its own page may send results; control characters are dropped before printing and writing.
  assert.equal((await post(`http://localhost:${port}`)).status, 204);
  const written = fs.readFileSync(out, 'utf8');
  assert.match(written, /^ok\]52;c;Zm9v\[2Jdone/);
  assert.doesNotMatch(written + log, /[\u001b\u0007]/);

  // A malformed address is a plain 400: no stack trace or paths in the answer.
  const bad = await req(port, { p: '/%E0' });
  assert.equal(bad.status, 400); assert.equal(bad.body, '');
});
