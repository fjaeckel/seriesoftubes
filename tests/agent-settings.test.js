// Agent mode in the player's tab (src/agent/75-mode.js, 85-ticker.js): its own switch and clock in Settings, kept
// apart from the game's preferences; the gate that keeps it off the public site; the speed the save remembers across
// it; the badge that stands in for the speed buttons; and the clock that keeps running where frames do not.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const prefs = (ms = 60000, on = true) => ({ 'sot-agent': JSON.stringify({ on, ms }) });
const agent = (o = {}) => load({ agent: true, storage: prefs(o.ms), ...o });
// Press one of agent mode's own Settings buttons, as the player does.
const press = (a, v) => a.ev(`(()=>{ACT.settings({});const b=document.querySelector('[data-agent-set="${v}"]');b.click();return true;})()`);

test('the clock buttons set the pace, or give the clock to the agent, and are remembered', () => {
  const a = agent();
  a.ev('ACT.start({});S.cash=1e9;compute()');
  for (const m of [30000, 60000, 120000, 300000]) {
    press(a, `ms:${m}`);
    assert.equal(a.ev('apiAgentMs()'), m, `the ${m} ms button sets the pace`);
    assert.equal(JSON.parse(a.ev(`localStorage.getItem('sot-agent')`)).ms, m, 'in agent mode\'s own storage');
    assert.ok(a.ev(`document.querySelector('[data-agent-set="ms:${m}"]').classList.contains('pink')`), 'and shows as picked');
  }
  // 0: the agent's clock. It stands still: no speed, and the loop never runs a day by itself.
  press(a, 'ms:0');
  assert.equal(a.ev('apiAgentMs()'), 0);
  assert.equal(a.ev('UI.speed'), 0, 'the agent\'s clock stands still');
  a.ev('last=performance.now();for(let i=1;i<=40;i++)frame(last+i*250)');
  assert.equal(a.ev('S.day'), 0, 'no day passes on its own');
  assert.match(a.ev('settingsHtml()'), /The agent moves it/);
  // Junk is ignored, never coerced.
  a.ev("apiAgentSet('ms','nope');apiAgentSet('ms',true);apiAgentSet('ms',12345);apiAgentSet('nope',1)");
  assert.equal(a.ev('apiAgentMs()'), 0);
  // Its buttons are agent mode's own, not game actions: no tool finds them on a screen.
  assert.equal(a.ev(`document.querySelectorAll('#modal [data-agent-set][data-act]').length`), 0);
  assert.deepEqual(a.errors, []);
});

test('the game\'s preferences stay exactly as they are', () => {
  const a = agent();
  assert.deepEqual(Object.keys(a.ev('PREF_DEF')).sort(), ['pauseFurious', 'pauseIncident', 'quiet', 'warnUnhappy']);
  a.ev("ACT.prefSet({v:'pauseFurious:0'})");
  assert.equal(a.ev('PREFS.pauseFurious'), false);
  a.ev("ACT.prefSet({v:'agent:1'})");
  assert.equal(a.ev("'agent' in PREFS"), false, 'prefSet knows nothing of agent mode');
  assert.equal(a.ev(`localStorage.getItem('sot-prefs')`), JSON.stringify({ pauseFurious: false }));
  assert.deepEqual(a.errors, []);
});

test('agent mode only exists where a relay can be reached', () => {
  const a = agent();
  assert.equal(a.ev('API_AGENT_OK'), true);
  assert.match(a.ev('settingsHtml()'), /Agent API/, 'the Settings sheet has the section');
  // Plain http to an address: yes, wherever the operator bound the dev server. https (the public site cannot even
  // open ws:// from its pages), and DNS names (the relay refuses them): no.
  const gate = (p, h) => a.ev(`apiAgentLocal(${JSON.stringify(p)},${JSON.stringify(h)})`);
  for (const h of ['127.0.0.1', 'localhost', 'tubes.localhost', '10.0.0.4', '192.168.1.5', '203.0.113.7', '[::1]']) assert.equal(gate('http:', h), true, h);
  assert.equal(gate('https:', 'seriesoftub.es'), false, 'the public site has no relay behind it');
  assert.equal(gate('http:', 'seriesoftub.es'), false);
  assert.equal(gate('http:', 'example.com'), false);
  assert.equal(gate('file:', ''), false);
  assert.deepEqual(a.errors, []);
});

