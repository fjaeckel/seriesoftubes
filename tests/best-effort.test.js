// Best Effort (☕): the gentlest Normal preset. Change Freeze's quiet (rare outages, no DDoS, no chaos monkey, quick
// builds, no market) plus no cable ships, no conferences, patient customers, a rescue loan instead of game over and
// quiet notifications by default.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev, preset) => ev(`beginGame('Soft Serve','mrs',{mode:'normal',preset:'${preset}'});if(UI.pendGame)ACT.pitchSkip();closeModal();S.cash=1e8;for(const g of GOALS)S.done[g.id]=0`);
const J = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));

test('Best Effort is a Normal preset with its own rules, kept through save and load', () => {
  const { ev, errors } = load();
  start(ev, 'soft');
  assert.equal(ev('rulePreset()'), 'soft');
  assert.deepEqual(J(ev, "['chaos','lead','market','sea','confs','broke','moods','pnis'].map(rule)"), ['calm', 'quick', false, 'timer', false, 'rescue', 'patient', 'instant']);
  assert.equal(ev('ddosOff()'), true, 'no DDoS');
  assert.equal(ev('mkElig()'), false, 'no chaos monkey');
  ev("S.rules.confs=true;S.rules.sea='ships';const t=JSON.stringify(packSave(S));S=migrate(JSON.parse(t))");
  assert.deepEqual(J(ev, "[rulePreset(),rule('confs'),rule('sea')]"), ['soft', false, 'timer'], 'an edited save gets its preset back');
  // Every other preset keeps the classic game's ships, conferences, game over and moods.
  for (const p of ['freeze', 'oncall', 'bgp']) {
    start(ev, p);
    assert.deepEqual(J(ev, "['sea','confs','broke','moods','pnis'].map(rule)"), ['ships', true, 'lose', 'normal', 'wait'], p);
  }
  assert.deepEqual(errors, []);
});

test('Best Effort: a subsea cut mends on its own clock, with no cable ship', () => {
  for (const [p, ships] of [['soft', false], ['freeze', true]]) {
    const { ev, errors } = load();
    start(ev, p);
    ev("ACT.buildPop({city:'bcn'});S.links=[{id:'med',a:'bcn',b:'mrs',kind:'wave',sub:true,tier:0,km:365,cable:'medusa',cut:0,mo:1000}];S.inc=[];S.fleet={};compute();fireFailure('cut')");
    const i = J(ev, "S.inc.find(i=>i.type==='cut')");
    assert.ok(i, p);
    assert.equal(i.ship != null || !!i.seaq, ships, `${p}: a ship sails out only with ships`);
    assert.equal(Object.keys(J(ev, 'S.fleet')).length > 0, ships, p);
    if (!ships) {
      assert.ok(i.until > ev('S.day') && i.until - ev('S.day') <= 17, 'mends in 10 to 17 days, like a cut on land');
      for (let k = 0; k < 18; k++) ev('dayTick()');
      assert.equal(ev("S.inc.some(i=>i.type==='cut')"), false, 'and is mended');
    }
    assert.deepEqual(errors, [], p);
  }
});

test('Best Effort: no conference season', () => {
  const { ev, errors } = load();
  start(ev, 'soft');
  assert.deepEqual(J(ev, 'upcomingConfs(400)'), []);
  for (let k = 0; k < 400; k++) ev('S.nextFail=S.nextEvent=1e9;dayTick()');
  assert.equal(ev('!!S.conf||!!(S.stats.confs)'), false);
  assert.equal(ev('confSection()'), '');
  assert.equal(ev("S.log.some(e=>/NANOG|APRICOT|PTC/.test(JSON.stringify(e)))"), false, 'no invitations');
  start(ev, 'freeze');
  assert.ok(J(ev, 'upcomingConfs(400)').length > 0, 'Change Freeze still has them');
  assert.deepEqual(errors, []);
});

test('Best Effort: customers sour half as fast', () => {
  const drop = {};
  for (const p of ['soft', 'freeze']) {
    const { ev, errors } = load();
    start(ev, p);
    ev("ACT.launchBB({city:'mrs'});ACT.buyTransit({city:'mrs',net:'cog',tier:1});S.biz=[{id:'b',name:'B',type:'dia',city:'mrs',bw:1,rate:100,mood:80,since:0}];S.day=100;compute()");
    // Every path down: the customer gets nothing for a day.
    ev("S.transit.forEach(t=>t.down=S.day+5);S.nextFail=S.nextEvent=1e9;dayTick()");
    drop[p] = 80 - ev("S.biz[0].mood");
    assert.deepEqual(errors, [], p);
  }
  assert.ok(drop.freeze > 0);
  assert.ok(Math.abs(drop.soft - drop.freeze / 2) < 1e-9, `half: ${drop.soft} vs ${drop.freeze}`);
});

test('Best Effort: deep in the red, a rescue loan instead of game over', () => {
  const { ev, errors } = load();
  start(ev, 'soft');
  ev("ACT.launchBB({city:'mrs'});compute();S.cash=-250000;S.nextFail=S.nextEvent=1e9;dayTick()");
  assert.equal(ev('!!S.lost'), false);
  assert.ok(ev('S.cash') > 0, 'back in the black');
  const l = J(ev, "S.loans.find(l=>l.bank==='gov')");
  assert.ok(l && l.covs.length === 0 && l.term === 60 && l.pay > 0, 'a five-year state loan, no conditions');
  assert.match(ev("document.getElementById('toasts').textContent"), /Ministry of Tubes stepped in/);
  start(ev, 'freeze');
  ev("ACT.launchBB({city:'mrs'});compute();S.cash=-250000;S.nextFail=S.nextEvent=1e9;dayTick()");
  assert.equal(ev('!!S.lost'), true, 'the other presets still end the game');
  assert.deepEqual(errors, []);
});

