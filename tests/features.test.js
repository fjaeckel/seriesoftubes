const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const base = "ACT.start({});S.cash=1e12;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'ntt',tier:1});ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()";
const boot = () => { const g = load(); g.ev(base); return g; };

test('RouteScript: prepend and lowpref move traffic between two transits, and the looking glass shows why', () => {
  const { ev, errors } = boot();
  const used = () => JSON.parse(ev('JSON.stringify(S.transit.map(t=>[t.net,R.useT[t.id]||0]))'));
  const before = Object.fromEntries(used());
  assert.ok(before.ntt + before.cog > 1);
  ev("S.te={on:true,script:'prepend transit cogent x3'};compute()");
  assert.equal(ev("teParse(S.te.script).errors.length"), 0);
  const after = Object.fromEntries(used());
  assert.ok(after.cog <= before.cog && after.ntt >= before.ntt, 'prepending cogent pushes load to ntt');
  const lg = ev("lookingGlass('cmc').text");
  assert.match(lg, /174 174 174 174/, 'three prepends show up in the path');
  assert.match(lg, /best/);
  ev("S.te.script='lowpref transit ntt';compute()");
  assert.equal(ev("teParse(S.te.script).errors.length"), 0);
  assert.match(ev("lookingGlass('cmc').text"), /localpref 10\b/);
  assert.deepEqual(errors, []);
});

test('ping, mtr and the BGP view all work and stay consistent with traceroute', () => {
  const { ev, errors } = boot();
  const p = ev("pingTool('fra',{net:'cmc'}).text");
  assert.match(p, /5 packets transmitted/);
  assert.match(p, /round-trip min\/avg\/max/);
  const m = ev("mtrTool('fra',{net:'cmc'}).text");
  assert.match(m, /Loss%/);
  assert.ok(m.split('\n').filter((l) => /\|--/.test(l)).length >= 8);
  ev("ACT.trace({});ACT.trTool({tool:'ping'});ACT.trTool({tool:'mtr'});ACT.trTool({tool:'lg'});ACT.trTool({tool:'trace'})");
  assert.deepEqual(errors, []);
});

test('RPKI: a signed ROA makes ROV networks ignore a hijack, an expired one fires an incident until renewed', () => {
  const { ev, errors } = boot();
  assert.equal(ev('rpkiState()'), 'valid');
  const hit = () => { ev("S.ev.rpki=null;S.inc=S.inc.filter(i=>i.type!=='hijack');let n=0;const r=Math.random;Math.random=()=>0.1;fireEvent('hijack');Math.random=r;"); return ev('S.ev.rpki?S.ev.rpki.nets.length:0'); };
  const signed = hit();
  ev('sec().roa=null;sec().auto=false');
  const unsigned = hit();
  assert.ok(unsigned > signed, `unsigned ${unsigned} > signed ${signed}`);
  ev("S.ev.rpki=null;S.inc=[];S.day=400;sec().roa=399;dayTick()");
  assert.ok(ev("S.inc.some(i=>i.type==='rpki')"), 'expiry opens an incident');
  ev("ACT.fixInc({id:S.inc.find(i=>i.type==='rpki').id})");
  assert.equal(ev('rpkiState()'), 'valid');
  ev('ACT.secRov();ACT.secIrr()');
  assert.equal(ev('routeView().sec.mrs'), true);
  ev("routesModal('sec');routesModal('cu')");
  assert.deepEqual(errors, []);
});

test('peering disputes: refusing takes the direct session down, paying brings it back at a monthly price', () => {
  const { ev, errors } = boot();
  ev("S.pni.push({id:'pn1',city:'fra',net:'nfx',tier:1,n:1});compute()");
  assert.ok(ev("disputeNets().includes('nfx')"));
  const direct = () => ev("trExits('nfx').filter(e=>e.k==='p').length");
  assert.equal(direct(), 1);
  ev("S.ev.dispute={net:'nfx',until:S.day+45,fee:4000};addInc({type:'dispute',ref:'nfx',until:S.day+45,msg:'x',cost:0});compute()");
  assert.equal(direct(), 0);
  const cost0 = ev('R.costMo');
  ev('ACT.dispPay()');
  assert.equal(direct(), 1);
  assert.ok(ev('R.costMo') - cost0 >= 3999);
  assert.deepEqual(errors, []);
});

