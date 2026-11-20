// The Hyperscaler's own story (39-hyper-story.js): thirteen level names, quotes and "Next:" lines in every language,
// unlocks read from the code that gates them, the level-up toast, the first-steps guide (each step glows at its button,
// waits when it cannot be played, can be dismissed, is kept in the save), the charter picker and the help entry.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
function start(t, opts = {}) {
  const h = load({ seed: 5, ...opts });
  t.after(() => h.dom.window.close());
  if (opts.guide) h.dom.window.__TUBES_TUT__ = true;
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e9;S.nextFail=S.nextEvent=1e9;compute()");
  return h;
}
const raw = (s) => /hyper_story\.|hyper_badges\.|\{[a-z]+\}|undefined|NaN/.test(s);

for (const lang of ['en', 'it', 'pt', 'fr', 'es', 'de']) {
  test(`${lang}: every level's name, quote, unlocks, toast and Next line render, as do the guide, picker and help`, (t) => {
    const { ev, errors } = start(t, lang === 'en' ? {} : { lang });
    const L = J(ev, 'hsLevels()');
    assert.equal(L.length, 13);
    assert.equal(ev('LV_X.find(x=>x.on()).levels===hsLevels()&&lvInfo(0)===hsLevels()[0]'), true, 'the ladder tells the story');
    assert.equal(new Set(L.map((l) => l.n)).size, 13, 'thirteen different names');
    for (const l of L) for (const s of [l.n, l.q, l.unlock]) { assert.ok(s && s.length > 2, `empty in ${lang}`); assert.ok(!raw(s), `${lang}: ${s}`); }
    for (let lv = 1; lv <= 13; lv++) {
      for (const s of [ev(`lvToast(${lv})`), ev(`lvTitle(${lv})`), ev(`lvEyebrow(${lv})`), ev(`lvNext(lvInfo(${lv}),true)`)]) assert.ok(!raw(s), `${lang} level ${lv}: ${s}`);
    }
    for (let i = 0; i < 7; i++) assert.ok(!raw(ev(`HS_GUIDE[${i}].t()`)), `${lang} guide step ${i}`);
    assert.ok(!raw(ev('charterDesc(CHARTERS.hyper)')));
    assert.ok(!raw(ev("HELP_G().map(x=>x.join(' ')).join(' ')")));
    if (lang === 'en') {
      assert.equal(L[0].n, 'Rack Under the Stairs');
      assert.equal(L[12].n, 'Weather System');
      assert.match(ev('charterDesc(CHARTERS.hyper)'), /never sell it.*Cloud Nine: regions on 5 continents.*10\.0 Tbps between regions/);
      assert.match(ev("HELP_G().find(x=>x[0]==='Hyperscaler')[1]"), /never sell it.*Cloud Nine the win/);
    }
    assert.deepEqual(errors, []);
  });
}

test('the unlocks and the Next line come from the code that gates them', (t) => {
  const { ev, errors } = start(t);
  const L = J(ev, 'hsLevels()');
  assert.match(L[0].unlock, /a free Rack Shack at home, room for 2 regions, Server Barn regions/);
  assert.match(L[3].unlock, /room for 4 regions.*Compute Campus regions.*AI labs as tenants/);
  // And the trouble the director lets in at each level (38-hyper-director.js, HS_DIR_LV).
  assert.match(L[1].unlock, /heatwaves and energy crunches, and botnets/);
  assert.match(L[2].unlock, /rival clouds, AI labs asking for training runs, and launch days for your game studios/);
  assert.match(L[3].unlock, /cloud-sized outages, regulators, and whole-region failures \(once you run two regions\)/);
  assert.doesNotMatch(L[0].unlock, /rival|regulators|outages|failures/);
  assert.match(L[2].unlock, /solar farms with batteries/);
  assert.match(L[4].unlock, /your own substation/);
  assert.match(L[7].unlock, /Gigawatt Gulch regions/);
  assert.match(L[8].unlock, /small modular reactor.*your own subsea cables|your own subsea cables.*small modular reactor/);
  assert.equal(L[12].unlock, 'nothing new but the view: Cloud Nine is up to you');
  // The Next line asks what lvNeed asks: peak, live regions, continents.
  assert.equal(ev('lvNext(lvInfo(1),true)'), 'Next: Partly Cloudy, at a 150 Gbps peak with 1 live region. It brings room for 3 regions, leased colo cages (a region in two weeks), a second availability zone per region, enterprises lifting and shifting, game studios, heatwaves and energy crunches, and botnets.');
  // The middle steps (38-hyper-zones.js): a third zone at level 5.
  assert.match(L[4].unlock, /a third availability zone per region/);
  assert.match(ev('lvNext(lvInfo(4),true)'), /^Next: Fog Computing, at a 2\.00 Tbps peak with 3 live regions on 2 continents\./);
  assert.equal(ev('lvNext(null)'), 'Top of the sky. Only Cloud Nine is higher.');
  // A balance pass that moves a gate moves the story with it.
  ev('HS_T[2].lv=5;HS_LV_PK[4]=7000;HS_LVS=null');
  assert.doesNotMatch(ev('hsLevels()[3].unlock'), /Compute Campus/);
  assert.match(ev('hsLevels()[4].unlock'), /Compute Campus regions/);
  assert.match(ev('lvNext(lvInfo(4),true)'), /at a 7\.00 Tbps peak/);
  // The card and the Deals tab read the same ladder.
  ev('HS_T[2].lv=4;HS_LV_PK[4]=2000;HS_LVS=null');
  assert.match(ev('lvlCard()'), /Cloud level 1 of 13.*Rack Under the Stairs/s);
  assert.match(ev('dlLvl()'), /Cloud level 1: Rack Under the Stairs/);
  assert.deepEqual(errors, []);
});

