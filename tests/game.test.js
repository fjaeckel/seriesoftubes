const test = require('node:test');
const assert = require('node:assert/strict');
const { load, seed } = require('./harness');

test('daily DDoS spawns share one routing calculation and score their first active day', () => {
  const { ev, errors } = load();
  // The busier daily DDoS schedule comes with gaming customers.
  ev("ACT.start({});S.biz=[{type:'game',id:'g',name:'G',city:'fra',bw:1,rate:1,reqs:[]}];S.cash=1e9;S.day=50;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute();window.__compute=compute;window.__random=Math.random;window.__computes=0;compute=()=>{window.__computes++;window.__compute()};Math.random=()=>0;dayTick();compute=window.__compute;Math.random=window.__random");
  assert.equal(ev('ddosAll().length'), 2, 'both daily spawn opportunities were used');
  assert.equal(ev('window.__computes'), 1, 'daily spawns do not reroute the whole network individually');
  assert.ok(ev('ddosAll().every(a=>a.worst===ddosSf(a))'), 'first-day service is recorded after routing');
  assert.deepEqual(errors, []);
});

test('page boots to the title screen without errors', () => {
  const { ev, errors } = load();
  assert.equal(ev("document.getElementById('modal').hidden"), false);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Series\s*of\s*Tubes/);
  assert.deepEqual(errors, []);
});

test('every city sits on its landmass', () => {
  const { ev } = load();
  const off = ev("CITIES.filter(c=>!inPoly(c.x,c.y,LANDS.find(l=>l.id===c.land).pts)).map(c=>c.id).join()");
  assert.equal(off, '');
});

test('every cable lands at two known cities and has a length', () => {
  const { ev } = load();
  const bad = ev("CABLE_PAIRS.filter(c=>!CITY[c.a]||!CITY[c.b]||!(c.km>0)).map(c=>c.cid).join()");
  assert.equal(bad, '');
});

test('a year of scripted play stays healthy', () => {
  const { ev, errors } = load();
  seed(ev, 7);
  ev("ACT.start({})");
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'})");
  ev("UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});ACT.launchBB({city:'ams'})");
  for (let d = 0; d < 360; d++) {
    ev('dayTick()');
    if (d % 30 === 0) ev("for(const o of S.offers.slice())if(S.pops[o.city]&&(!o.city2||S.pops[o.city2]))ACT.accept({id:o.id})");
  }
  assert.ok(ev('S.day') >= 360);
  assert.ok(Number.isFinite(ev('S.cash')), 'cash is a number');
  assert.ok(ev('R.served') > 0, 'traffic is flowing');
  assert.equal(ev("JSON.stringify(R).includes('NaN')||JSON.stringify(S).includes('null,null')"), false);
  assert.deepEqual(errors, []);
});

test('every incident and event type fires and clears cleanly', () => {
  const { ev, errors } = load();
  seed(ev, 3);
  ev("ACT.start({});S.cash=1e8;S.lvl=4;S.day=100");
  ev("for(const c of ['ams','lon','nyc','mos','mnl'])ACT.buildPop({city:c})");
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'})");
  ev("UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.via='grace';openLinkModal('nyc','lon');ACT.buildLink({tier:1});closeModal()");
  ev("UI.pending={a:'fra',b:'ams'};UI.lmode='df';UI.dfSys='roadm';ACT.orderDf();UI.lmode='wave';S.pops.fra.rgen=2;S.pops.ams.rgen=2");
  ev("const df=S.links.find(l=>l.kind==='df');ACT.addCh({id:df.id,o:'zr4'});df.ready=S.day");
  const failSrc = ev('fireFailure.toString()');
  const types = ['harmless','fatwave','label','mtu','oops','cleaner','maxpfx','prepend','rpki','amp','roadmff','optic','ac','cut','crash','power','transit','ixloop','leak','ddos'];
  for (const t of types) {
    const funny = ['harmless','fatwave','label','mtu','oops','cleaner','maxpfx','prepend','rpki','roadmff','ac'].includes(t);
    const patched = failSrc
      .replace(/^function fireFailure/, 'function')
      .replace('let tot=opts.reduce', `if(!opts.some(o=>o[0]==='${funny ? 'funny' : t}'))return;opts.splice(0,opts.length,['${funny ? 'funny' : t}',1]);let tot=opts.reduce`)
      .replace('type=pick(f);}', `type=f.includes('${t}')?'${t}':pick(f);}`);
    ev('window.__ff=' + patched);
    ev('S.links.forEach(l=>{l.cut=0;l.eqDown=0;l.chFail=null});S.transit.forEach(t=>t.down=0);for(const c in S.pops)S.pops[c].down=0;compute()');
    ev('__ff()');
    ev('dayTick()');
  }
  const evSrc = ev('fireEvent.toString()');
  for (const e of ['viral','price','grant','sanction','tariff','hijack','landban','shutdown','redsea','baltic','runet','typhoon','golden','gfw']) {
    ev('window.__fe=' + evSrc.replace(/^function fireEvent/, 'function').replace('const e=pick(opts);', `const e='${e}';`));
    ev('__fe()');
    ev('dayTick()');
  }
  for (let d = 0; d < 60; d++) ev('dayTick()');
  assert.equal(ev('S.inc.filter(i=>i.until<=S.day).length'), 0, 'expired incidents are cleared');
  assert.deepEqual(errors, []);
});

test('every panel, tab and the dashboard render', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e7;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  for (let d = 0; d < 20; d++) ev('dayTick()');
  for (const t of ['cust', 'up', 'peer', 'links']) {
    ev(`selectCity('fra');ACT.tab({t:'${t}'})`);
    assert.ok(ev("document.getElementById('panelBody').textContent.length") > 50);
  }
  ev("selectCity('sha')");
  for (const t of ['goals', 'deals', 'noc', 'nets']) ev(`ACT.leftTab({t:'${t}'})`);
  ev('ACT.dash({})');
  assert.ok(ev("document.querySelectorAll('#dashCard svg').length") >= 1);
  ev('showHelp()');
  assert.deepEqual(errors, []);
});

test('saves never resurrect a bankrupt game', () => {
  const { ev } = load();
  ev("ACT.start({});S.day=9;S.cash=-2e5;dayTick()");
  assert.equal(ev('S.lost'), true);
  assert.equal(ev('loadSave()'), null);
});

test('LAGs add members, capacity and cost to transit, IX ports and PNIs', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e7;S.lvl=4;S.pops.fra.rgen=2;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true})");
  ev("const t=S.transit[0];window.__c0=S.cash;ACT.lagT({id:t.id,d:1});ACT.lagT({id:t.id,d:1});ACT.lagIx({city:'fra',d:1});compute()");
  assert.equal(ev('S.transit[0].n'), 3);
  assert.equal(ev("S.ixn.fra"), 2);
  assert.equal(ev("__c0-S.cash"), 1500 * 2 + ev("ixPortMo('fra',1)"), 'two transit members and one IX member were charged');
  assert.equal(ev("ixCap('fra')"), 190);
  assert.equal(ev("R.cost.transit>0"), true);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2})");
  assert.equal(ev('S.transit[0].tier'), 2, 'upgrading a LAG upgrades every member');
  ev("ACT.lagT({id:S.transit[0].id,d:-1})");
  assert.equal(ev('S.transit[0].n'), 2);
  ev("for(let i=0;i<10;i++)ACT.lagT({id:S.transit[0].id,d:1})");
  assert.equal(ev('S.transit[0].n'), 8, 'capped at 8 members');
  ev("selectCity('fra');ACT.tab({t:'up'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /8×400G LAG/);
  assert.deepEqual(errors, []);
});

test('goal rewards are paid once, even for goals finished on day 0', () => {
  const { ev } = load();
  ev("ACT.start({})");
  const c0 = ev('S.cash');
  ev("ACT.launchBB({city:'fra'})");
  const c1 = ev('S.cash');
  for (let i = 0; i < 5; i++) ev('after()');
  assert.equal(ev('S.cash'), c1, 'no repeated reward');
  assert.equal(c1 - c0, ev("GOALS.find(g=>g.id==='bb').r") - ev("bbCost('fra')"));
});

test('Stuttgart has only the Spätzle-IX: no transit, no PNIs', () => {
  const { ev } = load();
  assert.equal(ev("CITY.stg.ix"), 'Spätzle-IX');
  assert.equal(ev("NETS.filter(n=>n.pops.includes('stg')).length"), 0);
  ev('ACT.start({})');
  assert.ok(ev("ixMembers('stg').length") > 0, 'networks still peer at the exchange');
});

