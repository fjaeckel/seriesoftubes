const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { load, seed } = require('./harness');
const { loadDict, brokenEntries } = require('../scripts/i18n-check');

const SCREENS = ['hud', 'panelBody', 'leftBody', 'modalCard', 'dashCard', 'bankCard', 'toasts', 'coach', 'hint', 'mega'];

// Drives the game through nearly every screen, every failure and every event, and returns what threw
// plus any rendered text with an unfilled {placeholder}, "undefined", "NaN" or a raw label (text shown without
// tr(), such as an N_() label from a table) in it.
function tour(ev) {
  const thrown = [], leaks = new Set();
  const step = (label, src) => {
    try { ev(src); } catch (e) { thrown.push(`${label}: ${e.message}`); }
    const txt = ev(`${JSON.stringify(SCREENS)}.map(i=>{const e=document.getElementById(i);return e?e.textContent:''}).join('\\n')`);
    for (const m of txt.match(/[^\n]{0,40}(\{[a-z]\w*\}|undefined|NaN)[^\n]{0,40}/g) || []) leaks.add(m.trim());
    for (const m of txt.match(/[a-z0-9_]+(\.[a-z0-9_]+)+/g) || []) if (ev(`!!EN[${JSON.stringify(m)}]`)) leaks.add(`raw label: ${m}`);
  };
  step('title', 'showTitle()');
  step('start', 'ACT.start({});S.cash=1e8;S.lvl=4;S.day=100');
  step('pops', "for(const c of ['ams','lon','nyc','mos','mnl','sin','sao','dxb','tpe','jnb'])if(CITY[c])ACT.buildPop({city:c})");
  step('basics', "ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'})");
  step('links', "UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.via='grace';openLinkModal('nyc','lon');ACT.buildLink({tier:1});closeModal()");
  step('dark fiber', "UI.pending={a:'fra',b:'ams'};UI.lmode='df';UI.dfSys='roadm';openLinkModal('fra','ams');ACT.orderDf();UI.lmode='wave';S.pops.fra.rgen=2;S.pops.ams.rgen=2;const df=S.links.find(l=>l.kind==='df');if(df){ACT.addCh({id:df.id,o:'zr4'});df.ready=S.day}");
  for (let d = 0; d < 40; d++) step('day ' + d, 'dayTick();if(S.day%10===0)for(const o of S.offers.slice())if(S.pops[o.city]&&(!o.city2||S.pops[o.city2]))ACT.accept({id:o.id})');
  for (const c of ['fra', 'ams', 'nyc', 'sha', 'sin', 'sao', 'mos', 'lon', 'stg']) {
    for (const t of ['cust', 'up', 'peer', 'links']) step(`panel ${c}/${t}`, `selectCity('${c}');ACT.tab({t:'${t}'})`);
  }
  step('link panels', 'for(const l of S.links){ACT.selLink({id:l.id});renderPanel()}');
  for (const t of ['goals', 'deals', 'noc', 'nets']) step('left ' + t, `ACT.leftTab({t:'${t}'})`);
  for (const [label, src] of [['dash', 'ACT.dash({});ACT.dashClose()'], ['bank', 'ACT.bank();ACT.bankClose()'],
    ['help', 'showHelp();closeModal()'], ['menu', 'ACT.menu();closeModal()'], ['reset', 'ACT.resetAsk();closeModal()'],
    ['scenarios', 'scenarioModal();closeModal()'], ['trace', "traceModal('fra');closeModal()"],
    ['route script', 'S.lvl=Math.max(S.lvl,3);S.cash+=1e6;ACT.coreUp();ACT.coreUp();ACT.buyTE();ACT.teEdit();ACT.teExample();ACT.teCheck();closeModal()'],
    ['routers', "selectCity('fra');ACT.tab({t:'links'});ACT.models()"], ['vxc', "openVxcModal({from:'fra',to:'ams'});closeModal()"],
    ['tutorial', 'S.tut=0;renderCoach();S.tut=3;renderCoach();S.tut=null;renderCoach()'], ['win', 'showWin()']]) step(label, src);
  const failSrc = ev('fireFailure.toString()');
  for (const t of ['harmless', 'fatwave', 'label', 'mtu', 'oops', 'cleaner', 'prepend', 'rpki', 'amp', 'roadmff', 'optic', 'ac', 'cut', 'crash', 'power', 'transit', 'ixloop', 'leak', 'ddos']) {
    const kind = ['harmless', 'fatwave', 'label', 'mtu', 'oops', 'cleaner', 'prepend', 'rpki', 'roadmff', 'ac'].includes(t) ? 'funny' : t;
    const patched = failSrc.replace(/^function fireFailure/, 'function')
      .replace('let tot=opts.reduce', `if(!opts.some(o=>o[0]==='${kind}'))return;opts.splice(0,opts.length,['${kind}',1]);let tot=opts.reduce`)
      .replace('type=pick(f);}', `type=f.includes('${t}')?'${t}':pick(f);}`);
    assert.ok(patched.includes(`['${kind}',1]`) && patched.includes(`f.includes('${t}')`), 'fireFailure still has the hooks this tour forces');
    step('failure ' + t, `window.__ff=${patched};S.links.forEach(l=>{l.cut=0;l.eqDown=0;l.chFail=null});S.transit.forEach(t=>t.down=0);for(const c in S.pops)S.pops[c].down=0;compute();__ff();dayTick();ACT.leftTab({t:'noc'})`);
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
  step('lose', 'showLose()');
  return { thrown, leaks: [...leaks] };
}

test('the game starts in English unless the player or the browser asks for another language', () => {
  assert.equal(load().ev('LANG'), 'en');
  assert.equal(load({ navigatorLanguage: 'it-IT' }).ev('SOT_LANG'), 'it', 'an Italian browser asks for Italian');
  assert.equal(load({ navigatorLanguage: 'pt-BR' }).ev('SOT_LANG'), 'pt', 'a Brazilian browser asks for Portuguese');
  assert.equal(load({ navigatorLanguage: 'fr-FR' }).ev('SOT_LANG'), 'fr', 'a French browser asks for French');
  assert.equal(load({ navigatorLanguage: 'es-ES' }).ev('SOT_LANG'), 'es', 'a Spanish browser asks for Spanish');
  assert.equal(load({ navigatorLanguage: 'de-DE' }).ev('SOT_LANG'), 'de', 'a German browser asks for German');
  assert.equal(load({ navigatorLanguage: 'de-CH' }).ev('SOT_LANG'), 'de', 'so does a Swiss German one');
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

test('every translation keeps the placeholders, HTML tags and plural forms of its English', () => {
  const D = require('../scripts/lib/dict');
  const en = D.read('en').dict;
  for (const lang of D.langs()) {
    const dict = loadDict(D.fileOf(lang));
    assert.ok(Object.keys(dict).length > 100, lang);
    assert.deepEqual(brokenEntries(dict, en), [], lang);
  }
});

test('the static markup is translated by label', () => {
  const { ev } = load({ lang: 'it' });
  ev('ACT.start({})');
  assert.equal(ev("document.querySelector('[data-i18n=\"common.customers\"]').textContent"), 'Clienti');
  assert.equal(ev("document.querySelector('[data-act=help]').getAttribute('aria-label')"), ev("tr('common.how_to_play')"));
});

test('the language dropdown on the title screen works before any game exists', () => {
  const { ev } = load();
  assert.equal(ev('S'), null);
  ev("const s=document.querySelector('#modalCard select#langTitle');s.value='it';s.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(ev("localStorage.getItem('sot-lang')"), 'it');
});

test('picking a language saves the choice and the game, then reloads', () => {
  const { ev } = load();
  ev('ACT.start({});dayTick()');
  ev("ACT.langSet({v:'it'})");
  assert.equal(ev("localStorage.getItem('sot-lang')"), 'it');
  assert.ok(ev("slotRaw(UI.slot)"));
  ev("ACT.langSet({v:'klingon'})");
  assert.equal(ev("localStorage.getItem('sot-lang')"), 'it');
});

test('a scenario started in English shows its Italian name after switching', () => {
  const en = load();
  en.ev("ACT.startScn({id:'stg'});save()");
  const { ev } = load({ lang: 'it', storage: { 'sot-save-v1': en.ev("slotRaw(UI.slot)") } });
  const name = ev("SCN.find(x=>x.id==='stg').n");
  assert.notEqual(name, en.ev("SCN.find(x=>x.id==='stg').n"));
  assert.ok(ev("document.getElementById('hAsn').textContent").includes(name));
});

for (const lang of ['en', 'it', 'pt', 'fr', 'es', 'de']) {
  test(`${lang}: every screen, failure and event renders without errors or unfilled placeholders`, () => {
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
    const { thrown, leaks } = tour(ev);
    assert.ok(ev('(S.stats.f||{}).anchor'), 'Baltic and Red Sea anchors count for the badge in every language');
    assert.deepEqual(thrown, []);
    assert.deepEqual(leaks, []);
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
