const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function start(ev) { ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0"); }

test('new cities exist, sit on land and have sellers, cables and IX members', () => {
  const { ev, errors } = load();
  start(ev);
  const ids = ['for', 'rio', 'bue', 'scl', 'lim', 'bog', 'pan', 'del', 'maa', 'blr', 'hyd', 'tpe', 'auh', 'fuj', 'cpt'];
  for (const c of ids) assert.ok(ev(`!!CITY['${c}']`), c);
  // PeeringDB decides who sells where; these are known to have sellers
  for (const c of ['for', 'bue', 'scl', 'lim', 'bog', 'pan', 'del', 'tpe', 'fuj', 'cpt'])
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  for (const c of ['for', 'rio', 'bue', 'scl', 'lim', 'bog', 'pan', 'maa', 'tpe', 'fuj', 'cpt'])
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
  assert.ok(ev("ixMembers('sao').length>20&&ixMembers('tpe').includes('cht')"));
  assert.ok(ev("CABLE_PAIRS.some(p=>(p.a==='scl'&&p.b==='syd')||(p.a==='syd'&&p.b==='scl'))"), 'Humboldt-ish cable to Sydney');
  assert.deepEqual(errors, []);
});

test('South America: no land route over the Darién Gap, the Andes cost double, IX.brrr is cheap', () => {
  const { ev } = load();
  start(ev);
  assert.equal(ev("isSub('pan','bog')"), true, 'Panama to Bogotá is subsea');
  assert.equal(ev("isSub('mia','sao')"), true);
  assert.equal(ev("isSub('bue','sao')"), false);
  assert.equal(ev("landMult('scl','bue')"), 2);
  assert.equal(ev("landMult('bue','sao')"), 1);
  assert.match(ev("landWhy('scl','bue')"), /Andes/);
  assert.equal(ev("regionMult('sao')"), 1.6);
  ev("ACT.buildPop({city:'sao'})");
  assert.ok(ev("ixPortMo('sao',1)") < ev("PORT[1].ix*0.5"), 'nonprofit IX ports are cheap');
  ev("selectCity('sao');ACT.tab({t:'peer'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Run by a nonprofit/);
});

test('Brazilian POPs attract provedores', () => {
  const { ev } = load();
  start(ev);
  ev("ACT.buildPop({city:'rio'})");
  const seen = JSON.parse(ev("(()=>{const o=[];for(let i=0;i<300;i++){S.offers=[];spawnOffer();o.push(...S.offers.filter(x=>x.type==='provedor').map(x=>x.city));}return JSON.stringify(o)})()"));
  assert.ok(seen.length > 0, 'provedor offers appear');
  assert.ok(seen.every(c => c === 'rio'), 'only in Brazilian POPs');
});

test('UAE: duopoly fiber only, no dark fiber, free-zone license', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev("dfAllowed('dxb','auh')"), false);
  assert.equal(ev("dfAllowed('dxb','bom')"), true);
  assert.equal(ev("landMult('dxb','fuj')"), 3);
  assert.equal(ev("popCost('auh')-popCost('fra')"), ev('UAE_LIC'));
  ev("ACT.buildPop({city:'dxb'});UI.lmode='df';openLinkModal('dxb','auh')");
  assert.match(ev("document.getElementById('modalCard').textContent"), /No dark fiber inside the UAE/);
  ev("UI.lmode='wave';openLinkModal('dxb','auh')");
  assert.match(ev("document.getElementById('modalCard').textContent"), /licensed operators/);
  ev("closeModal()");
  assert.deepEqual(errors, []);
});

test('regional incidents: Taiwan anchors, Andes landslides, load shedding', () => {
  const { ev, errors } = load();
  start(ev);
  ev("for(const c of ['tpe','scl','bue','cpt'])ACT.buildPop({city:c})");
  ev("UI.via=null;openLinkModal('tpe','hkg');ACT.buildLink({tier:1});closeModal()");
  ev("UI.via='land';openLinkModal('scl','bue');ACT.buildLink({tier:1});closeModal()");
  assert.ok(ev("S.links.some(l=>l.a==='tpe'&&l.sub)") && ev("S.links.some(l=>l.a==='scl'&&!l.sub)"), 'links built');
  let anchors = 0, andes = 0, shed = 0;
  for (let i = 0; i < 400; i++) {
    ev("S.inc=[];for(const l of S.links)l.cut=0;for(const c in S.pops){S.pops[c].down=0;S.pops[c].gen=false}fireFailure()");
    const m = ev("S.inc.map(x=>x.msg).join(' ')");
    if (/anchor/.test(m) && /Taipei/.test(m)) anchors++;
    if (/Andes|mountain pass|llama|4,000/.test(m)) andes++;
    if (/Load shedding/.test(m)) shed++;
  }
  assert.ok(anchors > 0, 'anchors drag over Taiwan cables');
  assert.ok(andes > 0, 'the Andes break fiber');
  assert.ok(shed > 0, 'South Africa sheds load');
  assert.deepEqual(errors, []);
});