test('bank: offers arrive, loans pay out, cost money monthly and get paid off', () => {
  const { ev, errors } = load();
  seed(ev, 5);
  ev("ACT.start({});ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("S.loanOffers=[];spawnLoanOffer(false)");
  assert.equal(ev('S.loanOffers.length'), 1);
  ev("S.loanOffers[0]={id:'x1',bank:'db',amount:100000,exp:S.day+20,covs:['fax'],apr:0.12,term:6,pay:Math.round(annuity(100000,0.12,6))}");
  const c0 = ev('S.cash');
  ev("ACT.takeLoan({id:'x1'})");
  assert.equal(ev('S.cash') - c0 >= 100000 - 1, true, 'cash paid out');
  assert.ok(ev('R.cost.loans') > 17000, 'monthly payment shows up in costs');
  for (let d = 0; d < 200; d++) ev('dayTick()');
  assert.equal(ev("S.loans.filter(l=>l.id==='x1').length"), 0, 'six-month loan is paid off');
  ev('ACT.bank({})');
  assert.match(ev("document.getElementById('bankCard').textContent"), /Credit rating/);
  assert.deepEqual(errors, []);
});

test('bank: broke players get emergency offers, broken conditions cost a penalty', () => {
  const { ev } = load();
  seed(ev, 9);
  ev("ACT.start({});S.cash=-20000");
  for (let d = 0; d < 20; d++) ev('loanTick(S.day)');
  assert.ok(ev('S.loanOffers.length') >= 1, 'someone offers money when you are broke');
  ev("S.cash=500000;S.loans.push({id:'c1',bank:'db',start:S.day-40,amount:100000,bal:100000,apr:0.1,pay:5000,left:24,term:24,share:0,covs:['gen'],base:{sub:0}})");
  for (let d = 0; d < 10; d++) ev('S.day++;loanTick(S.day)');
  assert.ok(ev("S.loans.find(l=>l.id==='c1').bal") > 100000, 'penalty added after 10 days of breach');
});

test('bank: the venture vultures take a share of revenue instead of payments', () => {
  const { ev } = load();
  ev("ACT.start({});ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});for(let i=0;i<30;i++)dayTick()");
  ev("S.loanOffers.push({id:'v1',bank:'vult',amount:500000,exp:S.day+20,covs:['blitz'],share:0.1});ACT.takeLoan({id:'v1'})");
  assert.equal(ev('R.cost.loans'), 0);
  assert.ok(Math.abs(ev('R.cost.revshare') - ev('R.revMo') * 0.1) < 1);
});

test('Flowspec is a router-model capability, and each tool answers a flood', () => {
  const { ev, errors } = load();
  // The capability table: full TCAM leaves least junk, basic more, none lets it all through.
  assert.ok(ev("FS_RES[2] < FS_RES[1] && FS_RES[1] < FS_RES[0] && FS_RES[0] === 1"), 'full trims more than basic, basic more than none');
  assert.ok(ev("RG.some(r=>r.fs===0) && RG.some(r=>r.fs===1) && RG.some(r=>r.fs===2)"), 'models span none/basic/full TCAM');
  // Start on the used Rusty Router (rgen 0), which has no Flowspec TCAM.
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  assert.equal(ev("fsAt('fra')"), 0, 'the Rusty POP cannot do Flowspec');
  const clean = ev('R.served');
  assert.ok(clean > 20, 'traffic flows before the attack');
  // A 300 Gbps DNS flood on fra: with no TCAM here the junk starves the exit and node.
  ev("S.ev.ddos={city:'fra',vec:'dns',gbps:300,until:S.day+3,entry:{k:'t',lab:'x'},bh:false,start:S.day};compute()");
  const none = ev('R.served');
  assert.ok(none < clean, 'an unfiltered flood displaces real traffic');
  // Give this same router Flowspec TCAM (holding its forwarding capacity fixed): the DNS flood is filtered.
  const full = ev("RG[0].fs=2;compute();R.served"); ev("RG[0].fs=0");
  assert.ok(full > none, 'a Flowspec-capable router recovers a known flood');
  // It cannot touch an application-layer HTTP flood, however big the TCAM.
  const http = ev("RG[0].fs=2;S.ev.ddos.vec='http';compute();const s=R.served;RG[0].fs=0;s");
  assert.ok(Math.abs(http - none) < 1, 'Flowspec is useless against HTTP');
  // Scrubbing cleans any vector, regardless of router. A 1T center swallows this 300 Gbps flood whole.
  ev("S.ev.ddos.vec='dns';S.scrubs=[{city:'fra',tier:1}];S.scrubMode='always';compute()");
  assert.ok(ev('R.served') > none, 'scrubbing recovers real traffic');
  assert.deepEqual(errors, []);
});

test('a distributed SYN flood reports actual Flowspec drops and sends only the remainder to scrubbing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.scrubs=[{city:'fra',tier:0}];S.scrubMode='always';S.ev.ddos={id:'syn',city:'fra',vec:'syn',gbps:30.2,start:0,until:7,entry:{k:'edge',lab:''}};compute()");
  assert.equal(ev('ddosReport(S.ev.ddos).flowspec'), 0);
  assert.equal(ev('ddosReport(S.ev.ddos).sp.parts[0].cleaned'), 30.2);
  assert.match(ev('ddosPanel()'), /— No Flowspec filtering: ingress routers have no TCAM/);
  assert.match(ev('ddosPanel()'), /✓ Scrubbing in Frankfurt: 30\.2 Gbps \/ 100G/);
  assert.doesNotMatch(ev('ddosPanel()'), /✓ Flowspec|After upstream scrubbing|Reaching your network/);
  for (const [router, dropped, scrubbed] of [[1,18.12,12.08], [3,25.67,4.53]]) {
    ev(`S.pops.fra.rgen=${router};compute()`);
    assert.ok(Math.abs(ev('ddosReport(S.ev.ddos).flowspec')-dropped)<1e-9);
    assert.ok(Math.abs(ev('ddosReport(S.ev.ddos).sp.parts[0].cleaned')-scrubbed)<1e-9);
    assert.match(ev('ddosPanel()'), new RegExp('✓ Flowspec dropping: '+dropped.toFixed(1).replace('.', '\\.')+' Gbps'));
    assert.match(ev('ddosPanel()'), new RegExp('Scrubbing in Frankfurt: '+scrubbed.toFixed(1).replace('.', '\\.')+' Gbps / 100G'));
    assert.doesNotMatch(ev('ddosPanel()'), /no TCAM|Edge filters dropping/);
  }
  ev("S.ev.ddos.vec='ack';compute()");
  assert.equal(ev('ddosReport(S.ev.ddos).flowspec'), 0);
  assert.equal(ev('ddosReport(S.ev.ddos).sp.parts[0].cleaned'), 30.2);
  assert.match(ev('ddosPanel()'), /— Flowspec cannot catch ACK flood/);
  assert.deepEqual(errors, []);
});

test('Flowspec, upstream cleaning and other edge filters are each accounted for separately', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=6;S.pops.fra.rgen=1;S.transit=[{id:'tf',city:'fra',net:'cog',tier:1}];S.scrubs=[{city:'fra',tier:0}];S.ev.ddos={id:'syn',city:'fra',vec:'syn',gbps:30.2,start:0,until:7,entry:{k:'t',id:'tf'}};compute()");
  assert.ok(Math.abs(ev('ddosReport(S.ev.ddos).flowspec')-18.12)<1e-9);
  assert.ok(Math.abs(ev('ddosReport(S.ev.ddos).sp.parts[0].cleaned')-12.08)<1e-9);
  assert.match(ev('ddosPanel()'), /✓ Flowspec dropping: 18\.1 Gbps/);
  ev('S.transit[0].clean=true;compute()');
  assert.ok(Math.abs(ev('ddosReport(S.ev.ddos).reaching')-3.02)<1e-9, 'clean pipe leaves a tenth');
  assert.ok(Math.abs(ev('ddosReport(S.ev.ddos).flowspec')-1.812)<1e-9);
  assert.match(ev('ddosPanel()'), /✓ After upstream scrubbing: 3\.0 Gbps/);
  ev("S.ixp={fra:1};S.ev.ddos.ixbh=true;compute()");
  assert.ok(Math.abs(ev('ddosReport(S.ev.ddos).filtered-ddosReport(S.ev.ddos).flowspec')-0.604)<1e-9);
  assert.match(ev('ddosPanel()'), /✓ Edge filters dropping: 0\.6 Gbps/);
  assert.ok(ev('Math.abs(ddosReport(S.ev.ddos).reaching-ddosReport(S.ev.ddos).filtered-ddosReport(S.ev.ddos).sp.parts.reduce((n,x)=>n+x.cleaned,0)-ddosReport(S.ev.ddos).leak)<1e-9'));
  assert.deepEqual(errors, []);
});
test('RTBH blackholes the victim, and HackBack 3000 is a gamble', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=120;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  ev("S.ev.ddos={city:'fra',vec:'syn',gbps:200,until:S.day+3,entry:{k:'edge',lab:''},bh:false,start:S.day};ACT.rtbh();compute()");
  assert.equal(ev('S.ev.ddos.bh'), true);
  assert.equal(ev('S.stats.rtbh'), 1);
  assert.ok(ev("R.citySrv.fra") < 1, 'the blackholed city serves nothing');
  // HackBack: a forced win ends the attack early.
  ev("S.ev.ddos.bh=false;S.ev.ddos.until=S.day+3;const _r=Math.random;Math.random=()=>0.1;ACT.hackback();Math.random=_r");
  assert.ok(ev('S.ev.ddos.until') <= ev('S.day'), 'a lucky hack-back ends it');
  // A forced miss fines you and marks you a vigilante.
  ev("S.ev.ddos={city:'fra',vec:'dns',gbps:50,until:S.day+3,entry:{k:'edge',lab:''},bh:false,start:S.day};const c=S.cash;const _r=Math.random;Math.random=()=>0.9;ACT.hackback();Math.random=_r;window.__fined=c-S.cash");
  assert.ok(ev('window.__fined') > 20000, 'a bad hack-back costs the fee plus a fine');
  assert.equal(ev('S.stats.vigilante'), 1);
});

test('old saves load, and a stale flat DDoS object is repaired away', () => {
  const { ev } = load();
  ev("ACT.start({})");
  // An old save with a pre-1.17 flat attack (no vector) loads and the attack is dropped.
  const dropped = ev("const s=JSON.parse(JSON.stringify(S));s.ev={ddos:{city:'fra',until:9}};sanitize(s);s.ev.ddos===undefined");
  assert.equal(dropped, true, 'a vectorless attack is dropped');
  // A well-formed attack survives sanitize with its fields coerced.
  const kept = ev("const s=JSON.parse(JSON.stringify(S));s.ev={ddos:{city:'fra',vec:'dns',gbps:'80',until:9}};sanitize(s);JSON.stringify([s.ev.ddos&&s.ev.ddos.vec, s.ev.ddos&&s.ev.ddos.gbps])");
  assert.deepEqual(JSON.parse(kept), ['dns', 80], 'a shaped attack is kept, numbers coerced');
});

test('scrubbing tiers: capacity caps what a center can clean, and on-demand lags', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1});S.ev.ddos={city:'fra',vec:'dns',gbps:300,until:S.day+3,entry:{k:'t',lab:'x'},bh:false,start:S.day};compute()");
  const none = ev('R.served');
  // A 100G center cannot swallow a 300 Gbps flood; a 10T center can.
  const small = ev("S.scrubs=[{city:'fra',tier:0}];S.scrubMode='always';compute();R.served");
  const big = ev("S.scrubs[0].tier=2;compute();R.served");
  assert.ok(big > small, 'a bigger scrubbing tier cleans more');
  assert.ok(big > none, 'the 10T center recovers the flood');
  // On-demand does nothing until it engages (SCRUB_DELAY days in).
  const notYet = ev("S.scrubMode='ondemand';S.ev.ddos.start=S.day;compute();R.served");
  const engaged = ev("S.ev.ddos.start=S.day-SCRUB_DELAY;compute();R.served");
  assert.ok(engaged > notYet, 'on-demand scrubbing kicks in only after the delay');
});

