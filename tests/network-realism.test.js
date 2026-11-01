const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('new games need the expanded Tier 1 club and older saves keep their club', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  for (const id of ['gtt', 'zay', 'pcw', 'tlx']) {
    assert.ok(ev(`t1Need().some(n=>n.id==='${id}')`));
    assert.equal(ev(`peerOk('${id}','ix','fra').ok`), false, 'restrictive carriers do not offer route-server peering');
  }
  for (const [version, count] of [[5, 16], [4, 9], [3, 7], [2, 6], [1, 5]]) {
    ev(`S.t1v=${version};S=migrate(JSON.parse(JSON.stringify(S)))`);
    assert.equal(ev('t1Need().length'), count);
    assert.equal(ev("t1Need().some(n=>['gtt','zay','pcw','tlx'].includes(n.id))"), version >= 5);
    assert.equal(ev("t1Need().some(n=>n.id==='cog')"), true);
  }
  assert.deepEqual(errors, []);
});

test('a new backbone sells transit and private peering carries its downstreams', () => {
  const { ev, errors } = load();
  ev("beginGame('Research','fra',{mode:'sandbox'});ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'gtt',tier:1});compute()");
  assert.equal(ev('S.transit.length'), 1);
  assert.ok(ev('R.reach') > 0.999);
  assert.ok(ev('R.served') > 0);
  ev("S.pops.fra.bb.d=400;S.pni.push({id:'pcw-test',net:'pcw',city:'fra',tier:1});compute()");
  for (const id of ['fpt', 'ptc']) assert.ok(ev(`R.nt.${id}`), `${id} is reached through the carrier's cone`);
  ev('S.pni=[];compute()');
  assert.equal(ev('!!R.nt.fpt'), false);
  assert.deepEqual(errors, []);
});

test('Hanoi and Lahore work as homes with local transit and peering', () => {
  for (const [city, carrier] of [['han', 'fpt'], ['lhe', 'ptc']]) {
    const { ev, errors } = load();
    assert.ok(ev(`homeOk('${city}')`));
    ev(`beginGame('Local','${city}',{mode:'sandbox'});ACT.launchBB({city:'${city}'});ACT.buyTransit({city:'${city}',net:'${carrier}',tier:1});compute()`);
    assert.equal(ev('S.home'), city);
    assert.equal(ev('S.transit.length'), 1);
    assert.ok(ev('R.served') > 0);
    assert.ok(ev('R.reach') > 0.999);
    ev(`ACT.buyIx({city:'${city}',tier:1,signed:true});ACT.rs({city:'${city}'});compute()`);
    assert.ok(ev(`ixSessions('${city}').has('cfl')`), 'the local edge joins the route server');
    assert.ok(ev('(R.netEg.cfl||{}).ix>0'));
    if (city === 'han') assert.ok(ev("ixSessions('han').has('fpt')"));
    else assert.equal(ev("onIx(NET.ptc,'lhe')"), false, 'a facility listing is not an exchange port');
    assert.deepEqual(errors, []);
  }
});

test('broad peering policies do not create exchange presence in other cities', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  assert.equal(ev("onIx(NET.fbk,'rai')"), false);
  assert.equal(ev("ixMembers('rai').includes('fbk')"), false);
  assert.equal(ev("onIx(NET.fbk,'fra')"), true);
  assert.equal(ev("ixMembers('fra').includes('fbk')"), true);
  assert.equal(ev("XIX.filter(x=>!x.core).some(x=>x.members.some(id=>NET[id].ix==='ALL'&&!NET[id].pops.includes(x.c)))"), false, 'rival exchanges use the same presence rule');
  assert.equal(ev("onIx(NET.cfl,'han')&&onIx(NET.cfl,'lhe')"), true);
  assert.equal(ev("NET.cfl.pops.includes('pcn')||NET.cfl.pops.includes('pek')"), false);
  assert.deepEqual(errors, []);
});

test('new upstreams reach local networks without adding Australian transit sellers', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  assert.ok(ev("CONE_S.tly.has('atl')&&CONE_S.pcw.has('fpt')"));
  assert.equal(ev("NET.atl.pol"), 'open');
  assert.equal(ev("NETS.filter(n=>['gtt','zay','pcw','tlx','gsl'].includes(n.id)).some(n=>sellsAt(n,'syd'))"), false);
  assert.deepEqual(errors, []);
});