test('every new city panel renders', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['for', 'pan', 'del', 'tpe', 'auh', 'fuj', 'cpt', 'bog']) {
    ev(`selectCity('${c}');for(const t of ['cust','up','peer','links','infra'])ACT.tab({t})`);
  }
  assert.deepEqual(errors, []);
});

test('Asia-Pacific and Eastern Europe POPs exist; the real sellers are where PeeringDB says', () => {
  const { ev } = load();
  start(ev);
  for (const c of ['mel', 'bne', 'drw', 'osa', 'kul', 'bkk', 'sgn', 'khi', 'dac', 'cbo', 'waw', 'prg', 'vie', 'bud', 'buh', 'tll', 'ist'])
    assert.ok(ev(`!!CITY['${c}']`), c);
  for (const c of ['mel', 'osa', 'kul', 'bkk', 'khi', 'waw', 'prg', 'vie', 'bud', 'buh', 'ist'])
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  for (const c of ['drw', 'cbo', 'dac', 'sgn']) assert.equal(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), false, `${c} has none, so you must haul`);
  assert.ok(ev("CABLE_PAIRS.some(p=>p.cid==='balt')&&CABLE_PAIRS.some(p=>p.cid==='darwin')&&CABLE_PAIRS.some(p=>p.cid==='smw4')"));
});

test('metro diversity: a second site keeps half the POP up and uplinks follow their site', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'lvl',tier:1});compute()");
  const cap0 = ev("nodeCap('fra')");
  ev("ACT.addSite({city:'fra'})");
  assert.ok(ev("S.pops.fra.site2"));
  ev("ACT.siteSet({k:'t',id:S.transit[1].id,s:'b'})");
  assert.equal(ev("S.transit[1].site"), 'b');
  // a power cut in site A: the POP stays up at half capacity, only site-B transit works
  ev("addInc({type:'site',ref:'fra',site:'a',until:S.day+3,msg:'x',cost:0});compute()");
  assert.equal(ev("popUp('fra')"), true);
  assert.equal(ev("nodeCap('fra')"), cap0 / 2);
  assert.equal(ev("R.useT[S.transit[0].id]||0"), 0, 'site A transit is dark');
  assert.ok(ev("R.useT[S.transit[1].id]") > 0, 'site B transit carries traffic');
  // the incident path also uses the second site
  ev("S.inc=[];S.pops.fra.gen=false;for(let i=0;i<500&&!S.inc.some(x=>x.type==='site'||x.type==='ring');i++){fireFailure();S.inc=S.inc.filter(x=>x.type==='site'||x.type==='ring');for(const c in S.pops)S.pops[c].down=0;}");
  assert.ok(ev("S.inc.some(x=>x.type==='site'||x.type==='ring')"), 'site outages and ring cuts happen');
  ev("selectCity('fra');ACT.tab({t:'infra'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Metro diversity/);
  ev("selectCity('fra');ACT.tab({t:'up'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Site:/);
  assert.deepEqual(errors, []);
});

test('the giants ask for AI WANs, multi-site training, ingests and hundreds of fiber pairs', () => {
  const { ev, errors } = load();
  start(ev);
  ev("for(const c of ['ash','dal','chi','nyc'])ACT.buildPop({city:c})");
  ev("UI.pending={a:'chi',b:'ash'};UI.lmode='df';UI.dfSrc='build';UI.dfSys='roadm';ACT.orderDf();UI.lmode='wave';S.links.filter(l=>l.kind==='df').forEach(l=>l.ready=S.day)");
  const seen = {};
  for (let i = 0; i < 600; i++) { ev('S.offers=[];spawnOffer()'); for (const o of JSON.parse(ev("JSON.stringify(S.offers.filter(o=>o.mega).map(o=>({t:o.type,c:bCities(o),r:o.rate,bw:o.bw})))"))) seen[o.t] = o; }
  for (const t of ['aiwan', 'mtrain', 'ingest', 'pairs']) assert.ok(seen[t], `${t} offers appear`);
  assert.ok(seen.mtrain.c.length >= 3, 'training runs span several sites');
  assert.ok(seen.aiwan.bw >= 3200);
  // accept one and make sure it earns
  ev("for(let i=0;i<400&&!S.offers.some(o=>o.type==='pairs');i++){S.offers=[];spawnOffer();}const o=S.offers.find(o=>o.type==='pairs');ACT.accept({id:o.id});compute()");
  assert.ok(ev("S.biz.some(b=>b.type==='pairs')"));
  assert.ok(ev("R.revMo") > 0);
  ev("selectCity('dal')");
  assert.match(ev("document.getElementById('panelBody').textContent+''"), /./);
  ev("ACT.leftTab({t:'deals'})");
  assert.deepEqual(errors, []);
});

