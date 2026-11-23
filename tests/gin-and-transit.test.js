// Gin & Transit (AS3257) is a Tier 1 that sold its fiber and kept transit and DDoS protection, as its real namesake
// did in 2021. So it sells transit and a cheaper clean pipe, no longer wavelengths; the waves went to EXAggerated
// Infrastructure. It counts for the Tier 1 goal in games started after the change; older saves keep their set.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('Gin & Transit is a Tier 1 with its real ASN, in Frankfurt like every Tier 1', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.equal(ev("NET.gnt.type"), 't1');
  assert.equal(ev("NET.gnt.asn"), 3257);
  assert.equal(ev("sellsAt(NET.gnt,'fra')"), true);
  assert.equal(ev("NET.gnt.pops.includes('nyc')&&NET.gnt.pops.includes('lon')"), true, 'Europe and North America first');
  assert.deepEqual(errors, []);
});

test('new games need Gin & Transit for Tier 1; saves from before keep their nine', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.equal(ev("S.t1v"), 5);
  assert.equal(ev("t1Need().some(n=>n.id==='gnt')"), true);
  ev("S.t1v=4;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("S.t1v"), 4, 'an older save keeps its version through a load');
  assert.equal(ev("t1Need().some(n=>n.id==='gnt')"), false);
  assert.equal(ev("t1Need().length"), 9);
  assert.deepEqual(errors, []);
});

test('the Road to Tier 1 names Gin & Transit when its PNI is missing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;delete S.done.t1;ACT.launchBB({city:'fra'})");
  ev("S.transit=[];S.pni=[];for(const n of t1Need())if(n.id!=='gnt')S.pni.push({id:'p'+n.id,net:n.id,city:'fra',tier:2});compute()");
  assert.equal(ev("isTier1()"), false);
  assert.match(ev("t1Why()"), /Gin &amp; Transit/, 'escaped HTML');
  ev("S.pni.push({id:'pgnt',net:'gnt',city:'fra',tier:2});compute()");
  assert.doesNotMatch(ev("t1Why()"), /Gin &amp; Transit/, 'with the PNI, it is no longer what is missing');
  assert.deepEqual(errors, []);
});

test('Gin & Transit sells transit and a clean pipe at half the usual price', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;ACT.launchBB({city:'fra'});S.transit=[]");
  ev("ACT.buyTransit({city:'fra',net:'gnt',tier:1});ACT.buyTransit({city:'fra',net:'lvl',tier:1})");
  const id = (n) => ev(`S.transit.find(t=>t.net==='${n}').id`);
  assert.ok(id('gnt') && id('lvl'), 'both transits bought');
  ev(`ACT.cleanPipe({id:'${id('gnt')}'});ACT.cleanPipe({id:'${id('lvl')}'})`);
  assert.equal(ev("S.transit.every(t=>t.clean)"), true);
  const mo = (n) => ev(`cleanMo(S.transit.find(t=>t.net==='${n}'))`);
  assert.equal(mo('gnt') * 2, mo('lvl'));
  assert.deepEqual(errors, []);
});

test('Gin & Transit no longer sells wavelengths; EXAggerated Infrastructure does', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.equal(ev("WAVECO.some(n=>/Gin|G&T/.test(n))||BIZ_T.wwave.names.some(n=>/Gin|G&T/.test(n))"), false);
  assert.equal(ev("WAVECO.includes('EXAggerated Infrastructure')&&BIZ_T.wwave.names.includes('EXAggerated Infrastructure')"), true);
  assert.deepEqual(errors, []);
});
