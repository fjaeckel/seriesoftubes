// The NOC dashboard's Links & routers tab: every link and every POP, in a scrolling box, sorted by load or by name.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
// mixed: the fixture only has leased waves, so a few become IRU dark fiber, fiber of your own and subsea fiber of your own.
const MIXED = (() => { const j = JSON.parse(BIG);
  j.links.forEach((l, i) => { if (i < 3) Object.assign(l, { kind: 'df', own: false });
    else if (i < 7) Object.assign(l, { kind: 'df', own: true, sys: 'lite', ch: [] });
    else if (i < 9) Object.assign(l, { kind: 'df', own: true, sub: true, sys: 'roadm', ch: [] }); });
  return JSON.stringify(j); })();
const big = (t, save = BIG) => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.ev(`S=migrate(JSON.parse(${lit(save)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();ACT.dash();ACT.dashTab({k:'infra'})`); return h; };
const json = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));
const links = (ev) => json(ev, "[...document.querySelectorAll('#linksSec .ihit')].map(b=>JSON.parse(b.dataset.args).id)");
const pops = (ev) => json(ev, "[...document.querySelectorAll('#routersSec .iscroll .row .nm')].map(n=>n.firstChild.textContent.trim())");
const more = (ev, k) => { while (ev(`!!document.querySelector('#${k}Sec [data-act="listMore"]')`)) ev(`ACT.listMore({k:'${k}'})`); };
const use = (ev, ids) => json(ev, `${lit(ids)}.map(id=>{const l=S.links.find(x=>x.id===id);const c=capOf(l);return c>0?(R.load[id]||0)/c:0;})`);
const desc = (a) => a.every((v, i) => !i || a[i - 1] >= v);
const asc = (a) => a.every((v, i) => !i || a[i - 1] <= v);

test('every link and every POP is listed, a page at a time, inside a scrolling box', (t) => {
  const { ev, errors } = big(t);
  const nl = ev('S.links.length'), np = ev('Object.keys(S.pops).length');
  assert.ok(nl > 100 && np > 100, 'the fixture is big enough to need a second page');
  assert.equal(links(ev).length, 50);
  assert.match(ev("$('linksSec').textContent"), /\+50 more links/);
  more(ev, 'links'); more(ev, 'routers');
  assert.equal(links(ev).length, nl);
  assert.equal(pops(ev).length, np);
  assert.ok(ev("!!document.querySelector('#linksSec .iscroll')&&!!document.querySelector('#routersSec .iscroll')"));
  assert.ok(ev("$('routersSec').textContent.includes('AS'+S.asn)"), 'the AS facts stay below the router list');
  assert.deepEqual(errors, []);
});

const linkNames = (ev) => json(ev, `${lit(links(ev))}.map(id=>{const l=S.links.find(x=>x.id===id);return (CITY[l.a].name+' '+CITY[l.b].name).toLowerCase();})`);

test('links sort busiest first, flip to quietest first, and sort by name', (t) => {
  const { ev, errors } = big(t);
  more(ev, 'links');
  assert.ok(desc(use(ev, links(ev))), 'busiest first by default');
  ev("ACT.infraSort({w:'links',k:'use'})");
  assert.equal(links(ev).length, 50, 'a new order starts again at the first page');
  more(ev, 'links');
  assert.ok(asc(use(ev, links(ev))), 'a second tap shows the quietest first');
  ev("ACT.infraSort({w:'links',k:'name'})"); more(ev, 'links');
  assert.ok(asc(linkNames(ev)), 'A to Z');
  assert.match(ev("document.querySelector('#linksSec .seg .pink[data-act=\"infraSort\"]').textContent"), /Name ▲/);
  ev("ACT.infraSort({w:'links',k:'name'})"); more(ev, 'links');
  assert.ok(desc(linkNames(ev)), 'Z to A');
  assert.match(ev("document.querySelector('#linksSec .seg .pink[data-act=\"infraSort\"]').textContent"), /Name ▼/);
  assert.deepEqual(errors, []);
});

test('routers sort on their own, and the links keep their order', (t) => {
  const { ev, errors } = big(t);
  ev("ACT.infraSort({w:'links',k:'name'})");
  ev("ACT.infraSort({w:'routers',k:'name'})"); more(ev, 'routers');
  const p = pops(ev);
  assert.deepEqual(p, [...p].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)));
  ev("ACT.infraSort({w:'routers',k:'use'})"); more(ev, 'routers');
  const u = json(ev, "[...document.querySelectorAll('#routersSec .iscroll .row b.num')].map(b=>parseFloat(b.textContent))");
  assert.ok(desc(u), 'busiest routers first');
  assert.match(ev("document.querySelector('#linksSec .seg .pink[data-act=\"infraSort\"]').textContent"), /Name ▲/);
  assert.deepEqual(errors, []);
});