test('transit commit: a higher commit is cheaper per Gbps but a floor on the bill', () => {
  const { ev, errors } = boot();
  const id = ev('S.transit[0].id');
  const bill = () => ev('R.cost.transit');
  const b0 = bill();
  ev(`ACT.setCommit({id:'${id}',v:0.8});compute()`);
  assert.ok(ev('commitDisc(S.transit[0])') === 0.25);
  ev(`ACT.setCommit({id:'${id}',v:0.2});compute()`);
  assert.equal(bill(), b0);
  assert.deepEqual(errors, []);
});

test('ops: staff cost money and fix things, a freeze blocks changes, maintenance patches a site', () => {
  const { ev, errors } = boot();
  const c0 = ev('R.costMo');
  ev("for(let i=0;i<4;i++){const p=mkPerson('noc',3);stf().people.push(p);}compute()");
  assert.equal(ev('R.costMo') - c0, ev('staffCost()'));
  assert.equal(ev('nocCover()'), 1);
  ev("S.inc=[];addInc({type:'crash',ref:'fra',until:S.day+40,msg:'x',cost:0});S.pops.fra.down=S.day+40;const r=Math.random;Math.random=()=>0.01;S.day+=2;staffTick(S.day);Math.random=r;");
  assert.equal(ev("S.inc.length"), 0, 'a lucky roll gets the on-call team to fix it');
  ev('ACT.opsFreeze()');
  ev("ACT.buyTransit({city:'fra',net:'lvl',tier:1})");
  assert.equal(ev('S.transit.length'), 2, 'frozen: nothing bought');
  ev('ACT.opsFreeze();ACT.opsMaint({city:"fra"})');
  ev('S.day+=3;opsTick(S.day)');
  assert.ok(ev('S.pops.fra.patched>S.day'));
  assert.deepEqual(errors, []);
});

test('staff: hiring, rules, proposals in ask mode, automatic upgrades in auto mode within a budget', () => {
  const { ev, errors } = boot();
  ev("staffTick(S.day=40)");
  assert.ok(ev('stf().pool.length')>0, 'candidates exist');
  const id = ev("stf().pool.find(p=>p.role==='arch')?.id||(stf().pool[0].role='arch',stf().pool[0].id)");
  const cash0 = ev('S.cash');
  ev(`ACT.stHire({id:'${id}'})`);
  assert.equal(ev("people('arch').length"), 1);
  assert.ok(ev('S.cash') < cash0, 'one month up front');
  // make the Frankfurt transit look full
  ev("R.useT[S.transit[0].id]=lagCap(PORT[S.transit[0].tier].g,S.transit[0].n)*0.95");
  const props = JSON.parse(ev("JSON.stringify(BRAINS.arch().map(p=>p.kind))"));
  assert.ok(props.includes('buyTransit') || props.includes('lagT'), props.join());
  ev("polOf('arch').mode='ask';stf().inbox=[];for(let d=40;d<60;d++){staffRun('arch',d)}");
  assert.ok(ev('stf().inbox.length') > 0, 'ask mode queues proposals');
  const tier0 = ev('S.transit[0].tier');
  ev("ACT.stApprove({id:stf().inbox[0].id})");
  assert.ok(ev('S.transit[0].tier') > tier0 || ev('S.transit[0].n||1') > 1, 'approved work happens');
  ev("polOf('arch').mode='auto';polOf('arch').budget=1e7;polOf('arch').reserve=0;stf().inbox=[];R.useT[S.transit[0].id]=lagCap(PORT[S.transit[0].tier].g,S.transit[0].n)*0.95");
  const before = ev('S.transit[0].tier*10+(S.transit[0].n||1)');
  ev("for(let d=60;d<80;d++){staffRun('arch',d);R.useT[S.transit[0].id]=lagCap(PORT[S.transit[0].tier].g,S.transit[0].n)*0.95}");
  assert.ok(ev('S.transit[0].tier*10+(S.transit[0].n||1)') > before, 'auto mode upgrades by itself');
  ev("polOf('arch').budget=0;stf().inbox=[];const t0=S.transit[0].tier;for(let d=80;d<100;d++){staffRun('arch',d);R.useT[S.transit[0].id]=lagCap(PORT[S.transit[0].tier].g,S.transit[0].n)*0.95}");
  assert.ok(ev('stf().inbox.length') > 0, 'no budget: it asks instead');
  ev('staffModal("team");staffModal("hire");staffModal("inbox");staffModal("pol");staffModal("chg")');
  assert.deepEqual(errors, []);
});

