// Puzzle mode (#190), with traffic: small builds that carry real flows, routed by the game's own compute(), with stars,
// no clock, and a main save that is never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const SV = require('../scripts/lib/puzzle-solver');

/* Reference solutions, played through the player's own actions. A link is [a, b, route ('land' or a cable id), tier
   (0 = 10G, 1 = 100G, 2 = 400G), same]: a further overland link on a pair takes a diverse route, or with same = k
   goes into the k-th trench already there (added from the link panel). ['@rt', city, model, count] sets a POP's
   routers (RG index), ['@route', flow, 'fast'] sends a circuit the lowest-latency way. `one` earns the delivery star,
   `three` all three: the three-star ones are the cheapest builds the solver (scripts/lib/puzzle-solver.js) found. */
const REF = {
  hello: { one: [['nyc', 'lon', 'grace', 0]], three: [['nyc', 'lon', 'grace', 0], ['nyc', 'lon', 'amitie', 0]] },
  eurotrip: { one: [['ams', 'lon', 'nshuttle', 1], ['ams', 'fra', 'land', 1]], three: [['ams', 'lon', 'concerto', 1], ['ams', 'lon', 'nshuttle', 1], ['ams', 'fra', 'land', 1], ['ams', 'fra', 'land', 1]] },
  bigboat: { one: [['fra', 'par', 'land', 1], ['fra', 'par', 'land', 1]], three: [['fra', 'par', 'land', 1], ['fra', 'par', 'land', 1], ['fra', 'par', 'land', 1]] },
  shining: { one: [['nyc', 'chi', 'land', 1], ['dal', 'sjc', 'land', 1], ['nyc', 'dal', 'land', 1]], three: [['nyc', 'chi', 'land', 1], ['nyc', 'chi', 'land', 1], ['chi', 'sjc', 'land', 1], ['dal', 'sjc', 'land', 1], ['nyc', 'dal', 'land', 1]] },
  downunder: { one: [['syd', 'mel', 'land', 1], ['syd', 'bne', 'land', 1], ['mel', 'adl', 'land', 1]], three: [['syd', 'mel', 'land', 1], ['syd', 'bne', 'land', 1], ['mel', 'adl', 'land', 1], ['bne', 'adl', 'land', 1]] },
  edgelord: { one: [['@rt', 'ams', 5, 1], ['@rt', 'lon', 5, 1], ['ams', 'lon', 'nshuttle', 2], ['ams', 'lon', 'circe', 1]], three: [['@rt', 'ams', 5, 1], ['@rt', 'lon', 5, 1], ['ams', 'lon', 'concerto', 2], ['ams', 'lon', 'nshuttle', 2], ['ams', 'lon', 'circe', 1]] },
  hubcap: { one: [['@rt', 'lon', 5, 1], ['lon', 'par', 'pasdc', 1], ['lon', 'ams', 'concerto', 1], ['lon', 'ams', 'circe', 1], ['lon', 'ams', 'nshuttle', 1], ['lon', 'par', 'pasdc', 1], ['ams', 'fra', 'land', 1], ['ams', 'fra', 'land', 1]], three: [['@rt', 'lon', 5, 1], ['lon', 'par', 'chn', 1], ['lon', 'par', 'pasdc', 1], ['ams', 'fra', 'land', 1], ['lon', 'ams', 'concerto', 1], ['lon', 'ams', 'circe', 1], ['lon', 'ams', 'nshuttle', 1], ['lon', 'par', 'chn', 1], ['lon', 'par', 'pasdc', 1], ['ams', 'fra', 'land', 1], ['ams', 'fra', 'land', 1], ['lon', 'ams', 'uly', 1]] },
  flash: { one: [['nyc', 'lon', 'hibx', 1]], three: [['nyc', 'lon', 'grace', 1], ['nyc', 'lon', 'hibx', 0]] },
  baltic: { one: [['fra', 'hel', 'clion', 1], ['tll', 'hel', 'land', 1], ['@route', 1, 'fast']], three: [['fra', 'hel', 'clion', 1], ['tll', 'hel', 'land', 1], ['fra', 'tll', 'land', 1], ['@route', 1, 'fast']] },
  fjord: { one: [['par', 'lon', 'pasdc', 1], ['svg', 'lon', 'tampn', 1], ['@route', 1, 'fast']], three: [['par', 'svg', 'land', 1], ['par', 'lon', 'pasdc', 1], ['svg', 'lon', 'tampn', 1], ['@route', 1, 'fast']] },
  braces: { one: [['nyc', 'dub', 'havf', 1], ['lon', 'dub', 'celtix', 1]], three: [['nyc', 'lon', 'grace', 1], ['nyc', 'dub', 'havf', 1], ['lon', 'dub', 'celtix', 1]] },
  sharks: { one: [['lis', 'mad', 'land', 1], ['lis', 'bcn', 'land', 1], ['par', 'mil', 'land', 1], ['par', 'mrs', 'land', 1], ['bcn', 'mrs', 'land', 1]], three: [['lis', 'mad', 'land', 1], ['lis', 'mad', 'land', 1], ['lis', 'bcn', 'land', 1], ['mad', 'bcn', 'land', 1], ['par', 'mil', 'land', 1], ['par', 'mrs', 'land', 1], ['mil', 'bcn', 'land', 1], ['bcn', 'mrs', 'land', 1]] },
  nofra: { one: [['ams', 'dus', 'land', 1], ['ams', 'dus', 'land', 1], ['ber', 'ham', 'land', 1], ['muc', 'zrh', 'land', 1], ['muc', 'dus', 'land', 1], ['ham', 'dus', 'land', 1]], three: [['ams', 'ham', 'land', 1], ['ams', 'dus', 'land', 1], ['ams', 'dus', 'land', 1], ['ber', 'ham', 'land', 1], ['ber', 'ham', 'land', 1], ['muc', 'zrh', 'land', 1], ['muc', 'dus', 'land', 1], ['zrh', 'dus', 'land', 1], ['ham', 'dus', 'land', 1]] },
  fire: { one: [['tok', 'hkg', 'adc', 1], ['hkg', 'sin', 'land', 1], ['sin', 'syd', 'indigo', 1], ['syd', 'tok', 'guam', 1]], three: [['tok', 'hkg', 'adc', 1], ['hkg', 'sin', 'land', 1], ['sin', 'syd', 'indigo', 1], ['syd', 'tok', 'guam', 1]] },
  suez: { one: [['fra', 'mrs', 'land', 1], ['sin', 'mrs', 'peace', 1]], three: [['fra', 'mrs', 'land', 1], ['fra', 'mrs', 'land', 0], ['sin', 'mrs', 'peace', 1], ['sin', 'bom', 'land', 0], ['mrs', 'bom', 'twoaf', 0]] },
  kiwi: { one: [['sea', 'lax', 'land', 1], ['akl', 'syd', 'tasman', 1], ['akl', 'hnl', 'hwk', 1], ['hnl', 'lax', 'seaus', 1]], three: [['sea', 'hnl', 'hwk', 1], ['sea', 'lax', 'land', 1], ['akl', 'syd', 'scx', 1], ['akl', 'syd', 'tasman', 1], ['akl', 'hnl', 'hwk', 1], ['akl', 'suv', 'scx', 1], ['hnl', 'suv', 'scx', 1], ['hnl', 'lax', 'seaus', 1]] },
  samba: { one: [['mia', 'for', 'monet', 1], ['sao', 'rio', 'land', 1], ['sao', 'for', 'land', 1]], three: [['mia', 'for', 'monet', 1], ['mia', 'for', 'sam1', 1], ['sao', 'rio', 'land', 1], ['sao', 'for', 'land', 1], ['rio', 'for', 'land', 1]] },
  ports: { one: [['@rt', 'zrh', 4, 1], ['zrh', 'mil', 'land', 0], ['zrh', 'mil', 'land', 0], ['zrh', 'muc', 'land', 0], ['zrh', 'muc', 'land', 0], ['zrh', 'fra', 'land', 0], ['zrh', 'fra', 'land', 0], ['zrh', 'par', 'land', 0], ['zrh', 'par', 'land', 0], ['zrh', 'vie', 'land', 0], ['zrh', 'vie', 'land', 0], ['zrh', 'prg', 'land', 0], ['zrh', 'prg', 'land', 0]], three: [['@rt', 'zrh', 5, 1], ['zrh', 'mil', 'land', 0], ['zrh', 'mil', 'land', 0], ['zrh', 'mil', 'land', 0], ['zrh', 'muc', 'land', 0], ['zrh', 'muc', 'land', 0], ['zrh', 'muc', 'land', 0], ['zrh', 'fra', 'land', 0], ['zrh', 'fra', 'land', 0], ['zrh', 'fra', 'land', 0], ['zrh', 'par', 'land', 0], ['zrh', 'par', 'land', 0], ['zrh', 'par', 'land', 0], ['zrh', 'vie', 'land', 0], ['zrh', 'vie', 'land', 0], ['zrh', 'vie', 'land', 0], ['zrh', 'prg', 'land', 0], ['zrh', 'prg', 'land', 0], ['zrh', 'prg', 'land', 0]] },
};