test('the level-up toast names the level, what it unlocks in this charter and the quote', (t) => {
  const { ev, errors } = start(t);
  assert.equal(ev('lvToast(4)'), '<b>Level 4: Cumulus Incorporated!</b> Unlocked: room for 4 regions, Compute Campus regions, AI labs as tenants, cloud-sized outages, regulators, and whole-region failures (once you run two regions).<br><i>“I asked engineering for a cost-cutting plan. They sent me a campus with its own postcode.” — your CFO</i>');
  // Reaching level 2 for real: a 200 Gbps peak with the home region live.
  ev("ACT.hsLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.stats.peak=250;compute();UI.toasts=[];dayTick()");
  assert.equal(ev('S.lvl'), 2);
  assert.match(ev("$('toasts').textContent"), /Level 2: Partly Cloudy! Unlocked: room for 3 regions/);
  assert.deepEqual(errors, []);
});

test('the first-steps guide: each step glows at its button, waits when it cannot be played and ends with a toast', (t) => {
  const { ev, errors } = start(t, { guide: true });
  const step = () => ev('(()=>{const g=hsGuideStep();return g?HS_GUIDE.indexOf(g):hsGdNow()})()');
  const glow = () => ev("(()=>{const e=document.querySelector('.coach-glow');return e?(e.id||e.dataset.act||e.dataset.chg):''})()");
  assert.equal(ev('S.tut'), null, 'the classic tutorial is skipped');
  assert.equal(ev('S.hs.guide'), 0);
  ev('renderAll()');
  assert.equal(ev("$('coach').hidden"), false);
  assert.match(ev("$('coach').textContent"), /Step 1 of 7.*Launch in Germany/);
  // Launch at home: the button in the Cloud tab glows once the city is open.
  ev("selectCity(S.home);UI.tab='cust';renderAll()");
  assert.equal(glow(), 'hsLaunch');
  ev("ACT.hsLaunch({cc:'DE'});renderAll()");
  assert.equal(step(), 1);
  assert.match(ev("$('coach').textContent"), /front door/);
  ev("UI.tab='up';renderAll()");
  assert.equal(glow(), 'buyTransit');
  ev("ACT.buyTransit({city:S.home,net:'cog',tier:1});renderAll()");
  assert.equal(step(), 2);
  assert.ok(['sp1', 'phoneSpeed'].includes(glow()), glow());
  ev('S.day=5;renderAll()');
  // No tenant has called yet: that step waits, and the second region shows meanwhile.
  assert.equal(ev("S.offers.some(o=>o.type==='cloud')"), false);
  assert.equal(step(), 4);
  const c = ev('hsGdRgAt()');
  assert.ok(c && c !== 'fra');
  assert.match(ev("$('coach').textContent"), /Build a second one, a Server Barn for \$400k/);
  assert.match(ev("$('coach').innerHTML"), /data-act="focusCity"/, 'a Show me button opens the city');
  ev("S.offers.push(hsOffer('startup',S.home,5));renderAll()");
  assert.equal(step(), 3);
  ev("ACT.leftTab({t:'deals'});renderAll()");
  assert.equal(ev("(()=>{const e=document.querySelector('.coach-glow');return e?e.dataset.act:''})()"), 'accept');
  ev("ACT.accept({id:S.offers.find(o=>o.type==='cloud').id});renderAll()");
  assert.equal(step(), 4);
  ev(`ACT.buildPop({city:'${c}'});UI.via=null;UI.route=null;openLinkModal(S.home,'${c}');ACT.buildLink({tier:3});closeModal();selectCity('${c}');UI.tab='cust';renderAll()`);
  assert.equal(glow(), 'hsRegion');
  ev(`ACT.hsRegion({city:'${c}'});renderAll()`);
  assert.equal(ev('hsRgN()'), 2);
  // The replica and the drill wait for the region to open: the coach hides meanwhile.
  assert.equal(step(), -2);
  assert.equal(ev("$('coach').hidden"), true);
  ev(`S.hs.rg['${c}'].ready=S.day;compute();selectCity(S.home);UI.tab='cust';renderAll()`);
  assert.equal(step(), 5);
  assert.equal(glow(), 'hsReplica');
  ev(`ACT.hsReplica({city:S.home,v:'${c}'});compute();renderAll()`);
  assert.equal(step(), 6);
  assert.equal(glow(), 'hsDrill');
  ev('ACT.hsDrill({city:S.home});renderAll()');
  assert.equal(ev('S.hs.guide'), null, 'all done');
  assert.equal(ev("$('coach').hidden"), true);
  assert.match(ev("$('toasts').textContent"), /That’s the whole cloud/);
  assert.equal(ev("localStorage.getItem('sot-tut-hs')"), '1');
  assert.deepEqual(errors, []);
});

