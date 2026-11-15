// The Goals and NOC tabs stay short on a big network: finished goals and the badge grid fold away, and each long
// NOC list shows its worst five rows. Everything is one tap away.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');
const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = () => {
  const g = load();
  g.dom.window.__big = BIG;
  g.ev('S=migrate(JSON.parse(window.__big));UI.started=true;UI.speed=0;UI.sel=null;UI.leftOpen=true;compute()');
  return g;
};
const q = (g, s) => [...g.dom.window.document.querySelectorAll('#leftBody ' + s)];

test('Goals: finished goals fold into one line, the badge grid opens on request', () => {
  const g = big(), { ev } = g;
  ev("UI.left='goals';renderLeft()");
  const done = ev('goals().filter(x=>S.done[x.id]!==undefined).length'), todo = ev('goals().length') - done;
  assert.ok(done > 3, 'the fixture has finished many goals');
  assert.equal(q(g, '.goal').length, todo, 'only unfinished goals take a row');
  assert.match(q(g, '.gfold')[0].textContent, new RegExp(`${done} goals done`));
  assert.equal(q(g, '.bdg').length, 0, 'no badge grid until asked');
  assert.ok(q(g, '.bshelf').length && q(g, '.bhead').length, 'the badge counts still show');
  ev("ACT.leftFold({k:'done'})");
  assert.equal(q(g, '.goal.done').length, done, 'one tap lists them all');
  assert.match(q(g, '.gfold')[0].textContent, /Hide/);
  ev("ACT.leftFold({k:'badges'})");
  assert.equal(q(g, '.bdg').length, ev('BADGES.length'));
  ev("ACT.leftFold({k:'done'});ACT.leftFold({k:'badges'});ACT.leftFold({k:'nope'})");
  assert.equal(q(g, '.goal.done').length + q(g, '.bdg').length, 0, 'and folds again');
  assert.deepEqual(g.errors, []);
});

test('Goals: a new game still lists its first finished goals in place', () => {
  const g = load(), { ev } = g;
  ev("ACT.start({});UI.left='goals';UI.leftOpen=true;S.done[goals()[0].id]=1;renderLeft()");
  assert.equal(q(g, '.goal').length, ev('goals().length'));
  assert.equal(q(g, '.gfold').length, 0);
  assert.equal(q(g, '.goal')[0].className.includes('done'), true);
  assert.deepEqual(g.errors, []);
});

test('NOC: long lists show the worst five with a button for the rest, and the introduction is for newcomers', () => {
  const g = big(), { ev } = g;
  ev("UI.left='noc';renderLeft()");
  const hot = ev('S.links.filter(l=>!linkDown(l)&&capOf(l)>0&&(R.load[l.id]||0)/capOf(l)>=0.85).length'), ports = ev('hotPorts().length');
  assert.ok(hot > 5 && ports > 5, 'the fixture runs hot');
  const acts = a => q(g, `button[data-act="${a}"]`).length;
  assert.equal(acts('selLink'), 5, 'five congested links');
  assert.equal(q(g, '.hrow').length, 5, 'five hot ports');
  const more = q(g, 'button[data-act="leftFold"]').map(b => b.textContent);
  assert.ok(more.includes(`Show all ${hot}`) && more.includes(`Show all ${ports}`), more.join('|'));
  assert.equal(q(g, '.lead').length, 0, 'no introduction on a grown network');
  // The first rows are the fullest ones.
  assert.equal(q(g, '.hrow')[0].textContent.includes(ev('CITY[hotPorts()[0].city].name')), true);
  ev("ACT.leftFold({k:'hot'});ACT.leftFold({k:'ports'})");
  assert.equal(acts('selLink'), hot);
  assert.equal(q(g, '.hrow').length, ports);
  // Grouped by kind: one heading per kind, its advice said once there and not in the rows.
  const kinds = JSON.parse(ev('JSON.stringify([...new Set(hotPorts().map(x=>x.k))])')), tips = JSON.parse(ev('JSON.stringify(hotPorts().map(x=>x.tip))'));
  assert.equal(q(g, '.hgrp').length, kinds.length);
  for (const tip of new Set(tips)) assert.equal(q(g, '.hgrp').filter(e => e.textContent.includes(tip)).length, 1, tip);
  assert.ok(q(g, '.hrow').every(r => !tips.some(t => r.textContent.includes(t))), 'rows are one line, no advice');
  assert.ok(q(g, 'button[data-act="leftFold"]').some(b => b.textContent === 'Show fewer'));
  ev("ACT.leftFold({k:'hot'})");
  assert.equal(acts('selLink'), 5);
  assert.deepEqual(g.errors, []);
  const n = load();
  n.ev("ACT.start({});UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.match(q(n, '.lead')[0].textContent, /Network Operations Center/);
  assert.equal(q(n, 'button[data-act="leftFold"]').length, 0);
  assert.deepEqual(n.errors, []);
});

test('NOC: a list one or two rows longer than the cut shows whole, with no button', () => {
  const g = big(), { ev } = g;
  for (const n of [6, 7, 8]) {
    const h = ev(`(()=>{UI.fold={};const d=document.createElement('div');d.innerHTML=nocList('slow',Array.from({length:${n}},(_, i)=>i),i=>'<p class="x"></p>');return JSON.stringify([d.querySelectorAll('.x').length,d.querySelectorAll('[data-act="leftFold"]').length])})()`);
    assert.deepEqual(JSON.parse(h), n <= 7 ? [n, 0] : [5, 1], `${n} rows`);
  }
  assert.deepEqual(g.errors, []);
});

test('Goals: the level flavour text is clamped until tapped', () => {
  const g = big(), { ev } = g;
  ev("UI.left='goals';renderLeft()");
  const b = () => q(g, 'button.lvq')[0];
  assert.ok(b(), 'the level card has its quote as a button');
  assert.equal(b().getAttribute('aria-expanded'), 'false');
  assert.equal(b().classList.contains('open'), false);
  ev("ACT.leftFold({k:'lvq'})");
  assert.equal(b().getAttribute('aria-expanded'), 'true');
  assert.equal(b().classList.contains('open'), true);
  assert.deepEqual(g.errors, []);
});

test('Networks: search first, the peering policy one line whose choices unfold', () => {
  const g = big(), { ev } = g;
  ev("UI.left='nets';renderLeft()");
  const body = g.dom.window.document.getElementById('leftBody');
  const html = body.innerHTML;
  assert.ok(html.indexOf('id="nlQ"') < html.indexOf('ppolr'), 'the search box comes before the policy');
  assert.equal(q(g, '[data-act="peerPol"]').length, 0, 'choices folded');
  assert.match(q(g, '.ppolr')[0].textContent, /Peering policy/);
  ev("ACT.leftFold({k:'ppol'})");
  assert.equal(q(g, '[data-act="peerPol"]').length, 3);
  q(g, '[data-act="peerPol"]').find(b => !b.className.includes('ghost')) || assert.fail('the chosen policy is marked');
  ev("ACT.leftFold({k:'ppol'})");
  assert.equal(q(g, '[data-act="peerPol"]').length, 0);
  assert.deepEqual(g.errors, []);
});
