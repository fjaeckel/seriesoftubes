// Toasts on a busy network (#498): one at a time, the rest waiting behind it and counted on it, repeats counted; a toast
// that points somewhere opens it on a tap.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const game = (w = 1440, h = 900) => {
  const g = load();
  g.ev(`window.matchMedia=window.matchMedia||(q=>({matches:/coarse/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));ACT.start({});window.innerWidth=${w};window.innerHeight=${h};S.cash=1e8;for(const k of Object.keys(S.done))delete S.done[k];UI.leftOpen=false;UI.sel=null;S.log=[];renderAll();$('toasts').textContent=''`);
  return g;
};
// Every toast, the one showing first, and the one showing alone.
const all = (g) => g.ev("[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent.trim())");
const shown = (g) => g.ev("[...document.querySelectorAll('#toasts .toast:not(.tq)')].map(t=>t.textContent.trim())");
const nav = (g) => g.ev("(document.querySelector('#toasts .toast:not(.tq) .tnext')||{}).textContent||''");

test('#498 one toast at a time on every screen: the rest wait behind it, counted on it, in the order they came', () => {
  for (const [w, h] of [[1440, 900], [390, 844], [844, 390]]) {
    const g = game(w, h);
    g.ev("for(let i=0;i<6;i++)toast('Notice number '+'abcdef'[i],'')");
    assert.equal(shown(g).length, 1, `${w}x${h}`);
    assert.match(shown(g)[0], /Notice number a/, 'the first one first');
    assert.equal(all(g).length, 6, 'the others wait');
    assert.match(nav(g), /1\/6/);
    assert.equal(g.ev("document.querySelector('#toasts .tnext').getAttribute('aria-label')"), 'Next notice (5 waiting)');
    // A tap on the counter shows the next one.
    g.ev("document.querySelector('#toasts .tnext').click()");
    assert.match(shown(g)[0], /Notice number b/);
    assert.match(nav(g), /1\/5/);
    assert.equal(g.ev("getComputedStyle(document.querySelector('#toasts .toast.tq')).display"), 'none', 'the waiting ones are hidden');
    assert.deepEqual(g.errors, []);
  }
});

test('chatter moves on sooner while others wait; a toast that fades shows the next', () => {
  const g = game();
  g.ev("toast('First news','')");
  assert.ok(g.ev("document.querySelector('#toasts .toast')._end-performance.now()") > 4000, 'alone it stays its time');
  g.ev("toast('Second news','')");
  assert.ok(g.ev("document.querySelector('#toasts .toast:not(.tq)')._end-performance.now()") <= 2000, 'and moves on soon once another waits');
  g.ev("toastDrop(document.querySelector('#toasts .toast:not(.tq)'))");
  assert.match(shown(g)[0], /Second news/);
  assert.equal(nav(g), '', 'nothing left waiting: no counter');
});

test('the same notice again counts up on its toast, showing or waiting, instead of queueing a copy', () => {
  const g = game();
  for (const p of [91, 93, 97]) g.ev(`toast('<b>Port running hot</b><br>Frankfurt is at ${p}%.','bad')`);
  assert.equal(all(g).length, 1);
  assert.match(shown(g)[0], /×3/);
  assert.match(shown(g)[0], /97%/, 'with the latest numbers');
  g.ev("toast('Waiting news','');toast('Waiting news','')");
  assert.equal(all(g).length, 2);
  assert.match(all(g)[1], /×2/);
});

test('trouble and toasts with a button go ahead of chatter; too many waiting leaves the oldest chatter to the log', () => {
  const g = game(390, 844);
  g.ev("for(let i=0;i<4;i++)toast('Chatter '+'abcd'[i],'good')");
  g.ev("toast('<b>Fiber cut</b><br>Paris is down.','bad',[{l:'Open',act:'focusCity',args:{city:'fra'}}])");
  assert.match(shown(g)[0], /Fiber cut/, 'trouble shows at once');
  assert.match(all(g)[1], /Chatter a/, 'the chatter it pushed aside is next');
  g.ev("toast('<b>Router crash</b>','bad')");
  assert.match(shown(g)[0], /Fiber cut/, 'trouble does not push trouble aside');
  assert.match(all(g)[1], /Router crash/, 'it waits ahead of the chatter');
  g.ev("for(let i=0;i<12;i++)toast('More chatter '+'abcdefghijkl'[i],'')");
  assert.equal(g.ev("document.querySelectorAll('#toasts .toast.tq').length"), 8, 'eight wait at most');
  assert.ok(all(g).some(t => /Router crash/.test(t)), 'trouble is kept');
  assert.ok(!all(g).some(t => /Chatter a/.test(t)), 'the oldest chatter went');
  assert.ok(g.ev("S.log.some(e=>/Chatter a/.test(e.t))"), 'and is in the NOC log');
});

test('an Undo shows at once and, once gone, what it pushed aside comes back', () => {
  const g = game();
  g.ev("toast('Some news','')");
  g.ev("const el=toastShow('Removed. Undo?','',[{l:'Undo',act:'undo',args:{}}],null,4000);el.classList.add('undo','imp')");
  assert.match(shown(g)[0], /Undo/);
  g.ev("toastDrop(document.querySelector('#toasts .toast.undo'))");
  assert.match(shown(g)[0], /Some news/);
});

test('tapping a toast that points somewhere goes there; Open all puts every toast away', () => {
  const g = game();
  g.ev("toast('<b>Spätzle-Sparkasse</b> would like to lend you money','',[{l:'Open bank',act:'bank',args:{}}]);toast('Other news','')");
  assert.equal(g.ev("document.querySelector('#toasts .toast').dataset.act"), 'toastGo');
  g.ev("document.querySelector('#toasts .toast .tx').click()");
  assert.equal(g.ev("$('bankBox').hidden"), false, 'the bank opened');
  assert.match(shown(g)[0], /Other news/, 'and the next notice took its place');
  g.ev("ACT.bankClose();for(let i=0;i<7;i++)toast('Chatter '+'abcdefg'[i],'')");
  g.ev("ACT.toastsMore()");
  assert.equal(g.ev('UI.left'), 'noc');
  assert.equal(g.ev('UI.logAll'), true);
  assert.ok(g.ev("!!document.querySelector('#leftBody #noteLog')"), 'the log is on screen');
  assert.equal(all(g).length, 0);
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

test('upright on a phone with a sheet up, still one toast, and its counter fits', () => {
  const g = game(390, 844);
  g.ev("ACT.phoneTab({t:'noc'});$('toasts').textContent='';document.body.classList.add('sheet-open')");
  g.ev("for(let i=0;i<3;i++)toast('Notice '+'abc'[i],'')");
  assert.equal(shown(g).length, 1);
  assert.match(nav(g), /1\/3/);
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
