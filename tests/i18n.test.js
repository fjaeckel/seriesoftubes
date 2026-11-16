const test = require('node:test');
const assert = require('node:assert/strict');
const { load, seed } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const SCREENS = ['hud', 'panelBody', 'leftBody', 'modalCard', 'dashCard', 'bankCard', 'toasts', 'coach', 'hint', 'mega'];

// Drives the game through nearly every screen, every failure and every event, and returns what threw
// plus any rendered text with an unfilled {placeholder}, "undefined", "NaN" or a raw label (text shown without
// tr(), such as an N_() label from a table) in it.
function tour(ev) {
  const thrown = [], leaks = new Set(), panels = {};
  const step = (label, src) => {
    try { ev(src); } catch (e) { thrown.push(`${label}: ${e.message}`); }
    const txt = ev(`${lit(SCREENS)}.map(i=>{const e=document.getElementById(i);return e?e.textContent:''}).join('\\n')`);
    for (const m of txt.match(/[^\n]{0,40}(\{[a-z]\w*\}|undefined|NaN)[^\n]{0,40}/g) || []) leaks.add(m.trim());
    for (const m of txt.match(/[a-z0-9_]+(\.[a-z0-9_]+)+/g) || []) if (ev(`!!EN[${lit(m)}]`)) leaks.add(`raw label: ${m}`);
  };
  step('title', 'showTitle()');
  step('start', 'ACT.start({});S.cash=1e8;S.lvl=4;S.day=100');
  step('pops', "for(const c of ['ams','lon','nyc','mos','mnl','sin','sao','dxb','tpe','jnb'])if(CITY[c])ACT.buildPop({city:c})");
  step('basics', "ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'})");
  step('links', "UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.via='grace';openLinkModal('nyc','lon');ACT.buildLink({tier:1});closeModal()");
  step('dark fiber', "UI.pending={a:'fra',b:'ams'};UI.lmode='df';UI.dfSys='roadm';openLinkModal('fra','ams');ACT.orderDf();UI.lmode='wave';S.pops.fra.rgen=2;S.pops.ams.rgen=2;const df=S.links.find(l=>l.kind==='df');if(df){ACT.addCh({id:df.id,o:'zr4'});df.ready=S.day}");
  for (let d = 0; d < 40; d++) step('day ' + d, 'dayTick();if(S.day%10===0)for(const o of S.offers.slice())if(S.pops[o.city]&&(!o.city2||S.pops[o.city2]))ACT.accept({id:o.id})');
  for (const c of ['fra', 'ams', 'nyc', 'sha', 'sin', 'sao', 'mos', 'lon', 'stg']) {
    for (const t of ['cust', 'up', 'peer', 'links']) {
      step(`panel ${c}/${t}`, `selectCity('${c}');ACT.tab({t:'${t}'})`);
      if (c === 'fra') panels[t] = ev("document.getElementById('panelBody').textContent.length");
    }
  }
  step('link panels', 'for(const l of S.links){ACT.selLink({id:l.id});renderPanel()}');
  for (const t of ['goals', 'deals', 'noc', 'nets']) step('left ' + t, `ACT.leftTab({t:'${t}'})`);
  step('dash', 'ACT.dash({})');
  const dashSvg = ev("document.querySelectorAll('#dashCard svg').length");
  for (const [label, src] of [['dash close', 'ACT.dashClose()'], ['bank', 'ACT.bank();ACT.bankClose()'],
    ['help', 'showHelp();closeModal()'], ['menu', 'ACT.menu();closeModal()'], ['reset', 'ACT.resetAsk();closeModal()'],
    ['scenarios', 'scenarioModal();closeModal()'], ['trace', "traceModal('fra');closeModal()"],
    ['route script', 'S.lvl=Math.max(S.lvl,3);S.cash+=1e6;ACT.coreUp();ACT.coreUp();ACT.buyTE();ACT.teEdit();ACT.teExample();ACT.teCheck();closeModal()'],
    ['routers', "selectCity('fra');ACT.tab({t:'links'});ACT.models()"], ['vxc', "openVxcModal({from:'fra',to:'ams'});closeModal()"],
    ['tutorial', 'S.tut=0;renderCoach();S.tut=3;renderCoach();S.tut=null;renderCoach()'], ['win', 'showWin()']]) step(label, src);
  const failSrc = ev('failureRun.toString()');
  for (const t of ['harmless', 'fatwave', 'label', 'mtu', 'oops', 'cleaner', 'maxpfx', 'prepend', 'rpki', 'amp', 'roadmff', 'optic', 'ac', 'cut', 'crash', 'power', 'transit', 'ixloop', 'leak', 'ddos']) {
    const kind = ['harmless', 'fatwave', 'label', 'mtu', 'oops', 'cleaner', 'maxpfx', 'prepend', 'rpki', 'roadmff', 'ac'].includes(t) ? 'funny' : t;
    const patched = failSrc.replace(/^function\* failureRun/, 'function*')
      .replace('let tot=opts.reduce', `if(!opts.some(o=>o[0]==='${kind}'))return;opts.splice(0,opts.length,['${kind}',1]);let tot=opts.reduce`)
      .replace('type=pick(f);}', `type=f.includes('${t}')?'${t}':pick(f);}`);
    assert.ok(patched.includes(`['${kind}',1]`) && patched.includes(`f.includes('${t}')`), 'failureRun() still has the hooks this tour forces');
    step('failure ' + t, `window.__ff=${patched};S.links.forEach(l=>{l.cut=0;l.eqDown=0;l.chFail=null});S.transit.forEach(t=>t.down=0);for(const c in S.pops)S.pops[c].down=0;compute();runNow(__ff());dayTick();ACT.leftTab({t:'noc'})`);
  }
  // A cable the Baltic event can hit, so the anchor badge does not depend on what the random days built.
  step('baltic cable', "if(!S.pops.hel)ACT.buildPop({city:'hel'});UI.via='clion';openLinkModal('fra','hel');ACT.buildLink({tier:0});closeModal();UI.via=null");
  const evSrc = ev('fireEvent.toString()');
  for (const e of ['viral', 'price', 'grant', 'sanction', 'tariff', 'hijack', 'landban', 'shutdown', 'redsea', 'baltic', 'runet', 'typhoon', 'golden', 'gfw', 'gulf']) {
    const patched = evSrc.replace(/^function fireEvent/, 'function').replace('const e=pick(opts);', `const e='${e}';`);
    assert.ok(patched.includes(`const e='${e}';`), 'fireEvent still has the hook this tour forces');
    step('event ' + e, `window.__fe=${patched};__fe();dayTick();ACT.leftTab({t:'deals'})`);
  }
  for (let d = 0; d < 60; d++) step('late day ' + d, 'dayTick()');
  const stale = ev('S.inc.filter(i=>i.until<=S.day).length');
  step('lose', 'showLose()');
  return { thrown, leaks: [...leaks], panels, dashSvg, stale };
}