function build(ev, steps) {
  for (const s of steps) {
    if (s[0] === '@rt') { const [, c, g, n] = s; if (!ev(`!!S.pops['${c}']`)) ev(`ACT.pzPop({city:'${c}'})`); if (g) ev(`ACT.pzRtModel({city:'${c}',g:${g}})`); for (let i = 1; i < n; i++) ev(`ACT.pzRtAdd({city:'${c}'})`); continue; }
    if (s[0] === '@route') { ev(`ACT.pzRoute({i:${s[1]},m:'${s[2]}'})`); continue; }
    const [a, b, via, tier, same] = s;
    if (!ev(`!!S.pops['${a}']`)) ev(`ACT.pzPop({city:'${a}'})`);
    if (same) ev(`(()=>{const ls=S.links.filter(l=>edgeKey(l)===edgeKey({a:'${a}',b:'${b}'})&&!l.cable),ts=[...new Set(ls.map(pzUnit))],l=ls.find(x=>pzUnit(x)===ts[${same - 1}]);ACT.pzAddPar({id:l.id,div:0});ACT.pzLink({tier:${tier}})})()`);
    else ev(`ACT.pzLinkTo({a:'${a}',b:'${b}'});ACT.pzVia({v:'${via}'});ACT.pzDiv({v:1});ACT.pzLink({tier:${tier || 0}})`);
  }
  ev('closeModal()');
}
const evalP = (ev) => JSON.parse(ev('JSON.stringify(pzEval())'));
const links = (steps) => steps.filter((s) => s[0] !== '@rt');

test('puzzle data: every puzzle is valid, carries traffic, and its references earn their stars through the real routing', () => {
  const { ev, errors } = load();
  const ids = JSON.parse(ev('JSON.stringify(PZ.map(p=>p.id))'));
  assert.ok(ids.length >= 16 && ids.length <= 20, '16 to 20 puzzles');
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.deepEqual(Object.keys(REF).sort(), ids.slice().sort(), 'every puzzle has a reference solution');
  assert.ok(ev("PZ.every(p=>PZ_PACKS.some(k=>k.id===p.pack)&&p.n&&p.j&&p.dem.length>=1&&pzCities(p).length>=2&&pzCities(p).length<=7&&[...pzCities(p),...(p.via||[]),...(p.avoid||[])].every(pzCityOk))"), 'cities exist and are playable');
  assert.ok(ev("PZ.every(p=>p.dem.every(f=>f.g>0&&(f.t==='eye'?(p.src||[]).length>0&&!p.src.includes(f.a):f.t==='l2'&&f.a!==f.b)))"), 'eyeballs have an origin, circuits two ends');
  assert.ok(ev("PZ.every(p=>!p.budget||(p.budget>=100000&&p.budget<=5e6))"), 'budgets are sane');
  assert.ok(ev("PZ_PACKS[0].need===0&&PZ_PACKS.every((k,i)=>!i||k.need>PZ_PACKS[i-1].need)"), 'packs unlock in order');
  assert.ok(ev("PZ_PACKS.every(k=>PZ.filter(p=>p.pack===k.id).length>=3)"), 'every pack has at least three puzzles');
  assert.ok(ev("PZ.filter(p=>p.pack==='hello'&&!p.budget).length>=2"), 'the first puzzles give the budget star away');
  for (const id of ids) {
    ev(`pzBegin(pzDef('${id}'))`);
    build(ev, REF[id].one);
    let e = evalP(ev);
    assert.ok(e.goal, `${id}: the one-star reference delivers everything (${JSON.stringify(e.flows.map((x) => [x.g, x.ms]))})`);
    ev('ACT.pzReset({})');
    assert.equal(evalP(ev).stars, 0, `${id}: reset clears it`);
    build(ev, REF[id].three);
    e = evalP(ev);
    assert.equal(e.stars, 3, `${id}: three stars (spend ${e.spend} of ${ev('S.pz.budget')}, n1 ${e.n1}, worst cut ${JSON.stringify(e.worst)})`);
  }
  assert.deepEqual(errors, []);
});

