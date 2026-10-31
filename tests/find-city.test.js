const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.nextFail=1e9;S.nextEvent=1e9";

test('find a city by its name, without accents, by country or by its exchange (#218)', () => {
  const { ev, errors } = load();
  ev(start);
  const find = q => ev(`findCities(${JSON.stringify(q)}).join()`).split(',');
  assert.equal(find('amster')[0], 'ams', 'the start of a name');
  assert.equal(find('AMSTERDAM')[0], 'ams', 'any case');
  assert.equal(find('sao paulo')[0], 'sao', 'accents are optional');
  assert.equal(find('paulo')[0], 'sao', 'a word inside the name');
  assert.ok(find('germany').includes('fra'), 'the country in English');
  assert.ok(find('germany').includes('muc'));
  assert.ok(find('Brezn')[0] === 'muc', 'the exchange');
  assert.ok(find('germany').length <= ev('FIND_N'), 'a short list');
  assert.equal(ev("findCities('zzqqxx').length"), 0);
  // Names first, then countries: "san" finds San José before cities in some country with "san" in it.
  assert.equal(ev("findCities('san').every((c,i,a)=>i===0||fold(CITY[a[i-1]].name).includes('san')||!fold(CITY[c].name).includes('san'))"), true);
  // An empty box lists your own POPs.
  assert.equal(ev("findCities('').join()"), ev("Object.keys(S.pops).join()"));
  assert.deepEqual(errors, []);
});

test('the search box opens with / or the HUD button, Enter jumps to the first city, Escape closes', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev(start);
  const key = (k, t) => (t || doc.body).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  key('/');
  assert.equal(ev("$('modal').hidden"), false, '/ opens it');
  assert.ok(doc.getElementById('findIn'), 'with a search field');
  const inp = doc.getElementById('findIn');
  inp.value = 'tokyo';
  inp.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.getElementById('findList').textContent, /Tokyo/);
  key('Enter', inp);
  assert.equal(ev("$('modal').hidden"), true, 'Enter jumps');
  assert.equal(ev('UI.sel&&UI.sel.id||UI.sel'), 'tok', 'and selects Tokyo');
  assert.equal(ev('cam.x'), ev('CITY.tok.x'), 'with the map on it');
  // The HUD button, then a tap on a result.
  doc.querySelector('#hud .chip.find').click();
  assert.equal(ev("$('modal').hidden"), false);
  const i2 = doc.getElementById('findIn');
  i2.value = 'nowhere at all';
  i2.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.getElementById('findList').textContent, /No city matches/);
  key('Escape', i2);
  assert.equal(ev("$('modal').hidden"), true, 'Escape closes');
  ev("ACT.findOpen();ACT.findGo({city:'syd'})");
  assert.equal(ev('cam.x'), ev('CITY.syd.x'));
  ev("ACT.findGo({city:'atlantis'})");
  assert.equal(ev('cam.x'), ev('CITY.syd.x'), 'unknown ids are ignored');
  // Typing / in another text field types a slash.
  ev("ACT.rename()");
  key('/', doc.getElementById('rnIn'));
  assert.equal(ev("!!$('findIn')"), false);
  assert.deepEqual(errors, []);
});

test('in German, a German country name finds the city, and the search works on a phone', () => {
  const { ev, dom, errors } = load({ lang: 'de' });
  ev(start + ";if(ACT.pitchSkip)ACT.pitchSkip();window.innerWidth=360;ACT.findOpen()");
  assert.ok(ev("findCities('deutschland').includes('fra')"), 'Deutschland');
  assert.ok(ev("findCities('germany').includes('fra')"), 'and Germany still works');
  assert.match(dom.window.document.getElementById('modalCard').textContent, /Stadt finden/);
  assert.doesNotMatch(dom.window.document.getElementById('modalCard').textContent, /\/ /, 'no keyboard tip on a phone');
  assert.deepEqual(errors, []);
});