test('clean-pipe on the entry transit, a sacrificial PNI, and an IX blackhole each blunt a flood', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  const tid = ev("S.transit[0].id");
  ev(`S.ev.ddos={city:'fra',vec:'dns',gbps:400,until:S.day+3,entry:{k:'t',id:'${tid}'},bh:false,start:S.day};compute()`);
  const raw = ev('R.served');
  // Clean-pipe on the transit the attack enters: the provider scrubs it upstream.
  const clean = ev(`S.transit[0].clean=true;compute();const s=R.served;S.transit[0].clean=false;s`);
  assert.ok(clean > raw, 'clean-pipe on the entry transit recovers traffic');
  // A sacrificial CN PNI contains a flood entering over it (capped at the small port).
  ev("S.pni.push({id:'pn1',city:'fra',net:'ctc',tier:1,n:1,site:'a',sacrif:true});S.ev.ddos.entry={k:'p',id:'pn1'}");
  const contained = ev("compute();R.served");
  const uncontained = ev("S.pni[0].sacrif=false;compute();const s=R.served;S.pni[0].sacrif=true;s");
  assert.ok(contained > uncontained, 'a sacrificial PNI contains the flood');
  // IX blackhole: ~half the junk gone, victim stays up. Shrink the flood so the drop shows in served.
  ev("ACT.buyIx({city:'fra',tier:1,signed:true});S.ev.ddos.entry={k:'t',id:S.transit[0].id};S.ev.ddos.gbps=180");
  const before = ev("compute();R.served");
  ev("ACT.ixbh()");
  assert.equal(ev('S.ev.ddos.ixbh'), true, 'blackhole announced');
  assert.equal(ev('S.ev.ddos.bh'), false, 'the customer is not taken dark');
  assert.ok(ev("compute();R.served") > before, 'the IX blackhole drops some junk');
});

test('SLA: a protected customer that still goes down costs an SLA credit, once', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1});S.nextFail=1e9;S.nextEvent=1e9");
  // A DDoS protection customer, an overwhelming flood, a 100G center that can't cope.
  ev("S.scrubs=[{city:'fra',tier:0}];S.biz.push({id:'b1',city:'fra',type:'scrub',bw:5,rate:900,mood:80,since:0,reqs:[]});S.ev.ddos={city:'fra',vec:'dns',gbps:6000,until:S.day+5,entry:{k:'t',lab:'x'},bh:false,start:S.day}");
  ev("dayTick()");
  assert.equal(ev('S.stats.sla'), 1, 'one SLA breach recorded');
  assert.ok(ev('S.biz[0].mood') < 70, 'the SLA breach dented their mood');
  // The same attack does not bill twice.
  ev("dayTick()");
  assert.equal(ev('S.stats.sla'), 1, 'the same attack is only billed once');
});

test('DDoS goal and badges unlock from the right state', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e8");
  const okg = id => ev(`GOALS.find(g=>g.id==='${id}').ok()`);
  const okb = id => ev(`BADGES.find(b=>b.id==='${id}').ok()`);
  assert.equal(okg('scrub'), false, 'the DDoS goal starts incomplete');
  ev("S.scrubs=[{city:'fra',tier:0}]");
  assert.equal(okg('scrub'), true, 'a scrubbing center completes the goal');
  assert.equal(okb('toaster'), false);
  ev("S.stats.ddosHeld=1"); assert.equal(okb('toaster'), true, 'weathering a DDoS earns Toaster Wrangler');
  ev("S.stats.ddosMonster=1"); assert.equal(okb('flood'), true, 'a multi-terabit hold earns Held the Flood');
  ev("S.transit.push({id:'t1',city:'fra',net:'cog',tier:1,n:1,site:'a',clean:true})");
  assert.equal(okb('cleanpipe'), true, 'a clean-pipe earns Clean Pipes');
  ev("S.pni.push({id:'p1',city:'fra',net:'ctc',tier:1,n:1,site:'a',sacrif:true})");
  assert.equal(okb('lamb'), true, 'a sacrificial PNI earns Sacrificial Lamb');
  // The hack-back win badge comes from the real action path.
  ev("S.ev.ddos={city:'fra',vec:'dns',gbps:50,until:S.day+3,entry:{k:'edge',lab:''},bh:false,start:S.day};const _r=Math.random;Math.random=()=>0.1;ACT.hackback();Math.random=_r");
  assert.equal(ev('S.stats.hackWin'), 1, 'a winning hack-back is recorded');
  assert.equal(okb('skynot'), true, 'and earns Skynot Smiles');
  assert.ok(ev("new Set(BADGES.map(b=>b.id)).size===BADGES.length"), 'badge ids stay unique');
  // The petabit badge needs a full 1 Pbps of served traffic.
  assert.equal(ev("R.served=999999;BADGES.find(b=>b.id==='petabit').ok()"), false, 'just under a petabit is not enough');
  assert.equal(ev("R.served=1e6;BADGES.find(b=>b.id==='petabit').ok()"), true, 'a petabit per second earns it');
});

test('#52 loan offers stop once you have half a billion in the bank, and come back if you lose it', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.day=100;S.cash=6e8;S.loanOffers=[{id:'x',bank:Object.keys(BANKS)[0],amount:1e5,exp:200}]");
  for (let i = 0; i < 60; i++) ev('S.day++;loanTick(S.day)');
  assert.equal(ev('S.loanOffers.length'), 0, 'no offers while rich');
  assert.match(ev("document.getElementById('toasts').textContent"), /stopped calling/);
  ev('S.cash=-5e4');
  let seen = 0;
  for (let i = 0; i < 40; i++) seen += ev('S.day++;loanTick(S.day);S.loanOffers.length') > 0 ? 1 : 0;
  assert.ok(seen > 0, 'broke again: the banks are back');
  assert.deepEqual(errors, []);
});

test('loans: good terms need good credit, big loans want revenue, and the weird lenders do weird things', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e6;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});for(let i=0;i<10;i++)dayTick()");
  // the premium: a weak rating pays more for the same bank
  assert.ok(ev('RATE_PREM.C') > ev('RATE_PREM.BBB') && ev('RATE_PREM.BBB') > ev('RATE_PREM.AAA'));
  assert.equal(ev("BANKS.gs.min"), 'AA', 'the best bank only lends to the best');
  // a big loan comes with a revenue share on top
  ev("S.loanOffers=[];const k0=Math.random;let n=0;for(let i=0;i<200&&!S.loanOffers.some(o=>o.share&&!BANKS[o.bank].equity);i++){S.loanOffers=[];spawnLoanOffer(false);}");
  const big = JSON.parse(ev('JSON.stringify(S.loanOffers.find(o=>o.share&&!BANKS[o.bank].equity)||null)'));
  if (big) assert.ok(big.amount > 5 * Math.max(60000, ev('R.revMo')) && big.share >= 0.02 && big.share <= 0.08);
  ev("S.loans=[];S.loanOffers=[{id:'b1',bank:'db',amount:2e6,exp:S.day+20,covs:['fax'],apr:0.1,term:12,pay:Math.round(annuity(2e6,0.1,12)),share:0.05}];ACT.takeLoan({id:'b1'})");
  assert.ok(Math.abs(ev('R.cost.revshare') - ev('R.revMo') * 0.05) < 1, 'pays a share of revenue while the loan runs');
  // balloon: nothing monthly, everything at the end
  ev("S.loans=[];S.loanOffers=[{id:'bl',bank:'balloon',amount:100000,exp:S.day+20,covs:[],apr:0.12,term:3,pay:0,model:'balloon'}];ACT.takeLoan({id:'bl'})");
  assert.equal(ev('R.cost.loans'), 0, 'no monthly payment');
  const cash0 = ev('S.cash');
  for (let d = 0; d < 95; d++) ev('dayTick()');
  assert.equal(ev("S.loans.some(l=>l.id==='bl')"), false, 'the balloon is gone');
  assert.ok(ev('S.stats.loans') >= 1);
  // transit-paid loan: 30% of the transit bill
  ev("S.loans=[];S.loanOffers=[{id:'tp',bank:'ppp',amount:100000,exp:S.day+20,covs:[],term:24,model:'transit',cut:0.3,owe:130000,apr:0,pay:0}];ACT.takeLoan({id:'tp'})");
  assert.ok(Math.abs(ev('R.cost.loans') - Math.round(ev('R.cost.transit') * 0.3)) <= 1, 'pays with the transit bill');
  // fees and pizza
  ev("S.loans=[{id:'f1',bank:'jpm',start:S.day,amount:1,bal:1,apr:0,pay:0,left:12,term:12,share:0,covs:['nephew','pizza'],base:{sub:0}}];compute()");
  assert.equal(ev('R.cost.loans'), 3000, 'the nephew costs money every month');
  const c1 = ev('S.cash');
  ev("addInc({type:'cut',ref:'x',until:S.day+1,msg:'test',cost:0})");
  assert.equal(c1 - ev('S.cash'), 400, 'pizza after every incident');
  assert.match(ev("covLabel('yacht')"), /\$8\.0k\/mo/);
  assert.equal(ev("COVS.oddpops.ok()"), true);
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev("COVS.oddpops.ok()"), false, 'two POPs break the numerologist');
  // the bank screen renders every model
  ev("S.loanOffers=[{id:'o1',bank:'balloon',amount:1e5,exp:S.day+20,covs:['oddpops'],apr:0.1,term:12,pay:0,model:'balloon'},{id:'o2',bank:'ppp',amount:1e5,exp:S.day+20,covs:['nocache'],term:24,model:'transit',cut:0.3,owe:130000},{id:'o3',bank:'astro',amount:1e5,exp:S.day+20,covs:['friday'],apr:0.2,term:12,pay:5000,model:'astro'}];ACT.bank({})");
  const t = ev("document.getElementById('bankCard').textContent");
  assert.match(t, /Nothing to pay until the end/);
  assert.match(t, /of your transit bill/);
  assert.match(t, /rate set by the stars/);
  assert.match(t, /numerologist/);
  assert.deepEqual(errors, []);
});

