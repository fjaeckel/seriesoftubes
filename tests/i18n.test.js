const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { load, seed } = require('./harness');
const { loadDict, brokenEntries } = require('../scripts/i18n-check');

const SCREENS = ['hud', 'panelBody', 'leftBody', 'modalCard', 'dashCard', 'bankCard', 'toasts', 'coach', 'hint', 'mega'];

// Drives the game through nearly every screen, every failure and every event, and returns what threw
// plus any rendered text with an unfilled {placeholder}, "undefined" or "NaN" in it.
function tour(ev) {
  const thrown = [], leaks = new Set();
  const step = (label, src) => {
    try { ev(src); } catch (e) { thrown.push(`${label}: ${e.message}`); }
    const txt = ev(`${JSON.stringify(SCREENS)}.map(i=>{const e=document.getElementById(i);return e?e.textContent:''}).join('\\n')`);
    for (const m of txt.match(/[^\n]{0,40}(\{[a-z]\w*\}|undefined|NaN)[^\n]{0,40}/g) || []) leaks.add(m.trim());
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
    ['route script', 'ACT.buyTE();ACT.teEdit();ACT.teExample();ACT.teCheck();closeModal()'],
    ['routers', "selectCity('fra');ACT.tab({t:'links'});ACT.models()"], ['vxc', "openVxcModal({from:'fra',to:'ams'});closeModal()"],
    ['tutorial', 'S.tut=0;renderCoach();S.tut=3;renderCoach();S.tut=null;renderCoach()'], ['win', 'showWin()']]) step(label, src);
  const failSrc = ev('fireFailure.toString()');
  for (const t of ['harmless', 'fatwave', 'label', 'mtu', 'oops', 'cleaner', 'maxpfx', 'prepend', 'rpki', 'amp', 'roadmff', 'optic', 'ac', 'cut', 'crash', 'power', 'transit', 'ixloop', 'leak', 'ddos']) {
    const kind = ['harmless', 'fatwave', 'label', 'mtu', 'oops', 'cleaner', 'maxpfx', 'prepend', 'rpki', 'roadmff', 'ac'].includes(t) ? 'funny' : t;
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
  const it = load({ lang: 'it' });
  assert.equal(it.ev('LANG'), 'it');
  assert.equal(it.ev('document.documentElement.lang'), 'it');
  assert.equal(load({ navigatorLanguage: 'it-IT', storage: { 'sot-lang': 'en' } }).ev('LANG'), 'en', 'a saved choice wins');
  assert.equal(load({ storage: { 'sot-lang': 'xx' } }).ev('LANG'), 'en', 'unknown languages fall back to English');
  const offline = load({ storage: { 'sot-lang': 'it' } });
  assert.equal(offline.ev('LANG'), 'en', 'no dictionary, no Italian');
  assert.equal(offline.ev('document.documentElement.lang'), 'en');
});

test('missing translations fall back to the English text, with placeholders filled', () => {
  const { ev } = load({ lang: 'it' });
  assert.equal(ev("tr('No such text, {n} times',{n:3})"), 'No such text, 3 times');
  assert.equal(ev("trn('{n} cat','{n} cats',1)"), '1 cat');
  assert.equal(ev("trn('{n} cat','{n} cats',2)"), '2 cats');
});

test('every Italian entry keeps the placeholders and HTML tags of its English text', () => {
  const dict = loadDict(path.join(__dirname, '..', 'site', 'i18n', 'it.js'));
  assert.ok(Object.keys(dict).length > 100);
  assert.deepEqual(brokenEntries(dict), []);
});

test('the language buttons on the title screen work before any game exists', () => {
  const { ev } = load();
  ev("[...document.querySelectorAll('#modalCard [data-act=langSet]')].find(b=>b.textContent==='Italiano').click()");
  assert.equal(ev("localStorage.getItem('sot-lang')"), 'it');
});

test('picking a language saves the choice and the game, then reloads', () => {
  const { ev } = load();
  ev('ACT.start({});dayTick()');
  ev("ACT.langSet({v:'it'})");
  assert.equal(ev("localStorage.getItem('sot-lang')"), 'it');
  assert.ok(ev("localStorage.getItem('sot-save-v1')"));
  ev("ACT.langSet({v:'klingon'})");
  assert.equal(ev("localStorage.getItem('sot-lang')"), 'it');
});

test('a scenario started in English shows its Italian name after switching', () => {
  const en = load();
  en.ev("ACT.startScn({id:'stg'});save()");
  const { ev } = load({ lang: 'it', storage: { 'sot-save-v1': en.ev("localStorage.getItem('sot-save-v1')") } });
  const name = ev("SCN.find(x=>x.id==='stg').n");
  assert.notEqual(name, en.ev("SCN.find(x=>x.id==='stg').n"));
  assert.ok(ev("document.getElementById('hAsn').textContent").includes(name));
});

for (const lang of ['en', 'it']) {
  test(`${lang}: every screen, failure and event renders without errors or unfilled placeholders`, () => {
    const { ev, errors } = load(lang === 'en' ? {} : { lang });
    seed(ev, 3);
    if (lang === 'it') {
      assert.match(ev("document.getElementById('modalCard').textContent"), /Come si gioca/);
      assert.equal(ev("document.querySelector('#hud [data-act=bank] .lbl').textContent"), 'Cassa · Banca');
    }
    const { thrown, leaks } = tour(ev);
    assert.ok(ev('(S.stats.f||{}).anchor'), 'Baltic and Red Sea anchors count for the badge in every language');
    assert.deepEqual(thrown, []);
    assert.deepEqual(leaks, []);
    assert.deepEqual(errors, []);
  });
}