test('quiet notifications: on by default in Best Effort, a setting everywhere, and the NOC log keeps everything', () => {
  const { ev, dom, errors } = load();
  const shown = () => ev("document.getElementById('toasts').textContent");
  ev("localStorage.removeItem('sot-prefs');PREFS={}");
  start(ev, 'soft');
  assert.equal(ev('quietOn()'), true);
  ev("document.getElementById('toasts').innerHTML='';UI.tick=true;toast('Quiet news','good');toast('Bad news','bad');toast('A milestone','goal');UI.tick=false");
  assert.doesNotMatch(shown(), /Quiet news/, 'good news from the day stays in the log');
  assert.match(shown(), /Bad news/);
  assert.match(shown(), /A milestone/);
  assert.equal(ev("S.log.some(e=>/Quiet news/.test(JSON.stringify(e)))"), true, 'the NOC log has it');
  ev("toast('You clicked','good')");
  assert.match(shown(), /You clicked/, 'what a click says still shows');
  start(ev, 'oncall');
  assert.equal(ev('quietOn()'), false, 'off elsewhere by default');
  // The setting, at 360 px.
  dom.window.innerWidth = 360;
  ev('UI.setOpen=true;openModal(settingsHtml())');
  const doc = dom.window.document;
  assert.match(doc.getElementById('modalCard').textContent, /Quiet notifications/);
  doc.querySelector('#modalCard [data-act="prefSet"][data-args*="quiet:1"]').click();
  assert.equal(ev('quietOn()'), true, 'chosen on, on in every mode');
  start(ev, 'soft');
  ev("ACT.prefSet({v:'quiet:0'})");
  assert.equal(ev('quietOn()'), false, 'chosen off, off even in Best Effort');
  assert.deepEqual(errors, []);
});

test('the title screen offers Best Effort first, and it earns Freeze-dried badges', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev('window.innerWidth=360;showTitle()');
  const ps = [...doc.querySelectorAll('#modal .preset')].map((b) => b.dataset.preset);
  assert.deepEqual(ps, ['soft', 'freeze', 'oncall', 'bgp']);
  doc.querySelector('.preset[data-preset=soft]').click();
  assert.match(doc.getElementById('presetWhat').textContent, /No SLA, no pager/);
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('rulePreset()'), 'soft');
  assert.match(ev("document.getElementById('hAsn').textContent"), /Best Effort/);
  assert.equal(ev('badgeVar()'), 'freeze');
  assert.deepEqual(errors, []);
});

test('Best Effort: PNIs and their augments are up the moment they are ordered', () => {
  const { ev, errors } = load();
  ev("beginGame('Soft Serve','fra',{mode:'normal',preset:'soft'});if(UI.pendGame)ACT.pitchSkip();closeModal();S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;S.nextFail=S.nextEvent=1e9;ACT.launchBB({city:'fra'});for(const c in S.pops)S.pops[c].rgen=3;compute()");
  assert.equal(ev("pniEta('nfx')"), 'Up the moment you order it');
  ev("document.getElementById('toasts').innerHTML='';R.demTo.nfx=1e4;ACT.pni({city:'fra',net:'nfx',tier:1})");
  assert.equal(ev('pniOn(S.pni[0])'), true, 'a PNI with a big network, up at once');
  assert.match(ev("document.getElementById('toasts').textContent"), /PNI with NetChill is up/);
  ev('compute()');
  assert.ok(ev('R.usePni[S.pni[0].id]') > 0, 'and carrying traffic');
  ev("R.demTo.nfx=1e4;ACT.pni({city:'fra',net:'nfx',tier:2})");
  assert.deepEqual(J(ev, '[S.pni[0].tier,S.pni[0].up===undefined]'), [2, true], 'an upgrade, at once');
  ev('ACT.lagP({id:S.pni[0].id,d:1})');
  assert.deepEqual(J(ev, '[S.pni[0].n,S.pni[0].up===undefined]'), [2, true], 'a LAG member, at once');
  // Change Freeze still waits, if only days.
  start(ev, 'freeze');
  ev("S.cash=1e9;S.lvl=6;ACT.launchBB({city:'mrs'});for(const c in S.pops)S.pops[c].rgen=3;compute();R.demTo.nfx=1e4;ACT.pni({city:'mrs',net:'nfx',tier:1})");
  assert.ok(ev('S.pni[0].ready') > ev('S.day'));
  assert.deepEqual(errors, []);
});

test('no "attracts attacks" warning where nobody attacks', () => {
  const { ev, errors } = load();
  const risk = () => ev("bRisk({type:Object.keys(BIZ_T).find(k=>BIZ_T[k].gaming)})");
  start(ev, 'soft');
  assert.equal(risk(), '');
  start(ev, 'oncall');
  assert.match(risk(), /Gaming attracts attacks/);
  assert.deepEqual(errors, []);
});
