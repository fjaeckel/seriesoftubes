// The Caribbean (#125), the south-west Indian Ocean (#152), Pitcairn (#124), and Alaska, northern British Columbia
// and Russia's Arctic and Pacific coasts (#145).
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./harness');

function start(ev) { ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0"); }
const lands = (ev, cid, a, b) => ev(`CABLE_PAIRS.some(p=>p.cid==='${cid}'&&[p.a,p.b].sort().join()==='${[a, b].sort().join()}')`);
const wave = (ev, a, b, via) => ev(`UI.via=${via ? `'${via}'` : 'null'};UI.route='same';openLinkModal('${a}','${b}');ACT.buildLink({tier:2});closeModal();S.links.length`);

test('the Caribbean: islands on their own landmass, real landings, exchanges only where one runs (#125)', () => {
  const { ev, errors } = load();
  start(ev);
  const isl = ['sju', 'sdq', 'kin', 'hav', 'nas', 'pos', 'bgi', 'fdf', 'cur'];
  for (const c of isl) {
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
    assert.ok(ev(`isSub('${c}','mia')&&isSub('${c}','ccs')`), `${c} is an island`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
    assert.ok(ev(`onLand(CITY.${c}.x,CITY.${c}.y)`), `${c} is drawn on land`);
  }
  // PR-IX, the Jamaica exchange, TTIX and AMS-IX Caribbean; none in Santo Domingo (they are in Santiago), Havana,
  // Nassau, Bridgetown or Martinique
  assert.deepEqual(isl.filter(c => ev(`!!CITY.${c}.ix`)), ['sju', 'kin', 'pos', 'cur']);
  for (const c of ['sju', 'kin', 'pos', 'cur']) assert.ok(ev(`ixMembers('${c}').length`) >= 5, `${c} has members`);
  // Cuba's only cable comes from Venezuela, nothing from Florida
  assert.deepEqual(JSON.parse(ev("JSON.stringify([...new Set(CABLE_PAIRS.filter(p=>p.a==='hav'||p.b==='hav').map(p=>p.cid))])")), ['alba']);
  assert.ok(lands(ev, 'alba', 'ccs', 'hav') && lands(ev, 'arcos', 'mia', 'nas') && lands(ev, 'arcos', 'sju', 'cur') && lands(ev, 'am2', 'pos', 'for'));
  assert.ok(lands(ev, 'ecfs', 'fdf', 'bgi') && lands(ev, 'cfx', 'mia', 'kin') && lands(ev, 'ecl', 'cur', 'pos') && lands(ev, 'sam1', 'sju', 'sdq'));
  // old pairs stay where they were, so saved links keep their cable
  assert.equal(ev("CAB.sam1.pairs[0].slice(0,2).join()"), 'mia,for');
  // a hop through the islands carries traffic: Miami to San Juan to Curaçao
  for (const c of ['mia', 'sju', 'cur']) ev(`ACT.buildPop({city:'${c}'});S.pops.${c}.rgen=3`);
  wave(ev, 'mia', 'sju', 'am2'); wave(ev, 'sju', 'cur', 'arcos');
  ev('compute()');
  assert.equal(ev("S.links.filter(l=>l.sub).length"), 2, 'two subsea waves');
  ev('cam.z=0.5;draw(0);cam.z=5;cam.x=CITY.sju.x;cam.y=CITY.sju.y;draw(0)');
  assert.deepEqual(errors, []);
});

test('the south-west Indian Ocean: Réunion on SAFE, Mauritius, Madagascar and the Seychelles (#152)', () => {
  const { ev, errors } = load();
  start(ev);
  const isl = ['run', 'mru', 'tnr', 'sez'];
  for (const c of isl) {
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
    assert.ok(ev(`isSub('${c}','dur')&&isSub('${c}','mba')`), `${c} is an island`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  }
  assert.ok(ev("isSub('run','mru')&&isSub('run','tnr')"));
  // REUNIX, MIXP and MGIX run today; the Seychelles exchange is not on the books
  assert.deepEqual(isl.filter(c => ev(`!!CITY.${c}.ix`)), ['run', 'mru', 'tnr']);
  assert.equal(ev('CITY.run.ix'), 'Rougail SAUCIX');
  assert.ok(ev("['zeo','srr','cnp'].every(id=>ixMembers('run').includes(id))"), 'Zealot, Signal Frequently Ruined and Canal Minus on REUNIX');
  // SAFE gains its island landings and keeps its old pair
  assert.equal(ev("CAB.safe.pairs[0].slice(0,2).join()"), 'cpt,bom');
  assert.ok(lands(ev, 'safe', 'dur', 'run') && lands(ev, 'safe', 'run', 'mru') && lands(ev, 'lion', 'tnr', 'run') && lands(ev, 'metiss', 'dur', 'tnr'));
  assert.ok(lands(ev, 'seas', 'sez', 'dar') && lands(ev, 'peace', 'sez', 'mba') && lands(ev, 'eassy', 'mpm', 'tnr'));
  assert.ok(ev("NET.tng.pops.includes('run')&&NET.tng.pops.includes('tnr')"), 'Tangerine on the islands');
  ev('cam.z=5;cam.x=CITY.run.x;cam.y=CITY.run.y;draw(0)');
  assert.deepEqual(errors, []);
});

test('Pitcairn: no cable and no network, but you may land your own, and the UK pays while the islanders are online (#124)', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev("CABLE_PAIRS.some(p=>p.a==='pcn'||p.b==='pcn')"), false, 'no cable lands there');
  assert.equal(ev("NETS.some(n=>n.type!=='cdn'&&n.pops.includes('pcn'))"), false, 'no provider but you');
  assert.equal(ev("landing('pcn')"), true, 'a beach for your own cable');
  assert.ok(ev("isFinite(ownCabKm('ppt','pcn'))&&ownCabKm('ppt','pcn')<4000"), 'a sea route from Tahiti');
  // the grant needs a POP with broadband that is nearly fully served
  ev("ACT.buildPop({city:'pcn'});compute()");
  assert.equal(ev('R.rev.grant'), 0, 'no grant without broadband');
  ev("ACT.launchBB({city:'pcn'});compute()");
  const served = ev("sfOf(R,'pcn')");
  assert.equal(ev('R.rev.grant'), served >= 0.9 ? ev('GRANT_MO') : 0);
  // islanders served: the grant shows in the monthly revenue
  ev("R.citySrv.pcn=R.cityDem.pcn");
  assert.equal(ev("grantOn(R)"), true);
  ev("S.pops.pcn.down=S.day+3");
  assert.equal(ev("grantOn(R)"), false, 'not while the POP is down');
  ev("S.pops.pcn.down=0;UI.sel={type:'city',id:'pcn'};renderPanel()");
  assert.match(ev("document.body.innerHTML"), /UK grant/);
  assert.deepEqual(errors, []);
});

test('Alaska and northern British Columbia: towns with no road in are islands, and the Arctic fiber breaks in the ice (#145)', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['anc', 'jnu', 'ome', 'brw', 'dut', 'prr']) {
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
    assert.ok(ev(`onLand(CITY.${c}.x,CITY.${c}.y)`), `${c} is drawn on land`);
  }
  assert.equal(ev("isSub('anc','sea')"), false, 'Anchorage has a road south');
  assert.equal(ev("isSub('prr','van')"), false, 'so does Prince Rupert');
  // No road in, but US soil joined to Anchorage: a US network may dig there. Unalaska is an island.
  for (const c of ['jnu', 'ome', 'brw']) assert.equal(ev(`isSub('${c}','anc')`), false, `${c}: overland inside the US`);
  assert.ok(ev("isSub('dut','anc')"), 'dut: an island, only the sea');
  assert.ok(ev("isSub('jnu','van')"), 'Juneau to Canada: a border, so only the sea');
  assert.ok(lands(ev, 'qtl', 'ome', 'brw') && lands(ev, 'qtl', 'brw', 'anc') && lands(ev, 'aleu', 'anc', 'dut') && lands(ev, 'topaz', 'van', 'tok'));
  assert.equal(ev('CAB.qtl.fragile'), true, 'sea ice keeps the repair ships away');
  assert.equal(ev('CITY.anc.ix.length>0'), true, 'Anchorage has its exchange');
  assert.ok(ev("ixMembers('anc').includes('acs')"));
  assert.ok(ev("NET.gci.price>0&&['ome','brw','dut','jnu'].every(c=>NET.gci.pops.includes(c))"), 'Glacier sells transit across Alaska');
  ev('cam.z=4;cam.x=CITY.brw.x;cam.y=CITY.brw.y;draw(0)');
  assert.deepEqual(errors, []);
});

