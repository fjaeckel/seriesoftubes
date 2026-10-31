// The Philippines: Manila's exchanges and networks, Cebu, Davao and the cables that really land there.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./harness');

function start(ev) { ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0"); }
const ids = (ev, js) => JSON.parse(ev(`JSON.stringify(${js})`));

test('Manila: GotchaFIX, Bayanihan-IX and the incumbent-run In-Vitro-IX', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev('CITY.mnl.ix'), 'GotchaFIX Manila');
  assert.equal(ev("XIXM['mnl~2'].name"), 'Bayanihan-IX');
  assert.equal(ev("XIXM['mnl~3'].name"), 'In-Vitro-IX');
  // the neutral exchange has the open networks, not the PLDT family
  const gotcha = ids(ev, "ixMembers('mnl')");
  for (const n of ['glb', 'cvg', 'dto']) assert.ok(gotcha.includes(n), `${n} on GotchaFIX`);
  assert.ok(!gotcha.includes('pld') && !gotcha.includes('smt'));
  assert.ok(gotcha.length >= 10, `GotchaFIX has ${gotcha.length} members`);
  // the incumbent's own exchange is PLDT and its mobile arm
  const vitro = ids(ev, "ixMembers('mnl~3')");
  assert.ok(vitro.includes('pld') && vitro.includes('smt'));
  assert.ok(ids(ev, "ixMembers('mnl~2')").includes('dto'));
  // GetaFIX's price list: 10G for $700 and 100G for $2,800 a month, within a few percent
  for (const c of ['mnl', 'ceb', 'dvo']) {
    ev(`ACT.buildPop({city:'${c}'})`);
    assert.ok(Math.abs(ev(`ixPortMo('${c}',0)`) - 700) <= 35, `${c} 10G is ${ev(`ixPortMo('${c}',0)`)}`);
    assert.ok(Math.abs(ev(`ixPortMo('${c}',1)`) - 2800) <= 140, `${c} 100G is ${ev(`ixPortMo('${c}',1)`)}`);
  }
  // the community exchange is the cheapest port in town, the incumbent's the dearest
  assert.ok(ev("ixMul('mnl~2')<ixMul('mnl')&&ixMul('mnl')<ixMul('mnl~3')"));
  // the incumbent charges double GotchaFIX's price
  assert.equal(ev("ixPortMo('mnl~3',0)"), 1760);
  assert.equal(ev("ixPortMo('mnl~3',1)"), 6600);
  assert.deepEqual(errors, []);
});

test('Manila: PLDTea Time and Globe-Trotter Telecom sell transit; a PLDT PNI also reaches Smarty Pants', () => {
  const { ev, errors } = load();
  start(ev);
  assert.ok(ev("sellsAt(NET.pld,'mnl')&&sellsAt(NET.glb,'mnl')"));
  assert.ok(ev("!sellsAt(NET.cvg,'mnl')&&!sellsAt(NET.dto,'mnl')&&!sellsAt(NET.smt,'mnl')"));
  assert.deepEqual(ids(ev, 'PNI_NETS.pld').sort(), ['pld', 'smt']);
  assert.equal(ev('NET.pld.pol'), 'selective');
  assert.equal(ev('NET.cvg.pol') + ev('NET.dto.pol'), 'openopen');
  assert.equal(ev('NET.glb.pol'), 'selective', 'Globe-Trotter Telecom stays selective');
  assert.deepEqual(errors, []);
});

test('Manila: an exchange the player founded there before GotchaFIX existed keeps working', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buildPop({city:'mnl'});S.myIx.mnl={name:'Mine-IX Manila',members:['dto','tail0'],next:0};S.ixp.mnl=2");
  ev('const o=JSON.parse(JSON.stringify(S));sanitize(o);window.__o=o');
  assert.equal(ev('__o.myIx.mnl.name'), 'Mine-IX Manila');
  ev('S=__o;after()');
  assert.equal(ev("ixName('mnl')"), 'Mine-IX Manila');
  assert.deepEqual(ids(ev, "ixMembers('mnl')"), ['dto', 'tail0']);
  // and nobody can found a second one now that a real exchange runs in Manila
  ev("delete S.myIx.mnl;delete S.ixp.mnl;ACT.foundIx({city:'mnl'})");
  assert.ok(ev('!S.myIx.mnl'));
  assert.deepEqual(errors, []);
});