test('older saves get courtesy routes to additions and keep existing subscriptions', () => {
  const { ev, errors } = load();
  ev("beginGame('Old','khi',{mode:'sandbox'});ACT.launchBB({city:'khi'});S.pops.khi.bb.d=321;S.t1v=3;S.day=40;S.seen=S.seen.filter(id=>!['fpt','gtt','pcw','rtn','tlx','zay'].includes(id));S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(ev('S.pops.khi.bb.d'), 321);
  assert.equal(ev('t1Need().length'), 7);
  assert.equal(ev('S.grace.nets.length'), 6);
  for (const id of ['fpt', 'gtt', 'pcw', 'rtn', 'tlx', 'zay']) assert.ok(ev(`R.reachable.${id}`), `${id} gets a courtesy route`);
  assert.deepEqual(errors, []);
});

test('Unitea and Wind-Three keep separate ASNs and domestic markets', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("ACT.start({})");
  assert.equal(ev('NET.wds.asn'), 7029);
  assert.equal(ev('NET.wnd.asn'), 1267);
  assert.ok(ev("sellsAt(NET.wds,'dal')&&!sellsAt(NET.wds,'mil')"));
  assert.ok(ev("ixMembers('nyc').includes('wds')&&ixMembers('mil').includes('wnd')"));
  for (const c of ['fln', 'rao', 'sjp']) assert.ok(ev(`NET.cfl.pops.includes('${c}')`));
  assert.deepEqual(errors, []);
});

test('the Tier 1 roster keeps Cogentle and distinguishes Drizzle Electric IPv6 status', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev('ACT.start({})');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(t1Need().map(n=>n.asn).sort((a,b)=>a-b))')), [174, 701, 1299, 2914, 3257, 3320, 3356, 3491, 5511, 6453, 6461, 6762, 6830, 6939, 7018, 12956]);
  assert.equal(ev('NET.cog.type'), 't1');
  assert.equal(ev('NET.drz.t1v6'), true);
  assert.equal(ev('netTier(NET.drz)'), 'Tier 1 (IPv6)');
  assert.equal(ev('NET.drz.up.join()'), 'tly', 'IPv4 transit stays in the AS graph');
  assert.equal(ev("pniMin('drz')"), 0, 'open peering still offers 10G');
  assert.equal(ev("peerOk('drz','ix','fra').ok"), true);
  assert.deepEqual(errors, []);
});

test('national transit stays domestic and satellite access never becomes a transit seller', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev('ACT.start({})');
  assert.equal(ev("CITIES.some(c=>sellsAt(NET.stb,c.id))"), false);
  for (const id of ['bht', 'ptc', 'fpt', 'ypt', 'cmb']) assert.equal(ev(`CITIES.some(c=>c.cc!==NET.${id}.cc&&sellsAt(NET.${id},c.id))`), false, id);
  assert.ok(ev("NET.bht.pops.includes('del')&&!sellsAt(NET.bht,'del')"), 'an overseas peering PoP is not a retail transit market');
  assert.ok(ev("NET.twa.wholesale&&NSH.twa===0&&COUNTRY_EYES.PK.twa===undefined&&COUNTRY_EYES.PK.twh>0"));
  assert.ok(ev("CONE_S.twa.has('twh')&&sellsAt(NET.twa,'khi')"), 'the wholesale carrier reaches its access subsidiary');
  assert.deepEqual(errors, []);
});

test('major local access networks have interconnection presence in their home cities', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  for (const [city, ids] of [['aus', ['gfb', 'spc', 'att']], ['cvg', ['cib', 'spc', 'att']], ['fsd', ['mdc']], ['ind', ['mgn']], ['van', ['nvs', 'rgc', 'tlu']], ['yyt', ['bcd', 'rgc']]]) {
    for (const id of ids) assert.ok(ev(`NET.${id}.pops.includes('${city}')`), `${id} can interconnect in ${city}`);
  }
  assert.deepEqual(errors, []);
});
