const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const choose = (ev, v) => ev(`(()=>{const s=document.getElementById('homeSel');s.value=${JSON.stringify(v)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
test('the title screen has one drawer for the home city: the five suggested first, then every city by continent', () => {
  const { ev, errors } = load();
  assert.equal(ev('S'), null, 'before any game exists');
  const opts = JSON.parse(ev("JSON.stringify([...document.querySelectorAll('#homeSel option')].map(o=>o.value))"));
  assert.deepEqual(opts.slice(0, 5), ['fra', 'nyc', 'sin', 'sao', 'syd'], 'the suggested homes come first');
  assert.equal(new Set(opts).size, opts.length, 'no city twice');
  assert.ok(opts.length > 150, `lots of cities (${opts.length})`);
  assert.ok(opts.every(c => ev(`homeOk('${c}')`)), 'only cities that work as a home');
  assert.ok(!opts.some(c => ev(`!!CITY['${c}'].cn||!!CITY['${c}'].off`)), 'no hidden or Chinese cities');
  assert.ok(!opts.includes('stg'), 'no city without transit to buy');
  assert.ok(ev("document.querySelectorAll('#homeSel optgroup').length") >= 6, 'suggested plus continents');
  assert.equal(ev("document.getElementById('homeSel').value"), 'fra');
  assert.equal(ev("document.querySelectorAll('.starts .start').length"), 0, 'no tiles any more');
  assert.deepEqual(errors, []);
});

test('picking any city starts the network there, and the line under the drawer follows the choice', () => {
  const { ev, errors } = load();
  choose(ev, 'lis');
  assert.equal(ev('UI.startCity'), 'lis');
  assert.equal(ev("document.getElementById('homeWhat').textContent"), 'Lisbon · ' + ev("REG[CITY.lis.reg]"), 'and names the city in full');
  choose(ev, 'nyc');
  assert.equal(ev("document.getElementById('homeWhat').textContent"), ev("tr('title.huge_eyeball_market_pricey')"), 'a suggested home says what it is like');
  choose(ev, 'akl');
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('S.home'), 'akl');
  assert.ok(ev("!!S.pops.akl"), 'the first POP is in Auckland');
  assert.ok(ev("NETS.some(n=>sellsAt(n,'akl'))"), 'with transit to buy');
  assert.deepEqual(errors, []);
});

test('a home that cannot work is refused, and the game falls back to Frankfurt', () => {
  const { ev, errors } = load();
  ev("ACT.pickStart({city:'stg'});ACT.pickStart({city:'pek'});ACT.pickStart({city:'nowhere'})");
  assert.equal(ev('UI.startCity'), 'fra');
  ev("UI.startCity='pek';ACT.start({})");
  assert.equal(ev('S.home'), 'fra');
  assert.deepEqual(errors, []);
});

test('the title screen works on a phone in every language: language first, the name on top, compact presets', () => {
  for (const lang of ['en', 'it', 'pt', 'fr', 'es', 'de']) {
    const { ev, errors } = load(lang === 'en' ? {} : { lang });
    ev('window.innerWidth=360;showTitle()');
    const order = ev("(()=>{const c=document.getElementById('modalCard');const at=s=>[...c.querySelectorAll('*')].indexOf(c.querySelector(s));return [at('#langTitle'),at('.title-art'),at('#nmIn'),at('.doors'),at('#homeSel')].join(',')})()").split(',').map(Number);
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `${lang}: language, title, name, doors, home (${order})`);
    assert.equal(ev("document.querySelectorAll('#modalCard .preset small,#modalCard .preset span').length"), 0, `${lang}: presets are just icon and name`);
    assert.ok(ev("document.getElementById('presetWhat').textContent.length") > 10, `${lang}: the chosen preset explained below`);
    if (lang !== 'en') assert.notEqual(ev("tr('title.suggested')"), 'Suggested', `${lang}: translated`);
    assert.deepEqual(errors, []);
  }
});