test('the game starts in English unless the player or the browser asks for another language', () => {
  assert.equal(load().ev('LANG'), 'en');
  assert.equal(load({ navigatorLanguage: 'it-IT' }).ev('SOT_LANG'), 'it', 'an Italian browser asks for Italian');
  // One code path for every language: the region is dropped, so a Swiss German browser asks for German.
  assert.equal(load({ navigatorLanguage: 'de-CH' }).ev('SOT_LANG'), 'de', 'a Swiss German browser asks for German');
  const it = load({ lang: 'it' });
  assert.equal(it.ev('LANG'), 'it');
  assert.equal(it.ev('document.documentElement.lang'), 'it');
  assert.equal(load({ navigatorLanguage: 'it-IT', storage: { 'sot-lang': 'en' } }).ev('LANG'), 'en', 'a saved choice wins');
  assert.equal(load({ storage: { 'sot-lang': 'xx' } }).ev('LANG'), 'en', 'unknown languages fall back to English');
  const offline = load({ storage: { 'sot-lang': 'it' } });
  assert.equal(offline.ev('LANG'), 'en', 'no dictionary, no Italian');
  assert.equal(offline.ev('document.documentElement.lang'), 'en');
});

test('missing translations fall back to the English, with placeholders filled', () => {
  const { ev } = load({ lang: 'it' });
  ev("DICT['test.cats']=EN['test.cats']={one:'{n} cat',other:'{n} cats'}");
  assert.ok(ev("Object.keys(EN).every(k=>DICT[k]===(I18N.it[k]??EN[k]))"), 'each label is Italian where there is Italian, else English');
  assert.equal(ev("tr('test.no_such_label {n}',{n:3})"), 'test.no_such_label 3', 'an unknown label comes back as it is');
  assert.equal(ev("trn('test.cats',1)"), '1 cat');
  assert.equal(ev("trn('test.cats',2)"), '2 cats');
  assert.equal(ev("trn('slots.n_day_ago',1)"), '1 giorno fa');
  assert.equal(ev("trn('slots.n_day_ago',3)"), '3 giorni fa');
});

test('text that old saves stored in English is still translated', () => {
  const { ev } = load({ lang: 'it' });
  assert.equal(ev("tr('Delivery: 2 to 6 weeks')"), ev("tr('pnis.delivery_2_to_6_weeks')"));
  assert.equal(ev("tr('{n} days ago',{n:3})"), '3 giorni fa', 'plural forms too');
  assert.equal(load().ev("tr('Delivery: 2 to 6 weeks')"), 'Delivery: 2 to 6 weeks');
});

