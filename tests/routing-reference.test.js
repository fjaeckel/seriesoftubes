const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const referenceAllocation = require('./helpers/reference-allocation');

function network(ev) {
  ev(`ACT.start({});S.cash=1e10;S.lvl=4;S.day=500;S.biz=[];S.links=[];S.pops={};S.pni=[];S.caches=[];S.transit=[];S.ixp={};
    const cities=['fra','ams','lon','par','nyc','ash','sin','hkg','mos','pek'];
    for(const c of cities){S.pops[c]={routers:6,rgen:3,gen:true,bb:{d:700},down:0};
      for(const n of NETS.filter(n=>!n.tail).slice(0,35))S.pni.push({id:n.id+'@'+c,city:c,net:n.id,tier:0});
      for(const n of NETS.filter(n=>n.cache).slice(0,3))S.caches.push({id:'cache-'+n.id+'@'+c,net:n.id,city:c});
    }
    for(let i=0;i<cities.length;i++){
      S.links.push({id:'df'+i,a:cities[i],b:cities[(i+1)%cities.length],kind:'df',own:true,sys:'roadm',ch:Array(32).fill('tp16'),km:800,ready:0,cut:0,mo:100});
      S.links.push({id:'w'+i,a:cities[i],b:cities[(i+2)%cities.length],kind:'wave',tier:2,km:1200,cut:0,mo:100});
      S.transit.push({id:'transit'+i,net:'cog',city:cities[i],tier:1,down:0});
      S.biz.push({id:'l2-'+i,name:'Circuit '+i,city:cities[i],city2:cities[(i+4)%cities.length],type:'l2vpn',bw:50,rate:100,reqs:['diverse'],route:i%3===0?'scenic':i%3===1?'fast':'normal'});
    }
    compute();`);
  // Share the model and path sender, but replace indexed exit selection with
  // the original full scan and stable sort for every flow.
  const source = ev('compute.toString()');
  const start = source.indexOf('  for(const pass of PASSES||[null])for(const rank of RANKS){');
  const end = source.indexOf('  for(const i of NORD)', start);
  assert.ok(start >= 0 && end > start, 'allocation loop boundaries must exist');
  ev(`window.referenceCompute=eval('('+${JSON.stringify(source.slice(0,start)+referenceAllocation+source.slice(end))}+')')`);
}

test('indexed routing matches the simple allocation loop across network changes', () => {
  const { ev, dom, errors } = load();
  try {
    network(ev);
    const changes = [
      '',
      "S.pni.forEach((p,i)=>p.pref=i%3===0?'high':i%3===1?'low':'normal')",
      "S.te={on:true,script:''}",
      "S.te.script='prefer pni for goggle\\nspill at 80%\\navoid transit for netchill'",
      "S.te.script='prefer transit Cogentle\\nprepend transit Cogentle 2\\nprotect customers'",
      "S.ev.rpki={nets:['ggl','nfx'],until:S.day+3};S.ev.depeer=S.day+3",
      "S.ev.ddos={city:'fra',until:S.day+3,gbps:300,vec:'syn',entry:{k:'edge'}}",
      "S.links[0].eqDown=S.day+2;S.links[1].cut=S.day+2;S.links[2].loss={until:S.day+2,f:0.5}",
      "S.links[4].chFail={until:S.day+2,o:'tp16'};S.links[6].ch.push('zr4');S.links[8].regen=2",
      "S.day+=4;S.pni.splice(0,20);S.caches.splice(0,10);S.transit[0].pref='high'",
    ];
    for (const change of changes) {
      ev(change);
      if (change.startsWith("S.te.script=")) assert.ok(ev("teRules()"), "RouteScript scenario must be active");
      // Both implementations receive exactly the same prior load (scenic routing).
      ev('window.priorR=JSON.stringify(R);referenceCompute();window.expectedR=JSON.stringify(R);R=JSON.parse(priorR);compute()');
      assert.deepEqual(JSON.parse(ev('JSON.stringify(R)')), JSON.parse(ev('expectedR')), change || 'baseline');
    }
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

