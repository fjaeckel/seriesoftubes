// The agent relay (scripts/agent/relay.js): a WebSocket router between the game page (src/agent/80-relay.js, agent
// mode in Settings) and tool clients. This drives the whole chain with a real page: the harness loads the game
// in jsdom, the page's own client dials the relay (a test opts in with __AGENT_RELAY_TEST__ and points it at the
// relay's port, because under __TUBES_TEST__ nothing dials on its own), and a raw WebSocket tool client, the relay
// client (scripts/lib/relay-client.js) and the MCP server in browser mode (scripts/mcp.js --browser) take turns driving
// it. No token anywhere: whatever can connect to the port may drive the game, by design.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const WebSocket = require('ws');
const { load } = require('./harness');

const ROOT = path.join(__dirname, '..');
const { createRelay } = require('../scripts/agent/relay');
const { createRelaySession } = require('../scripts/lib/relay-client');
const SERVER = path.join(ROOT, 'scripts', 'mcp.js');
const { wait, until, freePort, kill } = require('./net');
let PORT;                                                     // a free one from the OS, before the first test
test.before(async () => { PORT = await freePort(); });

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-relay-'));

// The relay in-process, riding a real http.Server (the same createRelay the servers host): no child to leak, and
// 'listening' means the first dial cannot race the bind.
let CUR = null;                                               // the relay started last
function startRelay(port = PORT) {
  const srv = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  const relay = createRelay({ server: srv });
  return CUR = {
    relay, srv,
    listening: () => new Promise((res, rej) => { srv.once('error', rej); srv.listen(port, '127.0.0.1', res); }),
    close: () => new Promise((r) => { relay.close(); srv.close(() => r()); }),
  };
}

// The game page: jsdom via the harness, agent mode on (opts.ms: the clock, 0 for the agent's). The page's own client
// connects to this relay's host:port as the page. The harness origin matches the relay host, so the page's WebSocket
// Origin is same-origin (the relay refuses a foreign one; a Node tool sends none).
function page(opts = {}) {
  const a = load({ url: `http://127.0.0.1:${opts.port ?? PORT}/`, seed: opts.seed ?? 5, storage: { 'sot-agent': JSON.stringify({ on: true, ms: opts.ms ?? 60000 }) }, agent: true });
  dial(a, opts.port);
  return a;
}
const dial = (a, port = PORT) => a.ev(`window.__AGENT_RELAY_TEST__=true;API_RELAY_HOST='127.0.0.1:'+${port};apiAgentSync()`);
// Waits until the relay holds this page and the page knows how many tools are there (the clock follows that count).
async function joined(a) {
  assert.ok(await until(() => { const s = CUR.relay.status(); return s.page && a.ev('API_RELAY.tools') === s.tools; }), 'the page joined the relay');
}
// Waits until the page has heard the relay's tool count: its clock runs or holds by it.
const heard = async (a, n) => assert.ok(await until(() => a.ev('API_RELAY.tools') === n), `the page sees ${n} tool(s)`);
// Kill the page's dial and retry timer before a test ends, or its backoff keeps the process alive.
const stop = (...ps) => { for (const a of ps) if (a) a.ev("window.__AGENT_RELAY_TEST__=false;apiAgentSet('on',false)"); };