test('budgets follow the teaching curve, and each 3-star reference is the cheapest build nearby', () => {
  const { ev, errors } = load();
  SV.install(ev);
  // Slack over the cheapest 3-star build found: roomy first, tight at the end. Traffic Cops is tight on purpose: the
  // routing trick (a circuit on the lowest-latency path) is what brings it under budget.
  const SLACK = { hello: [0.15, 0.22], rodeo: [0.09, 0.13], cops: [0.03, 0.06], n1: [0.05, 0.08], final: [0.04, 0.07] };
  const rows = JSON.parse(ev('JSON.stringify(PZ.filter(p=>p.budget).map(p=>({id:p.id,pack:p.pack,budget:p.budget})))'));
  for (const { id, pack, budget } of rows) {
    ev(`pzBegin(pzDef('${id}'))`);
    build(ev, REF[id].three);
    const e = evalP(ev);
    assert.equal(e.stars, 3, id);
    // The routers in the reference are the cheapest that carry it: the solver prices the same build the same.
    const L = links(REF[id].three), j = SV.judge(ev, L);
    assert.ok(j.three && Math.abs(j.spend - e.spend) < 1, `${id}: solver ${j.spend} vs game ${e.spend}`);
    // No single change (drop a link, shrink one, move it to another route or trench) keeps three stars for less.
    const r = SV.improve(ev, L);
    assert.ok(r.spend >= e.spend - 1, `${id}: ${JSON.stringify(r.links)} is cheaper (${r.spend})`);
    const slack = budget / e.spend - 1, [lo, hi] = SLACK[pack];
    assert.ok(slack >= lo && slack <= hi, `${id}: ${(slack * 100).toFixed(1)}% slack, want ${lo * 100}-${hi * 100}%`);
  }
  assert.match(ev("PZ_PACKS[0].d"), /Roomy budgets/, 'the first pack does not promise "no budget"');
  assert.deepEqual(errors, []);
});

