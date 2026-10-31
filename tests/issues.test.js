const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function base(ev) {
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
}

test('#4 several transits in one city share the load instead of filling one by one', () => {
  const { ev, errors } = load();
  base(ev);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'lvl',tier:1});compute()");
  const u = JSON.parse(ev("JSON.stringify(S.transit.map(t=>R.useT[t.id]||0))"));
  assert.equal(u.length, 2);
  assert.ok(u[0] > 0 && u[1] > 0, `both carry traffic (${u})`);
  assert.ok(Math.abs(u[0] - u[1]) / (u[0] + u[1]) < 0.35, `roughly balanced (${u})`);
  // local exits still win over far ones: a transit in London is not used while Frankfurt has room
  ev("ACT.buildPop({city:'lon'});UI.via=null;openLinkModal('fra','lon');ACT.buildLink({tier:3});closeModal();ACT.buyTransit({city:'lon',net:'tly',tier:1});compute()");
  assert.equal(ev("R.useT[S.transit.find(t=>t.city==='lon').id]||0"), 0, 'remote transit stays idle');
  // backup-only still means backup only
  ev("S.transit[1].pref='low';compute()");
  assert.equal(ev("R.useT[S.transit[1].id]||0"), 0);
  assert.deepEqual(errors, []);
});

test('#5 export writes a file and import restores it, with checks', () => {
  const { ev, dom, errors } = load();
  const window = dom.window;
  base(ev);
  ev("S.name='Export Me';S.cash=1234567;compute()");
  let blobText = null;
  window.URL.createObjectURL = b => { blobText = b; return 'blob:x'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; };
  ev("ACT.exportSave()");
  assert.match(window.__dl, /^series-of-tubes-export-me-\d{4}-\d\d-\d\d\.json$/);
  const txt = ev("JSON.stringify({app:'series-of-tubes',version:APP_VERSION,S})");
  assert.ok(blobText);
  ev("S.cash=1;S.name='Other'");
  assert.match(ev(`parseSave('{"nope":1}').err`), /does not look/);
  assert.match(ev(`parseSave('not json').err`), /not valid JSON/);
  assert.match(ev(`parseSave(JSON.stringify(Object.assign(JSON.parse(${JSON.stringify(txt)}).S,{lost:true}))).err`), /bankrupt/);
  ev(`UI.importing=parseSave(${JSON.stringify(txt)}).s;ACT.importGo()`);
  assert.equal(ev("S.name"), 'Export Me');
  assert.equal(ev("S.cash"), 1234567);
  assert.equal(ev("JSON.parse(slotRaw(UI.slot)).name"), 'Export Me', 'saved on this device');
  ev("showHelp()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Export save.*Import a save/);
  assert.deepEqual(errors, []);
});

test('#6 full transit, IX, caches and routers show up in the NOC and on the map', () => {
  const { ev, errors } = load();
  base(ev);
  ev("S.pops.fra.bb.d=5000;ACT.buyTransit({city:'fra',net:'cog',tier:0});ACT.buyIx({city:'ams',tier:0,signed:true});S.caches.push({id:'cx',city:'fra',net:'akm'});compute()");
  ev("R.nodeLoad.fra=R.nodeCap.fra;UI.hotMap=hotByCity()");
  const ks = JSON.parse(ev("JSON.stringify(hotPorts().map(h=>h.k))"));
  for (const k of ['t', 'c', 'r']) assert.ok(ks.includes(k), `${k} is reported hot (${ks})`);
  assert.ok(ev("UI.hotMap.fra&&UI.hotMap.fra.t>=0.9"));
  ev("ACT.leftTab({t:'noc'})");  // NOC reads R as it is now (router forced hot above)
  const noc = ev("document.getElementById('leftBody')?document.getElementById('leftBody').textContent:document.body.textContent");
  assert.match(noc, /running hot/);
  assert.match(noc, /Akamaybe Box cache/);
  assert.match(noc, /transit/);
  ev("draw&&draw(performance.now())");
  assert.deepEqual(errors, []);
});

test('some routers take forever to boot, PacketOinkers most of all', () => {
  const { ev, errors } = load();
  base(ev);
  const pct = JSON.parse(ev("JSON.stringify(RG.map((G,g)=>{let n=0;for(const c of ALLC){S.pops[c]=S.pops[c]||{rgen:g,routers:1};S.pops[c].rgen=g;if(slowBoot(c))n++;}return n/ALLC.length;}))"));
  assert.ok(pct[0] < pct[2] && pct[2] > 0.2 && pct[0] < 0.3, `bigger chassis are slow more often (${pct})`);
  assert.match(ev("RG[2].chip"), /PacketOinker/);
  // find a slow and a fast POP and crash them
  ev("for(const c of ALLC)if(c!=='fra')delete S.pops[c];S.pops.fra.rgen=2;S.pops.fra.routers=1");
  const slowCity = ev("ALLC.find(c=>{S.pops[c]={rgen:2,routers:1,down:0};const s=slowBoot(c);if(!s)delete S.pops[c];return s;})");
  ev(`for(const c of Object.keys(S.pops))if(c!=='${slowCity}')delete S.pops[c];S.transit=[];S.ixp={};for(let i=0;i<800&&!S.inc.some(x=>x.type==='crash');i++){fireFailure();S.inc=S.inc.filter(x=>x.type==='crash');}`);
  const inc = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='crash'))"));
  assert.ok(inc.slow, 'crash on a slow booter is flagged');
  assert.ok(inc.until - ev('S.day') >= 4, 'and lasts longer');
  ev(`S.cash=1e6;ACT.fixInc({id:'${inc.id}'})`);
  assert.equal(ev(`S.inc.find(i=>i.id==='${inc.id}').until`), ev('S.day+1'), 'rushing it still takes a day');
  ev(`selectCity('${slowCity}');ACT.tab({t:'infra'})`);
  assert.match(ev("document.getElementById('panelBody').textContent"), /a slow one/);
  assert.deepEqual(errors, []);
});

test('the network name opens a menu with save, load and start over', () => {
  const { ev, errors } = load();
  base(ev);
  ev("document.querySelector('[data-act=menu]').click()");
  const t = ev("document.getElementById('modalCard').textContent");
  for (const w of ['Export save', 'Import a save', 'Start a new network', 'Back to the map']) assert.ok(t.includes(w), w);
  ev("document.querySelector('#modalCard [data-act=resetAsk]').click()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /cannot be undone/);
  ev("document.querySelector('#modalCard [data-act=newgame]').click()");
  assert.equal(ev("!!slotRaw(UI.slot)&&JSON.parse(slotRaw(UI.slot)).day>0"), false);
  assert.deepEqual(errors, []);
});

test('a rare global outage shows a banner, dents traffic and only happens once', () => {
  const { ev, errors } = load();
  base(ev);
  ev("compute()");const before = ev("R.demand");
  ev("elephant();compute();renderAll()");
  assert.ok(ev("R.demand") < before * 0.8);
  assert.equal(ev("document.getElementById('mega').hidden"), false);
  for (let i = 0; i < 5; i++) ev("dayTick()");
  ev("renderAll()");
  assert.equal(ev("document.getElementById('mega').hidden"), true);
  assert.equal(ev("S.phpDone"), true);
  assert.deepEqual(errors, []);
});

test('badges unlock with a rarity, persist across games, and secret ones stay hidden', () => {
  const { ev, errors } = load();
  base(ev);
  ev("localStorage.removeItem('sot-badges');S.ach={};compute();checkGoals();ACT.leftTab({t:'goals'})");
  let txt = ev("document.body.textContent");
  assert.match(txt, /Badges/);
  assert.match(txt, /\?\?\?/, 'secret badges are hidden');
  ev("ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'});compute();checkGoals()");
  assert.ok(ev("S.ach.hello!==undefined"), 'first peering badge');
  assert.ok(ev("!!JSON.parse(localStorage.getItem('sot-badges')).hello"), 'remembered across games');
  ev("S.stats.sharks=3;checkGoals()");
  assert.ok(ev("S.ach.bait!==undefined&&S.ach.shark!==undefined"));
  ev("ACT.leftTab({t:'goals'})");
  txt = ev("document.body.textContent");
  assert.match(txt, /Legendary/);
  assert.equal(ev("GOALS.some(g=>g.id==='gi')&&GOALS.some(g=>g.id==='t10')"), true);
  assert.equal(ev("document.getElementById('hBank').className"), 'badge');
  assert.deepEqual(errors, []);
});

test('Auto-TE spills overflow onto an alternate path when the shortest one is full', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','lon','par'])ACT.buildPop({city:c});const L=(a,b,t,v)=>{UI.via=v||null;openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};L('fra','ams',0);L('ams','lon',1,'uly');L('fra','par',1);L('par','lon',1,'chn');ACT.buyTransit({city:'lon',net:'lvl',tier:1});compute()");
  const dem = ev("R.demand");
  assert.ok(ev("R.served") < dem - 1, 'without TE the 10G link caps it');
  // Auto-TE needs an RSVP-TE backbone, and routers that can run it: Chonk 800s.
  ev("for(const c in S.pops)S.pops[c].rgen=RG.findIndex(r=>r.n==='Chonk 800');ACT.coreUp();ACT.coreUp();ACT.buyTE();compute()");
  assert.ok(ev("R.served") > dem * 0.97, 'with TE nearly everything is served');
  assert.ok(ev("R.teMoved") > 1);
  assert.ok(ev("R.load[S.links.find(l=>l.a==='fra'&&l.b==='par').id]") > 1, 'the Paris path carries the overflow');
  ev("ACT.leftTab({t:'noc'})");
  assert.match(ev("document.body.textContent"), /Auto-TE/);
  ev("ACT.teToggle();compute()");
  assert.ok(ev("R.served") < dem - 1, 'switching it off goes back to shortest path only');
  assert.deepEqual(errors, []);
});

test('rare badges hook into incidents and deals', () => {
  const { ev, errors } = load();
  base(ev);
  ev("addInc({type:'cut',ref:'x',until:S.day+1,msg:'A crocodile took a bite. A ship dragged its anchor.'});checkGoals()");
  assert.ok(ev("S.ach.croc!==undefined&&S.ach.anchor!==undefined&&S.ach.backhoe===undefined"), "a cut alone earns no Met the Chaos Monkey");
  ev("S.stats.survived=100;checkGoals()");
  assert.ok(ev("S.ach.unbreak!==undefined"));
  assert.equal(ev("BADGES.length>=46&&new Set(BADGES.map(b=>b.id)).size===BADGES.length"), true);
  assert.deepEqual(errors, []);
});

test('#7 NOC legend, sortable network table and transit destinations', () => {
  const { ev, errors } = load();
  base(ev);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});compute();ACT.dash();ACT.dashTab({k:'traffic'})");
  let t = ev("document.getElementById('dashCard').textContent");
  assert.match(t, /Who your transit carries/);
  assert.match(t, /IX peering/, 'legend explains the colours');
  const top = JSON.parse(ev("JSON.stringify(transitTop(S.transit.map(t=>t.id),3))"));
  assert.ok(top.length > 0 && top[0][1] > 0);
  assert.equal(ev(`typeof offTransitHint('${top[0][0]}','fra')`), 'string');
  ev("ACT.dashSort({k:'cost'})");
  assert.equal(ev("UI.dashSort"), 'cost');
  ev("ACT.dashSort({k:'cost'})");
  assert.equal(ev("UI.dashDir"), 1, 'second tap flips the order');
  ev("selectCity('fra');ACT.tab({t:'up'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Top destinations on this port/);
  assert.deepEqual(errors, []);
});

test('#11 pausing freezes the dots on the links', () => {
  const { ev, errors } = load();
  base(ev);
  ev("ACT.animSet({v:'on'});UI.speed=1;last=1000;frame(1016)");
  const t0 = ev("animT");
  ev("UI.speed=0;frame(1100);frame(1400)");
  assert.equal(ev("animT"), t0, 'clock stands still while paused');
  ev("UI.speed=1;frame(1416)");
  assert.ok(ev("animT") > t0, 'and moves again on play');
  assert.deepEqual(errors, []);
});

test('#16 shark-averse customers only ask for routes that can stay on land', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  ev("for(const c of ['ams','lon','nyc','ash','chi','sjc','sin','tok','syd','sao','jnb','bom','par','mad'])ACT.buildPop({city:c})");
  let shark = 0, bad = [];
  for (let i = 0; i < 1500; i++) {
    const o = JSON.parse(ev("S.offers=[];spawnOffer();JSON.stringify(S.offers.filter(o=>(o.reqs||[]).includes('sharks')).map(o=>[o.city,o.city2]))"));
    // isSub, not .land: Cairo sits on two landmasses, so Mumbai to Cairo stays on land.
    for (const [a, b] of o) { shark++; if (ev(`isSub('${a}','${b}')`)) bad.push(a + '-' + b); }
  }
  assert.ok(shark > 0, 'the requirement still shows up');
  assert.deepEqual(bad, [], 'never across an ocean');
  // old saves: an impossible ask is dropped, a possible one stays
  const s = ev("JSON.stringify(Object.assign(JSON.parse(JSON.stringify(S)),{offers:[{id:'o1',type:'l2vpn',city:'nyc',city2:'lon',name:'x',bw:10,rate:1,reqs:['sharks','gen'],exp:S.day+9},{id:'o2',type:'l2vpn',city:'nyc',city2:'chi',name:'y',bw:10,rate:1,reqs:['sharks'],exp:S.day+9}]}))");
  const m = JSON.parse(ev(`JSON.stringify(migrate(${s}).offers.map(o=>o.reqs))`));
  assert.deepEqual(m, [['gen'], ['sharks']]);
  assert.deepEqual(errors, []);
});

