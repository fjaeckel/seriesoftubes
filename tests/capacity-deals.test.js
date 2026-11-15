const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})";
// Jump to a conference's day and run just the conference part of the daily tick.
const confAt = (ev, find) => ev(`(()=>{const cf=CONFS.find(${find});const d=confDay(cf,0);S.day=d;confTick(d);return d;})()`);

test('#168 only some conferences sell sponsorships, and a sponsor gets more local customers', () => {
  const { ev, dom, errors } = load();
  ev(start);
  ev("S.day=0");
  const all = JSON.parse(ev("JSON.stringify(upcomingConfs(400).map(cf=>({k:cf.key,sp:confSp(cf),cap:!!cf.cap})))"));
  assert.ok(all.some(c => c.sp) && all.some(c => !c.sp && !c.cap), 'some can be sponsored, some cannot');
  assert.ok(all.filter(c => c.cap).every(c => !c.sp), 'capacity conferences are not sponsored');
  const no = all.find(c => !c.sp && !c.cap).k;
  ev(`S.day=0;ACT.confSponsor({key:'${no}'})`);
  assert.equal(ev(`S.confReg['${no}']||null`), null, 'cannot sponsor one that is not for sale');

  // A sponsorable European meeting.
  const sp = JSON.parse(ev("JSON.stringify((()=>{for(const cf of CONFS){if(cf.cap||CITY[cf.c].reg!=='EU')continue;const k=confKey(cf,0);if(confSp({...cf,key:k}))return {k,n:cf.n,c:cf.c};}})())"));
  ev(`S.day=confDay(CONFS.find(c=>c.n==='${sp.n}'&&c.c==='${sp.c}'),0)-20;ACT.leftTab({t:'deals'});ACT.dealsFold({k:'conf',o:1})`);
  assert.match(dom.window.document.body.innerHTML, /Sponsor \$/);
  const cash = ev('S.cash');
  ev(`ACT.confGo({key:'${sp.k}'});ACT.confSponsor({key:'${sp.k}'})`);
  assert.equal(cash - ev('S.cash'), ev('CONF_SP'), 'registering then upgrading costs the sponsorship in total');
  assert.equal(ev(`S.confReg['${sp.k}']`), 'sp');
  confAt(ev, `c=>c.n==='${sp.n}'&&c.c==='${sp.c}'`);
  assert.ok(ev('confSpOn()'), 'the sponsored glow is on');
  ev("ACT.buildPop({city:'nyc'});ACT.buildPop({city:'ams'})");
  ev('Math.random=()=>0.1');
  assert.deepEqual(JSON.parse(ev("JSON.stringify(spMine(['fra','nyc','ams']))")), ['fra', 'ams'], 'offers lean to the sponsored region');
  ev('S.conf.until=S.day');
  assert.deepEqual(JSON.parse(ev("JSON.stringify(spMine(['fra','nyc','ams']))")), ['fra', 'nyc', 'ams'], 'and stop when the glow ends');
  assert.deepEqual(errors, []);
});