test('#117 several scrubbing centers: nearest first, spill to the next, and far ones haul the flood over the backbone', () => {
  const { ev, errors, dom } = load();
  // an old save with one center carries it over
  ev("ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=1e9;S.nextEvent=1e9");
  ev("const o=JSON.parse(JSON.stringify(S));o.scrubAt='fra';o.scrubTier=1;delete o.scrubs;migrate(o);window.__o=o");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(window.__o.scrubs)")), [{ city: 'fra', tier: 1 }]);
  assert.equal(ev("'scrubAt' in window.__o||'scrubTier' in window.__o"), false);
  // New York and London over one transatlantic wave
  ev("for(const c of ['nyc','lon']){ACT.buildPop({city:c});}for(const c of ['fra','nyc','lon'])S.pops[c].rgen=3;ACT.launchBB({city:'nyc'});S.pops.nyc.bb.d=150");
  ev("ACT.buyTransit({city:'nyc',net:'cog',tier:2});ACT.buyTransit({city:'lon',net:'cog',tier:3});UI.via='grace';UI.route='same';openLinkModal('nyc','lon');ACT.buildLink({tier:3});closeModal()");
  const tl = "S.links.find(l=>[l.a,l.b].includes('nyc')).id";
  const atk = g => ev(`S.ev.ddos={city:'nyc',vec:'http',gbps:${g},until:S.day+3,entry:{k:'t',lab:'x'},bh:false,start:S.day-5};compute()`);
  // build in two cities, one each; the bill adds up
  ev("ACT.buildScrub({city:'fra',tier:1});ACT.buildScrub({city:'lon',tier:1});ACT.buildScrub({city:'lon',tier:2})");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.scrubs.map(x=>x.city+':'+x.tier))")), ['fra:1', 'lon:1'], 'one center per city');
  assert.equal(ev('scrubMo()'), 2 * ev('SCRUB_TIERS[1].mo'));
  // Frankfurt has no backbone path from New York, so the flood goes to London, across the Atlantic
  atk(0); const quiet = ev(`R.load[${tl}]||0`);
  atk(600);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(R.haul.map(q=>q.to))")), ['lon']);
  assert.ok(ev('R.haul[0].h') > 590, 'all of it fits on the 800G wave');
  assert.ok(ev('R.haul[0].ms') > 30 && ev('R.haul[0].ms') < 120, `a transatlantic detour (${ev('R.haul[0].ms').toFixed(0)} ms)`);
  assert.ok(ev(`R.load[${tl}]`) > quiet + 500, 'the flood fills the transatlantic link');
  assert.match(ev('ddosPanel()'), /hauled over your backbone/);
  // a protected customer in New York minds the detour
  ev("S.biz.push({id:'bs',city:'nyc',type:'scrub',bw:5,rate:900,mood:80,since:0,reqs:['scrubnear']})");
  assert.match(ev("bizWhy(S.biz.find(b=>b.id==='bs')).join(' ')"), /hauled to London/);
  assert.equal(ev("REQS.scrubnear.ok(S.biz.find(b=>b.id==='bs'))"), false, 'no center in the Americas yet');
  // a center in New York cleans it on the spot: nothing crosses the ocean
  ev("ACT.buildScrub({city:'nyc',tier:0})");atk(600);
  assert.equal(ev("R.haul.filter(q=>q.to==='lon').length"), 1, '100G local, the rest spills to London');
  assert.equal(ev("R.haul.some(q=>q.to==='nyc')"), false);
  assert.ok(ev("REQS.scrubnear.ok(S.biz.find(b=>b.id==='bs'))"));
  ev("S.scrubs.find(x=>x.city==='nyc').tier=1");atk(600);
  assert.equal(ev('R.haul.length'), 0, 'a 1T center at home takes it all');
  assert.ok(ev(`R.load[${tl}]||0`) < quiet + 50);
  // over a thin link only part of it can be hauled; the rest is not scrubbed
  ev("ACT.rmScrub({city:'nyc'});ACT.rmScrub({city:'nyc'})");
  assert.equal(ev("S.scrubs.some(x=>x.city==='nyc')"), false, 'shut down after confirming');
  ev(`S.links.find(l=>l.id===${tl}).tier=1`);atk(600);
  assert.ok(ev('R.haul[0].h') < 120 && ev('R.haul[0].h') > 0, `the 100G wave caps the haul (${ev('R.haul[0].h').toFixed(0)})`);
  assert.match(ev('ddosPanel()'), /can only haul/);
  // the Infra tab says where attacks go from here
  ev("ACT.selCity&&ACT.selCity({id:'nyc'});UI.sel={type:'city',id:'nyc'};UI.tab='infra';renderPanel()");
  assert.match(dom.window.document.getElementById('panelBody').textContent, /nearest scrubbing center\. From here that is London/);
  // closing a POP closes its center
  ev("ACT.decomOpen({});ACT.decomToggle({city:'lon'});ACT.decomGo()");
  assert.equal(ev("S.scrubs.some(x=>x.city==='lon')"), false);
  assert.deepEqual(errors, []);
});

test('notifications: the NOC keeps the last ten minutes, folds repeats and opens what each is about', () => {
  const { ev, errors, dom } = load();
  const doc = dom.window.document;
  ev("let __t=1e12;Date.now=()=>__t;window.__tick=ms=>{__t+=ms};");
  ev("ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;for(const c of ['ams','lon'])ACT.buildPop({city:c});UI.via=null;openLinkModal('ams','lon');ACT.buildLink({tier:1});closeModal();S.log=[];UI.logSeen=0");
  const linkId = ev("S.links.find(l=>[l.a,l.b].includes('ams')&&[l.a,l.b].includes('lon')).id");
  // what each notice is about: its own button, a link between two of your cities, one of your cities, or nothing
  ev("toast('<b>Customer upset</b><br>Fix it.','bad',[{l:'Show me',act:'focusCity',args:{city:'fra'}}])");
  ev("toast('<b>Fiber cut</b><br>Your Amsterdam–London link is down.','bad')");
  ev("toast('<b>Router crashed</b><br>Your router in London is rebooting.','bad')");
  ev("toast('<b>Raffle</b><br>You won a T-shirt.','good')");
  const os = JSON.parse(ev("JSON.stringify(S.log.map(e=>e.o))"));
  assert.deepEqual(os, [null, { a: 'city', v: 'lon' }, { a: 'link', v: linkId }, { a: 'city', v: 'fra' }]);
  assert.equal(ev("S.log[0].h"), 'Raffle'); assert.equal(ev("S.log[0].t"), 'Raffle You won a T-shirt.');
  // an incident points at what broke
  assert.deepEqual(JSON.parse(ev(`JSON.stringify(incOpen({ref:'${linkId}'}))`)), { a: 'link', v: linkId });
  assert.deepEqual(JSON.parse(ev("JSON.stringify(incOpen({ref:S.links[0].trench||S.links[0].id}))")), { a: 'link', v: ev('S.links[0].id') });
  // repeats within a minute fold into one line with a count; numbers in the title do not split them
  ev("for(let i=1;i<=5;i++)toast('<b>'+i+' new sessions at HAMS-IX.</b><br>Small networks.','')");
  assert.equal(ev("S.log.length"), 5); assert.equal(ev("S.log[0].n"), 5); assert.equal(ev("S.log[0].h"), '5 new sessions at HAMS-IX.');
  ev("__tick(61000);toast('<b>1 new session at HAMS-IX.</b><br>Small networks.','')");
  assert.equal(ev("S.log.length"), 6, 'a minute later it starts a new line');
  // the NOC shows them right after the incidents, with Open where there is something to open
  assert.equal(ev("logUnread()"), 6);
  ev("renderHUD()"); assert.equal(doc.getElementById('hNocNew').hidden, true, 'no unread count on the NOC button (2.0)');
  ev("UI.left='noc';UI.leftOpen=true;UI.sel=null;renderLeft();renderHUD()");
  const body = doc.getElementById('leftBody').textContent;
  assert.match(body, /Notifications\s*last 10 minutes/);
  assert.ok(body.indexOf('Notifications') < body.indexOf('DDoS scrubbing'), 'near the top, not at the bottom');
  assert.match(body, /×5/); assert.match(body, /just now/);
  assert.equal(doc.querySelectorAll('#leftBody [data-act=logOpen]').length, 2, 'Open only where it leads somewhere (2 of the 5 shown)');
  assert.equal(ev("logUnread()"), 0);
  ev("ACT.logAll()"); assert.equal(doc.querySelectorAll('#leftBody .note').length, 6); assert.equal(doc.querySelectorAll('#leftBody [data-act=logOpen]').length, 3);
  // Open goes there
  ev("ACT.logOpen({id:S.log.find(e=>e.o&&e.o.a==='link').id})"); assert.equal(ev("UI.sel.type+':'+UI.sel.id"), 'link:' + linkId);
  ev("ACT.logOpen({id:S.log.find(e=>e.o&&e.o.a==='city'&&e.o.v==='lon').id})"); assert.equal(ev("UI.sel.type+':'+UI.sel.id"), 'city:lon');
  ev(`S.links=S.links.filter(l=>l.id!=='${linkId}');ACT.logOpen({id:S.log.find(e=>e.o&&e.o.a==='link').id})`);
  assert.equal(ev("S.log[0].h"), 'That link is gone.', 'a removed link says so instead of failing silently');
  // ten minutes later it is gone from the list, but stays in the save's log
  ev("__tick(10*60*1000+1000);UI.left='noc';renderLeft()");
  assert.match(doc.getElementById('leftBody').textContent, /Nothing in the last 10 minutes/);
  assert.ok(ev("S.log.length") > 0);
  // saves: junk is dropped, old entries without a time stay but are not shown
  ev("S.log.push({t:'old',k:'weird',o:{a:'city',v:'atlantis'},n:'many'},{t:5},{t:'x',o:{a:'tab',v:'evil'}},{t:'y',o:{a:'link',v:'l1'},at:'soon'});S=sanitize(S)");
  const tail = JSON.parse(ev("JSON.stringify(S.log.slice(-3))"));
  assert.deepEqual(tail.map(e => [e.t, e.k, e.o, e.n, e.at]), [['old', '', null, 1, 0], ['x', '', null, 1, 0], ['y', '', { a: 'link', v: 'l1' }, 1, 0]]);
  // phones: the NOC tab shows no numbers, only a red dot while something is broken
  ev("__tick(1000);toast('<b>Router crashed</b><br>Your router in London is rebooting.','bad');UI.left='goals';UI.leftOpen=false");
  dom.window.innerWidth = 360; ev("renderAll&&renderAll()");
  const nocTab = [...doc.querySelectorAll('#tabbar [data-act=phoneTab]')].find(b => JSON.parse(b.dataset.args).t === 'noc');
  assert.equal(nocTab.querySelector('.cnt'), null, 'no number for unread notifications on the NOC tab');
  ev("S.inc.push({id:'x1',type:'crash',city:'lon',msg:'',until:S.day+3});renderAll()");
  const nocTab2 = [...doc.querySelectorAll('#tabbar [data-act=phoneTab]')].find(b => JSON.parse(b.dataset.args).t === 'noc');
  assert.ok(nocTab2.querySelector('.cnt.dot.red'), 'a live incident shows a red dot');
  assert.equal(nocTab2.querySelector('.cnt').textContent, '', 'and no number');
  assert.deepEqual(errors, []);
});