test('staff: sales signs offers, marketing runs ads, sr NOC steers load, architect removes dead links', () => {
  const { ev, errors } = boot();
  ev("for(const r of ['sales','srnoc','mkt','arch'])stf().people.push(mkPerson(r,5));for(const r of ['sales','srnoc','mkt','arch']){polOf(r).mode='auto';polOf(r).budget=1e7;polOf(r).reserve=0}");
  ev("S.pops.fra.bb={d:5};CITY.fra.P=500;compute()");
  const mk = JSON.parse(ev("JSON.stringify(BRAINS.mkt().map(p=>p.kind))"));
  assert.ok(mk.includes('ad'));
  ev("for(let d=1;d<=12;d++)staffRun('mkt',d)");
  assert.ok(ev('S.pops.fra.boost>S.day'));
  ev("S.pops.ams=S.pops.ams||{day:0,bb:null,boost:0,down:0,routers:1,gen:false};S.links.push({id:'dead',a:'fra',b:'ams',kind:'wave',tier:1,km:400,mo:900,mult:1,trench:'dead',cut:0,day:0});S.links.push({id:'live',a:'fra',b:'ams',kind:'wave',tier:1,km:400,mo:900,mult:1,trench:'live',cut:0,day:0});compute();stf().idle.dead=120;R.load.dead=0;");
  const arch = JSON.parse(ev("JSON.stringify(BRAINS.arch().map(p=>p.kind+':'+(p.args.id||'')))"));
  assert.ok(arch.some((k) => k.startsWith('rmLink')), arch.join());
  ev("S.transit[1].pref='normal';R.useT[S.transit[1].id]=lagCap(PORT[S.transit[1].tier].g,S.transit[1].n)*0.97");
  assert.ok(JSON.parse(ev("JSON.stringify(BRAINS.srnoc().map(p=>p.kind))")).includes('pref'));
  ev("S.offers.push({id:'o1',city:'fra',city2:null,name:'Test Hosting',type:'host',bw:10,rate:60,reqs:[],exp:S.day+30});compute()");
  assert.ok(JSON.parse(ev("JSON.stringify(BRAINS.sales().map(p=>p.kind))")).includes('accept'));
  ev("for(let d=1;d<=12;d++)staffRun('sales',d)");
  assert.ok(ev("S.biz.some(b=>b.id==='o1')"));
  assert.deepEqual(errors, []);
});

