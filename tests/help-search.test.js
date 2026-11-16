// How to play (95-modals/60-help.js): the glossary is an index of closed topics under a search box that filters them
// by heading or text as you type; the network menu keeps How to play and Export save one tap away as tiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const type = (p, q) => p.ev(`(()=>{const i=$('helpQ');i.value=${JSON.stringify(q)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const shown = (p) => JSON.parse(p.ev("JSON.stringify([...document.querySelectorAll('#helpGl details')].filter(d=>!d.hidden).map(d=>d.querySelector('summary').textContent))"));
const open = (p) => JSON.parse(p.ev("JSON.stringify([...document.querySelectorAll('#helpGl details')].filter(d=>d.open&&!d.hidden).map(d=>d.querySelector('summary').textContent))"));

test('How to play: every topic is there, closed, with the controls and the search box on top', () => {
  const p = load();
  p.ev('ACT.start({});ACT.help()');
  const all = shown(p);
  assert.ok(all.length >= 47, 'all topics listed');
  assert.equal(new Set(all).size, all.length, 'no two topics share a heading');
  for (const t of ['Eyeballs', 'POP', 'IP transit', 'Tier 1 / Tier 2', 'CDN', 'IX (Internet Exchange)', 'PNI', '95th percentile', 'LAGs']) assert.ok(all.includes(t), t);
  assert.deepEqual(open(p), [], 'topics start closed');
  assert.equal(p.ev("document.querySelectorAll('#helpGl details').length===document.querySelectorAll('#helpGl details>p').length"), true);
  assert.ok(p.ev("[...document.querySelectorAll('#helpGl details>p')].every(e=>e.textContent.length>40)"), 'every topic keeps its text');
  assert.match(p.ev("$('modalCard').textContent"), /Controls:/);
  assert.equal(p.ev("!!document.querySelector('#modalCard>.mhead #helpQ')&&!!document.querySelector('#modalCard>.mhead .x')"), true, 'search and close share the sticky head');
  assert.deepEqual(p.errors, []);
});

test('How to play: typing filters by heading or text, a short list opens itself, clearing restores the index', () => {
  const p = load();
  p.ev('ACT.start({});ACT.help()');
  const n = shown(p).length;
  type(p, 'eyeb');
  assert.ok(shown(p).includes('Eyeballs'));
  assert.ok(shown(p).length < n);
  type(p, '95TH');// case does not matter
  assert.deepEqual(shown(p), ['95th percentile']);
  assert.deepEqual(open(p), ['95th percentile'], 'the only hit opens');
  assert.equal(p.ev("$('helpNone').hidden"), true);
  type(p, 'forgiven');// only in the text of a topic, not in a heading
  assert.ok(shown(p).length >= 1 && shown(p).every(h => !/forgiven/i.test(h)));
  type(p, 'zzzqqq');
  assert.deepEqual(shown(p), []);
  assert.equal(p.ev("$('helpNone').hidden"), false);
  assert.match(p.ev("$('helpNone').textContent"), /zzzqqq/);
  type(p, '');
  assert.equal(shown(p).length, n);
  assert.deepEqual(open(p), [], 'what the search opened closes again');
  assert.equal(p.ev("$('helpNone').hidden"), true);
  // a topic the player opened stays open through a search
  p.ev("document.querySelector('#helpGl details').open=true");
  type(p, 'cdn');type(p, '');
  assert.deepEqual(open(p), ['Eyeballs']);
  assert.deepEqual(p.errors, []);
});

test('How to play in German: the search finds translated headings', () => {
  const p = load({ lang: 'de' });
  p.ev('ACT.start({});ACT.help()');
  type(p, 'privatk');
  assert.ok(shown(p).includes('Privatkunden'));
  assert.doesNotMatch(p.ev("$('helpQ').placeholder+$('modalCard').textContent"), /\bhelp\.[a-z0-9_]+/);
  assert.deepEqual(p.errors, []);
});

test('network menu: How to play and Export save are tiles, nothing was dropped', () => {
  const p = load();
  p.ev('ACT.start({});closeModal();ACT.menu()');
  const acts = JSON.parse(p.ev("JSON.stringify([...document.querySelectorAll('#modalCard [data-act]')].map(b=>b.dataset.act))"));
  for (const a of ['closeModal', 'toTitle', 'puzzleMenu', 'scenarios', 'opsOpen', 'share', 'settings', 'help', 'exportSave', 'importPick', 'xfer', 'resetAsk', 'rename']) assert.ok(acts.includes(a), a);
  const tiles = JSON.parse(p.ev("JSON.stringify([...document.querySelectorAll('#modalCard .mtile')].map(b=>b.dataset.act))"));
  assert.ok(tiles.includes('help') && tiles.includes('exportSave') && tiles.includes('settings') && tiles.includes('mute'));
  assert.equal(acts.filter(a => a === 'exportSave').length, 1);
  assert.deepEqual(p.errors, []);
});
