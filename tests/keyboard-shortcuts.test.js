const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;S.cash=1e9";
const keyer = dom => (k, t, o) => (t || dom.window.document.body).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));

test('[ and ] step through your POPs in name order, wrap around, and move the map there', () => {
  const { ev, dom, errors } = load();
  const key = keyer(dom);
  ev(start + ";for(const c of ['par','lon','ams'])ACT.buildPop({city:c})");
  assert.equal(ev("popOrder().join()"), 'ams,fra,lon,par', 'Amsterdam, Frankfurt, London, Paris');
  const sel = () => ev('UI.sel&&UI.sel.type==="city"?UI.sel.id:null');
  assert.equal(sel(), 'fra', 'the game starts on the home POP');
  key(']'); assert.equal(sel(), 'lon');
  assert.equal(ev('cam.x'), ev('CITY.lon.x'), 'with the map on it');
  key(']'); assert.equal(sel(), 'par');
  key(']'); assert.equal(sel(), 'ams', '] wraps to the first');
  key('['); assert.equal(sel(), 'par', '[ wraps to the last');
  key('['); assert.equal(sel(), 'lon');
  // Nothing selected, or a city without a POP: ] starts at the first POP, [ at the last.
  ev('UI.sel=null'); key(']'); assert.equal(sel(), 'ams');
  ev('UI.sel=null'); key('['); assert.equal(sel(), 'par');
  ev("selectCity('tok')"); key(']'); assert.equal(sel(), 'ams');
  // The NOC dashboard steps aside so the POP can be seen.
  ev("ACT.dash()"); assert.equal(ev("$('dash').hidden"), false);
  key(']'); assert.equal(sel(), 'fra'); assert.equal(ev("$('dash').hidden"), true);
  // Not while typing, not with Ctrl or Cmd, not behind an open window.
  key(']', null, { ctrlKey: true }); key(']', null, { metaKey: true }); assert.equal(sel(), 'fra');
  key(']', null, { altKey: true }); assert.equal(sel(), 'lon', 'Option or AltGr types [ ] on many layouts');
  ev("ACT.rename()");
  key(']', dom.window.document.getElementById('rnIn'));
  key(']');
  assert.equal(sel(), 'lon');
  assert.equal(ev("$('modal').hidden"), false);
  assert.deepEqual(errors, []);
});

test('$ steps through the open offers, soonest to expire first, and marks each one in its city', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document, key = keyer(dom);
  ev(start + ";S.offers=[];for(let i=0;i<60&&S.offers.length<3;i++)spawnOffer()");
  assert.equal(ev('S.offers.length'), 3);
  // Two offers in Frankfurt (a POP) and one in Tokyo (no POP), expiring Tokyo first, then both in Frankfurt.
  ev("(([a,b,c])=>{Object.assign(a,{city:'fra',city2:null,exp:S.day+30,name:'Alpha'});Object.assign(b,{city:'tok',city2:null,exp:S.day+10,name:'Bravo'});Object.assign(c,{city:'fra',city2:null,exp:S.day+20,name:'Charlie'});})(S.offers);UI.tab='up'");
  const sel = () => ev('UI.sel&&UI.sel.id'), marked = () => [...doc.querySelectorAll('#panelBody .row.on .nm')].map(e => e.textContent);
  key('$'); assert.equal(sel(), 'tok'); assert.deepEqual(marked(), ['Bravo'], 'the soonest to expire first, marked in its city');
  assert.equal(ev('cam.x'), ev('CITY.tok.x'), 'with the map on it');
  key('$'); assert.equal(sel(), 'fra'); assert.equal(ev('UI.tab'), 'cust', 'a POP opens on Customers, where its offers are');
  assert.deepEqual(marked(), ['Charlie']);
  key('$'); assert.equal(sel(), 'fra'); assert.deepEqual(marked(), ['Alpha'], 'a second offer in the same city gets its own press');
  key('$'); assert.deepEqual(marked(), ['Bravo'], 'and round again');
  ev("selectCity('ams')"); assert.equal(ev('UI.offerAt'), null, 'selecting something else clears the mark');
  key('$'); assert.deepEqual(marked(), ['Bravo'], 'so $ starts from the top');
  ev('ACT.decline({id:UI.offerAt})'); key('$'); assert.deepEqual(marked(), ['Charlie'], 'a declined offer drops out');
  ev('S.offers=[]'); key('$');
  assert.match(doc.getElementById('toasts').textContent, /No open offers right now/, 'no offers: it says so');
  assert.deepEqual(errors, []);
});

