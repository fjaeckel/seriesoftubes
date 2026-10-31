// Every router model has its own picture, shown where you pick and compare models.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('every router model has a picture, and each one is valid SVG', () => {
  const { ev, dom } = load();
  assert.equal(ev('RG_ART.length'), ev('RG.length'), 'one picture per model, in RG order');
  const n = ev('RG.length');
  for (let g = 0; g < n; g++) {
    const s = ev(`rgArt(${g})`);
    const doc = new dom.window.DOMParser().parseFromString(s.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), 'image/svg+xml');
    assert.equal(doc.getElementsByTagName('parsererror').length, 0, `model ${g} parses`);
    assert.ok(doc.querySelectorAll('path,rect,circle,ellipse').length > 8, `model ${g} draws something`);
  }
  assert.equal(new Set(Array.from({ length: n }, (_, g) => ev(`rgArt(${g})`))).size, n, 'no two models look the same');
  assert.equal(ev('rgArt(99)'), '');
});

test('only the POP overview shows a picture: its model, left of the city name', () => {
  const { ev, errors, dom } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;selectCity(S.home);UI.tab='links';UI.models=true;renderAll()");
  const pics = dom.window.document.querySelectorAll('#panel .rgpic');
  assert.equal(pics.length, 1, 'the model in use only, not the list of other models');
  assert.ok(dom.window.document.querySelector('#panel .ph > .rgpic.big svg.rgart'), 'in the header, beside the name');
  ev("UI.tab='cust';renderAll()");
  assert.equal(dom.window.document.querySelectorAll('#panel .rgpic').length, 1, 'on every tab');
  ev("selectCity(Object.keys(CITY).find(c=>!S.pops[c]&&!CITY[c].off));renderAll()");
  assert.equal(dom.window.document.querySelectorAll('#panel .rgpic').length, 0, 'no POP, no router');
  assert.deepEqual(errors, []);
});
