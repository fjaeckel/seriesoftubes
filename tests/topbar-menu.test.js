// The top bar, the network menu, How to play's foot and the start screen: what moved where, and that it still works.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;closeModal()";
const css = dom => [...dom.window.document.querySelectorAll('style')].map(s => s.textContent).join('\n');

test('sound is one tap away in the menu, shows its state and flips in place; the top bar keeps it only for puzzles', () => {
  const { ev, dom, errors } = load();
  const d = dom.window.document;
  ev(start); ev("UI.muted=false;ACT.menu()");
  const tile = () => d.querySelector('#modalCard .mtile[data-act="mute"]');
  assert.ok(tile(), 'the Sound tile is there');
  assert.match(tile().textContent, /Sound\s+On/); assert.equal(tile().getAttribute('aria-pressed'), 'true');
  tile().click();
  assert.equal(ev('UI.muted'), true);
  assert.equal(ev("$('modal').hidden"), false, 'the menu stays open');
  assert.match(tile().textContent, /Sound\s+Off/); assert.equal(tile().getAttribute('aria-pressed'), 'false');
  assert.equal(ev("localStorage.getItem('sot-mute')"), '1', 'and it is remembered');
  tile().click(); assert.equal(ev('UI.muted'), false); assert.match(tile().textContent, /Sound\s+On/);
  // Phones get the same tile; the NOC's own window is for screens that have room for one.
  ev("window.innerWidth=390;closeModal();renderAll();ACT.menu()");
  assert.ok(tile()); assert.match(d.querySelector('#modalCard [data-act="nocWindow"]').className, /hide-sm/);
  const c = css(dom);
  assert.match(c, /\.speed #muteBtn\{display:none\}body\.pz \.speed #muteBtn\{display:block\}/);
  assert.equal(d.querySelector('#hud [data-act="help"]'), null); assert.equal(d.querySelector('#hud [data-act="nocWindow"]'), null);
  assert.deepEqual(errors, []);
});

test('How to play ends in one row of three small link cards', () => {
  const { ev, dom, errors } = load();
  ev(start); ev("ACT.help()");
  const a = [...dom.window.document.querySelectorAll('#modalCard .menu-plugs.three a.mplug')];
  assert.equal(a.length, 3);
  for (const x of a) { assert.match(x.href, /^https:\/\//); assert.equal(x.target, '_blank'); assert.ok(x.title.length > 20, 'the long text is the tooltip'); }
  assert.equal(dom.window.document.querySelectorAll('#modalCard a.plug').length, 0, 'the three tall cards are gone');
  assert.match(css(dom), /\.menu-plugs\.three\{grid-template-columns:repeat\(3,/);
  assert.deepEqual(errors, []);
});

test('start screen: the install card shows on the first visits or until closed, then it is one line; Settings keeps the card', () => {
  const { ev, dom, errors } = load();
  const d = dom.window.document;
  ev("window.innerWidth=390;localStorage.removeItem('sot-install-card');installCard=null;showTitle()");
  assert.ok(d.querySelector('#modalCard .icard'), 'first visit: the card');
  assert.equal(ev("localStorage.getItem('sot-install-card')"), '1');
  ev("showTitle();showTitle()"); assert.equal(ev("localStorage.getItem('sot-install-card')"), '1', 'counted once per visit, not per render');
  ev("installCard=null;showTitle();installCard=null;showTitle()"); assert.ok(d.querySelector('#modalCard .icard'), 'third visit: still the card');
  ev("installCard=null;showTitle()");
  assert.equal(d.querySelector('#modalCard .icard'), null, 'fourth visit: no card');
  assert.ok(d.querySelector('#modalCard .iline [data-act="install"]'), 'but a line that still installs');
  // Closing it is for good.
  ev("localStorage.removeItem('sot-install-card');installCard=null;showTitle()");
  d.querySelector('#modalCard .icard [data-act="installHide"]').click();
  assert.equal(d.querySelector('#modalCard .icard'), null); assert.ok(d.querySelector('#modalCard .iline'));
  assert.equal(ev("localStorage.getItem('sot-install-card')"), 'x');
  ev("installCard=null;showTitle()"); assert.equal(d.querySelector('#modalCard .icard'), null, 'still closed on the next visit');
  assert.ok(d.querySelector('#nmIn'), 'the start screen is still the start screen');
  ev("ACT.settings()"); assert.ok(d.querySelector('#modalCard .icard'), 'Settings always has the card');
  assert.equal(d.querySelector('#modalCard .icard .ix'), null);
  // Storage that throws: the card simply stays.
  ev("ACT.settingsClose();installCard=null;Storage.prototype.getItem=()=>{throw new Error('no')};showTitle()");
  assert.ok(d.querySelector('#modalCard .icard'));
  assert.deepEqual(errors, []);
});

test('start screen: footer labels are never hyphenated by the browser, and narrow phones get two by two', () => {
  const { dom, errors } = load();
  const c = css(dom);
  assert.match(c, /\.btns\.tcta \.b\{[^}]*hyphens:manual/);
  assert.doesNotMatch(c, /\.btns\.tcta \.b\{[^}]*hyphens:auto/);
  assert.match(c, /@media \(max-width:400px\) and \(orientation:portrait\)\{\.btns\.tcta\{grid-template-columns:repeat\(2,/);
  assert.match(c, /@media \(min-width:761px\) and \(max-height:1000px\)\{[^@]*\.title-art h1 br\{display:none\}/);
  assert.deepEqual(errors, []);
});

test('a badge note in the NOC log opens the wall of badges itself, not just the Goals tab; old saves keep opening', () => {
  const { ev, dom, errors } = load();
  ev(start);
  ev("UI.fold={};UI.left='noc';S.ach={};BADGES[0].ok=()=>true;checkBadges()");
  const id = ev("(S.log.find(e=>e.o&&e.o.a==='badges')||{}).id");
  assert.ok(id, 'a badge was unlocked and logged with its own target');
  assert.equal(ev("!!document.querySelector('#leftBody .badges,#leftBody .bgrid,#leftBody .badge')&&leftFolded('badges')"), false);
  ev(`ACT.logOpen({id:${JSON.stringify(id)}})`);
  assert.equal(ev('UI.left'), 'goals'); assert.equal(ev("leftFolded('badges')"), true, 'the grid is open');
  assert.equal(ev("document.querySelector('#leftBody .bhead [data-act=\"leftFold\"]').textContent"), '▾ ' + ev("tr('common.hide')"));
  assert.equal(ev("document.querySelector('#leftBody .bhead [data-act=\"leftFold\"]').getAttribute('aria-expanded')"), 'true');
  // The target survives a save, and a goal note still opens just the tab.
  assert.equal(ev("JSON.stringify(migrate(JSON.parse(JSON.stringify(S))).log.find(e=>e.o&&e.o.a==='badges').o)"), '{"a":"badges"}');
  ev("UI.fold={};S.log.unshift({id:'old1',t:'x',k:'goal',at:Date.now(),d:S.day,o:{a:'tab',v:'goals'}});UI.left='noc';ACT.logOpen({id:'old1'})");
  assert.equal(ev('UI.left'), 'goals'); assert.equal(ev("leftFolded('badges')"), false);
  assert.deepEqual(errors, []);
});

test('tapping a badge toast opens Goals with the wall of badges unfolded, and the toast goes', () => {
  const { ev, dom, errors } = load();
  const d = dom.window.document;
  ev(start);
  ev("UI.fold={};UI.left='noc';S.ach={};BADGES[0].ok=()=>true;$('toasts').innerHTML='';checkBadges()");
  const t = d.querySelector('#toasts .toast.btoast');
  assert.ok(t, 'the badge toast is tappable');
  assert.equal(t.dataset.act, 'badgesOpen'); assert.equal(t.getAttribute('role'), 'button');
  assert.match(css(dom), /\.toast\.btoast\{pointer-events:auto;cursor:pointer\}/);
  ev("window.innerWidth=390;renderAll();selectCity(S.home)");
  t.querySelector('.tx').click();
  assert.equal(ev('UI.left'), 'goals'); assert.equal(ev('UI.leftOpen'), true); assert.equal(ev("leftFolded('badges')"), true);
  assert.equal(ev('UI.sel'), null, 'on a phone the city sheet makes way');
  assert.equal(d.querySelectorAll('#toasts .btoast').length, 0);
  assert.ok(d.querySelector('#leftBody .badges'), 'the grid is shown');
  assert.deepEqual(errors, []);
});
