const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

function setup(provider) {
  const g = load();
  g.ev(`beginGame('Routes','fra',{mode:'sandbox'});ACT.launchBB({city:'fra'});S.pops.fra.rgen=3;S.pops.fra.routers=3;S.pops.fra.bb.d=100;ACT.buyTransit({city:'fra',net:'${provider}',tier:4});compute()`);
  return g;
}

test('every country keeps the observed Radar ratios between represented access operators', () => {
  const { ev, dom, errors } = load();
  try {
    const rows = fs.readFileSync(path.join(__dirname, 'fixtures', 'eyeball-shares.csv'), 'utf8').trim().split('\n').slice(1);
    const countries = new Set();
    for (const row of rows) {
      const [cc, id, asns, share] = row.split(',');
      countries.add(cc);
      assert.ok(asns.split('|').every(a => Number(a) > 0));
      assert.ok(Math.abs(ev(`COUNTRY_EYES.${cc}.${id}`) - Number(share) / 100) < 1e-9, `${cc}/${id} retains its observation`);
    }
    assert.deepEqual(JSON.parse(ev('JSON.stringify([...new Set(CITIES.map(c=>c.cc))].sort())')), JSON.parse(ev('JSON.stringify(Object.keys(COUNTRY_EYES).sort())')));
    assert.deepEqual(JSON.parse(ev('JSON.stringify(Object.keys(COUNTRY_EYES).filter(cc=>!Object.keys(COUNTRY_EYES[cc]).length))')), ['KP'], 'the tiny North Korean sample has no observed access ASN');
    assert.equal(countries.size, ev('Object.keys(COUNTRY_EYES).length') - 1);
    for (const cc of countries) {
      const shares = JSON.parse(ev(`JSON.stringify(NSH_CC.${cc})`));
      assert.ok(Math.abs(Object.values(shares).reduce((a, b) => a + b, 0) - 1) < 1e-9, cc);
      const observed = JSON.parse(ev(`JSON.stringify(COUNTRY_EYES.${cc})`));
      const [first] = Object.keys(observed);
      for (const id in observed) assert.ok(Math.abs(shares[id] / shares[first] - observed[id] / observed[first]) < 1e-9, `${cc}/${id} keeps its relative share`);
    }
    const budget = ev('NETS.filter(n=>n.cc).reduce((a,n)=>a+NSH[n.id],0)');
    for (const cc of countries) {
      assert.ok(Math.abs(ev(`Object.keys(COUNTRY_EYES.${cc}).reduce((a,id)=>a+(NSH_CC.${cc}[id]||0),0)`) - budget) < 1e-9, `${cc} assigns the whole access budget locally`);
      assert.equal(ev(`NETS.some(n=>n.cc&&COUNTRY_EYES.${cc}[n.id]===undefined&&(NSH_CC.${cc}[n.id]||0)>0)`), false, `${cc} has no invented foreign access demand`);
    }
    assert.ok(ev('NSH_CC.BD.rob>NSH_CC.BD.gph'));
    assert.ok(ev('NSH_CC.VN.vtl>NSH_CC.VN.vnp&&NSH_CC.VN.vnp>NSH_CC.VN.fpt'));
    assert.equal(ev('COUNTRY_EYES.FI.hzn'), undefined, 'hosting traffic is not assigned to residential access');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('single-provider IPv6 partitions lose real traffic while IPv4 stays reachable', () => {
  for (const provider of ['cog', 'drz']) {
    const { ev, dom, errors } = setup(provider);
    try {
      assert.ok(ev('R.reach4') > 0.999);
      assert.ok(ev('R.reach6<R.reach4&&R.reach===R.reach6'));
      assert.ok(ev('R.served<R.demand'));
      assert.ok(ev(`R.v6Gap.fra.includes('${provider === 'cog' ? 'drz' : 'cog'}')`));
      assert.match(ev("cityPanel('fra')"), /IPv6 partition/);
      const side = provider === 'cog' ? 2 : 1;
      const blocked = ev(`NETS.find(n=>n.tail&&V6_SIDE[n.id]===${side}).id`);
      assert.ok(Math.abs(ev(`R.netEg.${blocked}.t/R.demTo.${blocked}`) - ev('1-IPV6_CC.DE')) < 1e-9);
      assert.deepEqual(errors, []);
    } finally { dom.window.close(); }
  }
});

test('exclusive downstreams inherit the IPv6 split and multi-homing or peering repairs it', () => {
  const { ev, dom, errors } = setup('drz');
  try {
    const customer = ev("NETS.find(n=>n.tail&&V6_SIDE[n.id]===1).id");
    assert.ok(ev(`R.v6Gap.fra.includes('${customer}')`));
    assert.equal(ev('!!V6_SIDE.pes'), false, 'customers with a second carrier keep a route');
    ev("S.pni.push({id:'direct-cog',net:'cog',city:'fra',tier:4});compute()");
    assert.equal(ev('R.v6Gap.fra'), undefined);
    assert.ok(ev('R.reach6') > 0.999);
    assert.ok(Math.abs(ev('R.served+R.gfwLost-R.demand')) < 1e-7);
    ev("S.pni=[];ACT.buyTransit({city:'fra',net:'lvl',tier:4});compute()");
    assert.equal(ev('R.v6Gap.fra'), undefined);
    assert.ok(Math.abs(ev('R.served+R.gfwLost-R.demand')) < 1e-7);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('another disconnected PoP cannot hide an IPv6 partition', () => {
  const { ev, dom, errors } = setup('cog');
  try {
    ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;S.pops.ams.routers=3;ACT.buyTransit({city:'ams',net:'lvl',tier:4});compute()");
    assert.equal(ev('S.transit.length'), 2);
    assert.ok(ev('!!R.v6Gap.fra&&!R.v6Gap.ams'));
    ev("S.links.push({id:'join',a:'fra',b:'ams',kind:'wave',tier:4,km:400,ready:0,cut:0});compute()");
    assert.equal(ev('R.v6Gap.fra'), undefined);
    ev('S.links[0].cut=S.day+2;compute()');
    assert.ok(ev('!!R.v6Gap.fra&&!R.v6Gap.ams'));
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('transit picks one provider per destination, with customer paths and preferences first', () => {
  const { ev, dom, errors } = setup('lvl');
  try {
    ev("ACT.buyTransit({city:'fra',net:'tly',tier:4});compute()");
    const one = ev('S.transit[0].id'), two = ev('S.transit[1].id');
    const dest = ev("NETS.find(n=>n.tail&&CONE_S.drz.has(n.id)&&transitHops('tly',n.id)<transitHops('lvl',n.id)).id");
    for (const id of JSON.parse(ev('JSON.stringify(NET_IDS)'))) assert.ok(!(ev(`R.tNet['${one}']?.['${id}']`) > 0 && ev(`R.tNet['${two}']?.['${id}']`) > 0), `${id} uses one provider`);
    assert.ok(ev(`R.tNet['${two}'].${dest}>0`), 'the provider with the customer route wins');
    ev("S.transit[0].pref='high';compute()");
    assert.ok(ev(`R.tNet['${one}'].${dest}>0`), 'explicit preference wins over AS path');
    assert.equal(ev(`R.tNet['${two}']?.${dest}||0`), 0);
    ev('S.transit[0].down=S.day+2;compute()');
    assert.ok(ev(`R.tNet['${two}'].${dest}>0`), 'a withdrawn route fails over');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('a congested preferred provider does not spill onto another carrier', () => {
  const { ev, dom, errors } = setup('lvl');
  try {
    ev("S.transit[0].tier=0;S.transit[0].pref='high';S.pops.fra.bb.d=1000;ACT.buyTransit({city:'fra',net:'tly',tier:4});compute()");
    assert.equal(ev('R.useT[S.transit[1].id]||0'), 0);
    assert.ok(ev('R.served<R.demand'));
    ev('S.transit[0].down=S.day+2;compute()');
    assert.ok(ev('R.useT[S.transit[1].id]') > 0);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('an IPv6 gap cannot round up to full connectivity or qualify for Tier 1', t => {
  const { ev, dom, errors } = setup('cog');
  t.after(() => dom.window.close());
  ev('renderHUD()');
  assert.equal(dom.window.document.getElementById('hReach').textContent, 'Partial');
  ev("S.transit=[];S.pni=t1Need().map(n=>({id:n.id,net:n.id,city:'fra',tier:1}));R.reach=1;R.v6Gap={fra:['drz']}");
  assert.equal(ev('isTier1()'), false, 'zero-demand carriers still matter for complete IPv6 reach');
  assert.equal(ev('t1Why()'), 'IPv6 partition');
  ev('R.v6Gap={}');
  assert.equal(ev('isTier1()'), true);
  assert.deepEqual(errors, []);
});
