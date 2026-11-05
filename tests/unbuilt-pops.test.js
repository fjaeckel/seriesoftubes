const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// The NOC dashboard's list of cities where the player has no POP yet.
function game(t) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});closeModal();UI.speed=0;S.nextFail=S.nextEvent=1e9;compute();ACT.dash();ACT.dashTab({k:'pops'})");
  return h;
}
const json = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));
const shown = (ev) => json(ev, "[...document.querySelectorAll('#popsSec [data-act=\"popGo\"]')].map(b=>JSON.parse(b.dataset.args).city)");
const open = (ev) => json(ev, 'CITIES.filter(C=>cityOn(C.id)&&!S.pops[C.id]).map(C=>C.id)');
const more = (ev) => { while (ev("!!document.querySelector('#popsSec [data-act=\"listMore\"]')")) ev("ACT.listMore({k:'pops'})"); };
const rowOf = (ev, c) => ev(`[...document.querySelectorAll('#popsSec .row')].find(r=>JSON.parse(r.querySelector('[data-act="popGo"]').dataset.args).city==='${c}').textContent`);

test('it lists exactly the cities you could still open, biggest first', (t) => {
  const { ev, errors } = game(t);
  more(ev);
  const c = shown(ev), want = open(ev);
  assert.deepEqual([...c].sort(), [...want].sort());
  assert.ok(!c.includes(ev('S.home')), 'not where you already are');
  const hidden = json(ev, 'CITIES.filter(C=>!cityOn(C.id)).map(C=>C.id)');
  assert.ok(hidden.every((x) => !c.includes(x)), 'a city not on the map is not listed');
  const sizes = json(ev, `${JSON.stringify(c)}.map(eyeP)`);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
  assert.match(ev("$('popsSec').textContent"), new RegExp(`Cities without a POP \\(${want.length}\\)`));
  assert.deepEqual(errors, []);
});

test('a row says what a player needs: eyeballs, exchange, and what the build would charge', (t) => {
  const { ev, errors } = game(t);
  more(ev);
  const c = shown(ev).find((x) => ev(`!!ixName('${x}')`));
  const text = rowOf(ev, c);
  for (const part of [`fmtG(eyeP('${c}'))`, `ixName('${c}')`, `fmt$(popCost('${c}'))`, `fmt$(popMo('${c}'))`, `CITY['${c}'].name`]) assert.ok(text.includes(ev(part)), part);
  ev(`S.cash=1e9;ACT.buildPop({city:'${c}'})`);
  assert.ok(ev(`!!S.pops['${c}']`));
  assert.ok(text.includes(ev(`fmt$(1e9-S.cash)`)), 'the listed price is what it costs');
  assert.deepEqual(errors, []);
});

test('the listed price includes your POP standard, like the build button', (t) => {
  const { ev, errors } = game(t);
  ev('popStdQuote=()=>({cost:1234567,mo:7654,rt:1,g:0});UI._dh=null;renderDash()');
  more(ev);
  const c = shown(ev)[0], text = rowOf(ev, c);
  assert.ok(text.includes(ev(`fmt$(popCost('${c}')+1234567)`)));
  assert.ok(text.includes(ev(`fmt$(popMo('${c}')+7654)`)));
  assert.deepEqual(errors, []);
});

test('building a POP takes the city off the list; none left says so', (t) => {
  const { ev, errors } = game(t);
  const c = shown(ev).find((x) => ev(`!CITY['${x}'].cn`)); // the biggest cities can be Chinese, and those need a license first
  ev(`S.cash=1e9;ACT.buildPop({city:'${c}'});$('dash').hidden=false;UI.dtab='pops';renderDash()`);
  assert.ok(!shown(ev).includes(c));
  ev('for(const C of CITIES)if(cityOn(C.id)&&!S.pops[C.id])S.pops[C.id]={day:0,routers:1};UI._dh=null;popsCheck=popsSection();');
  assert.match(ev('popsCheck'), /You have a POP in every city/);
  assert.doesNotMatch(ev('popsCheck'), /popGo/);
  assert.deepEqual(errors, []);
});

