const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('the world: thousands of cities, every PoP and exchange refers to a real one', () => {
  const { ev, errors } = load();
  assert.ok(ev('CITIES.length') > 4000, 'cities from GeoNames and PeeringDB');
  assert.equal(ev("CITIES.filter(c=>!c.land||!isFinite(c.x)||!isFinite(c.y)||!(c.P>0)||!c.name).length"), 0, 'every city has a landmass, a place on the map and some people');
  assert.equal(ev("new Set(CITIES.map(c=>c.id)).size"), ev('CITIES.length'), 'ids are unique');
  assert.equal(ev("NETS.filter(n=>n.pops.some(c=>!CITY[c])).length"), 0, 'PoPs are cities');
  assert.equal(ev("NETS.filter(n=>n.ix.some(x=>!(CITY[x]&&CITY[x].ix)&&!XIXM[x])).length"), 0, 'exchange memberships are exchanges');
  assert.equal(ev("NETS.filter(n=>n.ix.some(x=>!n.pops.includes(ixCity(x)))).length"), 0, 'a network on an exchange has a PoP in its city');
  assert.equal(ev("XIX.filter(x=>!CITY[x.c]||!ixMembers(x.id).length).length"), 0, 'challenger exchanges have a metro and members');
  assert.deepEqual(errors, []);
});

test('networks carry their real names and AS numbers', () => {
  const { ev } = load();
  const asn = (id) => ev(`NET.${id}.asn`), name = (id) => ev(`NET.${id}.name`);
  assert.deepEqual([asn('lvl'), asn('cog'), asn('ggl'), asn('cfl'), asn('nfx'), asn('drz'), asn('ntt'), asn('tly')], [3356, 174, 15169, 13335, 2906, 6939, 2914, 1299]);
  assert.deepEqual([name('lvl'), name('cog'), name('ggl'), name('nfx')], ['Lumen', 'Cogent', 'Google', 'Netflix']);
  assert.equal(ev("new Set(NETS.map(n=>n.asn)).size"), ev('NETS.length'), 'no AS number appears twice');
  assert.equal(ev("NETS.some(n=>/Cogentle|Goggle|Faceplant|Level Tree/.test(JSON.stringify(n)))"), false, 'no cartoon names left');
});

test('transit is sold only in cities where a transit network really has a PoP', () => {
  const { ev } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  const none = ev("CITIES.find(c=>!sellersAt(c.id).length&&!c.cn&&!c.ru&&c.P>50).id");
  ev(`ACT.buildPop({city:'${none}'});ACT.buyTransit({city:'${none}',net:'cog',tier:0})`);
  assert.equal(ev('S.transit.length'), 0, 'refused: nobody sells there');
  const some = ev("CITIES.find(c=>sellersAt(c.id).length>3&&!c.cn&&!c.ru&&!S.pops[c.id]).id");
  const net = ev(`sellersAt('${some}')[0].id`);
  ev(`ACT.buildPop({city:'${some}'});ACT.buyTransit({city:'${some}',net:'${net}',tier:0})`);
  assert.equal(ev('S.transit.length'), 1);
});

test('home city search finds any city and says whether anyone sells transit there', () => {
  const { ev } = load();
  const m = JSON.parse(ev("JSON.stringify(cityMatches('manch').map(c=>c.name))"));
  assert.ok(m.includes('Manchester'));
  assert.ok(ev("cityMatches('zzzzqqqq').length") === 0);
  assert.ok(ev("cityMatches('são paulo').length") > 0 && ev("cityMatches('sao paulo').length") > 0, 'accents do not matter');
  const none = ev("CITIES.find(c=>!sellersAt(c.id).length&&c.P>200).id");
  assert.match(ev(`startCard('${none}')`), /Nobody sells transit here/);
  assert.doesNotMatch(ev("startCard('fra')"), /Nobody sells/);
  ev("showTitle()");
  assert.ok(ev("document.getElementById('cityQ')"), 'the title screen has a search box');
  assert.match(ev("document.querySelector('.disc').textContent"), /work of fiction/);
});

test('start anywhere: any city can be the home city', () => {
  const { ev, errors } = load();
  const c = ev("CITIES.find(c=>c.gen&&sellersAt(c.id).length>3&&!c.cn&&!c.ru).id");
  ev(`UI.startCity='${c}';ACT.start({})`);
  assert.equal(ev('S.home'), c);
  assert.ok(ev(`S.pops['${c}']`));
  assert.deepEqual(errors, []);
});

test('islands get a cable, and every city is connected to somewhere', () => {
  const { ev } = load();
  assert.equal(ev("WORLD.islands.filter(id=>!CABLE_PAIRS.some(p=>p.a===id||p.b===id)).length"), 0);
  assert.equal(ev("CABLE_PAIRS.filter(c=>!CITY[c.a]||!CITY[c.b]||!(c.km>0)).length"), 0);
  assert.ok(ev("CITIES.filter(c=>c.land.startsWith('i:')).length") > 50);
});

test('AS numbers: any free number works, reserved and taken ones do not', () => {
  const { ev } = load();
  const chk = (v) => JSON.parse(ev(`JSON.stringify(asnCheck(${JSON.stringify(String(v))}))`));
  assert.equal(chk(64512).n, 64512);
  assert.equal(chk('AS4200000001').n, 4200000001);
  assert.equal(chk(1).n, 1);
  for (const bad of ['0', '23456', '65535', '4294967295', '-5', '1.5', 'abc', '', '99999999999']) assert.ok(chk(bad).err, `${bad} is refused`);
  assert.match(chk(3356).err, /Lumen/);
  assert.match(chk(174).err, /Cogent/);
  const r = ev('randomAsn()');
  assert.ok(r >= 1 && !ev(`NETS.some(n=>n.asn===${r})`));
  assert.equal(ev("rirFor('fra')"), 'RIPE NCC');
  assert.equal(ev("rirFor('nyc')"), 'ARIN');
  assert.equal(ev("rirFor('sin')"), 'APNIC');
  assert.equal(ev("rirFor('sao')"), 'LACNIC');
  assert.equal(ev("rirFor('jnb')"), 'AFRINIC');
});

test('the title screen takes a chosen AS number', () => {
  const { ev, dom } = load();
  ev("showTitle()");
  const d = dom.window.document;
  d.getElementById('asnIn').value = '65001';
  d.querySelector('[data-act=start]').click();
  assert.equal(ev('S.asn'), 65001);
  assert.match(ev("document.getElementById('toasts').textContent"), /You announce AS65001/);
  const t = load();
  t.ev("showTitle()");
  t.dom.window.document.getElementById('asnIn').value = '3356';
  t.dom.window.document.querySelector('[data-act=start]').click();
  assert.equal(t.ev('S'), null, 'a taken number stops the game from starting');
});

test('old saves lose transit ports that no longer match a real PoP', () => {
  const { ev } = load();
  ev("ACT.start({})");
  const bad = ev("(()=>{for(const c of ['fra','ams']){const n=NETS.find(n=>n.price&&!n.pops.includes(c));if(n)return [c,n.id];}})()");
  ev(`S.transit.push({id:'x1',city:'${bad[0]}',net:'${bad[1]}',tier:0,down:0});S.ixp['nope~9']=1;S=migrate(JSON.parse(JSON.stringify(S)))`);
  assert.equal(ev("S.transit.some(t=>t.id==='x1')"), false);
  assert.equal(ev("S.ixp['nope~9']"), undefined);
});
