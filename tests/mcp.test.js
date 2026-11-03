// The MCP server (scripts/mcp.js): an AI client plays, inspects and debugs the game through typed tools.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createSession, TOOLS } = require('../scripts/lib/mcp-game');

const tools = (s) => (name, args = {}) => TOOLS.find((t) => t.name === name).run(s, args);

test('speaks MCP over stdio: initialize, list tools, call one, and errors as errors', async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'mcp.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let buf = '';
  const waiters = [];
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); waiters.splice(0).forEach((w) => w()); } });
  const ask = async (msg) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
    if (msg.id === undefined) return null;
    const found = () => lines.find((l) => l.id === msg.id);
    while (!found()) await new Promise((r) => waiters.push(r));
    return found();
  };
  try {
    const init = await ask({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'seriesoftubes');
    assert.ok(init.result.capabilities.tools);
    assert.equal((await ask({ id: 9, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).result.protocolVersion, '2025-11-25', 'an unknown version gets the newest');
    await ask({ method: 'notifications/initialized' });
    const list = await ask({ id: 2, method: 'tools/list' });
    const names = list.result.tools.map((t) => t.name);
    for (const n of ['new_game', 'load_save', 'export_save', 'status', 'advance', 'network', 'city', 'find', 'traceroute', 'peering_check', 'hot_spots', 'actions', 'act', 'screen', 'panel', 'click', 'open_link', 'schema', 'catalog', 'state', 'results', 'ui']) assert.ok(names.includes(n), n);
    assert.ok(list.result.tools.every((t) => t.description && t.inputSchema && t.inputSchema.type === 'object'));
    const st = await ask({ id: 3, method: 'tools/call', params: { name: 'status', arguments: {} } });
    assert.equal(st.result.isError, undefined);
    assert.equal(JSON.parse(st.result.content[0].text).home, 'Frankfurt', 'a game is loaded from the start');
    const bad = await ask({ id: 4, method: 'tools/call', params: { name: 'network', arguments: { network: 'no such thing at all' } } });
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /No network matches/);
    assert.equal((await ask({ id: 5, method: 'tools/call', params: { name: 'nope' } })).error.code, -32602);
    assert.equal((await ask({ id: 6, method: 'resources/list' })).error.code, -32601);
    assert.equal(lines.filter((l) => l.id === undefined).length, 0, 'notifications get no answer');
  } finally {
    child.kill();
  }
});

test('plays like a player: buy, answer the quote by its button, and run time forward', () => {
  const s = createSession(), T = tools(s);
  T('new_game', { city: 'fra', name: 'Test Tubes', seed: 7 });
  T('act', { action: 'launchBB', args: { city: 'fra' } });
  const tr = T('act', { action: 'buyTransit', args: { city: 'fra', net: 'cog', tier: 1 } });
  assert.ok(tr.toasts.some((t) => /Cogentle transit is live/.test(t)));
  const ix = T('act', { action: 'buyIx', args: { city: 'fra', tier: 1 } });
  assert.equal(ix.screen.where, 'modal', 'the DE-KICKS quote opens');
  const sign = ix.screen.buttons.find((b) => b.act === 'dkAccept');
  assert.ok(sign, 'with a Sign button');
  assert.throws(() => T('advance', { days: 1 }), /window is open/, 'no days pass behind an open window');
  const signed = T('click', { button: sign.n });
  assert.ok(signed.toasts.some((t) => /Port up at DE-KICKS/.test(t)));
  assert.equal(T('city', { city: 'fra' }).exchanges.find((x) => x.id === 'fra').yourPort, true);
  const a = T('advance', { days: 30 });
  assert.equal(a.daysRun, 30);
  assert.equal(T('status').day, 30);
  assert.ok(a.log.length > 0 && a.timing.totalMs > 0);
  // links go through the game's own build window
  const w = T('open_link', { from: 'fra', to: 'Amsterdam' });
  const b100 = w.screen.buttons.find((b) => b.act === 'buildLink' && b.args.tier === 1);
  T('click', { button: b100.n });
  assert.ok(T('status').pops.includes('Amsterdam'));
  assert.deepEqual(s.errors(), []);
});

test('the same seed and the same moves give the same game', () => {
  const run = () => {
    const s = createSession(), T = tools(s);
    T('new_game', { city: 'sin', seed: 42, name: 'Twin' });
    T('act', { action: 'launchBB', args: { city: 'sin' } });
    T('act', { action: 'buyTransit', args: { city: 'sin', net: 'ntt', tier: 1 } });
    T('advance', { days: 90 });
    const st = T('status');
    return [st.cash, st.traffic.servedGbps, st.incidents.length];
  };
  assert.deepEqual(run(), run());
});

