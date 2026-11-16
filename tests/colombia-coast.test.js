// #416 follow-up: Colombia's Caribbean cables land where they really do, in Cartagena (PCCS, ARCOS, CFX-1) and
// Barranquilla (AMX-1), not 2,600 m up in Bogotá. Older saves keep the waves and IRUs they hold on the old pairs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load: load0 } = require('./harness');

const load = t => { const h = load0(); t.after(() => h.dom.window.close()); return h; };
const pairs = (ev, cid) => JSON.parse(ev(`JSON.stringify(CABLE_PAIRS.filter(p=>p.cid==='${cid}').map(p=>p.a+'-'+p.b))`));

test('the coast is on the map, and the cables land there', t => {
  const { ev, errors } = load(t);
  for (const c of ['baq', 'ctg']) {
    assert.equal(ev(`CITY.${c}.cc`), 'CO');
    assert.equal(ev(`landing('${c}')`), true, `${c} is a landing`);
    assert.ok(ev(`NETS.filter(n=>n.pops.includes('${c}')).length`) >= 3, `networks are present in ${c}`);
  }
  assert.ok(pairs(ev, 'pccs').includes('mia-ctg') && pairs(ev, 'pccs').includes('pan-ctg'));
  assert.deepEqual(pairs(ev, 'arcos').filter(p => /ctg|bog/.test(p)), ['cur-ctg']);
  assert.deepEqual(pairs(ev, 'cfx').filter(p => /ctg|bog/.test(p)), ['kin-ctg']);
  assert.deepEqual(pairs(ev, 'amx').filter(p => /baq|bog/.test(p)), ['sdq-baq', 'baq-for']);
  assert.equal(ev("landing('bog')"), false, 'Bogotá is reached overland from the coast');
  assert.equal(ev("isSub('ctg','bog')"), false, 'overland from Cartagena to Bogotá');
  assert.deepEqual(errors, []);
});

test('an older save keeps its waves and IRUs on the old pairs, still drawn to Bogotá', t => {
  const { ev, errors } = load(t);
  ev("ACT.start({});S.cash=1e9;for(const c of ['mia','bog','kin'])if(!S.pops[c])ACT.buildPop({city:c});");
  // What a save from before holds: a PCCS wave Miami–Bogotá and a CFX-1 IRU Kingston–Bogotá.
  ev("S.links.push({id:'old1',a:'mia',b:'bog',kind:'wave',tier:2,km:2400,sub:true,cable:'pccs',cut:0,mo:9000},{id:'old2',a:'bog',b:'kin',kind:'df',km:1900,sub:true,cable:'cfx',cut:0,mo:20000,pairs:1,sys:'lite',ch:['zr4']})");
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  const kept = JSON.parse(ev("JSON.stringify(S.links.filter(l=>l.id.startsWith('old')).map(l=>[l.id,l.a,l.b,l.cable]))"));
  assert.deepEqual(kept, [['old1', 'mia', 'bog', 'pccs'], ['old2', 'bog', 'kin', 'cfx']], 'both kept, cables and all');
  for (const [id, a, b] of [['old1', 'mia', 'bog'], ['old2', 'bog', 'kin']]) {
    const p = JSON.parse(ev(`JSON.stringify(cablePair(S.links.find(l=>l.id==='${id}').cable,'${a}','${b}'))`));
    assert.ok(p, `${id}: its cable still resolves`);
    assert.deepEqual([p.a, p.b], [a, b], `${id}: in the link's direction`);
    const ends = [p.pts[0], p.pts[p.pts.length - 1]], A = JSON.parse(ev(`JSON.stringify([CITY.${a}.x,CITY.${a}.y])`)), B = JSON.parse(ev(`JSON.stringify([CITY.${b}.x,CITY.${b}.y])`)), W = ev('W');
    const at = (q, c) => Math.abs(q[1] - c[1]) < 1e-9 && Math.abs(((q[0] - c[0]) % W + W + W / 2) % W - W / 2) < 1e-9;
    assert.ok(at(ends[0], A) && at(ends[1], B), `${id}: drawn from ${a} to ${b}`);
  }
  assert.ok(ev("R.reachable&&S.links.find(l=>l.id==='old1').cut===0"), 'the wave is up');
  assert.deepEqual(errors, []);
});

test('Mind the gap: Panama City to Colombia, wherever the cable lands', t => {
  const { ev, errors } = load(t);
  ev("ACT.start({});S.links.push({id:'g',a:'pan',b:'ctg',kind:'wave',tier:2,km:550,sub:true,cable:'pccs',cut:0,mo:1})");
  assert.equal(ev("BADGES.find(b=>b.id==='gap').ok()"), true);
  ev("S.links=[{id:'g',a:'pan',b:'sjo',kind:'wave',tier:2,km:500,cut:0,mo:1}]");
  assert.equal(ev("BADGES.find(b=>b.id==='gap').ok()"), false, 'Costa Rica is not across the gap');
  assert.deepEqual(errors, []);
});
