const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const start = (ev, o) => ev(`beginGame('Rule Testers','fra',${lit(o)});if(UI.pendGame)ACT.pitchSkip()`);
// Days of a quiet-ish network until n failures have fired, on a fixed seed.
const fails = (ev, days) => { ev("S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});__reseed(4242)"); ev(`for(let i=0;i<${days};i++)dayTick()`); return ev('S.inc.length+S.stats.survived+(S.stats.incidents||0)'); };

test('an old save without rules loads as On-call, a sandbox save as Sandbox', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  const old = JSON.parse(ev('JSON.stringify(S)')); delete old.rules;
  ev(`S=migrate(JSON.parse(${lit(JSON.stringify(old))}))`);
  assert.equal(ev('rulePreset()'), 'oncall');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules)')), JSON.parse(ev("JSON.stringify(makeRules('oncall'))")));
  assert.equal(ev("rule('chaos')"), 'normal');
  assert.equal(ev('chaosMul()'), 1);
  old.mode = 'sandbox';
  ev(`S=migrate(JSON.parse(${lit(JSON.stringify(old))}))`);
  assert.equal(ev('rulePreset()'), 'sandbox');
  assert.equal(ev("rule('money')"), 'infinite');
  assert.deepEqual(errors, []);
});

test('rules survive save and load, and junk is repaired', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'normal', preset: 'bgp' });
  assert.equal(ev('rulePreset()'), 'bgp');
  ev("const t=JSON.stringify(packSave(S));S=migrate(JSON.parse(t))");
  assert.equal(ev('rulePreset()'), 'bgp');
  assert.equal(ev("rule('chaos')"), 'spicy');
  ev("S.rules={preset:'freeze',chaos:'apocalypse',lead:42,market:'yes',mods:['ok',7,'<b>']};sanitize(S)");
  assert.equal(ev('rulePreset()'), 'freeze');
  assert.equal(ev("rule('chaos')"), 'calm', 'a bad value falls back to the preset');
  assert.equal(ev("rule('lead')"), 'quick');
  assert.equal(ev("rule('market')"), false);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), []);
  ev("S.rules={preset:'nope'};sanitize(S)");
  assert.equal(ev('rulePreset()'), 'oncall');
  ev("S.rules='hello';sanitize(S)");
  assert.equal(ev('rulePreset()'), 'oncall');
  // a scenario always runs on On-call, whatever was asked for
  ev("beginGame('X','nyc',{scn:SCN.find(s=>s.id==='spat'),preset:'freeze'})");
  assert.equal(ev('rulePreset()'), 'oncall');
  assert.deepEqual(errors, []);
});

test('the title screen: four doors, four Normal presets, a chaos picker for Sandbox, at 360 px', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev('window.innerWidth=360;showTitle()');
  assert.equal(doc.querySelectorAll('#modal .door').length, 4);
  assert.equal(doc.querySelectorAll('#modal .preset').length, 4);
  const challengeOptions=doc.querySelector('#modal .add-options');
  assert.equal(challengeOptions.open, false, 'challenge options start collapsed');
  assert.match(challengeOptions.textContent, /Challenges \(not for your first game\)/);
  assert.ok(challengeOptions.querySelector('summary.f'), 'the disclosure heading uses the title screen small-caps label style');
  const challengeStyle=doc.defaultView.getComputedStyle(challengeOptions.querySelector('summary'));
  assert.equal(challengeStyle.fontSize, '12px');
  assert.equal(challengeStyle.fontWeight, '900');
  assert.equal(challengeStyle.textTransform, 'uppercase');
  assert.equal(challengeStyle.display, 'list-item', 'the native disclosure arrow remains visible');
  assert.equal(doc.querySelectorAll('#modal .chs').length, 4);
  assert.equal(doc.getElementById('doorSandbox').hidden, true);
  assert.ok(doc.querySelector('.preset[data-preset=oncall].on'), 'On-call is the default');
  doc.querySelector('.preset[data-preset=freeze]').click();
  assert.ok(doc.querySelector('.preset[data-preset=freeze].on'));
  challengeOptions.querySelector('summary').click();
  assert.equal(challengeOptions.open, true);
  assert.equal(challengeOptions.querySelectorAll('[role=switch]').length, 1);
  doc.querySelector('[data-mode-id=outcast]').click();
  assert.equal(doc.querySelector('[data-mode-id=outcast]').getAttribute('aria-checked'), 'true');
  doc.querySelector('.door[data-door=sandbox]').click();
  assert.equal(doc.getElementById('doorSandbox').hidden, false);
  assert.equal(doc.getElementById('doorNormal').hidden, true);
  doc.querySelector('.chs[data-chaos=spicy]').click();
  doc.querySelector('.door[data-door=normal]').click();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('rulePreset()'), 'freeze');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), ['outcast']);
  assert.match(ev("document.getElementById('hAsn').textContent"), /Change Freeze/);
  assert.match(ev("document.getElementById('hAsn').title"), /locked/);
  ev('showTitle()');
  doc.querySelector('.door[data-door=sandbox]').click();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('S.mode'), 'sandbox');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), []);
  assert.equal(ev("rule('chaos')"), 'spicy', 'the sandbox remembers the chaos it was given');
  ev('showTitle()');
  doc.querySelector('.door[data-door=scn]').click();
  assert.match(doc.getElementById('modalCard').textContent, /Weekly challenge/);
  assert.deepEqual(errors, []);
});

