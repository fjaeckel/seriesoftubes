const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('large domestic access networks require traffic before IX requests or private orders', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Peering','nyc',{mode:'sandbox'});S.cash=1e9;S.pops.nyc.rgen=RG_TOP;S.pops.nyc.routers=4;S.ixp.nyc=1;S.rs.nyc=true;R.demTo={cmc:1}");
  assert.equal(ev("ixMembers('nyc').includes('cmc')"), true, 'presence does not imply an agreement');
  assert.equal(ev("ixSessions('nyc').has('cmc')"), false);
  assert.equal(ev("peerOk('cmc','ix','nyc').ok"), false);
  assert.equal(ev("peerOk('cmc','pni','nyc').ok"), false);
  assert.equal(ev("utilityPeers().find(x=>x.ix==='nyc').blocked.some(x=>x.id==='cmc')"), true);
  ev("ACT.peer({city:'nyc',net:'cmc'});ACT.pni({city:'nyc',net:'cmc',tier:1});ACT.pniAll({net:'cmc',tier:1})");
  assert.equal(ev("!!S.peers['cmc@nyc']"), false);
  assert.equal(ev("S.pni.some(p=>p.net==='cmc')"), false);
  ev("R.demTo.cmc=peerNeed(NET.cmc,'ix');ACT.peer({city:'nyc',net:'cmc'})");
  assert.equal(ev("ixSessions('nyc').has('cmc')"), true);
  ev("R.demTo.cmc=peerNeed(NET.cmc,'pni');ACT.pni({city:'nyc',net:'cmc',tier:1})");
  assert.equal(ev("S.pni.filter(p=>p.net==='cmc').length"), 1);
  assert.deepEqual(errors, []);
});

test('published open IX policy and private volume requirements remain distinct', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Peering','han',{mode:'sandbox'});S.ixp.han=1;S.rs.han=true;R.demTo={fpt:1}");
  assert.equal(ev("NET.fpt.pol"), 'open');
  assert.equal(ev("ixSessions('han').has('fpt')"), true);
  assert.equal(ev("peerOk('fpt','pni','han').ok"), false);
  ev('R.demTo.fpt=PNI_NEED.fpt');
  assert.equal(ev("peerOk('fpt','pni','han').ok"), true);
  ev('R.demTo={snc:0,htc:0}');
  for (const id of ['snc', 'htc']) {
    assert.equal(ev(`NET.${id}.pol`), 'open');
    assert.equal(ev(`peerOk('${id}','pni',NET.${id}.pops[0]).ok`), true, 'smaller providers accept low-volume PNIs');
  }
  assert.deepEqual(errors, []);
});

test('route-server opt-outs require a bilateral request even on a player exchange', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Peering','pnh',{mode:'sandbox'});S.ixp.pnh=1;S.rs.pnh=true;R.demTo={}");
  assert.equal(ev("ixMembers('pnh').includes('mtf')"), true);
  assert.equal(ev("ixSessions('pnh').has('mtf')"), false);
  ev("S.myIx.pnh={members:['mtf']}");
  assert.equal(ev("ixSessions('pnh').has('mtf')"), false);
  ev("ACT.peer({city:'pnh',net:'mtf'})");
  assert.equal(ev("ixSessions('pnh').has('mtf')"), true, 'an open bilateral peer does not require a route-server session');
  assert.deepEqual(errors, []);
});

test('restrictive incumbents can be physically present without offering public peering', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Peering','tor',{mode:'sandbox'});S.ixp.tor=1;S.rs.tor=true;R.demTo={bcd:1e4}");
  assert.equal(ev("NET.bcd.pol"), 'restrictive');
  assert.equal(ev("ixMembers('tor').includes('bcd')"), true);
  ev("ACT.peerAll({city:'tor'})");
  assert.equal(ev("ixSessions('tor').has('bcd')"), false);
  assert.equal(ev("peerOk('bcd','pni','tor').ok"), false, 'traffic alone does not meet its US footprint requirement');
  ev("S.cash=1e9;for(const c of ['ash','nyc'])ACT.buildPop({city:c});R.demTo.bcd=1e4");
  assert.equal(ev("peerOk('bcd','pni','tor').ok"), true);
  ev("S.pni=[{id:'legacy',city:'tor',net:'bcd',tier:1}];S.peers['bcd@tor']=true;S=migrate(JSON.parse(JSON.stringify(packSave(S))));compute()");
  assert.equal(ev("S.pni.some(p=>p.id==='legacy')"), true, 'existing contracts survive policy changes');
  assert.equal(ev("ixSessions('tor').has('bcd')"), true, 'an existing agreement survives new-order thresholds');
  assert.deepEqual(errors, []);
});
