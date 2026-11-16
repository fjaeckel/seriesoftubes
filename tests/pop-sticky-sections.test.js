// What you unfold in a POP's panel stays unfolded on the next POP, so adding a peering port to ten POPs in a row is
// one click each. The choice belongs to the kind of block, never to a city, and never to the save.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');
const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');

// The late-game network (104 POPs). storage: what this browser already remembers; width: the screen.
function big(t, { storage, width } = {}) {
  const g = load({ storage });
  t.after(() => g.dom.window.close());
  g.dom.window.__big = BIG;
  g.ev(`${width ? `window.innerWidth=${width};` : ''}S=migrate(JSON.parse(window.__big));UI.started=true;UI.speed=0;UI.sel=null;closeModal();compute()`);
  return g;
}
const q = (g, s) => [...g.dom.window.document.querySelectorAll('#panelBody ' + s)];
const sec = (g, k) => q(g, `.psec[data-sec="${k}"]`)[0];
const on = (g, k) => { const s = sec(g, k); return s ? s.classList.contains('on') : undefined; };
const head = (g, k) => q(g, `.psec[data-sec="${k}"] .psb`)[0];
// The fold of each exchange row ("Get a port" on one you have not joined, "Change" on one you have), in list order.
const xRows = (g) => q(g, '[data-act="panelFold"]').filter((b) => /^x:/.test(JSON.parse(b.dataset.args).k));
const xOpen = (g) => xRows(g).map((b) => b.getAttribute('aria-expanded') === 'true');
const buy = (g) => q(g, '[data-act="buyIx"]:not([disabled])');
const at = (g, c, tab) => g.ev(`selectCity('${c}');${tab ? `ACT.tab({t:'${tab}'})` : ''}`);
const stored = (g) => g.dom.window.localStorage.getItem('sot-folds');
const prefs = (g) => g.ev('JSON.stringify(pnPrefs())');
// ev() hands back arrays of the page's own realm; a plain copy compares with deepEqual.
const plain = (x) => JSON.parse(JSON.stringify(x));
const key = (g, k) => g.dom.window.document.dispatchEvent(new g.dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));

test('unfold the exchange section and "Get a port" once, and every POP you move to has them open: a port is one click', (t) => {
  const g = big(t), { ev, errors } = g;
  // Three single-exchange POPs where you have no port yet.
  for (const c of ['drw', 'mrs', 'per']) assert.equal(ev(`ixIdsIn('${c}').length+':'+(S.ixp['${c}']===undefined)`), '1:true', c);
  at(g, 'drw', 'peer');
  assert.equal(on(g, 'ix'), false, 'nothing needs you there, so the section is folded');
  assert.equal(buy(g).length, 0);
  head(g, 'ix').click();                      // click 1: the section
  assert.deepEqual(xOpen(g), [false]);
  xRows(g)[0].click();                        // click 2: "Get a port"
  assert.ok(buy(g).length > 0, 'the port sizes');
  // By the map, by Find, by the keys: the next POP starts the same way.
  for (const hop of ["selectCity('mrs')", "ACT.focusCity({city:'per'})"]) {
    ev(hop);
    assert.equal(on(g, 'ix'), true, hop);
    assert.deepEqual(xOpen(g), [true], hop);
    assert.ok(buy(g).length > 0, hop + ': the port sizes are there without a click');
  }
  // One click, and the port is bought.
  buy(g)[0].click();
  assert.notEqual(ev("S.ixp['per']"), undefined);
  assert.deepEqual(errors, []);
});