test('the broadband panel shows what homes in that city really pay, not the base rate', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'del'})");
  assert.equal(ev('CITY.del.arpu'), 0.4);
  assert.match(ev("cityPanel('del')"), new RegExp('Pays \\' + ev('fmt$(EYE_RATE*CITY.del.arpu)') + ' per Gbps'), 'Delhi homes pay 40% of the base rate');
  assert.match(ev("cityPanel('fra')"), new RegExp('Pays \\' + ev('fmt$(EYE_RATE)') + ' per Gbps'), 'a city without its own rate pays the base rate');
  ev("const t=NETS.find(n=>n.price&&n.pops.includes('del'));ACT.buyTransit({city:'del',net:t.id,tier:1});ACT.launchBB({city:'del'});compute()");
  const rev = ev("fmt$(R.cityEye.del*sfOf(R,'del')*EYE_RATE*CITY.del.arpu)");
  assert.ok(ev("R.cityEye.del*sfOf(R,'del')") > 0);
  assert.ok(ev("cityPanel('del')").includes(rev + '/mo'), `revenue line matches what the month pays (${rev})`);
  assert.deepEqual(errors, []);
});

// Custom routing metrics: a fra–ams–par triangle where the direct fra–par link is normally shortest.
const triangle = (ev) => {
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','par'])ACT.buildPop({city:c});const L=(a,b)=>{UI.via=null;openLinkModal(a,b);ACT.buildLink({tier:1});closeModal();};L('fra','ams');L('ams','par');L('fra','par');compute()");
  ev("window.FP=S.links.find(l=>(l.a==='fra'&&l.b==='par')||(l.a==='par'&&l.b==='fra')).id;window.FK=edgeKey(S.links.find(l=>l.id===FP));window.pmOf=()=>S.pairMet[FK];window.hops=()=>JSON.stringify(trPaths('fra').path('par').map(h=>h.l.id))");
};

test('a custom multiplier routes exactly like the matching preset', () => {
  const { ev, errors } = load();
  triangle(ev);
  assert.equal(ev("hops()"), JSON.stringify([ev("FP")]), 'direct link wins by default');
  ev("ACT.setMetric({id:FP,v:'avoid'})");
  const avoid = ev("JSON.stringify({h:hops(),load:R.load,served:R.served})");
  ev("ACT.setMetric({id:FP,v:'custom'})");
  assert.equal(ev("pairMet(FK)"), 'custom');
  const m = ev("pmOf()");
  assert.equal(m.k, 'f');
  assert.equal(m.v, 4, 'custom starts from the preset it replaces');
  assert.equal(ev("JSON.stringify({h:hops(),load:R.load,served:R.served})"), avoid);
  ev("ACT.setMetric({id:FP,v:'normal'})");
  assert.equal(ev("FK in S.pairMet"), false, 'presets drop the custom metric');
  assert.deepEqual(errors, []);
});

test('an absolute custom cost steers the path, and switching modes keeps the cost', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.metricMode({id:FP,k:'w'})");
  const l = ev("S.links.find(l=>l.id===FP)");
  assert.equal(ev("pmOf().k"), 'w');
  assert.equal(ev("pmOf().v"), Math.round(l.km + 60), 'switching to cost keeps the effective metric');
  ev("ACT.selLink({id:FP});renderAll();$('metIn').value='65535';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 65535);
  assert.ok(!JSON.parse(ev("hops()")).includes(ev("FP")), 'a huge cost sends traffic round via Amsterdam');
  ev("renderAll();$('metIn').value='1';ACT.metricSet({id:FP})");
  assert.equal(ev("hops()"), JSON.stringify([ev("FP")]));
  ev("ACT.metricMode({id:FP,k:'f'})");
  assert.equal(ev("pmOf().v"), 0.1, 'converted back to a multiplier, clamped to the minimum');
  assert.deepEqual(errors, []);
});

test('custom metric input is validated and clamped', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.selLink({id:FP});renderAll()");
  ev("$('metIn').value='';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 1, 'empty input changes nothing');
  ev("renderAll();$('metIn').value='9999';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 100);
  ev("renderAll();$('metIn').value='0';ACT.metricSet({id:FP})");
  assert.equal(ev("pmOf().v"), 0.1);
  ev("ACT.metricMode({id:FP,k:'x'});ACT.setMetric({id:FP,v:'bogus'})");
  assert.equal(ev("pairMet(FK)"), 'custom');
  assert.deepEqual(errors, []);
});

test('custom metrics survive a save, and broken ones are repaired', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.metricMode({id:FP,k:'w'});pmOf().v=777;S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(pmOf())")), { k: 'w', v: 777 });
  ev("S.pairMet[FK]={k:'zz',v:'lots'};S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(pmOf())")), { k: 'f', v: 1 });
  ev("S.pairMet[FK]={k:'w',v:1e9};S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("pmOf().v"), 65535);
  // An old save: a preset metric on the link itself, from before metrics moved to the city pair.
  ev("delete S.pairMet[FK];S.links.find(l=>l.id===FP).metric='avoid';S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(ev("pmOf()"), 'avoid');
  assert.equal(ev("'metric' in S.links.find(l=>l.id===FP)"), false);
  assert.equal(JSON.parse(ev("hops()")).length, 2, 'the old save still routes, avoiding the direct link');
  assert.deepEqual(errors, []);
});

test('preset buttons stay plain, and Custom explains the numbers, also on phones', () => {
  const { ev, dom, errors } = load();
  triangle(ev);
  for (const w of [1280, 390]) {
    ev(`window.innerWidth=${w};ACT.setMetric({id:FP,v:'normal'});ACT.selLink({id:FP});renderAll()`);
    const doc = dom.window.document;
    const btns = [...doc.querySelectorAll('#panel [data-act="setMetric"]')];
    assert.equal(btns.length, 5);
    const km = ev("S.links.find(l=>l.id===FP).km");
    assert.deepEqual(btns.map(b => b.textContent), ['Prefer', 'Normal', 'Avoid', 'Backup only', 'Custom']);
    assert.equal(doc.getElementById('metIn'), null);
    assert.doesNotMatch(doc.getElementById('panel').textContent, /times a multiplier/);
    ev("ACT.setMetric({id:FP,v:'custom'})");
    assert.ok(doc.getElementById('metIn'), `custom editor at ${w}px`);
    assert.ok(doc.querySelector('#panel [data-act="metricMode"]'));
    const txt = doc.getElementById('panel').textContent;
    assert.match(txt, /times a multiplier/);
    assert.match(txt, new RegExp(`Normal ×1 = ${Math.round(km + 60)}, Avoid ×4 = ${Math.round((km + 60) * 4)}`));
    assert.match(txt, /Multiplier: scales the distance cost/);
    assert.match(txt, /Cost on this link/);
    ev("ACT.metricMode({id:FP,k:'w'})");
    assert.match(doc.getElementById('panel').textContent, /Cost: the exact number/);
  }
  assert.deepEqual(errors, []);
});

test('a custom metric belongs to the city pair, like the presets, and a standby link keeps it', () => {
  const { ev, errors } = load();
  triangle(ev);
  ev("UI.via=null;openLinkModal('fra','par');ACT.buildLink({tier:1});closeModal();compute()");
  ev("ACT.setMetric({id:FP,v:'custom'});ACT.metricMode({id:FP,k:'w'});ACT.selLink({id:FP});renderAll();$('metIn').value='65535';ACT.metricSet({id:FP})");
  const other = ev("S.links.find(l=>l.id!==FP&&edgeKey(l)===FK).id");
  assert.equal(ev(`pairMet(edgeKey(S.links.find(l=>l.id==='${other}')))`), 'custom', 'the second link between the cities shares it');
  ev(`ACT.setStandby({id:'${other}',on:1})`);
  assert.ok(!JSON.parse(ev("hops()")).includes(ev("FP")), 'the pair is still avoided');
  assert.equal(ev("pmOf().v"), 65535);
  // Removing every link of the pair drops the metric with it.
  ev("S.links=S.links.filter(l=>edgeKey(l)!==FK);prunePairMet()");
  assert.equal(ev("FK in S.pairMet"), false);
  assert.deepEqual(errors, []);
});


test('Memcached amplification and ACK flood are available without gaming customers and respect Flowspec', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1});RG[0].fs=2");
  assert.equal(ev('S.biz.length'), 0);
  assert.equal(ev('DDOS_VEC.memcached.fs'), true);
  assert.equal(ev('DDOS_VEC.ack.fs'), false);
  ev("S.ev.ddos={city:'fra',vec:'ack',gbps:300,until:S.day+3,start:S.day};compute()");
  const ack = ev('R.served');
  assert.match(ev('ddosPanel()'), /ACK flood/);
  assert.doesNotMatch(ev('ddosPanel()'), /application layer/);
  ev("S.ev.ddos.vec='memcached';compute()");
  assert.ok(ev('R.served') > ack, 'Flowspec filters Memcached but cannot filter ACK');
  for (const vec of ['memcached', 'ack']) {
    ev(`const old=Math.random;Math.random=()=>(${['dns','ntp','memcached','ack'].indexOf(vec)}+0.1)/ddosVectors().length;ddosAttack();Math.random=old`);
    assert.equal(ev('ddosAll().at(-1).vec'), vec, 'the generator can select each new vector');
  }
  assert.deepEqual(errors, []);
});


test('DDoS accounting conserves attack bandwidth through upstream, edge and local scrubbing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});S.pops.fra.bb.d=100;S.scrubs=[{city:'fra',tier:1}];S.transit[0].clean=true;S.ev.ddos={city:'fra',vec:'http',gbps:1842,until:5,start:0,entry:{k:'t',id:S.transit[0].id}};compute()");
  assert.ok(Math.abs(ev('R.ddos[0].reaching') - 184.2) < 1e-9);
  assert.equal(ev('R.ddos[0].sp.parts[0].cleaned'), ev('R.ddos[0].reaching'));
  assert.equal(ev('R.ddos[0].leak'), 0, 'the 1T center cleans the upstream remainder');
  assert.doesNotMatch(ev('ddosPanel()'), /842 Gbps of attack traffic leaks/);
  ev('S.transit[0].clean=false;compute()');
  assert.equal(ev('R.ddos[0].reaching'), 1842);
  assert.equal(ev('R.ddos[0].leak'), 842);
  for (const setup of ["S.transit[0].clean=true", "RG[0].fs=2;S.ev.ddos.vec='dns'", "S.scrubs=[]"]) {
    ev(setup+';compute()');
    assert.ok(ev('Math.abs(R.ddos[0].reaching-R.ddos[0].filtered-(R.ddos[0].sp?.parts.reduce((n,x)=>n+x.cleaned,0)||0)-R.ddos[0].leak)<1e-9'));
    assert.ok(ev('R.ddos[0].leak<=R.ddos[0].reaching'));
  }
  // On-demand diversion must also work for an attack which began on day zero.
  ev("S.scrubs=[{city:'fra',tier:1}];S.scrubMode='ondemand';S.day=2;compute()");
  assert.equal(ev('R.ddos[0].leak'), 0);
  assert.deepEqual(errors, []);
});


