const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

// One vocabulary for "open more" across the game, and buttons a screen reader can name: checked over every main
// screen of the late-game network, on a phone and on a computer.
const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
function big(t, width) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.dom.window.__save = SAVE;
  h.ev(`window.innerWidth=${width};S=migrate(JSON.parse(window.__save));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();renderAll()`);
  return h;
}
const off = "closeModal();$('dash').hidden=true;$('bankBox').hidden=true;UI.sel=null;renderPanel();";
// Each screen, and what to open on it so its folds show both ways (one row unfolded).
const SCREENS = (phone) => [
  ...['goals', 'deals', 'noc', 'nets'].map((t) => [`left ${t}`, `${off}ACT.${phone ? 'phoneTab' : 'leftTab'}({t:'${t}'})`]),
  ['nets row open', `${off}ACT.${phone ? 'phoneTab' : 'leftTab'}({t:'nets'});document.querySelector('#leftBody [data-act=nlOpen]').click()`],
  ...['cust', 'up', 'peer', 'infra'].map((t) => [`city ${t}`, `${off}selectCity('fra');ACT.tab({t:'${t}'})`]),
  ['city peer unfolded', `${off}selectCity('fra');ACT.tab({t:'peer'});for(const b of [...document.querySelectorAll('#panel [data-act=panelFold]')].slice(0,6))b.click()`],
  ['link', `${off}ACT.selLink({id:S.links[0].id})`],
  ...['overview', 'cust', 'conn', 'traffic', 'links', 'routers', 'pops', 'lease'].map((k) => [`dash ${k}`, `${off}ACT.dash();ACT.dashTab({k:'${k}'});const r=document.querySelector('#dashCard [data-act=dashRow]');if(r)r.click()`]),
  ['bank', `${off}ACT.bank()`],
  ...['overview', 'routes', 'products'].map((t) => [`bazaar ${t}`, `${off}ACT.marketOpen({t:'${t}'});const r=document.querySelector('#modalCard [data-act=bazRow]');if(r)r.click()`]),
  ['settings', `${off}ACT.settings()`],
  ['help', `${off}ACT.help()`],
  ['keys', `${off}ACT.keys()`],
];
// Buttons that unfold something in place (not "+N more", which adds rows).
const FOLD = ['panelFold', 'pniGrp', 'dashRow', 'leftFold', 'nlOpen', 'bazRow', 'bazHelp', 'bazAsk', 'bankFold', 'dealsFold', 'fuFold', 'fpFold', 'fuNote', 'tailTog'];
// Everything a player can see right now: the open windows, the sheet, the left panel, the HUD.
const SCAN = `(()=>{const vis=e=>!e.closest('[hidden]');const out=[];
  for(const e of document.querySelectorAll('button,[data-act]')){if(!vis(e))continue;
    out.push({act:e.dataset.act||'',tag:e.tagName,t:e.textContent.replace(/\\s+/g,' ').trim(),exp:e.getAttribute('aria-expanded'),
      name:e.getAttribute('aria-label')||e.getAttribute('title')||'',role:e.getAttribute('role')||'',cls:typeof e.className==='string'?e.className:'',
      popup:e.hasAttribute('aria-haspopup'),inner:!!e.querySelector('button,[aria-expanded]')});}
  return JSON.stringify(out);})()`;