test('[ and ] step through your POPs with the section still open, a POP with no exchange yet included: there it is "found your own IX"', (t) => {
  const g = big(t), { ev, errors } = g;
  const order = plain(ev('popOrder()'));
  assert.deepEqual(order.slice(0, 3), ['auh', 'ams', 'ash'], 'Abu Dhabi has no exchange, Amsterdam and Ashburn do');
  assert.equal(ev("ixIdsIn('auh').length&&!!ixName('auh')"), 0);
  at(g, 'ams', 'peer');
  ev("ACT.panelFold({k:'s:ix',o:1})");
  assert.equal(on(g, 'ix'), true);
  assert.equal(q(g, '[data-act="foundIx"]').length, 0, 'Amsterdam has its exchange: nothing to found');
  key(g, '[');
  assert.equal(ev('UI.sel.id'), 'auh');
  assert.equal(on(g, 'ix'), true, 'open with no exchange too: that is where you start your own');
  assert.equal(q(g, '[data-act="foundIx"]').length, 1, 'the offer to found your own IX is there without a click');
  assert.equal(prefs(g), '{"s:ix":1}', 'the choice is kept');
  // Round the list: open at every POP, all of it (not just what needs you); the offer where there is no exchange.
  const seen = [];
  for (let i = 0; i < 12; i++) {
    key(g, ']');
    const c = ev('UI.sel.id'), has = !!ev(`ixIdsIn('${c}').length&&ixName('${c}')`);
    assert.equal(on(g, 'ix'), true, c);
    assert.equal(q(g, '[data-act="foundIx"]').length, has ? 0 : 1, c + (has ? ': it has an exchange' : ': no exchange, so the offer'));
    if (has) assert.equal(q(g, '.psec[data-sec="ix"] .pnmore [data-act="panelFold"]').length, 0, c + ': every exchange, not "Show all"');
    seen.push(has);
  }
  assert.equal(ev('UI.sel.id'), order[12], 'twelve steps on from the first POP');
  assert.ok(seen.includes(true) && seen.includes(false), 'POPs with and without an exchange on the way');
  assert.deepEqual(errors, []);
});

test('only what you opened opens: a city with three exchanges opens the one you opened, and the rest stays as it was', (t) => {
  const g = big(t), { ev, errors } = g;
  // An exchange is told apart by its place in its city's list: the first is the incumbent.
  // Joined or not does not matter: it is the place in the list ('x:ams' is Amsterdam's, which you have joined).
  assert.deepEqual(plain(ev("['x:mnl','x:mnl~2','x:mnl~3','x:ams','x:nowhere','x:mnl~99','h:ix','s:decom','std','rtc'].map(pnKind)")),
    ['x0', 'x1', 'x2', 'x0', '', '', '', '', 'std', 'rtc']);
  ev("for(const x of ['dxb','dxb~2'])delete S.ixp[x];compute()");
  at(g, 'mnl', 'peer');
  ev("ACT.panelFold({k:'s:ix',o:1})");
  const rows = xRows(g);
  assert.equal(rows.length, 3);
  assert.deepEqual(xOpen(g), [false, false, false]);
  rows[1].click();                            // the second exchange only
  assert.deepEqual(xOpen(g), [false, true, false], 'a tap on one row does not move the others');
  at(g, 'dxb');
  assert.deepEqual(xOpen(g), [false, true], 'the second exchange of the next city; the incumbent stays folded');
  // Once you have a port the same tap is "Change": the place in the list is what counts, not whether you joined.
  ev("S.ixp.dxb=0;compute()");              // a port there now (set directly: what this checks is the fold)
  at(g, 'mnl');
  assert.deepEqual(xOpen(g), [false, true, false]);
  at(g, 'dxb');
  assert.deepEqual(xOpen(g), [false, true], 'the second exchange is still the one that is open');
  assert.equal(ev("pnKind('x:dxb')"), 'x0');
  assert.deepEqual(errors, []);
});

