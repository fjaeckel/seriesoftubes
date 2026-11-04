// The MCP server over HTTP (scripts/mcp.js --http): the same tools as stdio through the SDK's Streamable HTTP
// handler, with the Host and Origin checked on every request, an optional bearer token, and files confined.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createSession } = require('../scripts/lib/mcp-game');
const { serverFactory, createHttpServer, serial, parseListen, allowedHosts, MCP_PATH } = require('../scripts/mcp');

const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } };

// One server on a free loopback port for the length of fn.
async function withServer(opts, fn) {
  const session = createSession({ saveDir: opts.saveDir === undefined ? null : opts.saveDir });
  const server = createHttpServer(serverFactory(session), { host: '127.0.0.1', allow: opts.allow, token: opts.token });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}

// A JSON-RPC message as an MCP client posts it; the answer may come as JSON or as one SSE event. node:http, not fetch,
// because fetch will not send a Host header of the caller's choosing.
let seq = 0;
function post(base, pathname, payload, headers = {}) {
  const u = new URL(base), data = payload === undefined ? '' : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: pathname, method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', 'content-length': Buffer.byteLength(data), ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { text += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end(data);
  });
}
async function rpc(base, method, params, headers = {}) {
  const res = await post(base, MCP_PATH, { jsonrpc: '2.0', id: ++seq, method, params }, headers);
  let body = null;
  if (/event-stream/.test(res.headers['content-type'] || '')) {
    const data = res.text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
    body = data.find((d) => d.id !== undefined) || null;
  } else if (res.text) body = JSON.parse(res.text);
  return { status: res.status, headers: res.headers, body };
}
const call = async (base, name, args = {}, headers) => {
  const r = await rpc(base, 'tools/call', { name, arguments: args }, headers);
  const c = r.body && r.body.result;
  return { ...r, isError: !!(c && c.isError), text: c ? c.content[0].text : null, json: c && !c.isError ? JSON.parse(c.content[0].text) : null };
};

test('HTTP: initialize, list the tools and play, as over stdio', () => withServer({}, async (base) => {
  const init = await rpc(base, 'initialize', INIT);
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.equal(init.body.result.serverInfo.name, 'seriesoftubes');
  assert.match(init.body.result.instructions, /Time moves only with advance/);
  const list = await rpc(base, 'tools/list', {});
  assert.ok(list.body.result.tools.length >= 22);
  assert.deepEqual(list.body.result.tools.find((t) => t.name === 'network').inputSchema.required, ['network'], 'the schemas as written');
  const st = await call(base, 'status');
  assert.equal(st.json.home, 'Frankfurt');
  await call(base, 'act', { action: 'launchBB', args: { city: 'fra' } });
  const a = await call(base, 'advance', { days: 3 });
  assert.equal(a.json.daysRun, 3);
  assert.equal((await call(base, 'status')).json.day, 3, 'one game, kept between requests');
  // Arguments are checked against the tool's schema before the game sees them; the game's own errors stay its own.
  const extra = await call(base, 'status', { nope: 1 });
  assert.ok(extra.isError && /additional properties/.test(extra.text));
  const bad = await call(base, 'network', { network: 'no such thing at all' });
  assert.ok(bad.isError && /No network matches/.test(bad.text));
  assert.equal((await rpc(base, 'tools/call', { name: 'nope', arguments: {} })).body.error.code, -32602);
  assert.equal((await post(base, '/elsewhere', {})).status, 404);
}));