test('#8 ports can be split across both buildings, so one dark site only halves them', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'});ACT.addSite({city:'fra'});compute()");
  const full = ev("ixCap('fra')");
  const cash0 = ev("S.cash");
  ev("ACT.siteSet({k:'ix',id:'fra',s:'ab'})");
  assert.equal(ev("(S.ixn||{}).fra"), 2, 'choosing Both adds a second member');
  assert.equal(ev("S.ixSite.fra"), 'ab');
  assert.ok(ev("S.cash") < cash0, 'and charges for it');
  const two = ev("ixCap('fra')");
  ev("addInc({type:'site',ref:'fra',site:'a',until:S.day+3,msg:'x',cost:0});compute()");
  assert.ok(ev("ixCap('fra')") > 0 && ev("ixCap('fra')") < two, 'site A dark: the IX port runs on its site-B half');
  assert.ok(ev("R.useIx.fra||0") > 0, 'and still carries traffic');
  ev("ACT.siteSet({k:'t',id:S.transit[0].id,s:'ab'});compute()");
  assert.equal(ev("S.transit[0].n"), 2);
  assert.ok(ev("R.useT[S.transit[0].id]||0") > 0, 'split transit survives the dark site');
  ev("ACT.lagT({id:S.transit[0].id,d:-1})");
  assert.equal(ev("S.transit[0].site"), 'a', 'one member left: back in one building');
  ev("selectCity('fra');ACT.tab({t:'infra'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /split/);
  assert.ok(full > 0);
  assert.deepEqual(errors, []);
});

test('routers: wave and port sizes match what the box can actually take', () => {
  const { ev } = load();
  start(ev);
  assert.equal(ev("LT.map(t=>t.n).join()"), '10G,100G,400G,800G,1.6T,6.4T');
  assert.equal(ev("PORT[RG[3].maxP].n"), '1.6T', 'the 1.6T router has 1.6T ports');
  assert.equal(ev("LT[RG[2].maxLT].n"), '800G', 'an 800G router stops at 800G waves');
  assert.equal(ev("LT[RG[3].maxLT].n"), '6.4T');
  // an old save with a 1.6T wave (old tier 3) keeps its 1.6T wave after migration
  const old = ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.ltv;s.links=[{id:'x',a:'fra',b:'ams',kind:'wave',tier:3,km:364,mo:1,cut:0}];s.pops.ams={day:0,routers:1};return JSON.stringify(s)})()");
  assert.equal(ev(`LT[migrate(JSON.parse(${JSON.stringify(old)})).links[0].tier].n`), '1.6T');
});

test('London–Amsterdam: many cheap cables and dark fiber you can lease under the sea', () => {
  const { ev, errors } = load();
  start(ev);
  assert.ok(ev("cablesFor('lon','ams').length") >= 4);
  assert.equal(ev("dfAllowed('lon','ams')"), true);
  assert.equal(ev("dfAllowed('lon','nyc')"), false, 'not on long subsea routes');
  ev("ACT.buildPop({city:'lon'});ACT.buildPop({city:'ams'});UI.pending={a:'lon',b:'ams'};UI.lmode='df';UI.dfSrc='build';UI.dfSys='lite';ACT.orderDf();UI.lmode='wave'");
  const l = JSON.parse(ev("JSON.stringify(S.links.find(l=>l.kind==='df'))"));
  assert.ok(l && l.sub && l.cable && !l.own, 'a subsea IRU, never self-built');
  assert.deepEqual(errors, []);
});

test('#10 your own IX fabric can be upgraded, and grows', () => {
  const { ev, errors } = load();
  start(ev);
  const c = ev("CITIES.find(c=>!c.gen&&!c.ix&&!c.cn&&!c.ru&&!c.uae&&!c.saudi).id");
  ev(`ACT.buildPop({city:'${c}'});ACT.foundIx({city:'${c}'});compute()`);
  assert.equal(ev(`ixCap('${c}')`), 400);
  ev(`ACT.myIxUp({city:'${c}'});compute()`);
  assert.equal(ev(`ixCap('${c}')`), 1600);
  assert.equal(ev(`myFab('${c}').max`), 20);
  ev(`selectCity('${c}');ACT.tab({t:'peer'})`);
  assert.match(ev("document.getElementById('panelBody').textContent"), /Your own fabric · 1.6T/);
  assert.deepEqual(errors, []);
});

