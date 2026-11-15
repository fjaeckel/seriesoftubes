// Toasts on a busy network: a few at a time, repeats counted, the rest in a "+N" pill that opens the NOC log; a toast that
// points somewhere opens it on a tap.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const game = (w = 1440, h = 900) => {
  const g = load();
  g.ev(`window.matchMedia=window.matchMedia||(q=>({matches:/coarse/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));ACT.start({});window.innerWidth=${w};window.innerHeight=${h};S.cash=1e8;for(const k of Object.keys(S.done))delete S.done[k];UI.leftOpen=false;UI.sel=null;S.log=[];renderAll();$('toasts').textContent=''`);
  return g;
};
const shown = (g) => g.ev("[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent.trim())");
const pill = (g) => g.ev("(document.querySelector('#toasts .tmore')||{}).textContent||''");

test('a desk shows three toasts, a phone two, a phone on its side one; the rest are counted on a pill', () => {
  for (const [w, h, max] of [[1440, 900, 3], [390, 844, 2], [844, 390, 1]]) {
    const g = game(w, h);
    g.ev("for(let i=0;i<6;i++)toast('Notice number '+'abcdef'[i],'')");
    assert.equal(shown(g).length, max, `${w}x${h}`);
    assert.match(shown(g)[0], /Notice number f/, 'the newest first');
    assert.match(pill(g), new RegExp(`\\+${6 - max} more in the NOC log`));
    assert.equal(g.ev("$('toasts').lastElementChild.className"), 'tmore', 'the pill stays at the far end');
    assert.deepEqual(g.errors, []);
  }
});

test('the same notice again counts up on the toast already showing instead of stacking', () => {
  const g = game();
  for (const p of [91, 93, 97]) g.ev(`toast('<b>Port running hot</b><br>Frankfurt is at ${p}%.','bad')`);
  assert.equal(shown(g).length, 1);
  assert.match(shown(g)[0], /×3/);
  assert.match(shown(g)[0], /97%/, 'with the latest numbers');
  assert.equal(pill(g), '');
});

test('trouble and toasts with a button are the last to be pushed off', () => {
  const g = game(390, 844);
  g.ev("toast('<b>Fiber cut</b><br>Paris is down.','bad',[{l:'Open',act:'focusCity',args:{city:'fra'}}])");
  g.ev("for(let i=0;i<4;i++)toast('Chatter '+'abcd'[i],'good')");
  const s = shown(g);
  assert.equal(s.length, 2);
  assert.ok(s.some(t => /Fiber cut/.test(t)), 'the failure is still up');
  assert.match(s[0], /Chatter d/);
});

test('tapping a toast that points somewhere goes there; the pill opens the NOC log, all of it', () => {
  const g = game();
  g.ev("toast('<b>Spätzle-Sparkasse</b> would like to lend you money','goal',[{l:'Open bank',act:'bank',args:{}}])");
  assert.equal(g.ev("document.querySelector('#toasts .toast').dataset.act"), 'toastGo');
  g.ev("document.querySelector('#toasts .toast .tx').click()");
  assert.equal(g.ev("$('bankBox').hidden"), false, 'the bank opened');
  assert.equal(shown(g).length, 0, 'and the toast went away');
  g.ev("ACT.bankClose();for(let i=0;i<7;i++)toast('Chatter '+'abcdefg'[i],'')");
  g.ev("document.querySelector('#toasts .tmore').click()");
  assert.equal(g.ev('UI.left'), 'noc');
  assert.equal(g.ev('UI.logAll'), true);
  assert.ok(g.ev("!!document.querySelector('#leftBody #noteLog')"), 'the log is on screen');
  assert.equal(shown(g).length, 0);
  assert.equal(pill(g), '');
  assert.deepEqual(g.errors, []);
});

test('a badge toast still opens the wall of badges', () => {
  const g = game();
  g.ev("toast('<b>🏅 Badge</b>','goal',[],{a:'badges'})");
  assert.equal(g.ev("document.querySelector('#toasts .toast').dataset.act"), 'toastGo');
  g.ev("document.querySelector('#toasts .toast .tx').click()");
  assert.equal(g.ev('UI.left'), 'goals');
  assert.equal(g.ev('UI.fold.badges'), true);
});

test('the pill never promises more than the log holds (it keeps the last 60 lines)', () => {
  const g = game(390, 844);
  g.ev("for(let i=0;i<100;i++)toast('News number '+i.toString(36)+String.fromCharCode(97+i%26),'')");
  const n = +g.ev("(document.querySelector('#toasts .tmore')||{}).textContent.match(/\\d+/)[0]");
  assert.equal(g.ev('S.log.length'), 60);
  assert.equal(n, 58, 'the 60 lines in the log, less the two on screen');
});

test('upright on a phone with a sheet up, one toast shows, so the sheet and its handle stay clear', () => {
  const g = game(390, 844);
  g.ev("ACT.phoneTab({t:'noc'});$('toasts').textContent='';document.body.classList.add('sheet-open')");
  g.ev("for(let i=0;i<3;i++)toast('Notice '+'abc'[i],'')");
  assert.equal(shown(g).length, 1);
  assert.match(pill(g), /\+2 more/);
  assert.deepEqual(g.errors, []);
});

test('the NOC log can be cut down to one kind', () => {
  const g = game();
  g.ev("for(let i=0;i<4;i++)toast('<b>Trouble '+'abcd'[i]+'</b>','bad');for(let i=0;i<3;i++)toast('Good '+'abc'[i],'good');toast('Plain news','');ACT.leftTab({t:'noc'})");
  const chips = () => JSON.parse(g.ev("JSON.stringify([...document.querySelectorAll('#leftBody .lgf .bz-chip')].map(b=>[b.textContent.trim(),b.getAttribute('aria-pressed')]))"));
  assert.deepEqual(chips().map(c => c[0]), ['All 8', 'Other 1', 'Good news 3', 'Trouble 4']);
  g.ev("document.querySelector('#leftBody .lgf [data-args*=\"bad\"]').click()");
  assert.equal(g.ev("document.querySelectorAll('#leftBody .row.note').length"), 4);
  assert.equal(g.ev("document.querySelectorAll('#leftBody .row.note.bad').length"), 4);
  assert.equal(chips()[3][1], 'true');
  g.ev("document.querySelector('#leftBody .lgf [data-args*=\"all\"]').click()");
  assert.equal(g.ev('UI.logKind'), null);
  // A short log has no chips.
  const h = game();
  h.ev("toast('One','bad');toast('Two','good');ACT.leftTab({t:'noc'})");
  assert.equal(h.ev("document.querySelectorAll('#leftBody .lgf').length"), 0);
  assert.deepEqual(g.errors, []);
});
