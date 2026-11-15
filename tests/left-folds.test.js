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
  assert.equal(q(g, '.hotk').length, 5, 'five hot ports');
  const more = q(g, 'button[data-act="leftFold"]').map(b => b.textContent);
  assert.ok(more.includes(`Show all ${hot}`) && more.includes(`Show all ${ports}`), more.join('|'));
  assert.equal(q(g, '.lead').length, 0, 'no introduction on a grown network');
  // The first rows are the fullest ones.
  assert.equal(q(g, '.hotk')[0].parentNode.textContent.includes(ev('CITY[hotPorts()[0].city].name')), true);
  ev("ACT.leftFold({k:'hot'});ACT.leftFold({k:'ports'})");
  assert.equal(acts('selLink'), hot);
  assert.equal(q(g, '.hotk').length, ports);
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
