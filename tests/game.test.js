const test = require('node:test');
const assert = require('node:assert/strict');
const { load, seed } = require('./harness');

test('page boots to the title screen without errors', () => {
  const { ev, errors } = load();
  assert.equal(ev("document.getElementById('modal').hidden"), false);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Series\s*of\s*Tubes/);
  assert.deepEqual(errors, []);
});

test('every city sits on its landmass', () => {
  const { ev } = load();
  const off = ev("CITIES.filter(c=>!c.gen&&!inPoly(c.x,c.y,LANDS.find(l=>l.id===c.land).pts)).map(c=>c.id).join()");
  assert.equal(off, '');
  // generated cities are on a known landmass or on an island of their own, and islands are not inside any polygon
  const bad = ev("CITIES.filter(c=>c.gen&&(c.land.startsWith('i:')?LANDS.some(l=>inPoly(c.x,c.y,l.pts)):!LANDS.some(l=>l.id===c.land))).map(c=>c.id).join()");
  assert.equal(bad, '');
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

test('transit is only sold where a transit network really has a PoP', () => {
  const { ev } = load();
  assert.ok(ev("CITIES.some(c=>!NETS.some(n=>n.price&&n.pops.includes(c.id)))"), 'some cities have nobody to buy from');
  ev('ACT.start({})');
  // buying transit in a city without a seller does nothing
  const none = ev("CITIES.find(c=>!NETS.some(n=>n.price&&n.pops.includes(c.id))).id");
  ev(`S.cash=1e9;ACT.buildPop({city:'${none}'});ACT.buyTransit({city:'${none}',net:'cog',tier:0})`);
  assert.equal(ev('S.transit.length'), 0);
  assert.ok(ev("ixMembers('stg').length") > 0, 'networks peer at the local exchange');
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
  ev("S.ev.ddos.vec='dns';S.scrubAt='fra';S.scrubTier=1;S.scrubMode='always';compute()");
  assert.ok(ev('R.served') > none, 'scrubbing recovers real traffic');
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
  const small = ev("S.scrubAt='fra';S.scrubTier=0;S.scrubMode='always';compute();R.served");
  const big = ev("S.scrubTier=2;compute();R.served");
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
  ev("S.scrubAt='fra';S.scrubTier=0;S.biz.push({id:'b1',city:'fra',type:'scrub',bw:5,rate:900,mood:80,since:0,reqs:[]});S.ev.ddos={city:'fra',vec:'dns',gbps:6000,until:S.day+5,entry:{k:'t',lab:'x'},bh:false,start:S.day}");
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
  ev("S.scrubAt='fra';S.scrubTier=0");
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
  ev("S.lvl=4;ACT.buildPop({city:'ams'})");
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

test('tampered saves cannot break the newer systems: wrong-shaped fields are dropped and rebuilt', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({})");
  const bad = { staff: {}, ops: { maint: 5 }, deals: 7, tl: {}, sec: 5, ctr: 3, focus: 9, teamPeers: 4, paid: 'x', roa: 7, yr: 3, uiReq: 1, yrView: [] };
  for (const [k, v] of Object.entries(bad)) {
    dom.window.__v = v;
    ev(`(()=>{const s=JSON.parse(JSON.stringify(S));s[${JSON.stringify(k)}]=__v;S=migrate(s);for(let i=0;i<5;i++)dayTick();renderAll();})()`);
  }
  assert.deepEqual(errors, []);
});
