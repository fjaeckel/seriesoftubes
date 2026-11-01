// #194: Doitsche Telekomm and Tangerine Telecom are Tier 1s, as in real life. They count for the Tier 1 goal
// in games started after the change; older saves keep the Tier 1s they were playing for.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#194 Doitsche Telekomm and Tangerine Telecom are Tier 1s', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.equal(ev("NET.dtk.type"), 't1');
  assert.equal(ev("NET.tng.type"), 't1');
  assert.equal(ev("TYPE_L[NET.dtk.type]"), 'Tier 1');
  assert.deepEqual(errors, []);
});

test('#194 new games need both for Tier 1, old saves keep their set', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  const need = () => ev("t1Need().map(n=>n.id).sort().join()");
  assert.equal(need(), 'att,cog,drz,dtk,gtt,lvl,ntt,pcw,skl,tat,tlx,tly,tng,ups,vzn,zay', 'new games need the researched Tier 1 club');
  ev("S.t1v=4");
  assert.equal(need(), 'att,cog,dtk,lvl,ntt,skl,tat,tly,tng', 'operator-update saves keep nine');
  ev("S.t1v=3");
  assert.equal(need(), 'att,cog,lvl,ntt,skl,tat,tly', 'saves from 1.x and 2.x keep seven');
  ev("S.t1v=4;const o=JSON.parse(JSON.stringify(S));S=migrate(o)");
  assert.equal(ev("S.t1v"), 4, 'the version survives a save');
  ev("delete S.t1v");
  assert.equal(ev("t1Need().length"), 5, 'the oldest saves keep five');
  assert.deepEqual(errors, []);
});

test('#194 the Road to Tier 1 names them when the PNIs are missing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;delete S.done.t1;ACT.launchBB({city:'fra'})");
  ev("S.transit=[];S.pni=[];for(const n of t1Need())if(n.id!=='dtk'&&n.id!=='tng')S.pni.push({id:'p'+n.id,net:n.id,city:'fra',tier:2});compute()");
  assert.equal(ev("isTier1()"), false);
  assert.match(ev("t1Why()"), /Doitsche Telekomm/);
  assert.match(ev("t1Why()"), /Tangerine Telecom/);
  assert.deepEqual(errors, []);
});

test('#194 Doitsche sells premium transit below Very-Zone and AT&Tease and still charges for peering', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.equal(ev("sellsAt(NET.dtk,'fra')"), true, 'Doitsche sells transit in Frankfurt');
  assert.equal(ev("NETS.filter(n=>!['dtk','vzn','att'].includes(n.id)&&n.type==='t1'&&n.price).every(n=>n.price<NET.dtk.price)"), true, 'above the competitive and premium wholesale bands');
  assert.ok(ev("NET.tng.price") < ev("NET.dtk.price"));
  assert.ok(ev("NET.dtk.price<NET.vzn.price&&NET.vzn.price<NET.att.price"));
  // its peering stays paid only over a PNI, and it still sells PNIs down to 1G
  assert.equal(ev("NET.dtk.pol"), 'paid');
  assert.equal(ev("peerOk('dtk','ix','fra').ok"), false);
  assert.equal(ev("peerOk('dtk','pni','fra').fee"), ev("NET.dtk.paidFee"));
  assert.equal(ev("pniMin('dtk')"), 0);
  assert.match(ev("offTransitHint('dtk','fra')"), /Paid peering only/);
  // Tangerine's published restrictive policy requires the global peering footprint too.
  ev("R.demTo.tng=50");
  assert.equal(ev("peerOk('tng','pni','par').ok"), false);
  ev("S.cash=1e9;for(const c of ['ams','ash','lon','nyc','par','sin','tok','syd','sjc'])ACT.buildPop({city:c});R.served=1600;R.sessions=20");
  assert.equal(ev("peerOk('tng','pni','par').ok"), true);
  assert.deepEqual(errors, []);
});

test('#194 the network list shows them as Tier 1 on a phone', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  dom.window.innerWidth = 360;
  ev("UI.sel={type:'city',id:'fra'};UI.tab='up';renderAll()");
  const html = dom.window.document.getElementById('panel').innerHTML;
  assert.match(html, /Doitsche Telekomm <span class="tag t1">Tier 1</, 'Doitsche sells transit in Frankfurt, tagged Tier 1');
  assert.deepEqual(errors, []);
});