test('#168 a capacity conference brings big deals you can sign before you build', () => {
  const { ev, dom, errors } = load();
  ev(start);
  const key = ev("confKey(CONFS.find(c=>c.n==='Capacity Europe'),0)");
  ev("S.day=confDay(CONFS.find(c=>c.n==='Capacity Europe'),0)-20;S.lvl=1");
  ev(`ACT.confGo({key:'${key}'})`);
  assert.equal(ev(`S.confReg['${key}']||null`), null, 'needs customer level 3');
  ev(`S.lvl=3;ACT.confGo({key:'${key}'})`);
  assert.equal(ev(`S.confReg['${key}']`), true);
  const d = confAt(ev, "c=>c.n==='Capacity Europe'");
  assert.ok(ev('S.capDeal&&S.capDeal.at') > d);
  ev('S.offers=[];S.day=S.capDeal.at;capDealTick(S.day)');
  const offers = JSON.parse(ev("JSON.stringify(S.offers)"));
  assert.ok(offers.length >= 2, 'several carriers call');
  assert.ok(offers.every(o => ev(`!!BIZ_T['${o.type}'].cap`) && o.win >= 180), 'long delivery windows');
  ev("ACT.leftTab({t:'deals'});renderAll()");
  assert.match(dom.window.document.body.innerHTML, /deliver within \d+ days of signing/);

  // Sign one with no POPs on the route yet: it waits and pays nothing.
  ev("S.offers=[capOffer('chi','ash','capfib',()=>'Test Fiber Co.')];window.__o=S.offers[0].id;ACT.accept({id:__o})");
  assert.ok(ev("S.biz.some(b=>b.id===__o&&capPend(b))"), 'signed and pending');
  // Even with the fiber in place, a deal pays nothing until it is handed over.
  ev("S.biz.find(b=>b.id===__o).link='tmp';S.links.push({id:'tmp',a:'chi',b:'ash',kind:'df',own:true,km:950,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0});compute()");
  const rev = ev('R.revMo');
  ev("S.biz.find(b=>b.id===__o).live=true;compute()");
  assert.ok(ev('R.revMo') > rev, 'it only pays once live');
  ev("const b=S.biz.find(b=>b.id===__o);b.live=false;delete b.link;S.links=S.links.filter(l=>l.id!=='tmp');compute()");
  ev("ACT.custOpen({});renderAll()");
  assert.match(dom.window.document.body.innerHTML, /Build your own fiber between Chicago and/);

  // Build the fiber and it is handed over.
  ev("S.links.push({id:'own1',a:'ash',b:'chi',kind:'df',own:true,km:950,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0});dayTick()");
  assert.ok(ev("S.biz.find(b=>b.id===__o).live"), 'delivered on the next day');
  assert.equal(ev("S.biz.find(b=>b.id===__o).link"), 'own1');
  assert.equal(ev("pairFree(S.links.find(l=>l.id==='own1'))"), false, 'the trench is sold');
  assert.equal(ev("pairFree(S.links.find(l=>l.id==='own1'),fiberUse())"), false, 'also with the per-day lookups');
  assert.equal(ev("fiberOk(S.biz.find(b=>b.id===__o),linkIds())"), true);
  assert.deepEqual(errors, []);
});

test('#168 missing the delivery date costs a penalty and the deal', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.offers=[capOffer('bde','nyc','capsub',()=>'Late Cable Co.')];window.__o=S.offers[0].id;ACT.accept({id:__o})");
  ev("const b=S.biz.find(x=>x.id===__o);window.__pen=Math.round(bizMo(b)*CAP_PEN);S.day=b.due-1;window.__c=S.cash");
  ev("capPendTick(S.biz.find(x=>x.id===__o),S.day+1)");
  assert.equal(ev("S.biz.some(b=>b.id===__o)"), false, 'the carrier walks away');
  assert.equal(ev('__c-S.cash'), ev('__pen'));
  assert.deepEqual(errors, []);
});

test('#168 saves keep sponsorships and pending deals, and old saves still load', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.offers=[capOffer('lon','fra','capw',()=>'Wave Co.')];window.__o=S.offers[0].id;ACT.accept({id:__o})");
  ev("S.confReg={'RIPE@ams@0':'sp','NANOG@chi@0':true,'x':'junk'};S.conf={until:S.day+5,reg:'EU',name:'RIPE',sp:true};S.capDeal={at:S.day+3,c:'lon'}");
  ev("window.__t=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("__t.confReg['RIPE@ams@0']"), 'sp');
  assert.equal(ev("__t.confReg['x']"), true);
  assert.equal(ev('__t.conf.sp'), true);
  assert.equal(ev('__t.capDeal.c'), 'lon');
  assert.ok(ev("__t.biz.some(b=>b.id===__o&&b.due>0&&!b.live)"), 'the pending deal survives');
  ev("const s=JSON.parse(JSON.stringify(S));delete s.capDeal;delete s.conf;s.capDeal={at:'x',c:'nowhere'};window.__t=migrate(s)");
  assert.equal(ev('__t.capDeal'), null, 'bad data is dropped');
  ev("const s=JSON.parse(JSON.stringify(S));delete s.capDeal;s.biz=s.biz.filter(b=>!BIZ_T[b.type].cap);window.__t=migrate(s)");
  assert.equal(ev('__t.capDeal'), null, 'an old save gets the default');
  assert.deepEqual(errors, []);
});