test('a port is one click whether you are in the exchange, have to join it or have to found it: one fold follows you across all three', (t) => {
  const g = big(t), { ev, errors } = g;
  // Amsterdam: joined ("Change"). Darwin: an exchange you have not joined ("Get a port"). Abu Dhabi: no exchange yet.
  assert.equal(ev("S.ixp.ams!==undefined&&S.ixp.drw===undefined&&!(ixIdsIn('auh').length&&ixName('auh'))"), true);
  at(g, 'ams', 'peer');
  // Only the first exchange of a city opens (Amsterdam has three), whatever you hold in it.
  const first = (n, yes) => Array.from({ length: n }, (_, i) => i === 0 && yes);
  ev("ACT.panelFold({k:'s:ix',o:1})");        // not a click on the heading: a hot port may have opened it already
  const rows = xRows(g).length;
  assert.equal(rows, 3);
  assert.deepEqual(xOpen(g), first(rows, false));
  xRows(g)[0].click();                        // the Change of the exchange you are in
  assert.deepEqual(xOpen(g), first(rows, true));
  for (const c of ['drw', 'auh', 'ams', 'mrs']) {
    ev(`selectCity('${c}')`);
    assert.equal(on(g, 'ix'), true, c + ': the section');
    if (c === 'auh') assert.equal(q(g, '[data-act="foundIx"]').length, 1, c + ': founding your own, there without a click');
    else assert.deepEqual(xOpen(g), first(xRows(g).length, true), c + ': Get a port or Change, open without a click');
  }
  ev("selectCity('drw')");
  assert.ok(buy(g).length > 0, 'the port sizes of the exchange you have not joined');
  xRows(g)[0].click();                        // fold it from the other kind: it goes everywhere, as it came
  for (const c of ['ams', 'mrs']) {
    ev(`selectCity('${c}')`);
    assert.equal(on(g, 'ix'), true, c);
    assert.deepEqual(xOpen(g), first(xRows(g).length, false), c);
  }
  assert.equal(prefs(g), '{"s:ix":1}');
  assert.deepEqual(errors, []);
});

test('folding a block forgets it, so the next POP is back to what it would have shown', (t) => {
  const g = big(t), { ev, errors } = g;
  at(g, 'drw', 'peer');
  head(g, 'ix').click(); head(g, 'pni').click(); xRows(g)[0].click();
  assert.equal(prefs(g), '{"s:ix":1,"s:pni":1,"x0":1}');
  head(g, 'pni').click();                     // fold one again
  assert.equal(on(g, 'pni'), false);
  assert.equal(prefs(g), '{"s:ix":1,"x0":1}');
  at(g, 'mrs');
  assert.deepEqual([on(g, 'ix'), on(g, 'pni')], [true, false]);
  head(g, 'ix').click(); xRows(g).length && assert.equal(xOpen(g).length, 0, 'a folded section has no rows');
  ev("ACT.panelFold({k:'x:mrs',o:0})");
  assert.equal(prefs(g), '{}');
  assert.equal(stored(g), null, 'nothing left to remember');
  at(g, 'per');
  assert.equal(on(g, 'ix'), false);
  assert.deepEqual(errors, []);
});

test('the Infra tab: a section you open follows you, and a city without it (no fabric to join) keeps the choice', (t) => {
  const g = big(t), { ev, errors } = g;
  at(g, 'ams', 'links');
  assert.ok(sec(g, 'nni'), 'Amsterdam is on an interconnection fabric');
  assert.equal(on(g, 'nni'), false);
  assert.equal(on(g, 'power'), false);
  q(g, '.pnjump [data-act="panelJump"]').find((b) => JSON.parse(b.dataset.args).k === 'nni').click();   // a chip unfolds what it jumps to
  head(g, 'power').click();
  assert.equal(on(g, 'nni'), true);
  assert.equal(prefs(g), '{"s:nni":1,"s:power":1}');
  at(g, 'drw');
  assert.equal(sec(g, 'nni'), undefined, 'no fabric in Darwin: no section');
  assert.equal(on(g, 'power'), true);
  assert.equal(prefs(g), '{"s:nni":1,"s:power":1}', 'kept while it is not shown');
  at(g, 'ash');
  assert.deepEqual([on(g, 'nni'), on(g, 'power'), on(g, 'scrub'), on(g, 'metro')], [true, true, false, false], 'and open again, and nothing else opened');
  assert.deepEqual(errors, []);
});

