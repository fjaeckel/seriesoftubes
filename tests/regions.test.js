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
  assert.equal(ev("LT.map(t=>t.n).join()"), '10G,100G,400G,800G,1.6T,6.4T,12.8T');
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
    if (c === 'man' || c === 'edi') assert.ok(ev(`NETS.filter(n=>n.price&&n.pops.includes('${c}')).length`) >= 2, `${c} has transit sellers`); // Bude and Stavanger are cable landing sites: PeeringDB lists no transit sellers there
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
  ev("ACT.start({});S.cash=1e8;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'ams'})");
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
  assert.match(t, /NL-Nyx/);
  ev("save();load2=JSON.parse(localStorage.getItem('sot-save-v1'));sanitize(load2)");
  assert.equal(ev("load2.ixp['ams~2']"), 1, 'saves keep challenger ports');
  ev("ACT.cancelIx({city:'ams~2'});ACT.cancelIx({city:'ams~2'})");
  assert.equal(ev("S.ixp['ams~2']"), undefined);
  assert.equal(ev("Object.keys(S.peers).some(k=>k.endsWith('@ams~2'))"), false);
  assert.deepEqual(errors, []);
});

test('Voda-Phony only peers for money now, and EU price wars cut port prices', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'ams'})");
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
  assert.equal(ev("portsMax('ams')"), 8, 'one MX204 has 8 ports');
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
  const arr = ev("RG.findIndex(r=>/Arrrhipster 7280R/.test(r.n))");
  assert.ok(arr > 0);
  ev(`ACT.upRouter({city:'ams',g:${arr}})`);
  assert.equal(ev("S.pops.ams.rgen"), arr, 'swapped to the Arista');
  assert.equal(ev("portsMax('ams')"), 72);
  assert.equal(ev("bootMin('ams')") < 30, true, 'boots fast');
  ev("selectCity('ams');ACT.tab({t:'infra'});ACT.models()");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Knockia 7750/);
  const mk = ev("RG.findIndex(r=>/Mikrowtik/.test(r.n))");
  ev("ACT.buyTransit({city:'ams',net:'cog',tier:2})");
  assert.equal(ev("S.transit.find(t=>t.net==='cog'&&t.city==='ams').tier"), 2);
  ev(`ACT.upRouter({city:'ams',g:${mk}})`);
  assert.equal(ev("S.pops.ams.rgen"), arr, 'a smaller model that cannot fit is refused');
  assert.ok(ev("RG.every(r=>r.ports>0&&r.cls>=0&&r.maxP<PORT.length)"));
  assert.deepEqual(errors, []);
});

test('Barcelona is wired up: a coastal cable, CDNs and a proper Tokyo challenger', () => {
  const { ev, errors } = load();
  assert.ok(ev("cablesFor('bcn','mrs').length>0&&cablesFor('lis','bcn').length>0"));
  assert.ok(ev("NET.fbk.pops.includes('bcn')&&NET.amz.pops.includes('bcn')"));
  assert.equal(ev("ixName('tok~2')"), 'Bento-IX');
  assert.ok(ev("ixMul('tok~2')<1"), 'challengers undercut the incumbent');
  assert.deepEqual(errors, []);
});

test('Korea: sender pays, pricey transit, Glitch leaves and Meta detours', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'icn'});ACT.buildPop({city:'sin'})");
  assert.ok(ev("regionMult('icn')>regionMult('sin')"), 'Seoul transit costs more than the rest of Asia');
  for (const n of ['ktt', 'skb', 'lgu']) {
    assert.equal(ev(`NET.${n}.pol`), 'paid');
    assert.match(ev(`peerOk('${n}','ix','icn').why`), /Sender pays/);
  }
  ev("S.pops.icn.bb={d:400};ACT.buyTransit({city:'icn',net:'ntt',tier:1});ACT.pni({city:'icn',net:'ktt',tier:1});compute()");
  const used = ev("R.usePni[S.pni[0].id]||0");
  assert.ok(used > 0, 'traffic flows over the Kay-Tea PNI');
  assert.equal(ev("R.cost.pni"), ev(`PORT[1].pni+NET.ktt.paidFee+Math.round(NET.ktt.perG*${used})`), 'billed per gigabit sent');
  const amz0 = ev("R.demTo.amz"); ev("S.krExit=S.day+1;compute()");
  assert.ok(ev("R.demTo.amz") < amz0, 'Glitch leaving cuts its Seoul traffic');
  const evSrc = ev('fireEvent.toString()').replace(/^function fireEvent/, 'function').replace('const e=pick(opts);', "const e='krroute';");
  ev('window.__fe=' + evSrc + ';__fe();compute()');
  assert.ok(ev("S.ev.krroute>S.day&&S.inc.some(i=>i.type==='krroute')"));
  assert.ok(ev("SCN.some(s=>s.id==='gangnam'&&s.city==='icn')"));
  assert.deepEqual(errors, []);
});

