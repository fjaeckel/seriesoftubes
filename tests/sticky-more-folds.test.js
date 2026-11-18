// The folds that follow you from POP to POP are not only the peering ones: the Change of the transit ports and PNIs you hold,
// every "?", and the link panels' sections and folds do too. Same rules as the sections (pop-sticky-sections.test.js): by kind
// of block, never by city or link, never in the save.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');
const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

function big(t, { width } = {}) {
  const g = load();
  t.after(() => g.dom.window.close());
  g.dom.window.__big = BIG;
  g.ev(`${width ? `window.innerWidth=${width};` : ''}S=migrate(JSON.parse(window.__big));UI.started=true;UI.speed=0;UI.sel=null;closeModal();compute()`);
  return g;
}
const q = (g, s) => [...g.dom.window.document.querySelectorAll('#panelBody ' + s)];
const at = (g, c, tab) => g.ev(`selectCity('${c}');${tab ? `ACT.tab({t:'${tab}'})` : ''}`);
const prefs = (g) => g.ev('JSON.stringify(pnPrefs())');
const pkeys = (g) => Object.keys(JSON.parse(prefs(g))).sort().join();
// The fold buttons of one kind of row ("t:" a transit port, "p:" a PNI), as {key, open}.
const rows = (g, p) => q(g, '[data-act="panelFold"]').map((b) => ({ k: JSON.parse(b.dataset.args).k, open: b.getAttribute('aria-expanded') === 'true', b }))
  .filter((r) => r.k.startsWith(p));
const kinds = (g, p) => rows(g, p).map((r) => g.ev(`pnKind('${r.k}')`) + (r.open ? '*' : ''));

test('the Change of a transit port follows you: the first port of this POP opens the first port of the next, not the second', (t) => {
  const g = big(t), { ev, errors } = g;
  // Two POPs with two ports each, one with a single port.
  assert.deepEqual(['ams', 'ash', 'rek'].map((c) => ev(`S.transit.filter(t=>t.city==='${c}').length`)), [2, 2, 1]);
  at(g, 'ams', 'up');
  assert.deepEqual(kinds(g, 't:').map((x) => x.replace('*', '')).sort(), ['t0', 't1'], 'a port is told apart by its place among the ones you hold');
  assert.ok(!kinds(g, 't:').some((x) => x.endsWith('*')), 'folded to start with');
  rows(g, 't:').find((r) => ev(`pnKind('${r.k}')`) === 't0').b.click();
  assert.deepEqual(kinds(g, 't:').filter((x) => x.endsWith('*')), ['t0*'], 'one port open here');
  assert.equal(prefs(g), '{"t0":1}');
  for (const c of ['ash', 'rek']) {
    at(g, c, 'up');
    const open = kinds(g, 't:').filter((x) => x.endsWith('*'));
    assert.deepEqual(open, ['t0*'], c + ': the first port is open without a click, the second stays folded');
    assert.ok(q(g, '[data-act="cancelTransit"]').length === 1, c + ': its controls are there');
  }
  // Fold it again: gone from the next POP.
  rows(g, 't:').find((r) => r.open).b.click();
  assert.equal(prefs(g), '{}');
  at(g, 'ams', 'up');
  assert.deepEqual(kinds(g, 't:').filter((x) => x.endsWith('*')), []);
  assert.equal(ev("pnKind('t:nowhere')+pnKind('t:')"), '');
  assert.deepEqual(errors, []);
});

test('the Change of a PNI follows you the same way: the first one you hold, not every PNI of the POP', (t) => {
  const g = big(t), { ev, errors } = g;
  // POPs where the first PNI you hold is live (a PNI still being built has no Change).
  const [a, b, c] = ev("Object.keys(S.pops).filter(c=>{const f=S.pni.find(p=>p.city===c);return f&&pniOn(f)&&S.pni.filter(p=>p.city===c).length>3}).sort().slice(0,3)");
  assert.ok(a && b && c, 'three POPs with several PNIs');
  at(g, a, 'peer');
  ev("ACT.panelFold({k:'s:pni',o:1})");       // not a click on the heading: a hot port may have opened it already
  assert.ok(!kinds(g, 'p:').some((x) => x.endsWith('*')));
  rows(g, 'p:').find((r) => ev(`pnKind('${r.k}')`) === 'p0').b.click();
  assert.deepEqual(kinds(g, 'p:').filter((x) => x.endsWith('*')), ['p0*']);
  assert.equal(q(g, '[data-act="cancelPni"]').length, 1, 'one PNI\'s controls');
  for (const n of [b, c]) {
    at(g, n);
    assert.equal(q(g, '.psec[data-sec="pni"].on').length, 1, n + ': the section is open too');
    assert.deepEqual(kinds(g, 'p:').filter((x) => x.endsWith('*')), ['p0*'], n + ': only the first');
    assert.equal(q(g, '[data-act="cancelPni"]').length, 1, n);
  }
  assert.equal(prefs(g), '{"s:pni":1,"p0":1}');
  assert.deepEqual(errors, []);
});