test('wave prices follow regional markets and fall over time', () => {
  const { ev } = load();
  start(ev);
  const eu = ev("waveMarket('fra','ams',false).reg"), us = ev("waveMarket('nyc','ash',false).reg"), af = ev("waveMarket('lon','lag',true).reg");
  assert.ok(eu < us && us < af, `Europe ${eu} < US ${us} < Africa ${af}`);
  const m0 = ev("waveMarket('fra','ams',false).m");
  ev("S.day=720");
  assert.ok(ev("waveMarket('fra','ams',false).m") < m0, 'two years later it is cheaper');
  assert.ok(ev("cablesFor('cai','dxb').length") > 0, 'Cairo–Dubai over the Red Sea');
  assert.match(ev("marketNote('fra','ams',false)"), /Europe/);
});

test('the Gulf: Saudi licences, and a spat that cuts Qatar off from its neighbours', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev("popCost('ruh')-popCost('fra')"), ev('KSA_LIC'));
  ev("ACT.buildPop({city:'doh'});ACT.buildPop({city:'ruh'});UI.via='land';openLinkModal('doh','ruh');ACT.buildLink({tier:1});closeModal()");
  const l = "S.links.find(l=>[l.a,l.b].includes('doh'))";
  assert.equal(ev(`linkDown(${l})`), false);
  ev("S.ev.gulf=S.day+60");
  assert.equal(ev(`linkDown(${l})`), true, 'the border is closed');
  ev("ACT.startScn({id:'redsea',sure:1})");
  assert.equal(ev("cablesOk('cai','jed').length+cablesOk('jed','bom').length"), 0, 'the Red Sea crisis covers Egypt and Jeddah too');
  assert.deepEqual(errors, []);
});

test('Italy, Portugal, Greece and more US cities are on the map and wired up', () => {
  const { ev, errors } = load();
  for (const c of ['mil', 'rom', 'pmo', 'lis', 'ath', 'atn', 'den', 'phx', 'bos', 'hou', 'slc']) {
    assert.ok(ev(`!!CITY.${c}`), c);
    assert.ok(ev(`NETS.filter(n=>n.price&&n.pops.includes('${c}')).length`) >= 2, `${c} has transit sellers`);
  }
  for (const [a, b] of [['lis', 'for'], ['lis', 'atn'], ['mil', 'pmo'], ['pmo', 'cai'], ['ath', 'ist'], ['bos', 'dub']])
    assert.ok(ev(`cablesFor('${a}','${b}').length`) > 0, `${a}-${b} cable`);
  assert.deepEqual(errors, []);
});

test('network ids are unique, and the long tail is small and spread over exchanges', () => {
  const { ev } = load();
  assert.equal(ev("new Set(NETS.map(n=>n.id)).size===NETS.length"), true);
  const tail = ev("NETS.filter(n=>n.tail).length");
  assert.ok(tail >= 50, `${tail} small peers`);
  assert.ok(ev("NETS.filter(n=>n.tail).every(n=>n.share<=0.003&&n.pops.every(c=>CITY[c]&&!CITY[c].ixOnly))"));
  assert.ok(ev("NETS.filter(n=>n.tail&&n.ix.some(x=>x.includes('~'))).length") >= 5, 'some only sit on challenger IXs');
});