test('Sparkly Seabone is a Tier 1 now, but old saves keep the five they played for', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.equal(ev("NET.skl.type"), 't1');
  assert.ok(ev("NET.skl.pops.includes('nyc')&&NET.skl.pops.includes('sao')&&NET.skl.pops.includes('pmo')"));
  assert.equal(ev("t1Need().length"), 6, 'new games need all six');
  ev("delete S.t1v");
  assert.equal(ev("t1Need().length"), 5, 'older saves keep five');
  assert.deepEqual(errors, []);
});

test('more UK and Norway: Manchester, Edinburgh, Bude and Stavanger with North Sea and Atlantic cables', () => {
  const { ev, errors } = load();
  for (const c of ['man', 'edi', 'bde', 'svg']) {
    assert.ok(ev(`!!CITY.${c}`), c);
    if (c === 'man' || c === 'edi') assert.ok(ev(`NETS.filter(n=>n.price&&n.pops.includes('${c}')).length`) >= 2, `${c} has transit sellers`); // Bude and Stavanger are cable landing sites: PeeringDB lists no transit sellers there
  }
  for (const [a, b] of [['svg', 'edi'], ['dub', 'svg'], ['man', 'cph'], ['edi', 'rek'], ['nyc', 'bde'], ['bde', 'lag'], ['svg', 'ams']])
    assert.ok(ev(`cablesFor('${a}','${b}').length`) > 0, `${a}-${b} cable`);
  assert.ok(ev("subDfCable('svg','edi')"), 'NO-UK sells dark fiber pairs');
  assert.equal(ev("cablesFor('lon','par').length"), 2, 'two ways under the Channel');
  assert.ok(ev("['btt','sky','vmo'].every(n=>NET[n].pops.includes('man'))"));
  assert.deepEqual(errors, []);
});

test('#41 real coastlines: every named city is on land, and the far view drops tiny islands but keeps every city', () => {
  const { ev, errors } = load();
  assert.deepEqual(JSON.parse(ev('JSON.stringify(CITIES.filter(c=>!c.gen&&!onLand(c.x,c.y)).map(c=>c.id))')), [], 'no city in the sea');
  assert.ok(ev('LANDP_FAR.length') < ev('LANDP_ALL.length'), 'the far view is simpler');
  assert.equal(ev('CITIES.every(c=>c.gen||COAST.some((p,i)=>inPoly(c.x,c.y,p)&&LANDP_FAR.includes(LANDP_ALL[i])))'), true, 'no city loses its island when zoomed out');
  ev('ACT.start({});cam.z=0.5;draw(0);cam.z=2;draw(0)');
  assert.deepEqual(errors, []);
});

test('#47 Cairo reaches Asia overland across the Sinai, priced like the Bosporus', () => {
  const { ev, errors } = load();
  assert.equal(ev("isSub('cai','dxb')"), false, 'Cairo–Dubai can go overland');
  assert.equal(ev("isSub('ist','dxb')"), false, 'like Istanbul–Dubai');
  assert.equal(ev("landX('cai','dxb')"), true, 'at the intercontinental price');
  assert.equal(ev("landMult('cai','dxb')"), ev("landMult('ist','dxb')"));
  assert.equal(ev("dfAllowed('cai','dxb')"), false, 'no dark fiber across a dozen borders');
  assert.equal(ev("isSub('cai','nbo')"), false, 'still part of Africa');
  assert.equal(ev("isSub('lag','dxb')"), true, 'the rest of Africa still needs a cable or a hop via Cairo');
  assert.equal(ev("isSub('cai','lon')"), true, 'the Channel is still the sea');
  assert.deepEqual(errors, []);
});

