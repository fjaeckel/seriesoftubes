// Architect runs (prototype): one network built brief by brief, reviewed by a chaos monkey.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Reference builds, brief by brief: [a, b, route] lays a tube (a diverse trench when the pair has one), ['@rm', city]
// closes a POP. Each must pass every brief within budget and land at par.
const REF = {
  euro: [[['ams', 'fra', 'land']], [['ams', 'par', 'land'], ['ams', 'lon', 'nshuttle']], [['par', 'fra', 'land']],
    [['ams', 'zrh', 'land'], ['par', 'zrh', 'land']], [['lon', 'par', 'pasdc'], ['ams', 'lon', 'concerto']], [['@rm', 'fra'], ['ams', 'dus', 'land'], ['ams', 'dus', 'land']]],
  usa: [[['ash', 'nyc', 'land']], [['ash', 'chi', 'land']], [['nyc', 'chi', 'land']], [], [['chi', 'dal', 'land'], ['dal', 'sjc', 'land']], [['chi', 'sjc', 'land']]],
  pacific: [[['tok', 'hkg', 'adc']], [['hkg', 'sin', 'land']], [['tok', 'hkg', 'apg']], [['hkg', 'sin', 'sjc2']], [['sin', 'syd', 'indigo']]],
};
const lay = (ev, a, b, via, div = 1) => ev(`ACT.pzLinkTo({a:'${a}',b:'${b}'});ACT.pzVia({v:'${via}'});ACT.pzDiv({v:${div}});ACT.pzLink({tier:AR_TIER});closeModal()`);
const review = (ev) => { ev('arShowStart();arShowSkip()'); return ev('S.ar.passed===pzSig()'); };

test('architect runs: every reference passes each brief, on plan and within budget', () => {
  const { ev, errors } = load();
  assert.deepEqual(JSON.parse(ev('JSON.stringify(AR_RUNS.map(r=>r.id))')).sort(), Object.keys(REF).sort());
  for (const [id, plan] of Object.entries(REF)) {
    ev(`ACT.pzArStart({id:'${id}'})`);
    assert.equal(ev('arOn()&&!!S.pops[S.ar.hq]'), true, `${id}: starts with a POP at HQ`);
    plan.forEach((steps, i) => {
      for (const s of steps) if (s[0] === '@rm') ev(`ACT.pzRmPop({city:'${s[1]}'})`); else lay(ev, ...s);
      assert.equal(review(ev), true, `${id} brief ${i + 1}: ${ev('arEval().why')} ${ev('JSON.stringify(UI.arFail)')}`);
      assert.deepEqual(JSON.parse(ev('JSON.stringify([UI.mk.mood,UI.mk.sprayAt])')), ['cheer', null], `${id}: a skipped review that passes still ends in a cheer`);
      if (i < plan.length - 1) { ev('ACT.pzArNext()'); assert.equal(ev('UI.mk'), null, `${id}: the monkey leaves with the next brief`); }
    });
    assert.equal(ev('arOver()'), 0, `${id}: never over a brief's tubes`);
    assert.equal(ev('arSpend()<=arRun().budget'), true, `${id}: within budget`);
    assert.ok(ev('arSpend()>arRun().budget*0.95'), `${id}: the budget sits just above the reference`);
    ev('ACT.pzArNext()');
    assert.equal(ev('JSON.parse(localStorage.getItem(AR_KEY)).runs[S.ar.id].st'), 3, `${id}: three stars stored`);
  }
  assert.deepEqual(errors, []);
});

test('architect runs: the chaos monkey finds a shared trench, edits clear the cut, old builds are paid for', () => {
  const { ev, errors } = load();
  ev("ACT.pzArStart({id:'euro'})");
  assert.equal(ev("arHide('lis')&&arHide('bru')"), true, 'cities outside the run are hidden');
  assert.equal(ev("arHide('dus')"), true, 'a city a later brief adds stays hidden until then');
  // Later briefs stay a surprise: nothing on the map or a city card says where the run goes next.
  assert.equal(ev("typeof arTags"), 'undefined');
  ev("UI.sel={type:'city',id:'fra'};renderPanel()");
  assert.doesNotMatch(ev("document.getElementById('panelBody')?.textContent||''"), /brief \d|Coming up/i);
  ev('ACT.pzArAll()');
  assert.equal(ev("arHide('lis')"), false, 'and shown on request');
  ev('ACT.pzArAll()');
  lay(ev, 'ams', 'fra', 'land'); review(ev); ev('ACT.pzArNext()');
  lay(ev, 'ams', 'par', 'land'); lay(ev, 'ams', 'lon', 'nshuttle'); review(ev); ev('ACT.pzArNext()');
  lay(ev, 'ams', 'fra', 'land', 0); // the same trench: looks redundant, is not
  assert.equal(review(ev), false);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(UI.arFail.gold)')), ['fra']);
  assert.ok(ev('S.links.some(l=>l.cut)'), 'the failing cut stays on the map');
  ev('ACT.pzUndo()');
  assert.equal(ev('!UI.arFail&&!S.links.some(l=>l.cut)'), true, 'an edit clears it');
  const sunk = ev('S.ar.sunk');
  ev("ACT.pzRmLink({id:S.links.find(l=>l.br===0).id})");
  assert.ok(ev('S.ar.sunk') > sunk, 'removing an earlier brief\'s tube refunds nothing');
  ev('ACT.pzReset()');
  assert.equal(ev('S.ar.sunk'), sunk, 'reset goes back to the start of the brief');
  // Two diverse trenches would make both gold, but the plan has one tube: the ring is the answer.
  lay(ev, 'ams', 'fra', 'land'); lay(ev, 'ams', 'par', 'land');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(arTubes())')), { u: 2, max: 1, over: 1 });
  ev('ACT.pzReset()');
  lay(ev, 'par', 'fra', 'land');
  assert.equal(ev('arTubes().over'), 0);
  assert.equal(review(ev), true);
  assert.deepEqual(errors, []);
});

