// #255: northern Australia. Port Hedland lands the cable up to Darwin and the one out to Singapore, Townsville is North
// Queensland's data centre, Alice Springs sits in the middle with no sea at all. In the wet season (November to April)
// a cut on land in the tropical north takes twice as long to reach.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const J = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));

test('#255 Port Hedland, Townsville and Alice Springs are on the map and playable', () => {
  const { ev, errors } = load();
  for (const c of ['phe', 'tsv', 'asp']) {
    const x = J(ev, `(({cc,land,reg,au})=>({cc,land,reg,au}))(CITY.${c})`);
    assert.deepEqual(x, { cc: 'AU', land: 'oc', reg: 'OC', au: true }, c);
    assert.ok(ev(`homeOk('${c}')`), `${c} can be a home city`);
    assert.ok(ev(`NETS.some(n=>n.id==='tsy'&&n.pops.includes('${c}')&&sellsAt(n,'${c}'))`), `${c}: Telstraya sells transit there`);
  }
  const cabs = (c) => J(ev, `CABLE_PAIRS.filter(p=>p.a==='${c}'||p.b==='${c}').map(p=>p.a==='${c}'?p.b:p.a).sort()`);
  assert.deepEqual(cabs('phe'), ['drw', 'sin'], 'Port Hedland: up the coast to Darwin, out to Singapore');
  assert.deepEqual(cabs('asp'), [], 'Alice Springs has no sea');
  assert.deepEqual(cabs('tsv'), [], 'Townsville is reached over land');
  assert.equal(ev("CAB.nwcs.name"), 'No Worries Cable System');
  assert.deepEqual(errors, []);
});

test('#255 the wet season doubles the time to reach a cut in the tropical north, and only there', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;S.nextFail=S.nextEvent=1e9;");
  const cut = (a, b, month) => {
    ev(`S.day=dayOf(cal(S.day).y,${month},15);S.inc=[];S.links=[{id:'l',a:'${a}',b:'${b}',kind:'wave',sub:false,tier:0,km:kmBetween('${a}','${b}'),cut:0,mo:1000}];compute();`);
    ev("Math.random=(()=>{let s=7;return()=>{s=(s*16807)%2147483647;return s/2147483647;};})();fireFailure('cut')");
    const i = J(ev, "S.inc.find(i=>i.type==='cut')");
    return { days: i.until - ev('S.day'), msg: i.msg };
  };
  const wet = cut('tsv', 'bne', 0), dry = cut('tsv', 'bne', 6), south = cut('syd', 'mel', 0);
  assert.equal(wet.days, dry.days * 2, 'January takes twice as long as July in Townsville');
  assert.match(wet.msg, /wet season washed out the track/);
  assert.doesNotMatch(dry.msg, /wet season/);
  assert.equal(south.days, dry.days, 'Sydney–Melbourne has no wet season');
  assert.equal(ev("CITY.drw.wet&&CITY.phe.wet&&!CITY.asp.wet"), true, 'Darwin is tropical too; Alice Springs is desert');
  assert.deepEqual(errors, []);
});
