const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// #265: with the route server on and an Open policy, the peering desk must not turn
// networks you already reach through the route server into bilateral sessions.
test('#265 peering desk leaves route-server networks on the route server', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;ACT.buyIx({city:'ams',tier:1});ACT.rs({city:'ams'});compute()");
  assert.equal(ev('ppol()'), 'open');
  const viaRs = JSON.parse(ev("JSON.stringify(ixMembers('ams').filter(id=>NET[id].pol==='open'&&ixSessions('ams').has(id)&&!S.peers[id+'@ams']))"));
  assert.ok(viaRs.length > 0, 'some networks are reached through the route server');
  // Every day: someone asks, at this IX, a real network, each candidate in turn, fresh PeeringDB.
  for (let i = 0; i < 60; i++) {
    ev(`(()=>{const q=[0.01,0.01,0.01,${i / 60},0.9];Math.random=()=>q.length?q.shift():0.5;})()`);
    ev(`peeringDeskDay(S.day+${i})`);
  }
  const made = JSON.parse(ev(`JSON.stringify(${JSON.stringify(viaRs)}.filter(id=>S.peers[id+'@ams']))`));
  assert.deepEqual(made, [], 'route-server networks stay "via RS"');
  const bilateral = JSON.parse(ev("JSON.stringify(Object.keys(S.peers).filter(k=>k.endsWith('@ams')))"));
  assert.ok(bilateral.length > 0, 'networks the route server does not reach still get their own sessions');
  assert.deepEqual(errors, []);
});