test('architect runs: a latency brief needs the fast path, and normal puzzles are untouched', () => {
  const { ev, errors } = load();
  ev("ACT.pzArStart({id:'usa'})");
  lay(ev, 'ash', 'nyc', 'land'); review(ev); ev('ACT.pzArNext()');
  lay(ev, 'ash', 'chi', 'land'); review(ev); ev('ACT.pzArNext()');
  lay(ev, 'ash', 'nyc', 'land'); assert.equal(review(ev), true, 'a diverse trench makes New York gold'); ev('ACT.pzArNext()');
  assert.equal(ev('arEval().lat.ok'), false, 'via Ashburn is too slow');
  lay(ev, 'nyc', 'chi', 'land');
  assert.equal(ev('arEval().lat.ok&&arEval().ready'), true);
  ev("ACT.pzStart({id:'hello'})");
  assert.equal(ev('!S.ar&&pzKind("lon")==="goal"&&!arHide("par")'), true);
  assert.deepEqual(errors, []);
});

test('architect runs: Play on the title screen\'s puzzle list starts a run', () => {
  const { ev, errors } = load();
  ev('ACT.puzzleMenu()');
  assert.equal(ev('S'), null, 'no game loaded yet');
  ev("document.querySelector('#modal [data-act=pzArStart]').click()");
  assert.equal(ev('arOn()&&S.ar.id'), 'euro');
  assert.deepEqual(errors, []);
});

test('architect runs: a ring goal needs one cycle through its cities', () => {
  const { ev, errors } = load();
  ev("ACT.pzArStart({id:'euro'})");
  lay(ev, 'ams', 'fra', 'land'); review(ev); ev('ACT.pzArNext()');
  lay(ev, 'ams', 'par', 'land'); lay(ev, 'ams', 'lon', 'nshuttle'); review(ev); ev('ACT.pzArNext()');
  lay(ev, 'par', 'fra', 'land'); review(ev); ev('ACT.pzArNext()');
  lay(ev, 'ams', 'zrh', 'land'); lay(ev, 'par', 'zrh', 'land'); review(ev); ev('ACT.pzArNext()');
  assert.equal(ev("arRingOk(['ams','par','lon'])"), false, 'London hangs off Amsterdam: no ring');
  assert.match(ev('arEval().why'), /ring/i);
  lay(ev, 'lon', 'par', 'pasdc');
  assert.equal(ev("arRingOk(['ams','par','lon'])&&arEval().ready"), true);
  assert.deepEqual(errors, []);
});

test('architect runs: the detour needs room, and a roomy but pricey build misses the budget star', () => {
  const { ev, errors } = load();
  ev("ACT.pzArStart({id:'euro'})");
  const head = [[['ams', 'fra', 'land']], [['ams', 'par', 'land'], ['ams', 'lon', 'nshuttle']], [['par', 'fra', 'land']]];
  const run = (plan) => plan.forEach((steps, i) => {
    for (const s of steps) if (s[0] === '@rm') ev(`ACT.pzRmPop({city:'${s[1]}'})`); else lay(ev, ...s);
    assert.equal(review(ev), true, `brief ${i + 1}: ${ev('arEval().why')} ${ev('JSON.stringify(UI.arFail)')}`);
    ev('ACT.pzArNext()');
  });
  run(head);
  // Zürich hung off Frankfurt: connected both ways, but a cut on Amsterdam-Frankfurt sends Frankfurt and Zürich through
  // Paris, and that tube is too thin for all three.
  lay(ev, 'fra', 'zrh', 'land'); lay(ev, 'par', 'zrh', 'land');
  assert.equal(review(ev), false);
  assert.ok(JSON.parse(ev('JSON.stringify(UI.arFail.short)')).length > 0, 'someone still connected runs short');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(UI.arFail.gold)')), [], 'nobody gold is cut off');
  ev('ACT.pzReset()');
  lay(ev, 'ams', 'zrh', 'land'); lay(ev, 'par', 'zrh', 'land');
  assert.equal(review(ev), true, 'Zürich straight to HQ spreads the detours');
  ev('ACT.pzArNext()');
  // Paris doubles: a second Amsterdam-Paris trench gives room, at a price.
  lay(ev, 'lon', 'par', 'pasdc'); lay(ev, 'ams', 'par', 'land');
  assert.equal(review(ev), true); ev('ACT.pzArNext()');
  ev("ACT.pzRmPop({city:'fra'})"); lay(ev, 'ams', 'dus', 'land'); lay(ev, 'dus', 'zrh', 'land');
  assert.equal(review(ev), true);
  assert.equal(ev('arOver()'), 0);
  assert.ok(ev('arSpend()') > ev('arRun().budget'));
  assert.equal(ev('arStars(arSpend())'), 2, 'on plan, over budget: two stars');
  assert.deepEqual(errors, []);
});