test('Manila: RISE & Shine peers openly on all three Manila exchanges, across Asia and in Europe', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev('NET.rsh.name'), 'RISE & Shine');
  assert.equal(ev('NET.rsh.pol'), 'open');
  // GetaFIX Manila, PhOpenIX and VIX, Singapore, Hong Kong, DE-CIX, AMS-IX, LINX, Netnod. Tokyo and Los Angeles are left
  // out: an open eyeball network there makes the Stepping Stones scenario too easy.
  for (const x of ['mnl', 'mnl~2', 'mnl~3', 'sin', 'sin~2', 'hkg', 'hkg~2', 'fra', 'ams', 'lon', 'sto'])
    assert.ok(ids(ev, `ixMembers('${x}')`).includes('rsh'), `RISE & Shine on ${x}`);
  assert.deepEqual(errors, []);
});

test('Cebu: its own island, GotchaFIX Cebu, reached by two domestic cables, in the typhoon belt', () => {
  const { ev, errors } = load();
  start(ev);
  assert.ok(ev("isSub('ceb','mnl')"), 'Cebu is an island');
  assert.ok(ev('onLand(CITY.ceb.x,CITY.ceb.y)'), 'Cebu is drawn on land');
  assert.equal(ev('CITY.ceb.ix'), 'GotchaFIX Cebu');
  assert.equal(ev('CITY.ceb.dc'), "Magellan's Last Rack");
  assert.deepEqual(ids(ev, "cablesFor('mnl','ceb').map(p=>p.cid)").sort(), ['dfon', 'pdscn']);
  for (const n of ['pld', 'glb']) assert.ok(ev(`sellsAt(NET.${n},'ceb')`), `${n} sells transit in Cebu`);
  assert.ok(ev("NET.cvg.pops.includes('ceb')"));
  // a subsea wave from Manila to Cebu carries traffic
  for (const c of ['mnl', 'ceb']) ev(`ACT.buildPop({city:'${c}'});S.pops.${c}.rgen=3`);
  ev("UI.via='pdscn';UI.route='same';openLinkModal('mnl','ceb');ACT.buildLink({tier:2});closeModal()");
  ev('compute()');
  assert.equal(ev("S.links.filter(l=>l.sub&&l.cable==='pdscn').length"), 1);
  // typhoons can now hit a Cebu PoP
  ev("S.pops={ceb:S.pops.ceb};delete S.pops.ceb.gen;for(let i=0;i<2000&&!(S.pops.ceb.down>S.day);i++)fireEvent()");
  assert.ok(ev("S.pops.ceb.down>S.day&&S.inc.some(i=>i.type==='power'&&i.ref==='ceb')"), 'a typhoon knocked out Cebu');
  ev('cam.z=5;cam.x=CITY.ceb.x;cam.y=CITY.ceb.y;draw(0)');
  assert.deepEqual(errors, []);
});

test('Davao: Mindanao, GotchaFIX Davao, the trans-Pacific landings moved from Manila, and cables from Cebu', () => {
  const { ev, errors } = load();
  start(ev);
  assert.ok(ev("isSub('dvo','mnl')&&isSub('dvo','ceb')"), 'Davao is on Mindanao');
  assert.ok(ev('onLand(CITY.dvo.x,CITY.dvo.y)'), 'Davao is drawn on land');
  assert.equal(ev('CITY.dvo.ix'), 'GotchaFIX Davao');
  assert.equal(ev('CITY.dvo.dc'), "Heimdall's Hut");
  // Bi-Frosted's Philippine branch and SEA-US land at Davao, not Manila
  const at = (cid, c) => ids(ev, `CABLE_PAIRS.filter(p=>p.cid==='${cid}'&&(p.a==='${c}'||p.b==='${c}')).map(p=>p.a==='${c}'?p.b:p.a)`).sort();
  assert.deepEqual(at('bifrost', 'mnl'), []);
  assert.deepEqual(at('bifrost', 'dvo'), ['gum', 'jkt']);
  assert.deepEqual(at('seaus', 'mnl'), []);
  assert.deepEqual(at('seaus', 'dvo'), ['gum']);
  assert.ok(ev("cablesFor('jkt','gum').some(p=>p.cid==='bifrost')&&cablesFor('gum','lax').some(p=>p.cid==='bifrost')"), 'the trunk stays');
  assert.deepEqual(ids(ev, "cablesFor('ceb','dvo').map(p=>p.cid)").sort(), ['dfon', 'pdscn', 'vismin']);
  // PDSCN's Luzon–Mindanao segment runs the whole way, so Manila reaches Davao in one hop
  assert.deepEqual(ids(ev, "cablesFor('mnl','dvo').map(p=>p.cid)"), ['pdscn']);
  for (const n of ['pld', 'glb']) assert.ok(ev(`sellsAt(NET.${n},'dvo')`), `${n} sells transit in Davao`);
  assert.ok(ev("NET.cvg.pops.includes('dvo')"));
  ev('cam.z=5;cam.x=CITY.dvo.x;cam.y=CITY.dvo.y;draw(0)');
  assert.deepEqual(errors, []);
});

