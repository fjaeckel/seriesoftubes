const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt-Amsterdam direct, or round through Paris; one L2VPN circuit between Frankfurt and Amsterdam.
function setup(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.launchBB({city:'fra'});ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});for(const c in S.pops){S.pops[c].rgen=3;S.pops[c].routers=2}");
  [['fra', 'par'], ['par', 'ams'], ['fra', 'ams']].forEach(([a, b], i) => ev(`UI.via=null;openLinkModal('${a}','${b}');ACT.buildLink({tier:1});closeModal();S.links[S.links.length-1].tag=${i}`));
  ev("var D=S.links.find(l=>l.tag===2);S.biz.push({id:'c1',type:'l2vpn',name:'Tulip Bank',city:'fra',city2:'ams',bw:1,rate:300,reqs:[],mood:100,start:S.day});compute()");
}
const keys = ev => JSON.parse(ev("JSON.stringify([...(l2Hl()||[])].sort())"));

test('"Show on map" lights up exactly the links a circuit crosses, and follows its route mode', () => {
  const { ev, errors } = load();
  setup(ev);
  assert.equal(ev("l2Hl()"), null, 'nothing is lit until you ask');
  ev("ACT.hlRoute({id:'c1'})");
  assert.deepEqual(keys(ev), ['ams|fra'], 'the short way is the direct link');
  assert.deepEqual(['fra', 'ams', 'par'].map(c => ev(`l2HlOn('${c}')`)), [true, true, false], 'the ends are on the route, Paris is not');
  ev("ACT.setMetric({id:D.id,v:'avoid'})");
  assert.deepEqual(keys(ev), ['ams|par', 'fra|par'], 'an avoided direct link sends it round through Paris, and the glow follows');
  assert.equal(ev("l2HlOn('par')"), true, 'a city the route passes through counts too');
  ev("ACT.setRoute({id:'c1',m:'fast'})");
  assert.deepEqual(keys(ev), ['ams|fra'], 'lowest latency goes straight again');
  ev("ACT.hlRoute({id:'c1'})");
  assert.equal(ev("l2Hl()"), null, 'a second press switches it off');
  ev("ACT.hlRoute({id:'nope'})");
  assert.equal(ev("UI.hlBiz"), null, 'an unknown circuit is ignored');
  assert.deepEqual(errors, []);
});

test('the button sits with the route buttons, and the map draws with a circuit lit', () => {
  const { ev, errors } = load();
  setup(ev);
  const ctl = () => ev("routeCtl(S.biz[0])");
  assert.match(ctl(), /data-act="hlRoute"[^>]*>Show on map/);
  assert.doesNotMatch(ctl(), /pink[^>]*>Show on map/);
  ev("ACT.hlRoute({id:'c1'})");
  assert.match(ctl(), /pink[^>]*>Show on map/, 'the pressed button is highlighted');
  for (const z of [0.35, 1.4, 6]) ev(`cam.z=${z};draw(performance.now())`);
  ev("S.biz=[];compute()");
  assert.deepEqual(keys(ev), [], 'a circuit that is gone lights nothing');
  ev("draw(performance.now())");
  assert.deepEqual(errors, []);
});

test('everything faded is drawn behind everything lit', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.hlRoute({id:'c1'});window.__o=[];const d=drawCity;drawCity=function(C,...a){__o.push(C.id);return d.call(this,C,...a);}");
  ev("cam.z=2;draw(performance.now())");
  const order = JSON.parse(ev("JSON.stringify(__o)"));
  const lit = order.filter(c => ev(`l2HlOn('${c}')`)), dim = order.filter(c => !ev(`l2HlOn('${c}')`));
  assert.ok(lit.length >= 2 && dim.length >= 1, 'both kinds are on screen');
  assert.ok(order.lastIndexOf(dim[dim.length - 1]) < order.indexOf(lit[0]), 'faded cities first, lit ones last');
  assert.deepEqual(errors, []);
});

test('clicking off the lit route puts the map back, clicking on it does not', () => {
  const { ev, errors } = load();
  setup(ev);
  const click = (city, link) => {
    ev(`pickCity=()=>${city ? `({id:'${city}'})` : 'null'};hitLink=()=>${link ? `S.links.find(l=>l.tag===${link}).id` : 'null'};UI.drag={mode:'pan',moved:false};endPtr({pointerId:1,clientX:5,clientY:5})`);
    return ev("UI.hlBiz");
  };
  const lit = () => { ev("UI.hlBiz=null;ACT.hlRoute({id:'c1'});l2Hl()"); };
  // The circuit runs straight from Frankfurt to Amsterdam: that link (tag 2) and both cities are on it.
  lit(); assert.equal(click('fra', null), 'c1', 'a city on the route');
  lit(); assert.equal(click(null, 2), 'c1', 'a link on the route');
  lit(); assert.equal(click('par', null), null, 'a city off the route');
  lit(); assert.equal(click(null, 0), null, 'a link off the route');
  lit(); assert.equal(click(null, null), null, 'empty map');
  lit(); ev("UI.hlBiz=null");
  assert.equal(click(null, null), null, 'nothing was lit: nothing to do');
  assert.deepEqual(errors, []);
});