test('#22 Tier 1 networks can lay their own subsea cable', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});S.cash=2e8;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'lon'});ACT.buildPop({city:'nyc'});compute()");
  const card = () => dom.window.document.getElementById('modalCard').textContent;
  // not before Tier 1
  ev("UI.lmode='df';UI.via=null;openLinkModal('lon','nyc')");
  assert.match(card(), /Tier 1 only/);
  assert.match(ev("ownCabWhy('lon','nyc')"), /Tier 1/);
  ev('ACT.orderCable()');
  assert.equal(ev("S.links.filter(l=>l.own&&l.sub).length"), 0, 'refused before Tier 1');
  // as a Tier 1
  ev("S.won=true;ACT.ownCab()");
  assert.match(card(), /frankly rude amount of money/);
  assert.match(card(), /pays for itself in about \d+ months/);
  const c0 = ev('S.cash'), km = ev("ownCabKm('lon','nyc')");
  ev('ACT.orderCable()');
  const l = JSON.parse(ev("JSON.stringify(S.links.find(l=>l.own&&l.sub))"));
  assert.ok(l, 'the cable is being laid');
  assert.equal(c0 - ev('S.cash'), ev(`ownCabCost(${km})`));
  assert.ok(l.ready - ev('S.day') > 300, 'it takes a long time');
  assert.equal(l.sys, 'roadm');
  assert.ok(l.cname && l.cname.length > 3, 'it gets a name');
  // finished: light it, fill a pair, light the next one; no mid-ocean regen
  ev(`const L=S.links.find(x=>x.id==='${l.id}');S.day=L.ready;L.ch=Array(64).fill('tp16');compute()`);
  ev(`ACT.regen({id:'${l.id}',d:1})`);
  assert.equal(ev(`S.links.find(x=>x.id==='${l.id}').regen|0`), 0, 'no regen sites in the ocean');
  ev(`ACT.addPair({id:'${l.id}'})`);
  assert.equal(ev(`S.links.find(x=>x.id==='${l.id}').pairs`), 2);
  assert.equal(ev(`pairsMax(S.links.find(x=>x.id==='${l.id}'))`), 8, 'up to eight pairs in a subsea cable');
  // landing stations and China
  const inland = ev("CITIES.find(c=>c.land==='eu'&&!landing(c.id)&&!cnCity(c.id)).id");
  assert.match(ev(`ownCabWhy('${inland}','nyc')`), /landing station/, 'both ends need a landing station');
  assert.match(ev("ownCabWhy('sha','sea')"), /China/);
  assert.deepEqual(errors, []);
});

test('#76 Kansas City, Calgary, Vancouver and Ottawa, with two more Canadian giants and their beavers', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  for (const c of ['kcy', 'cal', 'van', 'ott']) {
    assert.equal(ev(`CITY.${c}.land`), 'am');
    assert.ok(ev(`CITY.${c}.ix.length>0&&CITY.${c}.dc.length>0`), `${c} has an IX and a data center`);
  }
  assert.equal(ev('CITY.ott.blackout'), true, 'Ottawa gets frequent power cuts');
  assert.equal(ev("['tor','mtl','cal','van','ott'].every(c=>CITY[c].ca)&&!CITY.kcy.ca"), true);
  // Canadian eyeballs come through the Tier 1s they buy transit from, so a Tier 1 keeps its reach
  ev("S.transit=[];S.ixp={};S.pni=[];for(const n of t1Need())S.pni.push({id:n.id,net:n.id,city:'fra',tier:0});compute()");
  assert.equal(ev("t1Need().every(n=>n.pops.includes('fra'))"), true);
  assert.equal(ev("R.reachable.tlu&&R.reachable.rgc"), true, 'reachable over PNIs with their upstream Tier 1s');
  assert.equal(ev("NET.tlu.up.every(id=>NET[id].type==='t1')&&NET.rgc.up.every(id=>NET[id].type==='t1')"), true);
  // a cut on a Canadian link is often a beaver
  ev("ACT.buildPop({city:'van'});ACT.buildPop({city:'cal'});S.links=[];UI.via=null;openLinkModal('van','cal');ACT.buildLink({tier:1});closeModal()");
  const src = ev('fireFailure.toString()').replace(/^function fireFailure/, 'function');
  ev('window.__ff=' + src.replace('type=pick(f);}', "type='cut';}"));
  ev("for(let i=0;i<40&&!(S.stats.f&&S.stats.f.beaver);i++){for(const l of S.links)l.cut=0;S.inc=[];__ff();}");
  assert.ok(ev("!!(S.stats.f&&S.stats.f.beaver)"), 'a beaver chewed through it');
  ev('checkBadges()');
  assert.ok(ev("(S.badges||[]).includes('beaver')||!!(S.badge&&S.badge.beaver)||BADGES.find(b=>b.id==='beaver').ok()"), 'Dam It');
  assert.deepEqual(errors, []);
});