test('#28 scenic routing stays put, and splits over two equally quiet paths', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','lon','par'])ACT.buildPop({city:c});const L=(a,b,t,v)=>{UI.via=v||null;openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};L('fra','ams',1);L('ams','lon',1,'uly');L('fra','par',1);L('par','lon',1,'chn')");
  ev("S.biz.push({id:'bulk1',type:'bulk',name:'Sloth Sync',city:'fra',city2:'lon',bw:60,rate:1000,reqs:[],route:'scenic',mood:100,start:S.day});compute()");
  const loads = () => JSON.parse(ev("JSON.stringify(['fra|par','ams|fra'].map(k=>Math.round((R.ef[k]&&R.ef[k].eg['l2:bulk1'])||0)))"));
  const seen = [];
  for (let d = 0; d < 6; d++) { ev('compute()'); seen.push(loads().join('/')); }
  assert.equal(new Set(seen).size, 1, `no flapping day to day (${seen})`);
  const [viaPar, viaAms] = loads();
  assert.ok(viaPar > 0 && viaAms > 0, `both quiet paths carry it (${viaPar}/${viaAms})`);
  assert.equal(ev("R.l2['bulk1']"), 60, 'the whole circuit is delivered');
  ev("selectCity('fra');ACT.tab({t:'cust'})");
  assert.deepEqual(errors, []);
});

test('#17 #30 very long dark fiber runs in long-haul mode, and regen sites bring full speed back', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  // a 4,500+ km terrestrial dark fiber with a ROADM, like the one in #30
  ev("ACT.buildPop({city:'mos'});S.links.push({id:'lf',a:'lis',b:'mos',kind:'df',km:4551,sys:'roadm',ch:[],ready:0,mo:1000,day:0,cut:0});ACT.buildPop({city:'lis'});S.pops.lis.rgen=3;S.pops.mos.rgen=3;compute()");
  assert.equal(ev("chWhy(S.links.find(l=>l.id==='lf'),'tp16')"), '', 'the transponder fits now');
  ev("ACT.addCh({id:'lf',o:'tp16'});compute()");
  assert.equal(ev("dfCap(S.links.find(l=>l.id==='lf'))"), 1200, 'long-haul mode: 1.2T per channel');
  ev("ACT.regen({id:'lf',d:1});compute()");
  const l = "S.links.find(l=>l.id==='lf')";
  assert.equal(ev(`${l}.regen`), 1);
  assert.equal(ev(`spanKm(${l})`), 2276);
  assert.equal(ev(`dfCap(${l})`), 1600, 'one regen site: full 1.6T again');
  assert.ok(ev("R.cost.optical") >= ev("REGEN_MO"), 'regen huts cost rent');
  assert.match(ev("chWhy({km:20000,regen:0,sys:'roadm',ch:[],a:'lis',b:'mos'},'zr4')"), /regen site/, 'hopeless spans say what to do');
  // removing a regen site that optics still need is refused
  ev("S.links.find(l=>l.id==='lf').km=15000;ACT.regen({id:'lf',d:-1})");
  assert.equal(ev(`${l}.regen`), 1);
  ev("ACT.selLink({id:'lf'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Regen sites/);
  assert.deepEqual(errors, []);
});

test('LACP trouble, partial packet loss and PMTUD black holes fire, hurt and clear', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("ACT.buildPop({city:'ams'});UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.lagT({id:S.transit[0].id,d:1});ACT.buyIx({city:'ams',tier:1});ACT.lagIx({city:'ams',d:1});S.day=100;compute()");
  const src = ev('fireFailure.toString()').replace(/^function fireFailure/, 'function').replace('let tot=opts.reduce', "opts.splice(0,opts.length,['funny',1]);let tot=opts.reduce");
  const fire = (t) => { ev('window.__ff=' + src.replace('type=pick(f);}', `type='${t}';}`)); ev('__ff();compute()'); };
  for (let i = 0; i < 12; i++) { fire('lacp'); }
  assert.ok(ev("S.inc.some(i=>i.type==='lacp')"), 'LACP incidents fire');
  assert.ok(ev("S.transit[0].lacp||S.ev.ixlacp"), 'a LAG is degraded');
  fire('loss');
  const l = "S.links.find(l=>l.loss)";
  if (ev(`!!${l}`)) assert.ok(ev(`capOf(${l})<LT[${l}.tier].g`), 'loss cuts goodput');
  const dem = ev('R.served');
  fire('pmtud');
  assert.ok(ev("!!S.ev.pmtud&&S.inc.some(i=>i.type==='pmtud')"));
  assert.ok(ev('R.served') <= dem + 1e-6, 'some traffic never completes');
  for (const t of ['lacp', 'loss', 'pmtud']) assert.notEqual(ev(`incTitle('${t}')`), 'Incident');
  ev("for(const i of S.inc.slice())clearInc(i);compute()");
  assert.equal(ev("!!(S.transit[0].lacp||S.ev.pmtud||S.links.some(l=>l.loss)||(S.ev.ixlacp&&Object.keys(S.ev.ixlacp).length))"), false, 'everything clears');
  assert.deepEqual(errors, []);
});

test('an optical control plane meltdown darkens every leased wave in a region, not your own fiber', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','par','ber'])ACT.buildPop({city:c});const L=(a,b)=>{UI.via=null;openLinkModal(a,b);ACT.buildLink({tier:1});closeModal();};L('fra','ams');L('fra','par');L('fra','ber');S.links.push({id:'dfx',a:'ams',b:'ber',kind:'df',km:580,sys:'lite',ch:['zr4'],ready:0,mo:500,day:0,cut:0});S.day=120;compute()");
  const src = ev('fireEvent.toString()').replace(/^function fireEvent/, 'function').replace('const e=pick(opts);', "const e='ctrlplane';");
  ev('window.__fe=' + src + ';__fe();compute()');
  assert.equal(ev("S.links.filter(l=>l.kind==='wave').every(l=>linkDown(l))"), true, 'all leased waves in Europe are dark');
  assert.equal(ev("linkDown(S.links.find(l=>l.id==='dfx'))"), false, 'own dark fiber keeps working');
  const inc = "S.inc.find(i=>i.type==='ctrlplane')";
  assert.ok(ev(`${inc}.cost>0`));
  ev(`ACT.fixInc({id:${inc}.id});compute()`);
  assert.equal(ev("S.links.filter(l=>l.kind==='wave').some(l=>linkDown(l))"), false, 'escalating brings them back');
  assert.deepEqual(errors, []);
});

test('decommissioning POPs, one or several, removes what is there and charges for the customers', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','par','lon'])ACT.buildPop({city:c});const L=(a,b)=>{UI.via=null;openLinkModal(a,b);ACT.buildLink({tier:1});closeModal();};L('fra','ams');L('fra','par');L('ams','lon');ACT.buyTransit({city:'ams',net:'cog',tier:1});ACT.buyIx({city:'ams',tier:1});ACT.peerAll({city:'ams'});compute()");
  ev("S.biz.push({id:'b1',type:'l2vpn',name:'Tulip Bank',city:'ams',city2:'fra',bw:10,rate:300,reqs:[],mood:100,start:S.day},{id:'b2',type:'l2vpn',name:'Croissant Co',city:'par',city2:'fra',bw:5,rate:200,reqs:[],mood:100,start:S.day})");
  ev("selectCity('ams');ACT.tab({t:'infra'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Decommission/);
  ev("ACT.decomOpen({city:'ams'})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Tulip Bank/);
  const cash = ev('S.cash');
  ev("ACT.decomToggle({city:'lon'});ACT.decomGo();compute()");
  assert.equal(ev("!!S.pops.ams||!!S.pops.lon"), false, 'both gone');
  assert.equal(ev("S.links.some(l=>[l.a,l.b].some(c=>c==='ams'||c==='lon'))"), false);
  assert.equal(ev("S.transit.length+Object.keys(S.ixp).length"), 0, 'ports and exchange go with them');
  assert.equal(ev("S.biz.map(b=>b.id).join()"), 'b2', 'only the Amsterdam customer is let go');
  assert.equal(cash - ev('S.cash'), 10 * 300 * 3, 'three months of the contract');
  // never the last one
  ev("ACT.decomOpen({});for(const c of Object.keys(S.pops))ACT.decomToggle({city:c});ACT.decomGo()");
  assert.ok(ev("Object.keys(S.pops).length") >= 1);
  assert.deepEqual(errors, []);
});

test('#19 parallel waves draw as one line, dark fiber can add parallel links, NLNOG Day exists', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'nyc'});ACT.buildPop({city:'lon'})");
  ev("for(let i=0;i<4;i++){UI.via='grace';UI.route='same';openLinkModal('nyc','lon');ACT.buildLink({tier:1});closeModal();}compute()");
  assert.equal(ev("S.links.length"), 4);
  assert.equal(ev("linkGroups().length"), 1, 'four waves on one cable are one line');
  assert.match(ev("groupLabel(linkGroups()[0],linkGroups()[0])"), /^4×/);
  ev("S.links.push({id:'dfp',a:'fra',b:'lon',kind:'df',km:640,sys:'lite',ch:['zr4'],ready:0,mo:500,day:0,cut:0});ACT.selLink({id:'dfp'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Add parallel link/);
  assert.ok(ev("CONFS.some(c=>c.n==='NLNOG Day'&&c.c==='ams')"));
  ev("cam.z=0.4;draw(0);cam.z=2;draw(0)");
  assert.deepEqual(errors, []);
});

test('#40 overland between continents costs ten times subsea or more, and has no dark fiber', () => {
  const { ev, errors } = load();
  base(ev);
  const r = JSON.parse(ev(`JSON.stringify(CABLE_PAIRS.filter(c=>landX(c.a,c.b)).map(c=>{
    const land=waveMo(kmBetween(c.a,c.b),false,2)*landMult(c.a,c.b)*waveMarket(c.a,c.b,false).m;
    const sub=waveMo(c.km,true,2)*CAB[c.cid].price*waveMarket(c.a,c.b,true).m;return [land/sub,!!(CITY[c.a].land2||CITY[c.b].land2)];}))`));
  assert.ok(r.length >= 4, 'Europe–Asia cable routes exist to compare');
  // Across a land bridge (Cairo, #47) the cable goes the long way round Arabia, so overland is "only" 4–9× dearer.
  // EIG from Dubai now follows Arabia and the Suez Canal at sea, which makes it a little longer: 9.97× (#183).
  for (const [x, bridge] of r) assert.ok(x >= (bridge ? 4 : 9.5), `overland is at least ${bridge ? 4 : 9.5}× subsea (${x.toFixed(1)})`);
  assert.equal(ev("landX('mrs','hkg')"), true);
  assert.equal(ev("landX('fra','mrs')"), false, 'inside Europe stays normal');
  assert.equal(ev("landMult('fra','mrs')"), 1);
  assert.equal(ev("dfAllowed('ist','dxb')"), false, 'no dark fiber pair across a dozen borders');
  assert.equal(ev("dfAllowed('fra','mrs')"), true);
  assert.deepEqual(errors, []);
});

test('#39 caches are limited by router ports, not by a fixed count', () => {
  const { ev, errors } = load();
  base(ev);
  ev("for(let i=0;i<5;i++){R.demTo.nfx=1e4;ACT.cache({city:'fra',net:'nfx'});}");
  assert.equal(ev("S.caches.filter(x=>x.city==='fra'&&x.net==='nfx').length"), 5, 'a fifth box is fine');
  // fill every remaining port: the next box is refused
  ev("const p=S.pops.fra;while(portsUsed('fra')<portsMax('fra'))S.caches.push({id:uid(),city:'fra',net:'nfx'});window.__n=S.caches.length;R.demTo.nfx=1e4;ACT.cache({city:'fra',net:'nfx'})");
  assert.equal(ev("S.caches.length"), ev("window.__n"), 'no free port, no box');
  assert.deepEqual(errors, []);
});

test('#31 #33 #38 connections overview lists every port, filters it and jumps to it', () => {
  const { ev, dom, errors } = load();
  base(ev);
  const doc = dom.window.document;
  ev("ACT.buildPop({city:'ams'});S.pops.fra.rgen=S.pops.ams.rgen=RG_TOP;S.pops.ams.bb={d:200};compute()");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'ams',net:'lvl',tier:1});ACT.buyIx({city:'ams~3',tier:1});ACT.buyIx({city:'ams',tier:1});compute()");
  ev("S.pni.push({id:uid(),city:'fra',net:'ggl',tier:1});R.demTo.nfx=1e4;ACT.cache({city:'fra',net:'nfx'});R.demTo.nfx=1e4;ACT.cache({city:'fra',net:'nfx'});compute()");
  const all = JSON.parse(ev('JSON.stringify(conns())'));
  const by = (k) => all.filter((r) => r.k === k);
  assert.equal(by('t').length, 2);
  assert.equal(by('ix').length, 2);
  assert.equal(by('p').length, 1);
  assert.equal(by('c').length, 1, 'cache boxes of one CDN in one city are one row');
  assert.match(by('c')[0].port, /2 boxes/);
  // the listed prices add up to what the month actually costs
  const sum = (k) => by(k).reduce((a, r) => a + r.mo, 0);
  assert.ok(Math.abs(sum('t') - ev('R.cost.transit')) < 0.01, 'transit');
  assert.ok(Math.abs(sum('ix') - ev('R.cost.ix')) < 0.01, 'IX');
  assert.ok(Math.abs(sum('p') - ev('R.cost.pni')) < 0.01, 'PNI');
  assert.equal(sum('c'), ev('R.cost.caches'));
  // the dashboard section, with filters
  ev("ACT.connOpen()");
  const rows = () => doc.querySelectorAll('#connSec tbody tr').length;
  assert.equal(rows(), all.length);
  ev("ACT.connF({f:'k',v:'t'})");
  assert.equal(rows(), 2, 'transit only (#38)');
  const sel = doc.querySelector('#connSec select[data-chg="connCity"]');
  sel.value = 'ams'; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(rows(), 1, 'transit in Amsterdam');
  assert.match(doc.querySelector('#connSec tbody').textContent, /Amsterdam/);
  ev("ACT.connF({f:'all'})");
  ev("ACT.connNet({v:'ggl'})");
  assert.ok(rows() >= 1, 'a network filter finds its PNI and the exchanges it peers at');
  assert.ok([...doc.querySelectorAll('#connSec tbody tr')].every((tr) => /Goggle|IX/.test(tr.textContent)));
  ev("ACT.connCity({v:'nope'});ACT.connNet({v:'nope'});ACT.connF({f:'k',v:'nope'})");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(UI.cf)')), { k: '', city: '', net: '' }, 'bad filter values are ignored');
  // Open closes the dashboard and goes to the right tab of that POP
  ev("ACT.goConn({city:'ams',k:'t'})");
  assert.equal(ev("$('dash').hidden"), true);
  assert.equal(ev('UI.sel.id'), 'ams');
  assert.equal(ev('UI.tab'), 'up');
  ev("ACT.goConn({city:'fra',k:'c'})");
  assert.equal(ev('UI.tab'), 'peer');
  // the Networks tab says where each network is connected (#33)
  ev("UI.left='nets';UI.leftOpen=true;renderLeft()");
  const cog = [...doc.querySelectorAll('#leftBody .row')].find((r) => /Cogentle/.test(r.textContent));
  const jump = cog.querySelector('[data-act="goConn"]');
  assert.ok(jump, 'Cogentle shows a jump button');
  assert.match(jump.textContent, /Transit.*Frankfurt/);
  assert.deepEqual(errors, []);
});

