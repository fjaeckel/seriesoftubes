const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const start = (ev, mods = []) => ev(`beginGame('Mode Testers','fra',${lit({mode:'normal',preset:'oncall',rules:{mods}})});if(UI.pendGame)ACT.pitchSkip()`);

test('additional modes survive saves, reject unknown ids, and stay off in other modes', () => {
  const { ev, errors } = load();
  start(ev, ['pioneer','outcast','autarky']);
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), ['pioneer','outcast','autarky']);
  assert.equal(ev("modeOn('pioneer')"), true);
  ev("S.rules.mods=['pioneer','unknown'];sanitize(S)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), ['pioneer']);
  ev("beginGame('Sandbox','fra',{mode:'sandbox'})");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.rules.mods)')), []);
  assert.equal(ev("modeOn('pioneer')"), false);
  ev("beginGame('Scenario','stg',{scn:SCN.find(x=>x.id==='stg')})");
  assert.equal(ev("modeOn('pioneer')"), false);
  assert.deepEqual(errors, []);
});

test('Pioneer filters built-in Tier 1 traffic and scales broadband pay by reach', () => {
  const { ev, errors } = load();
  start(ev, ['pioneer']);
  ev("S.cash=1e12;ACT.launchBB({city:'fra'});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  const removed = JSON.parse(ev("JSON.stringify(NETS.filter(n=>!n.fed&&n.type==='t1').map(n=>n.id))"));
  assert.ok(removed.length > 0);
  assert.equal(ev('t1Need().length'), 0);
  assert.equal(ev("S.transit.length"), 0);
  assert.ok(ev('R.reach') > 0, 'local peering still reaches part of the filtered internet');
  assert.deepEqual(JSON.parse(ev(`JSON.stringify(${JSON.stringify(removed)}.map(id=>[id,gameShares(NSH)[id]||0,R.reachable[id]]))`)), removed.map(id=>[id,0,false]));
  const tier2 = ev("NETS.find(n=>n.type==='t2'&&!n.fed).id");
  assert.equal(ev(`gameNetAllowed(NET['${tier2}'])`), true);
  assert.ok(ev(`gameShares(NSH)['${tier2}']`) > 0, 'Tier 2 traffic remains in the normalized shares');
  assert.ok(Math.abs(ev('Object.values(gameShares(NSH)).reduce((a,b)=>a+b,0)')-1)<1e-9, 'the remaining shares still sum to one');
  const expected = ev("Object.keys(S.pops).reduce((a,c)=>a+R.cityEye[c]*sfOf(R,c)*EYE_RATE*arpuOf(c),0)*R.reach");
  assert.ok(Math.abs(ev('R.rev.eyeballs')-expected)<1e-6);
  const tier1 = ev("NETS.find(n=>n.type==='t1'&&n.pops.includes('fra')).id");
  assert.equal(ev(`pniQuote('fra','${tier1}',1)`), null);
  assert.equal(ev(`peerOk('${tier1}','ix','fra').ok`), false);
  assert.deepEqual(errors, []);
});

test('Pioneer hides removed Tier 1s from the Networks tab', () => {
  const { ev, errors } = load();
  start(ev, ['pioneer']);
  const id = ev("NETS.find(n=>n.type==='t1'&&!n.fed).id");
  const name = ev(`NET['${id}'].name`);
  assert.equal(ev(`(UI.netFocus='${id}',netsTab()).includes(${JSON.stringify(name)})`), false);
  assert.deepEqual(errors, []);
});

test('Outcast blocks built-in IX ports but leaves own IXes and PNIs available', () => {
  const { ev, errors } = load();
  start(ev, ['outcast']);
  ev("S.cash=1e12;ACT.buyIx({city:'fra',tier:1,signed:true})");
  assert.equal(ev("S.ixp.fra"), undefined);
  const city = ev("CITIES.find(c=>!c.ix&&!c.cn&&!c.off).id");
  ev(`S.lvl=LEVELS.length;ACT.buildPop({city:'${city}'});ACT.foundIx({city:'${city}'})`);
  assert.equal(ev(`!!S.myIx['${city}']`), true);
  ev("window.__pni=NETS.filter(n=>!n.fed&&n.pol==='open'&&n.pops.includes('fra')).map(n=>pniQuote('fra',n.id,1)).find(q=>q&&!q.why);if(window.__pni)ACT.pni({city:'fra',net:window.__pni.net,tier:1})");
  assert.ok(ev('window.__pni'));
  assert.equal(ev("S.pni.some(p=>p.net===window.__pni.net&&p.city==='fra')"), true);
  assert.deepEqual(errors, []);
});

test('Autarky blocks leased waves and allows IRUs plus owned fiber builds', () => {
  const { ev, dom, errors } = load();
  start(ev, ['autarky']);
  ev("S.cash=1e12;S.lvl=LEVELS.length;UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});openLinkModal('fra','ams')");
  assert.equal(ev("S.links.some(l=>l.kind==='wave')"), false);
  assert.equal(dom.window.document.querySelectorAll('#modal [data-act="buildLink"]').length, 0);
  assert.equal(dom.window.document.querySelectorAll('#modal [data-act="dfMode"]').length, 1);
  ev("UI.dfSrc='lease';UI.dfSys='lite';ACT.orderDf();UI.pending={a:'fra',b:'ams'};UI.dfSrc='build';ACT.orderDf()");
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&!l.own)"), true);
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&l.own&&!l.sub)"), true);
  ev("S.won=true;ACT.buildPop({city:'bue'});UI.pending={a:'bue',b:'scl'};UI.seaDesign='standard';ACT.orderCable()");
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&l.own&&l.sub)"), true);
  ev("S.links.push({id:'old-wave',kind:'wave',tier:0,km:100});ACT.upLink({id:'old-wave',tier:1})");
  assert.equal(ev("S.links.find(l=>l.id==='old-wave').tier"), 0);
  ev("ACT.buildPop({city:'ams'});S.links.push({id:'fed-wave',kind:'wave',fwv:'deal',a:'fra',b:'ams',tier:0,km:100,sub:false,mult:1,cable:null});ACT.upLink({id:'fed-wave',tier:1})");
  assert.equal(ev("S.links.find(l=>l.id==='fed-wave').tier"), 1, 'federation-owned links retain their prior action behavior');
  assert.deepEqual(errors, []);
});