test('on the public site there is no agent mode, even with the preference set by hand', () => {
  const a = load({ url: 'https://seriesoftub.es/', agent: true, storage: prefs() });
  a.ev('ACT.start({});S.cash=1e9;compute()');
  assert.equal(a.ev('API_AGENT_OK'), false);
  assert.doesNotMatch(a.ev('settingsHtml()'), /Agent API/, 'no section in Settings');
  assert.equal(a.ev('UI.clockLocked'), false, 'the clock is the player\'s');
  assert.equal(a.ev('API_RELAY.on'), false, 'nothing dials');
  a.ev('ACT.speed({v:2})');
  assert.equal(a.ev('UI.speed'), 2, 'the speed buttons work');
  assert.deepEqual(a.errors, []);
});

test('agent mode remembers the speed the player left the game at, not the agent\'s', () => {
  const a = agent({ storage: prefs(60000, false) });       // agent mode off: the player is playing
  a.ev('ACT.start({});S.cash=1e9;ACT.speed({v:2});compute();save(true)');
  assert.equal(a.ev('S.uiSpeed'), 2, 'the save carries the player speed');
  press(a, 'on:1');
  assert.equal(a.ev('UI.clockLocked'), true);
  assert.equal(a.ev('UI.speed'), 0, 'no tool is connected, so the clock holds');
  for (const x of ['ACT.speed({v:4})', 'ACT.phonePlay()', 'ACT.phoneSpeed()', "dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' '}))"]) {
    a.ev(x);
    assert.equal(a.ev('UI.speed'), 0, `${x} does nothing while an agent drives`);
  }
  assert.equal(a.ev('autoPause()'), false, 'nothing pauses a locked clock either');
  a.ev('S.day=5;save(true)');
  assert.equal(a.ev('S.uiSpeed'), 2, 'save() never stores the locked speed in its place');
  a.ev('S.uiSpeed=4;gameResume()');
  assert.equal(a.ev('UI.speed'), 0, 'resuming a game keeps the lock');
  a.ev('S.uiSpeed=2');
  press(a, 'on:0');
  assert.equal(a.ev('UI.clockLocked'), false);
  assert.equal(a.ev('UI.speed'), 2, 'switching off restores the speed the player left the game at');
  a.ev('ACT.speed({v:4})');
  assert.equal(a.ev('UI.speed'), 4, 'and the speed buttons are back');
  assert.deepEqual(a.errors, []);
});

test('a paced clock runs behind an open window and in a hidden tab, and leaves the rest to the frame', () => {
  const a = agent({ ms: 30000 });
  a.ev('ACT.start({});S.cash=1e9;S.nextFail=S.day+999;S.nextEvent=S.day+999;compute()');
  // As if a tool were connected: the pace runs.
  a.ev('API_RELAY.on=true;apiRelayPresence(1)');
  assert.equal(a.ev('UI.speed'), a.ev('DAY_MS/30000'));
  // Visible, no window: the frame runs the days, the ticker none.
  a.ev('API_TICKER.last=0;apiAgentTick(1000);for(let t=1250;t<=31000;t+=250)apiAgentTick(t)');
  assert.equal(a.ev('S.day'), 0, 'the ticker leaves a visible, open map to the frame');
  a.ev('last=0;for(let t=250;t<=30250;t+=250)frame(t)');
  assert.equal(a.ev('S.day'), 1, 'which runs a day in 30 s');
  // A window open: the frame stops, the ticker goes on.
  a.ev('ACT.settings({})');
  a.ev('last=40000;for(let t=40250;t<=70000;t+=250)frame(t)');
  assert.equal(a.ev('S.day'), 1, 'no days in the frame behind a window');
  a.ev('API_TICKER.last=0;apiAgentTick(70000);for(let t=70250;t<=100250;t+=250)apiAgentTick(t)');
  assert.equal(a.ev('S.day'), 2, 'the ticker runs the day behind it');
  a.ev('closeModal()');
  // A hidden tab: frames stop altogether, the ticker goes on.
  a.ev("Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true})");
  a.ev('API_TICKER.last=0;apiAgentTick(200000);for(let t=200250;t<=230250;t+=250)apiAgentTick(t)');
  assert.equal(a.ev('S.day'), 3, 'and in a hidden tab');
  // Off: the ticker does nothing at all.
  a.ev("apiAgentSet('on',false)");
  a.ev('API_TICKER.last=0;apiAgentTick(300000);for(let t=300250;t<=400000;t+=250)apiAgentTick(t)');
  assert.equal(a.ev('S.day'), 3);
  assert.deepEqual(a.errors, []);
});