test('- and = zoom the map out and in around its middle, within the zoom limits', () => {
  const { ev, dom, errors } = load();
  const key = keyer(dom);
  ev(start + ';cam.z=1');
  const x = ev('cam.x'), z = () => ev('cam.z');
  key('='); assert.ok(Math.abs(z() - 1.25) < 1e-9);
  key('+'); assert.ok(Math.abs(z() - 1.5625) < 1e-9, '+ zooms in too');
  key('-'); key('_'); assert.ok(Math.abs(z() - 1) < 1e-9, '- and _ zoom out');
  assert.ok(Math.abs(ev('cam.x') - x) < 1e-6, 'the middle of the map stays put');
  ev('cam.z=ZMAX'); key('='); assert.equal(z(), ev('ZMAX'));
  ev('cam.z=ZMIN'); key('-'); assert.equal(z(), ev('ZMIN'));
  ev("cam.z=1;ACT.rename()"); key('=', dom.window.document.getElementById('rnIn')); key('='); assert.equal(z(), 1, 'not while a window is open');
  assert.deepEqual(errors, []);
});

test('the arrow keys and W A S D move the map while held, at the same speed on screen at any zoom', (t) => {
  const { ev, dom, errors } = load();
  // A key left held (a failed assertion) would keep the page's frame loop, and this test file, running.
  t.after(() => dom.window.dispatchEvent(new dom.window.Event('blur')));
  const doc = dom.window.document, key = keyer(dom);
  const up = k => doc.body.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: k, bubbles: true }));
  const at = () => [ev('cam.x'), ev('cam.y')].map(v => Math.round(v * 100) / 100);
  // Frames are driven by hand: panAt=null makes the first one a start, the next one 50 ms later moves.
  const frames = (a, b) => ev(`panAt=null;panFrame(${a});panFrame(${b})`);
  ev(start + ';cam.z=1;cam.x=1000;cam.y=500');
  key('ArrowRight'); frames(1000, 1050); assert.deepEqual(at(), [1035, 500], '700 px a second: 35 px in 50 ms');
  up('ArrowRight'); frames(1000, 1050); assert.deepEqual(at(), [1035, 500], 'letting go stops it');
  key('w'); key('a'); frames(0, 50); assert.deepEqual(at(), [1000, 465], 'W and A together: up and left');
  up('w'); up('A');
  assert.equal(ev('panHeld.size'), 0, 'a key let go with Shift held still counts');
  ev('cam.z=2'); key('s'); frames(0, 50); assert.deepEqual(at(), [1000, 482.5], 'zoomed in, the same 35 px on screen');
  frames(0, 2000); assert.deepEqual(at(), [1000, 500], 'a slow frame moves at most 50 ms worth');
  up('s');
  key('ArrowDown'); key('ArrowDown', null, { repeat: true }); assert.equal(ev('panHeld.size'), 1, 'key repeat is the same key');
  dom.window.dispatchEvent(new dom.window.Event('blur')); assert.equal(ev('panHeld.size'), 0, 'leaving the window lets go');
  key('d'); ev('ACT.keys()'); frames(0, 50); assert.deepEqual(at(), [1000, 500], 'a window opening stops it');
  assert.equal(ev('panHeld.size'), 0);
  ev('closeModal();ACT.dash()'); key('ArrowLeft'); assert.equal(ev('panHeld.size'), 0, 'arrows scroll the NOC dashboard instead');
  ev("$('dash').hidden=true;ACT.rename()"); key('a', doc.getElementById('rnIn')); key('a'); assert.equal(ev('panHeld.size'), 0, 'not while typing or behind a window');
  ev('closeModal()'); key('ArrowLeft', null, { altKey: true }); key('ArrowLeft', null, { metaKey: true });
  assert.equal(ev('panHeld.size'), 0, 'Alt or Cmd with an arrow is the browser\'s');
  assert.deepEqual(errors, []);
});