test('stars come from traffic: capacity, latency caps, best effort and N-1 under load', () => {
  const { ev, errors } = load();
  // Connected is not delivered: a 10G wave for 30G of London eyeballs gets 10G there.
  ev("pzBegin(pzDef('eurotrip'))");
  build(ev, [['ams', 'lon', 'nshuttle', 0], ['ams', 'fra', 'land', 1]]);
  let e = evalP(ev);
  assert.ok(!e.goal && Math.abs(e.flows[0].g - 10) < 0.1, `10G of 30G (${e.flows[0].g})`);
  assert.match(ev("document.getElementById('pzBox').textContent"), /Eyeballs in London(9\.\d|10\.0) Gbps \/ 30\.0 Gbps/);
  ev("ACT.pzTier({id:S.links[0].id,tier:1})");
  assert.ok(evalP(ev).goal, 'a 100G wave carries it');
  // N-1 under load: two trenches into Paris are connected after a cut, but one 100G wave cannot carry 150G.
  ev("pzBegin(pzDef('bigboat'))");
  build(ev, [['fra', 'par', 'land', 1], ['fra', 'par', 'land', 1, 1], ['fra', 'par', 'land', 1]]);
  e = evalP(ev);
  assert.ok(e.goal && !e.n1, 'still connected after a cut, but short');
  assert.equal(Math.round(e.worst.g), 50, 'cutting the trench with two waves leaves 100G for 150G: 50G drop');
  assert.match(ev("document.getElementById('pzBox').textContent"), /A cut on Frankfurt ⇄ Paris drops 50\.\d Gbps/);
  build(ev, [['fra', 'par', 'land', 1, 2]]);
  assert.ok(evalP(ev).n1, 'two waves in each trench: either one carries Paris alone');
  // A latency cap: Grace Hopscotch is too slow for the traders; the eyeballs are best effort and may drop on a cut.
  ev("pzBegin(pzDef('flash'))");
  build(ev, [['nyc', 'lon', 'grace', 1]]);
  e = evalP(ev);
  assert.ok(!e.goal && e.flows[0].full && !e.flows[0].fast, 'all of the circuit, but at 29 ms');
  build(ev, [['nyc', 'lon', 'hibx', 0]]);
  e = evalP(ev);
  assert.equal(e.stars, 3, 'the fast cable for the circuit; when the big one is cut, only best effort drops');
  // A circuit follows the metrics unless told otherwise: the road to Tallinn is shorter, the light via Helsinki faster.
  ev("pzBegin(pzDef('baltic'))");
  build(ev, links(REF.baltic.three).filter((s) => s[0] !== '@route'));
  e = evalP(ev);
  assert.ok(!e.goal && e.flows[1].ms > 8.8, `the metric path is too slow (${e.flows[1].ms})`);
  assert.ok(ev("!!document.querySelector('#pzBox [data-act=pzRoute]')"), 'the card has the circuit\'s route switch');
  ev("document.querySelector('#pzBox [data-act=pzRoute][data-args*=fast]').click()");
  e = evalP(ev);
  assert.ok(e.goal && e.flows[1].ms <= 8.8, 'lowest latency goes via Helsinki');
  ev('ACT.pzUndo({})');
  assert.equal(ev("S.biz[0].route"), 'normal', 'undo takes the route back');
  // The main game's metric control works in a puzzle and moves the traffic: Backup only on the road pushes the
  // eyeballs through Helsinki too.
  ev("ACT.pzRoute({i:1,m:'fast'});ACT.selLink({id:S.links.find(l=>edgeKey(l)==='fra|tll').id})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Routing metric/);
  ev("ACT.setMetric({id:S.links.find(l=>edgeKey(l)==='fra|tll').id,v:'backup'})");
  assert.ok(ev("(R.load[S.links.find(l=>edgeKey(l)==='fra|tll').id]||0)<0.01"), 'nothing on a backup-only link while the others are up');
  ev('ACT.pzUndo({})');
  assert.ok(ev("!S.pairMet['fra|tll']"), 'undo takes the metric back');
  // Over budget loses the second star only.
  ev("pzBegin(pzDef('braces'))");build(ev, REF.braces.three);
  assert.equal(evalP(ev).stars, 3);
  ev('S.pz.budget=1000');
  assert.equal(evalP(ev).stars, 2);
  // A cable fails as a whole: two waves on one cable are one cut.
  ev("pzBegin(pzDef('kiwi'))");
  build(ev, [['akl', 'syd', 'scx', 1], ['akl', 'suv', 'scx', 1]]);
  assert.equal(ev("new Set(S.links.map(pzUnit)).size"), 1, 'one cable, one failure unit');
  assert.deepEqual(errors, []);
});

test('parallel links say how many they are and where they run; diversity from the link panel', () => {
  const { ev, errors } = load();
  ev("pzBegin(pzDef('bigboat'))");
  build(ev, [['fra', 'par', 'land', 1]]);
  const id = ev('S.links[0].id');
  ev(`ACT.selLink({id:'${id}'})`);
  let panel = ev("document.getElementById('panelBody').textContent");
  assert.match(panel, /Add another link on this pair/);
  // Same trench from the panel: no surcharge, one failure unit, one line on the map labelled 2×100G.
  ev(`ACT.pzAddPar({id:'${id}',div:0})`);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Already on this pair: 1×100G · trench 1/);
  ev('ACT.pzLink({tier:1})');
  assert.equal(ev("new Set(S.links.map(pzUnit)).size"), 1);
  assert.equal(ev('S.links[1].mo'), ev('S.links[0].mo'));
  assert.equal(ev("pzLinkLab(S.links,S.links,R.load[S.links[0].id]+R.load[S.links[1].id],200)"), '2×100G · 75%');
  assert.equal(ev("groupLabel(linkGroups()[0],linkGroups()[0])"), '2×100G', 'the map draws one line for the trench, labelled with its count');
  // A diverse one from the panel: its own trench, 40% dearer, its own line.
  ev(`ACT.pzAddPar({id:'${id}',div:1});ACT.pzLink({tier:1})`);
  assert.equal(ev("new Set(S.links.map(pzUnit)).size"), 2);
  assert.equal(ev('S.links[2].mo'), ev('Math.round(S.links[0].mo*DIVERSE)'));
  assert.equal(ev('linkGroups().length'), 2);
  ev(`ACT.selLink({id:'${id}'})`);
  panel = ev("document.getElementById('panelBody').textContent");
  assert.match(panel, /3 links on this pair: 3×100G/);
  assert.match(panel, /trench 1/);
  assert.match(panel, /trench 2/);
  // Selecting a city lights up every pair it has links on, and its panel lists them with their loads.
  ev("selectCity('par')");
  assert.ok(ev('pzLinkHot(S.links)'));
  panel = ev("document.getElementById('panelBody').textContent");
  assert.match(panel, /Frankfurt · 3×100G150 Gbps \/ 300 Gbps/);
  // A subsea link: "a different route" picks another cable.
  ev("pzBegin(pzDef('hello'))");build(ev, [['nyc', 'lon', 'grace', 0]]);
  ev("ACT.pzAddPar({id:S.links[0].id,div:1})");
  assert.notEqual(ev('UI.pzVia'), 'grace');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Already on this pair: 1×10G/);
  assert.deepEqual(errors, []);
});

test('routers in a puzzle: ports, wave sizes and capacity as in the main game, priced into the budget', () => {
  const { ev, errors } = load();
  ev("pzBegin(pzDef('edgelord'))");
  build(ev, [['ams', 'lon', 'nshuttle', 0]]);
  // A Rusty Router lights 100G at most.
  ev("ACT.pzLinkTo({a:'ams',b:'lon'});ACT.pzVia({v:'concerto'})");
  assert.match(ev("document.querySelector('#modalCard .tierbtn[data-args*=\"2\"]').textContent"), /needs 400G routers/);
  assert.equal(ev("document.querySelector('#modalCard .tierbtn[data-args*=\"2\"]').disabled"), true);
  ev('closeModal()');
  // Eight ports: the ninth wave is refused, a second router makes room, and it is in the bill.
  for (let i = 0; i < 7; i++) ev("ACT.pzLinkTo({a:'ams',b:'lon'});ACT.pzVia({v:'nshuttle'});ACT.pzLink({tier:0})");
  assert.equal(ev('S.links.length'), 8);
  ev("ACT.pzLinkTo({a:'ams',b:'lon'})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /No free router ports in Amsterdam, London/);
  ev("ACT.pzVia({v:'nshuttle'});ACT.pzLink({tier:0})");
  assert.equal(ev('S.links.length'), 8, 'no port, no wave');
  const sp0 = evalP(ev).spend;
  ev("ACT.pzRtAdd({city:'ams'});ACT.pzRtAdd({city:'lon'})");
  assert.equal(evalP(ev).spend - sp0, ev('2*pzRtCost(0,2)'), 'two second routers, priced as the main game prices them');
  ev("ACT.pzLinkTo({a:'ams',b:'lon'});ACT.pzVia({v:'nshuttle'});ACT.pzLink({tier:0})");
  assert.equal(ev('S.links.length'), 9);
  ev("ACT.pzRtRm({city:'ams'})");
  assert.equal(ev('S.pops.ams.routers'), 2, 'cannot drop a router whose ports are in use');
  // The city panel shows the POP: model, load against capacity, ports.
  ev("selectCity('lon')");
  const panel = ev("document.getElementById('panelBody').textContent");
  assert.match(panel, /2 × Rusty Router 9000/);
  assert.match(panel, /Ports9 of 16 used/);
  assert.match(panel, /Router load90\.0 Gbps \/ 800 Gbps/);
  // Capacity: a Rusty Router moves 400G. Three 400G waves on Sonic routers bring 1.2T, but a Rusty-sized POP would
  // stop at 400G of the 500G London wants.
  ev("pzBegin(pzDef('edgelord'))");
  build(ev, [['@rt', 'ams', 5, 1], ['@rt', 'lon', 5, 1], ['ams', 'lon', 'concerto', 2], ['ams', 'lon', 'nshuttle', 2]]);
  assert.equal(Math.round(evalP(ev).flows[0].g), 500);
  ev("ACT.pzRtModel({city:'lon',g:0})");
  assert.equal(ev('S.pops.lon.rgen'), 5, 'a Rusty Router cannot take a 400G wave: the swap is refused');
  ev("S.pops.lon.rgen=4;UI.pzEv=null");// a Mikrowtik moves 300G (set directly: it refuses 400G waves too)
  assert.ok(Math.abs(evalP(ev).flows[0].g - 300) < 5, 'the router is the bottleneck');
  assert.deepEqual(errors, []);
});

test('the whole world is open: an off-plan city can get a POP and links, and it counts in the budget', () => {
  const { ev, errors } = load();
  ev("pzBegin(pzDef('bigboat'))");
  assert.equal(ev("pzKind('bru')"), 'off');
  ev("selectCity('bru')");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Not in the plan/);
  ev("ACT.pzPop({city:'bru'})");
  assert.ok(ev('!!S.pops.bru'));
  const sp = evalP(ev).spend;
  assert.equal(sp, ev("pzPopCost('bru')"));
  ev("ACT.pzLinkTo({a:'bru',b:'par'});ACT.pzVia({v:'land'});ACT.pzLink({tier:1})");
  ev("ACT.pzLinkTo({a:'bru',b:'fra'});ACT.pzVia({v:'land'});ACT.pzLink({tier:1})");
  const e = evalP(ev);
  assert.ok(e.spend > sp && Math.round(e.flows[0].g) === 100, 'Paris gets 100G through Brussels');
  assert.equal(ev("pzKind('pek')"), null, 'cities that need a licence stay out');
  ev("pzBegin(pzDef('nofra'));ACT.pzPop({city:'fra'})");
  assert.equal(ev('!!S.pops.fra'), false, 'a city to avoid stays off limits');
  assert.deepEqual(errors, []);
});

