const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function start(ev) { ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0"); }

test('new cities exist, sit on land and have sellers, cables and IX members', () => {
  const { ev, errors } = load();
  start(ev);
  const ids = ['for', 'rio', 'bue', 'scl', 'lim', 'bog', 'pan', 'del', 'maa', 'blr', 'hyd', 'tpe', 'auh', 'fuj', 'cpt'];
  for (const c of ids) {
    assert.ok(ev(`!!CITY['${c}']`), c);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  }
  for (const c of ['for', 'rio', 'bue', 'scl', 'lim', 'bog', 'pan', 'maa', 'tpe', 'fuj', 'cpt'])
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
  assert.ok(ev("ixMembers('sao').includes('clr')&&ixMembers('del').includes('jio')&&ixMembers('tpe').includes('cht')"));
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

test('Asia-Pacific and Eastern Europe POPs exist with sellers', () => {
  const { ev } = load();
  start(ev);
  for (const c of ['mel', 'bne', 'drw', 'osa', 'kul', 'bkk', 'sgn', 'khi', 'dac', 'cbo', 'waw', 'prg', 'vie', 'bud', 'buh', 'tll', 'ist'])
    assert.ok(ev(`!!CITY['${c}']&&NETS.some(n=>n.price&&n.pops.includes('${c}'))`), c);
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
  ev("ACT.buildPop({city:'mex'});ACT.foundIx({city:'mex'});compute()");
  assert.equal(ev("ixCap('mex')"), 400);
  ev("ACT.myIxUp({city:'mex'});compute()");
  assert.equal(ev("ixCap('mex')"), 1600);
  assert.equal(ev("myFab('mex').max"), 20);
  ev("selectCity('mex');ACT.tab({t:'peer'})");
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
  assert.deepEqual(JSON.parse(ev("JSON.stringify(ixIdsIn('ams'))")), ['ams', 'ams~2', 'ams~3']);
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
  assert.match(t, /3 exchanges compete/);
  assert.match(t, /NL-Nyx/);
  ev("save();load2=JSON.parse(slotRaw(UI.slot));sanitize(load2)");
  assert.equal(ev("load2.ixp['ams~2']"), 1, 'saves keep challenger ports');
  ev("ACT.cancelIx({city:'ams~2'});ACT.cancelIx({city:'ams~2'})");
  assert.equal(ev("S.ixp['ams~2']"), undefined);
  assert.equal(ev("Object.keys(S.peers).some(k=>k.endsWith('@ams~2'))"), false);
  assert.deepEqual(errors, []);
});

test('Voda-Phony only peers for money now, and EU price wars cut port prices', () => {
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

test('Barcelona is wired up: a coastal cable, CDNs and a proper Tokyo challenger', () => {
  const { ev, errors } = load();
  assert.ok(ev("cablesFor('bcn','mrs').length>0&&cablesFor('lis','bcn').length>0"));
  assert.ok(ev("NET.fbk.pops.includes('bcn')&&NET.amz.pops.includes('bcn')"));
  assert.equal(ev("ixName('tok~2')"), 'Bento-IX');
  assert.ok(ev("ixMul('tok~2')<1"), 'challengers undercut the incumbent');
  assert.deepEqual(errors, []);
});

test('Korea: sender pays, pricey transit, Glitch leaves and Faceplant detours', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'icn'});ACT.buildPop({city:'sin'})");
  assert.ok(ev("regionMult('icn')>regionMult('sin')"), 'Seoul transit costs more than the rest of Asia');
  for (const n of ['ktt', 'skb', 'lgu']) {
    assert.equal(ev(`NET.${n}.pol`), 'paid');
    assert.match(ev(`peerOk('${n}','ix','icn').why`), /Sender pays/);
  }
  ev("S.pops.icn.bb={d:400};ACT.buyTransit({city:'icn',net:'ntt',tier:1});ACT.pni({city:'icn',net:'ktt',tier:1});S.pni[0].ready=S.day;compute()");
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
  assert.equal(ev("t1Need().length"), 7, 'new games need all seven, AT&Tease included (#155)');
  ev("S.t1v=2");
  assert.equal(ev("t1Need().length"), 6, 'saves from before AT&Tease keep six');
  ev("delete S.t1v");
  assert.equal(ev("t1Need().length"), 5, 'older saves keep five');
  assert.deepEqual(errors, []);
});

test('more UK and Norway: Manchester, Edinburgh, Bude and Stavanger with North Sea and Atlantic cables', () => {
  const { ev, errors } = load();
  for (const c of ['man', 'edi', 'bde', 'svg']) {
    assert.ok(ev(`!!CITY.${c}`), c);
    assert.ok(ev(`NETS.filter(n=>n.price&&n.pops.includes('${c}')).length`) >= 2, `${c} has transit sellers`);
  }
  for (const [a, b] of [['svg', 'edi'], ['dub', 'svg'], ['man', 'cph'], ['edi', 'rek'], ['nyc', 'bde'], ['bde', 'lag'], ['svg', 'ams']])
    assert.ok(ev(`cablesFor('${a}','${b}').length`) > 0, `${a}-${b} cable`);
  assert.ok(ev("subDfCable('svg','edi')"), 'NO-UK sells dark fiber pairs');
  assert.equal(ev("cablesFor('lon','par').length"), 2, 'two ways under the Channel');
  assert.ok(ev("['btt','sky','vmo'].every(n=>NET[n].pops.includes('man'))"));
  assert.deepEqual(errors, []);
});

test('#41 real coastlines: every city is on land, and the far view drops tiny islands but keeps every city', () => {
  const { ev, errors } = load();
  assert.deepEqual(JSON.parse(ev('JSON.stringify(CITIES.filter(c=>!onLand(c.x,c.y)).map(c=>c.id))')), [], 'no city in the sea');
  assert.ok(ev('LANDP_FAR.length') < ev('LANDP_ALL.length'), 'the far view is simpler');
  assert.equal(ev('CITIES.every(c=>COAST.some((p,i)=>inPoly(c.x,c.y,p)&&LANDP_FAR.includes(LANDP_ALL[i])))'), true, 'no city loses its island when zoomed out');
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
  // (raw delivery: Moscow is backhauled to transit in Frankfurt, which its users feel as latency on top)
  assert.ok(ev("R.citySrv.mos/R.cityDem.mos") > 0.99, `Moscow is fully served (${ev("R.citySrv.mos/R.cityDem.mos")})`);
  assert.ok(ev("R.latF.mos") < 1, 'and slow, with transit 2,000 km away');
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
  const br = JSON.parse(ev('JSON.stringify(CITIES.filter(c=>c.br).map(c=>c.id))'));
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
  assert.equal(ev('brIxN()'), 1, 'a Manaus port on a POP the backbone does not reach does not count');
  assert.equal(ev("scnProg().items[1].v"), 1, 'Manaus step done');
  ev("S.links.push({id:'y1',a:'sao',b:'mao',km:2700,sub:false,kind:'wave',tier:0,mo:1});compute()");
  assert.equal(ev('brIxN()'), 2, 'joined up, it counts');
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
  // the mainland: islands like St Helena have no exchange (#120)
  const af = JSON.parse(ev("JSON.stringify(CITIES.filter(c=>c.reg==='AF'&&c.land==='af').map(c=>c.id))"));
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

test('Australia: hard mode start in Sydney, dear transit and waves, cheap IX ports, NBN takes its cut', () => {
  const { ev, errors } = load();
  ev("showTitle()");
  assert.ok(ev("!!document.querySelector('#homeSel optgroup:first-child option[value=syd]')"), 'Sydney is among the suggested homes');
  ev("ACT.pickStart({city:'syd'});ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  assert.equal(ev('S.home'), 'syd');
  assert.equal(ev("regionMult('syd')"), 3, 'transit into Australia costs more than Asia');
  assert.ok(ev("regionMult('syd')>regionMult('sin')&&regionMult('syd')<regionMult('icn')"));
  assert.ok(ev("regionMult('akl')") < ev('AU_TRANSIT'), 'Auckland is not priced like Australia');
  assert.equal(ev("regionMult('akl')"), ev("Math.round(1.8*txComp('akl')*10)/10"), 'Auckland pays the Oceania price, adjusted for its market');
  assert.equal(ev("waveMarket('syd','lax',true).reg"), 2.6, 'any subsea wave touching Australia');
  assert.equal(ev("waveMarket('mel','syd',false).reg"), 1.8);
  assert.ok(ev("ixPortMo('syd',1)<PORT[1].ix"), 'IX ports are the cheap exception');
  ev("ACT.buildPop({city:'fra'});ACT.buyTransit({city:'syd',net:'tsy',tier:1});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.launchBB({city:'syd'});ACT.launchBB({city:'fra'});compute()");
  assert.ok(ev("R.cityEye.fra*sfOf(R,'fra')") > 0, 'Frankfurt homes pay too, with no cut');
  const syd = ev("R.cityEye.syd*sfOf(R,'syd')*EYE_RATE*AU_ARPU");
  assert.ok(syd > 0);
  assert.ok(Math.abs(ev('R.cost.wholesale') - syd * ev('AU_WHOLESALE')) < 1e-6, 'the wholesale cut only comes off Australian homes');
  assert.equal(ev("eyeP('syd')"), ev("CITY.syd.P*eraMul()"), 'no extra volume cut on top of city size');
  assert.deepEqual(errors, []);
});

test('Australia: new cities, Hobart only by cable, and the biggest local networks by users', () => {
  const { ev } = load();
  for (const c of ['adl', 'cbr', 'hba']) assert.ok(ev(`!!CITY['${c}']&&CITY['${c}'].au&&!!CITY['${c}'].ix`), c);
  assert.equal(ev("CITY.per.ix"), 'Beard-IX');
  assert.equal(ev("CITY.cbr.ix"), 'Capital-IX');
  assert.match(ev("siteName('syd','a')"), /^Next-Door-DC S[1-3]$/, 'the first building is a Next-Door-DC site');
  assert.match(ev("siteName('syd','b')"), /^Equinox SY[1-7]$/, 'the second building is an Equinox site');
  ev("S={asn:200004}");
  assert.equal(ev("siteName('syd','a')"), 'Next-Door-DC S1', 'the number follows the network, so it stays put');
  assert.equal(ev("siteName('syd','b')"), 'Equinox SY1');
  ev("S=null");
  assert.equal(ev("NET.opt.name"), 'Floptus');
  assert.ok(ev("CAB.avo.fragile"), 'the Perth–Singapore cable breaks more often');
  assert.ok(ev("['syd,mel','mel,adl','adl,per'].every(k=>CABLE_PAIRS.some(p=>p.cid==='smap'&&[p.a,p.b].sort().join()===k.split(',').sort().join()))"), 'SMAP goes round the south coast');
  assert.equal(ev("landMult('adl','per')"), 1.7, 'the Nullarbor makes land routes to Perth dearer');
  assert.ok(ev("landWhy('adl','per')").includes('1.7×'));
  assert.equal(ev("waveMarket('adl','per',true).reg"), 1.3, 'round the south coast to Perth is domestic, not overseas');
  assert.ok(ev("waveMo(kmBetween('adl','per'),false,1)*AU_WAVE.land*landMult('adl','per')") > ev("waveMo(CABLE_PAIRS.find(p=>p.cid==='smap'&&[p.a,p.b].sort().join()==='adl,per').km,true,1)*AU_WAVE.ew"), 'the Nullarbor costs a little more than the sea, because incumbents');
  assert.equal(ev("waveMarket('syd','mel',true).reg"), 2.6, 'other cables touching Australia keep the subsea price');
  assert.equal(ev("landMult('syd','mel')"), 1);
  assert.ok(ev("landWhy('per','syd')").includes('Nullarbor'));
  assert.equal(ev("CITY.drw.ix"), 'Gator-IX');
  assert.equal(ev("isSub('mel','hba')"), true, 'Bass Strait is the sea');
  assert.equal(ev("isSub('adl','per')"), false);
  assert.ok(ev("CABLE_PAIRS.some(p=>p.cid==='ferry'&&[p.a,p.b].sort().join()==='hba,mel')"));
  for (const id of ['sushi', 'aloha', 'avo']) assert.ok(ev(`CABLE_PAIRS.some(p=>p.cid==='${id}')`), id);
  const asn = { tsy: 1221, opt: 4804, tpr: 7545, abb: 4764, ddo: 9443, stb: 14593, spl: 38195, blg: 135887, spn: 18390, lpt: 134090, ext: 10143, voc: 4826 };
  for (const [id, a] of Object.entries(asn)) assert.equal(ev(`NET['${id}'].asn`), a, id);
  assert.ok(ev("NET.tsy.share>NET.tpr.share&&NET.tpr.share>NET.abb.share&&NET.abb.share>NET.ddo.share"), 'shares follow user counts');
});

test('Fibre to the Basement: own fibre skips the wholesale cut but pays the levy, and the goal needs five cities and two cables out', () => {
  const { ev, errors } = load();
  ev("ACT.startScn({id:'fttb',sure:1})");
  assert.equal(ev('S.scn.id'), 'fttb');
  assert.equal(ev('S.home'), 'syd');
  ev("S.cash=1e9;S.lvl=4;ACT.buyTransit({city:'syd',net:'tsy',tier:1});ACT.launchBB({city:'syd'});compute()");
  const rev = ev("R.cityEye.syd*sfOf(R,'syd')*EYE_RATE*AU_ARPU");
  assert.ok(rev > 0);
  assert.equal(ev('R.cost.wholesale'), 0, 'no wholesale cut on your own fibre');
  assert.ok(Math.abs(ev('R.cost.levy') - rev * ev('AU_LEVY')) < 1e-6, 'the levy instead');
  assert.equal(ev("SCN.find(s=>s.id==='fttb').ok()"), false);
  ev("for(const c of ['mel','bne','adl','per']){ACT.buildPop({city:c});ACT.launchBB({city:c});}");
  assert.equal(ev("SCN.find(s=>s.id==='fttb').ok()"), false, 'still needs cables overseas');
  ev("S.links.push({id:'x1',a:'syd',b:'tok',km:8000,sub:true,cable:'sushi',kind:'wave',tier:1,mo:1},{id:'x2',a:'per',b:'sin',km:4000,sub:true,cable:'avo',kind:'wave',tier:1,mo:1},{id:'x3',a:'mel',b:'hba',km:600,sub:true,cable:'ferry',kind:'wave',tier:1,mo:1})");
  assert.equal(ev('auExits()'), 2, 'Bass Strait does not count as overseas');
  assert.equal(ev("SCN.find(s=>s.id==='fttb').ok()"), false, 'still needs the traffic');
  ev('R.served=FTTB_G');
  assert.equal(ev("SCN.find(s=>s.id==='fttb').ok()"), true);
  assert.equal(ev("SCN_PROG.fttb().length"), 7);
  assert.deepEqual(errors, []);
});

test('Australian failures: cockatoos, kangaroos and emus cut land fiber, and routers meet spiders and upgrades', () => {
  const { ev, errors } = load();
  ev("ACT.pickStart({city:'syd'});ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.buildPop({city:'mel'});S.links=[];UI.via=null;UI.lmode='wave';openLinkModal('syd','mel');ACT.buildLink({tier:1});closeModal()");
  assert.equal(ev('S.links.length'), 1);
  const src = ev('fireFailure.toString()').replace(/^function fireFailure/, 'function');
  const AU = /cockatoo|kangaroo|backhoe|emus|Bushfire|copper/;
  ev('window.__cut=' + src.replace('type=pick(f);}', "type='cut';}"));
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) { ev('for(const l of S.links)l.cut=0;S.inc=[];__cut()'); seen = AU.test(ev("S.inc.map(x=>x.msg).join(' ')")); }
  assert.ok(seen, 'an Australian wildlife cut');
  seen = false;
  for (let i = 0; i < 80 && !seen; i++) { ev('for(const l of S.links)l.cut=0;S.inc=[];__cut()'); seen = /copper/.test(ev("S.inc.map(x=>x.msg).join(' ')")); }
  assert.ok(seen, 'copper thieves who find fiber');
  ev('window.__crash=' + src.replace('type=pick(f);}', "type='crash';}"));
  seen = false;
  for (let i = 0; i < 40 && !seen; i++) { ev('for(const c in S.pops){S.pops[c].down=0;S.pops[c].routers=1;}S.inc=[];__crash()'); seen = /Floptus|huntsman/.test(ev("S.inc.map(x=>x.msg).join(' ')")); }
  assert.ok(seen, 'an Australian router crash');
  assert.deepEqual(errors, []);
});

test('Australian peering follows PeeringDB: IX Straya and At-The-Edge IX in Sydney, incumbents peer only privately', () => {
  const { ev } = load();
  ev("ACT.start({})");
  assert.equal(ev("ixName('syd')"), 'IX Straya');
  assert.equal(ev("ixName('syd~2')"), 'At-The-Edge IX');
  const syd = JSON.parse(ev("JSON.stringify(ixMembers('syd'))")), edge = JSON.parse(ev("JSON.stringify(ixMembers('syd~2'))"));
  for (const n of ['tsy', 'opt', 'tpr', 'ddo', 'ext', 'sgt']) assert.ok(!syd.includes(n) && !edge.includes(n), `${n} only peers privately`);
  for (const n of ['nfx', 'ggl', 'cfl', 'abb', 'voc', 'spn', 'lpt']) assert.ok(syd.includes(n), `${n} on IX Straya`);
  for (const n of ['abb', 'voc', 'stb', 'spl', 'bdc']) assert.ok(edge.includes(n), `${n} on At-The-Edge IX`);
  const hba = JSON.parse(ev("JSON.stringify(ixMembers('hba'))"));
  assert.ok(hba.includes('cfl') && hba.includes('voc') && !hba.includes('nfx'), 'Hobart: Crowdflare and Hocus Pocus, but no NetChill');
  assert.ok(JSON.parse(ev("JSON.stringify(ixMembers('fra'))")).includes('nfx'), 'networks on every IX elsewhere are unchanged outside Australia');
  const sellers = JSON.parse(ev("JSON.stringify(NETS.filter(n=>CITIES.some(c=>c.au&&sellsAt(n,c.id))).map(n=>n.id).sort())"));
  assert.deepEqual(sellers, ['cog', 'drz', 'lvl', 'ntt', 'sgt', 'spl', 'tsy', 'voc'], 'only carriers that really sell transit in Australia');
  assert.ok(!ev("NET.ntt.pops.includes('per')"), 'NTT is only in Sydney');
  assert.ok(ev("['dsp','fnt','pft'].every(n=>NET[n].pops.includes('syd')&&!sellsAt(NET[n],'syd'))"), 'Pacific carriers backhaul to Sydney but do not sell transit there');
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
  assert.deepEqual(isl.filter(c => ev(`!!CITY['${c}'].ix`)), ['hnl', 'gum', 'hir', 'nou', 'suv']);
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

test('Atlantic islands and Halifax: real landings, real exchanges only, and island hops carry more per wave (#120)', () => {
  const { ev, errors } = load();
  start(ev);
  const isl = ['bda', 'pdl', 'tci', 'rai', 'jam'];
  for (const c of isl.concat('hfx')) {
    assert.ok(ev(`CABLE_PAIRS.some(p=>p.a==='${c}'||p.b==='${c}')`), `${c} has a cable`);
    assert.ok(ev(`NETS.some(n=>n.price&&n.pops.includes('${c}'))`), `${c} has a transit seller`);
  }
  for (const c of isl) assert.ok(ev(`isSub('${c}','lis')&&isSub('${c}','mia')&&isSub('${c}','dkr')`), `${c} is an island`);
  assert.equal(ev("isSub('hfx','mtl')"), false, 'Halifax is on the mainland');
  // exchanges only where one runs today: CVIXP in Praia and HFXIX in Halifax
  assert.deepEqual(isl.concat('hfx').filter(c => ev(`!!CITY['${c}'].ix`)), ['rai', 'hfx']);
  assert.equal(ev(`NETS.filter(n=>Array.isArray(n.ix)&&n.ix.some(c=>CITY[c]&&!CITY[c].ix&&${JSON.stringify(isl)}.includes(c))).length`), 0);
  // the real landings named in the issue
  const lands = (cid, a, b) => ev(`CABLE_PAIRS.some(p=>p.cid==='${cid}'&&[p.a,p.b].sort().join()==='${[a, b].sort().join()}')`);
  assert.ok(lands('hibx', 'hfx', 'lon') && lands('nuvem', 'bda', 'lis') && lands('sol', 'bda', 'pdl') && lands('ella', 'for', 'rai') && lands('equi', 'lag', 'jam'));
  assert.ok(lands('atl2', 'rai', 'dkr') && lands('atl2', 'dkr', 'tci') && lands('atl2', 'bue', 'for'));
  // old pairs stay where they were, so saved links keep their cable
  assert.equal(ev("CAB.hibx.pairs[0].slice(0,2).join()"), 'nyc,lon');
  assert.equal(ev("CAB.nuvem.pairs[0].slice(0,2).join()"), 'lis,atn');
  // every island network still reaches a Tier 1
  assert.equal(ev(`NETS.filter(n=>n.type!=='t1'&&n.pops.some(c=>${JSON.stringify(isl)}.includes(c))&&!(n.up||[]).some(u=>NET[u].type==='t1')&&!n.pops.some(c=>!${JSON.stringify(isl)}.includes(c))).map(n=>n.id).join()`), '');
  const hop = (path) => ev(`Math.min(...${JSON.stringify(path)}.slice(1).map((c,i)=>Math.max(...cablesFor(${JSON.stringify(path)}[i],c).map(p=>subCarrier(p.km)))))`);
  const direct = (a, b) => ev(`Math.max(...cablesFor('${a}','${b}').map(p=>subCarrier(p.km)))`);
  assert.equal(direct('mia', 'mad'), 1200);
  assert.equal(hop(['mia', 'bda', 'pdl', 'mad']), 1600, 'Florida to Spain via Bermuda and the Azores');
  assert.equal(hop(['mia', 'pdl', 'lis']), 1600, 'Florida to Lisbon via the Azores');
  assert.equal(direct('atn', 'lis'), 1200);
  assert.equal(hop(['atn', 'bda', 'lis']), 1600);
  // Equi-yes follows the coast close enough to fit 1.6T on its own; the Canaries hop matches it
  assert.equal(hop(['lis', 'tci', 'lag']), 1600, 'Lisbon to Lagos via the Canaries');
  assert.ok(hop(['lis', 'tci', 'lag']) >= direct('lis', 'lag'));
  assert.equal(direct('for', 'mad'), 1200);
  assert.equal(hop(['for', 'rai', 'lis']), 1600, 'Brazil to Europe via Cape Verde');
  assert.equal(hop(['nyc', 'hfx']), 3200);
  // the Bermuda Triangle has its own cuts
  ev("ACT.buildPop({city:'mia'});ACT.buildPop({city:'bda'});S.pops.mia.rgen=3;S.pops.bda.rgen=3;UI.via='sol';UI.route='same';openLinkModal('mia','bda');ACT.buildLink({tier:4});closeModal()");
  const l = ev("JSON.stringify(S.links.find(l=>l.a==='bda'||l.b==='bda'))");
  assert.ok(l && JSON.parse(l).sub, 'a subsea wave to Bermuda');
  // a town of 4,500 starts broadband below its ceiling, not above it
  ev("ACT.buildPop({city:'jam'});ACT.launchBB({city:'jam'})");
  assert.ok(ev("S.pops.jam.bb.d>0&&S.pops.jam.bb.d<=eyeP('jam')"));
  // the scenario starts in the Azores with 1.6T gear
  ev("ACT.startScn({id:'atl',sure:1})");
  assert.equal(ev('S.scn.id'), 'atl');
  assert.ok(ev('!!S.pops.pdl') && ev('S.lvl') >= 4);
  assert.equal(ev('scnProg().items.length'), 3);
  assert.equal(ev("fastPath('mia','mad',1600)"), false);
  ev("S.cash=1e9;for(const c of ['mia','bda','mad','lis','tci','lag']){ACT.buildPop({city:c});S.pops[c].rgen=3;}S.pops.pdl.rgen=3;");
  const wave = (a, b, via) => ev(`UI.via='${via}';UI.route='same';openLinkModal('${a}','${b}');ACT.buildLink({tier:4});closeModal();S.links.length`);
  wave('mia', 'bda', 'sol'); wave('bda', 'pdl', 'sol'); wave('pdl', 'mad', 'sol'); wave('lis', 'tci', 'ace'); wave('tci', 'lag', 'twoaf');
  ev('compute()');
  assert.equal(ev("fastPath('mia','mad',1600)"), true);
  assert.equal(ev("fastPath('lis','lag',1600)"), true);
  ev('cam.z=0.5;draw(0);cam.z=6;cam.x=CITY.bda.x;cam.y=CITY.bda.y;draw(0)');
  assert.deepEqual(errors, []);
});

test('subsea cable designs trade construction cost and time for previewed latency', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e10;S.lvl=4;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'lon'});ACT.buildPop({city:'nyc'});UI.lmode='df';UI.dfSrc='cable';openLinkModal('lon','nyc')");
    const quotes = JSON.parse(ev("JSON.stringify(['standard','optimized','express'].map(d=>seaQuote('lon','nyc',d)))"));
    assert.ok(quotes[0].ms > quotes[1].ms && quotes[1].ms > quotes[2].ms);
    assert.ok(quotes[1].cost >= quotes[0].cost * 3 && quotes[2].cost >= quotes[0].cost * 7);
    assert.ok(quotes[1].days >= Math.round(quotes[0].days * 1.3) && quotes[2].days >= Math.round(quotes[0].days * 1.7));
    assert.ok(quotes[2].days < 3 * 365, 'a low-latency Atlantic cable takes years, not most of a decade');
    assert.equal(quotes[2].ms, ev("Math.min(...cablesFor('lon','nyc').map(c=>linkLat({kind:'wave',km:c.km,cable:c.cid})))"), 'express competes with Hibernia');
    for (const q of quotes) assert.ok(dom.window.document.getElementById('modalCard').textContent.includes(q.ms.toFixed(1) + ' ms one-way'), 'every latency is visible before ordering');
    for (const [i, design] of ['standard', 'optimized', 'express'].entries()) {
      ev("UI.lmode='df';UI.dfSrc='cable';openLinkModal('lon','nyc')");
      ev(`document.querySelector('#modalCard [data-act=seaDesign][data-args*=${design}]').click()`);
      const cash = ev('S.cash'), day = ev('S.day');
      ev('ACT.orderCable()');
      const l = JSON.parse(ev('JSON.stringify(S.links[S.links.length-1])'));
      assert.equal(l.seaDesign, design);
      assert.equal(cash - ev('S.cash'), quotes[i].cost);
      assert.equal(l.ready - day, quotes[i].days);
      assert.equal(ev(`linkLat(S.links[S.links.length-1])`), quotes[i].ms);
      assert.equal(l.km, quotes[i].km);
      assert.match(l.trench, /^own:/, 'independent from the reference cable');
      ev('S=migrate(JSON.parse(JSON.stringify(S)))');
      assert.equal(ev('linkLat(S.links[S.links.length-1])'), quotes[i].ms, 'save round trip retains latency');
    }
    ev("UI.pending={a:'lon',b:'nyc'};UI.seaDesign='express';S.cash=seaQuote('lon','nyc','express').cost-1;window.__n=S.links.length;ACT.orderCable()");
    assert.equal(ev('S.links.length'), ev('__n'), 'premium funds checked at purchase');
    ev("S.links[0].seaDesign='bogus';S=sanitize(S)");
    assert.equal(ev('S.links[0].seaDesign'), 'standard');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('old owned cables keep their latency and premium designs work without a leased route', () => {
  const { ev, dom, errors } = load();
  try {
    ev('ACT.start({})');
    assert.equal(ev("linkLat({kind:'df',own:true,sub:true,km:6405})"), 6405 * 1.1 / 200);
    assert.equal(ev("linkLat({kind:'df',own:true,sub:false,seaDesign:'express',km:6405})"), 6405 * 1.1 / 200, 'land fiber is unchanged');
    const q = JSON.parse(ev("JSON.stringify(['standard','optimized','express'].map(d=>seaQuote('cbo','nyc',d)))"));
    assert.ok(q[0].ms > q[1].ms && q[1].ms > q[2].ms);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('submarine terminal and engineering upgrades commission independently and combine for Pacific reach', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;S.links.push({id:'pacific',a:'sin',b:'lax',kind:'df',own:true,sub:true,km:16608,sys:'roadm',ch:['tp16'],ready:0,cut:0,mo:1})");
    const before = ev("linkLat(S.links[0])"), cash = ev('S.cash');
    assert.equal(ev('dfCap(S.links[0])'), 400);
    ev("ACT.subUpgrade({id:'pacific',k:'terminal'})");
    assert.equal(cash - ev('S.cash'), 5000000);
    assert.equal(ev('dfCap(S.links[0])'), 400, 'no benefit during commissioning');
    const paid = ev('S.cash');
    ev("ACT.subUpgrade({id:'pacific',k:'terminal'})");
    assert.equal(ev('S.cash'), paid, 'cannot pay twice');
    ev('S.day=S.links[0].subterminal');
    assert.equal(ev("optG('tp16',{...S.links[0],km:12000})"), 800, 'terminals improve reach independently');
    assert.equal(ev('dfCap(S.links[0])'), 400, 'this Pacific route still needs engineering');
    ev("ACT.subUpgrade({id:'pacific',k:'engineering'})");
    assert.equal(paid - ev('S.cash'), 12000000 + 16608 * 1000);
    ev('S.day=S.links[0].subengineering-1');
    assert.equal(ev('dfCap(S.links[0])'), 400);
    ev('S.day++;compute()');
    assert.equal(ev('dfCap(S.links[0])'), 800, 'combined upgrades deliver 800G across 16,608 km');
    assert.equal(ev('linkLat(S.links[0])'), before, 'transmission upgrades do not change latency');
    ev('S=migrate(JSON.parse(JSON.stringify(S)))');
    assert.equal(ev('dfCap(S.links[0])'), 800, 'upgrades survive a save round trip');
    ev("UI.sel={type:'link',id:'pacific'};renderPanel()");
    assert.match(dom.window.document.getElementById('panelBody').textContent, /Premium submarine terminals/);
    assert.match(dom.window.document.getElementById('panelBody').textContent, /800 Gbps to 16,875 km/);
    assert.equal(ev("optG('tp16',{...S.links[0],km:12000,subterminal:undefined})"), 800, 'engineering also helps without premium terminals');
    assert.equal(ev("optG('tp16',{...S.links[0],km:7000})"), 1200, 'upgrades do not extend full-rate reach');
    assert.equal(ev("optG('zr4',{...S.links[0],km:5000})"), 0, 'router pluggables do not gain submarine terminal benefits');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('new subsea builds include chosen transmission packages in the quote and saved order', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e9;S.lvl=4;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'sin'});ACT.buildPop({city:'lax'});UI.lmode='df';UI.dfSrc='cable';openLinkModal('sin','lax')");
    // Across the Pacific, where the two packages together lift it from 400G to 800G (#198).
    const baseline = JSON.parse(ev("JSON.stringify(seaQuote('sin','lax'))"));
    ev("document.querySelector('#modalCard [data-act=seaPackage][data-args*=terminal]').click();document.querySelector('#modalCard [data-act=seaPackage][data-args*=engineering]').click()");
    const quote = JSON.parse(ev("JSON.stringify(seaQuote('sin','lax','standard',{terminal:true,engineering:true}))"));
    assert.equal(quote.days, baseline.days + 210);
    assert.equal(quote.cost, baseline.cost + 5000000 + 12000000 + baseline.km * 1000);
    assert.equal(quote.ms, baseline.ms);
    const cash = ev('S.cash');
    ev('ACT.orderCable()');
    const cable = JSON.parse(ev('JSON.stringify(S.links[S.links.length-1])'));
    assert.equal(cash - ev('S.cash'), quote.cost);
    assert.equal(cable.ready - ev('S.day'), quote.days);
    assert.equal(cable.subterminal, cable.ready);
    assert.equal(cable.subengineering, cable.ready);
    assert.equal(ev("subUpgradeReady(S.links[S.links.length-1],'terminal')"), false);
    ev('S=migrate(JSON.parse(JSON.stringify(S)));S.day=S.links[S.links.length-1].ready');
    assert.equal(ev("subUpgradeReady(S.links[S.links.length-1],'terminal')"), true);
    assert.equal(ev("subUpgradeReady(S.links[S.links.length-1],'engineering')"), true);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('submarine upgrades reject invalid purchases and preserve baseline and terrestrial optics', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e9;S.lvl=4;S.links.push({id:'land',a:'fra',b:'ams',kind:'df',own:true,km:7000,sys:'roadm',ch:['tp16'],ready:0},{id:'sea',a:'lon',b:'nyc',kind:'df',own:false,sub:true,km:7000,sys:'roadm',ch:['tp16'],ready:0})");
    const cash = ev('S.cash');
    ev("ACT.subUpgrade({id:'land',k:'terminal'});ACT.subUpgrade({id:'sea',k:'engineering'});ACT.subUpgrade({id:'land',k:'bogus'})");
    assert.equal(ev('S.cash'), cash);
    assert.equal(ev('dfCap(S.links[0])'), 800);
    assert.equal(ev('dfCap(S.links[1])'), 1200);
    ev("S.links[1].own=true;S.cash=1;ACT.subUpgrade({id:'sea',k:'terminal'})");
    assert.equal(ev('S.links[1].subterminal'), undefined, 'insufficient cash');
    ev("S.cash=1e9;S.lvl=3;ACT.subUpgrade({id:'sea',k:'terminal'})");
    assert.equal(ev('S.links[1].subterminal'), undefined, 'locked below level 4');
    ev("S.links[1].subterminal=-1;S.links[1].subengineering='yes';S.links[0].subterminal=0;S=sanitize(S)");
    assert.equal(ev('S.links[1].subterminal'), undefined);
    assert.equal(ev('S.links[1].subengineering'), undefined);
    assert.equal(ev('S.links[0].subterminal'), undefined);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('own subsea cables after #78: refunds of what was paid, upgrades a route needs, fresh choices', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e11;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0;for(const c of ['lon','nyc','syd'])if(!S.pops[c])ACT.buildPop({city:c})");
  const open = (a, b) => ev(`UI.pending=null;openLinkModal('${a}','${b}');ACT.ownCab()`);
  const q = (sel) => ev(`(()=>{const e=document.querySelector('#modalCard ${sel}');return e?e.textContent:null;})()`);
  // a low-latency cable called off at once returns 75% of what it really cost, not of a standard cable
  open('lon', 'nyc');
  assert.equal(ev("document.querySelectorAll('#modalCard button.start[data-act=seaDesign]').length"), 3, 'each design is one tappable card');
  ev("document.querySelector('#modalCard [data-act=seaDesign][data-args*=express]').click()");
  assert.match(q('button.start.on'), /Low latency/);
  const c0 = ev('S.cash'); ev('ACT.orderCable()');
  const lon = JSON.parse(ev("JSON.stringify(S.links.at(-1))")), paid = c0 - ev('S.cash');
  assert.equal(lon.seaDesign, 'express'); assert.equal(lon.paid, paid);
  assert.equal(ev('cabBack(S.links.at(-1))'), Math.round(paid * 0.75));
  assert.equal(ev('UI.seaDesign'), 'standard', 'the next order starts from the standard design');
  // its latency is worked out once per route, and stays the same
  const ms = ev('linkLat(S.links.at(-1))'); assert.equal(ev('linkLat(S.links.at(-1))'), ms); assert.ok(ev('SEA_XF.size') >= 1);
  // New York to Sydney needs premium terminals: the screen says so and will not order without them
  open('nyc', 'syd');
  assert.match(q('.why'), /Add Premium submarine terminals/);
  assert.doesNotMatch(ev("document.getElementById('modalCard').textContent"), /A leased .* wave on this route/, 'no leased wave reaches that far, so no comparison with one');
  assert.equal(ev("document.querySelector('#modalCard [data-act=orderCable]').disabled"), true);
  const n = ev('S.links.length'); ev('ACT.orderCable()'); assert.equal(ev('S.links.length'), n, 'the order itself checks too');
  ev("document.querySelector('#modalCard [data-act=seaPackage][data-args*=terminal]').click()");
  assert.equal(q('.why'), null); assert.match(q('[data-act=seaPackage][data-args*=terminal]'), /\+30 days/);
  // leaving and coming back to another route starts fresh
  open('lon', 'nyc'); assert.equal(ev('!!UI.seaterminal'), false);
  open('nyc', 'syd'); ev("document.querySelector('#modalCard [data-act=seaPackage][data-args*=terminal]').click();ACT.orderCable()");
  const syd = JSON.parse(ev("JSON.stringify(S.links.at(-1))"));
  assert.equal(syd.b, 'syd'); assert.equal(syd.subterminal, syd.ready);
  ev('S.day=S.links.at(-1).ready'); assert.equal(ev("optG('tp16',S.links.at(-1))"), 400, 'lit across 18,387 km');
  // engineering adds nothing once the terminals light it (#198); upgrades bought later count toward the price
  ev("S.links.at(-1).subengineering=undefined;ACT.subUpgrade({id:S.links.at(-1).id,k:'engineering'})");
  assert.equal(ev('S.links.at(-1).paid'), syd.paid);
  ev("S.links.at(-1).subterminal=undefined;ACT.subUpgrade({id:S.links.at(-1).id,k:'engineering'})");
  assert.ok(ev('S.links.at(-1).paid') > syd.paid);
  // sanitize keeps a sane price and drops junk
  ev("S.links.at(-1).paid='lots';S.links[0].paid=-5;S=sanitize(S)");
  assert.equal(ev('S.links.at(-1).paid'), undefined); assert.equal(ev('S.links[0].paid'), undefined);
  // advice about upgrades only on cables you own
  ev("S.links.push({id:'iru',a:'lon',b:'nyc',kind:'df',own:false,sub:true,km:30000,sys:'roadm',ch:[],ready:0,cut:0,mo:1})");
  assert.doesNotMatch(ev("chWhy(S.links.at(-1),'tp16')"), /submarine terminals/);
  assert.deepEqual(errors, []);
});

test('Down Under: routers upside down, BrisVegas, Next-Door-DC and everything trying to kill you', () => {
  const { ev, errors } = load();
  start(ev);
  // the router is drawn rotated half a turn in Australian cities only
  ev("S.nextFail=1e9;S.nextEvent=1e9;for(const c of ['syd','bne'])ACT.buildPop({city:c})");
  assert.match(ev("S.log.find(e=>/Router installed in Sydney/.test(e.t)).t"), /upside down|turned it over/i);
  assert.equal(ev("S.log.filter(e=>/Router installed/.test(e.t)).length"), 2, 'one note per Australian POP');
  ev("ACT.buildPop({city:'lon'})");
  assert.equal(ev("S.log.filter(e=>/Router installed/.test(e.t)).length"), 2, 'London routers stay the right way up');
  const turns = c => ev(`(()=>{let n=0;const r=ctx.rotate;ctx.rotate=a=>{if(Math.abs(a-Math.PI)<1e-9)n++;return r.call(ctx,a);};try{const C=CITY['${c}'];drawCity(C,100,100,1,0);}finally{ctx.rotate=r;}return n;})()`);
  assert.equal(turns('syd'), 1, 'Sydney: upside down');
  assert.equal(turns('lon'), 0, 'London: the right way up');
  // BrisVegas, Megapork's home town, and the data centres
  assert.match(ev("CITY.bne.note"), /BrisVegas/); assert.match(ev("CITY.bne.note"), /Megapork/);
  assert.match(ev("FABS.find(f=>f.id==='mgp').blurb"), /BrisVegas/);
  assert.match(ev("siteName('bne','b')"), /^Next-Door-DC B[12]$/);
  assert.equal(ev("siteName('cbr','b')"), 'Next-Door-DC C1');
  // everything is trying to kill you: the new outages can come up on Australian links and POPs
  const src = ev("document.documentElement.innerHTML");
  for (const s of ['drop bear', 'eastern brown snake', 'Magpie swooping', 'Box jellyfish', 'Vegemite as thermal paste', 'brought Marmite', 'four o’clock storm']) assert.ok(src.includes(s), s);
  assert.match(ev("ixName('syd~2')"), /At-The-Edge/); assert.match(ev("XIX.find(x=>x.id==='syd~2').blurb"), /Vegemite/);
  ev('cam.z=2;draw(0);cam.z=0.4;draw(0)');
  assert.deepEqual(errors, []);
});

test('South Island: Christchurch and Invercargill, Cook Strait, the ring cable and the local hazards', () => {
  const { ev, errors } = load();
  start(ev);
  for (const c of ['chc', 'ivc']) assert.equal(ev(`CITY.${c}.land`), 'nzs', `${c} is on the South Island`);
  assert.equal(ev("isSub('chc','ivc')"), false, 'fiber by land down the island');
  assert.equal(ev("isSub('akl','chc')"), true, 'Cook Strait is in the way');
  assert.ok(ev("ixIdsIn('chc').length===1&&ixMembers('chc').includes('spk')"), 'Christchurch has a real exchange');
  assert.equal(ev("ixIdsIn('ivc').length"), 0, 'Invercargill has none');
  assert.ok(ev("NETS.some(n=>n.price&&n.pops.includes('chc'))"), 'someone sells transit in Christchurch');
  assert.ok(ev("CABLE_PAIRS.some(p=>[p.a,p.b].sort().join()==='akl,chc')"), 'Cook Strait cable');
  for (const c of ['syd', 'mel', 'akl']) assert.ok(ev(`CABLE_PAIRS.some(p=>[p.a,p.b].sort().join()===['ivc','${c}'].sort().join())`), `ring to ${c}`);
  assert.match(ev("CITY.ivc.dc"), /Sheargrid/);
  // a cut on a South Island land link comes with the local wildlife
  ev("S.nextFail=1e9;S.nextEvent=1e9;for(const c of ['chc','ivc'])ACT.buildPop({city:c});UI.via=null;UI.route='same';UI.lmode=null;openLinkModal('chc','ivc');ACT.buildLink({tier:1});closeModal()");
  assert.equal(ev("S.links.filter(l=>!l.sub&&[l.a,l.b].sort().join()==='chc,ivc').length"), 1, 'land link built');
  const msgs = new Set();
  for (let i = 0; i < 80; i++) { ev("S.inc=[];S.links.forEach(l=>l.cut=0);for(const p of Object.values(S.pops))p.down=0;fireFailure()"); msgs.add(ev("S.inc.filter(i=>i.type==='cut').map(i=>i.msg).join()")); }
  assert.ok([...msgs].some(m => /kea|sandflies|post-hole/.test(m)), [...msgs].join(' | '));
  ev('cam.z=2;draw(0)');
  assert.deepEqual(errors, []);
});

test('an old save with Australian POPs is told once that Australia changed', () => {
  const a = load();
  start(a.ev);
  a.ev("ACT.buildPop({city:'syd'});for(let d=0;d<3;d++)dayTick();delete S.auV;save()");
  const sv = a.ev("slotRaw(UI.slot)");
  const { ev, errors } = load({ storage: { 'sot-save-v1': sv } });
  assert.match(ev("S.log.map(e=>e.t).join(' | ')"), /Australia got more Australian/);
  assert.equal(ev("S.auV"), 1);
  assert.equal(ev("S.auNews"), undefined, 'only once');
  const again = load({ storage: { 'sot-save-v1': ev("save();slotRaw(UI.slot)") } });
  assert.equal(again.ev("S.log.filter(e=>/Australia got more Australian/.test(e.t)).length"), 1, 'not told twice');
  // a new game never sees it, and neither does a save without Australia
  const b = load(); start(b.ev); b.ev("for(let d=0;d<3;d++)dayTick();delete S.auV;save()");
  const c = load({ storage: { 'sot-save-v1': b.ev("slotRaw(UI.slot)") } });
  assert.doesNotMatch(c.ev("S.log.map(e=>e.t).join(' | ')"), /Australia got more/);
  assert.deepEqual(errors, []);
});

test('city density: no small city crowds a bigger one, Brazil is slimmer than Europe, and old saves keep retired cities', () => {
  const { ev, errors } = load();
  // A small city (P < 60) never sits within 300 km of a bigger city in the same country, unless it is a cable landing or a capital.
  const bad = JSON.parse(ev(`JSON.stringify((()=>{const ctry=c=>c.cc||(c.br&&'BR')||(c.au&&'AU')||(c.ca&&'CA')||'land:'+c.land,out=[];
    for(const c of CITIES){if(c.off||c.P>=60||c.capital||landing(c.id))continue;
      for(const o of CITIES)if(o!==c&&!o.off&&o.P>c.P&&ctry(o)===ctry(c)&&kmBetween(c.id,o.id)<300)out.push(c.id+' near '+o.id+' ('+kmBetween(c.id,o.id)+' km)');}
    return out;})())`));
  assert.deepEqual(bad, [], 'add a bigger city, a capital flag or a cable landing, or mark it off');
  const br = ev("CITIES.filter(c=>c.br&&!c.off).length"), eu = ev("CITIES.filter(c=>c.reg==='EU'&&!c.off).length");
  assert.ok(br < eu * 0.7, `Brazil (${br}) well below Europe (${eu})`);
  // a new game never shows or offers a retired city
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0");
  assert.equal(ev("cityOn('cpv')"), false);
  assert.equal(ev("OFFC.includes('cpv')"), false);
  assert.equal(ev("NETS.some(n=>{const p=netPlaces(n.id);return p.x.includes('cpv')||p.p.includes('cpv');})"), false);
  // an old save with a POP there keeps it, on the map and in routing
  ev("ACT.buildPop({city:'rec'});S.pops.cpv={day:0,bb:{d:5},boost:0,down:0,routers:1,gen:false};const o=JSON.parse(JSON.stringify(S));S=migrate(o);compute()");
  assert.ok(ev("!!S.pops.cpv&&cityOn('cpv')"));
  assert.ok(ev("R.cityDem.cpv>0"));
  ev('cam.x=CITY.cpv.x;cam.y=CITY.cpv.y;cam.z=6;draw(0)');
  assert.deepEqual(errors, []);
});

test('prices follow real connectivity: thin markets cost more, hubs stay put', () => {
  const { ev, errors } = load();
  start(ev);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(Object.keys(CITY_PDB).filter(c=>!CITY[c]))')), [], 'every entry is a city on the map');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(CITIES.filter(c=>!CITY_PDB[c.id]).map(c=>c.id))')), [], 'every city has data, so none keeps the plain price by accident');
  assert.ok(ev('Object.values(CITY_PDB).every(q=>Array.isArray(q)&&q.length===3&&q.every(x=>Number.isInteger(x)&&x>=0)&&q[1]>=0)'), '[facilities, presences, ASNs], whole numbers');
  // The cities that used to have none: thin markets cost more than Frankfurt, and the Arctic has no neutral data center.
  for (const c of ['dus', 'rix', 'mct', 'mle', 'fuk', 'sju', 'kin', 'anc', 'tik']) assert.ok(ev(`txComp('${c}')`) > 1, `${c} is no hub`);
  for (const c of ['brw', 'tik', 'pvs', 'hav']) assert.equal(ev(`colo('${c}')`), 1.5, `${c}: no carrier-neutral data center`);
  assert.ok(ev("txComp('dus')") < ev("txComp('rix')") && ev("txComp('rix')") < ev("txComp('mle')"), 'Düsseldorf, Riga, Malé: ever thinner');
  // A city without data keeps the plain regional price.
  assert.equal(ev("(()=>{const q=CITY_PDB.fra;delete CITY_PDB.fra;const r=[txComp('fra'),colo('fra'),popMo('fra')];CITY_PDB.fra=q;return r.join()})()"), `1,1,${ev('POP_MO')}`);
  assert.equal(ev("regionMult('syd')"), ev('AU_TRANSIT'), 'Australia keeps its hand-set transit price');
  for (const c of ['fra', 'ams', 'lon', 'nyc']) assert.equal(ev(`txComp('${c}')`), 1, `${c} is a hub`);
  assert.equal(ev("regionMult('sao')"), 1.6, 'São Paulo keeps the South American price');
  assert.ok(ev("regionMult('rbr')") > ev("regionMult('sao')") * 1.5, 'Rio Branco has few sellers');
  assert.ok(ev("txComp('rbr')") <= 1.8);
  assert.equal(ev("colo('rbr')"), 1.5, 'no neutral data center');
  assert.equal(ev("popCost('rbr')"), ev('POP_COST') * 1.5);
  assert.equal(ev("popMo('fra')"), ev('POP_MO'));
  ev("ACT.buildPop({city:'rbr'});compute()");
  assert.ok(ev('R.cost.pops') >= ev("popMo('rbr')"), 'running cost uses the city rent');
  ev("selectCity('rbr')");
  assert.ok(ev("CITY_PDB.sao[2]>=2000&&CITY_PDB.nyc[2]>=2000&&CITY_PDB.kgl[2]<2000"), 'Brazil and the US are dense in ASNs, Rwanda is not');
  assert.deepEqual(errors, []);
});
