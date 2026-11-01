const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('restrictive peering checks customer traffic and shared geography on single and bulk orders', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Peering','fra',{mode:'sandbox'});S.cash=1e9;S.pops.fra.rgen=RG_TOP;S.pops.fra.routers=4;R.demTo={};R.demTo.cmi=1000");
  assert.equal(ev("peerOk('cmi','pni','fra').ok"), false, 'traffic alone does not meet a multiple-location policy');
  assert.match(ev("peerOk('cmi','pni','fra').why"), /two countries/);
  ev("ACT.pni({city:'fra',net:'cmi',tier:1});ACT.pniAll({net:'cmi',tier:1})");
  assert.equal(ev('S.pni.length'), 0);
  ev("ACT.buildPop({city:'lon'});R.demTo={};R.sessions=20");
  assert.equal(ev("peerOk('cmi','pni','fra').ok"), false, 'geography alone is not enough');
  const customer = ev("DOWN.cmi.find(id=>id!=='cmi')");
  assert.ok(customer);
  ev(`R.demTo['${customer}']=61`);
  assert.equal(ev("peerOk('cmi','pni','fra').ok"), true, 'customer-cone demand qualifies a wholesale carrier');
  ev("ACT.pni({city:'fra',net:'cmi',tier:1})");
  assert.equal(ev("S.pni.filter(p=>p.net==='cmi').length"), 1);
  assert.deepEqual(errors, []);
});

test('a Tier 2 label does not waive restrictive access-network traffic requirements', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Peering','hnl',{mode:'sandbox'});for(const c of ['fra','ams','lon','nyc'])ACT.buildPop({city:c});S.ixp={fra:1,ams:1,lon:1};R.sessions=20;R.demTo={hwt:1}");
  assert.equal(ev('isTier2()'), true);
  assert.equal(ev("peerOk('hwt','pni','hnl').ok"), false);
  assert.equal(ev("peerOk('hwt','ix','hnl').ok"), false);
  ev('R.demTo.hwt=60');
  assert.equal(ev("peerOk('hwt','pni','hnl').ok"), false, 'traffic alone cannot qualify a restrictive peer');
  assert.match(ev("peerOk('hwt','pni','hnl').why"), /two shared PoPs/);
  ev("ACT.pni({city:'hnl',net:'hwt',tier:1});ACT.pniAll({net:'hwt',tier:1})");
  assert.equal(ev("S.pni.some(p=>p.net==='hwt')"), false, 'single and bulk orders enforce the shared-site requirement');
  ev("ACT.buildPop({city:'lax'});R.demTo={hwt:60}");
  assert.equal(ev("peerOk('hwt','pni','hnl').ok"), true);
  ev('S.pops.lax.down=S.day+1');
  assert.equal(ev("peerOk('hwt','pni','hnl').ok"), false, 'a failed site does not count');
  ev('S.pops.lax.down=0;R.demTo.hwt=1');
  assert.equal(ev("peerOk('hwt','pni','hnl').ok"), false, 'the footprint does not waive the traffic threshold');
  assert.deepEqual(errors, []);
});

test('owning an exchange cannot bypass selective peering thresholds', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Peering','fra',{mode:'sandbox'});S.myIx.fra={members:['ggl','drz']};S.ixp.fra=1;R.demTo.ggl=0");
  assert.equal(ev("ixSessions('fra').has('ggl')"), false);
  assert.equal(ev("ixSessions('fra').has('drz')"), true);
  ev("ACT.peer({city:'fra',net:'ggl'});ACT.peerAll({city:'fra'})");
  assert.equal(ev("!!S.peers['ggl@fra']"), false, 'manual and bulk requests agree');
  ev('R.demTo.ggl=1000');
  assert.equal(ev("ixSessions('fra').has('ggl')"), false, 'a selective member still needs an approved session');
  ev("ACT.peer({city:'fra',net:'ggl'})");
  assert.equal(ev("ixSessions('fra').has('ggl')"), true);
  assert.deepEqual(errors, []);
});

test('every restrictive network refuses a single shared site even with enough traffic', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Peering','fra',{mode:'sandbox'});R.served=2000;R.sessions=30");
  assert.equal(ev("NETS.filter(n=>{const c=n.pops[0];if(peerPolicy(n,c)!=='restrictive')return false;S.pops={[c]:{}};R.demTo={[n.id]:1e4};return ['ix','pni'].some(v=>peerOk(n.id,v,c).ok);}).map(n=>n.id).join()"), '');
  assert.deepEqual(errors, []);
});