test('the title screen on a short laptop window: name and doors on the left, rules and home city on the right', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev('showTitle()');
  const cols = [...doc.querySelectorAll('#modal .tcols>.tcol')];
  assert.equal(cols.length, 2);
  assert.ok(cols[0].querySelector('#nmIn') && cols[0].querySelectorAll('.door').length === 4, 'left: the name and the doors');
  assert.ok(cols[1].querySelector('#doorNormal') && cols[1].querySelector('#doorSandbox') && cols[1].querySelector('#homeSel'), 'right: the rules and the home city');
  // Two columns only where the window is wide but short (1280×720, 1024×768); phones and tall windows keep one.
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('');
  assert.match(css, /@media \(min-width:900px\) and \(max-height:860px\)\{[^@]*\.tcols\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.equal(css.split('.tcols{').length - 1, 1, 'no grid outside that window size');
  assert.deepEqual(errors, []);
});

test('On-call shows no extra tag; the share card names other presets', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'normal' });
  assert.equal(ev('ruleTag()'), '');
  assert.match(ev("document.getElementById('hAsn').textContent"), /^AS\d+$/);
  start(ev, { mode: 'normal', preset: 'bgp' });
  assert.match(ev('ruleTag()'), /BGP at 3/);
  ev('ACT.share()');
  start(ev, { mode: 'normal', rules: { mods: ['outcast'] } });
  assert.equal(ev('ruleTag()'), 'Outcast mode 🚫');
  assert.match(ev("document.getElementById('hAsn').textContent"), /🚫/);
  ev('shareCanvas()');
  ev("GAME_MODS.push('autarky');GAME_MOD_ICON.autarky='🪨';GAME_MOD_NAME.autarky='Autarky mode';S.rules.mods.push('autarky');renderAll()");
  assert.equal(ev('ruleTag()'), 'Outcast mode 🚫 Autarky mode 🪨');
  assert.match(ev("document.getElementById('hAsn').textContent"), /Outcast mode 🚫 Autarky mode 🪨/);
  ev('shareCanvas()');
  assert.deepEqual(errors, []);
});

test('Sandbox lays its own subsea cable without being Tier 1, and passes the level gates', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'sandbox' });
  assert.equal(ev('gatesOpen()'), true);
  assert.equal(ev('S.won'), false);
  assert.equal(ev('lvl()'), ev('LEVELS.length'));
  ev("ACT.buildPop({city:'lon'});ACT.buildPop({city:'nyc'});compute()");
  assert.equal(ev("ownCabWhy('lon','nyc')"), '');
  ev("UI.lmode='df';UI.via=null;openLinkModal('lon','nyc');ACT.ownCab()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /frankly rude amount of money/);
  ev('ACT.orderCable()');
  assert.ok(ev("S.links.some(l=>l.own&&l.sub)"), 'the cable is being laid');
  // and the normal game still says Tier 1 only
  start(ev, { mode: 'normal' });
  assert.match(ev("ownCabWhy('lon','nyc')"), /Tier 1/);
  assert.equal(ev('lvl()'), 1);
  assert.deepEqual(errors, []);
});