test('HTTP: a Host this machine does not answer to, or a web page\'s Origin, is refused', () => withServer({ allow: ['tubes.lan'] }, async (base) => {
  const port = new URL(base).port;
  // DNS rebinding: a name someone else's DNS points at 127.0.0.1.
  assert.equal((await rpc(base, 'tools/list', {}, { host: `evil.example:${port}` })).status, 403);
  assert.equal((await rpc(base, 'tools/list', {}, { host: `tubes.lan:${port}` })).status, 200, 'unless the operator allowed it');
  assert.equal((await rpc(base, 'tools/list', {}, { host: `localhost:${port}` })).status, 200);
  // A website open in a browser on this machine.
  assert.equal((await rpc(base, 'tools/list', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await rpc(base, 'tools/list', {}, { origin: 'null' })).status, 403);
  assert.equal((await rpc(base, 'tools/list', {}, { origin: 'http://localhost:6274' })).status, 200, 'a local browser-based client may');
}));

test('HTTP: with a token, every request must carry it', () => withServer({ token: 's3cret-token' }, async (base) => {
  const none = await rpc(base, 'tools/list', {});
  assert.equal(none.status, 401);
  assert.match(none.headers['www-authenticate'], /^Bearer/);
  assert.equal((await rpc(base, 'tools/list', {}, { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await rpc(base, 'tools/list', {}, { authorization: 'Basic czNjcmV0LXRva2Vu' })).status, 401);
  assert.equal((await rpc(base, 'tools/list', {}, { authorization: 'Bearer s3cret-token' })).status, 200);
}));

test('HTTP: saves as JSON only, unless --save-dir, and then nowhere outside it', async () => {
  await withServer({}, async (base) => {
    for (const [tool, args] of [['load_save', { path: '/etc/hosts' }], ['export_save', { path: path.join(os.tmpdir(), 'x.json') }]]) {
      const r = await call(base, tool, args);
      assert.ok(r.isError && /JSON only/.test(r.text), `${tool} refuses a path`);
    }
    const out = await call(base, 'export_save');
    assert.equal(out.json.app, 'series-of-tubes');
    const back = await call(base, 'load_save', { json: JSON.stringify(out.json) });
    assert.equal(back.json.home, 'Frankfurt');
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-saves-')), dir = fs.realpathSync(root);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'secret.json'), '{"secret":1}');
    fs.symlinkSync(path.join(outside, 'secret.json'), path.join(dir, 'link.json'));
    fs.symlinkSync(outside, path.join(dir, 'out'));
    await withServer({ saveDir: dir }, async (base) => {
      const w = await call(base, 'export_save', { path: 'mine.json' });
      assert.equal(w.json.wrote, path.join(dir, 'mine.json'));
      assert.equal((await call(base, 'load_save', { path: 'mine.json' })).json.home, 'Frankfurt');
      for (const [tool, p, why] of [['load_save', '../' + path.basename(outside) + '/secret.json', /outside/], ['load_save', '/etc/hosts', /outside|no such file/],
        ['load_save', 'link.json', /outside/], ['load_save', 'out/secret.json', /outside/], ['export_save', 'out/x.json', /outside/],
        ['export_save', 'link.json', /symbolic link|outside/], ['export_save', '../escape.json', /outside/]]) {
        const r = await call(base, tool, { path: p });
        assert.ok(r.isError && why.test(r.text), `${tool} ${p}: ${r.text}`);
      }
      assert.equal(fs.readFileSync(path.join(outside, 'secret.json'), 'utf8'), '{"secret":1}', 'nothing outside was touched');
      assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'escape.json')));
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('calls run one at a time, in the order they came', async () => {
  const q = serial(), log = [];
  const slow = (n, ms) => q(async () => { log.push(`start ${n}`); await new Promise((r) => setTimeout(r, ms)); log.push(`end ${n}`); return n; });
  const failing = q(async () => { log.push('start bad'); throw new Error('bad'); });
  const r = await Promise.allSettled([slow(1, 30), failing, slow(2, 1)]);
  assert.deepEqual(log, ['start bad', 'start 1', 'end 1', 'start 2', 'end 2']);
  assert.deepEqual(r.map((x) => x.status), ['fulfilled', 'rejected', 'fulfilled'], 'a failed call does not stop the queue');
});

test('--http: where it listens, which Host names it answers to, and what it says about it', async () => {
  assert.deepEqual(parseListen('7777'), { host: '127.0.0.1', port: 7777 });
  assert.deepEqual(parseListen('0.0.0.0:7777'), { host: '0.0.0.0', port: 7777 });
  assert.deepEqual(parseListen('[::1]:7777'), { host: '::1', port: 7777 });
  assert.throws(() => parseListen(true), /HOST:\]PORT/);
  assert.throws(() => parseListen('localhost'), /HOST:\]PORT/);
  const loop = allowedHosts('127.0.0.1');
  assert.ok(loop.includes('localhost') && loop.includes('127.0.0.1') && !loop.includes('0.0.0.0'));
  const all = allowedHosts('0.0.0.0');
  assert.ok(all.includes('127.0.0.1'), 'bound to every address: every address of this machine');
  // The server itself, bound beyond loopback without a token: it runs, and says so loudly.
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'mcp.js'), '--http', '0.0.0.0:0'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SOT_MCP_TOKEN: '' } });
  try {
    let err = '';
    await new Promise((res, rej) => { child.stderr.on('data', (d) => { err += d; if (/WARNING/.test(err) && /JSON only|--save-dir/.test(err)) res(); }); child.on('exit', () => rej(new Error(err))); });
    assert.match(err, /MCP server .* on http:\/\/.*:\d+\/mcp/);
    assert.match(err, /WARNING: bound to 0\.0\.0\.0, beyond this machine, without a token/);
  } finally { child.kill(); }
  const bad = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'mcp.js'), '--save-dir', os.tmpdir()], { stdio: ['ignore', 'pipe', 'pipe'] });
  let msg = '';
  bad.stderr.on('data', (d) => { msg += d; });
  assert.equal(await new Promise((r) => bad.on('exit', r)), 1);
  assert.match(msg, /--save-dir is an --http option/);
});
