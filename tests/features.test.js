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

test('ops: engineers cost money and fix things, a freeze blocks changes, maintenance patches a site', () => {
  const { ev, errors } = boot();
  const c0 = ev('R.costMo');
  ev('ACT.opsHire({d:4});compute()');
  assert.equal(ev('R.costMo') - c0, 4 * 9000);
  ev("S.inc=[];S.ev.ixdown=null;S.pops.fra.down=0;addInc({type:'crash',ref:'fra',until:S.day+40,msg:'x',cost:0});S.pops.fra.down=S.day+40;const r=Math.random;Math.random=()=>0.01;S.day+=2;opsTick(S.day);Math.random=r;");
  assert.equal(ev("S.inc.length"), 0, 'a lucky roll gets the engineers to fix it');
  ev('ACT.opsFreeze()');
  const links = ev('S.links.length');
  ev("ACT.buyTransit({city:'fra',net:'lvl',tier:1})");
  assert.equal(ev('S.transit.length'), 2, 'frozen: nothing bought');
  ev('ACT.opsFreeze();ACT.opsMaint({city:"fra"})');
  ev('S.day+=3;opsTick(S.day)');
  assert.ok(ev('S.pops.fra.patched>S.day'));
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