test('determinism and speed: the same build always gets the same stars, fast enough on the biggest puzzle', () => {
  const { ev, errors } = load();
  const run = (id) => { ev(`pzBegin(pzDef('${id}'))`); build(ev, REF[id].three); ev('UI.pzEv=null'); const a = ev('JSON.stringify(pzEval())'); ev('UI.pzEv=null'); return [a, ev('JSON.stringify(pzEval())')]; };
  const [a, b] = run('kiwi'), [c] = run('kiwi');
  assert.equal(a, b, 'twice in a row');
  assert.equal(a, c, 'and from scratch');
  // The biggest puzzle by failure units: one full evaluation (routing plus every single cut).
  const big = ev("PZ.map(p=>p.id).sort()[0]") && JSON.parse(ev('JSON.stringify(PZ.map(p=>p.id))')).map((id) => { ev(`pzBegin(pzDef('${id}'))`); build(ev, REF[id].three); return [id, ev('new Set(S.links.map(pzUnit)).size')]; }).sort((x, y) => y[1] - x[1])[0];
  ev(`pzBegin(pzDef('${big[0]}'))`); build(ev, REF[big[0]].three);
  for (let i = 0; i < 3; i++) ev('UI.pzEv=null;pzEval()');
  const ms = ev('(()=>{const t=performance.now();for(let i=0;i<5;i++){UI.pzEv=null;pzEval();}return (performance.now()-t)/5})()');
  console.log(`# star evaluation on ${big[0]} (${big[1]} failure units): ${ms.toFixed(1)} ms`);
  assert.ok(ms < 150, `${big[0]}: ${ms.toFixed(1)} ms`);
  assert.deepEqual(errors, []);
});

test('progress: the puzzle set with traffic starts the stars again once, with the old ones framed', () => {
  const { ev, errors } = load();
  ev("localStorage.setItem('sot-puzzles',JSON.stringify({s:{hello:{st:3,sp:1},eurotrip:{st:2},gone:{st:3}},wk:{'2026-W40':{st:3,sp:9}},streak:{last:'2026-W40',n:2,best:4}}))");
  let p = JSON.parse(ev('JSON.stringify(pzLoad())'));
  assert.deepEqual(p.s, {}, 'old stars do not count in the new set');
  assert.equal(p.old, 8);
  assert.deepEqual(p.wk, { '2026-W40': { st: 3, sp: 9 } }, 'weekly results stay');
  assert.equal(p.streak.best, 4, 'and so does the streak');
  ev('ACT.puzzleMenu({})');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Puzzles got traffic!.*Your old 8 ⭐ are framed on the wall/);
  ev('closeModal();ACT.puzzleMenu({})');
  assert.doesNotMatch(ev("document.getElementById('modalCard').textContent"), /Puzzles got traffic!/, 'the note shows once');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Framed on the wall: 8 ⭐/);
  // New stars are kept under the new set.
  ev("pzBegin(pzDef('hello'))");build(ev, REF.hello.three);
  p = JSON.parse(ev("localStorage.getItem('sot-puzzles')"));
  assert.equal(p.set, 2);
  assert.equal(p.s.hello.st, 3);
  assert.equal(JSON.parse(ev('JSON.stringify(pzLoad())')).old, 8);
  // Bad data is ignored.
  ev("localStorage.setItem('sot-puzzles',JSON.stringify({set:2,s:{hello:{st:99,sp:'x'},nope:{st:3}},old:'<b>',wk:{bad:{st:3}},streak:{n:-4,last:'<b>'}}))");
  p = JSON.parse(ev('JSON.stringify(pzLoad())'));
  assert.deepEqual(p.s, { hello: { st: 3, sp: null } });
  assert.equal(p.old, null);
  assert.deepEqual(p.wk, {});
  assert.deepEqual(p.streak, { last: null, n: 0, best: 0 });
  ev("localStorage.setItem('sot-puzzles','{nope')");
  assert.equal(ev('pzStarsTotal(pzLoad())'), 0);
  // Packs unlock by the new stars.
  ev("localStorage.removeItem('sot-puzzles')");
  assert.equal(ev("pzPackOpen('rodeo')"), false);
  ev("ACT.pzStart({id:'edgelord'})");
  assert.notEqual(ev('S.pz.id'), 'edgelord', 'a locked puzzle does not start');
  ev("localStorage.setItem('sot-puzzles',JSON.stringify({set:2,s:{hello:{st:3},eurotrip:{st:3},bigboat:{st:2},shining:{st:2}}}))");
  assert.equal(ev("pzPackOpen('rodeo')"), true, '10 stars open pack 2');
  ev('ACT.puzzleMenu({})');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Next pack, Traffic Cops, unlocks at 18/);
  assert.deepEqual(errors, []);
});

