// More American eyeballs and a merger or two (#155), more Australian eyeballs (#154).
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./harness');

function start(ev) { ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})"); }

test('American eyeballs follow PeeringDB, and the ones with upstreams are reached through their Tier 1s (#155)', () => {
  const { ev, errors } = load();
  start(ev);
  const asn = { att: 7018, tmo: 21928, cxc: 22773, pes: 6128, ftr: 5650, gfb: 16591, snc: 46375 };
  for (const [id, a] of Object.entries(asn)) assert.equal(ev(`NET.${id}.asn`), a, id);
  assert.equal(ev('NET.att.type'), 't1');
  assert.ok(ev("NET.att.price>0&&NET.att.ix.length===0"), 'AT&Tease sells transit and never peers at an IX');
  assert.ok(ev("NET.tmo.pol==='selective'&&NET.pes.pol==='open'&&NET.gfb.pol==='open'&&NET.snc.pol==='open'"));
  assert.ok(ev("NET.gfb.ix.includes('kcy')"), 'GFibber gives the Kansas City exchange some eyeballs');
  assert.ok(ev("NET.tmo.ix.includes('sju')"), 'Tee-Hee Mobile is on the Puerto Rico exchange');
  assert.equal(ev("NET.cxc.ix.length"), 0, 'Coax: PNIs only');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(NET.cxc.up)')), ['spc']);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(NET.ftr.up)')), ['vzn']);
  // with PNIs to every Tier 1 and no transit, the small ones with Tier 1 upstreams are still reachable
  ev("S.transit=[];S.ixp={};S.pni=[];for(const n of t1Need())S.pni.push({id:n.id,net:n.id,city:'fra',tier:0});compute()");
  assert.ok(ev("t1Need().every(n=>n.pops.includes('fra'))"), 'every Tier 1, AT&Tease included, is in Frankfurt');
  for (const id of ['tmo', 'pes', 'gfb', 'snc']) assert.equal(ev(`!!R.reachable.${id}`), true, id);
  assert.deepEqual(errors, []);
});

test('Coax gets Spectre-um’d a year in, and Final Frontear joins Very-Zone a year later (#155)', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buildPop({city:'chi'});ACT.buildPop({city:'nyc'});ACT.buyIx({city:'nyc',tier:1,signed:true})");
  ev("S.pni.push({id:'p1',net:'cxc',city:'chi',tier:1,ready:0},{id:'p2',net:'ftr',city:'nyc',tier:1,ready:0});S.peers['ftr@nyc']=true;compute()");
  assert.doesNotMatch(ev("peerOk('cxc','pni','chi').why||''"), /Spectre-um/, 'Coax still decides for itself');
  ev('S.day=364;dayTick()');
  assert.equal(ev("merged('cxc')"), true, 'the deal closed');
  assert.equal(ev("S.pni.find(p=>p.id==='p1').net"), 'spc', 'the Coax PNI now belongs to Spectre-um');
  assert.match(ev("peerOk('cxc','pni','chi').why"), /Spectre-um/);
  assert.equal(ev("merged('ftr')"), false);
  const before = ev("pniMo(S.pni.find(p=>p.id==='p2'),0)");
  ev('S.day=729;dayTick()');
  assert.equal(ev("merged('ftr')"), true);
  assert.equal(ev("S.pni.find(p=>p.id==='p2').net"), 'vzn');
  assert.equal(ev("S.peers['ftr@nyc']"), undefined, 'the IX session ended');
  assert.ok(ev("pniMo(S.pni.find(p=>p.id==='p2'),0)") > before, 'your free peer just became a paid one');
  // a PNI with the new owner in the same city absorbs the old one instead of doubling up
  const { ev: ev2 } = load();
  start(ev2);
  ev2("ACT.buildPop({city:'chi'});S.pni.push({id:'a',net:'cxc',city:'chi',tier:1,ready:0},{id:'b',net:'spc',city:'chi',tier:1,ready:0});S.day=400;dayTick()");
  assert.equal(ev2("S.pni.filter(p=>p.city==='chi').map(p=>p.net).join()"), 'spc');
  // saves keep the record of who merged
  ev("const o=JSON.parse(JSON.stringify(S));S=migrate(o)");
  assert.equal(ev("merged('cxc')&&merged('ftr')"), true);
  ev("S.merged={cxc:'x',zzz:3};S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.merged'), undefined, 'junk in a save is dropped');
  assert.deepEqual(errors, []);
});

test('Australian eyeballs: Neptoon on every exchange family, Lawn-tel in Hobart, Internope behind its parent (#154)', () => {
  const { ev, errors } = load();
  start(ev);
  const asn = { npt: 151660, lnt: 134697, pnt: 10214, mag: 58511, inp: 4739 };
  for (const [id, a] of Object.entries(asn)) assert.equal(ev(`NET.${id}.asn`), a, id);
  for (const c of ['syd', 'mel', 'bne', 'per', 'adl']) assert.ok(ev(`ixMembers('${c}').includes('npt')`), `Neptoon on the ${c} exchange`);
  assert.ok(ev("XIXM['syd~2'].members.includes('npt')&&XIXM['syd~2'].members.includes('mag')"), 'and on the Sydney challenger');
  assert.ok(ev("ixMembers('hba').includes('lnt')&&NET.lnt.pol==='selective'"));
  assert.ok(ev("NET.mag.price>0&&NET.mag.pops.includes('akl')&&NET.mag.pops.includes('lon')"), 'the magpie flies far');
  assert.ok(ev("NET.inp.pol==='restrictive'&&NET.inp.ix.length===0&&NET.inp.up[0]==='tpr'"));
  assert.ok(ev("NET.stb.pops.includes('lax')&&NET.stb.pops.includes('sea')"), 'Musklink is where most of its users are');
  assert.deepEqual(errors, []);
});