// A raw tool client, the way the MCP server speaks to the relay. `headers` fakes a browser's Origin (which Node's ws
// does not send) for the cross-site test.
function toolClient(port = PORT, headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`, headers ? { headers } : undefined);
  const calls = new Map();
  let seq = 0;
  const events = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.kind === 'presence') { events.push(m); return; }
    if (m.kind === 'result' && calls.has(m.id)) { calls.get(m.id)(m); calls.delete(m.id); }
  });
  return {
    ws, events,
    open: () => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
    auth: (role = 'tool') => ws.send(JSON.stringify({ kind: 'auth', role })),
    call: (tool, args) => new Promise((res) => {                    // a timeout, never a hang
      const id = 'c' + (++seq);
      const t = setTimeout(() => { calls.delete(id); res({ error: `no answer for ${tool} (the page went silent?)` }); }, 20000);
      calls.set(id, (m) => { clearTimeout(t); res(m); });
      ws.send(JSON.stringify({ kind: 'call', id, tool, args: args || {} }));
    }),
    close: () => { try { ws.close(); } catch {} },
  };
}
// A tool that has been let in: the relay's first presence message comes right after the role is granted.
async function tool(port = PORT) { const t = toolClient(port); await t.open(); t.auth('tool'); assert.ok(await until(() => t.events.length > 0), 'the relay let the tool in'); return t; }

async function withRelay(fn) {
  const r = startRelay();
  await r.listening();
  try { return await fn(r); } finally { await r.close(); }
}

// The MCP server over stdio, as a client runs it.
function mcp(argv, onErr) {
  const child = spawn(process.execPath, [SERVER, ...argv], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0, err = '';
  const waiting = new Map();
  child.stderr.on('data', (d) => { err += d; if (onErr) onErr(String(d)); });
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id !== undefined && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    }
  });
  const send = (o) => new Promise((res) => { const k = ++id; waiting.set(k, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, ...o }) + '\n'); });
  return {
    child, send, stderr: () => err,
    init: async () => { const r = await send({ method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'); return r; },
    call: async (name, args) => (await send({ method: 'tools/call', params: { name, arguments: args || {} } })).result,
    json: async (name, args) => JSON.parse((await send({ method: 'tools/call', params: { name, arguments: args || {} } })).result.content[0].text),
    kill: () => kill(child),
  };
}

test('the relay binds loopback, gates on the role, and never needs a token', () => withRelay(async () => {
  const silent = toolClient();
  await silent.open();
  assert.equal(await new Promise((res) => silent.ws.on('close', (code) => res(code))), 4003, 'a client that never states a role is closed');
  const bogus = toolClient();
  await bogus.open();
  bogus.auth('hacker');
  assert.equal(await new Promise((res) => bogus.ws.on('close', (code) => res(code))), 4001, 'a role that is neither page nor tool is refused');
  const t = await tool();
  assert.deepEqual(t.events.map((e) => e.page), [false], 'a fresh tool sees no page');
  const r = await t.call('state', { path: 'cash' });
  assert.match(r.error, /no game page connected/i);
  t.close();
}));

test('a live page answers tool calls through the relay, from a fixed list of tools', () => withRelay(async () => {
  const t = await tool();
  const a = page();
  try {
    a.ev("ACT.start({});S.cash=500000;compute()");
    assert.ok(await until(() => t.events.some((e) => e.page === true)), 'the tools see the page join');
    await joined(a);
    const q = await t.call('act', { action: 'buildPop', args: { city: 'ams' }, dryRun: true });
    assert.equal(q.value.outcome, 'quote');
    assert.equal(q.value.quote.setup, 20000);
    assert.equal(a.ev('S.pops.ams'), undefined, 'nothing was dispatched in the page');
    const r = await t.call('act', { action: 'buildPop', args: { city: 'ams' } });
    assert.equal(r.value.outcome, 'applied');
    assert.equal(r.value.charged, 20000);
    assert.equal(a.ev('S.pops.ams && S.pops.ams.day'), 0, 'the page really changed');
    assert.equal(r.dayBefore, 0);
    assert.equal((await t.call('state', { path: 'cash' })).value, 480000);
    assert.equal((await t.call('status')).value.pops.length, 2);
    const nope = await t.call('act', { action: 'speed', args: { v: 0 } });
    assert.match(nope.error, /not available here/);
    // Unknown tools never reach the facade: its fixed list is the whole vocabulary.
    const hack = await t.call('eval', { code: 'S.cash=1e9' });
    assert.match(hack.error, /no tool "eval"/);
    assert.equal(a.ev('S.cash'), 480000);
    assert.equal(a.ev('API_TOASTS.depth===0&&API_TOASTS.real===null&&toast.name'), 'toast', 'toast() is the game\'s own again after every call');
  } finally { stop(a); t.close(); }
}));

test('in the player\'s tab the player owns the game, their windows, their settings and the dice', () => withRelay(async () => {
  const t = await tool();
  const a = page({ ms: 0 });
  try {
    a.ev("ACT.start({});S.cash=1e7;S.nextFail=S.day+40;S.nextEvent=S.day+50;compute()");
    await joined(a);
    // The dice stay hidden, whole or by path, and the schema says so.
    const st = (await t.call('state')).value;
    for (const k of ['rng', 'nextFail', 'nextEvent']) assert.ok(!(k in st), `${k} is held back`);
    assert.equal((await t.call('state', { path: 'nextFail' })).value, null);
    assert.equal(st.cash, 1e7, 'the board itself is all there');
    const mode = (await t.call('schema', { section: 'mode' })).value;
    assert.equal(mode.backend, 'browser');
    assert.equal(mode.clock, 'agent');
    assert.ok(mode.withheld.nextFail);
    assert.ok((await t.call('schema', { section: 'state' })).value.rng.withheld);
    // Starting, loading or leaving a game is the player's.
    for (const [action, args] of [['startScn', { id: a.ev('SCN[0].id') }], ['pzStart', { id: a.ev('PZ[0].id') }], ['startWeekly', {}]]) {
      const r = await t.call('act', { action, args });
      assert.match(r.error || '', /the player's/, action);
    }
    assert.equal(a.ev('S.mode'), 'normal');
    // So are their settings, agent mode's own switch included: it is no game action, so no tool can find or press it.
    assert.match((await t.call('act', { action: 'prefSet', args: { v: 'pauseFurious:0' } })).error, /not available here/);
    assert.match((await t.call('act', { action: 'agentSet', args: {} })).error, /no action/);
    assert.equal(a.ev('API_AGENT_PREFS.on'), true);
    // A window the player opened by hand stays theirs: the agent plays behind it, and never closes or replaces it.
    a.ev("(()=>{const b=document.createElement('button');b.dataset.act='settings';document.body.appendChild(b);b.click();b.remove();})()");
    assert.equal(a.ev("$('modal').hidden"), false, 'the player has a window open');
    assert.equal(a.ev('API_MODAL.hand'), true, 'marked as theirs');
    const html = a.ev("$('modalCard').innerHTML");
    const sc = (await t.call('screen')).value;
    assert.equal(sc.where, 'modal');
    assert.ok(sc.playerWindow, 'the screen says whose it is');
    assert.equal(sc.question, false, 'and that it is no question');
    const b = await t.call('act', { action: 'buildPop', args: { city: 'ams' } });
    assert.equal(b.value.outcome, 'applied', 'the agent plays on behind it');
    const v = await t.call('act', { action: 'opsOpen' });
    assert.equal(v.value.screen.where, 'modal');
    assert.match(v.value.screen.note || '', /shown to you and closed again/, 'its own sheet is shown, then the player\'s window comes back');
    await t.call('act', { action: 'closeModal' });
    assert.equal(a.ev("$('modal').hidden"), false, 'closeModal does not close the player\'s window');
    assert.equal(a.ev("$('modalCard').innerHTML"), html, 'nor change it');
    await t.call('screen', { where: 'modal' });
    const c = await t.call('click', { button: 0 });
    assert.match(c.error || '', /theirs to press/);
    assert.match((await t.call('open_link', { from: 'fra', to: 'nyc' })).error || '', /would replace it/);
    // Days run behind it (the agent's clock here), and it is still there after.
    const adv = await t.call('advance', { days: 3 });
    assert.equal(adv.value.daysRun, 3);
    assert.equal(a.ev('S.day'), 3);
    assert.equal(a.ev("$('modalCard').innerHTML"), html);
  } finally { stop(a); t.close(); }
}));

test('the agent\'s clock moves only with advance; a running clock only with time, and wait reads it', () => withRelay(async () => {
  const t = await tool();
  const a = page({ ms: 0 });
  try {
    a.ev("ACT.start({});S.cash=1e7;compute()");
    await joined(a);
    assert.equal(a.ev('UI.speed'), 0, 'a tool is connected, but the agent\'s clock stands still');
    a.ev('last=performance.now();for(let i=1;i<=20;i++)frame(last+i*250)');
    assert.equal(a.ev('S.day'), 0, 'the loop runs no days');
    const adv = await t.call('advance', { days: 20 });
    assert.equal(adv.value.daysRun, 20, 'advance runs them, where the player sees them');
    assert.equal(a.ev('S.day'), 20);
    assert.match((await t.call('clock')).value.mode, /agent/);
    // The player switches to a pace: the clock runs by itself, and advance is refused.
    a.ev("apiAgentSet('ms',30000)");
    assert.equal(a.ev('UI.speed'), a.ev('DAY_MS/30000'), 'a pace, and a tool connected: it runs, a day per 30 s');
    assert.match((await t.call('advance', { days: 1 })).error, /use wait/);
    const c = (await t.call('clock')).value;
    assert.equal(c.mode, 'realtime');
    assert.equal(c.running, true);
    // The page's own loop moves days at the pace (the test plays the browser's frames, 2 s of them per day).
    a.ev('API_AGENT_PREFS.ms=2000;apiAgentSync()');
    a.ev('last=performance.now()');
    const frames = setInterval(() => a.ev('frame(performance.now())'), 20);
    try {
      const { createBrowserSession } = require('../scripts/lib/mcp-browser');
      const { TOOLS } = require('../scripts/lib/mcp-game');
      const s = createBrowserSession({ port: PORT });
      const w = await TOOLS.find((x) => x.name === 'wait').run(s, { days: 1, maxSeconds: 10 });
      assert.ok(w.daysRun >= 1, `wait returns once a day has passed (${JSON.stringify(w)})`);
      assert.equal(w.stoppedBecause, null);
      await s.close();
    } finally { clearInterval(frames); }
  } finally { stop(a); t.close(); }
}));

test('the page client reconnects after the relay restarts, and stops when the player switches agent mode off', () => withRelay(async (r) => {
  const t = await tool();
  const a = page();
  try {
    a.ev("ACT.start({});S.cash=500000;compute()");
    assert.ok(await until(() => t.events.some((e) => e.page === true)));
    await r.close();
    assert.ok(await until(() => a.ev('!API_RELAY.ws||API_RELAY.ws.readyState!==1')), 'the page saw the relay go');
    a.ev("apiAgentSet('on',false)");
    const r2 = startRelay();
    await r2.listening();
    try {
      await wait(1200);                                        // past the first backoff retry: it must not dial
      assert.equal(a.ev('API_RELAY.on'), false, 'the client is off');
      assert.equal(r2.relay.status().page, false, 'and never dialled');
      a.ev("apiAgentSet('on',true)");
      await joined(a);
      const t2 = await tool();
      assert.ok(t2.events.some((e) => e.page === true), 'the page reconnected after the relay came back');
      assert.equal((await t2.call('state', { path: 'cash' })).value, 500000, 'and answers calls again');
      t2.close();
    } finally { stop(a); await r2.close(); }
  } finally { stop(a); t.close(); }
}));

test('a paced clock holds while no tool is connected, and runs when one arrives', () => withRelay(async () => {
  const a = page({ seed: 5 });
  try {
    a.ev("ACT.start({});S.nextFail=S.day+99;S.nextEvent=S.day+99;compute()");
    await joined(a);
    assert.equal(a.ev('UI.speed'), 0, 'no tool connected: the clock holds');
    assert.equal(a.ev('UI.clockLocked'), true, 'agent mode stays on');
    a.ev('last=performance.now();frame(last);frame(last+250);frame(last+500)');
    assert.equal(a.ev('S.day'), 0, 'no day ran');
    const t = await tool();
    await heard(a, 1);
    assert.ok(a.ev('UI.speed') > 0, 'a tool connecting runs it');
    t.close();
    await heard(a, 0);
    assert.equal(a.ev('UI.speed'), 0, 'the tool leaving holds it again');
    a.ev('S.uiSpeed=4;gameResume()');
    assert.equal(a.ev('UI.speed'), 0, 'gameResume holds with no tool connected');
    const t2 = await tool();
    await heard(a, 1);
    assert.ok(a.ev('UI.speed') > 0, 'and a tool arriving runs it again');
    // An unrelated preference change does not drop the connection or hold the clock.
    a.ev('window.__w0=API_RELAY.ws');
    a.ev("ACT.prefSet({v:'pauseFurious:0'})");
    a.ev("apiAgentSet('ms',300000)");
    assert.equal(a.ev('API_RELAY.ws===window.__w0'), true, 'the same socket survived both');
    assert.equal(a.ev('UI.speed'), a.ev('DAY_MS/300000'), 'the clock never held for them, and runs at the new pace');
    t2.close();
  } finally { stop(a); }
}));

test('a second page replaces the first: one game per relay, the newest tab wins', () => withRelay(async () => {
  const a = page({ seed: 5 });
  a.ev("ACT.start({});S.cash=111000;compute()");
  await joined(a);                                             // in that order: two dials at once may land either way
  const b = page({ seed: 6 });
  b.ev("ACT.start({});S.cash=222000;compute()");
  assert.ok(await until(() => a.ev('API_RELAY.on') === false), 'the first page yields to the second');
  await joined(b);
  const t = await tool();
  try {
    assert.equal((await t.call('state', { path: 'cash' })).value, 222000, 'the newest page answers');
  } finally { stop(a, b); t.close(); }
}));

test('the MCP server drives the player\'s page in browser mode, over stdio', () => withRelay(async () => {
  const a = page({ seed: 9, ms: 0 });
  a.ev("ACT.start({});S.cash=1000000;compute()");
  await joined(a);
  const m = mcp(['--browser', '--relay-host', 'localhost', '--relay-port', String(PORT)]);
  try {
    const init = await m.init();
    assert.match(init.result.instructions, /player's own browser tab/);
    const list = (await m.send({ method: 'tools/list' })).result.tools.map((x) => x.name);
    for (const n of ['status', 'act', 'schema', 'state', 'advance', 'wait', 'screen', 'click']) assert.ok(list.includes(n), n);
    for (const n of ['new_game', 'load_save', 'export_save']) assert.ok(!list.includes(n), `${n} is the headless session's`);
    const mode = await m.json('schema', { section: 'mode' });
    assert.equal(mode.backend, 'browser');
    assert.equal(mode.transport, 'relay');
    assert.equal(mode.relay, `ws://localhost:${PORT}/agent`, 'the mode says which relay: host, port and path');
    assert.equal(await m.json('state', { path: 'cash' }), 1000000);
    const r = await m.json('act', { action: 'buildPop', args: { city: 'ams' } });
    assert.equal(r.outcome, 'applied');
    assert.equal(r.charged, 20000);
    assert.equal(a.ev('S.pops.ams && S.pops.ams.day'), 0, "the player's page really changed");
    assert.equal((await m.json('advance', { days: 2 })).daysRun, 2);
    assert.ok((await m.json('actions')).includes('buildLink(a,b,tier,cable?,route?,premiumCrossing?)'));
    const no = await m.call('act', { action: 'startScn', args: { id: a.ev('SCN[0].id') } });
    assert.equal(no.isError, true);
    assert.match(no.content[0].text, /the player's/);
  } finally { stop(a); await m.kill(); }
}));