test('reads the world and the network: networks, cities, search, traceroute, peering and hot spots', () => {
  const s = createSession(), T = tools(s);
  T('act', { action: 'launchBB', args: { city: 'fra' } });
  T('act', { action: 'buyTransit', args: { city: 'fra', net: 'cog', tier: 1 } });
  const dt = T('network', { network: 'Doitsche' });
  assert.equal(dt.type, 'Tier 1');
  assert.equal(dt.neededForTier1, true);
  assert.match(dt.you.howToPeer, /Paid peering only/);
  assert.equal(T('network', { network: '3203' }).id, 'dtk', 'by ASN too');
  const ams = T('city', { city: 'Amsterdam' });
  assert.ok(ams.exchanges.length >= 2 && ams.transit.length > 3);
  assert.deepEqual(ams.transit.map((x) => x.perGbps), ams.transit.map((x) => x.perGbps).slice().sort((x, y) => x - y), 'cheapest transit first');
  assert.ok(T('find', { query: 'marea' }).cables.length >= 1);
  assert.ok(T('find', { query: 'kicks', kind: 'exchange' }).exchanges.some((x) => x.id === 'fra'));
  const t = T('traceroute', { from: 'Frankfurt', to: 'ggl' });
  assert.match(t.text, /traceroute to www\.goggle/);
  assert.equal(t.asPath[1], 714, 'out through Cogentle');
  assert.throws(() => T('traceroute', { from: 'Tokyo', to: 'ggl' }), /no POP in Tokyo/);
  const p = T('peering_check', { network: 'nfx' });
  assert.ok(p.checks.some((c) => c.via === 'pni' && c.ok === false && /Gbps/.test(c.why)));
  const h = T('hot_spots', { limit: 3 });
  assert.equal(h.transitPorts[0].carrier, 'Cogentle');
  assert.ok(h.biggestTrafficStillOnTransit.length > 0);
  const st = T('status');
  assert.match(st.whyNotTier1, /you buy transit/);
  assert.ok(st.monthly.costBy.transit > 0);
  assert.deepEqual(s.errors(), []);
});

test('panels and the network list read as text with buttons', () => {
  const s = createSession(), T = tools(s);
  const p = T('panel', { city: 'fra', tab: 'peer' });
  assert.equal(p.where, 'panel');
  assert.match(p.text, /DE-KICKS/);
  assert.ok(p.buttons.some((b) => b.act === 'tab'));
  const l = T('panel', { network: 'ggl' });
  assert.equal(l.where, 'left');
  assert.match(l.text, /Goggle/);
  assert.deepEqual(s.errors(), []);
});

test('saves go out and come back, and a bug report save loads as the game loads it', () => {
  const s = createSession(), T = tools(s);
  T('act', { action: 'launchBB', args: { city: 'fra' } });
  T('advance', { days: 12 });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-mcp-')), 'save.json');
  const out = T('export_save', { path: file });
  assert.ok(out.bytes > 1000);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(j.app, 'series-of-tubes');
  assert.match(j.version, /^\d+\.\d+\.\d+$/, 'stamped with the version, like a real export');
  const cash = T('status').cash;
  T('new_game', { city: 'nyc' });
  const back = T('load_save', { path: file });
  assert.equal(back.day, 12);
  assert.equal(back.cash, cash);
  assert.throws(() => T('load_save', { json: '{"nope":1}' }), /does not look like/);
  assert.throws(() => T('load_save', {}), /either path or json/);
  // the big benchmark network, as a stand-in for a player's late-game save
  const big = T('load_save', { path: path.join(__dirname, 'fixtures', 'big-network.json') });
  assert.equal(big.name, 'Shinternet');
  assert.ok(T('hot_spots', { limit: 2 }).transitPorts.length === 2);
  assert.deepEqual(s.errors(), []);
});

test('only game actions: files, slots, settings and the clock stay out of reach', () => {
  const s = createSession(), T = tools(s);
  const acts = T('actions');
  assert.ok(acts.includes('buyTransit(city,net,tier)'), 'with their arguments');
  assert.ok(acts.includes('pni(city,net,tier)'));
  for (const no of ['slotDel', 'exportSave', 'importPick', 'langSet', 'speed', 'resetAsk']) assert.ok(!acts.some((a) => a.split('(')[0] === no), no);
  assert.throws(() => T('act', { action: 'slotDelGo' }), /not available/);
  assert.throws(() => T('act', { action: 'speed', args: { s: 4 } }), /use advance/);
  assert.throws(() => T('act', { action: 'noSuchThing' }), /no action/);
  assert.throws(() => T('click', { button: 99 }), /No button 99/);
});