test('#13 #15 unhappy customers warn early, furious ones pause the game (optional)', () => {
  const { ev, errors } = load();
  base(ev);
  ev("S.biz.push({id:'b1',city:'fra',city2:null,reqs:[],name:'Llama Logistics',type:'dia',bw:5,rate:100,mood:100,since:-100});compute();ACT.speed({v:4})");
  const toasts = () => ev("document.getElementById('toasts').textContent");
  // service collapses: happiness falls through 60% (warning) then 30% (furious, paused)
  ev("bizSf=()=>0.6");
  for (let i = 0; i < 3; i++) ev('dayTick()');
  assert.match(toasts(), /Llama Logistics is getting unhappy/);
  assert.match(toasts(), /getting only 60%/, 'the warning says why');
  assert.equal(ev('UI.speed'), 4, 'a warning does not pause');
  for (let i = 0; i < 4 && ev('UI.speed') !== 0; i++) ev('dayTick()');
  assert.match(toasts(), /Llama Logistics is furious/);
  assert.equal(ev('UI.speed'), 0, 'furious pauses the game');
  assert.match(toasts(), /Game paused/);
  assert.equal(ev('UI.resumeSpeed'), 4, 'Resume goes back to the old speed');
  // the setting turns it off
  ev("setPref('pauseFurious',false);setPref('warnUnhappy',false);S.biz.push({id:'b2',city:'fra',city2:null,reqs:[],name:'Snack Overflow',type:'dia',bw:5,rate:100,mood:100,since:-100});ACT.speed({v:2})");
  for (let i = 0; i < 5; i++) ev('dayTick()');
  assert.ok(ev("S.biz.find(b=>b.id==='b2').mood") < 30);
  assert.equal(ev('UI.speed'), 2, 'no pause with the setting off');
  assert.doesNotMatch(toasts(), /Snack Overflow is getting unhappy/);
  assert.equal(ev("JSON.parse(localStorage.getItem('sot-prefs')).pauseFurious"), false, 'stored per device');
  assert.deepEqual(errors, []);
});

test('#14 customers overview lists everyone with happiness, reasons and a jump', () => {
  const { ev, dom, errors } = load();
  base(ev);
  const doc = dom.window.document;
  ev("ACT.buildPop({city:'ams'});S.biz.push({id:'c1',city:'fra',city2:null,reqs:[],name:'Happy Hamster',type:'dia',bw:10,rate:100,mood:95,since:-100},{id:'c2',city:'ams',city2:null,reqs:[],name:'Grumpy Goat',type:'host',bw:20,rate:100,mood:40,since:-100});compute();renderAll()");
  const st = JSON.parse(ev('JSON.stringify(custStats())'));
  assert.equal(st.n, 2);
  assert.equal(st.unhappy, 1);
  assert.equal(st.risk, 2000, 'the unhappy customer pays 2000/mo');
  assert.ok(st.avg > 40 && st.avg < 95, 'happiness is weighted by what they pay');
  assert.equal(ev("$('hCust').hidden"), false, 'HUD shows customer happiness');
  assert.match(ev("$('hCustVal').textContent"), /%/);
  ev('ACT.custOpen({})');
  const names = () => [...doc.querySelectorAll('#custSec .row .nm')].map((n) => n.textContent);
  assert.equal(names().length, 2);
  assert.match(names()[0], /Grumpy Goat/, 'unhappiest first');
  ev("ACT.custF({v:'sad'})");
  assert.equal(names().length, 1);
  ev("ACT.custF({v:''});ACT.custCity({v:'fra'})");
  assert.deepEqual(names().map((n) => n.split(' ')[0]), ['Happy']);
  ev("ACT.custGo({id:'c2'})");
  assert.equal(ev("$('dash').hidden"), true);
  assert.equal(ev('UI.sel.id'), 'ams');
  assert.equal(ev('UI.tab'), 'cust');
  // the Deals tab summary
  ev("UI.left='deals';UI.leftOpen=true;UI.sel=null;renderLeft()");
  assert.match(doc.getElementById('leftBody').textContent, /1 unhappy customer/);
  assert.deepEqual(errors, []);
});

test('settings screen holds every option and opens from the menu and the title screen', () => {
  const { ev, errors } = load();
  ev('showTitle();ACT.settings()');
  const card = () => ev("document.getElementById('modalCard').textContent");
  for (const t of [/Pause when a customer is furious/, /Warn when a customer gets unhappy/, /Pause on outages/, /Animations/, /Sound/, /Language/]) assert.match(card(), t);
  ev("ACT.prefSet({v:'pauseIncident:1'})");
  assert.equal(ev("pref('pauseIncident')"), true);
  ev("ACT.prefSet({v:'nope:1'})");
  assert.equal(ev("'nope' in PREFS"), false, 'unknown settings are ignored');
  ev('ACT.settingsClose()');
  assert.match(card(), /Start building|Name your network/, 'back to the title screen');
  ev('ACT.start({});ACT.menu();ACT.settings();ACT.settingsClose()');
  assert.equal(ev("document.getElementById('modal').hidden"), true);
  assert.deepEqual(errors, []);
});

test('#42 the share card draws links across the date line on both edges of the map', () => {
  const { ev, errors } = load();
  base(ev);
  ev("S.links.push({id:'x1',a:'tok',b:'sea',kind:'wave',tier:0,km:7700,mult:1,mo:0},{id:'x2',a:'sea',b:'tok',kind:'wave',tier:0,km:7700,mult:1,mo:0},{id:'x3',a:'fra',b:'ams',kind:'wave',tier:0,km:400,mult:1,mo:0})");
  const segs = JSON.parse(ev('JSON.stringify(linkSegs())'));
  assert.equal(segs.length, 5, 'two segments for each date-line link, one for the short one');
  for (const id of ['x1', 'x2']) {
    const mine = JSON.parse(ev(`JSON.stringify((()=>{S.links=S.links.filter(l=>l.id==='${id}');return linkSegs();})())`));
    ev("S.links=[]");
    assert.ok(mine.some(([a, , b]) => Math.min(a, b) < 0), `${id} reaches past the left edge`);
    assert.ok(mine.some(([a, , b]) => Math.max(a, b) > ev('W')), `${id} reaches past the right edge`);
    ev("S.links.push({id:'x1',a:'tok',b:'sea',kind:'wave',tier:0,km:7700,mult:1,mo:0},{id:'x2',a:'sea',b:'tok',kind:'wave',tier:0,km:7700,mult:1,mo:0})");
  }
  ev('shareCanvas()');
  assert.deepEqual(errors, []);
});

test('#45 unplugged optics go on a spares shelf, get reused for free, or sold for 40%', () => {
  const { ev, errors } = load();
  base(ev);
  ev("S.lvl=4;ACT.buildPop({city:'ams'});S.pops.fra.rgen=S.pops.ams.rgen=RG_TOP;S.links.push({id:'df1',a:'fra',b:'ams',kind:'df',km:450,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0});compute()");
  const o = ev("Object.keys(OPT).find(k=>!chWhy(S.links[0],k))");
  const c0 = ev('S.cash');
  ev(`ACT.addCh({id:'df1',o:'${o}'})`);
  const price = c0 - ev('S.cash');
  assert.ok(price > 0);
  ev(`ACT.rmCh({id:'df1',o:'${o}'})`);
  assert.equal(ev(`S.spares['${o}']`), 1, 'the optic goes on the shelf');
  const c1 = ev('S.cash');
  ev(`ACT.addCh({id:'df1',o:'${o}'})`);
  assert.equal(ev('S.cash'), c1, 'plugging it back in is free');
  assert.equal(ev(`S.spares['${o}']`), 0);
  ev(`ACT.rmCh({id:'df1',o:'${o}'});ACT.sellSpare({o:'${o}'})`);
  assert.equal(ev('S.cash') - c1, Math.round(price * 0.4), 'sold for 40% of its price');
  ev(`ACT.sellSpare({o:'${o}'})`);
  assert.equal(ev('S.cash') - c1, Math.round(price * 0.4), 'nothing to sell twice');
  // the shelf survives a save and junk is cleaned
  ev(`S.spares={'${o}':2,nope:5,x:-1};S=migrate(JSON.parse(JSON.stringify(S)))`);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.spares)')), { [o]: 2 });
  assert.deepEqual(errors, []);
});

test('#35 your own trench can light another fiber pair once a ROADMaster is full', () => {
  const { ev, errors } = load();
  base(ev);
  ev("S.lvl=4;ACT.buildPop({city:'ams'});S.pops.fra.rgen=S.pops.ams.rgen=RG_TOP;S.pops.fra.routers=S.pops.ams.routers=RMAX;S.links.push({id:'own1',a:'fra',b:'ams',kind:'df',own:true,km:450,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0});compute()");
  assert.equal(ev("chMax(S.links[0])"), 64);
  ev("ACT.addPair({id:'own1'})");
  assert.equal(ev("S.links[0].pairs||1"), 1, 'not before the first pair is full');
  ev("S.links[0].ch=Array(64).fill('zr4');compute()");
  assert.match(ev("chWhy(S.links[0],'zr4')"), /full/);
  const c0 = ev('S.cash'), mo0 = ev('R.cost.optical');
  ev("ACT.addPair({id:'own1'})");
  assert.equal(ev('S.links[0].pairs'), 2);
  assert.equal(ev('chMax(S.links[0])'), 128);
  assert.equal(c0 - ev('S.cash'), ev('pairCost(S.links[0])'), 'a ROADMaster plus a chain of amplifiers');
  assert.ok(ev('R.cost.optical') > mo0, 'the new amplifier huts cost monthly');
  assert.ok(!/full/.test(ev("chWhy(S.links[0],'zr4')")), 'room for more channels');
  // leased fiber and the smaller line system stay at one pair
  ev("S.links.push({id:'iru',a:'fra',b:'ams',kind:'df',own:false,km:450,sys:'roadm',ch:Array(64).fill('zr4'),ready:0,mo:500,day:0,cut:0});ACT.addPair({id:'iru'})");
  assert.equal(ev("S.links[1].pairs||1"), 1);
  ev("S.links[0].pairs=99;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.links[0].pairs'), 4, 'saves are clamped to four pairs');
  assert.deepEqual(errors, []);
});

test('#64 your own subsea cable runs beside the route, however many waves share it', () => {
  const { ev, errors } = load();
  base(ev);
  ev("ACT.buildPop({city:'lon'});ACT.buildPop({city:'dub'});S.links.push({id:'own',a:'lon',b:'dub',kind:'df',own:true,sub:true,km:475,sys:'roadm',ch:[],ready:0,mo:1,day:0,cut:0});GEO.clear()");
  const span = "(()=>{const g=linkGeom(S.links.find(l=>l.id==='own')),A=CITY.lon,B=CITY.dub;return Math.max(...g.pts.map(p=>segDist(p[0],p[1],[A.x,A.y],[B.x,B.y])));})()";
  const alone = ev(span);
  ev("for(let i=0;i<8;i++)S.links.unshift({id:'w'+i,a:'lon',b:'dub',kind:'wave',tier:2,km:475,sub:true,cable:'celtix',mo:1,mult:1,trench:'cab:celtix',cut:0,day:0});GEO.clear()");
  const crowded = ev(span);
  assert.ok(Math.abs(crowded - alone) < 0.01, 'the shape does not grow with the waves');
  assert.ok(crowded < 8, `stays close to the route (${crowded.toFixed(1)})`);
  const g = ev("linkGeom(S.links.find(l=>l.id==='own')).pts");
  assert.ok(Math.hypot(g[0][0] - ev('CITY.lon.x'), g[0][1] - ev('CITY.lon.y')) < 1, 'still starts in London');
  assert.deepEqual(errors, []);
});

test('#64 leased and own land fiber stay near their route next to a trench full of waves', () => {
  const { ev, errors } = load();
  base(ev);
  ev("ACT.buildPop({city:'par'});S.links=[];for(let i=0;i<8;i++)S.links.push({id:'w'+i,a:'fra',b:'par',kind:'wave',tier:2,km:478,sub:false,trench:'t1',cut:0,day:0});S.links.push({id:'d1',a:'fra',b:'par',kind:'df',own:false,km:478,sys:'lite',ch:[],ready:0,cut:0,day:0},{id:'d2',a:'fra',b:'par',kind:'df',own:true,km:478,sys:'lite',ch:[],ready:0,cut:0,day:0});GEO.clear()");
  const r = id => ev(`(()=>{const g=linkGeom(S.links.find(l=>l.id==='${id}')),A=CITY.fra,B=CITY.par,L=Math.hypot(B.x-A.x,B.y-A.y);return Math.max(...g.pts.map(p=>segDist(p[0],p[1],[A.x,A.y],[B.x,B.y])))/L;})()`);
  assert.equal(ev("['w0','d1','d2'].map(id=>lineIdx(S.links.find(l=>l.id===id))).join()"), '0,1,2', 'eight waves in one trench are one line');
  for (const id of ['d1', 'd2']) assert.ok(r(id) < 0.5, `${id} bulges ${r(id).toFixed(2)}× the route`);
  assert.deepEqual(errors, []);
});

test('buttons behind an open modal stay quiet, and a declined PNI clears its stale button', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e7;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'mrs'});ACT.buyTransit({city:'mrs',net:'cog',tier:1});compute()");
  // the PNI button was drawn while Tangerine still wanted our traffic; by the click it doesn't
  // Tier 2 is folded when nothing there is worth a PNI (#175): open it, as a player would.
  ev("UI.pniOpen={t2:true};R.demTo.tng=50;UI.sel={type:'city',id:'mrs'};UI.tab='peer';renderAll();R.demTo.tng=0;window.__n=0;const o=toast;toast=function(h){if(/declined/.test(h))window.__n++;return o.apply(this,arguments);}");
  const btn = "document.querySelector('#panel [data-act=pni][data-args*=tng]')";
  assert.ok(ev(`!!${btn}`), 'a stale button to start with');
  ev(`${btn}.focus();${btn}.click()`);
  assert.equal(ev('__n'), 1);
  assert.equal(ev(`!!${btn}`), false, 'the panel redraws and shows why instead');
  // with a modal open, a click (from Enter, Space or anything else) on something behind it does nothing
  ev("R.demTo.tng=50;renderAll();R.demTo.tng=0;const b=" + btn + ";b.focus();ACT.buyIx({city:ixIdsIn('mrs')[0],tier:1})");
  assert.equal(ev("$('modal').hidden"), false, 'the DE-KICKS quote is open');
  assert.notEqual(ev("document.activeElement&&document.activeElement.dataset.act"), 'pni', 'focus left the hidden button');
  ev(`for(let i=0;i<5;i++)document.querySelector('#panel [data-act=pni][data-args*=tng]').click()`);
  assert.equal(ev('__n'), 1, 'no declines from behind the quote');
  ev("document.querySelector('#modal [data-act=dkWalk]').click()");
  assert.equal(ev("$('modal').hidden"), true, 'buttons inside the modal still work');
  assert.deepEqual(errors, []);
});

