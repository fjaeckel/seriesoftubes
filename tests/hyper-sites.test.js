// Where a Hyperscaler may build a region (37-hyper-sites.js): a list of where the big clouds really run regions and
// campuses, small campus towns with big grids included, and mainland China only through a licensed local partner
// (38-hyper-china.js), behind a wall nothing crosses.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./harness');

function start(seed = 5) {
  const g = load({ seed });
  g.ev("ACT.start({});UI.tutLater=true;ACT.charter({k:'hyper'});S.cash=1e10;S.nextFail=S.nextEvent=1e9");
  return g;
}

test('region sites are the real-world list: big cities without a region are out, campus towns are in', () => {
  const g = start();
  const keys = JSON.parse(g.ev('JSON.stringify(Object.keys(HS_SITES))'));
  assert.deepEqual(keys, keys.slice().sort(), 'sorted by id');
  assert.deepEqual(keys.filter(k => !g.ev(`isCity('${k}')`)), [], 'every site is a city on the map');
  // Population alone no longer makes a region.
  for (const c of ['nyc', 'mia', 'rio', 'lys']) assert.equal(g.ev(`hsSite('${c}')`), false, c);
  for (const c of ['lon', 'fra', 'sin', 'sao', 'jnb']) assert.equal(g.ev(`hsSite('${c}')`), true, c);
  // Campus towns: tiny, on the list, on the grid their data centers were built for.
  const towns = JSON.parse(g.ev("JSON.stringify(CITIES.filter(c=>c.campus).map(c=>c.id))"));
  assert.ok(towns.length >= 18, towns.join());
  for (const c of towns) {
    assert.equal(g.ev(`hsCampus('${c}')`), true, c);
    assert.ok(g.ev(`CITY.${c}.P`) <= 50, c + ' is a town');
    assert.equal(g.ev(`hsGrid('${c}')`), g.ev(`HS_SITES.${c}`), c);
    assert.ok(g.ev(`hsTown('${c}')`) < g.ev(`hsGrid('${c}')`) / 2, c + ' has power to spare');
  }
  for (const c of ['bdm', 'cbf', 'qcy', 'lla', 'ems']) assert.equal(g.ev(`hsSite('${c}')`), true, c);
  assert.equal(g.ev("hsGrid('rlp')"), 1500);
  assert.deepEqual(g.errors, []);
});

test('a region a save already has in a city off the list stays', () => {
  const g = start();
  g.ev("ACT.buildPop({city:'nyc'});S.hs.rg.nyc={t:1,ready:0,mw:HS_T[1].mw};compute()");
  g.ev("S=sanitize(JSON.parse(JSON.stringify(S)));compute()");
  assert.ok(g.ev('!!S.hs.rg.nyc'), 'kept');
  assert.equal(g.ev("hsSite('nyc')"), false, 'but no new one is offered');
  assert.deepEqual(g.errors, []);
});

test('China: a licensed partner from level 7, then regions behind a wall nothing crosses', () => {
  const g = start();
  assert.equal(g.ev("hsSite('pek')"), false);
  assert.ok(g.ev("hsWhy('CN')"), 'China cannot be launched yet');
  g.ev("ACT.hsLaunch({cc:'CN'})");
  assert.equal(g.ev('!!S.hs.cc.CN'), false);
  // Too early: nothing is filed or paid.
  let cash = g.ev('S.cash');
  g.ev('S.lvl=6;ACT.hsCnApply({})');
  assert.equal(g.ev('S.cnLic.state'), 'none');
  assert.equal(g.ev('S.cash'), cash);
  g.ev('S.lvl=7;ACT.hsCnApply({})');
  assert.equal(g.ev('S.cnLic.state'), 'pending');
  assert.equal(cash - g.ev('S.cash'), g.ev('HS_CN.lic'));
  assert.equal(g.ev("hsSite('pek')"), false, 'not before it is granted');
  g.ev("S.cnLic.ready=S.day+1;dayTick()");
  assert.equal(g.ev('S.cnLic.state'), 'ok');
  for (const c of ['pek', 'sha', 'zhy', 'zjk', 'gya']) assert.equal(g.ev(`hsSite('${c}')`), true, c);
  assert.equal(g.ev("hsWhy('CN')"), '');
  // Regions in Beijing, Shanghai and Seoul; China and Korea launched.
  g.ev("for(const c of ['pek','sha','icn'])ACT.buildPop({city:c});ACT.buyTransit({city:'pek',net:'ctc',tier:1});ACT.buyTransit({city:'sha',net:'ctc',tier:1});ACT.buyTransit({city:'icn',net:'ntt',tier:1})");
  g.ev("for(const c of ['pek','sha','icn']){ACT.hsRegion({city:c});if(S.hs.rg[c])S.hs.rg[c].ready=0;}ACT.hsLaunch({cc:'CN'});ACT.hsLaunch({cc:'KR'});compute()");
  assert.ok(g.ev('!!S.hs.rg.pek&&!!S.hs.rg.sha&&!!S.hs.rg.icn'));
  // Chinese users only in Chinese regions; nobody else in them.
  const cnParts = JSON.parse(g.ev('JSON.stringify(R.hs.cc.CN.parts.map(p=>p[0]))'));
  assert.ok(cnParts.length && cnParts.every(r => r === 'pek' || r === 'sha'), cnParts.join());
  for (const cc of Object.keys(JSON.parse(g.ev('JSON.stringify(R.hs.cc)'))).filter(k => k !== 'CN'))
    assert.ok(g.ev(`R.hs.cc.${cc}.parts.every(p=>!CITY[p[0]].cn)`), cc + ' stays outside');
  assert.equal(g.ev("hsResOk('KR','pek')"), false);
  assert.equal(g.ev("hsResOk('CN','icn')"), false);
  // No replica, lake or training run across; the replica picker refuses it too.
  assert.equal(g.ev("hsRepOf('pek')"), 'sha');
  assert.equal(g.ev("hsWall('icn',hsRepOf('icn'))"), false);
  assert.equal(g.ev('CITY[hsLakeAt(hsRgs())].cn'), undefined);
  g.ev("ACT.hsReplica({city:'icn',v:'pek'})");
  assert.notEqual(g.ev("S.hs.rep.icn"), 'pek');
  assert.ok(g.ev("(p=>!p||!hsWall(p.a,p.b))(hsClPick(hsRgs()))"));
  // The partner keeps its share.
  assert.ok(Math.abs(g.ev("cxMul('rev','CN')/cxMul('rev','KR')") - 0.65) < 1e-9);
  // Saves: kept with the licence, dropped without it.
  g.ev("const t=JSON.parse(JSON.stringify(S));S=sanitize(t);compute()");
  assert.ok(g.ev('!!S.hs.rg.pek&&!!S.hs.cc.CN'));
  g.ev("const u=JSON.parse(JSON.stringify(S));u.cnLic={state:'none'};S=sanitize(u);compute()");
  assert.equal(g.ev('!!S.hs.rg.pek||!!S.hs.cc.CN'), false);
  assert.deepEqual(g.errors, []);
});

test('the China cards say what the partner does, on a phone too', () => {
  const g = start();
  for (const w of [1280, 360]) {
    g.ev(`window.innerWidth=${w};selectCity('pek');UI.tab='cust';renderAll()`);
    const t = g.dom.window.document.getElementById('panelBody').textContent;
    assert.match(t, /licensed local partner/);
    assert.match(t, /level 7/);
  }
  g.ev("S.lvl=7;renderAll()");
  assert.match(g.dom.window.document.getElementById('panelBody').innerHTML, /data-act="hsCnApply"/);
  assert.deepEqual(g.errors, []);
});