test('a game page older than the code stops the server rather than mislead', () => withRelay(async () => {
  const a = page({ seed: 3 });
  a.ev("ACT.start({});compute()");
  // A stale tab whose commands keep their names but change shape: only a deep compare of the sections catches it.
  a.ev('const __c=TUBES.call;TUBES.call=(t,x,c)=>{const v=__c(t,x,c);if(t==="schema"&&!x.section)v.commands.buildPop.args=[{name:"city",required:true}];return v;};');
  await joined(a);
  const m = mcp(['--browser', '--relay-port', String(PORT), '--page-wait-ms', '8000']);
  try {
    const init = await m.init();
    assert.ok(init.result.serverInfo, 'the handshake is answered at once');
    const code = await new Promise((r) => m.child.on('exit', (c2) => r(c2)));
    assert.equal(code, 1, 'the server exits with an error');
    assert.match(m.stderr(), /disagrees with the code on disk \(commands\)/);
    assert.match(m.stderr(), /reload the page/);
  } finally { stop(a); await m.kill(); }
}));

test('the MCP server answers the handshake at once and waits for the game page', () => withRelay(async () => {
  const gone = mcp(['--browser', '--relay-port', String(PORT), '--page-wait-ms', '1200']);
  const code = await new Promise((r) => gone.child.on('exit', (c2) => r(c2)));
  assert.equal(code, 1, 'exits 1 without a page');
  assert.match(gone.stderr(), /waiting for the game page/);
  assert.match(gone.stderr(), /no game page answered/);
  assert.match(gone.stderr(), /Settings → Agent API/);
  assert.doesNotMatch(gone.stderr(), /TypeError/);
  const m = mcp(['--browser', '--relay-port', String(PORT), '--page-wait-ms', '20000']);
  let a = null;
  try {
    const t0 = Date.now();
    await m.init();
    // Far below the page wait (20 s), with room for a slow start of the process on a busy runner.
    assert.ok(Date.now() - t0 < 10000, 'initialize does not wait for a browser tab');
    const early = await m.call('status');
    assert.equal(early.isError, true, 'a tool before the page arrives is an error, not a hang');
    await until(() => /waiting for the game page/.test(m.stderr()));
    assert.match(m.stderr(), /waiting for the game page/);
    a = page({ seed: 4 });
    a.ev("ACT.start({});S.cash=444000;compute()");
    await until(() => /ready/.test(m.stderr()));
    assert.match(m.stderr(), /ready/, 'the server proceeded once the page answered');
    assert.equal(await m.json('state', { path: 'cash' }), 444000, 'and drives the late page');
  } finally { stop(a); await m.kill(); }
}));


