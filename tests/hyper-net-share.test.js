// #486: a cloud's users go to their home ISPs, so a cloud sends nothing to Goggle. The networks list said 6.1% of
// traffic anyway, next to Goggle's peering desk saying "you send 0.0": the list now shows the share the cloud sends.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('#486 a cloud sees the share of traffic it really sends to each network', () => {
  const { ev, errors } = load({ seed: 5 });
  ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e9;ACT.hsLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.hs.cc.DE.d=300;compute()");
  assert.equal(ev("R.demTo.ggl||0"), 0, 'a cloud sends Goggle nothing');
  assert.match(ev("peerOk('ggl','pni',S.home).why"), /you send 0\.0/);
  const row = (id) => ev(`(()=>{const d=document.createElement('div');d.innerHTML=netRow(NET['${id}'],netWhereIdx(),null,false);return d.textContent;})()`);
  assert.match(row('ggl'), /0\.0% of traffic/, 'the list agrees with the peering desk');
  // the ISPs its German users sit behind carry all of it
  const isp = ev("Object.entries(R.demTo).filter(x=>x[1]>0).map(x=>x[0]).sort()[0]");
  const want = ev(`(R.demTo['${isp}']/R.demand*100).toFixed(1)`);
  assert.ok(+want > 0);
  assert.match(row(isp), new RegExp(want.replace('.', '\\.') + '% of traffic'));
  assert.deepEqual(errors, []);
});

test('#486 a carrier keeps the internet-wide mix', () => {
  const { ev, errors } = load();
  ev("ACT.start({});ACT.launchBB({city:'fra'});compute()");
  const row = ev("(()=>{const d=document.createElement('div');d.innerHTML=netRow(NET.ggl,netWhereIdx(),null,false);return d.textContent;})()");
  assert.match(row, new RegExp((ev('NSH.ggl') * 100).toFixed(1).replace('.', '\\.') + '% of traffic'));
  assert.deepEqual(errors, []);
});
