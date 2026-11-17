// "Move to another path" names a circuit's bottlenecks: the spans, and the POPs' routers, with less headroom than the customer wants.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// New York and Ashburn, with Boston as the way round. Fibers a, b (same trench) and c run direct; d and e go through Boston.
const fib = (id, a, z, km, trench, n = 8) => `S.links.push({id:'${id}',a:'${a}',b:'${z}',kind:'df',own:true,sys:'roadm',pairs:1,ch:Array(${n}).fill('zr4'),km:${km},sub:false,cable:null,mo:1,trench:'${trench}',cut:0,ready:0,day:0,spares:false});`;
const BASE = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=13;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "for(const c of ['nyc','ash','bos'])if(!S.pops[c])S.pops[c]={day:0,bb:null,boost:0,down:0,routers:4,gen:false,rgen:RG.length-3};S.links=[];" +
  fib('a', 'nyc', 'ash', 350, 'ta') + fib('b', 'nyc', 'ash', 350, 'ta') + fib('c', 'ash', 'nyc', 420, 'tc') + fib('d', 'nyc', 'bos', 130, 'td') + fib('e', 'bos', 'ash', 220, 'te');
const circuit = (bw) => `S.biz.push({id:'k',type:'l2vpn',name:'Big Circuit',city:'nyc',city2:'ash',bw:${bw},rate:10,reqs:[],mood:80,since:0,day:0,route:'normal'});`;
function game(t, extra = '') { const h = load({ seed: 777 }); t.after(() => h.dom.window.close()); h.ev(BASE); assert.equal(h.ev("['nyc','ash','bos'].every(isCity)"), true); h.ev(extra + 'compute();'); return h; }
const modal = (ev) => ev("document.getElementById('modal').textContent");
const json = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));
// Boston to Ashburn is one 400G channel: too small for a 1 Tbps circuit.
const SMALL_E = "S.links.find(l=>l.id==='e').ch=['zr4'];";

test('an alternative path names the span that is too small, with how much room it has', (t) => {
  const { ev, errors } = game(t, circuit(1000) + SMALL_E);
  const T = json(ev, 'circuitTargets(S.biz[0])');
  assert.deepEqual(T.bn, [], 'the direct fibers have room for 1T');
  assert.deepEqual(T.alts.map((x) => x.p), [['nyc', 'bos', 'ash']]);
  assert.deepEqual(T.alts[0].bn, [{ a: 'bos', z: 'ash', room: 400, cap: 400, link: 'e' }]);
  ev("ACT.pathOpen({id:'k'})");
  assert.match(modal(ev), /Bottleneck: Boston → Ashburn: room for 400 Gbps of 400 Gbps/);
  assert.doesNotMatch(modal(ev), /Bottlenecks/, 'today\'s path is fine');
  assert.deepEqual(errors, []);
});

test('today\'s path lists its tight spans, with a button that opens the link', (t) => {
  const { ev, errors } = game(t, circuit(1000) + SMALL_E + "ACT.pathPin({id:'k',via:'nyc,bos,ash'});");
  assert.equal(ev('R.l2.k'), 400, 'it gets what the small span has');
  const T = json(ev, 'circuitTargets(S.biz[0])');
  assert.deepEqual(T.now, ['nyc', 'bos', 'ash']);
  assert.deepEqual(T.bn, [{ a: 'bos', z: 'ash', room: 400, cap: 400, link: 'e' }], 'room counts what the circuit already takes there');
  ev("ACT.pathOpen({id:'k'})");
  assert.match(modal(ev), /Bottlenecks/);
  assert.match(modal(ev), /Boston → Ashburn: room for 400 Gbps of 400 Gbps/);
  const btn = JSON.parse(ev("document.querySelector('#modal [data-act=\"pathShow\"]').dataset.args"));
  assert.deepEqual(btn, { link: 'e' });
  ev("document.querySelector('#modal [data-act=\"pathShow\"]').click()");
  assert.equal(ev("document.getElementById('modal').hidden"), true, 'the window closes');
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'link', id: 'e' }, 'and the link is selected');
  assert.deepEqual(errors, []);
});

test('a POP whose routers are full is a bottleneck too, and its button opens the POP', (t) => {
  const { ev, errors } = game(t, circuit(100) + "S.pops.bos.routers=1;S.pops.bos.rgen=0;");
  const cap = ev('R.nodeCap.bos');
  assert.ok(cap > 0);
  ev(`S.biz[0].bw=${cap + 100};compute();`);
  const T = json(ev, 'circuitTargets(S.biz[0])');
  const r = T.alts.flatMap((x) => x.bn).find((x) => x.c === 'bos');
  assert.ok(r, 'the routers at Boston are named');
  assert.equal(r.cap, cap); assert.ok(r.room <= cap);
  ev("ACT.pathOpen({id:'k'})");
  assert.match(modal(ev), /Boston routers: room for .* of/);
  const via = T.alts.find((x) => x.bn.some((y) => y.c === 'bos'));
  assert.ok(via.room <= r.room, 'full routers count in what the path fits, as compute() reserves them');
  assert.match(modal(ev), /Fits only/);
  ev("ACT.pathShow({city:'bos'})");
  assert.equal(ev("document.getElementById('modal').hidden"), true);
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'city', id: 'bos' }, 'the POP is open');
  assert.deepEqual(errors, []);
});

test('nothing is named when every span and router has room', (t) => {
  const { ev, errors } = game(t, circuit(100));
  const T = json(ev, 'circuitTargets(S.biz[0])');
  assert.deepEqual(T.bn, []);
  assert.deepEqual(T.alts.map((x) => x.bn), [[]]);
  ev("ACT.pathOpen({id:'k'})");
  assert.doesNotMatch(modal(ev), /bottleneck/i);
  assert.deepEqual(errors, []);
});

test('the tightest spans come first, and only a few are listed', (t) => {
  // d and e both small: Boston–Ashburn 400G, New York–Boston 800G, for a 1T circuit pinned through Boston.
  const { ev, errors } = game(t, circuit(1000) + SMALL_E + "S.links.find(l=>l.id==='d').ch=['zr4','zr4'];ACT.pathPin({id:'k',via:'nyc,bos,ash'});");
  const T = json(ev, 'circuitTargets(S.biz[0])');
  assert.deepEqual(T.bn.map((x) => [x.a, x.z, x.room]), [['bos', 'ash', 400], ['nyc', 'bos', 800]], 'tightest first');
  ev("ACT.pathOpen({id:'k'})");
  const text = modal(ev);
  // (the "Now on" line also names both spans, so compare the bottleneck lines themselves)
  assert.ok(text.indexOf('Boston → Ashburn: room for 400 Gbps') < text.indexOf('New York → Boston: room for 800 Gbps') && text.indexOf('Boston → Ashburn: room for 400 Gbps') >= 0, 'listed in that order');
  assert.deepEqual(errors, []);
});

test('the show button ignores a link or POP that is gone', (t) => {
  const { ev, errors } = game(t, circuit(1000) + SMALL_E);
  ev("ACT.pathOpen({id:'k'})");
  ev("ACT.pathShow({link:'nope'});ACT.pathShow({city:'xyz'});ACT.pathShow({city:'constructor'});ACT.pathShow({})");
  assert.equal(ev("document.getElementById('modal').hidden"), false, 'nothing happened');
  assert.deepEqual(errors, []);
});