test('the NOC integrates DDoS mitigation totals into each live attack card without duplicate summaries on phones', () => {
  const { ev, errors, dom } = load();
  ev('ACT.start({})');
  Object.defineProperty(dom.window, 'innerWidth', { value: 360, configurable: true });
  ev("S.cash=1e9;ACT.buyTransit({city:'fra',net:'cog',tier:1});S.transit[0].clean=true;S.scrubs=[{city:'fra',tier:1}];S.ev.ddos={city:'fra',vec:'http',gbps:3840,until:5,start:0,entry:{k:'t',id:S.transit[0].id}};compute();UI.left='noc';UI.leftOpen=true;renderLeft()");
  const card = () => dom.window.document.querySelector('[data-act="rtbh"], [data-act="unrtbh"]').closest('.inc');
  const text = () => card().textContent;
  assert.match(card().querySelector('.nm').textContent, /🚨 Live attack: Frankfurt/);
  assert.equal(dom.window.document.querySelector('.ddos-stats'), null, 'use the existing attack card');
  assert.doesNotMatch(text(), /DDoS mitigation status|Attack size:|3840 Gbps|This attack:/);
  assert.equal(text().match(/3\.84 Tbps/g).length, 1, 'the attack size appears once');
  assert.match(text(), /✓ After upstream scrubbing: 384 Gbps/);
  assert.equal(text().match(/After upstream scrubbing/g).length, 1, 'show the upstream remainder once');
  assert.doesNotMatch(text(), /Reaching your network|reaching your network|Upstream scrubbing active/);
  assert.match(text(), /✓ Scrubbing in Frankfurt: 384 Gbps \/ 1T/);
  assert.match(text(), /✓ Attack fully mitigated/);
  ev('S.transit[0].clean=false;compute();renderLeft()');
  assert.doesNotMatch(text(), /After upstream scrubbing|Reaching your network/);
  assert.equal(text().match(/3\.84 Tbps/g).length, 1, 'inactive upstream scrubbing does not repeat the attack size');
  assert.match(text(), /✓ Scrubbing in Frankfurt: 1\.00 Tbps \/ 1T/);
  assert.match(text(), /~ 2\.84 Tbps is leaking through/);
  assert.equal(text().match(/leaking through/g).length, 1, 'show the mitigation outcome once');
  assert.doesNotMatch(text(), /Upstream scrubbing|Attack fully mitigated|leaks past mitigation/);
  ev("S.transit[0].clean=true;S.pops.fra.rgen=3;S.ev.ddos.vec='dns';compute();renderLeft()");
  assert.match(text(), /✓ Flowspec dropping: 326 Gbps/);
  assert.doesNotMatch(text(), /Edge filters dropping/);
  assert.match(text(), /✓ Scrubbing in Frankfurt: 57\.6 Gbps \/ 1T/);
  assert.match(text(), /✓ Attack fully mitigated/);
  ev('ACT.rtbh();renderLeft()');
  assert.match(text(), /~ Blackholed: the junk is gone, and so is Frankfurt/);
  assert.equal(text().match(/Blackholed:/g).length, 1);
  assert.doesNotMatch(text(), /After upstream scrubbing|reaching your network|scrubbing in Frankfurt|Attack fully mitigated|leaking through/i);
  assert.ok(card().querySelector('[data-act="unrtbh"]'), 'the existing controls stay in the card');
  assert.deepEqual(errors, []);
});

test('overlapping floods share scrubbing capacity, have separate controls, and finish independently', () => {
  const { ev, errors, dom } = load();
  ev("ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;ACT.buyTransit({city:'fra',net:'cog',tier:1});S.scrubs=[{city:'fra',tier:1}];S.ev.ddos={id:'one',city:'fra',vec:'http',gbps:700,start:0,until:3};S.ev.ddosMore=[{id:'two',city:'fra',vec:'http',gbps:700,start:0,until:5}];compute();UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.equal(ev('R.ddos.length'), 2);
  assert.equal(ev('R.ddos.reduce((n,m)=>n+(m.sp?.parts.reduce((v,x)=>v+x.cleaned,0)||0),0)'), 1000);
  assert.equal(ev('R.ddos.reduce((n,m)=>n+m.leak,0)'), 400, 'one center cannot spend its capacity twice');
  const cards = [...dom.window.document.querySelectorAll('[data-act="rtbh"]')].map(b=>b.closest('.inc'));
  assert.equal(cards.length, 2);
  assert.match(cards[1].textContent, /✓ Scrubbing in Frankfurt: 1\.00 Tbps \/ 1T · This attack: 300 Gbps/);
  ev("ACT.rtbh({id:'two'})");
  assert.equal(ev("S.ev.ddos.bh||false"), false, 'the selected attack gets the control');
  assert.equal(ev('S.ev.ddosMore[0].bh'), true);
  assert.ok(ev('R.ddos.every(m=>m.leak===0)'), 'blackholing a target city drops every flood to it');
  ev("ACT.unrtbh({id:'one'});const old=Math.random;Math.random=()=>0.1;ACT.hackback({id:'two'});Math.random=old");
  assert.equal(ev('ddosAll().length'), 1, 'hack-back ends only the selected attack');
  ev('S.day=3;ddosExpire();compute()');
  assert.equal(ev('ddosAll().length'), 0);
  assert.equal(ev('(S.stats.ddosOk||0)+(S.stats.ddosLost||0)'), 2, 'both attacks scored once');
  ev('ddosExpire()');
  assert.equal(ev('(S.stats.ddosOk||0)+(S.stats.ddosLost||0)'), 2);
  assert.deepEqual(errors, []);
});

test('overlapping DDoS saves round trip and legacy attacks migrate safely', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.ev.ddos={city:'fra',vec:'dns',gbps:'80',until:7,start:0};delete S.ev.ddosMore;delete S.ddosStarts;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('ddosAll().length'), 1);
  assert.equal(ev('S.ev.ddos.gbps'), 80);
  assert.equal(ev('S.ev.ddosMore.length'), 0);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ddosStarts)')), [0]);
  ev("S.ev.ddosMore=[{id:'overlap',city:'fra',vec:'ack',gbps:50,until:5,start:0,sla:['customer']},null,{city:'bad',vec:'dns'}, {city:'fra',vec:'unknown'}];S.ddosStarts=[0,'bad',Infinity,-9,99];S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('ddosAll().length'), 2);
  assert.equal(ev('S.ev.ddosMore[0].id'), 'overlap');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ddosStarts)')), [0]);
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev('R.ddos.length'), 2);
  assert.deepEqual(errors, []);
});

test('simultaneous attacks each bill their protected customer only once', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1});S.biz=[{id:'protected',name:'Shield',city:'fra',type:'scrub',bw:5,rate:900,mood:100,since:0,reqs:[]}];S.ev.ddos={id:'one',city:'fra',vec:'http',gbps:6000,start:0,until:7};S.ev.ddosMore=[{id:'two',city:'fra',vec:'http',gbps:6000,start:0,until:7}];compute();dayTick()");
  assert.equal(ev('S.stats.sla'), 2, 'same-day attacks have separate SLA identities');
  ev('S=migrate(JSON.parse(JSON.stringify(S)));dayTick()');
  assert.equal(ev('S.stats.sla'), 2, 'reloading does not pay the same credits twice');
  assert.deepEqual(errors, []);
});

test('DDoS frequency rises with level and signed gaming customers, with a rolling weekly ceiling', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.day=50;S.lvl=1;S.biz=[]");
  const base = ev('ddosRate()');
  assert.equal(base, 0.5);
  ev('S.lvl=13');
  assert.equal(ev('ddosRate()'), base, 'level alone does not increase the non-gaming rate');
  ev("S.biz=[{type:'game',city:'fra'}];S.lvl=1");
  const early = ev('ddosRate()');
  ev('S.lvl=13');
  const level = ev('ddosRate()');
  ev("S.biz=Array.from({length:20},(_,i)=>({type:i%2?'cgame':'game',city:'fra'}))");
  const gaming = ev('ddosRate()');
  assert.ok(base < early && early < level && level < gaming && gaming <= 7);
  ev("S.offers=Array.from({length:50},()=>({type:'game'}));S.biz=[];S.lvl=1");
  assert.equal(ev('ddosRate()'), base, 'unsigned offers do not attract attacks');
  // Force every random spawn opportunity (gamers on board), then verify each rolling seven-day window.
  ev("S.biz=[{type:'game',city:'fra'}];");
  ev('window.__starts=[];window.__oldRandom=Math.random;Math.random=()=>0');
  for (let day = 50; day < 66; day++) {
    ev(`S.day=${day};ddosTick();window.__starts.push(...ddosAll().filter(a=>a.start===S.day).map(a=>a.start))`);
    assert.ok(ev('S.ddosStarts.length') <= 14);
  }
  ev('Math.random=window.__oldRandom');
  const starts = JSON.parse(ev('JSON.stringify(window.__starts)'));
  for (let day = 50; day < 66; day++) assert.ok(starts.filter(d=>d>day-7&&d<=day).length <= 14);
  assert.ok(starts.length > 14, 'the allowance renews as starts leave the rolling window');
  ev('for(let i=0;i<30;i++)ddosAttack()');
  assert.equal(ev('S.ddosStarts.length'), 14, 'manual and incident starts cannot bypass the cap');
  assert.deepEqual(errors, []);
});

test('DDoS sizes use a smaller non-gaming baseline and preserve unbounded Flood Season scaling', () => {
  const { ev, errors } = load();
  ev('ACT.start({});S.lvl=13;R.demand=150000;S.biz=[]');
  assert.equal(ev('ddosSizeMean()'), 20000);
  ev('R.demand=300000');
  assert.equal(ev('ddosSizeMean()'), 40000, 'larger networks can draw still larger attacks');
  ev('S.lvl=1');
  const early = ev('ddosSizeMax()');
  ev('S.lvl=13');
  const late = ev('ddosSizeMax()');
  ev("S.biz=[{type:'game',city:'fra'}]");
  assert.ok(early < late && late < ev('ddosSizeMax()'));
  // Fixed quantiles show longer durations as both level and gaming exposure rise.
  ev('window.__oldRandom=Math.random;Math.random=()=>0.95;S.lvl=1;S.biz=[];ddosAttack();window.__earlyDur=ddosAll().at(-1).until-S.day;S.lvl=13;S.biz=Array.from({length:40},()=>({type:\'game\',city:\'fra\',bw:0,rate:0}));ddosAttack();Math.random=window.__oldRandom');
  assert.ok(ev('ddosAll().at(-1).until-S.day') > ev('window.__earlyDur'));
  assert.equal(ev('ddosAll().at(-1).until-S.day'), 7);
  assert.deepEqual(errors, []);
});