test('#70 Goggle throttling in Russia no longer counts as traffic you failed to deliver', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'mos'});ACT.launchBB({city:'mos'})");
  ev("S.pops.fra.rgen=S.pops.mos.rgen=3;S.pops.fra.routers=S.pops.mos.routers=3;ACT.buyTransit({city:'fra',net:'cog',tier:4});ACT.lagT({id:S.transit[0].id,d:1});UI.via=null;UI.lmode='wave';openLinkModal('fra','mos');ACT.buildLink({tier:4});closeModal();S.pops.mos.bb.d=300;compute()");
  assert.equal(ev('S.links.length'), 1);
  assert.ok(ev("sfOf(R,'mos')") > 0.99, `Moscow is fully served (${ev("sfOf(R,'mos')")})`);
  // demand toward Goggle is half of what it would be without the throttle
  const g = ev("NSH_RU.ggl"), d0 = ev("R.cityEye.mos");
  assert.ok(Math.abs(ev("R.cityDem.mos") - d0 * (1 - g / 2)) < 1e-6);
  // a game-server customer judged on the city's service stays happy
  ev("S.biz.push({id:'gs',name:'Startup #384',type:'game',city:'mos',bw:5,rate:120,reqs:[],mood:0.5,day:0});compute()");
  assert.equal(ev("bizWhy(S.biz.find(b=>b.id==='gs')).length"), 0, 'no complaint about bandwidth');
  assert.deepEqual(errors, []);
});

test('#79 Benelux: Brussels red tape, the Flanders duopoly, Oostkamp trawlers and a wood-fired Bettembourg', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  for (const c of ['bru', 'oos', 'bet']) assert.equal(ev(`CITY.${c}.land`), 'eu');
  // red tape: a pricier POP and pricier transit than Amsterdam
  assert.equal(ev("popCost('bru')-popCost('ams')"), ev('BE_TAPE'));
  assert.equal(ev("regionMult('bru')"), 1.5);
  assert.equal(ev("regionMult('ams')"), 1);
  // the duopoly: Belgian eyeballs barely grow until you advertise
  ev("ACT.buildPop({city:'bru'});ACT.launchBB({city:'bru'});ACT.buildPop({city:'ams'});ACT.launchBB({city:'ams'})");
  const grow = (ad) => ev(`(()=>{const p=S.pops.bru;p.bb.d=20;p.boost=${ad ? 'S.day+30' : '0'};R.cityDem={bru:1,ams:1};R.citySrv={bru:1,ams:1};const t=compute;compute=()=>{};S.day++;dayTick();compute=t;return S.pops.bru.bb.d-20;})()`);
  const quiet = grow(false), loud = grow(true);
  assert.ok(loud > quiet * 4, `an ad campaign cracks the duopoly (${quiet.toFixed(3)} vs ${loud.toFixed(3)})`);
  // the new networks are reachable through Tier 1s, so Tier 1 players keep their reach
  ev("S.transit=[];S.ixp={};S.pni=[];for(const n of t1Need())S.pni.push({id:n.id,net:n.id,city:'fra',tier:0});compute()");
  for (const n of ['tny', 'pxm', 'bgs', 'cit', 'cms']) assert.equal(ev(`R.reachable.${n}`), true, `${n} reachable`);
  // Clementine lands at Oostkamp; trawlers love it
  assert.ok(ev("cablesFor('lon','oos').some(c=>c.cid==='clementine')"));
  ev("ACT.buildPop({city:'lon'});ACT.buildPop({city:'oos'});S.links=[];UI.lmode='wave';UI.via='clementine';openLinkModal('lon','oos');ACT.buildLink({tier:1});closeModal()");
  assert.equal(ev("S.links.length&&S.links[0].sub"), true);
  const src = ev('fireFailure.toString()').replace(/^function fireFailure/, 'function');
  ev('window.__ff=' + src.replace('type=pick(f);}', "type='cut';}"));
  ev("for(let i=0;i<30&&!S.log.some(e=>/trawler|wind-farm/.test(e.t));i++){for(const l of S.links)l.cut=0;S.inc=[];__ff();}");
  assert.ok(ev("S.log.some(e=>/trawler|wind-farm/.test(e.t))"), 'a North Sea boat found the cable');
  // Bettembourg's chillers run on steam from burning waste wood
  ev("S.pops={bet:{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0}};window.__ac=" + src.replace('type=pick(f);}', "type='ac';}"));
  ev("for(let i=0;i<20&&!S.log.some(e=>/waste-wood/.test(e.t));i++){S.pops.bet.hot=0;S.inc=[];__ac();}");
  assert.ok(ev("S.log.some(e=>/waste-wood/.test(e.t))"), 'the forestry strike');
  assert.deepEqual(errors, []);
});