test('tapping a link row opens the link panel; a router row opens its POP at the Infra tab', (t) => {
  const { ev, errors } = big(t);
  const id = links(ev)[0];
  ev(`document.querySelector('#linksSec .ihit[data-act="dashLink"] .nm').click()`);
  assert.ok(ev("$('dash').hidden"), 'the dashboard steps aside');
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'link', id });
  ev("ACT.dash();ACT.dashTab({k:'infra'})");
  const city = json(ev, "JSON.parse(document.querySelector('#routersSec .ihit').dataset.args).city");
  ev(`document.querySelector('#routersSec .ihit .nm').click()`);
  assert.ok(ev("$('dash').hidden"));
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'city', id: city });
  assert.equal(ev('UI.tab'), 'links');
  assert.ok(ev("!$('panel').hidden&&$('panel').textContent.length>0"), 'the side panel is open');
  ev("ACT.dash();ACT.dashPop({city:'nowhere'})");
  assert.ok(!ev("$('dash').hidden"), 'a city without a POP is ignored');
  assert.deepEqual(errors, []);
});

test('links filter by kind: leased waves, IRU dark fiber, own terrestrial fiber, own subsea fiber', (t) => {
  const { ev, errors } = big(t, MIXED);
  const kinds = json(ev, 'Object.fromEntries(LK.map(k=>[k,S.links.filter(l=>lkOf(l)===k).map(l=>l.id).sort()]))');
  assert.ok(kinds.wave.length > 100 && kinds.iru.length === 3 && kinds.own.length === 4 && kinds.sea.length === 2, JSON.stringify(Object.values(kinds).map((x) => x.length)));
  const chips = json(ev, "[...document.querySelectorAll('#linksSec [data-act=\"infraF\"]')].map(b=>b.textContent)");
  assert.deepEqual(chips, [`All (${ev('S.links.length')})`, `Leased waves (${kinds.wave.length})`, 'IRU dark fiber (3)', 'Own terrestrial fiber (4)', 'Own subsea fiber (2)'], 'no chip for a kind you do not have');
  for (const k of ['iru', 'own', 'sea', 'wave']) {
    ev(`ACT.infraF({v:'${k}'})`); more(ev, 'links');
    assert.deepEqual([...links(ev)].sort(), kinds[k], k);
    assert.ok(desc(use(ev, links(ev))), `${k}: still sorted by load`);
  }
  ev("ACT.infraF({v:'own'})");
  assert.match(ev("$('linksSec').textContent"), /Own terrestrial fiber · /, 'each row says what kind of link it is');
  ev("ACT.infraSort({w:'links',k:'name'})");
  assert.ok(asc(linkNames(ev)) && links(ev).length === 4, 'the filter and the sort work together');
  ev("ACT.infraF({v:''})");
  assert.equal(links(ev).length, 50);
  ev("ACT.infraF({v:'vxc'})");
  assert.equal(links(ev).length, 50, 'a kind you do not have shows everything');
  assert.deepEqual(errors, []);
});

test('bad sort arguments change nothing', (t) => {
  const { ev, errors } = big(t);
  const before = ev('JSON.stringify(UI.infraSort||null)');
  const f = ev('JSON.stringify(UI.infraF??null)');
  ev("ACT.infraSort({w:'nope',k:'use'});ACT.infraSort({w:'links',k:'cost'});ACT.listMore({k:'bogus'});ACT.infraF({v:'dark'});ACT.infraF({v:null})");
  assert.equal(ev('JSON.stringify(UI.infraSort||null)'), before);
  assert.equal(ev('JSON.stringify(UI.infraF??null)'), f);
  assert.deepEqual(errors, []);
});

test('a phone gets the same lists and buttons', (t) => {
  const { ev, errors } = big(t);
  ev("window.innerWidth=390;ACT.infraSort({w:'links',k:'use'})");
  assert.ok(links(ev).length > 0);
  assert.ok(ev("document.querySelectorAll('#linksSec .seg [data-act=\"infraSort\"]').length===2"));
  assert.deepEqual(errors, []);
});