test('Davao: a saved link on a Bi-Frosted or SEA-US pair that moved keeps working, without the cable', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['mnl', 'jkt', 'hkg']) ev(`ACT.buildPop({city:'${c}'});S.pops.${c}.rgen=3`);
  ev("UI.via='sjcph';UI.route='same';openLinkModal('mnl','hkg');ACT.buildLink({tier:2});closeModal()");
  ev("UI.via='sjcph';UI.route='same';openLinkModal('mnl','hkg');ACT.buildLink({tier:2});closeModal()");
  assert.equal(ev('S.links.length'), 2);
  // as an old save had them: Bi-Frosted Jakarta–Manila and an untouched Manila–Hong Kong link
  ev("const l=S.links[0];l.a='jkt';l.b='mnl';l.km=kmBetween('jkt','mnl');l.cable='bifrost'");
  ev('const o=JSON.parse(JSON.stringify(S));sanitize(o);window.__o=o');
  assert.equal(ev('__o.links.length'), 2, 'the link survives');
  assert.equal(ev("__o.links.find(l=>l.a==='jkt').cable"), null, 'its cable tag is dropped');
  assert.equal(ev("__o.links.find(l=>l.b==='hkg').cable"), 'sjcph', 'a pair that still exists keeps its cable');
  ev('S=__o;after();compute()');
  ev('cam.z=1;draw(0)');
  assert.deepEqual(errors, []);
});

test('Cebu and Davao: RISE & Shine is on GotchaFIX Cebu and GotchaFIX Davao', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['ceb', 'dvo']) assert.ok(ids(ev, `ixMembers('${c}')`).includes('rsh'), `RISE & Shine on ${c}`);
  assert.deepEqual(errors, []);
});

test('the Philippines: transit about 1.9 times the Asian rate, homes pay about US$25 a month', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['mnl', 'ceb', 'dvo']) {
    assert.equal(ev(`regionMult('${c}')`), ev('PH_TRANSIT'), `${c} pays the Philippine transit rate`);
    assert.equal(ev(`CITY.${c}.arpu`), ev('PH_ARPU'));
  }
  // Manila's 100 GigE transit is about 1.9 times Jakarta's
  assert.ok(Math.abs(ev("regionMult('mnl')/regionMult('jkt')") - 1.9) < 0.1);
  assert.equal(ev("regionMult('sin')"), 2.5, 'the rest of Asia is unchanged');
  // the same transit port costs more in Manila than in Jakarta
  ev("ACT.buildPop({city:'mnl'});ACT.buildPop({city:'jkt'})");
  assert.ok(ev("transitMo({net:'sgt',city:'mnl',tier:1},10)>transitMo({net:'sgt',city:'jkt',tier:1},10)"));
  assert.deepEqual(errors, []);
});

test('Philippines: waves between the islands cost more than waves out of the country', () => {
  const { ev, errors } = load();
  start(ev);
  // cheapest 10G wave on any cable between two cities
  const w = (a, b) => ev(`Math.min(...cablesOk('${a}','${b}').map(c=>waveMo(c.km,true,0)*CAB[c.cid].price*waveMarket('${a}','${b}',true).m))`);
  assert.equal(ev("waveMarket('mnl','ceb',true).reg"), ev('PH_WAVE'));
  assert.equal(ev("waveMarket('mnl','hkg',true).reg"), 1.5, 'international routes keep the Asian rate');
  const ratio = w('mnl', 'ceb') / w('mnl', 'hkg');
  assert.ok(ratio > 1.8 && ratio < 2.2, `Manila–Cebu is ${ratio.toFixed(2)} times Manila–Hong Kong`);
  assert.ok(w('ceb', 'dvo') > w('mnl', 'hkg'), 'even the short Cebu–Davao hop costs more than Hong Kong');
  assert.deepEqual(errors, []);
});

test('Philippines: eyeballs at about 40G per million people, like the rest of the map', () => {
  const { ev, errors } = load();
  // Demographia 2022 urban area for Manila, the 2020 census for Metro Cebu and Metro Davao
  for (const [c, millions] of [['mnl', 24.9], ['ceb', 3.17], ['dvo', 3.34]]) {
    const perM = ev(`CITY.${c}.P`) / millions;
    assert.ok(perM > 37 && perM < 43, `${c} has ${perM.toFixed(1)}G per million people`);
  }
  assert.deepEqual(errors, []);
});