test('phones show the agent pace in the tab bar, where the speed button was', () => {
  const a = agent();
  a.ev('ACT.start({});S.cash=1e9;compute();window.innerWidth=360;window.innerHeight=740;renderTabbar()');
  const pace = () => a.ev(`(()=>{const b=document.querySelector('#tabbar button.pace');return b?{dis:b.disabled,ic:b.querySelector('.ic').textContent}:null;})()`);
  assert.equal(a.ev('isPhone()'), true);
  assert.deepEqual({ ...pace() }, { dis: true, ic: '1 min' }, 'the locked speed button reads the pace');
  assert.equal(a.ev(`document.querySelector('#tabbar button.play').disabled`), true, 'and play/pause is locked');
  assert.equal(a.ev(`document.querySelectorAll('#tabbar [data-act="phonePlay"],#tabbar [data-act="phoneSpeed"]').length`), 0);
  a.ev("apiAgentSet('ms',30000);renderTabbar()");
  assert.equal(pace().ic, '30 s', 'and follows the pace the player picks');
  a.ev("apiAgentSet('ms',0);renderTabbar()");
  assert.equal(pace().ic, '🤖', 'the agent\'s clock has a badge of its own');
  // The desktop and tablet HUD badge says the same, in place of the speed buttons.
  a.ev('renderHUD()');
  assert.equal(a.ev("$('spPace').hidden"), false);
  assert.equal(a.ev("$('sp1').hidden"), true);
  assert.equal(a.ev("$('spPace').textContent"), 'Agent\'s clock');
  a.ev("apiAgentSet('ms',30000);renderHUD()");
  assert.match(a.ev("$('spPace').textContent"), /30 s per simulated day/);
  // Agent mode off: the ordinary buttons are back, and the badge goes.
  a.ev("apiAgentSet('on',false);renderTabbar();renderHUD()");
  assert.equal(pace(), null);
  assert.match(a.ev(`document.querySelector('#tabbar [data-act="phoneSpeed"] .ic').textContent`), /×$/);
  assert.equal(a.ev("$('spPace').hidden"), true);
  assert.equal(a.ev("$('sp1').hidden"), false);
  assert.deepEqual(a.errors, []);
});

test('the Settings sheet\'s agent section is complete in every language, on a phone too', () => {
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'pt']) {
    const a = load({ agent: true, storage: prefs(), ...(lang === 'en' ? {} : { lang }) });
    a.ev('ACT.start({});window.innerWidth=360;window.innerHeight=740;ACT.settings({})');
    const html = a.ev("$('modalCard').innerHTML");
    assert.ok(html.includes('data-agent-set="ms:0"') && html.includes('data-agent-set="ms:300000"'), `${lang}: every clock button is there`);
    assert.doesNotMatch(a.ev("$('modalCard').textContent"), /settings\./, `${lang}: no label shows untranslated`);
    assert.deepEqual(a.errors, [], lang);
  }
});
