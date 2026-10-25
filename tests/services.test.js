const test = require('node:test');
const assert = require('node:assert/strict');
const { load, seed } = require('./harness');

function network(ev) {
  ev("ACT.start({});S.cash=1e8;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  ev("for(const c of ['ams','par','lon'])ACT.buildPop({city:c});for(const c in S.pops){S.pops[c].rgen=3;S.pops[c].routers=2}");
  ev("ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'lvl',tier:3})");
  ev("const L=(a,b,t,v)=>{UI.via=v||null;openLinkModal(a,b);ACT.buildLink({tier:t});};L('fra','ams',3);L('fra','par',3);L('ams','lon',2,'uly');closeModal()");
}

test('event networks pay in full when the crowd is served, nothing up front', () => {
  const { ev, errors } = load();
  seed(ev, 4);
  network(ev);
  ev("S.offers=[{id:'e1',city:'fra',city2:null,name:'Burning Router Festival in Frankfurt',type:'event',bw:50,rate:0,reqs:[],start:S.day+2,dur:3,fee:50000,exp:S.day+1}];ACT.accept({id:'e1'})");
  assert.equal(ev("S.biz.length"), 1);
  const c0 = ev('S.cash');
  ev("dayTick()");
  assert.equal(ev("R.cityDem.fra>R.cityEye.fra"), false, 'no extra demand before the event');
  for (let i = 0; i < 6; i++) ev('dayTick()');
  assert.equal(ev("S.biz.some(b=>b.id==='e1')"), false, 'event is finished and removed');
  assert.ok(ev("S.log.some(e=>/is over: \\+\\$50/.test(e.t))"), 'paid the full fee');
  assert.deepEqual(errors, []);
});

test('an event you cannot serve costs a penalty', () => {
  const { ev } = load();
  network(ev);
  ev("S.offers=[{id:'e2',city:'lon',city2:null,name:'The Big Game in London',type:'event',bw:5000,rate:0,reqs:[],start:S.day+1,dur:2,fee:100000,exp:S.day+1}];ACT.accept({id:'e2'})");
  for (let i = 0; i < 5; i++) ev('dayTick()');
  assert.ok(ev("S.log.some(e=>/was a disaster/.test(e.t))"));
});

test('SD-WAN chains need every spoke; one dead spoke hurts the whole contract', () => {
  const { ev, errors } = load();
  network(ev);
  ev("S.offers=[{id:'s1',city:'fra',city2:null,sites:['fra','ams','par','lon'],name:'Kebab Kingdom',type:'sdwan',bw:5,rate:2800,reqs:[],exp:S.day+30}];ACT.accept({id:'s1'});compute()");
  const b = "S.biz.find(x=>x.id==='s1')";
  assert.equal(ev(`bizSf(${b})`), 1, 'all spokes served');
  assert.ok(ev('R.rev.business') >= 5 * 2800 * 0.99);
  ev("S.links.filter(l=>l.a==='ams'&&l.b==='lon').forEach(l=>l.cut=S.day+5);compute()");
  assert.equal(ev(`bizSf(${b})`), 0, 'London spoke is cut off, so the chain is down');
  ev("selectCity('par')");
  assert.match(ev("document.getElementById('panelBody').textContent"), /4 sites/);
  assert.deepEqual(errors, []);
});

test('alien waves use spectrum on your dark fiber and pay monthly while it is up', () => {
  const { ev, errors } = load();
  network(ev);
  ev("UI.pending={a:'fra',b:'ams'};UI.lmode='df';UI.dfSys='lite';ACT.orderDf();UI.lmode='wave';const df=S.links.find(l=>l.kind==='df');df.ready=S.day;for(let i=0;i<14;i++)ACT.addCh({id:df.id,o:'zr4'})");
  ev("spawnSpecial('wwave')");
  assert.equal(ev("S.offers.filter(o=>o.type==='wwave').length"), 1);
  ev("const o=S.offers.find(o=>o.type==='wwave');o.slots=2;ACT.accept({id:o.id});compute()");
  const df = "S.links.find(l=>l.kind==='df')";
  assert.equal(ev(`soldSlots(${df})`), 2);
  assert.match(ev(`chWhy(${df},'zr4')`), /full/, '14 lit + 2 sold fills the 16-channel system');
  assert.ok(ev("R.rev.business") > 0);
  ev(`${df}.cut=S.day+3;compute()`);
  assert.equal(ev("bizSf(S.biz.find(b=>b.type==='wwave'))"), 0);
  assert.deepEqual(errors, []);
});

test('the new offers spawn on their own during play', () => {
  const { ev, errors } = load();
  seed(ev, 21);
  network(ev);
  ev("UI.pending={a:'fra',b:'par'};UI.lmode='df';UI.dfSrc='build';UI.dfSys='roadm';ACT.orderDf();UI.lmode='wave';S.links.filter(l=>l.kind==='df').forEach(l=>l.ready=S.day)");
  const seen = new Set();
  for (let i = 0; i < 400; i++) { ev('S.offers=[];spawnOffer()'); for (const t of JSON.parse(ev("JSON.stringify(S.offers.map(o=>o.type))"))) seen.add(t); }
  for (const t of ['event', 'sdwan', 'wwave', 'dfpair']) assert.ok(seen.has(t), `${t} offers appear`);
  ev("for(const c of ['cust','up','peer','links']){selectCity('fra');ACT.tab({t:c})};ACT.leftTab({t:'deals'})");
  assert.deepEqual(errors, []);
});

test('customers on an interconnection fabric come in over your NNI port', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;S.lvl=2;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'})");
  let o = null;
  for (let i = 0; i < 400 && !o; i++) o = JSON.parse(ev("S.offers=[];spawnOffer();JSON.stringify(S.offers.find(x=>BIZ_T[x.type].nni)||null)"));
  assert.ok(o, 'fabric customers show up');
  assert.ok(ev(`FAB['${o.prov}'].cities.includes('${o.city}')`));
  assert.deepEqual(o.reqs, ['nni']);
  ev(`S.offers=[${JSON.stringify(o)}];ACT.accept({id:'${o.id}'});compute()`);
  assert.equal(ev(`reqOk(S.biz.find(b=>b.id==='${o.id}'))`), false, 'no NNI port yet');
  ev(`ACT.buyNni({city:'${o.city}',prov:'${o.prov}',tier:1});compute()`);
  assert.equal(ev(`reqOk(S.biz.find(b=>b.id==='${o.id}'))`), true, 'an NNI port with room fixes it');
  assert.ok(ev(`nniUsed('${o.city}','${o.prov}')`) >= o.bw, 'the customer uses NNI capacity');
  assert.deepEqual(errors, []);
});