test('dev.js binds loopback and parses --port; the page dials its own host', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev.js'), '--port', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] });
  let serr = '';
  child.stderr.on('data', (d) => { serr += d; });
  let a = null;
  try {
    const banner = new RegExp(`agent relay on ws://127\\.0\\.0\\.1:${port}/agent`);
    await until(() => banner.test(serr));                      // dev.js builds the page first: seconds on a busy runner
    assert.match(serr, banner, 'dev.js binds loopback and honours --port');
    const t = await tool(port);
    assert.ok(t.events.some((e) => e.page === false), 'the relay answers on 127.0.0.1');
    t.close();
    a = load({ url: `http://127.0.0.1:${port}/`, agent: true, storage: { 'sot-agent': JSON.stringify({ on: true }) } });
    assert.equal(a.ev('API_RELAY.on'), false, 'under __TUBES_TEST__ nothing dials on its own');
    a.ev(`window.__AGENT_RELAY_TEST__=true;API_RELAY_HOST='';apiAgentSync()`);
    assert.equal(a.ev('API_RELAY.on'), true);
    assert.equal(a.ev('apiRelayUrl()'), `ws://127.0.0.1:${port}/agent`, 'its own host and port, the relay path');
  } finally {
    stop(a);
    await kill(child);
  }
});