test("Russia's Arctic and Pacific: government boxes, real cables only, beaches where Polar Express never arrived (#145)", () => {
  const { ev, errors } = load();
  start(ev);
  const ru = ['mmk', 'dks', 'tik', 'pvs', 'dyr', 'pkc', 'gdx', 'uus', 'vvo'];
  for (const c of ru) {
    assert.ok(ev(`CITY.${c}.ru===true`), `${c} needs the government box`);
    assert.ok(ev(`onLand(CITY.${c}.x,CITY.${c}.y)`), `${c} is drawn on land`);
    assert.ok(ev(`NET.rtc.pops.includes('${c}')`), `${c} has Rostelecomedy`);
  }
  // Polar Express only got as far as Amderma: its towns have no cable, but a beach for your own
  for (const c of ['mmk', 'dks', 'tik', 'pvs']) {
    assert.equal(ev(`cablesFor('${c}','vvo').length+CABLE_PAIRS.filter(p=>p.a==='${c}'||p.b==='${c}').length`), 0, `${c}: no cable yet`);
    assert.ok(ev(`landing('${c}')`), `${c}: you may land one`);
  }
  assert.ok(lands(ev, 'chuk', 'pkc', 'dyr') && lands(ev, 'skm', 'uus', 'pkc') && lands(ev, 'skm', 'uus', 'gdx') && lands(ev, 'rjcn', 'vvo', 'tok') && lands(ev, 'hscs', 'uus', 'tok'));
  // nothing crosses the Bering Strait
  assert.equal(ev("CABLE_PAIRS.some(p=>CITY[p.a].ru!==CITY[p.b].ru&&(CITY[p.a].cc==='US'||CITY[p.b].cc==='US'))"), false);
  assert.equal(ev("isSub('dyr','anc')"), true);
  // Kamchatka has no road to the rest of Russia, but it is Russian soil: a Russian route may dig there. Sakhalin is an island.
  assert.equal(ev("isSub('pkc','vvo')"), false);
  assert.equal(ev("isSub('uus','vvo')"), true);
  assert.equal(ev("isSub('gdx','vvo')||isSub('mmk','mos')"), false);
  assert.ok(ev("CITY.vvo.ix.length>0&&ixMembers('vvo').includes('mgf')&&ixMembers('vvo').includes('ert')"), 'the Vladivostok exchange');
  // a sovereign-internet drill cuts the cable to Japan like any other border link
  ev("ACT.buildPop({city:'vvo'});ACT.buildPop({city:'tok'});S.pops.vvo.rgen=3;S.pops.tok.rgen=3");
  wave(ev, 'vvo', 'tok', 'rjcn');
  ev("S.ev.runet=S.day+5;compute()");
  assert.equal(ev("linkDown(S.links.find(l=>l.a==='vvo'||l.b==='vvo'))"), true);
  ev('cam.z=4;cam.x=CITY.pkc.x;cam.y=CITY.pkc.y;draw(0)');
  assert.deepEqual(errors, []);
});

test('saves with POPs in the new places survive a save and reload', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['sju', 'run', 'anc', 'vvo', 'pcn']) ev(`ACT.buildPop({city:'${c}'})`);
  ev("const o=JSON.parse(JSON.stringify(S));S=migrate(o);compute()");
  assert.ok(ev("['sju','run','anc','vvo','pcn'].every(c=>!!S.pops[c])"));
  assert.deepEqual(errors, []);
});