test('Stuttgart sits between Frankfurt and Zurich, and Hamburg, Munich and Düsseldorf are on the map', () => {
  const { ev, errors } = load();
  const y = c => ev(`CITY.${c}.y`), x = c => ev(`CITY.${c}.x`);
  assert.ok(y('fra') < y('stg') && y('stg') < y('zrh'), 'north to south: Frankfurt, Stuttgart, Zurich');
  assert.ok(Math.abs(x('stg') - x('fra')) < 16, 'not pushed off towards Prague');
  assert.ok(x('stg') < x('prg') - 20);
  assert.ok(x('stg') < x('muc') && x('muc') < x('vie') && y('muc') > y('prg') && y('muc') < y('mil'), 'Munich: east of Stuttgart, west of Vienna, south of Prague');
  assert.equal(ev("CITY.muc.ix"), 'Brezn-IX');
  assert.ok(y('ham') < y('ber') && y('ham') < y('fra'), 'Hamburg is up north');
  assert.equal(ev("CITY.ham.ix"), 'Moin-IX');
  assert.equal(ev("NET.lvl.pops.includes('ham')&&NET.dtk.pops.includes('ham')"), true);
  assert.ok(x('dus') < x('fra') && x('dus') > x('ams') && y('dus') > y('ams') && y('dus') < y('fra'), 'Düsseldorf: between Amsterdam and Frankfurt');
  assert.equal(ev("CITY.dus.ix"), 'Altbier-IX');
  assert.ok(ev("kmBetween('dus','ams')") < ev("kmBetween('fra','ams')"), 'closer to Amsterdam than Frankfurt is');
  for (const n of ['ntt', 'tly', 'cog', 'drz', 'vdp', 'dtk', 'nfx', 'akm', 'cfl', 'amz', 'msf', 'bdc']) assert.ok(ev(`NET.${n}.pops.includes('dus')`), `${n} is in Düsseldorf, as on PeeringDB`);
  assert.deepEqual(errors, []);
});