test('the guide can be dismissed, never blocks, is remembered in the save and only starts once per browser', (t) => {
  const { ev, errors, dom } = start(t, { guide: true });
  ev('renderAll()');
  assert.match(ev("$('coach').innerHTML"), /data-act="hsGuideSkip"/);
  // It never blocks: the player may do anything, in any order.
  ev("ACT.hsLaunch({cc:'FR'});renderAll()");
  assert.equal(ev("S.hs.cc.FR?1:0"), 1);
  // Kept in the save, junk repaired.
  ev('S.hs.guide=1');
  const s = ev('JSON.stringify(S)');
  assert.equal(J(ev, `(()=>{const r=parseSave(${JSON.stringify(s)});return migrate(r.s).hs.guide;})()`), 1);
  for (const [junk, want] of [[-1, null], [1e9, null], ['3', null], [2.5, null], [127, 127], [null, null]]) {
    const o = JSON.parse(s); o.hs.guide = junk;
    assert.equal(J(ev, `migrate(${JSON.stringify(o)}).hs.guide`), want, `guide ${junk}`);
  }
  const old = JSON.parse(s); delete old.hs.guide;
  assert.equal(J(ev, `migrate(${JSON.stringify(old)}).hs.guide`), null, 'an older save loads without it');
  ev('ACT.hsGuideSkip({})');
  assert.equal(ev('S.hs.guide'), null);
  assert.equal(ev("$('coach').hidden"), true);
  assert.equal(ev("localStorage.getItem('sot-tut-hs')"), '1');
  ev("ACT.start({});ACT.charter({k:'hyper'});renderAll()");
  assert.equal(ev('S.hs.guide'), null, 'this browser has seen it');
  // Seeded tests skip it unless they ask, as they skip the tutorial.
  dom.window.__TUBES_TUT__ = false;
  ev("localStorage.removeItem('sot-tut-hs');ACT.start({});ACT.charter({k:'hyper'})");
  assert.equal(ev('S.hs.guide'), null);
  // A classic game never has it.
  ev("ACT.start({});ACT.charter({k:'global'})");
  assert.equal(ev('hsGuideOn()'), false);
  assert.deepEqual(errors, []);
});

test('the guide on a phone: the coach shows and the glow finds the phone buttons', (t) => {
  const { ev, errors } = start(t, { guide: true });
  for (const w of [360, 640, 1280]) {
    ev(`window.innerWidth=${w};renderAll()`);
    assert.equal(ev("$('coach').hidden"), false, `coach at ${w}px`);
    assert.match(ev("$('coach').textContent"), /Launch in Germany/);
  }
  ev("ACT.hsLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});window.innerWidth=360;renderAll()");
  assert.ok(['sp1', 'phoneSpeed'].includes(ev("(()=>{const e=document.querySelector('.coach-glow');return e?(e.id||e.dataset.act):''})()")));
  assert.deepEqual(errors, []);
});
