// A phone held sideways: the tab bar is a rail down the left edge, the sheets stand on the right from under the HUD to
// the bottom, and their handle hangs off the sheet's map side and works sideways. Portrait phones and desktops keep
// their layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const LAND = '(orientation:landscape) and (max-height:500px) and (pointer:coarse),(orientation:landscape) and (max-width:760px) and (max-height:500px)';
const size = (ev, w, h, coarse = true) => ev(`innerWidth=${w};innerHeight=${h};window.matchMedia=q=>({matches:${coarse}&&/coarse/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});dispatchEvent(new Event('resize'))`);
const css = (dom) => [...dom.window.document.querySelectorAll('style')].map((s) => s.textContent).join('\n');

// The text of every top-level @media block with this exact query, and whether any @media sits inside another.
function mediaBlocks(text, query) {
  const out = [];
  let nested = false;
  for (let i = text.indexOf('@media'); i >= 0; i = text.indexOf('@media', i + 1)) {
    let depth = 0;
    for (let k = 0; k < i; k++) { if (text[k] === '{') depth++; else if (text[k] === '}') depth--; }
    if (depth > 0) { nested = true; continue; }
    const open = text.indexOf('{', i);
    if (text.slice(i + 6, open).trim() !== query) continue;
    let d = 0, k = open;
    for (; k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}' && --d === 0) break; }
    out.push(text.slice(open + 1, k));
  }
  return { out, nested };
}

test('landscape CSS: a rail, full-height side sheets, a hanging handle, and no @media inside another', () => {
  const { dom, errors } = load();
  const { out, nested } = mediaBlocks(css(dom), LAND);
  assert.equal(nested, false, 'no nested @media');
  const all = out.join('\n');
  assert.match(all, /#tabbar\{[^}]*flex-direction:column/, 'the tab bar is a vertical rail');
  assert.match(all, /--tabbar:env\(safe-area-inset-bottom,0px\)/, 'the rail costs no height at the bottom');
  assert.match(all, /body\.tb-on\{--railx:var\(--rail\)\}/, 'room for the rail only while it shows');
  assert.match(all, /#left,#panel\{[^}]*width:var\(--sheetw\) !important[^}]*top:calc\(env\(safe-area-inset-top,0px\) \+ var\(--hudh\)\) !important;bottom:0 !important/, 'sheets from under the HUD to the bottom');
  assert.match(all, /#left>\.grab,#panel>\.grab\{position:absolute;left:-29px/, 'the handle hangs off the map side');
  assert.match(all, /body\.tb-on #hud\{left:calc\(var\(--rail\)/, 'the HUD starts after the rail');
  assert.match(all, /#toasts\{[^}]*left:calc\(var\(--railx\) \+ 8px\)/, 'toasts stay clear of the rail');
  assert.deepEqual(errors, []);
});

test('which screens get side sheets', () => {
  const { ev, errors } = load();
  const at = (w, h, c) => { size(ev, w, h, c); return JSON.parse(ev('JSON.stringify([isPhone(),sideSheets()])')); };
  assert.deepEqual(at(844, 390, true), [true, true], 'a big phone on its side');
  assert.deepEqual(at(667, 375, true), [true, true], 'a small phone on its side');
  assert.deepEqual(at(740, 360, false), [true, true], 'a narrow short window');
  assert.deepEqual(at(390, 844, true), [true, false], 'a phone upright keeps bottom sheets');
  assert.deepEqual(at(1440, 900, false), [false, false], 'a desktop');
  assert.deepEqual(at(1024, 768, true), [false, false], 'a tablet');
  assert.deepEqual(errors, []);
});

test('the rail class follows the tab bar: on in a phone game, off on desktops and in puzzles', () => {
  const { ev, errors } = load();
  ev('ACT.start({});S.cash=1e8;UI.started=true');
  size(ev, 844, 390);
  ev('renderAll()');
  assert.equal(ev("document.body.classList.contains('tb-on')&&!$('tabbar').hidden"), true);
  size(ev, 1440, 900, false);
  ev('renderAll()');
  assert.equal(ev("document.body.classList.contains('tb-on')||!$('tabbar').hidden"), false);
  size(ev, 844, 390);
  ev("pzBegin(pzDef('baltic'));renderAll()");
  assert.equal(ev("document.body.classList.contains('tb-on')"), false, 'puzzles have no tab bar');
  assert.deepEqual(errors, []);
});

test('a phone on its side wider than 760 px can close its sheet from the tab bar (it is not a tablet)', () => {
  const { ev, errors } = load();
  ev('ACT.start({});S.cash=1e8;UI.started=true');
  size(ev, 844, 390);
  ev("ACT.phoneTab({t:'goals'})");
  assert.equal(ev("$('left').classList.contains('closed')"), false, 'open');
  ev("ACT.phoneTab({t:'goals'})");
  assert.equal(ev("UI.leftOpen||!$('left').classList.contains('closed')"), false, 'closed');
  // A real tablet still keeps its left panel when nothing is selected.
  size(ev, 1000, 700, false);
  ev('UI.leftOpen=false;UI.sel=null;renderLeft()');
  assert.equal(ev("$('left').classList.contains('closed')"), false, 'tablets keep the panel');
  assert.deepEqual(errors, []);
});

test('the side handle: tap puts the sheet away, drag left widens, drag right narrows then closes', () => {
  const { ev, dom, errors } = load();
  ev('ACT.start({});S.cash=1e8;UI.started=true');
  size(ev, 844, 390);
  const w = dom.window;
  const drag = (sel, dx, dy = 0) => {
    const g = w.document.querySelector(sel);
    const o = { bubbles: true, pointerId: 7, clientX: 400, clientY: 200 };
    g.dispatchEvent(new w.PointerEvent('pointerdown', o));
    w.document.dispatchEvent(new w.PointerEvent('pointermove', { ...o, clientX: 400 + dx, clientY: 200 + dy }));
    w.document.dispatchEvent(new w.PointerEvent('pointerup', { ...o, clientX: 400 + dx, clientY: 200 + dy }));
  };
  ev("ACT.phoneTab({t:'nets'})");
  drag('#left>.grab', -80);
  assert.equal(ev("$('left').classList.contains('full')&&UI.leftOpen"), true, 'drag left widens');
  drag('#left>.grab', 80);
  assert.equal(ev("!$('left').classList.contains('full')&&UI.leftOpen"), true, 'drag right narrows first');
  drag('#left>.grab', 80);
  assert.equal(ev('UI.leftOpen'), false, 'then closes');
  ev("ACT.phoneTab({t:'goals'})");
  drag('#left>.grab', 0);
  assert.equal(ev("UI.leftOpen||!$('left').classList.contains('closed')"), false, 'a tap puts it away');
  ev("selectCity('fra')");
  assert.ok(ev('!!UI.sel'));
  drag('#panel>.grab', 2);
  assert.equal(ev('UI.sel'), null, 'the city sheet goes the same way');
  // Upright, the same handle still works up and down: a tap toggles the tall sheet, it does not close.
  size(ev, 390, 844);
  ev("selectCity('fra')");
  drag('#panel>.grab', 0, 0);
  assert.equal(ev("!!UI.sel&&$('panel').classList.contains('full')"), true, 'portrait tap: taller, still open');
  drag('#panel>.grab', 0, 60);
  assert.equal(ev("!!UI.sel&&!$('panel').classList.contains('full')"), true, 'portrait: drag down shrinks first');
  assert.deepEqual(errors, []);
});
