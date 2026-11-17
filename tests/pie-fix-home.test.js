// Pie Control's Bottlenecks tab: customers that go short because their country wants its data kept home (the Data stays
// home spat) are told so, with a dish to build in that country, not that no dish nearby has room.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('a Data stays home spat is named in Bottlenecks, with a dish in that country to build', t => {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;S.offers=[];S.biz=[]");
  ev("for(const c of ['lon','par'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'lp',a:'lon',b:'par',kind:'wave',tier:3,km:344,sub:true,cut:0,mo:1});for(const c of ['lon','par'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();ACT.pieDish({city:'lon'});S.pie.lic.GB={state:'ok',until:1e6};S.pie.dishes[0].ant=4;"
    + "S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];"
    + "S.biz.push({id:'p',type:'pizza',city:'par',name:'p',bw:20,rate:1000,mood:100,since:0,reqs:[]});compute()");
  assert.equal(ev("R.pie.gs.p"), 'lon', 'without the spat it lands in London');
  ev("S.pie.spat.home={st:'on',cc:'FR',until:S.day+30};compute()");
  assert.equal(ev("R.pie.sf.p||0"), 0, 'with it, nowhere');
  const fx = JSON.parse(ev("JSON.stringify(pieFixList(R.pie).map(x=>({k:x.k,c:x.c,t:x.t,b:x.b})))"));
  assert.equal(fx.length, 1);
  assert.equal(fx[0].k, 'home');
  assert.equal(fx[0].c, 'par');
  assert.match(fx[0].t, /France/);
  assert.match(fx[0].b, /data-act="pieDish"[^>]*par/);
  assert.match(ev("pieShortWhy(S.biz[0])"), /France/);
  assert.deepEqual(errors, []);
});
