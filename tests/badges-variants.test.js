// Badge variants by ruleset preset (2.0): On-call earns the standard badge, Change Freeze a frosted one and BGP at
// 3 a.m. a fiery one; Sandbox and puzzles earn none. A harder preset upgrades a badge you already have.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// The preset is read from S.rules.preset until the ruleset feature lands with rulePreset().
const start = (ev, preset) => {
  ev("localStorage.removeItem('sot-badges');ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  if (preset) ev(`S.rules={preset:'${preset}'}`);
  ev("S.ach={};S.achP={};compute()");
};
const earnHello = (ev) => ev("S.pni.push({id:'x',net:'nfx',city:'fra',tier:0});compute();checkBadges()");
const hof = (ev) => JSON.parse(ev("localStorage.getItem('sot-badges')||'{}'"));

test('every save without a preset plays On-call and earns the standard badge', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev('badgeVar()'), 'oncall');
  earnHello(ev);
  assert.ok(ev('S.ach.hello!==undefined'));
  assert.equal(ev('S.achP.hello'), 'oncall');
  assert.deepEqual(hof(ev).hello.vs && Object.keys(hof(ev).hello.vs), ['oncall']);
  assert.equal(hof(ev).hello.v, 'oncall');
  assert.deepEqual(errors, []);
});

test('Change Freeze earns frosted badges and BGP at 3 a.m. fiery ones, shown in the toast and the list', () => {
  for (const [p, name, cls] of [['freeze', /Freeze-dried/, 'v-freeze'], ['bgp', /Forged at 3 a\.m\./, 'v-bgp']]) {
    const { ev, dom, errors } = load();
    start(ev, p);
    ev("window.__t=[];const _t=toast;toast=(h,...a)=>{window.__t.push(h);return _t(h,...a);}");
    earnHello(ev);
    assert.equal(ev('S.achP.hello'), p);
    assert.match(ev("window.__t.join(' ')"), name, `${p}: the toast names the variant`);
    ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderLeft()");
    const card = dom.window.document.querySelector(`#leftBody .bdg.on.${cls}`);
    assert.ok(card, `${p}: the badge list shows the variant`);
    assert.match(card.textContent, name);
    assert.equal(hof(ev).hello.v, p, 'remembered on this device');
    assert.deepEqual(errors, []);
  }
});

test('Sandbox and puzzles earn no badges', () => {
  for (const p of ['sandbox', 'puzzle']) {
    const { ev, errors } = load();
    start(ev, p);
    earnHello(ev);
    assert.equal(ev('badgeVar()'), null);
    assert.equal(ev('Object.keys(S.ach).length'), 0, p);
    assert.deepEqual(errors, []);
  }
  const { ev, errors } = load();
  start(ev);
  ev("S.mode='sandbox'");
  earnHello(ev);
  assert.equal(ev('Object.keys(S.ach).length'), 0, 'the old sandbox mode too');
  assert.deepEqual(errors, []);
});

test('a harder preset upgrades a badge, an easier one never downgrades it', () => {
  const { ev, errors } = load();
  start(ev, 'freeze');
  earnHello(ev);
  const day = ev('S.ach.hello');
  ev("window.__t=[];const _t=toast;toast=(h,...a)=>{window.__t.push(h);return _t(h,...a);}");
  ev("S.rules.preset='oncall';checkBadges()");
  assert.equal(ev('S.achP.hello'), 'oncall', 'On-call beats Change Freeze');
  assert.match(ev("window.__t.join(' ')"), /Badge upgraded/);
  ev("S.day+=10;S.rules.preset='bgp';checkBadges()");
  assert.equal(ev('S.achP.hello'), 'bgp');
  assert.equal(ev('S.ach.hello'), day, 'the day it was first earned stays');
  ev("window.__t=[];S.rules.preset='freeze';checkBadges()");
  assert.equal(ev('S.achP.hello'), 'bgp', 'never downgraded');
  assert.equal(ev("window.__t.length"), 0, 'and no toast');
  const h = hof(ev).hello;
  assert.deepEqual(Object.keys(h.vs).sort(), ['bgp', 'freeze', 'oncall'], 'the collection holds every variant earned');
  assert.equal(h.v, 'bgp', 'the shelf shows the best one');
  assert.deepEqual(errors, []);
});

test('the collection counts badges per variant on this device, and fits a phone', () => {
  const { ev, dom, errors } = load();
  ev('window.innerWidth=360');
  start(ev, 'bgp');
  earnHello(ev);
  ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderLeft()");
  const shelf = dom.window.document.querySelector('#leftBody .bshelf');
  assert.ok(shelf);
  const total = ev('BADGES.length');
  assert.match(shelf.textContent, new RegExp(`Forged at 3 a\\.m\\. 1/${total}`));
  assert.match(shelf.textContent, new RegExp(`Freeze-dried 0/${total}`));
  assert.ok(dom.window.document.querySelector('#leftBody .bsh.v-bgp.cur'), 'the variant this game earns is marked');
  assert.match(dom.window.document.getElementById('leftBody').textContent, /forged in fire/);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(badgeShelf(hof()))')), { freeze: 0, oncall: 0, bgp: 1 });
  assert.deepEqual(errors, []);
});

