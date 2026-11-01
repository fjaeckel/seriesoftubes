const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('domestic carriers do not gain foreign PNIs from remote exchange membership', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Footprints','tor',{mode:'sandbox'});S.cash=1e9;S.pops.tor.rgen=RG_TOP;R.demTo={tsf:1e4,swc:1e4,idn:1e4}");
  for (const id of ['tsf', 'swc', 'idn']) {
    assert.equal(ev(`NET.${id}.pops.includes('tor')`), false, id);
    assert.equal(ev(`ixIdsIn('tor').some(x=>ixMembers(x).includes('${id}'))`), false, id);
    ev(`ACT.pni({city:'tor',net:'${id}',tier:1});ACT.pniAll({net:'${id}',tier:1})`);
    assert.equal(ev(`S.pni.some(p=>p.net==='${id}')`), false);
  }
  assert.equal(ev("NET.tsf.pops.includes('lax')"), true, 'the Pacific gateway remains');
  assert.equal(ev("NET.swc.pops.includes('zrh')&&NET.swc.pops.includes('fra')"), true);
  assert.equal(ev("NET.atl.pops.includes('fra')&&NET.liq.pops.includes('lon')"), true, 'major regional carriers retain supported international reach');
  assert.deepEqual(errors, []);
});

test('an existing foreign PNI stays visible and upgradeable after footprint calibration', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Footprints','tor',{mode:'sandbox'});S.cash=1e9;S.pops.tor.rgen=RG_TOP;S.pni.push({id:'old',net:'tsf',city:'tor',tier:0});S=migrate(JSON.parse(JSON.stringify(packSave(S))));compute();selectCity('tor');ACT.tab({t:'peer'})");
  assert.match(dom.window.document.getElementById('panelBody').textContent, /Telkom-selfie/);
  assert.equal(ev("pniBatch('tsf',1).orders.some(q=>q.ex.id==='old')"), true);
  ev("ACT.pni({city:'tor',net:'tsf',tier:1})");
  assert.equal(ev("S.pni.find(p=>p.id==='old').up.tier"), 1);
  assert.deepEqual(errors, []);
});

test('APAC gateways use selective bilateral policies while home restrictions and geography still apply', t => {
  const { ev, dom, errors } = load(); t.after(() => dom.window.close());
  ev("beginGame('Gateways','lax',{mode:'sandbox'});S.cash=1e9;S.pops.lax.rgen=RG_TOP;S.ixp.lax=1;S.rs.lax=true;R.demTo={ctc:1e4,tsf:1e4}");
  assert.equal(ev("peerOk('ctc','ix','sha').ok"), false, 'domestic public peering remains restricted');
  assert.equal(ev("peerPolicy(NET.ctc,'lax')"), 'selective');
  assert.equal(ev("ixMembers('lax').includes('ctc')"), true, 'Any2West is represented in Los Angeles');
  assert.equal(ev("ixSessions('lax').has('ctc')"), false, 'an IX port still grants no automatic session');
  ev("ACT.peer({city:'lax',net:'ctc'})");
  assert.equal(ev("ixSessions('lax').has('ctc')"), true);
  assert.equal(ev("peerOk('tsf','ix','lax').ok"), false, 'a required international footprint is still enforced');
  ev("ACT.buildPop({city:'sin'});R.demTo.tsf=1e4");
  assert.equal(ev("peerOk('tsf','ix','lax').ok"), true);
  assert.equal(ev("peerPolicy(NET.cmi,'fra')"), 'selective', 'CMI publishes a wider exception outside Asia');
  assert.equal(ev("peerPolicy(NET.cmi,'sin')"), 'restrictive');
  assert.equal(ev("peerPolicy(NET.ktt,'sjc')"), 'paid', 'the separate sender-pays rules stay intact');
  ev("R.demTo={};ACT.buildPop({city:'sjc'});R.demTo={cht:1e4}");
  assert.equal(ev("peerOk('cht','ix','lax').ok"), true, 'HiNet requires two US locations');
  assert.deepEqual(errors, []);
});