test('scrubbing hauls retain their real source on each link when several cities use one center', () => {
  const { ev, errors, dom } = load();
  ev(`ACT.start({});S.cash=1e9;S.lvl=6;for(const c of ['prg','ber'])ACT.buildPop({city:c});
    for(const c in S.pops)S.pops[c].rgen=3;
    S.links=[{id:'fp1',a:'fra',b:'prg',kind:'wave',tier:2,km:409,mo:100},
      {id:'fp2',a:'fra',b:'prg',kind:'wave',tier:2,km:409,mo:100},
      {id:'fb',a:'fra',b:'ber',kind:'wave',tier:2,km:420,mo:100},
      {id:'pb',a:'prg',b:'ber',kind:'wave',tier:2,km:280,mo:100}];
    S.transit=[{id:'tp',city:'prg',net:'cog',tier:2},{id:'tb',city:'ber',net:'cog',tier:2}];
    S.scrubs=[{city:'fra',tier:1}];
    S.ev.ddos={id:'b',city:'ber',vec:'ack',gbps:50,start:0,until:7,entry:{k:'t',id:'tb'}};
    S.ev.ddosMore=[{id:'p',city:'prg',vec:'ack',gbps:50,start:0,until:7,entry:{k:'t',id:'tp'}}];compute()`);
  const sources = id => JSON.parse(ev(`JSON.stringify(Object.entries(R.ef[edgeKey(S.links.find(l=>l.id==='${id}'))].eg)
    .filter(([key])=>key.startsWith('scrub:')).map(([key,g])=>({city:R.egDesc[key].city,g})).sort((a,b)=>a.city.localeCompare(b.city)))`));
  assert.equal(ev('R.load.pb||0'), 0, 'Berlin does not feed the Prague link');
  assert.deepEqual(sources('fp1').map(x=>x.city), ['prg']);
  assert.deepEqual(sources('fb').map(x=>x.city), ['ber']);
  assert.ok(sources('fp1')[0].g>0 && sources('fb')[0].g>0);
  assert.ok(Math.abs(sources('fp1')[0].g-ev('R.load.fp1+R.load.fp2'))<1e-9, 'the grouped record covers both parallel links exactly');
  ev("selectLink('fp1');draw(0)");
  const row = [...dom.window.document.querySelectorAll('#panelBody .row')].find(x=>x.querySelector('.nm')?.textContent==='Attack hauled to scrubbing in Frankfurt');
  assert.ok(row);
  assert.match(row.querySelector('.meta').textContent, /^Prague · /);
  assert.equal(JSON.parse(row.querySelector('[data-act="goEgress"]').dataset.args).city, 'prg');
  assert.deepEqual(JSON.parse(ev('JSON.stringify([...UI.feed])')), ['prg'], 'the map highlights the same source as the inspected link');
  row.querySelector('[data-act="goEgress"]').click();
  assert.equal(ev('UI.sel.id'), 'prg', 'Open goes to the actual source city');
  // Swapping the attacks' order and adding an overlapping flood must not change the attribution.
  ev("S.ev.ddosMore.push(S.ev.ddos,{...S.ev.ddos,id:'overlap',gbps:20});S.ev.ddos=S.ev.ddosMore.shift();compute()");
  assert.deepEqual(sources('fp1').map(x=>x.city), ['prg']);
  assert.deepEqual(sources('fb').map(x=>x.city), ['ber']);
  // When Berlin's direct link fails, its haul really does join Prague's route.
  ev('S.links.find(l=>l.id==="fb").cut=S.day+1;compute()');
  assert.ok(ev('R.load.pb')>0);
  assert.deepEqual(sources('fp1').map(x=>x.city), ['ber','prg']);
  assert.deepEqual(sources('pb').map(x=>x.city), ['ber']);
  assert.ok(Math.abs(sources('fp1').reduce((n,x)=>n+x.g,0)-ev('R.load.fp1+R.load.fp2'))<1e-9, 'shared-path totals still equal the actual link load');
  assert.deepEqual(errors, []);
});

function setupScrubLatency(ev) {
  ev(`ACT.start({});S.cash=1e9;S.lvl=6;for(const c of ['par','nyc','ams'])ACT.buildPop({city:c});
    for(const c in S.pops)S.pops[c].rgen=RG.findIndex(g=>g.fs===1);
    S.links=[{id:'pf',a:'par',b:'fra',kind:'wave',tier:3,km:620/1.3,mo:100},
      {id:'fn',a:'fra',b:'nyc',kind:'wave',tier:3,km:6000,mo:100},
      {id:'fa',a:'fra',b:'ams',kind:'wave',tier:3,km:200,mo:100}];
    S.transit=[{id:'tf',city:'fra',net:'cog',tier:2},{id:'tn',city:'nyc',net:'cog',tier:2}];
    S.scrubs=[{city:'fra',tier:0},{city:'par',tier:0}];
    S.ev.ddos={id:'par-flood',city:'par',vec:'dns',gbps:33.8,start:0,until:7,
      entry:{k:'edge',lab:''}};compute()`);
}

test('each attack shows only the nearest scrubbing detour using precise one-way link latency', () => {
  const { ev, errors } = load();
  setupScrubLatency(ev);
  ev("for(const c in S.pops)S.pops[c].rgen=3;S.scrubs=[{city:'fra',tier:0},{city:'ams',tier:0}];S.ev.ddos.vec='ack';S.ev.ddos.gbps=230;compute()");
  assert.equal(ev('ddosReport(S.ev.ddos).sp.parts.length'), 2, 'capacity spills between centers');
  const card = ev('ddosOne(S.ev.ddos)');
  assert.equal((card.match(/Scrubbing traffic hauled over your backbone/g)||[]).length, 1);
  assert.match(card, /✓ Scrubbing traffic hauled over your backbone: Paris → Frankfurt \(\+3\.1 ms\)/);
  // An overlapping attack has its own victim and nearest center.
  ev("S.ev.ddosMore=[{id:'other',city:'ams',vec:'ack',gbps:10,start:0,until:7,entry:{k:'edge',lab:''}}];compute()");
  assert.doesNotMatch(ev('ddosOne(S.ev.ddosMore[0])'), /Scrubbing traffic hauled over your backbone/);
  assert.match(ev('ddosOne(S.ev.ddos)'), /Paris → Frankfurt \(\+3\.1 ms\)/);
  // Ignore a failed nearby center and use the live path to Amsterdam.
  ev("S.pops.fra.down=10;S.links.push({id:'pa',a:'par',b:'ams',kind:'wave',tier:3,km:2000,mo:100});compute()");
  assert.match(ev('ddosOne(S.ev.ddos)'), /Paris → Amsterdam \(\+13\.0 ms\)/);
  ev('S.ev.ddos.bh=true;compute()');
  assert.doesNotMatch(ev('ddosOne(S.ev.ddos)'), /Scrubbing traffic hauled over your backbone/);
  ev('S.ev.ddos.bh=false;S.scrubMode="ondemand";compute()');
  assert.doesNotMatch(ev('ddosOne(S.ev.ddos)'), /Scrubbing traffic hauled over your backbone/);
  assert.deepEqual(errors, []);
});

test('a constrained remote haul leaves scrubbing capacity for the next overlapping flood', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=6;ACT.buildPop({city:'nyc'});for(const c of ['fra','nyc'])S.pops[c].rgen=3;S.links=[{id:'thin',a:'nyc',b:'fra',kind:'wave',tier:1,km:6000,mo:100}];S.scrubs=[{city:'fra',tier:1}];S.ev.ddos={id:'far',city:'nyc',vec:'http',gbps:600,start:0,until:7};S.ev.ddosMore=[{id:'near',city:'fra',vec:'http',gbps:900,start:0,until:7}];compute()");
  const clean = JSON.parse(ev('JSON.stringify(R.ddos.map(m=>({id:m.attack.id,clean:m.sp?.parts.reduce((n,x)=>n+x.cleaned,0)||0,leak:m.leak})))'));
  assert.equal(clean.find(m=>m.id==='near').clean, 900);
  assert.ok(clean.find(m=>m.id==='far').clean <= 100);
  assert.ok(clean.reduce((n,m)=>n+m.clean,0) <= 1000);
  for (const m of clean) assert.equal(m.clean+m.leak, m.id==='near'?900:600);
  assert.deepEqual(errors, []);
});

test('RackNet and TeamSpooked require signed gaming customers, bypass Flowspec, and stay within a third of the current size range', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=13;S.pops.fra.bb={d:150000};ACT.buyTransit({city:'fra',net:'cog',tier:2});compute()");
  assert.equal(ev("ddosVectors().includes('racknet')||ddosVectors().includes('teamspooked')"), false);
  ev("S.offers=[{type:'game'}]");
  assert.equal(ev("ddosVectors().includes('racknet')"), false, 'an unsigned offer does not introduce gaming attacks');
  ev("S.biz=[{type:'game',id:'gamer',name:'Gamer',city:'fra',bw:0,rate:0}];compute()");
  for (const vec of ['racknet','teamspooked']) {
    assert.equal(ev(`DDOS_VEC.${vec}.fs`), false);
    const sizeMax = ev('ddosSizeMax()/3');
    ev(`const old=Math.random;let n=0;Math.random=()=>n++===1?(ddosVectors().indexOf('${vec}')+0.5)/ddosVectors().length:0.999999;ddosAttack();Math.random=old`);
    assert.equal(ev('ddosAll().at(-1).vec'), vec);
    assert.ok(ev('ddosAll().at(-1).gbps') <= sizeMax);
    assert.ok(ev('ddosAll().at(-1).gbps') > sizeMax*(1-0.00002), 'the upper randomized quantile approaches the one-third limit, including rare spikes');
  }
  ev("S.biz[0].type='cgame'");
  assert.equal(ev("ddosVectors().includes('teamspooked')"), true, 'cloud gaming also attracts these vectors');
  ev('S.biz=[]');
  assert.equal(ev("ddosVectors().includes('teamspooked')"), false);
  assert.equal(ev('ddosAll().length'), 2, 'existing attacks finish naturally after the gaming customer leaves');
  assert.deepEqual(errors, []);
});