test('results card: stars, the next puzzle, a retry, a share line and stars left in the pack', () => {
  const { ev, errors } = load();
  ev("localStorage.removeItem('sot-puzzles');pzBegin(pzDef('eurotrip'))");
  build(ev, REF.eurotrip.one);
  assert.ok(ev("$('modal').hidden||!document.querySelector('#modalCard .pzres')"), 'two stars: no results card, play goes on');
  assert.match(ev("document.getElementById('toasts').textContent"), /One chaos monkey away/, 'a cheer with the next step instead');
  assert.ok(ev("!!document.querySelector('[data-act=pzFinish]')"), 'and a Finish button on the card');
  ev("document.querySelector('[data-act=pzFinish]').click()");
  let card = ev("document.getElementById('modalCard').textContent");
  assert.match(card, /Your stars so far/);
  assert.equal(evalP(ev).stars, 2, 'delivered, and the budget star is on the house');
  assert.match(card, /One chaos monkey away/);
  assert.match(card, /13 ⭐ left in this pack/);
  assert.ok(ev("!!document.querySelector('#modalCard [data-act=pzRetry]')"));
  build(ev, [['ams', 'lon', 'concerto', 1], ['ams', 'fra', 'land', 1]]);
  card = ev("document.getElementById('modalCard').textContent");
  assert.match(card, /A chaos monkey walks into your network/);
  assert.equal(ev("document.querySelectorAll('#modalCard .pzbig.on').length"), 3);
  assert.ok(ev("document.querySelector('#modalCard .btns.cta').classList.contains('pzdone')"));
  assert.match(ev("document.querySelector('#modalCard .pznext').textContent"), /Next puzzle →/);
  assert.equal(ev("document.querySelector('#modalCard [data-act=pzRetry]')"), null, 'no retry after three stars');
  assert.match(ev('pzShareText(pzEval())'), /^Series of Tubes puzzle Euro Trip ⭐⭐⭐ \$[\d.]+[kM] · seriesoftub\.es$/);
  // The last puzzle points back to the list.
  ev("localStorage.setItem('sot-puzzles',JSON.stringify({set:2,s:Object.fromEntries(PZ.map(p=>[p.id,{st:3}]))}));pzBegin(pzDef('samba'))");
  build(ev, REF.samba.three);
  assert.match(ev("document.querySelector('#modalCard .pznext').textContent"), /More puzzles/);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Every star in this pack is yours/);
  assert.deepEqual(errors, []);
});

test('best spend: kept for the best star count, and a cheaper build at the same stars counts', () => {
  const { ev, errors } = load();
  ev("localStorage.removeItem('sot-puzzles');pzBegin(pzDef('braces'))");
  const rec = () => JSON.parse(ev("JSON.stringify(pzLoad().s.braces||null)"));
  build(ev, REF.braces.three);
  const three = evalP(ev);
  assert.deepEqual(rec(), { st: 3, sp: three.spend });
  ev('S.pz.budget=1e7;ACT.pzTier({id:S.links[0].id,tier:2})');
  assert.equal(ev('S.links[0].tier'), 1, 'a 400G wave needs 400G routers: refused');
  ev("ACT.pzRtAdd({city:'nyc'})");
  assert.equal(evalP(ev).stars, 3);
  assert.deepEqual(rec(), { st: 3, sp: three.spend }, 'a dearer 3-star build does not replace it');
  ev("ACT.pzRmLink({id:S.links[0].id})");
  assert.deepEqual(rec(), { st: 3, sp: three.spend }, 'fewer stars never overwrite more');
  ev('ACT.puzzleMenu({})');
  assert.ok(ev("document.getElementById('modalCard').textContent").includes('best ' + ev(`fmt$(${three.spend})`)));
  assert.deepEqual(errors, []);
});

test('weekly puzzle (seeded stand-in): stable per week, carries traffic, its reference ring earns three stars, streak', () => {
  const { ev, errors } = load();
  const a = ev("JSON.stringify(pzWeekly(new Date(2026,9,28)))"), b = ev("JSON.stringify(pzWeekly(new Date(2026,10,1)))"), c = ev("JSON.stringify(pzWeekly(new Date(2026,10,2)))");
  assert.equal(a, b, 'same week, same puzzle');
  assert.notEqual(a, c, 'next week, a new one');
  const w = JSON.parse(a);
  assert.equal(w.key, '2026-W44');
  assert.ok(w.cities.length >= 4 && w.dem.length === w.cities.length - 1 && w.src[0] === w.cities[0]);
  for (let i = 0; i < 400; i += 28) {
    const wi = JSON.parse(ev(`JSON.stringify(pzWeekly(new Date(2026,0,1+${i})))`));
    ev(`pzBegin(pzWeekly(new Date(2026,0,1+${i})))`);
    build(ev, wi.ref.map((x, j) => [x, wi.ref[(j + 1) % wi.ref.length], wi.refVia[j], 0]));
    assert.equal(evalP(ev).stars, 3, `week +${i}`);
  }
  ev("localStorage.removeItem('sot-puzzles');pzBegin(pzWeekly(new Date(2026,9,28)))");
  build(ev, w.ref.map((x, j) => [x, w.ref[(j + 1) % w.ref.length], w.refVia[j], 0]));
  assert.match(ev('pzShareText(pzEval())'), /^Series of Tubes puzzle 2026-W44 ⭐⭐⭐ \$[\d.]+[kM] · seriesoftub\.es$/);
  assert.equal(ev("JSON.parse(localStorage.getItem('sot-puzzles')).streak.n"), 1);
  ev("const p=pzLoad();pzStreak(p,'2026-W45');pzStreak(p,'2026-W45');pzStreak(p,'2026-W46');window.__p=p");
  assert.equal(ev('__p.streak.n'), 3);
  ev("pzStreak(__p,'2026-W49')");
  assert.equal(ev('__p.streak.n'), 1);
  assert.equal(ev('__p.streak.best'), 3);
  assert.deepEqual(errors, []);
});

