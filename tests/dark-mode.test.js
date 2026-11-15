// Dark mode (#80): never the default; a Settings choice per device (Light, Dark, or Auto following the device), applied
// to the panels (.dark on <html>, 98-dark.css and the generated 99-dark-auto.css) and the map's sea, land and clouds.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load: load0 } = require('./harness');
const { generate, OUT } = require('../scripts/dark-css');

const load = (t, o) => { const h = load0(o); t.after(() => h.dom.window.close()); return h; };
const dark = ev => ev("document.documentElement.classList.contains('dark')");

test('the generated dark stylesheet is up to date with the others (node scripts/dark-css.js)', () => {
  assert.ok(fs.readFileSync(OUT, 'utf8') === generate(), 'src/styles/99-dark-auto.css is out of date: run node scripts/dark-css.js');
});

test('light by default: no dark class, the light map, and Settings offers the choice', t => {
  const { ev, dom, errors } = load(t);
  assert.equal(dark(ev), false);
  assert.equal(ev('UI.theme'), 'light');
  assert.equal(ev('MAPC.k'), 'l');
  ev('ACT.settings({})');
  const row = [...dom.window.document.querySelectorAll('#modal [data-act="themeSet"]')].map(b => JSON.parse(b.dataset.args).v);
  assert.deepEqual(row, ['light', 'dark', 'auto']);
  assert.deepEqual(errors, []);
});

test('picking Dark switches the panels and the map at once, and is kept on this device', t => {
  const { ev, errors } = load(t);
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();WL.key='x';ACT.themeSet({v:'dark'})");
  assert.equal(dark(ev), true);
  assert.equal(ev("localStorage.getItem('sot-theme')"), 'dark');
  assert.equal(ev('MAPC.k'), 'd');
  assert.equal(ev('WL.key'), null, 'the land painted again in the dark colours');
  assert.equal(ev("glPal().k"), 'd', 'the card paints with the same palette');
  assert.equal(ev("document.querySelector('meta[name=\"theme-color\"]').getAttribute('content')"), ev('MAP_PAL.dark.bar'));
  ev("ACT.themeSet({v:'neon'})");
  assert.equal(ev('UI.theme'), 'dark', 'only the three choices');
  ev("ACT.themeSet({v:'light'})");
  assert.equal(dark(ev), false);
  assert.equal(ev('MAPC.k'), 'l');
  // A reload keeps the choice.
  const { ev: ev2 } = load(t, { storage: { 'sot-theme': 'dark' } });
  assert.equal(dark(ev2), true);
  assert.deepEqual(errors, []);
});

test('Auto follows the device, now and when it switches', t => {
  const { ev, errors } = load(t);
  ev("window.__dm=[];window.matchMedia=q=>({matches:/dark/.test(q)&&!!window.__darkOS,addEventListener:(k,f)=>__dm.push(f)});window.__darkOS=true;themeBoot();ACT.themeSet({v:'auto'})");
  assert.equal(dark(ev), true);
  ev("window.__darkOS=false;for(const f of __dm)f()");
  assert.equal(dark(ev), false, 'the device went light');
  ev("ACT.themeSet({v:'light'});window.__darkOS=true;for(const f of __dm)f()");
  assert.equal(dark(ev), false, 'Light stays light whatever the device says');
  assert.deepEqual(errors, []);
});

// iPhone report: in dark mode the cash amount in the HUD was dark on the dark chip. The HUD chips set their own text
// colour (--ink, which dark mode switches) instead of inheriting it, so a browser that hands a button another colour,
// or keeps an old inherited one when the theme changes, cannot leave the money unreadable.
test('HUD chips set their own text colour in both themes, the cash button too', t => {
  const { ev, errors } = load(t);
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();renderAll()");
  const ink = () => ev("getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()");
  const rgb = h => ev(`(()=>{const d=document.createElement('div');d.style.color=${JSON.stringify(h)};document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c;})()`);
  for (const theme of ['light', 'dark']) {
    ev(`ACT.themeSet({v:'${theme}'})`);
    ev("document.getElementById('hud').style.color='rgb(1, 2, 3)'");
    const want = rgb(ink());
    for (const id of ['hCash']) assert.equal(ev(`getComputedStyle(document.getElementById('${id}')).color`), want, `${theme}: the cash amount is --ink`);
    assert.equal(ev("getComputedStyle(document.querySelector('#hud .cashbtn')).color"), want, `${theme}: the cash button is --ink, not what it inherits`);
    ev("document.getElementById('hud').style.color=''");
  }
  assert.deepEqual(errors, []);
});