test('Brazil has every IX.brrr location, in the right order on the map', () => {
  const { ev, errors } = load();
  start(ev);
  const br = JSON.parse(ev('JSON.stringify(CITIES.filter(c=>c.br&&!c.gen).map(c=>c.id))'));
  assert.equal(br.length, 40, 'the forty IX.br locations');
  const y = c => ev(`CITY.${c}.y`), x = c => ev(`CITY.${c}.x`);
  for (const [n, s] of [['bsb', 'bhz'], ['bhz', 'rio'], ['vix', 'rio'], ['ssa', 'vix'], ['nat', 'jpa'], ['jpa', 'rec'], ['rec', 'mcz'], ['sao', 'cwb'], ['cwb', 'poa'], ['cpq', 'sao'], ['cxj', 'poa']])
    assert.ok(y(n) < y(s), `${n} is north of ${s}`);
  for (const [w, e] of [['mao', 'bel'], ['rbr', 'pvh'], ['cgb', 'gyn'], ['mgf', 'ldb'], ['poa', 'fln']]) assert.ok(x(w) < x(e), `${w} is west of ${e}`);
  for (const c of br) {
    assert.ok(ev(`CITY.${c}.ix.startsWith('IX.brrr')&&CITY.${c}.ixCheap===0.3`), `${c} has a cheap IX.brrr`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
    assert.ok(ev(`ixMembers('${c}').includes('viv')&&ixMembers('${c}').includes('oio')`), `${c} IX has the national networks`);
  }
  assert.ok(ev("ixPortMo('cwb',1)") < ev("PORT[1].ix*0.5"), 'nonprofit IX ports are cheap');
  assert.deepEqual(errors, []);
});

test('the Amazon doubles overland fiber, and there is a national-operator scenario', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev("landMult('sao','bsb')"), 1);
  assert.equal(ev("landMult('bsb','mao')"), 2);
  assert.equal(ev("landMult('mao','bel')"), 2);
  assert.match(ev("landWhy('bsb','mao')"), /Amazon/);
  assert.equal(ev("landMult('lpb','sao')"), 2, 'La Paz is across the Andes');
  assert.equal(ev("isSub('gua','mex')"), false, 'Central America is overland');
  for (const c of ['mvd', 'asu', 'cor', 'lpb', 'uio', 'mde', 'ccs', 'gua', 'sjo', 'qro', 'mty', 'gdl'])
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  assert.ok(ev("CABLE_PAIRS.some(p=>p.cid==='sam1'&&p.a==='ssa')&&CABLE_PAIRS.some(p=>p.cid==='tannat'&&p.b==='mvd')"), 'Salvador and Montevideo have cables');
  ev("ACT.startScn({id:'ixbr',sure:1})");
  assert.equal(ev('S.scn.id'), 'ixbr');
  assert.equal(ev('brIxN()'), 0);
  ev("S.cash=1e9;for(const c of ['sao','rio','mao'])ACT.buildPop({city:c});S.ixp.sao=1;S.ixp.mao=1;compute()");
  assert.equal(ev('brIxN()'), 2);
  assert.equal(ev("scnProg().items[1].v"), 1, 'Manaus step done');
  assert.deepEqual(errors, []);
});

test('a Tier 1 reaches every Latin American and African network through the carriers they buy transit from', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});S.transit=[];S.ixp={};S.pni=[];for(const n of t1Need())S.pni.push({id:n.id,net:n.id,city:'fra',tier:0});compute()");
  for (const n of ['oio', 'tmt', 'bsn', 'mvs', 'llt', 'ant', 'tgo', 'liq', 'scm', 'agc', 'djt', 'mtx', 'art', 'eth', 'mrc']) {
    assert.equal(ev(`NET.${n}.up.every(id=>NET[id].type==='t1')`), true, `${n} buys from Tier 1s`);
    assert.equal(ev(`R.reachable.${n}`), true, `${n} is reachable`);
  }
  assert.deepEqual(errors, []);
});