test('a "?" you open stays open on the next POP and the next tab that has it; folding it forgets it', (t) => {
  const g = big(t), { ev, errors } = g;
  const help = (k) => q(g, '.hb').find((b) => JSON.parse(b.dataset.args).k === 'h:' + k);
  const isOpen = (k) => help(k).getAttribute('aria-expanded') === 'true';
  at(g, 'ams', 'peer');
  ev("ACT.panelFold({k:'s:pni',o:1})");      // a "?" sits next to the heading of an open section
  assert.ok(help('pni') && help('cache'), 'two sections, two "?"');
  assert.deepEqual([isOpen('pni'), isOpen('cache')], [false, false]);
  help('pni').click();
  assert.deepEqual([isOpen('pni'), isOpen('cache')], [true, false], 'only the one you opened');
  at(g, 'ash');
  assert.deepEqual([isOpen('pni'), isOpen('cache')], [true, false], 'open on the next POP');
  assert.equal(pkeys(g), 'h:pni,s:pni');
  help('pni').click();
  assert.equal(pkeys(g), 's:pni');
  at(g, 'ams');
  assert.equal(isOpen('pni'), false);
  // On the Infra tab too: that "?" is its own kind.
  at(g, 'ams', 'links');
  assert.equal(q(g, '.hb').filter((b) => b.getAttribute('aria-expanded') === 'true').length, 0);
  ev("ACT.panelFold({k:'h:rt',o:1})");
  at(g, 'ash');
  assert.equal(ev("pnOpen('h:rt')"), true);
  assert.equal(pkeys(g), 'h:rt,s:pni');
  assert.deepEqual(errors, []);
});

test('link panels: what you open on one link is open on the next', (t) => {
  const g = big(t), { ev, errors } = g;
  const [l1, l2, l3] = ev("S.links.filter(l=>l.kind!=='df'&&l.kind!=='vxc'&&R.ef[edgeKey(l)]).map(l=>l.id).slice(0,3)");
  const sec = (k) => q(g, `.psec[data-sec="${k}"]`)[0];
  const on = (k) => sec(k) && sec(k).classList.contains('on');
  const go = (l) => ev(`ACT.selLink({id:'${l}'})`);
  // What each link shows by itself (a link with real traffic opens its traffic section on its own).
  const own = [l1, l2, l3].map((l) => { go(l); return [on('traf'), on('met')]; });
  assert.ok(own.every(([, m]) => m === false), 'the routing metric starts folded');
  go(l1);
  sec('met').querySelector('.psb').click();
  assert.equal(prefs(g), '{"s:met":1}');
  [l2, l3].forEach((l, i) => { go(l); assert.deepEqual([on('traf'), on('met')], [own[i + 1][0], true], l + ': the metric is open, the traffic as it was'); });
  sec('met').querySelector('.psb').click();   // fold it: forgotten
  assert.equal(prefs(g), '{}');
  go(l1);
  assert.equal(on('met'), false);
  assert.deepEqual(errors, []);
});

test('link panels: the folds under the optics, the line system and what you sell follow you from one fibre to the next', (t) => {
  const g = big(t), { ev, errors } = g;
  ev(`S.links.push({id:'fibA',a:'fra',b:'ams',kind:'df',own:true,sub:false,sys:'lite',km:400,ch:['zr4','zr4','zr8'],ready:0,day:0,cut:0,mo:1},
    {id:'fibB',a:'fra',b:'par',kind:'df',own:true,sub:false,sys:'lite',km:500,ch:['zr4','zr8'],ready:0,day:0,cut:0,mo:1});compute()`);
  const open = () => q(g, '.pnfold [data-act="panelFold"]').map((b) => JSON.parse(b.dataset.args).k + (b.getAttribute('aria-expanded') === 'true' ? '*' : ''));
  const on = (k) => { const s = q(g, `.psec[data-sec="${k}"]`)[0]; return s ? s.classList.contains('on') : undefined; };
  ev("ACT.selLink({id:'fibA'})");
  const before = open();
  assert.ok(before.length && before.every((k) => !k.endsWith('*')), 'folded: ' + before);
  const spare = q(g, '.pnfold [data-act="panelFold"]').find((b) => JSON.parse(b.dataset.args).k === 'sp');
  assert.ok(spare, 'the spares shelf has its fold');
  spare.click();
  ev("ACT.panelFold({k:'s:ls',o:1});ACT.panelFold({k:'s:sell',o:1});ACT.panelFold({k:'h:opt',o:1})");
  assert.equal(pkeys(g), 'h:opt,s:ls,s:sell,sp');
  ev("ACT.selLink({id:'fibB'})");
  assert.deepEqual([on('ls'), on('sell')], [true, true], 'the sections');
  assert.ok(open().includes('sp*'), 'the shelf: ' + open());
  assert.equal(ev("pnOpen('h:opt')"), true, 'the "?" over the optics');
  assert.equal(ev("pnOpen('ox')||pnOpen('su')"), false, 'what you did not open stays folded');
  assert.deepEqual(errors, []);
});

test('on a phone the same, and the save is never touched', (t) => {
  const g = big(t, { width: 360 }), { ev, errors } = g;
  assert.equal(ev('isPhone()'), true);
  const save = ev('JSON.stringify(S)');
  at(g, 'ams', 'up');
  rows(g, 't:').find((r) => ev(`pnKind('${r.k}')`) === 't0').b.click();
  at(g, 'ash', 'up');
  assert.deepEqual(kinds(g, 't:').filter((x) => x.endsWith('*')), ['t0*']);
  const [l1, l2] = ev("S.links.filter(l=>l.kind!=='df'&&l.kind!=='vxc'&&R.ef[edgeKey(l)]).map(l=>l.id).slice(0,2)");
  ev(`ACT.selLink({id:'${l1}'});ACT.panelFold({k:'s:met',o:1})`);
  ev(`ACT.selLink({id:'${l2}'})`);
  assert.equal(q(g, '.psec[data-sec="met"].on').length, 1);
  assert.equal(ev('JSON.stringify(S)'), save, 'nothing of it is in S');
  assert.deepEqual(errors, []);
});
