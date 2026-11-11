// #343: on a crowded phone map, dragging from a POP to a city far away is fiddly. A POP's panel can open the city
// finder in link mode: type the other end, pick it, and get the same link window the drag would have opened.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const start = "ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;S.cash=1e9";
const home = ev => ev("Object.keys(S.pops)[0]");

test('#343 a POP panel has a Link to a city button that opens the finder in link mode', () => {
  const { ev, dom, errors } = load();
  ev(start);
  const a = home(ev);
  ev(`UI.sel={type:'city',id:${lit(a)}};UI.tab='links';renderPanel()`);
  const doc = dom.window.document;
  const b = [...doc.querySelectorAll('#panelBody [data-act="findLink"]')];
  assert.equal(b.length, 1, 'one button in the fiber section');
  assert.match(b[0].textContent, /Link to a city/);
  b[0].click();
  assert.equal(ev("$('modal').hidden"), false);
  assert.equal(ev("$('modal').className"), 'find');
  assert.match(doc.getElementById('modalCard').textContent, new RegExp(`New link from ${ev(`CITY[${lit(a)}].name`)}`));
  // Rows open the link window, not the map jump.
  ev("$('findIn').value='sydney';$('findIn').dispatchEvent(new Event('input',{bubbles:true}))");
  const row = doc.querySelector('#findList .findrow');
  assert.equal(row.dataset.act, 'linkTo');
  assert.deepEqual(JSON.parse(row.dataset.args), { a, b: 'syd' });
  assert.deepEqual(errors, []);
});

test('#343 picking a city opens the same link window as dragging there, and Enter picks the first match', () => {
  const { ev, dom, errors } = load();
  ev(start);
  const a = home(ev), doc = dom.window.document;
  const b = a === 'syd' ? 'tyo' : 'syd';
  ev(`ACT.findLink({city:${lit(a)}})`);
  ev(`$('findIn').value=CITY[${lit(b)}].name;$('findIn').dispatchEvent(new Event('input',{bubbles:true}))`);
  doc.querySelector('#findList .findrow').click();
  assert.deepEqual(JSON.parse(ev("JSON.stringify(UI.pending)")), { a, b });
  const viaPicker = doc.getElementById('modalCard').textContent;
  assert.match(viaPicker, new RegExp(`${ev(`CITY[${lit(a)}].name`)} → ${ev(`CITY[${lit(b)}].name`)}`));
  ev(`closeModal();openLinkModal(${lit(a)},${lit(b)})`);
  assert.equal(doc.getElementById('modalCard').textContent, viaPicker, 'exactly what the drag opens');
  // Typing without accents and pressing Enter.
  ev(`closeModal();ACT.findLink({city:${lit(a)}});$('findIn').value='SAO PAULO'`);
  doc.getElementById('findIn').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(JSON.parse(ev("JSON.stringify(UI.pending)")), { a, b: 'sao' });
  // The plain finder still jumps the map.
  ev("closeModal();ACT.findOpen()");
  assert.equal(ev("UI.findFrom"), null);
  ev("$('findIn').value='sydney';$('findIn').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(doc.querySelector('#findList .findrow').dataset.act, 'findGo');
  assert.deepEqual(errors, []);
});

test('#343 only cities a link could end in are offered: not the POP itself, not cities the map does not show', () => {
  const { ev, errors } = load();
  ev(start);
  const a = home(ev);
  assert.equal(ev(`findCities(${lit(ev(`CITY[${lit(a)}].name`))},${lit(a)}).includes(${lit(a)})`), false, 'not itself');
  assert.equal(ev("cityOn('aju')"), false, 'Aracaju is off the map');
  assert.equal(ev(`findCities('aracaju',${lit(a)}).includes('aju')`), false);
  assert.equal(ev("findCities('aracaju').includes('aju')"), true, 'the plain finder still finds it');
  // An empty box lists your other POPs.
  ev("ACT.buildPop({city:'syd'})");
  assert.deepEqual(ev(`findCities('',${lit(a)}).join()`).split(',').filter(Boolean), ev(`Object.keys(S.pops).filter(c=>c!==${lit(a)}).sort((x,y)=>CITY[x].name.localeCompare(CITY[y].name)).join()`).split(',').filter(Boolean));
  // Typed orders that make no sense do nothing.
  ev(`ACT.linkTo({a:${lit(a)},b:${lit(a)}})`);
  assert.equal(ev("$('modal').hidden"), true);
  ev("ACT.linkTo({a:'atlantis',b:'syd'})");
  assert.equal(ev("$('modal').hidden"), true);
  ev(`ACT.linkTo({a:${lit(a)},b:'aju'})`);
  assert.equal(ev("$('modal').hidden"), true, 'a city off the map takes no link');
  ev("ACT.findLink({city:'aju'})");
  assert.equal(ev("$('modal').hidden"), true, 'no finder from a city without a POP');
  assert.deepEqual(errors, []);
});

test('#343 the link finder works on a phone, in German', () => {
  const { ev, dom, errors } = load({ lang: 'de' });
  ev(start + ";window.innerWidth=360");
  const a = home(ev);
  ev(`UI.sel={type:'city',id:${lit(a)}};UI.tab='links';renderPanel()`);
  const doc = dom.window.document;
  assert.match(doc.getElementById('panelBody').textContent, /Link zu einer Stadt/);
  ev(`ACT.findLink({city:${lit(a)}})`);
  assert.match(doc.getElementById('modalCard').textContent, /Neuer Link ab/);
  assert.ok(ev("findCities('deutschland'," + lit(a) + ").includes('fra')") || a === 'fra');
  assert.deepEqual(errors, []);
});
