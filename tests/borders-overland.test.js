// Fiber over land inside one country: cities on land with no road in (Russia's Arctic and Kamchatka, Alaska, Greenland's
// towns) can be dug to from the rest of their own country, and only their own. North and South Korea, like Kyiv and
// Moscow, get no circuit between them at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;";

test('cities of one country on one piece of land can build terrestrial fiber between them', () => {
  const { ev, errors } = load();
  ev(start);
  for (const [a, b, why] of [['pvs', 'dyr', 'Pevek–Anadyr, both Chukotka'], ['pvs', 'mos', 'Pevek–Moscow, across Russia'], ['pkc', 'vvo', 'Kamchatka–Vladivostok'],
    ['jnu', 'sea', 'Juneau–Seattle, both US'], ['brw', 'ome', "Alaska's Arctic coast"], ['nuk', 'sis', "Greenland's towns, one island"]]) {
    assert.equal(ev(`isSub('${a}','${b}')`), false, `${why}: over land`);
    assert.equal(ev(`dfAllowed('${a}','${b}')`), true, `${why}: dark fiber can be built`);
    assert.equal(ev(`landMult('${a}','${b}')`) < 45, true, `${why}: not priced as a crossing between continents`);
  }
  ev("UI.lmode='wave';openLinkModal('pvs','dyr')");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Terrestrial/);
  assert.deepEqual(errors, []);
});

test('only inside the country: islands and other countries stay across the sea', () => {
  const { ev, errors } = load();
  ev(start);
  for (const [a, b, why] of [['jnu', 'van', 'Juneau–Vancouver: a border'], ['yfb', 'mtl', 'Iqaluit is on Baffin Island'], ['pkc', 'uus', 'Sakhalin is an island'],
    ['ome', 'vvo', 'Nome–Vladivostok: two countries'], ['hnl', 'sea', 'Hawaii']]) {
    assert.equal(ev(`isSub('${a}','${b}')`), true, why);
  }
  assert.equal(ev("landMult('ist','esb')") < 45, true, 'Istanbul–Ankara is one country, not two continents');
  assert.deepEqual(errors, []);
});

test('no circuit of any kind between North and South Korea, and still none between Kyiv and Moscow', () => {
  const { ev, errors } = load();
  ev(start + "ACT.launchBB({city:'icn'});S.pops.fnj={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:3};compute()");
  for (const [a, b, msg] of [['icn', 'fnj', /North and South Korea/], ['fnj', 'icn', /North and South Korea/], ['kyv', 'mos', /Kyiv and Moscow/]]) {
    ev(`UI.pending=null;openLinkModal('${a}','${b}')`);
    assert.match(ev("document.getElementById('modalCard').textContent"), msg);
    assert.equal(ev('UI.pending'), null, 'nothing to order');
    assert.equal(ev(`dfAllowed('${a}','${b}')`), false);
  }
  // Even an action called directly (an agent, a stale window) builds nothing.
  const n = ev('S.links.length');
  ev("UI.pending={a:'icn',b:'fnj'};ACT.buildLink({tier:0});UI.pending={a:'icn',b:'fnj'};UI.dfSrc='build';ACT.orderDf();UI.pending={a:'icn',b:'fnj'};ACT.orderCable()");
  assert.equal(ev('S.links.length'), n);
  // Seoul and Pyongyang are still on one landmass, but a latency customer cannot count on a link between them.
  assert.ok(ev("latFloor('icn','fnj')") > ev("latMaxOf('icn','fnj')"));
  assert.deepEqual(errors, []);
});

test('nothing leaves South Korea over land: every way out is a subsea cable', () => {
  const { ev, errors } = load();
  ev(start);
  for (const c of ['pek', 'sha', 'vvo', 'fnj']) assert.equal(ev(`isSub('icn','${c}')`), true, `Seoul–${c}: by sea only`);
  assert.equal(ev("CITIES.filter(c=>c.cc!=='KR'&&!isSub('icn',c.id)).length"), 0, 'no city anywhere is overland from Seoul');
  assert.equal(ev("dfAllowed('icn','pek')"), false, 'no terrestrial dark fiber to Beijing');
  assert.equal(ev("isSub('pek','fnj')"), false, 'the rest of the peninsula still borders China');
  ev("UI.via=null;UI.lmode='wave';openLinkModal('icn','tok')");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Subsea/);
  assert.deepEqual(errors, []);
});
