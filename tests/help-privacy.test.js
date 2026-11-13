// How multiplayer works and the privacy sheet (95-modals/61-help-more.js, actions 90-actions/89-help-privacy.js):
// they render in every language without a raw label, open from How to play, Settings and the multiplayer sheet, and
// Back returns to the sheet they were opened from. Fake relay nodes on a virtual clock, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { fedPage, settle, SERVERS_JSON } = require('./helpers/fed');

const txt = (p) => p.ev("$('modalCard').textContent");
const info = (p) => p.ev("(document.querySelector('#modalCard [data-info]')||{dataset:{}}).dataset.info||null");
const click = (p, sel) => p.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)throw new Error('no '+${JSON.stringify(sel)});b.click();})()`);

for (const lang of ['en', 'de', 'es', 'fr', 'it', 'pt']) {
  test(`help and privacy sheets in ${lang}: every label translated, nothing unfilled`, () => {
    const p = load(lang === 'en' ? {} : { lang });
    p.ev('ACT.start({})');
    for (const [name, src] of [['multiplayer help', 'showMpHelp()'], ['privacy', 'showPrivacy()']]) {
      p.ev(src);
      const t = txt(p);
      assert.ok(t.length > 600, `${lang} ${name}: has its text`);
      assert.doesNotMatch(t, /\b(mphelp|privacy|fedui|common)\.[a-z0-9_]+/, `${lang} ${name}: no raw label`);
      assert.doesNotMatch(t, /\{[a-z]\w*\}|undefined|NaN/, `${lang} ${name}: nothing unfilled`);
      const missing = JSON.parse(p.ev("JSON.stringify([...document.querySelectorAll('#modalCard [data-act]')].map(b=>b.dataset.act).filter(a=>!ACT[a]))"));
      assert.deepEqual(missing, [], `${lang} ${name}: every button has its action`);
    }
    assert.deepEqual(p.errors, []);
  });
}

test('privacy opens from Settings and Back returns to Settings, and How to play offers it', () => {
  const p = load();
  p.ev('ACT.start({});ACT.settings({})');
  click(p, '#modalCard [data-act="privacy"]');
  assert.equal(info(p), 'privacy');
  assert.match(txt(p), /What servers never keep/);
  assert.match(txt(p), /stats\.seriesoftub\.es/);
  assert.equal(p.ev('UI.setOpen'), false, 'Settings does not redraw over the sheet');
  click(p, '#modalCard .btns [data-act="infoBack"]');
  assert.match(txt(p), /Settings/);
  assert.equal(info(p), null);
  assert.equal(p.ev('UI.setOpen'), true);
  // From How to play: privacy is always there; How multiplayer works needs the browser to sign (not in plain jsdom).
  p.ev('ACT.settingsClose&&ACT.settingsClose({});showHelp()');
  assert.equal(p.ev(`!!document.querySelector('#modalCard [data-act="helpMp"]')`), false);
  click(p, '#modalCard [data-act="privacy"]');
  assert.equal(info(p), 'privacy');
  click(p, '#modalCard [data-act="infoBack"]');
  assert.match(txt(p), new RegExp(p.ev("tr('help.how_the_internet_works_here')")));
  // × closes everything.
  p.ev("ACT.privacy({from:'help'})");
  click(p, '#modalCard [data-act="infoClose"]');
  assert.equal(p.ev("$('modal').hidden"), true);
  assert.deepEqual(p.errors, []);
});

test('privacy works from the title screen and in a puzzle', () => {
  const p = load();
  p.ev('showTitle();ACT.settings({})');
  click(p, '#modalCard [data-act="privacy"]');
  assert.equal(info(p), 'privacy');
  click(p, '#modalCard [data-act="infoBack"]');
  assert.match(txt(p), /Settings/);
  assert.ok(p.ev("PZ_ACTS.has('privacy')&&PZ_ACTS.has('helpMp')&&PZ_ACTS.has('infoBack')&&PZ_ACTS.has('infoClose')"));
  assert.deepEqual(p.errors, []);
});

async function run(p) { for (let i = 0; i < 20; i++) { p.net.advance(200); await settle(); await new Promise((r) => setTimeout(r, 5)); } }

test('with multiplayer: How to play and the multiplayer sheet open both sheets, and Back finds its way', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  p.ev('ACT.start({});ACT.settings({})');
  await run(p);
  click(p, '#modalCard [data-act="fuOpen"]');
  await run(p);
  assert.equal(p.ev("($('modalCard').querySelector('.fedui')||{dataset:{}}).dataset.fu"), 'home');
  click(p, '#modalCard .fu-info [data-act="helpMp"]');
  assert.equal(info(p), 'mp');
  for (const w of ['Joining', 'Deals are private', 'Newcomers and mentors', 'When a server is down', 'private key', 'Leaderboards']) assert.ok(txt(p).includes(w), `help says ${w}`);
  // mp help → privacy → back to mp help → back to the multiplayer sheet → its × back to Settings.
  click(p, '#modalCard .btns [data-act="privacy"]');
  assert.equal(info(p), 'privacy');
  click(p, '#modalCard .btns [data-act="infoBack"]');
  assert.equal(info(p), 'mp');
  click(p, '#modalCard .btns [data-act="infoBack"]');
  await run(p);
  assert.equal(p.ev("($('modalCard').querySelector('.fedui')||{dataset:{}}).dataset.fu"), 'home');
  click(p, '#modalCard [data-act="fuClose"]');
  assert.match(txt(p), /Settings/, 'the multiplayer sheet still closes back to Settings');
  // How to play offers the multiplayer page where multiplayer works.
  p.ev('showHelp()');
  click(p, '#modalCard [data-act="helpMp"]');
  assert.equal(info(p), 'mp');
  click(p, '#modalCard .btns [data-act="infoBack"]');
  assert.match(txt(p), new RegExp(p.ev("tr('help.how_the_internet_works_here')")));
  assert.deepEqual(p.errors, []);
});

test('the sheets fit a 360 px phone, in portrait and landscape, with the tab bar', () => {
  const p = load();
  p.ev('ACT.start({})');
  for (const [w, h] of [[360, 740], [740, 360]]) {
    p.ev(`window.innerWidth=${w};window.innerHeight=${h};renderTabbar()`);
    assert.equal(p.ev('isPhone()'), true);
    for (const src of ['showMpHelp()', 'showPrivacy()']) {
      p.ev(src);
      assert.equal(p.ev("$('tabbar').hidden"), false, 'the tab bar stays');
      assert.ok(p.ev(`!!document.querySelector('#modalCard [data-act="infoClose"]')`), `${src}: can be closed`);
      assert.equal(p.ev(`[...document.querySelectorAll('#modalCard [style]')].filter(e=>/(^|;)\\s*(min-)?width:\\s*[4-9]\\d\\dpx/.test(e.getAttribute('style'))).length`), 0, `${src}: no fixed width wider than a phone`);
    }
  }
  assert.deepEqual(p.errors, []);
});
