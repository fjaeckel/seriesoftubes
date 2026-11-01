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
  assert.equal(need(), 'att,cog,dtk,lvl,ntt,skl,tat,tly,tng', 'new games need all nine');
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

test('#194 Doitsche sells the dearest transit in Europe and still charges for peering; Tangerine sells it cheaper', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.equal(ev("sellsAt(NET.dtk,'fra')"), true, 'Doitsche sells transit in Frankfurt');
  assert.equal(ev("NETS.filter(n=>n.id!=='dtk'&&!n.cn&&n.price&&n.pops.some(c=>CITY[c].reg==='EU')).every(n=>n.price<NET.dtk.price)"), true, 'dearer than every carrier in Europe but the Chinese ones, whose price is the crossing into China');
  assert.ok(ev("NET.tng.price") < ev("NET.dtk.price"));
  // its peering stays paid only over a PNI, and it still sells PNIs down to 1G
  assert.equal(ev("NET.dtk.pol"), 'paid');
  assert.equal(ev("peerOk('dtk','ix','fra').ok"), false);
  assert.equal(ev("peerOk('dtk','pni','fra').fee"), ev("NET.dtk.paidFee"));
  assert.equal(ev("pniMin('dtk')"), 0);
  assert.match(ev("offTransitHint('dtk','fra')"), /Paid peering only/);
  // Tangerine keeps its selective policy: enough traffic gets you a PNI, no Tier 1 club needed
  ev("R.demTo.tng=50");
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