test('puzzle HUD and panels fit a 360 px phone, portrait and landscape', () => {
  const { ev, errors } = load();
  ev("innerWidth=360;innerHeight=740;dispatchEvent(new Event('resize'))");
  ev("pzBegin(pzDef('baltic'))");
  assert.equal(ev("document.getElementById('tabbar').hidden"), true);
  assert.equal(ev("document.getElementById('pzBox').hidden"), false);
  const box = ev("document.getElementById('pzBox').textContent");
  assert.match(box, /Eyeballs in Tallinn/);
  assert.match(box, /Frankfurt ⇄ Tallinn circuit/);
  assert.match(box, /Content lives in Frankfurt/);
  ev("selectCity('fra')");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Open a POP/);
  ev("document.querySelector('#panelBody [data-act=pzPop]').click()");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Your POP[\s\S]*Router load[\s\S]*Ports[\s\S]*Router model/);
  ev("pzLinkModal('fra','tll')");
  assert.equal(ev("document.querySelectorAll('#modalCard .tierbtn').length"), 4, 'four sizes');
  ev("closeModal();innerWidth=740;innerHeight=360;dispatchEvent(new Event('resize'));renderAll()");
  assert.equal(ev("document.getElementById('pzBox').hidden"), false, 'landscape too');
  // jsdom has no layout: the phone rules keep 40 px targets and pin the action row.
  const rules = JSON.parse(ev(`JSON.stringify([...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.media&&/max-width: ?760px/.test(r.media.mediaText))
    .flatMap(m=>[...m.cssRules]).filter(r=>/#pzBox/.test(r.selectorText||'')).map(r=>({sel:r.selectorText,mh:r.style.getPropertyValue('min-height'),pos:r.style.getPropertyValue('position')})))`));
  assert.ok(rules.some((r) => /#pzBox \.btns \.b/.test(r.sel) && parseFloat(r.mh) >= 40), 'touch targets');
  assert.ok(rules.some((r) => /^#pzBox ?> ?\.btns$/.test(r.sel) && r.pos === 'sticky'), 'pinned actions');
  assert.ok(ev("[...document.querySelectorAll('#pzBox button')].every(b=>b.classList.contains('b'))"), 'every sheet button is a .b the rule sizes');
  assert.deepEqual(errors, []);
});

test('puzzles in every language', () => {
  for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
    const { ev, errors } = load({ lang });
    ev("ACT.puzzleMenu({});pzBegin(pzDef('baltic'))");
    build(ev, REF.baltic.three);
    ev("selectCity('hel');renderAll()");
    const seen = ev("['pzBox','modalCard','hud','panelBody'].map(id=>document.getElementById(id).textContent).join(' ')");
    assert.ok(!/puzzles\./.test(seen), `${lang}: no raw labels`);
    assert.match(seen, /⭐/);
    assert.deepEqual(errors, [], lang);
  }
});

test('no clock in a puzzle: days never pass, nothing breaks, no bills', () => {
  const { ev, errors } = load();
  ev("pzBegin(pzDef('hello'))");
  build(ev, REF.hello.three);
  ev('ACT.speed({v:8});ACT.phonePlay({});for(let i=0;i<50;i++)frame(performance.now()+i*3000)');
  assert.equal(ev('S.day'), 0);
  assert.equal(ev('UI.speed'), 0);
  assert.equal(ev('S.inc.length'), 0);
  assert.equal(ev('S.cash'), ev('START_CASH'), 'nothing is charged');
  assert.equal(ev("document.getElementById('left').hidden"), true, 'no goals/deals/NOC/networks drawer');
  assert.equal(ev("document.getElementById('pzBox').hidden"), false);
  assert.deepEqual(errors, []);
});

test('the main save is byte-identical before and after playing and solving a puzzle', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e7;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});save(true);window.__slot=UI.slot");
  let before = ev("slotRaw(UI.slot||window.__slot)");
  const name = ev('S.name'), day = ev('S.day');
  ev('ACT.puzzleMenu({})');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Hello, World/);
  ev("ACT.pzStart({id:'hello'})");
  assert.equal(ev('S.mode'), 'puzzle');
  before = ev("slotRaw(window.__slot)");// entering saves the network once more (a new stamp, the same game)
  assert.equal(JSON.parse(before).name, name);
  build(ev, REF.hello.three);
  ev("save(true);for(let i=0;i<5;i++)frame(performance.now()+6000*i);window.dispatchEvent(new Event('pagehide'));ACT.exportSave({})");
  assert.equal(ev("slotRaw(UI.slot||window.__slot)"), before, 'untouched while in the puzzle');
  assert.equal(ev("JSON.parse(localStorage.getItem('sot-puzzles')).s.hello.st"), 3, 'the stars are kept');
  ev('ACT.pzLeave({})');
  assert.equal(ev('S.mode'), 'normal');
  assert.equal(ev('S.name'), name);
  assert.equal(ev('S.day'), day);
  assert.ok(ev('!!S.pops.ams'));
  assert.equal(ev('UI.started'), true);
  assert.equal(ev("slotRaw(UI.slot||window.__slot)"), before, 'and after');
  assert.deepEqual(errors, []);
});

test('leaving a puzzle with no game goes back to the title screen', () => {
  const { ev, errors } = load();
  assert.ok(ev("!!document.querySelector('#modalCard .door[data-door=puzzle]')"), 'the title screen has a Puzzles door');
  ev("document.querySelector('#modalCard .door[data-door=puzzle]').click()");
  ev("document.querySelector('#modalCard [data-act=pzStart]').click()");
  assert.equal(ev('S.mode'), 'puzzle');
  ev('ACT.pzLeave({})');
  assert.equal(ev('S'), null);
  assert.equal(ev("slotIdx(true).length"), 0, 'no network was saved');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Series/);
  assert.deepEqual(errors, []);
});