test('#66 #68 subsea optics: engineered glass reaches further, and the same limit caps leased waves', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  // a legacy Paris–Ashburn cable: 1.2T per channel instead of 400G
  ev("ACT.buildPop({city:'par'});ACT.buildPop({city:'ash'});S.pops.par.rgen=S.pops.ash.rgen=3;S.links.push({id:'oc',a:'par',b:'ash',kind:'df',own:true,sub:true,km:Math.round(kmBetween('par','ash')*1.15),sys:'roadm',ch:['tp16'],ready:0,mo:1,day:0,cut:0});compute()");
  assert.equal(ev("dfCap(S.links.find(l=>l.id==='oc'))"), 1200, `${ev("ownCabKm('par','ash')")} km of your own cable`);
  // counted as land glass it would be 400G, which is what #66 saw
  ev("S.links.find(l=>l.id==='oc').sub=false;compute()");
  assert.equal(ev("dfCap(S.links.find(l=>l.id==='oc'))"), 400);
  // leased waves: transatlantic London–New York still takes 6.4T (4×1.6T); Paris–Ashburn tops out at 800G
  assert.equal(ev("subWaveWhy(5,cablesFor('lon','nyc')[0].km,true)"), '');
  assert.match(ev("subWaveWhy(4,cablesFor('par','ash')[0].km,true)"), /at most 1.2T per carrier/);
  assert.equal(ev("LT[subMaxTier(cablesFor('par','ash')[0].km)].n"), '800G');
  assert.equal(ev("LT[subMaxTier(14000)].n"), '400G', 'the longest cables carry 400G waves');
  assert.equal(ev("subWaveWhy(5,4000,false)"), '', 'land waves are not capped this way');
  // buying a too-big wave is refused; an old one keeps running
  ev("UI.pending={a:'par',b:'ash'};UI.via=cablesFor('par','ash')[0].cid;const n=S.links.length;ACT.buildLink({tier:4});window.__d=S.links.length-n");
  assert.equal(ev('__d'), 0, 'no 1.6T wave across 6,670 km');
  ev("ACT.buildLink({tier:3})");
  const w = "S.links.find(l=>l.kind==='wave'&&l.a==='par')";
  assert.equal(ev(`${w}.tier`), 3, '800G is fine');
  ev(`ACT.upLink({id:${w}.id,tier:4})`);
  assert.equal(ev(`${w}.tier`), 3, 'and it cannot be upgraded past the cable');
  ev(`${w}.tier=5;compute()`);
  assert.equal(ev(`capOf(${w})`), 6400, 'a wave from an old save keeps its capacity');
  assert.deepEqual(errors, []);
});

test('#67 a subsea cable can be laid between landing stations that also share a landmass', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=5e9;S.lvl=4;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  for (const [a, b] of [['mrs', 'sin'], ['cai', 'pmo']]) {
    assert.equal(ev(`isSub('${a}','${b}')`), false, `${a}–${b} counts as a land route`);
    assert.equal(ev(`ownCabWhy('${a}','${b}')`), '', `but a cable can be laid ${a}–${b}`);
  }
  assert.match(ev("ownCabWhy('fra','ber')"), /on land/, 'inland cities still cannot');
  ev("ACT.buildPop({city:'mrs'});UI.lmode='df';UI.dfSrc='lease';openLinkModal('mrs','sin')");
  assert.ok(ev("!!document.querySelector('#modalCard [data-act=ownCab]')"), 'the dark fiber window offers the cable');
  ev("ACT.ownCab()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /km of seabed/);
  ev("ACT.orderCable()");
  assert.ok(ev("S.links.some(l=>l.own&&l.sub&&l.a==='mrs'&&l.b==='sin')"), 'Marseille–Singapore cable ordered');
  assert.deepEqual(errors, []);
});

test('#49 subsea cables stay on the map when you zoom in', () => {
  const { ev, errors } = load();
  ev("ACT.start({});UI.sel=null;cam.x=CITY.ams.x;cam.y=CITY.ams.y");
  const strokes = z => ev(`(()=>{cam.z=${z};WL.zAt=0;WL.key=null;const wl=worldLayer(${z});let n=0;const s=ctx.stroke;ctx.stroke=function(){n++;return s.apply(this,arguments);};drawCables([0]);ctx.stroke=s;return [!!wl,!!WL.cab,n];})()`);
  const far = strokes(1.2), near = strokes(4);
  assert.equal(far[1], true, 'zoomed out, the cables are painted into the world layer');
  assert.equal(near[0], true, 'zoomed in, a world layer is still used');
  assert.equal(near[1], false, 'but without cables in it');
  assert.ok(near[2] > 20, `so they are drawn live (${near[2]} strokes)`);
  assert.deepEqual(errors, []);
});

test('#20 local PNIs satisfy local breakout only while Tier 1, without changing transit or IX rules',()=>{
 const {ev,errors}=load();ev("ACT.start({});S.cash=1e8;S.transit=[];S.ixp={};S.pni=[{id:'local',net:'nfx',city:'fra',tier:0}];R.reach=1");
 assert.equal(ev("REQS.local.ok({city:'fra'})"),false);
 ev("for(const n of t1Need())S.pni.push({id:n.id,net:n.id,city:n.pops.find(c=>c!=='fra'),tier:0});R.reach=1");
 assert.equal(ev('isTier1()'),true);assert.equal(ev("REQS.local.ok({city:'fra'})"),true);
 assert.equal(ev("REQS.local.ok({city:'den'})"),false,'a PNI in another city does not count');
 ev("S.won=true;S.pni=S.pni.filter(p=>p.net!==t1Need()[0].id)");
 assert.equal(ev("REQS.local.ok({city:'fra'})"),false,'a historical Tier 1 win is insufficient');
 ev("S.transit=[{id:'t',net:'cog',city:'fra',tier:0}]");assert.equal(ev("REQS.local.ok({city:'fra'})"),true);
 ev("S.transit=[];S.ixp.fra=0");assert.equal(ev("REQS.local.ok({city:'fra'})"),true);
 assert.deepEqual(errors,[]);
});

test('deal navigation visits the first missing POP, including second endpoints and multi-site offers',()=>{
 const {ev,dom,errors}=load();ev("ACT.start({});S.cash=1e8;UI.speed=0;UI.left='deals';UI.leftOpen=true;S.offers=[{id:'route',type:'l2vpn',name:'Missing POP circuit',city:'fra',city2:'bde',bw:10,rate:1000,reqs:[],exp:30}];renderLeft()");
 const go=()=>dom.window.document.querySelector('#leftBody [data-act="focusCity"]');
 assert.equal(JSON.parse(go().dataset.args).city,'bde');
 ev(`ACT.focusCity(${go().dataset.args})`);assert.equal(ev('UI.sel.id'),'bde');assert.equal(ev('!!S.pops.bde'),false,'navigation does not buy a POP');
 ev("S.pops.bde={routers:1,rgen:0};delete S.pops.fra;renderLeft()");assert.equal(JSON.parse(go().dataset.args).city,'fra','the first endpoint can also be missing');
 ev("delete S.pops.bde;renderLeft()");assert.equal(JSON.parse(go().dataset.args).city,'fra','both missing uses the first required city');
 ev("S.pops.fra={routers:1,rgen:0};S.offers[0].type='sdwan';S.offers[0].city2=null;S.offers[0].sites=['fra','ams','par'];window.innerWidth=360;renderLeft()");
 assert.equal(JSON.parse(go().dataset.args).city,'ams');
 ev("S.pops.ams={routers:1,rgen:0};renderLeft()");assert.equal(JSON.parse(go().dataset.args).city,'par');
 ev("S.pops.par={routers:1,rgen:0};renderLeft()");assert.equal(go(),null);assert.ok(dom.window.document.querySelector('#leftBody [data-act="accept"]'));
 ev("S.offers[0].type='l2vpn';delete S.offers[0].sites;S.offers[0].city='bde';renderLeft()");assert.equal(JSON.parse(go().dataset.args).city,'bde','single-site offers still work');
 assert.deepEqual(errors,[]);
});

test('NOC leased lines tab prices leased dark fiber, own fiber and cables against the leases', () => {
  const { ev, errors } = load();
  base(ev);
  ev("S.cash=1e9;S.lvl=3;for(const c of ['ams','lon','nyc','par'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=2;const L=(a,b,t)=>{UI.via=null;openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};L('fra','ams',2);L('fra','ams',2);L('lon','nyc',1);L('fra','par',1);compute()");
  ev("ACT.dash();ACT.dashTab({k:'lease'})");
  let t = ev("document.getElementById('dashCard').textContent");
  assert.match(t, /Leased lines/);
  assert.match(t, /Amsterdam ⇄ Frankfurt/);
  assert.match(t, /Lease dark fiber: .* up front/);
  assert.match(t, /Your own fiber: .* up front/);
  assert.match(t, /Go transit-free first/, 'own subsea cables stay Tier 1 only');
  const land = JSON.parse(ev("JSON.stringify(leaseSwaps().find(x=>x.a==='ams'))"));
  assert.equal(land.ls.length, 2, 'parallel waves on one route are grouped');
  assert.equal(land.cap, 800);
  const iru = land.opts.find(o => o.k === 'iru'), own = land.opts.find(o => o.k === 'own');
  assert.equal(iru.days, 30);
  assert.equal(iru.save, land.mo - iru.omo);
  assert.ok(iru.save > 0 && iru.pay > 0, 'two 400G waves are worth moving onto dark fiber');
  assert.ok(iru.up < own.up, 'leased glass costs less up front than digging');
  assert.ok(own.up > ev("dfBuildCost(kmBetween('ams','fra'))"), 'optics and line system are in the estimate');
  assert.equal(land.best, Math.max(iru.save, own.save));
  ev("S.won=true");
  assert.match(ev("leaseSwaps().find(x=>x.sub).why"), /No optic you can buy reaches/, "Tier 1 alone is not enough without long-haul optics");
  ev("S.lvl=4;renderDash()");
  const sub = JSON.parse(ev("JSON.stringify(leaseSwaps().find(x=>x.sub))"));
  assert.equal(sub.why, '');
  assert.ok(sub.opts.find(o => o.k === 'cab').up > ev("ownCabCost(ownCabKm('lon','nyc'))"));
  ev("for(const c of ['mrs','sin'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=2;UI.via=null;openLinkModal('mrs','sin');ACT.buildLink({tier:2});closeModal();compute()");
  const ms = JSON.parse(ev("JSON.stringify(leaseSwaps().find(x=>x.a==='mrs'&&x.b==='sin'))"));
  assert.ok(ms && ms.opts.some(o => o.k === 'cab'), 'landing stations on one landmass can swap a wave for your own cable (#67)');
  ev("ACT.leaseSwap({a:'ams',b:'fra',src:'lease'})");
  assert.equal(ev("document.getElementById('dash').hidden"), true);
  assert.match(ev("document.getElementById('modal').textContent"), /Sign the IRU/);
  ev("closeModal();ACT.leaseSwap({a:'ams',b:'fra',src:'build'})");
  assert.match(ev("document.getElementById('modal').textContent"), /Start construction/);
  ev("closeModal();S.links.push({id:'iru1',a:'fra',b:'par',kind:'df',km:480,sys:'roadm',ch:[],ready:0,mo:900,day:0,cut:0});S.links.push({id:'own1',a:'fra',b:'ams',kind:'df',own:true,km:400,sys:'roadm',ch:[],ready:0,mo:60,day:0,cut:0});ACT.dash();ACT.dashTab({k:'lease'})");
  t = ev("document.getElementById('dashCard').textContent");
  assert.match(t, /You already own fiber here/);
  assert.match(t, /You already lease dark fiber here/);
  const par = JSON.parse(ev("JSON.stringify(leaseSwaps().find(x=>x.b==='par'))"));
  assert.ok(!par.opts.some(o => o.k === 'iru'), 'no second IRU offered next to the one you lease');
  assert.ok(!ev("leaseSwaps().some(x=>x.ls.some(l=>l.own))"), 'your own fiber is never listed as a lease');
  assert.deepEqual(errors, []);
});