test('architect runs: a bigger tube brings a bigger router, and changing an old tube is a new lease', () => {
  const { ev, errors } = load();
  ev("ACT.pzArStart({id:'euro'})");
  lay(ev, 'ams', 'fra', 'land'); review(ev); ev('ACT.pzArNext()');
  assert.equal(ev("S.pops.ams.rgen||0"), 0, 'the free router takes 100G');
  const sunk = ev('S.ar.sunk');
  ev("ACT.pzTier({id:S.links[0].id,tier:2})");
  assert.ok(ev("RG[S.pops.ams.rgen].maxLT>=2&&RG[S.pops.fra.rgen].maxLT>=2"), '400G needs a bigger router at both ends');
  assert.ok(ev('S.ar.sunk') > sunk, 'the old 100G lease is paid for');
  ev('ACT.pzUndo()');
  assert.equal(ev("(S.pops.ams.rgen||0)===0&&S.ar.sunk===" + sunk), true, 'undo puts it all back');
  assert.deepEqual(errors, []);
});

test('architect runs: the map tells two tubes in one trench from two separate paths', () => {
  const { ev, errors } = load();
  ev("ACT.pzArStart({id:'euro'});ACT.pzArAll();S.cash=1e9");
  lay(ev, 'ams', 'fra', 'land', 1); lay(ev, 'ams', 'fra', 'land', 0);
  lay(ev, 'ams', 'par', 'land', 1); lay(ev, 'ams', 'par', 'land', 1);
  assert.equal(ev("arPaths(S.links.find(l=>l.b==='fra'||l.a==='fra'))"), 1, 'same trench: one path');
  assert.equal(ev("arPaths(S.links.find(l=>l.b==='par'||l.a==='par'))"), 2, 'diverse: two paths');
  ev("cam.x=CITY.ams.x;cam.y=CITY.ams.y;cam.z=2.4;drawFrame(performance.now())");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(AR_PILLS.map(p=>p[2]).sort())")), ['2× one trench', '✓ 2 paths']);
  assert.deepEqual(errors, []);
});

test('#231 the puzzle list counts each section\'s own stars: runs above, packs next to the packs', () => {
  const { ev, errors } = load();
  // 2 stars on a pack puzzle, 2 on Euro Run, 3 on another run
  ev("localStorage.setItem(PZ_KEY,JSON.stringify({set:PZ_SET,noted:1,s:{[PZ[0].id]:{st:2}}}));localStorage.setItem(AR_KEY,JSON.stringify({runs:{[AR_RUNS[0].id]:{st:2},[AR_RUNS[1].id]:{st:3}}}))");
  ev('ACT.puzzleMenu()');
  const heads = JSON.parse(ev("JSON.stringify([...document.querySelectorAll('#modal h3.pzpack')].map(h=>h.textContent))"));
  assert.match(heads[0], new RegExp(`Architect runs ⭐ 5/${3 * ev('AR_RUNS.length')}`), heads[0]);
  // the packs' total sits right above the first pack, after the runs and the weekly puzzle, and says what it counts
  const order = ev(`(()=>{const m=document.querySelector('#modal'),box=m.querySelector('.pzprog'),run=m.querySelector('[data-act=pzArStart]'),pack=[...m.querySelectorAll('h3.pzpack')].find(h=>!h.textContent.includes('🏗️'));
    return [!!(run.compareDocumentPosition(box)&Node.DOCUMENT_POSITION_FOLLOWING),!!(box.compareDocumentPosition(pack)&Node.DOCUMENT_POSITION_FOLLOWING),box.textContent].join('|')})()`);
  const [afterRuns, beforePacks, box] = order.split('|');
  assert.equal(afterRuns, 'true', 'below the architect runs');
  assert.equal(beforePacks, 'true', 'above the first pack');
  assert.match(box, new RegExp(`Stars from the packs⭐ 2 / ${3 * ev('PZ.length')}`), box);
  assert.deepEqual(errors, []);
});
