// The Philippines: Manila's exchanges and networks, Cebu, Davao and the cables that really land there.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./harness');

function start(ev) { ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0"); }
const ids = (ev, js) => JSON.parse(ev(`JSON.stringify(${js})`));

test('Manila: GotchaFIX, Bayanihan-IX and the incumbent-run In-Vitro-IX', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev('CITY.mnl.ix'), 'GotchaFIX Manila');
  assert.equal(ev("XIXM['mnl~2'].name"), 'Bayanihan-IX');
  assert.equal(ev("XIXM['mnl~3'].name"), 'In-Vitro-IX');
  // the neutral exchange has the open networks, not the PLDT family
  const gotcha = ids(ev, "ixMembers('mnl')");
  for (const n of ['glb', 'cvg', 'dto']) assert.ok(gotcha.includes(n), `${n} on GotchaFIX`);
  assert.ok(!gotcha.includes('pld') && !gotcha.includes('smt'));
  assert.ok(gotcha.length >= 10, `GotchaFIX has ${gotcha.length} members`);
  // the incumbent's own exchange is PLDT and its mobile arm
  const vitro = ids(ev, "ixMembers('mnl~3')");
  assert.ok(vitro.includes('pld') && vitro.includes('smt'));
  assert.ok(ids(ev, "ixMembers('mnl~2')").includes('dto'));
  // the community exchange is the cheapest port in town, the incumbent's the dearest
  assert.ok(ev("ixMul('mnl~2')<ixMul('mnl')&&ixMul('mnl')<ixMul('mnl~3')"));
  assert.deepEqual(errors, []);
});

test('Manila: PLDTea Time and Snow Globe sell transit; a PLDT PNI also reaches Smarty Pants', () => {
  const { ev, errors } = load();
  start(ev);
  assert.ok(ev("sellsAt(NET.pld,'mnl')&&sellsAt(NET.glb,'mnl')"));
  assert.ok(ev("!sellsAt(NET.cvg,'mnl')&&!sellsAt(NET.dto,'mnl')&&!sellsAt(NET.smt,'mnl')"));
  assert.deepEqual(ids(ev, 'PNI_NETS.pld').sort(), ['pld', 'smt']);
  assert.equal(ev('NET.pld.pol'), 'selective');
  assert.equal(ev('NET.glb.pol') + ev('NET.cvg.pol') + ev('NET.dto.pol'), 'openopenopen');
  assert.deepEqual(errors, []);
});

test('Manila: an exchange the player founded there before GotchaFIX existed keeps working', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buildPop({city:'mnl'});S.myIx.mnl={name:'Mine-IX Manila',members:['dto','tail0'],next:0};S.ixp.mnl=2");
  ev('const o=JSON.parse(JSON.stringify(S));sanitize(o);window.__o=o');
  assert.equal(ev('__o.myIx.mnl.name'), 'Mine-IX Manila');
  ev('S=__o;after()');
  assert.equal(ev("ixName('mnl')"), 'Mine-IX Manila');
  assert.deepEqual(ids(ev, "ixMembers('mnl')"), ['dto', 'tail0']);
  // and nobody can found a second one now that a real exchange runs in Manila
  ev("delete S.myIx.mnl;delete S.ixp.mnl;ACT.foundIx({city:'mnl'})");
  assert.ok(ev('!S.myIx.mnl'));
  assert.deepEqual(errors, []);
});