test('connections in the NOC dashboard can be cancelled right there, after a confirm', () => {
  const { ev, errors } = load();
  base(ev);
  ev("ACT.buildPop({city:'ams'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'ams',tier:1});S.pni.push({id:'pn1',city:'fra',net:'nfx',tier:1});S.caches.push({id:'cc1',city:'fra',net:'ggl'},{id:'cc2',city:'fra',net:'ggl'});S.nni.push({city:'fra',prov:'mgp',tier:0});compute();ACT.connOpen()");
  const card = () => ev("document.getElementById('dashCard').textContent");
  const click = (k, id) => ev(`ACT.connCancel(${JSON.stringify({ k, id })})`);
  assert.equal(ev("conns().length"), 5);
  const tid = ev("S.transit[0].id");
  click('t', tid);
  assert.match(card(), /Really cancel\?/, 'first tap only asks');
  assert.equal(ev("S.transit.length"), 1);
  click('t', tid);
  assert.equal(ev("S.transit.length"), 0);
  assert.doesNotMatch(card(), /Really cancel\?/, 'the list refreshes in place');
  click('p', 'pn1'); click('p', 'pn1');
  assert.equal(ev("S.pni.length"), 0);
  click('ix', 'ams');
  assert.match(card(), /Really leave\?/);
  click('ix', 'ams');
  assert.equal(ev("S.ixp.ams"), undefined);
  click('c', 'cc1'); click('c', 'cc1');
  assert.equal(ev("S.caches.length"), 1, 'caches go one box at a time');
  click('nni', 'fra|mgp'); click('nni', 'fra|mgp');
  assert.equal(ev("S.nni.length"), 0);
  ev("S.myIx.fra={name:'Test-IX',members:[],next:S.day+4};S.ixp.fra=2;compute();renderDash()");
  click('ix', 'fra'); click('ix', 'fra');
  assert.equal(ev("S.ixp.fra"), 2, 'your own exchange cannot be cancelled from the list');
  assert.equal(ev("document.getElementById('dash').hidden"), false);
  assert.deepEqual(errors, []);
});

test('connections in the NOC dashboard can be upgraded and grown into LAGs right there', () => {
  const { ev, errors } = load();
  base(ev);
  ev("ACT.buildPop({city:'ams'});for(const c in S.pops)S.pops[c].rgen=2;ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'ams',tier:1});S.pni.push({id:'pn1',city:'fra',net:'nfx',tier:1});S.nni.push({city:'fra',prov:'mgp',tier:0});compute();ACT.connOpen()");
  const tap = act => ev(`(()=>{const b=document.querySelector('#dashCard [data-act="${act}"]');if(!b||b.disabled)return false;b.click();return true;})()`);
  assert.ok(tap('lagT'), 'transit row offers a LAG member');
  assert.equal(ev("S.transit[0].n"), 2);
  assert.match(ev("document.getElementById('dashCard').textContent"), /Upgrade all to 400G/, 'the list refreshes with the LAG');
  assert.ok(tap('buyTransit'));
  assert.equal(ev("S.transit[0].tier"), 2);
  assert.ok(tap('lagP'));
  assert.equal(ev("S.pni[0].up.n"), 2, 'a LAG member with NetChill is an augment on order');
  assert.ok(tap('lagIx'));
  assert.equal(ev("S.ixn.ams"), 2);
  assert.ok(tap('buyIx'));
  assert.equal(ev("S.ixp.ams"), 2);
  assert.ok(tap('buyNni'));
  assert.equal(ev("S.nni[0].tier"), 1);
  assert.equal(ev("document.querySelector('#dashCard [data-act=\"buyNni\"]')"), null, 'no upgrade past the biggest fabric port');
  assert.equal(ev("document.getElementById('dash').hidden"), false);
  assert.deepEqual(errors, []);
});

test('leased-line savings only count when your own glass has room, and include the optics', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});S.pops.fra.rgen=S.pops.ams.rgen=3");
  // a 400G leased wave next to your own, almost full Rainbow fiber
  ev("S.links.push({id:'w',a:'fra',b:'ams',kind:'wave',tier:2,km:450,mo:3000,mult:1,trench:'t',cut:0,day:0},{id:'own',a:'fra',b:'ams',kind:'df',own:true,km:450,sys:'lite',ch:Array(16).fill('zr4'),ready:0,mo:100,day:0,cut:0});compute()");
  let x = JSON.parse(ev("JSON.stringify(leaseSwaps().find(x=>x.a==='ams'||x.b==='ams'))"));
  assert.equal(x.best, undefined, 'a full fiber saves nothing');
  assert.equal(x.fit.fits, false);
  ev("UI.dtab='lease';$('dash').hidden=false;renderDash()");
  assert.match(ev("$('dash').textContent"), /room for 0 more channels/);
  // with room on the fiber: savings, and the optics are priced
  ev("S.links.find(l=>l.id==='own').ch=Array(10).fill('zr4');compute()");
  x = JSON.parse(ev("JSON.stringify(leaseSwaps().find(x=>x.a==='ams'||x.b==='ams'))"));
  assert.equal(x.best, 3000);
  assert.equal(x.fit.n, 1);
  assert.equal(x.fit.up, ev("chCost(S.links.find(l=>l.id==='own'),'zr8')"), 'the cheapest optic per gigabit both routers take');
  ev("S.pops.ams.rgen=1;compute()");
  assert.equal(ev("litOn(S.links.find(l=>l.id==='own'),400).up"), ev("chCost(S.links.find(l=>l.id==='own'),'zr4')"), 'an Edge Lord at one end only takes 400ZR+');
  ev("S.pops.ams.rgen=3;compute()");
  // the same for waves next to a leased IRU
  ev("S.links=S.links.filter(l=>l.id!=='own');S.links.push({id:'iru',a:'fra',b:'ams',kind:'df',own:false,km:450,sys:'lite',ch:Array(16).fill('zr4'),ready:0,mo:900,day:0,cut:0});compute()");
  x = JSON.parse(ev("JSON.stringify(leaseSwaps().find(x=>x.a==='ams'||x.b==='ams'))"));
  assert.equal(x.lit, undefined, 'a full IRU cannot take the waves');
  assert.deepEqual(errors, []);
});

test('cancelling from the Connections list confirms once, without forging the panel state', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  const id = ev("S.transit[0].id");
  ev(`ACT.connCancel({k:'t',id:'${id}'})`);
  assert.equal(ev('S.transit.length'), 1, 'first tap asks');
  ev(`ACT.connCancel({k:'t',id:'${id}'})`);
  assert.equal(ev('S.transit.length'), 0, 'second tap cancels');
  assert.equal(ev('UI.confirm'), null);
  ev(`ACT.buyTransit({city:'fra',net:'cog',tier:1})`);
  ev(`ACT.cancelTransit({id:S.transit[0].id})`);
  assert.equal(ev('S.transit.length'), 1, 'the POP panel still asks first');
  assert.deepEqual(errors, []);
});

test('diversity offers respect buildable cable routes, not current infrastructure', () => {
  const { ev, dom, errors } = load();
  base(ev);
  assert.equal(ev("diversityPossible('jam','den')"), false, 'both St Helena exits share Equi-yes');
  assert.equal(ev("diversityPossible('den','jam')"), false, 'same in reverse');
  assert.equal(ev("diversityPossible('fra','den')"), true, 'expansion is allowed before links are built');
  ev("S.ev.landban={city:'jam',until:S.day+100}");
  ev('S.won=true');
  assert.equal(ev("diversityPossible('jam','den')"), true, 'Tier 1 can build an independent subsea cable');
  ev("S.scn={rules:{banCities:['jam']}}");
  assert.equal(ev("diversityPossible('jam','den')"), false, 'scenario city bans are respected');
  ev('S.scn=null;S.won=false');
  assert.equal(ev("diversityPossible('jam','den')"), false, 'cache follows the cable unlock');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('mandatory and optional diversity requirements skip impossible city pairs', () => {
  const { ev, dom, errors } = load();
  base(ev);
  ev("S.lvl=4;S.pops={cbo:{rgen:3,routers:2},den:{rgen:3,routers:2}};window.__hyper=0;window.__div=0");
  ev(`for(let i=0;i<3000;i++){
    S.offers=[];spawnOffer();
    for(const o of S.offers){
      if(BIZ_T[o.type].div){window.__hyper++;if(!o.reqs.includes('diverse'))throw Error('missing mandatory requirement');}
      if(o.reqs.includes('diverse')){window.__div++;if(!diversityPossible(o.city,o.city2))throw Error('impossible diversity offer');}
    }
  }`);
  assert.ok(ev('__hyper') > 0, 'feasible mandatory offers still appear');
  assert.ok(ev('__div') > 0, 'diversity is not disabled globally');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('save migration checks diversity using the imported cable unlock', () => {
  const { ev, dom, errors } = load();
  base(ev);
  ev(`window.__save=JSON.parse(JSON.stringify(S));__save.offers=[
    {id:'bad',type:'hyper',city:'jam',city2:'den',name:'x',bw:1600,rate:1,reqs:['diverse','netchill'],exp:40},
    {id:'good',type:'hyper',city:'fra',city2:'den',name:'y',bw:1600,rate:1,reqs:['diverse'],exp:40}
  ];__save.biz=[{...__save.offers[0],id:'existing',mood:100,since:0}];S.won=true;__save.won=false`);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(migrate(JSON.parse(JSON.stringify(__save))).offers.map(o=>o.reqs))')), [['netchill'], ['diverse']]);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(migrate(JSON.parse(JSON.stringify(__save))).biz[0].reqs)')), ['netchill']);
  ev('__save.won=true;S.won=false');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(migrate(__save).offers[0].reqs)')), ['diverse', 'netchill']);
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('NOC link navigation replaces the phone and tablet sheet immediately', () => {
  for (const [width, height, coarse] of [[390, 844, false], [1024, 768, false], [1300, 450, true]]) {
    const { ev, dom, errors } = load();
    base(ev);
    ev(`innerWidth=${width};innerHeight=${height};window.matchMedia=()=>({matches:${coarse}})`);
    ev("S.links.push({id:'noc-link',a:'fra',b:'ams',kind:'wave',tier:0,km:400,mo:100,cut:0});R.load['noc-link']=capOf(S.links.find(l=>l.id==='noc-link'))*0.95");
    for (const action of ['dashLink', 'selLink']) {
      ev("UI.sel=null;UI.left='noc';UI.leftOpen=true;renderPanel();renderLeft();$('left').classList.add('full');$('panel').classList.add('full');UI.confirm='stale'");
      assert.equal(ev("$('left').classList.contains('closed')"), false);
      if (action === 'dashLink') ev("UI.dtab='infra';ACT.dash()");
      // Use the actual dashboard or congested-link button, rather than invoking its handler.
      const root = action === 'dashLink' ? '#dashCard' : '#leftBody';
      ev(`document.querySelector('${root} [data-act=${action}][data-args*=noc-link]').click()`);
      assert.equal(ev("$('dash').hidden"), true);
      assert.equal(ev('UI.leftOpen'), false, `${action} dismisses NOC at ${width}px`);
      assert.equal(ev("$('left').classList.contains('closed')"), true, 'DOM closes before a game tick');
      assert.equal(ev("$('panel').hidden"), false);
      assert.equal(ev('UI.sel.id'), 'noc-link');
      assert.equal(ev('UI.sel.type'), 'link');
      assert.equal(ev('UI.confirm'), null);
      assert.equal(ev("$('panel').classList.contains('full')"), false, 'new selection starts at normal height');
    }
    ev("ACT.closePanel();UI.leftOpen=true;UI.left='noc';renderLeft();ACT.connOpen();ACT.goConn({city:'fra',k:'t'})");
    assert.equal(ev("$('dash').hidden"), true);
    assert.equal(ev("$('left').classList.contains('closed')"), true, 'connection navigation still dismisses NOC');
    assert.equal(ev('UI.sel.id'), 'fra');
    assert.equal(ev('UI.tab'), 'up');
    assert.deepEqual(errors, []);
    dom.window.close();
  }
});

test('opening a link on desktop keeps the NOC sidebar available', () => {
  const { ev, dom, errors } = load();
  base(ev);
  ev("innerWidth=1440;innerHeight=900;S.links.push({id:'noc-link',a:'fra',b:'ams',kind:'wave',tier:0,km:400,mo:100,cut:0});UI.left='noc';UI.leftOpen=true;renderLeft();ACT.dash();ACT.dashLink({id:'noc-link'})");
  assert.equal(ev("$('dash').hidden"), true);
  assert.equal(ev('UI.leftOpen'), true);
  assert.equal(ev("$('left').classList.contains('closed')"), false);
  assert.equal(ev("$('panel').hidden"), false);
  assert.equal(ev('UI.sel.id'), 'noc-link');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('#77 waves can join any route already dug between two cities', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'})");
  const add = r => ev(`UI.via=null;UI.lmode='wave';UI.route=${JSON.stringify(r)};openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal()`);
  add('diverse');                                   // first wave: the main route
  add('diverse');                                   // second: a diverse route
  const ts = () => JSON.parse(ev("JSON.stringify(landTrenches('fra','ams').map(t=>[t.k,t.n]))"));
  assert.equal(ts().length, 2);
  const [main, div] = ts().map(t => t[0]);
  // the old two-way choice still works, and two routes now show a button each
  ev("UI.route='diverse';openLinkModal('fra','ams')");
  assert.equal(ev("document.querySelectorAll('#modalCard [data-act=route]').length"), 3, 'main, diverse 1 and a new one');
  ev("closeModal()");
  add('t:' + main);                                 // third: on the main route
  add('t:' + div);                                  // fourth: on the diverse route
  assert.deepEqual(ts().map(t => t[1]), [2, 2], 'two waves on each route');
  // prices follow the route: the main route at list price, a diverse one at +40%
  const w = id => ev(`S.links.filter(l=>l.kind==='wave').map(l=>l.mult)[${id}]`);
  assert.ok(Math.abs(w(2) - w(0)) < 1e-9, 'joining the main route costs like the main route');
  assert.ok(Math.abs(w(3) - w(1)) < 1e-9, 'joining the diverse route costs like the diverse route');
  assert.ok(w(1) > w(0) * 1.3);
  // a route id from another pair falls back to a new diverse route
  add('t:nonsense');
  assert.equal(ts().length, 3);
  assert.deepEqual(errors, []);
});

test('#73 losing Tier 1 to a sliver of reach is visible and explained', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;S.transit=[];S.ixp={};S.pni=[];for(const n of t1Need())S.pni.push({id:n.id,net:n.id,city:n.pops[0],tier:0});S.won=true");
  // everything reachable except one small network: 99.6%, which used to show as 100%
  const small = ev("NETS.filter(n=>NSH[n.id]>0.002&&NSH[n.id]<0.006)[0].id");
  ev(`R.reach=1-NSH['${small}'];for(const n of NETS)R.reachable[n.id]=n.id!=='${small}';renderHUD()`);
  assert.ok(ev('R.reach') < 0.999 && ev('R.reach') > 0.99);
  assert.equal(ev('isTier1()'), false);
  assert.notEqual(ev("$('hReach').textContent"), '100%', 'the top bar does not round it up');
  assert.match(ev("$('hReach').textContent"), /^99\.\d%$/);
  assert.match(ev('t1Why()'), new RegExp('cannot reach ' + ev(`NET['${small}'].name`)));
  ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderLeft()");
  assert.match(ev("document.getElementById('leftBody').textContent"), /Not Tier 1 right now: you cannot reach/);
  ev("R.reach=1;for(const n of NETS)R.reachable[n.id]=true;renderHUD();renderLeft()");
  assert.equal(ev("$('hReach').textContent"), '100%');
  assert.equal(ev('isTier1()'), true);
  assert.doesNotMatch(ev("document.getElementById('leftBody').textContent"), /Not Tier 1 right now/);
  assert.deepEqual(errors, []);
});

test('#69 embedded caches can sit in either metro building, so one dark building leaves the rest serving', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.addSite({city:'fra'});R.demTo.nfx=500");
  ev("ACT.cache({city:'fra',net:'nfx'});R.demTo.nfx=500;ACT.cache({city:'fra',net:'nfx'})");
  assert.equal(ev("S.caches.map(x=>x.site).sort().join()"), 'a,b', 'the second box goes to the other building by itself');
  ev("ACT.cacheSite({city:'fra',net:'nfx',s:'a'})");
  assert.equal(ev("S.caches.filter(x=>x.site==='a').length"), 2);
  ev("ACT.cacheSite({city:'fra',net:'nfx',s:'b'})");
  assert.equal(ev("S.caches.filter(x=>x.site==='b').length"), 1);
  // building A goes dark: only the box in B keeps serving
  ev("S.inc=[{type:'site',ref:'fra',site:'a',until:S.day+5}];compute()");
  const up = () => ev("(()=>{let n=0;for(const x of S.caches)if(!siteDown('fra',x.site==='b'?'b':'a'))n++;return n;})()");
  assert.equal(up(), 1);
  assert.equal(ev("R.useCache[S.caches.find(x=>x.site==='a').id]||0"), 0, 'the box in the dark building carries nothing');
  assert.ok(ev("R.useCache[S.caches.find(x=>x.site==='b').id]||0") > 0, 'the box in B still serves');
  ev("UI.sel={type:'city',id:'fra'};UI.tab='peer';renderPanel()");
  assert.match(ev("$('panelBody').textContent"), /Boxes: 1 in A · 1 in B/);
  // old saves: caches without a site are in A; dropping the second site moves them back
  ev("delete S.caches[0].site;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.ok(ev("S.caches.every(x=>x.site==='a'||x.site==='b')"));
  ev("S.inc=[];ACT.rmSite({city:'fra'});ACT.rmSite({city:'fra'})");
  assert.equal(ev("S.caches.every(x=>x.site==='a')"), true);
  assert.deepEqual(errors, []);
});

test('#63 incidents you can fix with one click sit above hot ports in the NOC', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:0});compute()");
  ev("R.useT[S.transit[0].id]=10;window.hotPorts=()=>[{k:'t',city:'fra',lab:'Cogentle transit',u:0.97,tip:'Upgrade it.'}]");
  ev("S.inc.push({id:'x1',type:'loss',ref:'l',until:S.day+5,msg:'Free one',start:S.day},{id:'x2',type:'optic',ref:'l',until:S.day+9,msg:'A transceiver died.',cost:7000,fix:'Replace the optic',start:S.day})");
  ev("UI.left='noc';UI.leftOpen=true;UI.sel=null;renderLeft()");
  const t = ev("document.getElementById('leftBody').textContent");
  const fix = t.indexOf('Replace the optic'), hot = t.indexOf('running hot'), free = t.indexOf('Free one');
  assert.ok(fix >= 0 && hot >= 0 && free >= 0, 'all three are shown');
  assert.ok(fix < hot, 'the paid fix comes before the hot ports');
  assert.ok(fix < free, 'and before incidents without a fix');
  assert.ok(t.indexOf('DDoS scrubbing') > fix, 'status lines come after the incidents');
  assert.deepEqual(errors, []);
});