test('gamers\' DDoS starts rise gradually from half an attack per week and never exceed a seven-per-week expected rate', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.rules=makeRules('bgp');S.day=50");
  const checks = JSON.parse(ev(`
    const oldAttack=ddosAttack,oldRandom=Math.random,out=[];
    try {
      for(const [level,games] of [[1,0],[13,0],[1,1],[13,1],[13,10],[13,1000]]){
        S.lvl=level;S.biz=Array.from({length:games},()=>({type:'game'}));
        let starts=0,draw=0;ddosAttack=()=>{starts++};Math.random=()=>((draw++)+0.5)/14000;
        for(let day=0;day<7000;day++)ddosTick();
        out.push({level,games,expected:ddosRate(),observed:starts/1000});
      }
    } finally {ddosAttack=oldAttack;Math.random=oldRandom;}
    JSON.stringify(out)
  `));
  for(const row of checks){
    if(row.games===0){assert.equal(row.observed,0,'without gamers attacks stay on the failure schedule');continue;}
    assert.ok(Math.abs(row.observed-row.expected)<=0.0011, JSON.stringify(row));
    assert.ok(row.expected>0.5&&row.expected<=7);
  }
  assert.ok(checks[3].expected>checks[2].expected, 'level increases gaming frequency');
  assert.ok(checks[4].expected>checks[3].expected, 'more gaming customers increase frequency');
  assert.ok(checks[3].expected<0.8, 'one gaming customer does not suddenly add several attacks per week, even at the last level');
  assert.deepEqual(errors, []);
});

test('normal attack sizes match the one- and fifty-gamer targets while frequency rises gradually', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const samples = JSON.parse(ev(`
    const oldRandom=Math.random,out=[];
    try {
      for(const [level,demand] of [[1,0],[3,1850],[LEVELS.length,LV_REQ.at(-1).pk]]){
        const counts=[];
        for(const games of [0,1,2,5,10,20,50,100,1000]){
          S.lvl=level;S.biz=Array.from({length:games},(_,i)=>({id:'g'+i,type:i%2?'cgame':'game',city:'fra',bw:0,rate:0}));
          const vectors=ddosVectors();let sum=0;
          for(let i=0;i<vectors.length;i++)for(const [roll,weight] of [[0.49,0.98],[0.99,0.02]]){
            S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[];R.demand=demand;
            let draw=0;Math.random=()=>draw++===1?(i+0.5)/vectors.length:roll;
            ddosAttack(false);sum+=weight*S.ev.ddos.gbps;
          }
          counts.push({games,mean:sum/vectors.length,rate:ddosRate()});
        }
        out.push({level,demand,counts});
      }
    } finally {Math.random=oldRandom;}
    JSON.stringify(out)
  `));
  for(const row of samples){
    const [plain,first]=row.counts,fifty=row.counts.find(c=>c.games===50),hundred=row.counts.find(c=>c.games===100),many=row.counts.at(-1);
    assert.ok(Math.abs(first.mean-plain.mean*3)<0.003, 'the first gamer triples the overall mean, allowing only bandwidth rounding: '+JSON.stringify(row));
    assert.ok(Math.abs(fifty.mean-plain.mean*8)<0.01, 'fifty gamers bring eightfold sizes, allowing only bandwidth rounding');
    assert.ok(hundred.mean>first.mean*3, 'growth continues across dozens of gaming customers');
    assert.ok(hundred.mean>plain.mean*10 && hundred.mean<plain.mean*11, 'a hundred gamers bring roughly tenfold sizes');
    assert.ok(many.mean<=plain.mean*12+0.01, 'high-exposure sizes approach the existing upper balance');
    assert.equal(plain.rate,0.5);
    assert.ok(first.rate<0.8);
    assert.ok(hundred.rate>6 && many.rate<=7);
    for(let i=1;i<row.counts.length;i++){
      assert.ok(row.counts[i].mean>row.counts[i-1].mean, 'each sampled count increases actual spawned attack sizes');
      assert.ok(row.counts[i].rate>row.counts[i-1].rate, 'each sampled count increases frequency');
    }
  }
  assert.ok(Math.abs(samples[0].counts[0].mean-1)<0.001, 'the minimum-demand baseline still permits small attacks');
  assert.ok(Math.abs(samples[1].counts[0].mean-740/13)<0.001, 'the 1.85 Tbps non-gaming example keeps its average');
  assert.ok(Math.abs(samples[2].counts[0].mean-samples[2].demand*4/3/10)<0.001);
  assert.deepEqual(errors, []);
});

test('normal attack sizes cover a broad ordinary range and a two-percent large tail without raising the mean', () => {
  const { ev, errors } = load();
  ev('ACT.start({});S.lvl=3;S.biz=[];R.demand=1850');
  const distribution = JSON.parse(ev(`
    const oldRandom=Math.random,ordinary=[],large=[];let sum=0;
    try {
      for(let i=0;i<10000;i++){
        Math.random=()=>(i+0.5)/10000;
        const g=ddosSize('syn');sum+=g;(g>100?large:ordinary).push(g);
      }
    } finally {Math.random=oldRandom;}
    JSON.stringify({ordinary:{n:ordinary.length,min:Math.min(...ordinary),max:Math.max(...ordinary)},
      large:{n:large.length,min:Math.min(...large),max:Math.max(...large),near500:large.some(g=>g>=490&&g<=510)},mean:sum/10000})
  `));
  assert.equal(distribution.ordinary.n, 9800);
  assert.equal(distribution.large.n, 200);
  assert.ok(distribution.ordinary.min>=8.9 && distribution.ordinary.min<10);
  assert.ok(distribution.ordinary.max>85 && distribution.ordinary.max<=89.1);
  assert.ok(distribution.ordinary.max/distribution.ordinary.min>9.9);
  assert.ok(distribution.large.min>=356 && distribution.large.max<=535);
  assert.ok(distribution.large.near500, 'the example network can occasionally face a roughly 500 Gbps flood');
  assert.ok(Math.abs(distribution.mean-740/13)<0.001, 'the rare tail preserves the previous 56.923 Gbps average');
  // Verify that real spawns use both bands, not just the standalone sampler.
  for (const [roll,minimum,maximum] of [[0.49,8.9,89.1],[0.99,356,535]]) {
    ev(`S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[];R.demand=1850;const old=Math.random;let n=0;Math.random=()=>{const i=n++;return i===1?(ddosVectors().indexOf('syn')+0.5)/ddosVectors().length:i===2?${roll}:0.5};try{ddosAttack()}finally{Math.random=old}`);
    assert.equal(ev('S.ev.ddos.vec'), 'syn');
    assert.ok(ev('S.ev.ddos.gbps')>=minimum && ev('S.ev.ddos.gbps')<=maximum);
  }
  assert.deepEqual(errors, []);
});

test('Flood Season mixes terabit monsters with ordinary floods, and all of it grows through the year and after', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.scn={id:'flood',rules:{ddos:true}};S.lvl=3;S.biz=[];R.cityDem={fra:100}");
  // One draw: below a third a monster (800 to 3,400G), above it an ordinary flood up to 90% of the city's traffic.
  for (const [day,expected] of [[0,[800,3399,2,91]],[365,[1600,6799,4,183]],[730,[2400,10199,6,275]]]) {
    ev(`S.day=${day}`);
    const actual = JSON.parse(ev("const old=Math.random;let sizes;try{sizes=[0,1/3-1e-9,1/3,0.999999].map(r=>{Math.random=()=>r;return ddosSize('syn','fra')})}finally{Math.random=old}JSON.stringify(sizes)"));
    assert.deepEqual(actual, expected, `day ${day}`);
  }
  assert.deepEqual(errors, []);
});

test('the busier DDoS schedule needs gaming customers; otherwise attacks come with the other incidents', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.day=50;S.lvl=13;S.biz=[];S.nextFail=1e9;S.nextEvent=1e9");
  const ticks = () => ev("(()=>{const old=Math.random,oa=ddosAttack;let n=0;ddosAttack=()=>{n++};Math.random=()=>0;try{for(let i=0;i<30;i++)ddosTick();}finally{Math.random=old;ddosAttack=oa;}return n;})()");
  assert.equal(ticks(), 0, 'no spicy chaos, no gamers: no extra schedule');
  // DDoS stays one of the regular incidents instead: some roll of fireFailure() still starts one.
  assert.ok(ev("(()=>{const old=Math.random;try{for(let i=0;i<200;i++){const r=i/200;Math.random=()=>r;S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[];fireFailure();if(ddosAll().length)return true;}return false;}finally{Math.random=old;}})()"), 'fireFailure can start an attack');
  ev("S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[];S.inc=[]");
  ev("S.biz=[{type:'game',city:'fra',bw:5,rate:1,reqs:[]}]");
  assert.ok(ticks() > 0, 'gaming customers bring their own attacks');
  ev("S.biz=[];S.rules=makeRules('bgp')");
  assert.equal(ticks(), 0, 'spicy chaos alone has no daily schedule: it doubles the incident one');
  ev("S.rules=makeRules('freeze')");
  assert.equal(ticks(), 0, 'Change Freeze has no attacks on either schedule');
  ev("S.biz=[{type:'game',city:'fra',bw:5,rate:1,reqs:[]}]");
  assert.equal(ticks(), 0, 'not even with gamers');
  assert.ok(ev("(()=>{const old=Math.random;try{for(let i=0;i<200;i++){const r=i/200;Math.random=()=>r;S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[];fireFailure();if(ddosAll().length)return false;}return true;}finally{Math.random=old;S.inc=[];}})()"), 'and fireFailure never rolls one');
  ev("S.rules=makeRules('oncall');S.biz=[{type:'game',city:'fra',bw:5,rate:1,reqs:[]}]");
  assert.ok(ev("(()=>{const old=Math.random;try{for(let i=0;i<200;i++){const r=i/200;Math.random=()=>r;S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[];fireFailure();if(ddosAll().length)return false;}return true;}finally{Math.random=old;S.inc=[];}})()"), 'gamers\' attacks come from their own schedule only, never twice');
  ev("S.biz=[]");
  ev("S.rules=makeRules('oncall')");
  // Flood Season, not spicy: one flood at a time, 3 to 7 days apart, however old the scenario is.
  ev("ACT.startScn({id:'flood',sure:1});S.biz=[]");
  const gaps = JSON.parse(ev("(()=>{const o=[];for(const d of [0,1000])for(const r of [0,0.999]){S.day=d;const old=Math.random;Math.random=()=>r;o.push(floodGap());Math.random=old;}return JSON.stringify(o);})()"));
  assert.deepEqual(gaps, [3, 7, 3, 7]);
  ev("S.scn.nextDdos=S.day;ddosTick()");
  assert.equal(ev('ddosAll().length'), 1);
  ev("S.scn.nextDdos=S.day;ddosTick()");
  assert.equal(ev('ddosAll().length'), 1, 'the next flood waits for the last one to end');
  assert.deepEqual(errors, []);
});
