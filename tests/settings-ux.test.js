// Settings in sections, one line per setting: what it is (a short note under it) on the left, its control on the right.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('Settings come in sections, language first, every setting one line with its control', () => {
  const { ev, errors } = load();
  ev("ACT.start({});window.innerWidth=360;window.innerHeight=640;ACT.settings({})");
  const secs = JSON.parse(ev("JSON.stringify([...document.querySelectorAll('#modal h3.sets')].map(h=>h.textContent.trim()))"));
  assert.deepEqual(secs, ['Display and sound', 'Customers and alerts', 'Data and saves', 'Advanced']);
  assert.equal(ev("document.querySelector('#modal .setline select#langSel')&&document.querySelector('#modal .setline').contains($('langSel'))"), true, 'language is the first line');
  const lines = JSON.parse(ev(`JSON.stringify([...document.querySelectorAll('#modal .setline')].map(l=>[l.firstElementChild.className,l.children.length]))`));
  assert.ok(lines.length >= 10);
  for (const [cls, n] of lines) { assert.equal(cls, 'setl', 'the label column comes first'); assert.equal(n, 2, 'and then one control'); }
  // Notes sit under their label, not as paragraphs between the lines.
  assert.equal(ev("document.querySelectorAll('#modal .setline+p.meta').length"), 0);
  assert.ok(ev("document.querySelectorAll('#modal .setl small').length") >= 7);
  // Each control still works from its line.
  ev("document.querySelector('#modal [data-act=\"prefSet\"][data-args*=\"quiet:1\"]').click()");
  assert.equal(ev('quietOn()'), true);
  assert.ok(ev("document.querySelector('#modal [data-act=\"prefSet\"][data-args*=\"quiet:1\"]').classList.contains('pink')"), 'the line shows what is on');
  assert.match(ev("$('modal').textContent"), /Diagnostic info/);
  assert.deepEqual(errors, []);
});

test('every control works from its line at 360 px, the line shows what is on, and notes stay short', (t) => {
  const { ev, errors, dom } = load();
  // Diagnostic info keeps a timer running: close the page after, or the test never ends.
  t.after(() => dom.window.close());
  ev("ACT.start({});window.innerWidth=360;window.innerHeight=640;ACT.settings({})");
  const on = (act, v) => ev(`(()=>{const b=document.querySelector('#modal [data-act="${act}"][data-args*=\\'"${v}"\\']');return !!b&&b.classList.contains('pink');})()`);
  const tap = (act, v) => ev(`document.querySelector('#modal [data-act="${act}"][data-args*=\\'"${v}"\\']').click()`);
  for (const [act, v, check] of [['soundSet', 'off', 'UI.muted===true'], ['themeSet', 'dark', "UI.theme==='dark'"], ['animSet', 'off', "UI.anim==='off'"],
    ['mapSet', '2d', '!GLX.want'], ['vpSet', 'on', 'DIAG.on'], ['prefSet', 'pauseIncident:1', "pref('pauseIncident')"]]) {
    tap(act, v);
    assert.equal(ev(check), true, `${act} ${v}`);
    assert.equal(ev('UI.setOpen&&!$("modal").hidden'), true, 'Settings stay open');
    assert.ok(on(act, v), `${act}: the line shows ${v} as on`);
  }
  // Each note is a short line or two, not a paragraph.
  for (const n of JSON.parse(ev("JSON.stringify([...document.querySelectorAll('#modal .setl small')].map(s=>s.textContent))"))) assert.ok(n.length <= 130, n);
  // Sections that other parts add (Multimode, when it is on) sit inside and look like the rest.
  assert.equal(ev("document.querySelectorAll('#modal h3.sub4:not(.sets)').length"), ev("document.querySelectorAll('#modal .setsb h3.sub4:not(.sets)').length"));
  ev("document.querySelector('#modal [data-act=\"settingsClose\"].b').click()");
  assert.equal(ev('$("modal").hidden'), true, 'Done closes');
  assert.deepEqual(errors, []);
});