test('sorts flip, each starts the useful way round, and bad keys are ignored', (t) => {
  const { ev, errors } = game(t);
  const vals = (code) => { more(ev); return json(ev, `${JSON.stringify(shown(ev))}.map(c=>${code})`); };
  const asc = (a) => a.every((x, i) => !i || a[i - 1] <= x), desc = (a) => a.every((x, i) => !i || a[i - 1] >= x);
  ev("ACT.popsSort({k:'eye'})");
  assert.ok(asc(vals('eyeP(c)')), 'clicking the default sort flips it');
  ev("ACT.popsSort({k:'eye'})");
  assert.ok(desc(vals('eyeP(c)')));
  ev("ACT.popsSort({k:'cost'})");
  assert.ok(asc(vals('popCost(c)')), 'cheapest first');
  ev("ACT.popsSort({k:'cost'})");
  assert.ok(desc(vals('popCost(c)')));
  ev("ACT.popsSort({k:'name'})");
  const names = vals('CITY[c].name.toLowerCase()');
  assert.deepEqual(names, [...names].sort());
  ev("ACT.popsSort({k:'eye'})");
  assert.ok(desc(vals('eyeP(c)')), 'coming back to eyeballs starts biggest first');
  ev("ACT.popsSort({k:'nope'})");
  assert.equal(ev('UI.popSort'), 'eye');
  assert.deepEqual(errors, []);
});

test('the region filter narrows the list, ignores nonsense, and an emptied region says so', (t) => {
  const { ev, errors } = game(t);
  ev("ACT.popsReg({v:'OC'})");
  more(ev);
  const oc = shown(ev);
  assert.ok(oc.length > 0);
  assert.ok(ev(`${JSON.stringify(oc)}.every(c=>CITY[c].reg==='OC')`));
  assert.equal(oc.length, ev("CITIES.filter(C=>cityOn(C.id)&&!S.pops[C.id]&&C.reg==='OC').length"));
  ev("for(const C of CITIES)if(C.reg==='OC'&&cityOn(C.id))S.pops[C.id]={day:0,routers:1};UI._dh=null;renderDash()");
  assert.equal(shown(ev).length, 0);
  assert.match(ev("$('popsSec').textContent"), /Nothing left to build in this region/);
  assert.ok(ev("!!document.querySelector('#popsSec [data-chg=\"popsReg\"]')"), 'the filter is still there to change');
  ev("ACT.popsReg({v:'constructor'})");
  assert.equal(ev('UI.popF.reg'), '');
  assert.ok(shown(ev).length > 0);
  assert.deepEqual(errors, []);
});

test('the list pages like the other long lists, and a new sort or filter starts from the top', (t) => {
  const { ev, errors } = game(t);
  assert.equal(shown(ev).length, ev('LIST_PAGE'));
  ev("ACT.listMore({k:'pops'})");
  assert.ok(shown(ev).length > ev('LIST_PAGE'));
  ev("ACT.popsSort({k:'name'})");
  assert.equal(shown(ev).length, ev('LIST_PAGE'));
  ev("ACT.listMore({k:'pops'});ACT.popsReg({v:'EU'})");
  assert.equal(ev("listN('pops')"), ev('LIST_PAGE'));
  assert.deepEqual(errors, []);
});

test('Open closes the dashboard and selects the city, without building anything', (t) => {
  const { ev, errors } = game(t);
  const c = shown(ev)[0], cash = ev('S.cash');
  ev(`ACT.popGo({city:'${c}'})`);
  assert.equal(ev("$('dash').hidden"), true);
  assert.equal(ev('UI.sel.id'), c);
  assert.equal(ev('S.cash'), cash);
  assert.ok(ev(`!S.pops['${c}']`));
  for (const bad of ["'nope'", "'constructor'", '1']) { ev('UI.sel=null'); ev(`ACT.popGo({city:${bad}})`); assert.equal(ev('UI.sel'), null, bad); }
  assert.deepEqual(errors, []);
});

test('a Chinese city says it needs a license until you have one', (t) => {
  const { ev, errors } = game(t);
  more(ev);
  const c = ev('CITIES.find(C=>C.cn&&cityOn(C.id)&&!S.pops[C.id]).id');
  assert.match(rowOf(ev, c), /Needs a license first/);
  ev("S.cnLic={state:'ok'};UI._dh=null;renderDash()");
  assert.doesNotMatch(rowOf(ev, c), /Needs a license first/);
  assert.deepEqual(errors, []);
});