test('#82 router swaps trade in the old gear, one swap a day, and requirements name the speed', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});S.pops.fra.rgen=1;S.pops.fra.routers=2");
  const c0 = ev('S.cash'), back = ev('tradeIn(1,2)');
  assert.equal(back, Math.round(ev('RG[1].cost') * 2 * 0.3));
  ev("ACT.upRouter({city:'fra',g:2})");
  assert.equal(ev('S.pops.fra.rgen'), 2);
  assert.equal(c0 - ev('S.cash'), ev('RG[2].cost') * 2 - back, 'you pay the new routers minus the old ones sold on eBuy');
  // a double click does not chain a second upgrade
  ev("ACT.upRouter({city:'fra',g:3})");
  assert.equal(ev('S.pops.fra.rgen'), 2, 'one swap a day');
  ev("S.day++;ACT.upRouter({city:'fra',g:3})");
  assert.equal(ev('S.pops.fra.rgen'), 3);
  // removing a router sells it too
  const c1 = ev('S.cash');
  ev("ACT.rmRouter({city:'fra'})");
  assert.equal(ev('S.cash') - c1, ev('tradeIn(3,1)'));
  // requirements say the speed, not one model
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=0;S.links.push({id:'df',a:'fra',b:'ams',kind:'df',km:450,sys:'roadm',ch:[],ready:0,mo:1,day:0,cut:0});compute()");
  assert.match(ev("chWhy(S.links.find(l=>l.id==='df'),'tp16')"), /routers with 800G ports or bigger/);
  assert.equal(ev('waveNeed(4)'), '1.6T routers');
  assert.deepEqual(errors, []);
});

test('fiber between nearby cities bends gently instead of looping around the neighbourhood', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;for(const x of ['tor','ott','mtl','nyc','ash'])if(!S.pops[x])ACT.buildPop({city:x})");
  ev("const L=(a,b)=>{UI.via=null;UI.lmode='wave';UI.route='diverse';openLinkModal(a,b);ACT.buildLink({tier:1});closeModal();};L('tor','ott');L('ott','mtl');L('tor','nyc');L('tor','mtl');L('mtl','nyc');L('tor','ash');L('ash','nyc');GEO.clear()");
  const worst = ev("Math.max(...S.links.map(l=>{const g=linkGeom(l),A=CITY[l.a],B=CITY[l.b],L=Math.hypot(B.x-A.x,B.y-A.y);return Math.max(...g.pts.map(p=>segDist(p[0],p[1],[A.x,A.y],[B.x,B.y])))/L;}))");
  assert.ok(worst < 0.3, `worst bend is ${worst.toFixed(2)}× its length`);
  assert.deepEqual(errors, []);
});

test('#105 swapping the only router in an empty POP needs no maintenance window', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'ams'})");
  assert.equal(ev("popIdle('ams')"), true);
  const inc0 = ev('S.inc.length'), n0 = ev('S.stats.incidents');
  ev("ACT.upRouter({city:'ams',g:1})");
  assert.equal(ev('S.pops.ams.rgen'), 1, 'upgraded');
  assert.equal(ev('S.inc.length'), inc0, 'no NOC warning');
  assert.equal(ev('S.stats.incidents'), n0, 'not counted as an incident');
  assert.ok(!(ev('S.pops.ams.down') > ev('S.day')), 'no downtime');
  // once something depends on it, the window is back
  ev("ACT.launchBB({city:'ams'});S.day++");
  assert.equal(ev("popIdle('ams')"), false);
  ev("ACT.upRouter({city:'ams',g:2})");
  assert.equal(ev("S.inc.filter(i=>i.type==='maint'&&i.ref==='ams').length"), 1);
  assert.ok(ev('S.pops.ams.down') > ev('S.day'));
  assert.deepEqual(errors, []);
});

test('#104 declining a loan offer clears the bank badge while paused', () => {
  const { ev, errors } = load();
  ev("ACT.start({});UI.speed=0;S.loanOffers=[];spawnLoanOffer(false);renderHUD()");
  assert.equal(ev("$('hBank').hidden"), false);
  ev("ACT.declineLoan({id:S.loanOffers[0].id})");
  assert.equal(ev("$('hBank').hidden"), true, 'badge gone without a new day');
  assert.equal(ev("JSON.parse(slotRaw(UI.slot)).loanOffers.length"), 0, 'saved right away');
  assert.deepEqual(errors, []);
});

test('#88 no subsea cable longer than any optic can light, and a refund for calling one off', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e10;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0");
  // New York to Sydney is too long for plain optics; since #78 premium terminals light it, so the order screen asks
  // for them instead of refusing. Only a length beyond even both upgrades is refused.
  assert.equal(ev("ownCabWhy('nyc','syd')"), '');
  assert.deepEqual(JSON.parse(ev("JSON.stringify(subNeed(ownCabKm('nyc','syd')))")), ['terminal']);
  assert.equal(ev('subNeed(26000)'), null, 'nothing lights 26,000 km');
  assert.equal(ev("ownCabWhy('lax','syd')"), '', 'Los Angeles to Sydney still works');
  assert.ok(ev("subCarrier(ownCabKm('lax','syd'))") > 0);
  // half-way through laying it: most of the unlaid part comes back
  ev("S.day=100;S.links.push({id:'oc',a:'lax',b:'syd',kind:'df',own:true,sub:true,sys:'roadm',ch:[],km:ownCabKm('lax','syd'),cname:'Kraken-1',mo:1,trench:'own:oc',cut:0,day:0,ready:200,pairs:1})");
  const want = ev("Math.round(ownCabCost(ownCabKm('lax','syd'))*0.75*0.5)");
  assert.equal(ev("cabBack(S.links.find(l=>l.id==='oc'))"), want);
  const c0 = ev('S.cash');
  ev("ACT.rmLink({id:'oc'});ACT.rmLink({id:'oc'})");
  assert.equal(ev("S.links.some(l=>l.id==='oc')"), false);
  assert.equal(ev('S.cash') - c0, want);
  // a finished cable that works is yours for good; one nothing can light (old saves) goes back in full
  assert.equal(ev("cabBack({kind:'df',own:true,sub:true,km:ownCabKm('lax','syd'),ready:0})"), 0);
  assert.equal(ev("cabBack({kind:'df',own:true,sub:true,km:26000,ready:0})"), ev('ownCabCost(26000)'));
  assert.equal(ev("cabBack({kind:'df',own:true,sub:true,km:26000,ready:0,paid:5e8})"), 5e8, 'what was really paid');
  assert.equal(ev("cabBack({kind:'df',own:true,sub:true,km:18387,ready:0})"), 0, 'a finished cable upgrades can light is yours for good');
  assert.deepEqual(errors, []);
});

test('#50 a city without a cable landing points to the nearest one', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'zrh'});UI.pending=null;openLinkModal('zrh','nyc')");
  const t = ev("$('modalCard').textContent");
  assert.match(t, /No subsea cable lands in Zurich\. The nearest landing station is Milan/);
  assert.doesNotMatch(t, /nowhere/);
  assert.deepEqual(errors, []);
});