for (const [dev, width] of [['phone', 390], ['desktop', 1440]]) {
  test(`${dev}: every fold says whether it is open, the same way, with the glyph on the left`, (t) => {
    const { ev, errors } = big(t, width);
    const bad = [];
    for (const [name, js] of SCREENS(width < 760)) {
      ev(js);
      for (const b of JSON.parse(ev(SCAN))) {
        if (b.tag !== 'BUTTON') continue;
        if (FOLD.includes(b.act) && b.exp === null) bad.push(`${name}: ${b.act} "${b.t}" has no aria-expanded`);
        if (/▴/.test(b.t)) bad.push(`${name}: ${b.act} "${b.t}" uses ▴ (folds are ▸ and ▾)`);
        // A word button that folds starts with its glyph; a whole-row card (its chevron at the end) keeps it on the right.
        if (b.exp !== null && /[▸▾]/.test(b.t) && /\bb\b/.test(b.cls)) {
          if (!/^[▸▾]/.test(b.t)) bad.push(`${name}: ${b.act} "${b.t}": the glyph goes on the left`);
          if (b.t.startsWith('▾') !== (b.exp === 'true')) bad.push(`${name}: ${b.act} "${b.t}" glyph and aria-expanded=${b.exp} disagree`);
        }
        if (!b.exp && !b.popup && !b.inner && /^[▸▾]|[▸▾]$/.test(b.t)) bad.push(`${name}: ${b.act} "${b.t}" looks like a fold but has no aria-expanded`);
      }
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });

  test(`${dev}: every "?" and every icon-only button has a name`, (t) => {
    const { ev, errors } = big(t, width);
    const bad = [];
    for (const [name, js] of SCREENS(width < 760)) {
      ev(js);
      for (const b of JSON.parse(ev(SCAN))) {
        if (b.tag !== 'BUTTON') continue;
        if (b.t === '?' && !(b.name && b.exp !== null)) bad.push(`${name}: ${b.act} "?" needs aria-label, title and aria-expanded`);
        if (!/[\p{L}\p{N}]/u.test(b.t) && !b.name) bad.push(`${name}: ${b.act} "${b.t}" (${b.cls}) has no name`);
      }
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  });
}

test('a Change or Details button says what it changes', (t) => {
  const { ev, errors } = big(t, 390);
  ev(`${off}ACT.dash();ACT.dashTab({k:'conn'})`);
  const name = ev("document.querySelector('#dashCard [data-act=dashRow]').getAttribute('aria-label')");
  assert.match(name, /^Change: \S/);
  ev(`${off}ACT.dash();ACT.dashTab({k:'lease'})`);
  assert.match(ev("document.querySelector('#dashCard [data-act=dashRow]').getAttribute('aria-label')"), /^Details: .+ ⇄ /);
  ev(`${off}ACT.dash();ACT.dashTab({k:'traffic'})`);
  assert.match(ev("document.querySelector('#dashCard .tib.rtog').getAttribute('aria-label')"), /^Details: \S/);
  assert.deepEqual(errors, []);
});

test('tabs are tabs: one selected, and it is the one shown', (t) => {
  const { ev, errors } = big(t, 1440);
  const check = (sel, n) => {
    assert.equal(ev(`document.querySelector('${sel}').getAttribute('role')`), 'tablist', sel);
    const tabs = JSON.parse(ev(`JSON.stringify([...document.querySelectorAll('${sel} [role=tab]')].map(b=>[b.getAttribute('aria-selected'),b.classList.contains('on')]))`));
    assert.ok(tabs.length >= n, `${sel}: ${tabs.length} tabs`);
    assert.equal(tabs.filter(([s]) => s === 'true').length, 1, sel);
    for (const [s, on] of tabs) assert.equal(s === 'true', on, sel);
  };
  ev("ACT.leftTab({t:'noc'})"); check('#leftTabs', 4);
  ev(`${off}selectCity('fra');ACT.tab({t:'peer'})`); check('#panel .tabs', 3);
  ev(`${off}ACT.dash();ACT.dashTab({k:'traffic'})`); check('#dashCard .dhead .dtabs', 8);
  ev(`${off}ACT.marketOpen({t:'routes'})`); check('#modalCard .dtabs', 3);
  assert.deepEqual(errors, []);
});

test('filter and sort chips say which one is picked; the phone tab bar says which sheet is up', (t) => {
  const { ev, errors } = big(t, 390);
  ev(`${off}ACT.dash();ACT.dashTab({k:'conn'})`);
  for (const act of ['connF', 'connSort']) {
    const p = JSON.parse(ev(`JSON.stringify([...document.querySelectorAll('#dashCard [data-act=${act}]')].map(b=>b.getAttribute('aria-pressed')))`));
    assert.ok(p.length > 1, act);
    assert.equal(p.filter((x) => x === 'true').length, 1, act);
    assert.equal(p.filter((x) => x === 'false').length, p.length - 1, act);
  }
  ev(`${off}ACT.phoneTab({t:'deals'})`);
  assert.equal(ev("document.querySelector('#tabbar [aria-pressed=true]').dataset.args"), '{"t":"deals"}');
  assert.deepEqual(errors, []);
});

test('the same toast again is not read out again, and Z undoes a removal from the keyboard', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'ntt',tier:1});compute();$('toasts').textContent=''");
  ev("toastShow('Same thing','')");
  assert.equal(ev("document.querySelector('#toasts .toast').getAttribute('aria-live')"), null);
  ev("toastShow('Same thing','')");
  assert.equal(ev("document.querySelector('#toasts .toast').getAttribute('aria-live')"), 'off');
  // A transit port cancelled by mistake comes back with Z, while its Undo toast shows.
  const id = ev('S.transit[0].id');
  ev(`ACT.cancelTransit({id:'${id}'})`);
  assert.equal(ev('S.transit.length'), 1);
  assert.ok(ev('!!UI.undo'), 'an Undo is on offer');
  ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true}))");
  assert.equal(ev('S.transit.length'), 2);
  ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true}))");
  assert.equal(ev('S.transit.length'), 2, 'nothing to undo: Z does nothing');
  assert.deepEqual(errors, []);
});

test('the dashboard and the bank take keyboard focus when opened from a button, and give it back', (t) => {
  const { ev, errors } = big(t, 1440);
  for (const [open, card, close] of [['ACT.dash()', 'dashCard', 'ACT.dashClose()'], ['ACT.bank()', 'bankCard', 'ACT.bankClose()']]) {
    ev("document.querySelector('[data-act=menu]').focus()");
    ev(open);
    assert.equal(ev('document.activeElement.id'), card);
    ev(close);
    assert.equal(ev('document.activeElement.dataset.act'), 'menu');
  }
  assert.deepEqual(errors, []);
});

test('on a touch screen small buttons, tabs and "?" get an invisible finger-sized hit area', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', '60-phone.css'), 'utf8');
  const block = css.slice(css.indexOf('Tap targets on touch screens'));
  assert.match(block, /\.b::after[^{]*\{content:"";position:absolute;inset:-5px -2px\}/);
  assert.match(block, /\.hb::after,\.bz-q::after,\.thb::after\{content:"";position:absolute;inset:-8px\}/);
  assert.match(block, /:where\(\.b\.sm\)\{min-height:28px\}/);
});
