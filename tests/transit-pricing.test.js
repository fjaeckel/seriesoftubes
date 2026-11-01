const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const ORDER = ['drz', 'cog', 'tly', 'gtt', 'zay', 'tlx', 'skl', 'ups', 'tat', 'pcw', 'lvl', 'tng', 'ntt', 'dtk', 'vzn', 'att'];

test('Tier 1 quotes keep the supplied price order in shared North American and European markets', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Prices','fra',{mode:'sandbox'})");
  const cities = JSON.parse(ev("JSON.stringify(CITIES.filter(c=>['US','CA'].includes(c.cc)||c.reg==='EU').map(c=>c.id))"));
  for (const c of cities) {
    const offers = ORDER.filter(n => ev(`sellsAt(NET.${n},'${c}')`));
    for (let i = 1; i < offers.length; i++) assert.ok(ev(`transitPerG(NET.${offers[i - 1]},'${c}',false)<transitPerG(NET.${offers[i]},'${c}',false)`), `${c}: ${offers[i - 1]} below ${offers[i]}`);
  }
  assert.ok(ev('NETS.filter(n=>n.type==="t1").every(n=>eyeMarkup(n,"fra")===1)'), 'national retail demand does not distort Tier 1 quotes');
  assert.deepEqual(errors, []);
});

test('regional strengths and small-market costs affect both quotes and billing', t => {
  const { ev, dom, errors } = load();
  t.after(() => dom.window.close());
  ev("beginGame('Prices','tok',{mode:'sandbox'});S.cash=1e9;ACT.buyTransit({city:'tok',net:'pcw',tier:1});compute()");
  assert.ok(ev("netMult(NET.pcw,'tok')<netMult(NET.cog,'tok')"), 'the Asian backbone avoids the overseas carrier markup');
  assert.ok(ev("netMult(NET.tng,'jnb')<netMult(NET.tng,'fra')*regionMult('jnb')"), 'African reach improves the relative Orange quote');
  assert.ok(ev("regionMult('bom')>regionMult('sin')&&regionMult('jkt')>regionMult('sin')"));
  assert.ok(ev("regionMult('dxb')>regionMult('fra')&&regionMult('jnb')>regionMult('nyc')"));
  assert.ok(ev("townMult('fsd')>townMult('nyc')"));
  assert.ok(ev("sellsAt(NET.pcw,'tok')"));
  const price = ev("transitPerG(NET.pcw,'tok',false)");
  assert.equal(ev('transitMo(S.transit[0],100)'), 100 * price * ev('S.priceMul') + ev('PORT[1].tmo'));
  assert.deepEqual(errors, []);
});
