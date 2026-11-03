// The agent facade (src/agent/, window.TUBES) and where it lives: in the development page only. It does nothing until
// a tool calls it, listens to toast() only during a call, and the page players get carries none of it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./harness');
const page = require('../scripts/lib/page');

// Names the agent files define at the top level: none may appear in the page players get.
const AGENT_NAMES = ['TUBES', 'API_CMD', 'API_DOMAINS', 'API_RELAY', 'apiCall', 'apiDispatch', 'apiSchema', 'apiAgentStart'];

test('the facade is inert until called, and listens to the game only during a call', () => {
  const a = load({ agent: true });
  assert.equal(a.ev('toast.name'), 'toast', 'loading the page leaves toast() alone');
  assert.equal(a.ev('spend.name'), 'spend', 'and spend()');
  assert.equal(a.ev('API_TOASTS.depth'), 0);
  assert.deepEqual(JSON.parse(a.ev('JSON.stringify(TUBES.tools)')).sort(), ['act', 'actions', 'advance', 'catalog', 'city', 'classes', 'click', 'clock', 'find',
    'hot_spots', 'network', 'open_link', 'panel', 'peering_check', 'results', 'schema', 'screen', 'since', 'state', 'status', 'traceroute', 'ui'].sort());
  // Before a game there is a contract to read, and nothing else.
  assert.ok(a.ev("TUBES.call('schema',{section:'commands'}).buildPop"));
  assert.throws(() => a.ev("TUBES.call('status',{})"), /No game is running/);
  assert.throws(() => a.ev("TUBES.call('eval',{})"), /No tool "eval"/);
  a.ev('ACT.start({});S.cash=1e6;compute()');
  // A call hears what the game says while it runs, and gives toast() back after, also when it fails.
  const r = a.ev("TUBES.call('act',{action:'buyTransit',args:{city:'fra',net:'cog',tier:1}})");
  assert.equal(r.outcome, 'applied');
  assert.ok(r.toasts.some((t) => /Cogentle/.test(t)), 'the game\'s own words');
  assert.equal(a.ev('toast.name'), 'toast');
  assert.throws(() => a.ev("TUBES.call('act',{action:'buildPop',args:{city:'atlantis'}})"), /not a cityId/);
  assert.equal(a.ev('toast.name+spend.name+API_TOASTS.depth'), 'toastspend0', 'a failing call restores both');
  // A toast outside a call is the game's alone.
  a.ev("toast('hello','good')");
  assert.equal(a.ev('API_TOASTS.list.length'), 0);
  assert.deepEqual(a.errors, []);
});

test('headless and the player\'s tab share one contract; only the tab holds the dice back and names its owner', () => {
  const a = load({ agent: true });
  a.ev('ACT.start({});S.nextFail=S.day+30;compute()');
  const here = a.ev("TUBES.call('schema',{})"), there = a.ev("TUBES.call('schema',{},{relay:true})");
  for (const k of ['commands', 'view', 'drafts', 'denied', 'domains', 'results']) assert.deepEqual(here[k], there[k], k);
  assert.equal(here.mode.backend, 'headless');
  assert.equal(there.mode.backend, 'browser');
  assert.ok(there.session.startScn.refused && !here.session.startScn.refused, 'starting a scenario is the player\'s in their tab');
  assert.equal(a.ev("TUBES.call('state',{path:'nextFail'})"), a.ev('S.nextFail'), 'headless reads everything');
  assert.equal(a.ev("TUBES.call('state',{path:'nextFail'},{relay:true})"), null, 'the tab holds it back');
  assert.equal(a.ev("'rng' in TUBES.call('state',{},{relay:true})"), false);
  assert.equal(a.ev("TUBES.call('state',{path:'cash'},{relay:true})"), a.ev('S.cash'));
  assert.deepEqual(a.errors, []);
});

test('the page players get has no agent code; the development page has it', () => {
  const ship = page.assemble().html, dev = page.assemble({ dev: true }).html;
  assert.ok(!ship.includes('@include-dev'), 'the marker line is dropped whole');
  for (const n of AGENT_NAMES) {
    assert.ok(!new RegExp(`\\b${n}\\b`).test(ship), `${n} is not in the page players get`);
    assert.ok(new RegExp(`\\b${n}\\b`).test(dev), `${n} is in the development page`);
  }
  // The agent files are pasted in where the marker is, after the game, inside the same script.
  const at = dev.indexOf('/* ================= AGENT API: argument domains');
  assert.ok(at > dev.indexOf('/* ================= LOOP ================='), 'after the game');
  assert.ok(at < dev.lastIndexOf('</script>'), 'inside the game\'s script');
  assert.equal(page.shipped().html.match(/\bTUBES\b/), null, 'nor in the shipped page, labels compiled');
  // The players' page is the game alone: no facade, and it boots and plays.
  const p = load();
  assert.equal(p.ev('typeof TUBES+typeof apiCall+typeof API_CMD'), 'undefinedundefinedundefined');
  assert.equal(p.ev('JSON.stringify(HOOKS)+UI.clockLocked'), '{}false', 'no hooks, and the clock is the player\'s');
  p.ev("ACT.start({});ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});for(let i=0;i<5;i++)dayTick()");
  assert.ok(p.ev('R.served') > 0);
  assert.deepEqual(p.errors, []);
});

test('an @include-dev line only expands in the development page', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-dev-include-'));
  try {
    fs.mkdirSync(path.join(src, 'a'));
    fs.mkdirSync(path.join(src, 'b'));
    fs.writeFileSync(path.join(src, 'a', '10-a.js'), 'const A=1;\n');
    fs.writeFileSync(path.join(src, 'b', '10-b.js'), 'const B=2;\n');
    fs.writeFileSync(path.join(src, 'index.html'), '<script>\n<!-- @include a -->\n<!-- @include-dev b -->\n</script>\n');
    const ship = page.assemble({ src }), dev = page.assemble({ src, dev: true });
    assert.equal(ship.html, '<script>\nconst A=1;\n</script>\n');
    assert.equal(dev.html, '<script>\nconst A=1;\nconst B=2;\n</script>\n');
    // Error lines still map to their files in both.
    assert.deepEqual(page.locate(dev.map, 3), { file: 'b/10-b.js', line: 1 });
    assert.deepEqual(page.locate(ship.map, 3), { file: 'index.html (shell)', line: 3 });
  } finally { fs.rmSync(src, { recursive: true, force: true }); }
});
