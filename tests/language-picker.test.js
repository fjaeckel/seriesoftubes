const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const pick = (ev, id) => JSON.parse(ev(`(()=>{const s=document.getElementById('${id}');return JSON.stringify(s&&{tag:s.tagName,value:s.value,chg:s.dataset.chg,
  opts:[...s.options].map(o=>[o.value,o.textContent,o.lang]),label:(document.querySelector('label[for=${id}]')||{}).textContent});})()`));

test('language is one dropdown on the title screen and in Settings, in every language, with the current one selected', () => {
  for (const lang of ['en', 'it', 'pt', 'fr', 'es', 'de']) {
    const { ev, errors } = load(lang === 'en' ? {} : { lang });
    const langs = JSON.parse(ev('JSON.stringify(Object.entries(LANGS))'));
    const title = pick(ev, 'langTitle');
    assert.equal(title.tag, 'SELECT', `${lang}: title screen`);
    assert.equal(title.value, lang);
    assert.deepEqual(title.opts, langs.map(([v, l]) => [v, l, v]), `${lang}: every language, named in itself`);
    assert.equal(title.label, ev("tr('common.language')"), `${lang}: labelled`);
    assert.equal(ev("document.querySelectorAll('#modalCard [data-act=langSet]').length"), 0, `${lang}: no language buttons left`);
    ev("ACT.start({});ACT.settings()");
    const set = pick(ev, 'langSel');
    assert.equal(set.value, lang, `${lang}: settings`);
    assert.equal(set.label, ev("tr('common.language')"));
    assert.deepEqual(errors, []);
  }
});

test('changing the dropdown in Settings switches language and keeps the game', () => {
  const { ev, errors } = load();
  ev("ACT.start({});dayTick();ACT.settings();const s=document.getElementById('langSel');s.value='fr';s.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(ev("localStorage.getItem('sot-lang')"), 'fr');
  assert.ok(ev("slotRaw(UI.slot)"), 'saved before reloading');
  assert.deepEqual(errors, []);
});

test('the dropdown fits a phone', () => {
  const { ev, errors } = load();
  ev('window.innerWidth=360;showTitle()');
  assert.ok(ev("document.getElementById('langTitle').classList.contains('pick')"));
  assert.deepEqual(errors, []);
});
