// The puzzle sheet on phones: a status bar that stays put, the one thing to fix next, delivered flows as chips, and a
// map that leaves out what the puzzle does not need (far cities gone, idle stepping stones as nameless dots).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

// Tour de Africa (2026-W45): content in Abidjan, eyeballs in Kinshasa, Accra and Dakar, Lagos as a stepping stone.
const W45 = fs.readFileSync(path.join(__dirname, '..', 'site', 'puzzles', 'weekly', '2026-W45.json'), 'utf8');
const begin = (ev) => ev(`pzBegin(pzWkValid(${W45},'2026-W45'));ACT.pzPop({city:'abj'})`);
const L = (ev, a, b) => ev(`ACT.pzLinkTo({a:'${a}',b:'${b}'});ACT.pzLink({tier:1});closeModal()`);
const tree = (ev) => { L(ev, 'abj', 'acc'); L(ev, 'acc', 'lag'); L(ev, 'lag', 'fih'); L(ev, 'abj', 'dkr'); ev('if(UI.pzMk)ACT.pzMkSkip();pzRender()'); };
const box = (dom) => dom.window.document.getElementById('pzBox');

test('the sheet is three goals in plain words, one per star, and the one to work on says what to do and shows where', () => {
  const { ev, dom, errors } = load();
  begin(ev);
  const top = () => box(dom).querySelector('.pztop');
  assert.ok(top().querySelector('[data-act="pzUndo"]') && top().querySelector('[data-act="puzzleMenu"]'), 'undo and the menu stay in the bar');
  const goals = () => [...top().querySelectorAll('.pzgoal')];
  const cur = () => top().querySelector('.pzgoal.cur');
  assert.equal(goals().length, 3);
  assert.match(goals()[1].textContent, /Stay under budget.*of \$1\.75M/, 'the budget goal carries spent of budget');
  assert.match(cur().textContent, /Get all the traffic there.*Nothing reaches (Kinshasa|Accra|Dakar) yet/, 'first: what does not arrive');
  assert.ok(JSON.parse(cur().querySelector('.pzshow').dataset.args).c, 'Show me points at that city');
  assert.equal(ev('UI.pzMark.cities.length'), 1, 'and the map rings it');
  tree(ev);
  assert.equal(goals().filter((g) => g.classList.contains('done')).length, 2, 'delivered and within budget: two stars');
  assert.match(cur().textContent, /Survive any one cut.*If .+ is cut, [\d.]+ Gbps is lost on the way to .*Kinshasa/, 'then the worst cut and who it hurts');
  const look = JSON.parse(cur().querySelector('.pzshow').dataset.args);
  assert.ok(look.u, 'Show me points at the cut');
  assert.ok(ev('!!UI.pzMark.link&&UI.pzMark.cities.length>=1'), 'the map marks the link and rings the cities');
  ev('cam.x=0;cam.y=0');
  cur().querySelector('.pzshow').click();
  assert.ok(ev('Math.abs(cam.x)>100'), 'a tap brings it into view');
  ev('draw(0)');
  ev("S.pz.budget=1000;UI.pzEv=null;pzRender()");
  assert.match(cur().textContent, /Stay under budget.*You are .+ over/, 'the budget comes before the cut, in star order');
  assert.equal(ev('UI.pzMark'), null, 'nothing to mark for money');
  assert.deepEqual(errors, []);
});

test('delivered eyeballs are chips; Back to my network lives in the menu, not in the sheet', () => {
  const { ev, dom, errors } = load();
  begin(ev);
  assert.equal(box(dom).querySelectorAll('.pzchip').length, 0, 'nothing delivered yet: full rows');
  tree(ev);
  assert.equal(box(dom).querySelectorAll('.pzchip').length, 3, 'all three delivered: three chips');
  assert.equal(box(dom).querySelectorAll('.pzf').length, 0);
  assert.equal(box(dom).querySelectorAll('[data-act="pzLeave"]').length, 0, 'no Back button in the sheet');
  ev('ACT.puzzleMenu()');
  assert.ok(dom.window.document.querySelector('#modal [data-act="pzLeave"]'), 'it is in ☰');
  assert.deepEqual(errors, []);
});

test('a phone gets the fixed bar (tests/puzzles-phone.test.js), a desktop the whole card', () => {
  const { ev, dom, errors } = load();
  ev("window.innerWidth=360;window.innerHeight=740;dispatchEvent(new Event('resize'))");
  begin(ev);
  assert.equal(box(dom).classList.contains('dock'), true, 'the bar');
  ev('ACT.pzRetry()');
  assert.equal(box(dom).classList.contains('dock'), true, 'a fresh try keeps it');
  const { ev: ev2, dom: dom2 } = load();
  ev2("window.innerWidth=1280;window.innerHeight=800;dispatchEvent(new Event('resize'))");
  begin(ev2);
  assert.equal(box(dom2).classList.contains('dock'), false, 'a desktop shows the whole card');
  assert.ok(box(dom2).querySelector('.pztop .pzgoals'), 'with its three goals');
  assert.deepEqual(errors, []);
});

test('the map leaves out far cities and quiets idle stepping stones, but not the puzzle\'s own or yours', () => {
  const { ev, errors } = load();
  begin(ev);
  assert.equal(ev("pzKind('tip')"), null, 'Tripoli is far from the puzzle: not a city here');
  assert.equal(ev("pzHide('tip')"), true, 'and not drawn');
  assert.equal(ev("pzKind('dla')"), 'off', 'Douala is close: a stepping stone');
  assert.equal(ev("pzQuiet('dla')"), true, 'a nameless dot while it has no part');
  assert.equal(ev("pzQuiet('fih')||pzQuiet('abj')"), false, 'the puzzle\'s cities keep their names');
  ev("UI.sel={type:'city',id:'dla'}");
  assert.equal(ev("pzQuiet('dla')"), false, 'picked: named');
  ev("UI.sel=null;ACT.pzPop({city:'dla'})");
  assert.equal(ev("pzQuiet('dla')"), false, 'a POP there: named');
  ev("ACT.pzUndo();cam.z=UI.pzZ0*2.5");
  assert.equal(ev("pzQuiet('dla')"), false, 'zoomed in close: named');
  ev('cam.z=UI.pzZ0;draw(0)');
  assert.deepEqual(errors, []);
});

test('Architect runs keep hiding everything outside the run', () => {
  const { ev, errors } = load();
  ev("ACT.pzArStart({id:'euro'})");
  assert.equal(ev("pzHide('lis')&&arHide('lis')"), true);
  assert.equal(ev("pzHide('ams')||arHide('ams')"), false);
  assert.deepEqual(errors, []);
});