test('#36 your own IX moves between buildings, or runs a switch in both', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'beg'});ACT.launchBB({city:'beg'});ACT.foundIx({city:'beg'});ACT.addSite({city:'beg'});compute()");
  assert.ok(ev("!!S.myIx.beg"));
  const mo = ev("ixMo('beg')"), cap = ev("ixCap('beg')");
  assert.ok(cap > 0);
  // no LAG for a switch you own
  ev("UI.sel={type:'city',id:'beg'};UI.tab='peer';renderPanel()");
  assert.equal(ev("!!document.querySelector('#panel [data-act=lagIx]')"), false, 'no LAG button');
  // move it to B: a dark A no longer matters
  ev("ACT.siteSet({k:'ix',id:'beg',s:'b'})");
  assert.equal(ev("S.ixSite.beg"), 'b');
  ev("addInc({type:'site',ref:'beg',site:'a',until:S.day+3,msg:'x',cost:0});compute()");
  assert.equal(ev("ixCap('beg')"), cap, 'B is up');
  // both buildings: a second switch for half the fabric's fee, survives either one going dark
  ev("ACT.siteSet({k:'ix',id:'beg',s:'ab'})");
  assert.equal(ev("S.ixSite.beg"), 'ab');
  assert.equal(ev("ixMo('beg')"), Math.round(mo * 1.5));
  assert.equal(ev("(S.ixn||{}).beg||1"), 1, 'no LAG member bought');
  ev("S.inc=[];addInc({type:'site',ref:'beg',site:'b',until:S.day+3,msg:'x',cost:0});compute()");
  assert.equal(ev("ixCap('beg')"), cap);
  ev("addInc({type:'site',ref:'beg',site:'a',until:S.day+3,msg:'x',cost:0});compute()");
  assert.equal(ev("ixCap('beg')"), 0, 'both dark');
  assert.deepEqual(errors, []);
});

test('#56 parallel waves of different sizes are labelled per size, not as N times the total', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'nyc'});ACT.buildPop({city:'lon'})");
  ev("for(let i=0;i<3;i++){UI.via='grace';UI.route='same';openLinkModal('nyc','lon');ACT.buildLink({tier:1});closeModal();}compute()");
  const lbl = () => ev("(()=>{const g=linkGroups()[0];return groupLabel(g,g)})()");
  assert.equal(ev("linkGroups().length"), 1);
  assert.equal(lbl(), '3×100G', 'equal sizes keep the short form');
  ev("S.links[2].tier=2;S.links[0].tier=3;S.links[1].tier=3");
  assert.equal(lbl(), '2×800G + 400G');
  ev("S.links[1].tier=2");
  assert.equal(lbl(), '800G + 2×400G');
  ev("S.links.pop()");
  assert.equal(lbl(), '800G + 400G', 'not "2 × 1.2T"');
  assert.match(ev("(()=>{const g=linkGroups()[0];return groupLabel(g,[g[0]])})()"), /^800G \+ 400G · 1\/2 /);
  ev("cam.z=2;draw(0)");
  assert.deepEqual(errors, []);
});

test('#107 a bigger optic never carries less than a smaller one at the same distance', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  // every optic on the same line system, at every distance, on land and subsea
  const bad = ev(`(()=>{const out=[],ks=Object.keys(OPT);for(const sub of [false,true])for(let km=100;km<=19000;km+=50){const l={km,sub,regen:0};
    for(const a of ks)for(const b of ks){const A=OPT[a],B=OPT[b];if(A.sys!==B.sys||A.g<=B.g)continue;const ga=optMode(a,l),gb=optMode(b,l);
      if(gb&&(!ga||ga.g<gb.g))out.push(a+'<'+b+'@'+km+(sub?'s':''));}}return out.slice(0,5).join()})()`);
  assert.equal(bad, '', 'bigger optic falls back to whatever the smaller one manages');
  assert.equal(ev("optMode('tp32',{km:4500,sub:false,regen:0}).g"), 1200);
  assert.equal(ev("optMode('tp32',{km:7000,sub:true,regen:0}).g"), 1200);
  assert.deepEqual(errors, []);
});

test('#110 PNI buttons show the monthly port fee, not just the one-off setup', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});selectCity('fra');ACT.tab({t:'peer'})");
  const txt = ev("document.getElementById('panelBody').textContent");
  assert.match(txt, /10G \$1\.8k \+ \$200\/mo/, 'setup plus the monthly fee, like IX ports and LAG members');
  // upgrading an existing PNI says what the bigger port costs per month too, in the panel and in the NOC's list
  ev("const n=NETS.find(x=>x.pops.includes('fra')&&!x.tail&&peerOk(x.id,'pni','fra').ok);S.pni.push({id:'p1',net:n.id,city:'fra',tier:0,n:1});after();selectCity('fra');ACT.tab({t:'peer'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Upgrade 100G \$2\.3k \+ \$350\/mo/);
  assert.match(ev("connUp(conns().find(r=>r.k==='p'&&r.id==='p1')).replace(/<[^>]+>/g,'')"), /Upgrade 100G \$2\.3k \+ \$350\/mo/);
  assert.deepEqual(errors, []);
});

test('#111 #121 #12 the road to Tier 1: what is missing, and where to meet each network', () => {
  const { ev, errors, dom } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)if(g.id!=='t1')S.done[g.id]=0");
  ev("for(const c of ['fra','ams','nyc']){ACT.buildPop({city:c});S.pops[c].rgen=3;}ACT.buyTransit({city:'fra',net:'cog',tier:2});for(const x of ixIdsIn('ams'))ACT.buyIx({city:x,tier:2,signed:true});compute();ACT.peerAll({city:'ams'});compute()");
  const body = () => dom.window.document.getElementById('leftBody').textContent;
  // transit hides how much you would lose without it
  assert.ok(ev('R.reach') > 0.99 && ev('R.reachNT') < ev('R.reach'), 'reach without transit is counted separately');
  assert.equal(ev("NETS.filter(n=>R.nt[n.id]).reduce((a,n)=>a+NSH[n.id],0).toFixed(6)"), ev('R.reachNT.toFixed(6)'));
  // #111: the goal card lists the missing Tier 1 PNIs and the networks out of reach
  ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderLeft()");
  assert.match(body(), /Road to Tier 1/);
  assert.match(body(), new RegExp(`PNIs with every Tier 1\\s*0 / ${ev('t1Need().length')}`));
  assert.match(body(), /Transit ports to cancel\s*1/);
  assert.match(body(), new RegExp(ev('t1Need()[0].name')));
  assert.match(body(), /Tier 1s only take a PNI from a network with/);
  assert.match(body(), /out of reach/);
  // the filter lists exactly the networks you reach only through transit, biggest first
  ev("ACT.netFilter({f:'out'})");
  const shown = JSON.parse(ev("JSON.stringify(ntLost().map(n=>n.id))"));
  assert.ok(shown.length > 0 && shown.length === ev("NETS.filter(n=>!R.nt[n.id]).length"));
  const reached = ev("NETS.find(n=>R.nt[n.id]&&!n.tail).name");
  assert.ok(!body().includes(reached + ' AS'), 'networks you already reach are not on the list');
  assert.ok(ev("ntLost().every((n,i,a)=>!i||NSH[a[i-1].id]>=NSH[n.id])"));
  // #12, #121: every place to meet a network, your POPs first, then the nearest
  const far = ev("NETS.find(n=>!n.tail&&n.ix!=='ALL'&&n.pops.length&&n.pops.every(c=>!S.pops[c])).id");
  const spots = JSON.parse(ev(`JSON.stringify(meetSpots('${far}').map(x=>x.c))`));
  assert.ok(spots.length >= 1);
  const near = JSON.parse(ev("JSON.stringify(popNear())"));
  assert.ok(spots.every((c, i) => !i || near[spots[i - 1]] <= near[c]), 'nearest first');
  assert.ok(ev(`NET['${far}'].pops.every(c=>meetSpots('${far}').some(x=>x.c===c&&x.pni))`), 'every PNI city is listed');
  assert.match(ev(`offTransitHint('${far}')`), new RegExp('Nearest: ' + ev(`CITY['${spots[0]}'].name`)));
  ev(`ACT.netFocus({id:'${far}'})`);
  assert.match(body(), /Where to meet them/);
  assert.match(body(), new RegExp(ev(`CITY['${spots[0]}'].name`)));
  ev(`ACT.meetGo({city:'${spots[0]}'})`);
  assert.equal(ev('UI.sel&&UI.sel.id'), spots[0]);
  // the NOC to-do list has a way to the network's entry
  ev("for(const c of Object.keys(S.pops))ACT.launchBB({city:c});for(let i=0;i<3;i++)dayTick();$('dash').hidden=false;UI.dtab='traffic';renderDash()");
  assert.match(dom.window.document.getElementById('dash').innerHTML, /data-act="netFocus"/);
  // Tier 1 reached: the card goes away
  ev("S.transit=[];for(const n of t1Need())S.pni.push({id:'t'+n.id,net:n.id,city:n.pops[0],tier:0});compute();R.reach=1;R.reachNT=1;for(const n of NETS)R.reachable[n.id]=R.nt[n.id]=1;UI.left='goals';renderLeft()");
  assert.equal(ev('isTier1()'), true);
  assert.doesNotMatch(body(), /Road to Tier 1/);
  // phones: the same views in the bottom sheet
  dom.window.innerWidth = 360; ev("ACT.netFilter({f:'out'});renderAll&&renderAll()");
  assert.deepEqual(errors, []);
});

test('#113 Red Sea Crisis wants traffic into Asia for a month, not broadband and a thin path on day 0', () => {
  const { ev, errors } = load();
  ev("UI.pitched=true;ACT.startScn({id:'redsea',sure:1});closeModal();S.tut=null;S.cash=1e10;S.nextFail=1e9;S.nextEvent=1e9");
  // the cheapest allowed cable route from Marseille to Singapore
  const route = JSON.parse(ev(`(()=>{const Rl=SCN.find(x=>x.id==='redsea').rules,bc=new Set(Rl.banCities),bp=new Set(Rl.banPairs),adj={};
    for(const p of CABLE_PAIRS){if(bp.has(p.cid+':'+p.a+'-'+p.b)||bp.has(p.cid+':'+p.b+'-'+p.a)||bc.has(p.a)||bc.has(p.b))continue;(adj[p.a]=adj[p.a]||[]).push([p.b,p.km]);(adj[p.b]=adj[p.b]||[]).push([p.a,p.km]);}
    const D={mrs:0},P={},Q=['mrs'],seen=new Set();while(Q.length){Q.sort((x,y)=>D[x]-D[y]);const u=Q.shift();if(seen.has(u))continue;seen.add(u);for(const [v,km] of adj[u]||[]){if(D[v]===undefined||D[u]+km<D[v]){D[v]=D[u]+km;P[v]=u;Q.push(v);}}}
    const r=['sin'];while(r[0]!=='mrs')r.unshift(P[r[0]]);return JSON.stringify(r);})()`));
  const build = (tier) => ev(`for(const c of ${JSON.stringify(route)})if(!S.pops[c])ACT.buildPop({city:c});const r=${JSON.stringify(route)};
    for(let i=1;i<r.length;i++){UI.pending=null;UI.via=null;UI.lmode='wave';UI.route='main';openLinkModal(r[i-1],r[i]);ACT.buildLink({tier:${tier}});closeModal();}`);
  // the old exploit: broadband with local transit everywhere for 300 Gbps served, and a 10G path
  build(0);
  ev("for(const c of ALLC.filter(c=>CITY[c].reg==='EU'&&!CITY[c].cn).slice(0,40)){if(!S.pops[c])ACT.buildPop({city:c});if(!S.pops[c].bb)ACT.launchBB({city:c});S.pops[c].bb.d=CITY[c].P*0.6;const t=NETS.find(n=>n.price&&n.pops.includes(c));if(t)ACT.buyTransit({city:c,net:t.id,tier:1});}for(const n of NETS.filter(n=>n.price&&n.pops.includes('mrs')).slice(0,2))ACT.buyTransit({city:'mrs',net:n.id,tier:1});after();dayTick()");
  assert.ok(ev('pathExists("mrs","sin")') && ev('R.served') >= 300, 'what used to be enough');
  assert.ok(!ev('S.scn.done'), 'no longer a win on day 0');
  assert.ok(ev('asiaG()') <= 10.01, 'a 10G path carries at most 10G into Asia');
  // a fresh start with a real 100G route and an upstream in Marseille, busy for a month
  ev("UI.pitched=true;ACT.startScn({id:'redsea',sure:1});closeModal();S.tut=null;S.cash=1e10;S.nextFail=1e9;S.nextEvent=1e9");
  build(1);
  ev("for(const n of NETS.filter(n=>n.price&&n.pops.includes('mrs')).slice(0,2))ACT.buyTransit({city:'mrs',net:n.id,tier:1});for(const c of ['sin','bom'])if(!S.pops[c].bb)ACT.launchBB({city:c});after()");
  assert.ok(!ev('S.scn.done'));
  // Asian users backhauled to Marseille transit get slow service and would churn away; keep them subscribed,
  // this is about the 30-day counter.
  ev("window.__bb={sin:60,bom:60}");
  let d = 0; while (!ev('S.scn.done') && d < 200) { ev('for(const c of ["sin","bom"])S.pops[c].bb.d=Math.max(S.pops[c].bb.d,__bb[c]);dayTick()'); d++; }
  assert.ok(ev('S.scn.done'), 'won once 80 Gbps crossed into Asia for 30 days in a row');
  assert.ok(d >= 30, `took ${d} days`);
  assert.match(ev("scnProg().items.map(x=>x.l+' '+x.txt).join(' | ')"), /Days in a row at 80(\.0)? Gbps or more 30 \/ 30/);
  // the streak only counts days in a row
  ev("S.stats.asiaRun=12;for(const l of S.links)l.cut=S.day+5;after();dayTick()");
  assert.equal(ev('S.stats.asiaRun'), 0);
  assert.deepEqual(errors, []);
});

test('#84 Luxembourg has its own eyeball ISP at LU-SICK; no real company names among wave sellers', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});S.transit=[];S.ixp={};S.pni=[];for(const n of t1Need())S.pni.push({id:n.id,net:n.id,city:'fra',tier:0});compute()");
  assert.equal(ev("NET.pst.type"), 'eye');
  assert.ok(ev("NET.pst.pops.includes('bet')&&ixMembers('bet').includes('pst')"), 'at Bettembourg and on LU-SICK');
  assert.ok(ev('R.reachable.pst'), 'a Tier 1 still reaches it through the carriers it buys from');
  assert.match(ev("peerOk('pst','ix','bet').why||''"), /Gbps/, 'selective: it wants some traffic first');
  assert.ok(ev("!WAVECO.some(n=>/GTT/.test(n))&&!BIZ_T.wwave.names.some(n=>/GTT/.test(n))"));
  assert.deepEqual(errors, []);
});