test('main-game toasts and leftover buttons do nothing in a puzzle', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e7;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});save(true)");
  ev("toast('main game news','bad',[{l:'Fix',act:'opsOpen',args:{}}]);save(true)");
  assert.ok(ev("document.querySelectorAll('#toasts .toast').length") > 0);
  ev("window.__slot=UI.slot;ACT.pzStart({id:'hello'})");
  const before = ev("slotRaw(__slot)");
  assert.equal(ev("[...document.querySelectorAll('#toasts .toast')].filter(t=>/main game news/.test(t.textContent)).length"), 0, 'main-game toasts are cleared');
  ev("ACT.pzPop({city:'lon'})");
  const st = () => ev("JSON.stringify({p:S.pops,l:S.links.length,c:S.cash,m:S.mode,te:!!S.te,ops:S.ops,sc:S.scrubs.length,dash:$('dash').hidden,bank:$('bankBox').hidden,left:$('left').hidden,modal:$('modal').hidden,cam:[cam.x,cam.y]})");
  const s0 = st();
  for (const a of ["opsOpen({})", "peerPol({p:'closed'})", "leftTab({t:'noc'})", "focusCity({city:'par'})", "fixInc({id:'x'})", "custGo({id:'x'})", "bank({})", "dash({})",
    "exportSave({})", "launchBB({city:'lon'})", "ad({city:'lon'})", "addRouter({city:'lon'})", "upRouter({city:'lon'})", "addSite({city:'lon'})", "buyTE({})",
    "buildScrub({city:'lon',tier:0})", "buildPop({city:'par'})", "buyTransit({city:'lon',net:'cog',tier:1})", "scenarios({})", "share({})", "importGo({})", "cont({})", "start({})", "newgame({})"]) {
    ev('ACT.' + a);
    assert.equal(st(), s0, `${a} does nothing in a puzzle`);
  }
  assert.equal(ev('S.mode'), 'puzzle');
  // A leftover toast button is a no-op too, through the real click path.
  ev("toast('stray','',[{l:'Go',act:'opsOpen',args:{}}]);document.querySelector('#toasts [data-act=opsOpen]').click()");
  assert.equal(st(), s0);
  ev("toast('puzzle news','good')");
  ev('ACT.pzLeave({})');
  assert.equal(ev("document.querySelectorAll('#toasts .toast').length"), 0, 'puzzle toasts do not follow you home');
  assert.equal(ev("slotRaw(__slot)"), before);
  // Back in the main game, the same actions work again.
  ev("ACT.addRouter({city:'ams'})");
  assert.equal(ev('S.pops.ams.routers'), 2);
  assert.deepEqual(errors, []);
});

test('a city to avoid reads as a rule, not a goal that can fail', () => {
  const { ev, errors } = load();
  ev("pzBegin(pzDef('nofra'))");
  const tw = () => ev("[...document.querySelectorAll('#pzBox .pztw')].map(x=>x.className+'|'+x.textContent).join('\\n')");
  assert.match(tw(), /pztw rule\|🚫 Rule: not via Frankfurt/);
  assert.doesNotMatch(tw(), /[✓✗].*Frankfurt/);
  build(ev, REF.nofra.three);
  assert.match(tw(), /pztw rule\|🚫 Rule: not via Frankfurt/, 'still a rule once solved');
  assert.equal(evalP(ev).stars, 3);
  assert.deepEqual(errors, []);
});

test('a POP in a thin market costs its higher monthly rent too, and the panel says so', () => {
  const { ev, errors } = load();
  ev("pzBegin(pzDef('kiwi'))");
  assert.ok(ev('colo("suv")') > 1, 'Suva is a thin market');
  assert.equal(ev("pzPopCost('suv')"), ev("popCost('suv')+12*popMo('suv')"));
  assert.ok(ev("pzPopCost('suv')") > ev("popCost('suv')+12*POP_MO"));
  ev("selectCity('suv')");
  assert.ok(ev("document.getElementById('panelBody').textContent").includes(ev("fmt$(popMo('suv'))") + '/mo'));
  assert.deepEqual(errors, []);
});

test('each pack\'s idea is needed: three stars without it fail, and the one-star builds are not secretly three', () => {
  const { ev, errors } = load();
  const stars = (id, steps) => { ev(`pzBegin(pzDef('${id}'))`); build(ev, steps); return evalP(ev).stars; };
  const packs = JSON.parse(ev('JSON.stringify(Object.fromEntries(PZ.map(p=>[p.id,p.pack])))'));
  for (const id of Object.keys(REF)) {
    // A ring puzzle's cheapest delivering build is a ring, which is already N-1.
    if (id !== 'fire') assert.ok(stars(id, REF[id].one) < 3, `${id}: the one-star reference earns three stars`);
    if (packs[id] === 'rodeo') assert.ok(stars(id, REF[id].three.filter((s) => s[0] !== '@rt')) < 3, `${id}: three stars on the starter routers`);
    if (REF[id].three.some((s) => s[0] === '@route')) assert.ok(stars(id, REF[id].three.filter((s) => s[0] !== '@route')) < 3, `${id}: three stars without the routing choice`);
    // N-1 Club: the brute-force answer (every one-star link doubled) is over budget or not N-1.
    if (packs[id] === 'n1') assert.ok(stars(id, [...REF[id].one, ...links(REF[id].one)]) < 3, `${id}: doubling every link earns three stars`);
  }
  assert.deepEqual(errors, []);
});

test('every puzzle tells two tubes in one trench from two separate paths, zoomed out too', () => {
  const { ev, errors } = load();
  ev("ACT.pzStart({id:'eurotrip'});closeModal()");
  build(ev, [['ams', 'fra', 'land', 1], ['ams', 'fra', 'land', 1, 1], ['ams', 'lon', 'nshuttle', 1], ['ams', 'lon', 'concerto', 1]]);
  ev("cam.z=0.6;drawFrame(performance.now())");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(AR_PILLS.map(p=>p[2]).sort())")), ['2× one trench', '✓ 2 paths']);
  assert.deepEqual(errors, []);
});