test('calls neither page nor relay can answer resolve as errors, not hangs', async () => {
  const r = startRelay();
  await r.listening();
  const pages = [];
  try {
    const t = await tool();
    const a = page();
    pages.push(a);
    a.ev('ACT.start({});S.cash=500000;compute()');
    await joined(a);
    // The page dies with a call in flight; it is silenced first, so the call is provably pending when it closes.
    a.ev('API_RELAY.ws.onmessage=()=>{}');
    const p = t.call('act', { action: 'buildPop', args: { city: 'ams' } });
    assert.ok(await until(() => r.relay.status().calls === 1), 'the call reached the relay');
    a.ev('API_RELAY.ws.close(1000)');
    assert.match((await p).error || '', /disconnected before answering/i);
    stop(a);
    t.close();
    // The relay dies under a call in flight: the client answers on its own behalf, at once.
    const b = page({ seed: 12 });
    pages.push(b);
    b.ev('ACT.start({});S.cash=222000;compute()');
    await joined(b);
    b.ev('API_RELAY.ws.onmessage=()=>{}');
    const s = createRelaySession({ host: '127.0.0.1', port: PORT });
    const p2 = s.call('state', { path: 'cash' });
    assert.ok(await until(() => r.relay.status().calls === 1), 'the call reached the relay');
    await r.close();
    assert.match((await p2).refused || '', /connection closed/i);
    await s.close();
  } finally {
    for (const pg of pages) stop(pg);
    await r.close();
  }
});