test('old saves and old halls of fame keep loading, as standard badges', () => {
  const { ev, errors } = load();
  start(ev);
  // a 1.x save: S.ach holds days, no S.achP; a 1.x hall of fame: {d, n} per badge
  ev("localStorage.setItem('sot-badges',JSON.stringify({hello:{d:'2025-01-02',n:'Old'},t1:{d:'2025-03-04',n:'Old'},junk:5}))");
  ev("const o=JSON.parse(JSON.stringify(S));o.ach={hello:12,t1:'400'};delete o.achP;S=migrate(o)");
  assert.equal(ev('S.achP.hello'), 'oncall');
  assert.equal(ev('S.ach.t1'), 400, 'days are numbers');
  assert.deepEqual(JSON.parse(ev("JSON.stringify(Object.keys(S.achP).sort())")), ['hello', 't1']);
  const h = JSON.parse(ev('JSON.stringify(hof())'));
  assert.equal(h.hello.v, 'oncall');
  assert.equal(h.hello.vs.oncall, '2025-01-02');
  assert.equal(h.junk, undefined, 'broken entries are dropped');
  // a hand-edited variant is not trusted
  ev("const o=JSON.parse(JSON.stringify(S));o.achP={hello:'lava',t1:'bgp'};S=migrate(o)");
  assert.equal(ev('S.achP.hello'), 'oncall');
  assert.equal(ev('S.achP.t1'), 'bgp');
  ev("localStorage.setItem('sot-badges','[1,2]')");
  assert.equal(ev('JSON.stringify(hof())'), '{}');
  ev("UI.left='goals';UI.leftOpen=true;renderLeft()");
  // new games start with an empty variant map
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('JSON.stringify(S.achP)'), '{}');
  assert.deepEqual(errors, []);
});

test('the share card rings the variant badges', () => {
  const { ev, errors } = load();
  start(ev, 'bgp');
  earnHello(ev);
  // count the strokes the card draws with a variant badge and with the same badge in its standard look
  const calls = () => ev("(()=>{const cv=shareCanvas();return cv.getContext('2d').calls.n;})()");
  const fiery = calls();
  ev("S.achP.hello='oncall'");
  const plain = calls();
  assert.ok(fiery > plain, `the ring and the tally are drawn (${fiery} > ${plain} calls)`);
  assert.deepEqual(errors, []);
});

test('a variant named after an Object prototype key is not a variant', () => {
  const { ev, errors } = load();
  start(ev);
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    ev(`const o=JSON.parse(JSON.stringify(S));o.ach={hello:3};o.achP={hello:${JSON.stringify(k)}};S=migrate(o)`);
    assert.equal(ev('S.achP.hello'), 'oncall', k);
    assert.equal(ev(`bvar(${JSON.stringify(k)}).k`), 'oncall', `bvar(${k})`);
    ev(`S.rules={preset:${JSON.stringify(k)}}`);
    assert.equal(ev('badgeVar()'), 'oncall', `badgeVar() under preset ${k}`);
  }
  ev("S.rules={preset:'oncall'};S.achP.hello='constructor';shareCanvas()");
  assert.deepEqual(errors, []);
});

test('"Badge upgraded" means the collection on this device got a better variant', () => {
  const { ev, errors } = load();
  const spy = () => ev("window.__t=[];if(!window.__sp){window.__sp=1;const _t=toast;toast=(h,...a)=>{window.__t.push(h);return _t(h,...a);};}");
  // a new game, but this device already holds the frosted badge: the standard one upgrades it
  start(ev, 'oncall');
  ev("localStorage.setItem('sot-badges',JSON.stringify({hello:{d:'2026-01-01',n:'Old',vs:{freeze:'2026-01-01'}}}))");
  spy(); earnHello(ev);
  assert.match(ev("window.__t.join(' ')"), /Badge upgraded/);
  assert.equal(hof(ev).hello.v, 'oncall');
  // another new game, the device already holds the fiery one: earning the frosted one is a plain unlock
  start(ev, 'freeze');
  ev("localStorage.setItem('sot-badges',JSON.stringify({hello:{d:'2026-01-01',n:'Old',vs:{bgp:'2026-01-01'}}}))");
  spy(); earnHello(ev);
  const t = ev("window.__t.join(' ')");
  assert.match(t, /Badge unlocked/);
  assert.doesNotMatch(t, /Badge upgraded/);
  assert.equal(hof(ev).hello.v, 'bgp', 'the best variant stays on the shelf');
  assert.deepEqual(errors, []);
});