test('the routers\' Change and the POP tiers stay open from one POP to the next too', (t) => {
  const g = big(t), { ev, errors } = g;
  const routers = () => q(g, '[data-act="addRouter"]').length;
  at(g, 'ams', 'links');
  at(g, 'ash');
  assert.equal(routers(), 0, 'folded: neither router has a full load or ports');
  const fold = () => q(g, '.rgrp [data-act="panelFold"]')[0];
  assert.deepEqual(JSON.parse(fold().dataset.args), { k: 'rtc', o: 1 });
  fold().click();
  assert.equal(routers(), 1);
  at(g, 'ams');
  assert.equal(routers(), 1, 'open on the next POP');
  fold().click();
  at(g, 'ash');
  assert.equal(routers(), 0);
  assert.equal(prefs(g), '{}');
  assert.deepEqual(errors, []);
});

test('not everything follows you: a list\'s page, a "?", one PNI\'s Change and Decommission start closed on the next POP', (t) => {
  const g = big(t), { ev, errors } = g;
  const [a, b] = ev("Object.keys(S.pops).filter(c=>S.pni.filter(p=>p.city===c).length>4).sort().slice(0,2)");
  assert.ok(a && b, 'two POPs with PNIs');
  at(g, a, 'peer');
  head(g, 'pni').click();
  q(g, '[data-act="panelFold"]').find((x) => /^p:/.test(JSON.parse(x.dataset.args).k)).click();
  assert.equal(q(g, '[data-act="cancelPni"]').length, 1, 'one PNI\'s controls are open');
  ev("ACT.panelFold({k:'h:pni',o:1});ACT.panelMore({k:'cache',n:4})");
  assert.equal(ev("pnOpen('h:pni')"), true);
  at(g, b);
  assert.equal(on(g, 'pni'), true, 'the PNI section follows you');
  assert.equal(q(g, '[data-act="cancelPni"]').length, 0, 'its Change does not: that was one PNI');
  assert.equal(ev("pnOpen('h:pni')"), false, 'nor does the "?"');
  assert.equal(ev("pnState().n.cache"), undefined, 'nor does the length of a list');
  assert.equal(prefs(g), '{"s:pni":1}');
  // Decommission: a button that shuts a POP down is opened on purpose.
  at(g, a, 'links');
  ev("ACT.panelFold({k:'s:decom',o:1})");
  assert.equal(on(g, 'decom'), true);
  at(g, b);
  assert.equal(on(g, 'decom'), false);
  assert.equal(prefs(g), '{"s:pni":1}');
  assert.ok(!/decom/.test(stored(g)));
  assert.deepEqual(errors, []);
});

test('a search decides the sections while it lasts, and what you left open is there again when it ends', (t) => {
  const g = big(t), { ev, errors } = g;
  at(g, 'drw', 'peer');
  head(g, 'ix').click();
  assert.equal(on(g, 'ix'), true);
  ev("ACT.netFind({q:'zzzz no such network'})");
  assert.equal(on(g, 'ix'), false, 'nothing found there');
  at(g, 'mrs');
  assert.equal(on(g, 'ix'), false, 'still searching');
  ev('ACT.netClear()');
  assert.equal(on(g, 'ix'), true);
  assert.deepEqual(errors, []);
});