test('a page that hangs on a call answers within --call-ms, not minutes later', () => withRelay(async () => {
  const a = page({ seed: 4 });
  try {
    a.ev('ACT.start({});compute()');
    await joined(a);
    a.ev('API_RELAY.ws.onmessage=()=>{}');            // connected, alive, and never answering
    const s = createRelaySession({ host: '127.0.0.1', port: PORT, callMs: 300 });
    const t0 = Date.now();
    const r = await s.call('state', { path: 'cash' });
    assert.match(r.refused || '', /no answer from the game page in 0\.3 s/);
    assert.ok(Date.now() - t0 < 10000, 'the configured timeout, not the default (30 s)');
    assert.equal(createRelaySession({}).config.callMs, 30000, 'the default is 30 s');
    await s.close();
  } finally { stop(a); }
}));

test('the relay refuses a cross-site Origin and takes a same-origin page or a token-less tool', () => withRelay(async () => {
  const evil = toolClient(PORT, { Origin: 'http://evil.example' });
  await evil.open();
  assert.equal(await new Promise((res) => evil.ws.on('close', (code) => res(code))), 4004, 'refused before any role is granted');
  // DNS rebinding: evil.example re-pointed at 127.0.0.1 is "same-origin" with itself, but the Host is a name.
  const rebound = toolClient(PORT, { Host: `evil.example:${PORT}`, Origin: `http://evil.example:${PORT}` });
  await rebound.open();
  assert.equal(await new Promise((res) => rebound.ws.on('close', (code) => res(code))), 4004, 'a rebound DNS name is refused');
  const named = toolClient(PORT, { Host: `evil.example:${PORT}` });
  await named.open();
  assert.equal(await new Promise((res) => named.ws.on('close', (code) => res(code))), 4004, 'with or without an Origin');
  const same = toolClient(PORT, { Origin: `http://127.0.0.1:${PORT}` });
  await same.open();
  same.auth('page');
  const t = await tool();
  await until(() => same.events.some((e) => e.tools === 1));
  assert.ok(same.events.some((e) => e.tools === 1), 'the same-origin page connects and sees the tool');
  t.close(); same.close();
}));