test('the static markup is translated by label', () => {
  const { ev } = load({ lang: 'it' });
  ev('ACT.start({})');
  assert.equal(ev("document.querySelector('[data-i18n=\"common.customers\"]').textContent"), 'Clienti');
  assert.equal(ev("document.querySelector('#hud [data-act=dash]').getAttribute('aria-label')"), ev("tr('common.noc_dashboard')"));
});

test('a scenario started in English shows its Italian name after switching', () => {
  const en = load();
  en.ev("ACT.startScn({id:'stg'});save()");
  const { ev } = load({ lang: 'it', storage: { 'sot-save-v1': en.ev("slotRaw(UI.slot)") } });
  const name = ev("SCN.find(x=>x.id==='stg').n");
  assert.notEqual(name, en.ev("SCN.find(x=>x.id==='stg').n"));
  assert.ok(ev("document.getElementById('hAsn').textContent").includes(name));
});

// The whole tour in English and Italian (plural forms): what it finds, a raw label, NaN, a throw, comes from the code, the
// same in every language, and the dictionaries themselves are checked by tests/gameplay-rules.test.js (C3). The other
// languages check their own few labels.
for (const lang of ['en', 'it', 'pt', 'fr', 'es', 'de']) {
  const full = lang === 'en' || lang === 'it';
  test(full ? `${lang}: every screen, failure and event renders without errors or unfilled placeholders` : `${lang}: How to play and the top bar in ${lang}`, () => {
    const { ev, errors } = load(lang === 'en' ? {} : { lang });
    seed(ev, 3);
    if (lang === 'it') {
      assert.match(ev("document.getElementById('modalCard').textContent"), /Come si gioca/);
      assert.equal(ev("document.querySelector('#hud [data-act=bank] .lbl').textContent"), 'Cassa · Banca');
    }
    if (lang === 'fr') {
      assert.match(ev("document.getElementById('modalCard').textContent"), /Comment jouer/);
      // short enough to stay on one line in the phone's top bar (Caisse · Banque wrapped and cut off the monthly line)
      assert.equal(ev("document.querySelector('#hud [data-act=bank] .lbl').textContent"), 'Cash · Banque');
    }
    if (lang === 'es') {
      assert.match(ev("document.getElementById('modalCard').textContent"), /Cómo jugar/);
      assert.equal(ev("document.querySelector('#hud [data-act=bank] .lbl').textContent"), 'Caja · Banco');
    }
    if (lang === 'de') {
      assert.match(ev("document.getElementById('modalCard').textContent"), /Spielanleitung/);
      // the link card to the real "How the Internet Works" site used to be hard-coded English; it lives in How to play
      assert.match(ev("(()=>{showHelp&&showHelp();return document.getElementById('modalCard').textContent})()"), /Wie funktioniert das Internet\?/);
      ev("showTitle()");
      assert.equal(ev("document.querySelector('#hud [data-act=bank] .lbl').textContent"), 'Kasse · Bank');
      // networking jargon stays English in German (Peering, Dark Fiber); plain "fiber" is Glasfaser
      assert.equal(ev("tr('common.peering')"), 'Peering');
      assert.equal(ev("tr('common.dark_fiber')"), 'Dark Fiber');
      assert.equal(ev("tr('common.terrestrial_fiber')"), 'Terrestrische Glasfaser');
    }
    if (!full) { assert.deepEqual(errors, []); return; }
    const { thrown, leaks, panels, dashSvg, stale } = tour(ev);
    assert.ok(ev('(S.stats.f||{}).anchor'), 'Baltic and Red Sea anchors count for the badge');
    assert.deepEqual(thrown, []);
    assert.deepEqual(leaks, []);
    for (const [t, n] of Object.entries(panels)) assert.ok(n > 50, `Frankfurt ${t} tab has content`);
    assert.ok(dashSvg >= 1, 'the dashboard draws its charts');
    assert.equal(stale, 0, 'expired incidents are cleared');
    assert.deepEqual(errors, []);
  });
}

test('the translation check catches labels the build could not see, and English-keyed calls', () => {
  const { sourceLabels } = require('../scripts/i18n-check');
  const { problems, labels } = sourceLabels("<html><body><script>const x='pnis.foo_bar';tr('pnis.ok_label');N_('pnis.kept');trn('{n} POP','{n} POPs',n)</script></body></html>");
  assert.ok(labels.has('pnis.ok_label') && labels.has('pnis.kept'));
  assert.ok(problems.some((p) => p.includes('pnis.foo_bar') && p.includes('N_()')), 'a bare label');
  assert.ok(problems.some((p) => p.includes('not a label')), 'English text where a label belongs');
});