test('several exchanges per city: overlapping members, cheaper challengers, separate ports', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'ams'})");
  const ids = JSON.parse(ev("JSON.stringify(ixIdsIn('ams'))"));
  assert.equal(ids[0], 'ams');
  assert.ok(ids.length >= 3 && ids.slice(1).every((x, i) => x === `ams~${i + 2}`), ids.join());
  const a = JSON.parse(ev("JSON.stringify(ixMembers('ams'))")), b = JSON.parse(ev("JSON.stringify(ixMembers('ams~2'))"));
  assert.ok(a.some(x => b.includes(x)), 'shared members');
  assert.ok(b.some(x => !a.includes(x)) && a.some(x => !b.includes(x)), 'and different ones');
  assert.ok(ev("ixPortMo('ams~2',1)") < ev("ixPortMo('ams',1)"), 'challenger is cheaper');
  ev("ACT.buyIx({city:'ams~2',tier:1});ACT.rs({city:'ams~2'});compute()");
  assert.equal(ev("S.ixp['ams~2']"), 1);
  assert.equal(ev("S.ixp.ams"), undefined);
  assert.ok(ev("ixSessions('ams~2').size") > 3);
  assert.ok(ev("R.sessions") > 3);
  ev("ACT.peerAll({city:'ams~2'})");
  ev("selectCity('ams');ACT.tab({t:'peer'})");
  const t = ev("document.getElementById('panelBody').textContent");
  assert.match(t, /\d+ exchanges compete/);
  assert.match(t, /NL-ix/);
  ev("save();load2=JSON.parse(localStorage.getItem('sot-save-v1'));sanitize(load2)");
  assert.equal(ev("load2.ixp['ams~2']"), 1, 'saves keep challenger ports');
  ev("ACT.cancelIx({city:'ams~2'});ACT.cancelIx({city:'ams~2'})");
  assert.equal(ev("S.ixp['ams~2']"), undefined);
  assert.equal(ev("Object.keys(S.peers).some(k=>k.endsWith('@ams~2'))"), false);
  assert.deepEqual(errors, []);
});

test('Vodafone only peers for money now, and EU price wars cut port prices', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'ams'})");
  assert.equal(ev("NET.vdp.pol"), 'paid');
  assert.equal(ev("peerOk('vdp','ix','ams').ok"), false);
  assert.ok(ev("peerOk('vdp','pni','ams').fee") > 0);
  assert.ok(ev("ixPortMo('ams',1)") < ev("PORT[1].ix"), 'EU ports are cheaper');
  ev("ACT.buyIx({city:'ams',tier:1});const before=ixPortMo('ams',1);const r=Math.random;Math.random=()=>0;ixPriceWar(S.day);Math.random=r;window.__b=before");
  assert.ok(ev("ixPortMo('ams',1)") < ev("__b"), 'price cut');
  assert.deepEqual(errors, []);
});

test('router ports are finite: plugging in fills them, more routers or bigger models add room', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'ams'})");
  assert.equal(ev("portsMax('ams')"), 8, 'one Rusty has 8 ports');
  ev("for(const n of ['cog','lvl','tly','ntt','drz','tng'])ACT.buyTransit({city:'ams',net:n,tier:1});ACT.buyIx({city:'ams',tier:1});ACT.buyIx({city:'ams~2',tier:1})");
  assert.equal(ev("portsUsed('ams')"), 8);
  ev("ACT.buyIx({city:'ams~3',tier:1})");
  assert.equal(ev("S.ixp['ams~3']"), undefined, 'no ninth port');
  assert.match(ev("document.getElementById('toasts').textContent"), /No free router ports/);
  ev("ACT.buyIx({city:'ams~3',tier:0})");
  assert.equal(ev("S.ixp['ams~3']"), undefined, 'not even a 10G breakout');
  ev("ACT.addRouter({city:'ams'})");
  assert.equal(ev("portsMax('ams')"), 16);
  ev("ACT.buyIx({city:'ams~3',tier:0})");
  assert.equal(ev("S.ixp['ams~3']"), 0);
  assert.equal(ev("portsUsed('ams')"), 8.25, '10G rides a breakout');
  ev("ACT.rmRouter({city:'ams'})");
  assert.equal(ev("S.pops.ams.routers"), 2, 'cannot remove a router whose ports are in use');
  const arr = ev("RG.findIndex(r=>/Arrrhipster 7280/.test(r.n))");
  assert.ok(arr > 0);
  ev(`ACT.upRouter({city:'ams',g:${arr}})`);
  assert.equal(ev("S.pops.ams.rgen"), arr, 'swapped to the Arrrhipster');
  assert.equal(ev("portsMax('ams')"), 96);
  assert.equal(ev("bootMin('ams')") < 30, true, 'boots fast');
  ev("selectCity('ams');ACT.tab({t:'infra'});ACT.models()");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Knockia/);
  const mk = ev("RG.findIndex(r=>/Mikrowtik/.test(r.n))");
  ev("ACT.buyTransit({city:'ams',net:'cog',tier:2})");
  assert.equal(ev("S.transit.find(t=>t.net==='cog'&&t.city==='ams').tier"), 2);
  ev(`ACT.upRouter({city:'ams',g:${mk}})`);
  assert.equal(ev("S.pops.ams.rgen"), arr, 'a smaller model that cannot fit is refused');
  assert.ok(ev("RG.every(r=>r.ports>0&&r.cls>=0&&r.maxP<PORT.length)"));
  assert.deepEqual(errors, []);
});