// Spawns a server script and resolves with the address its relay banner reports (server.address()).
function bannerOf(argv) {
  const child = spawn(process.execPath, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
  let serr = '';
  return new Promise((res) => {
    const done = (v) => { clearTimeout(t); child.kill('SIGKILL'); res(v); };
    const t = setTimeout(() => done({ addr: null, serr }), 30000);   // dev.js builds the page first
    child.stderr.on('data', (d) => { serr += d; const m = /agent relay on ws:\/\/(\S+)\/agent/.exec(serr); if (m) done({ addr: m[1], serr }); });
  });
}

test('dev.js: a bare --host binds loopback, never every interface; binding wider is the operator\'s choice, and said', async () => {
  const p1 = await freePort();
  const dev = await bannerOf([path.join(ROOT, 'scripts', 'dev.js'), '--host', '--port', String(p1)]);
  assert.equal(dev.addr, `127.0.0.1:${p1}`, `the socket is bound to loopback (${dev.serr})`);
  const p2 = await freePort();
  const wide = await bannerOf([path.join(ROOT, 'scripts', 'dev.js'), '--host', '0.0.0.0', '--port', String(p2)]);
  assert.equal(wide.addr, `0.0.0.0:${p2}`, 'the banner is the real socket, not the flag echoed back');
  assert.match(wide.serr, /bound to 0\.0\.0\.0, so anything that can reach this address can drive/);
});

test('browser mode over HTTP: a client connects to the server, the server to the player\'s page', () => withRelay(async () => {
  const a = page({ seed: 11, ms: 0 });
  a.ev("ACT.start({});S.cash=555000;compute()");
  await joined(a);
  const child = spawn(process.execPath, [SERVER, '--browser', '--relay-port', String(PORT), '--http', '127.0.0.1:0'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  try {
    const port = await new Promise((res, rej) => {
      child.stderr.on('data', (d) => { err += d; const m = /on http:\/\/127\.0\.0\.1:(\d+)\/mcp/.exec(err); if (m) res(+m[1]); });
      child.on('exit', () => rej(new Error(err)));
    });
    const post = (body) => new Promise((res, rej) => {
      const data = JSON.stringify({ jsonrpc: '2.0', id: 1, ...body });
      // A fresh connection each time (agent: false): a kept-alive one can be closed by the server's idle timer just
      // as the next request goes out on it, which a slow runner hits now and then (ECONNRESET).
      const req = http.request({ agent: false, host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', 'content-length': Buffer.byteLength(data) } }, (r) => {
        let t = ''; r.setEncoding('utf8'); r.on('data', (d) => { t += d; });
        r.on('end', () => { const line = t.split('\n').find((l) => l.startsWith('data: ')); res(JSON.parse(line ? line.slice(6) : t)); });
      });
      req.on('error', (e) => rej(new Error(`${e.message}; the server said: ${err}`))); req.end(data);
    });
    const init = await post({ method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    assert.match(init.result.instructions, /player's own browser tab/);
    const r = await post({ method: 'tools/call', params: { name: 'state', arguments: { path: 'cash' } } });
    assert.equal(JSON.parse(r.result.content[0].text), 555000, 'the player\'s game, through HTTP and the relay');
    const no = await post({ method: 'tools/call', params: { name: 'new_game', arguments: {} } });
    assert.ok(no.error || (no.result && no.result.isError), 'no new_game in the player\'s tab');
  } finally { stop(a); await kill(child); }
}));