test('Africa: more countries, cables along both coasts, border costs and Cape to Cairo', () => {
  const { ev, errors } = load();
  start(ev);
  const af = JSON.parse(ev("JSON.stringify(CITIES.filter(c=>c.reg==='AF'&&!c.gen).map(c=>c.id))"));
  assert.ok(af.length >= 26);
  for (const c of af) {
    assert.ok(ev(`!!CITY.${c}.cc&&!!CITY.${c}.ix`), `${c} has a country and an IX`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  }
  for (const c of ['dkr', 'abj', 'acc', 'dla', 'lad', 'cas', 'alg', 'tun', 'jib', 'mba', 'dar', 'mpm', 'dur', 'wdh'])
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
  assert.ok(ev("CABLE_PAIRS.some(p=>p.cid==='sail'&&p.a==='for'&&p.b==='dla')"), 'Brazil to Cameroon');
  assert.ok(ev("CABLE_PAIRS.some(p=>p.cid==='sacs'&&p.b==='lad')"), 'Brazil to Angola');
  assert.ok(ev("CABLE_PAIRS.some(p=>p.cid==='seacm'&&p.a==='jib'&&p.b==='bom')"), 'Djibouti to Mumbai');
  assert.equal(ev("landMult('nbo','kla')"), 2, 'Kenya to Uganda crosses a border');
  assert.equal(ev("landMult('jnb','dur')"), 1, 'inside South Africa');
  assert.match(ev("landWhy('nbo','kla')"), /border/);
  ev("ACT.startScn({id:'c2c',sure:1})");
  assert.equal(ev('S.scn.id'), 'c2c');
  assert.equal(ev('scnProg().items.length'), 4);
  assert.deepEqual(errors, []);
});

test('Pacific islands: real landings, real exchanges only, and island hops carry more per wave', () => {
  const { ev, errors } = load();
  start(ev);
  const isl = ['hnl', 'gum', 'ror', 'maj', 'pom', 'hir', 'nou', 'suv', 'tbu', 'apw', 'ppg', 'ppt'];
  for (const c of isl) {
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
    assert.ok(ev(`isSub('${c}','syd')&&isSub('${c}','lax')`), `${c} is an island`);
  }
  // only islands with a working exchange today get one
  assert.deepEqual(isl.filter(c => ev(`!!CITY['${c}'].ix`)), ['hnl', 'gum', 'pom', 'hir', 'nou', 'suv']);
  assert.equal(ev(`NETS.filter(n=>Array.isArray(n.ix)&&n.ix.some(c=>CITY[c]&&!CITY[c].ix&&${JSON.stringify(isl)}.includes(c))).length`), 0);
  // every new network is reachable through a Tier 1, so Tier 1 players keep their reach
  assert.equal(ev(`NETS.filter(n=>n.type!=='t1'&&n.pops.every(c=>${JSON.stringify(isl)}.includes(c)||['tok','syd','lax'].includes(c))&&n.pops.some(c=>${JSON.stringify(isl)}.includes(c))&&!(n.up||[]).some(u=>NET[u].type==='t1')).map(n=>n.id).join()`), '');
  // a wave across the whole ocean carries far less than the same trip broken at the islands
  const hop = (path) => ev(`Math.min(...${JSON.stringify(path)}.slice(1).map((c,i)=>Math.max(...cablesFor(${JSON.stringify(path)}[i],c).map(p=>subCarrier(p.km)))))`);
  const direct = (a, b) => ev(`Math.max(...cablesFor('${a}','${b}').map(p=>subCarrier(p.km)))`);
  assert.equal(direct('sjc', 'syd'), 400);
  assert.equal(hop(['sjc', 'hnl', 'suv', 'syd']), 1600, 'California to Sydney via Hawaii and Fiji');
  assert.equal(direct('akl', 'sea'), 400);
  assert.equal(hop(['akl', 'suv', 'hnl', 'sea']), 1600);
  assert.equal(direct('lax', 'hkg'), 400);
  assert.ok(hop(['lax', 'hnl', 'gum', 'hkg']) >= 1200, 'Hong Kong via Hawaii and Guam');
  assert.equal(direct('scl', 'syd'), 400);
  assert.ok(hop(['scl', 'ppt', 'syd']) >= 1200, 'South America to Oceania via Tahiti');
  // in play: 1.6T waves hop by hop from Los Angeles to Sydney
  ev("for(const c of ['lax','hnl','suv','syd']){ACT.buildPop({city:c});S.pops[c].rgen=3;}");
  const wave = (a, b, via) => ev(`UI.via='${via}';UI.route='same';openLinkModal('${a}','${b}');ACT.buildLink({tier:4});closeModal();S.links.length`);
  assert.match(ev("subWaveWhy(4,cablesFor('lax','syd').concat(cablesFor('sjc','syd'))[0].km,true)"), /per carrier/, 'no 1.6T straight across');
  const n0 = ev('S.links.length');
  wave('lax', 'hnl', 'seaus'); wave('hnl', 'suv', 'scx'); wave('suv', 'syd', 'scxn');
  assert.equal(ev('S.links.length'), n0 + 3);
  ev('compute()');
  assert.equal(ev("fastPath('lax','syd',1600)"), true);
  assert.equal(ev("fastPath('lax','syd',3200)"), false);
  // the Stepping Stones scenario starts in Honolulu with 1.6T gear
  ev("ACT.startScn({id:'pac',sure:1})");
  assert.equal(ev('S.scn.id'), 'pac');
  assert.ok(ev('!!S.pops.hnl') && ev('S.lvl') >= 4);
  assert.equal(ev('scnProg().items.length'), 3);
  ev('cam.z=0.5;draw(0);cam.z=2;draw(0)');
  assert.deepEqual(errors, []);
});