test('this browser remembers it, validated like any stored value; the save is never touched', (t) => {
  const g = big(t), { ev, errors } = g;
  const save = ev('JSON.stringify(S)'), fields = ev('Object.keys(S).join()');
  at(g, 'drw', 'peer');
  head(g, 'ix').click(); xRows(g)[0].click();
  assert.equal(stored(g), '{"s:ix":1,"x0":1}');
  at(g, 'mrs');
  assert.equal(ev('JSON.stringify(S)'), save, 'nothing of it is in S, so no default in newGame() or repair in sanitize()');
  assert.equal(ev('Object.keys(S).join()'), fields);
  // A new page in the same browser starts from it.
  const h = big(t, { storage: { 'sot-folds': stored(g) } });
  at(h, 'per', 'peer');
  assert.equal(on(h, 'ix'), true);
  assert.deepEqual(xOpen(h), [true]);
  // Anything else is ignored: unknown kinds, other values, damaged text.
  for (const [raw, want] of [
    ['{"s:decom":1,"s:traf":1,"x9":1,"x":1,"xj0":1,"xc2":1,"h:ix":1,"__proto__":1,"bogus":1}', '{}'],
    ['{"s:ix":"yes","s:pni":true,"s:cache":2,"s:power":0}', '{}'],
    ['{"s:ix":1,"x2":1,"std":1,"rtc":1}', '{"s:ix":1,"std":1,"rtc":1,"x2":1}'],
    ['not json', '{}'], ['[1,2]', '{}'], ['"s:ix"', '{}'], ['null', '{}'], ['5', '{}'],
  ]) {
    const x = big(t, { storage: { 'sot-folds': raw } });
    assert.deepEqual(Object.keys(JSON.parse(x.ev('JSON.stringify(pnPrefs())'))).sort(), Object.keys(JSON.parse(want)).sort(), raw);
    assert.deepEqual(x.errors, [], raw);
  }
  assert.deepEqual(errors, []);
});

test('a young network is left as it was: every section open, nothing remembered', (t) => {
  const g = load(), { ev, errors } = g;
  t.after(() => g.dom.window.close());
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;selectCity(S.home);ACT.tab({t:'peer'})");
  assert.ok(ev('Object.keys(S.pops).length') < 4);
  assert.deepEqual(q(g, '.psec').map((x) => x.classList.contains('on')), [true, true, true]);
  ev("ACT.panelFold({k:'s:pni',o:0});ACT.panelFold({k:'s:pni',o:1});ACT.panelFold({k:'s:ix',o:0})");
  assert.equal(prefs(g), '{}');
  assert.equal(stored(g), null);
  // And a choice made on a big network does not close or open anything in one.
  ev("pnPrefs()['s:ix']=1");
  assert.equal(ev("pnStuck('s:ix')"), false);
  assert.deepEqual(errors, []);
});

test('link panels are unchanged: a section opened on one link is not opened on the next', (t) => {
  const g = big(t), { ev, errors } = g;
  const [l1, l2] = ev("S.links.filter(l=>l.kind!=='df'&&l.kind!=='vxc'&&R.ef[edgeKey(l)]).map(l=>l.id).slice(0,2)");
  ev(`ACT.selLink({id:'${l1}'});ACT.panelFold({k:'s:traf',o:1})`);
  assert.equal(ev("pnOpen('s:traf')"), true);
  ev(`ACT.selLink({id:'${l2}'})`);
  assert.equal(ev("pnOpen('s:traf')"), false);
  assert.equal(ev("pnStuck('s:traf')"), false);
  assert.equal(prefs(g), '{}');
  assert.deepEqual(errors, []);
});

test('on a phone the same: the sheet keeps what you opened from POP to POP, and opens nothing more', (t) => {
  const g = big(t, { width: 360 }), { ev, errors } = g;
  assert.equal(ev('isPhone()'), true);
  at(g, 'drw', 'peer');
  head(g, 'ix').click(); xRows(g)[0].click();
  const shown = () => q(g, '.psec.on').map((s) => s.dataset.sec);
  for (const c of ['mrs', 'drw']) {
    ev(`selectCity('${c}')`);
    assert.ok(buy(g).length > 0, c);
    assert.equal(ev("$('panel').classList.contains('full')"), false, 'the sheet is back to its usual height, as for any POP');
    assert.ok(!shown().includes('pni'), c + ': the PNI section is not opened for you');
  }
  // The short way round: Find, then the keys, then a tab and back.
  ev("ACT.focusCity({city:'mnl'})");
  assert.deepEqual(xOpen(g), [true, false, false], 'one block of three');
  ev("ACT.tab({t:'cust'});ACT.tab({t:'peer'})");
  assert.equal(on(g, 'ix'), true, 'a tab and back');
  assert.deepEqual(errors, []);
});