test('single player loop: contracts pay and keep a streak, the year-end report, legacy perks and deals', () => {
  const { ev, errors } = boot();
  ev("S.day=20;compute();ctrTick(S.day)");
  assert.equal(ev('ctr().active.length'), 3);
  const c = ev("ctr().active[0]");
  ev("ctr().active=[{id:'t1',t:'serve',goal:1,title:'x',start:S.day,due:S.day+50,reward:10000,pts:2},{id:'t2',t:'pops',goal:999,title:'y',start:S.day,due:S.day+500,reward:1,pts:1},{id:'t3',t:'biz',goal:999,title:'z',start:S.day,due:S.day+500,reward:1,pts:1}];const c0=S.cash;window.__c0=c0;S.stats.peak=5;R.served=50;ctrTick(S.day+1)");
  assert.equal(ev('ctr().streak'), 1);
  assert.ok(ev('S.cash') > ev('window.__c0'));
  ev("ctr().active.find(x=>x.id==='t2').due=S.day-1;ctrTick(S.day+5)");
  assert.equal(ev('ctr().streak'), 0, 'a missed contract resets the streak');
  ev('ACT.contracts();ACT.legacy()');
  // legacy
  ev("legacySet({pts:10,tot:10,perks:{}});ACT.legacyBuy({k:'cash'})");
  assert.equal(ev("legacyLevel('cash')"), 1);
  ev("ACT.newgame&&0");
  // year end
  ev("S.day=360;yrTick(360)");
  assert.match(ev("document.getElementById('modalCard').textContent"), /in review/);
  ev("ACT.focus({k:'growth'})");
  assert.equal(ev("focusOn('growth')"), true);
  // deals
  ev("S.day=200;S.deals=[dealMake()];ACT.deals()");
  ev("S.cash=1e9;for(const d of S.deals.slice()){S.deals=[d];ACT.dealTake({id:d.id})}");
  assert.deepEqual(errors, []);
});

test('cable events cut the right cables and repair ships queue up', () => {
  const { ev, errors } = boot();
  ev("S.links.push({id:'sub1',a:'hkg',b:'sin',kind:'wave',tier:1,km:2600,sub:true,cable:'apg',mo:1,mult:1,trench:'sub1',cut:0,day:0})");
  ev("fireEvent('quake')");
  assert.ok(ev("S.links.find(l=>l.id==='sub1').cut>S.day"), 'APG is down after a Luzon quake');
  const d1 = ev("S.links.find(l=>l.id==='sub1').cut-S.day");
  assert.ok(d1 >= 28);
  assert.deepEqual(errors, []);
});

test('historical scenarios run: Facebook 2021 withdraws everything, Dyn floods the home city, the hijack scenario starts unsigned', () => {
  for (const id of ['fb2021', 'pkyt', 'dyn', 'luzon']) {
    const { ev, errors } = load();
    ev(`localStorage.removeItem('sot-scn');ACT.startScn({id:'${id}'})`);
    ev("S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:S.home});ACT.buyTransit({city:S.home,net:'ntt',tier:1});compute()");
    if (id === 'pkyt') assert.equal(ev('rpkiState()'), 'unknown');
    for (let i = 0; i < (id === 'fb2021' ? 121 : 125); i++) ev('S.cash=1e9;dayTick()');
    if (id === 'fb2021') { ev('compute()'); assert.ok(ev('R.reach') < 0.01, 'all routes withdrawn'); assert.equal(ev("trExits('ggl').length"), 0); }
    assert.deepEqual(errors, [], id);
  }
});

test('timelapse records builds, the route viewer lists customers and team peers', () => {
  const { ev, errors } = boot();
  ev("ACT.buildPop({city:'ams'});S.links.push({id:'x1',a:'fra',b:'ams',kind:'wave',tier:1,km:400,mo:1,mult:1,trench:'x1',cut:0,day:0});S.day=15;dayTick()");
  assert.ok(ev("S.tl.e.some(e=>e[1]==='l'&&e[2]==='ams')"));
  assert.ok(ev("S.tl.e.filter(e=>e[1]==='p').length")>=2);
  ev('ACT.timelapse();ACT.tlClose()');
  ev("setTeamPeers([{asn:64512,name:'Other Team'}])");
  assert.ok(ev("routeView().peers.some(p=>p.type==='team'&&p.asn===64512)"));
  assert.ok(Array.isArray(JSON.parse(ev('JSON.stringify(routeView().customers)'))));
  assert.deepEqual(errors, []);
});