test('Sandbox chaos: none by default, but it can be asked for', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'sandbox' });
  assert.equal(ev("rule('chaos')"), 'none');
  ev('S.cash=5;for(let i=0;i<150;i++)dayTick()');
  assert.equal(ev('S.stats.incidents'), 0);
  assert.ok(ev('S.cash') >= 1e8);
  start(ev, { mode: 'sandbox', rules: { chaos: 'spicy' } });
  assert.equal(ev("rule('chaos')"), 'spicy');
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});for(let i=0;i<200;i++)dayTick()");
  assert.ok(ev('S.stats.incidents') > 0, 'spicy sandboxes break');
  assert.deepEqual(errors, []);
});

test('Change Freeze breaks less than On-call, BGP at 3 a.m. more, on the same seed', () => {
  const n = {};
  for (const p of ['freeze', 'oncall', 'bgp']) {
    const { ev, errors } = load();
    start(ev, { mode: 'normal', preset: p });
    n[p] = fails(ev, 360);// a year is plenty: 4, 15 and 33 on this seed
    assert.deepEqual(errors, []);
  }
  assert.ok(n.freeze < n.oncall, `freeze ${n.freeze} < on-call ${n.oncall}`);
  assert.ok(n.bgp > n.oncall, `bgp ${n.bgp} > on-call ${n.oncall}`);
});

test('chaos stretches spicy outages and leaves On-call ones alone', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'normal', preset: 'bgp' });
  ev("S.day=10;S.pops.fra.down=12;addInc({type:'crash',ref:'fra',until:12,msg:'x',cost:0})");
  assert.equal(ev('S.inc[0].until'), 13);
  assert.equal(ev('S.pops.fra.down'), 13, 'what it holds down lasts as long');
  start(ev, { mode: 'normal' });
  ev("S.day=10;S.pops.fra.down=12;addInc({type:'crash',ref:'fra',until:12,msg:'x',cost:0})");
  assert.equal(ev('S.inc[0].until'), 12);
  assert.deepEqual(errors, []);
});

test('quick lead times: PNIs, dark fiber and own builds arrive in days (#151)', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'normal', preset: 'freeze' });
  ev("S.cash=1e9;S.lvl=4;R.demTo.nfx=1e4;ACT.pni({city:'fra',net:'nfx',tier:1})");
  const p = JSON.parse(ev("JSON.stringify(S.pni.find(x=>x.net==='nfx'))"));
  assert.ok(p && p.ready - ev('S.day') <= 37, `PNI in days (${p && p.ready - ev('S.day')})`);
  assert.ok(ev('dfBuildDays(500)') <= 40);
  assert.equal(ev('leadDays(30)'), 3);
  // On-call: as quoted
  start(ev, { mode: 'normal' });
  assert.equal(ev('leadDays(30)'), 30);
  assert.equal(ev('dfBuildDays(500)'), 245);
  assert.deepEqual(errors, []);
});

test('Change Freeze: no hardware market, no sold-out routes', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'normal', preset: 'freeze' });
  ev("S.cash=1e9;ACT.buyIx({city:'fra',tier:1,signed:true})");
  ev('S.day=2000');
  assert.equal(ev("hwMul('rt')"), 1, 'no inflation');
  assert.equal(ev("hwCard()"), '');
  assert.equal(ev("[0,1,2,3,4,5,6].some(t=>CITIES.slice(0,60).some(c=>soldOut('fra',c.id,t)))"), false);
  start(ev, { mode: 'normal' });
  ev('S.day=2000');
  assert.ok(ev("hwMul('rt')") > 1, 'On-call keeps the market');
  assert.deepEqual(errors, []);
});

test('no clock: dayTick advances no days, sends no bills, and the speed buttons hide', () => {
  const { ev, errors } = load();
  start(ev, { mode: 'normal' });
  ev("S.rules=makeRules('puzzle');S.mode='puzzle';const c=S.cash;window.__c=c;for(let i=0;i<50;i++)dayTick();renderHUD()");
  assert.equal(ev('S.day'), 0);
  assert.equal(ev('S.cash'), ev('__c'));
  assert.equal(ev("document.getElementById('sp1').hidden"), true);
  ev("ACT.speed({v:4})");
  assert.notEqual(ev('UI.speed'), 4);
  ev("window.innerWidth=360;renderTabbar()");
  assert.equal(ev("!!document.querySelector('#tabbar [data-act=phonePlay]')"), false);
  assert.deepEqual(errors, []);
});