test('#51 a dark fiber shows what is rented out, and spare capacity can be listed with a broker', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'ams'});S.offers=[];S.links.push({id:'df1',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',ch:['tp16','tp16'],km:450,ready:0,day:0,cut:0,mo:100,trench:'own:df1',pairs:1});after();UI.sel={type:'link',id:'df1'};renderPanel()");
  const txt = () => ev("document.getElementById('panelBody').textContent");
  assert.match(txt(), /Selling spare capacity/); assert.match(txt(), /Free channels\s*62 \/ 64/);
  // a broker keeps a listing and sells it as the route's market wants (#203), keeping 10%
  ev("__reseed(9);ACT.listFiber({id:'df1',w:4})");
  assert.equal(ev("S.links[0].list.w"), 4);
  assert.match(txt(), /Listed with a capacity broker/);
  ev("for(let i=0;i<120&&!S.biz.some(b=>b.link==='df1');i++)brTick();renderPanel()");
  const b = JSON.parse(ev("JSON.stringify(S.biz.find(x=>x.link==='df1'))"));
  assert.equal(b.type, 'wwave');
  assert.equal(b.rate, ev(`Math.round(waveMo(450,false,2)*0.55*${b.slots}*0.9)`), 'the usual alien-wave price minus the broker');
  assert.ok(txt().includes(b.name), 'the customer is listed on the fiber');
  assert.match(txt(), new RegExp(`Free channels\\s*${62 - b.slots} / 64`));
  assert.equal(ev("S.links[0].list?S.links[0].list.w:0"), 4 - b.slots, 'the listing shrinks by what sold');
  // when every channel is lit or sold, only the spare pair in your own trench can be listed; then nothing is left
  ev("const l=S.links[0];delete l.list;l.ch=Array(chMax(l)-soldSlots(l)).fill('tp16');after();ACT.listFiber({id:'df1',w:4,p:1})");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.links[0].list)")), { w: 0, p: 1 });
  ev("S.biz.push({id:'p1',type:'dfpair',link:'df1',city:'fra',city2:'ams',name:'X',bw:1,rate:1,reqs:[]},{id:'p2',type:'dfpair',link:'df1',city:'fra',city2:'ams',name:'Y',bw:1,rate:1,reqs:[]});delete S.links[0].list;S.offers=[];renderPanel()");
  assert.match(txt(), /Nothing spare to sell on this fiber right now/);
  ev("ACT.listFiber({id:'df1',w:1,p:1})"); assert.equal(ev("S.links[0].list===undefined"), true);
  // an old broker offer still survives a save
  ev("S.offers=[{...fiberOffer('dfpair',S.links[0],()=>'Y',0.9),broker:'yes'}];S=sanitize(S)");
  assert.equal(ev('S.offers[0].broker'), true);
  assert.deepEqual(errors, []);
});

test('#126 you can zoom in far enough, and pick a short link between two close cities', () => {
  const { ev, errors } = load();
  ev("ACT.start({city:'sao'});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['cpq'])ACT.buildPop({city:c});UI.pending=null;UI.via=null;UI.lmode='wave';UI.route='main';openLinkModal('sao','cpq');ACT.buildLink({tier:1});closeModal()");
  assert.ok(ev('ZMAX') >= 16);
  const id = ev("S.links.find(l=>l.a==='sao'||l.b==='sao').id");
  // the middle of the drawn link, on screen, fully zoomed in on it
  const at = (z) => JSON.parse(ev(`(()=>{const l=S.links.find(x=>x.id==='${id}'),g=linkGeom(l,pairIdx().get(edgeKey(l))),p=g.pts[Math.floor(g.pts.length/2)];
    cam.x=p[0];cam.y=p[1];cam.z=1;zoomAt(CW/2,CH/2,${z});const [sx,sy]=toS(p[0],p[1],visibleKs()[0]);const c=toS(CITY.sao.x,CITY.sao.y,visibleKs()[0]);return JSON.stringify({sx,sy,cx:c[0],cy:c[1],z:cam.z});})()`));
  const m = at(100);
  assert.equal(m.z, ev('ZMAX'), 'zoom stops at the new maximum');
  assert.equal(ev(`pickCity(${m.sx},${m.sy})`), null, 'the middle of the link is not grabbed by a city');
  assert.equal(ev(`hitLink(${m.sx},${m.sy})`), id);
  assert.equal(ev(`pickCity(${m.cx},${m.cy-4}).id`), 'sao', 'tapping the city icon still picks the city');
  // even at the old maximum, a click on the link now picks the link where it is not under a city icon
  const o = at(6);
  assert.ok(Math.abs(o.z - 6) < 1e-9);
  assert.equal(ev(`pickCity(${o.sx},${o.sy})`), null);
  assert.deepEqual(errors, []);
});

test('#134 an exchange named after its city does not repeat the city in messages', () => {
  const { ev, errors } = load();
  base(ev);
  assert.equal(ev("ixNamesCity('cpq')"), true);
  assert.equal(ev("ixNamesCity('fra')"), false);
  ev("ACT.buildPop({city:'cpq'});ACT.buyIx({city:'cpq',tier:1,signed:true});ACT.buyIx({city:'fra',tier:1,signed:true});S.ixn={cpq:2,fra:2}");
  assert.equal(ev("S.ixp.cpq!==undefined&&S.ixp.fra!==undefined"), true);
  const labs = JSON.parse(ev("JSON.stringify(lagsN().filter(o=>o.k==='ix').map(o=>o.lab))"));
  assert.ok(labs.includes('IX.brrr Campinas LAG'), labs.join(' | '));
  assert.ok(labs.some(l => / LAG in Frankfurt$/.test(l)), labs.join(' | '));
  ev("S.inc=[];eval('('+fireFailure.toString().replace(\"if(only)type=only;\",\"type='ixloop';\").replace(\"const c=pick(Object.keys(S.ixp));\",\"const c='cpq';\")+')')()");
  const msg = ev("S.inc.map(i=>i.msg).join(' ')");
  assert.match(msg, /IX\.brrr Campinas/);
  assert.doesNotMatch(msg, /in Campinas/);
  assert.deepEqual(errors, []);
});

test('#166 every Brazilian exchange is named after its city, São Paulo included', () => {
  const { ev, errors } = load();
  base(ev);
  assert.equal(ev("CITY.sao.ix"), 'IX.brrr São Paulo');
  assert.equal(ev("ixNamesCity('sao')"), true);
  const odd = JSON.parse(ev("JSON.stringify(CITIES.filter(c=>c.br&&c.ix&&c.ix.trim()==='IX.brrr').map(c=>c.id))"));
  assert.deepEqual(odd, []);
  assert.deepEqual(errors, []);
});

test('link redundancy trials distinguish a bridge, a full fallback and a healthy alternate path without changing the game',()=>{
 const {ev,errors}=load();
 ev("ACT.start({});S.cash=1e8;ACT.buildPop({city:'bde'});ACT.buildPop({city:'ams'});S.biz=[{id:'circuit',name:'Test Circuit',type:'l2vpn',city:'fra',city2:'bde',bw:80,rate:1,reqs:[]}];S.links=[{id:'main',a:'fra',b:'bde',kind:'wave',tier:1,km:100,mo:100,cut:0,trench:'main'}];compute();window.state=JSON.stringify(S);window.live=R;window.hot=UI.hotMap;window.cache=TE_CACHE");
 let t=JSON.parse(ev("JSON.stringify(linkTrial('main'))"));assert.equal(t.split,true);assert.equal(t.loss,80);
 assert.equal(ev('JSON.stringify(S)'),ev('state'));assert.equal(ev('R===live&&UI.hotMap===hot&&TE_CACHE===cache'),true);
 ev("S.links.push({id:'a',a:'fra',b:'ams',kind:'wave',tier:0,km:100,mo:100,cut:0},{id:'b',a:'ams',b:'bde',kind:'wave',tier:0,km:100,mo:100,cut:0});compute()");
 t=JSON.parse(ev("JSON.stringify(linkTrial('main'))"));assert.equal(t.split,false);assert.equal(t.loss,70);assert.equal(t.busy.length,2);
 ev("S.links[1].tier=1;S.links[2].tier=1;compute()");t=JSON.parse(ev("JSON.stringify(linkTrial('main'))"));assert.equal(t.split,false);assert.equal(t.loss,0);
 ev("S.links[1].cut=S.day+5;compute()");assert.equal(ev("linkTrial('main').split"),true,'existing failures are respected');assert.equal(ev("linkTrial('a')"),null,'an already failed link is not tested');
 ev("S.links=S.links.slice(0,1);S.links.push({...S.links[0],id:'parallel'});compute()");assert.equal(ev("linkTrial('main').split"),false,'only the selected link fails even when a trench is shared');assert.equal(ev("linkTrial('main').loss"),0);
 ev("S.links[0]={...S.links[0],kind:'df',sys:'roadm',ch:['tp16'],pairs:1,regen:0,ready:0,own:true};compute()");assert.equal(ev("linkTrial('main').loss"),0,'dark fiber is tested as one link');
 ev("window.innerWidth=360;ACT.linkCheck({id:'main'})");assert.match(ev("$('modalCard').textContent"),/One backhoe is not enough/);assert.equal(ev("$('modal').className"),'link-check');ev("ACT.phoneTab({t:'noc'})");assert.equal(ev("$('modal').hidden"),true);
 ev("S.links[0]={...S.links[0],kind:'vxc',vt:1,prov:FABS[0].id};compute()");assert.equal(ev("linkTrial('main').loss"),0,'virtual circuits are tested individually');
 ev("window.saveRef=S;window.liveRef=R;window.originalCompute=compute;compute=()=>{throw Error('trial failed')}");assert.throws(()=>ev("linkTrial('main')"),/trial failed/);ev('compute=originalCompute');assert.equal(ev('S===saveRef&&R===liveRef'),true,'even a failed trial restores the live state');
 assert.deepEqual(errors,[]);
});

test('#219 splitting a one-member PNI across both sites splits it when the augment lands', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;UI.speed=0;for(const g of GOALS)S.done[g.id]=0;Object.assign(S.pops.fra,{site2:true,routers:4});S.pni.push({id:'x',net:'nfx',city:'fra',tier:1,ready:0});compute()");
  const cash = ev('S.cash');
  ev("ACT.siteSet({k:'p',id:'x',s:'ab'})");
  assert.equal(ev('S.pni[0].up.n'), 2, 'second member ordered');
  assert.equal(ev('S.pni[0].up.site'), 'ab', 'remembers the split');
  assert.ok(ev('S.cash') < cash, 'paid once');
  // clicking again while it is on order buys nothing more
  const paid = ev('S.cash');
  ev("ACT.siteSet({k:'p',id:'x',s:'ab'})");
  assert.equal(ev('S.cash'), paid);
  // the panel shows Both as chosen meanwhile
  ev("selectCity('fra');ACT.tab({t:'peer'})");
  assert.equal(ev(`[...document.querySelectorAll('[data-act=siteSet].pink')].filter(b=>JSON.parse(b.dataset.args).k==='p').map(b=>JSON.parse(b.dataset.args).s).join()`), 'ab', 'Both is shown as chosen');
  assert.equal(ev("(()=>{const m=siteCtl('p','x','fra',S.pni[0].up&&S.pni[0].up.site==='ab'?'ab':S.pni[0].site).match(/<button[^>]*class=\"[^\"]*pink[^>]*>(.*?)<\\/button>/);return m&&m[1].includes(tr('common.site'))?'':m&&m[1]})()").startsWith('Both'), true);
  // survives a save and load
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev('S.pni[0].up.site'), 'ab');
  ev('S.day=S.pni[0].up.ready-1;dayTick()');
  assert.equal(ev('S.pni[0].n'), 2);
  assert.equal(ev('S.pni[0].site'), 'ab', 'one member in each building');
  assert.equal(ev("liveN('fra','ab',2)"), 2);
  assert.deepEqual(errors, []);
});

test('#219 choosing one site again while the augment is on order keeps the LAG in that site', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;UI.speed=0;for(const g of GOALS)S.done[g.id]=0;Object.assign(S.pops.fra,{site2:true,routers:4});S.pni.push({id:'x',net:'nfx',city:'fra',tier:1,ready:0});compute()");
  ev("ACT.siteSet({k:'p',id:'x',s:'ab'})");
  ev("ACT.siteSet({k:'p',id:'x',s:'b'})");
  assert.equal(ev('S.pni[0].up.site'), undefined);
  ev('S.day=S.pni[0].up.ready-1;dayTick()');
  assert.equal(ev('S.pni[0].site'), 'b');
  assert.deepEqual(errors, []);
});

test('#210 candidate exits on saturated shortest paths are skipped to avoid fallback churn', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;UI.speed=0;for(const g of GOALS)S.done[g.id]=0;");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});");
  ev("ACT.buildPop({city:'par'});ACT.launchBB({city:'par'});");
  ev("S.links.push({id:'x1',a:'fra',b:'par',kind:'wave',tier:0,km:450,mult:1,mo:1000,ready:0,cut:0});");
  ev("compute();");
  assert.ok(ev("R.load['x1'] >= 10 - 1e-6"), 'intercity wave is saturated');
  assert.ok(ev("R.load['x1'] <= 10 + 1e-6"), 'and carries no more than it can');
  // Skipping exits behind the full wave changes nothing: routing again gives the same answer.
  const first = ev('JSON.stringify([R.served,R.citySrv,R.load])');
  ev("compute();");
  assert.equal(ev('JSON.stringify([R.served,R.citySrv,R.load])'), first);
  assert.deepEqual(errors, []);
});