test('team panel renders the policy and exchange tables from the server data', async () => {
  const { ev, errors, dom } = boot();
  ev("MP.asn=64512;MP.role='owner';MP.on=true;UI.mpTeam=true;MP.presence=[];MP.chat=[]");
  ev(`window.mpFetch=mpFetch=async()=>({peers:[],incoming:[{asn:2,name:'Bob'}],outgoing:[],policy:{pol:'paid',min:50,fee:5000},sessions:[{asn:3,name:'Cy',via:'DE-CIX Frankfurt',kind:'ix',fee:-5000,policy:'open'}],ixes:[{ix:'fra',name:'DE-CIX Frankfurt',rs:true,members:[{asn:3,name:'Cy',pol:'open',min:0,fee:0,rs:true,up:true,why:''},{asn:4,name:'Di',pol:'selective',min:100,fee:0,rs:true,up:false,why:'wants 100 Gbps'}]}]})`);
  ev("mpTeam()");
  await new Promise((r) => setTimeout(r, 30));
  const t = ev("document.getElementById('mpPeer').textContent");
  assert.match(t, /Our peering policy/);
  assert.match(t, /session up/);
  assert.match(t, /wants 100 Gbps/);
  assert.match(t, /you pay \$5\.0k\/mo/);
  assert.deepEqual(errors, []);
});

test('city codes are the ones operators use', () => {
  const { ev } = boot();
  assert.equal(ev("cityCode('mos')"), 'msk');
  assert.equal(ev("cityCode('tok')"), 'tyo');
  assert.equal(ev("cityCode('fra')"), 'fra');
  assert.equal(ev("cityCode('kyv')"), 'iev');
  assert.ok(ev("Object.keys(CITY).every(c=>/^[a-z0-9]{3,4}$/.test(cityCode(c)))"));
  assert.equal(ev("new Set(Object.keys(CITY).map(cityCode)).size"), ev("Object.keys(CITY).length"), 'codes are unique');
  ev("ACT.start({});S.cash=1e9;S.lvl=4;ACT.buildPop({city:'mos'});S.links.push({id:'m1',a:'fra',b:'mos',kind:'wave',tier:1,km:2000,mo:1,mult:1,trench:'m1',cut:0,day:0});compute()");
  assert.match(ev("traceroute('mos',{city:'fra'}).text"), /\.msk\./);
  assert.ok(!/\.mos\./.test(ev("traceroute('mos',{city:'fra'}).text")));
});

test('pacing: the second POP has to be earned, by peak traffic and by time, and the gate explains itself', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:S.home})");
  assert.ok(ev('popGate()'), 'a brand new network cannot open another POP');
  const before = ev('Object.keys(S.pops).length');
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev('Object.keys(S.pops).length'), before, 'buildPop refused');
  assert.match(ev("document.getElementById('toasts').textContent"), /Not yet/);
  ev("S.stats.peak=130;S.day=50");
  assert.match(ev('popGate()'), /day 100/, 'peak alone is not enough');
  ev("S.day=120");
  assert.equal(ev('popGate()'), null);
  ev("ACT.buildPop({city:'ams'})");
  assert.equal(ev('Object.keys(S.pops).length'), before + 1);
  assert.ok(ev('popGate()'), 'and the third is locked again');
  ev("S.pops[S.home].bb.d=cityCap(S.home);S.pops.ams.bb={d:cityCap('ams')};S.day=300");
  assert.equal(ev('popGate()'), null, 'saturated cities open the way even if the peak lags');
  // sandbox, scenarios and big networks are exempt
  ev("S.mode='sandbox'");
  assert.equal(ev('popGate()'), null);
  assert.deepEqual(errors, []);
});

test('pacing: early growth is slow and cities keep growing for years', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e9;ACT.launchBB({city:S.home});const t=NETS.filter(n=>n.price&&n.pops.includes(S.home))[0];ACT.buyTransit({city:S.home,net:t.id,tier:2});compute()");
  const d0 = ev('S.pops[S.home].bb.d');
  for (let i = 0; i < 60; i++) ev('dayTick()');
  const d60 = ev('S.pops[S.home].bb.d');
  assert.ok(d60 < d0 * 1.8, `${d0} -> ${d60} in 60 days is too fast`);
  assert.ok(ev('cityCap(S.home)') > ev('CITY[S.home].P'), 'the market grows');
});