test('n opens the NOC dashboard, and n followed by a letter opens one of its tabs', () => {
  const { ev, dom, errors } = load();
  const key = keyer(dom), open = () => !ev("$('dash').hidden"), tab = () => ev("UI.dtab||'overview'");
  ev(start);
  key('n'); assert.ok(open(), 'n opens it');
  assert.equal(tab(), 'overview');
  key('c'); assert.equal(tab(), 'conn', 'n c: Connections');
  key('n'); assert.ok(open(), 'n does not close it, so n c can switch tabs without a flash');
  key('u'); assert.equal(tab(), 'cust');
  for (const [l, t] of [['o', 'overview'], ['t', 'traffic'], ['r', 'infra'], ['l', 'lease'], ['c', 'conn']]) { key('n'); key(l); assert.equal(tab(), t, 'n ' + l); }
  key('o'); assert.equal(tab(), 'conn', 'a letter on its own does nothing');
  key('n'); key('Shift'); key('T'); assert.equal(tab(), 'traffic', 'Shift on the way does not cancel it');
  key('n'); ev('keyLead=Date.now()-KEY_LEAD-1'); key('c'); assert.equal(tab(), 'traffic', 'too late: the letter stands alone');
  key('n'); key('x'); key('c'); assert.equal(tab(), 'traffic', 'another key in between ends the wait');
  key('Escape'); assert.ok(!open(), 'Escape closes it');
  key('n'); key('c', null, { ctrlKey: true }); assert.equal(tab(), 'traffic', 'not with Ctrl');
  ev("$('dash').hidden=true;ACT.rename()"); key('n', dom.window.document.getElementById('rnIn')); key('n');
  assert.ok(!open(), 'not while typing or behind a window');
  assert.deepEqual(errors, []);
});

test('? shows every keyboard shortcut and closes again; Help links to it on a computer, not on a phone', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document, key = keyer(dom);
  ev(start);
  key('?');
  assert.equal(ev("$('modal').className"), 'keys', '? opens the list');
  const txt = doc.getElementById('modalCard').textContent;
  for (const s of ['Keyboard shortcuts', 'Move around the map', 'Space', 'Pause or play', 'Find a city', 'Previous or next of your POPs', 'Next open offer, soonest to expire first', 'Zoom the map out or in', 'NOC dashboard', 'Connections', 'Leased lines', 'Esc', 'Show this list'])
    assert.ok(txt.includes(s), s);
  for (const k of ['←', '↑', '↓', '→', 'w', 'a', 's', 'd', '[', ']', '$', '-', '=', '/', '?', '0', '4', 'n', 'o', 'u', 'c', 't', 'r', 'l']) assert.ok([...doc.querySelectorAll('#modalCard .kbd')].some(e => e.textContent === k), k);
  key('?', null, { repeat: true }); assert.equal(ev("$('modal').hidden"), false, 'holding ? does not flicker it');
  key('?'); assert.equal(ev("$('modal').hidden"), true, '? again closes it');
  key('?'); key('Escape'); assert.equal(ev("$('modal').hidden"), true, 'so does Escape');
  // Another window stays as it is, and ? in a text field is just a question mark.
  ev("ACT.findOpen()"); key('?'); assert.equal(ev("$('modal').className"), 'find');
  key('?', doc.getElementById('findIn')); assert.equal(ev("$('modal').className"), 'find');
  ev('closeModal();ACT.help()');
  const link = doc.querySelector('#modalCard [data-act="keys"]');
  assert.ok(link, 'Help has a Keyboard shortcuts button');
  link.click(); assert.equal(ev("$('modal').className"), 'keys');
  ev("closeModal();window.innerWidth=360;ACT.help()");
  assert.equal(doc.querySelector('#modalCard [data-act="keys"]'), null, 'not on a phone, which has no keys');
  assert.deepEqual(errors, []);
});

test('the shortcut list in German', () => {
  const { ev, dom, errors } = load({ lang: 'de' });
  ev(start + ';if(ACT.pitchSkip)ACT.pitchSkip()');
  keyer(dom)('?');
  const txt = dom.window.document.getElementById('modalCard').textContent;
  assert.match(txt, /Tastenkürzel/);
  assert.match(txt, /Leertaste/);
  assert.deepEqual(errors, []);
});

test('on the title screen, Help opens the shortcut list and both ways out lead back to the title', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document, key = keyer(dom), title = () => !ev("$('modal').hidden") && ev("$('modal').className") !== 'keys';
  assert.ok(ev('!S'), 'no game yet');
  ev('ACT.help()');
  doc.querySelector('#modalCard [data-act="keys"]').click();
  assert.equal(ev("$('modal').className"), 'keys', 'the button works before a game starts');
  key('?'); assert.ok(title(), '? goes back to the title, not to an empty map');
  ev('ACT.help()'); doc.querySelector('#modalCard [data-act="keys"]').click();
  doc.querySelector('#modalCard .btns [data-act="helpClose"]').click(); assert.ok(title(), 'and so does its button');
  assert.deepEqual(errors, []);
});
