// Moving a customer to another path between the same two POPs: fiber customers to another fiber, circuits by a pin.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// New York and Ashburn, with Boston as the way round, for the test's sake. Fiber a is the direct one, on its own trench;
// b runs beside it in the same trench; c is direct on another trench; d and e go through Boston on trenches of their own.
const fib = (id, a, z, km, trench, n = 8) => `S.links.push({id:'${id}',a:'${a}',b:'${z}',kind:'df',own:true,sys:'roadm',pairs:1,ch:Array(${n}).fill('zr4'),km:${km},sub:false,cable:null,mo:1,trench:'${trench}',cut:0,day:0,ready:0,spares:false});`;
const BASE = "ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;S.lvl=13;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "for(const c of ['nyc','ash','bos'])if(!S.pops[c])S.pops[c]={day:0,bb:null,boost:0,down:0,routers:4,gen:false,rgen:RG.length-3};S.links=[];" +
  fib('a', 'nyc', 'ash', 350, 'ta') + fib('b', 'nyc', 'ash', 350, 'ta') + fib('c', 'ash', 'nyc', 420, 'tc') + fib('d', 'nyc', 'bos', 130, 'td') + fib('e', 'bos', 'ash', 220, 'te');
const hasCities = (ev) => ev("['nyc','ash','bos'].every(isCity)");
const wave = "S.biz.push({id:'w',type:'wwave',name:'Zay-No Fiber',city:'nyc',city2:'ash',link:'a',slots:2,bw:1,rate:9000,reqs:[],mood:80,since:0,day:0,route:'normal',what:'x'});";
const pair = (type, id = 'p', link = 'a') => `S.biz.push({id:'${id}',type:'${type}',name:'A Customer ${id}',city:'nyc',city2:'ash',link:'${link}',slots:0,bw:1,rate:9000,reqs:[],mood:80,since:0,day:0,route:'normal',what:'x'});`;
const circuit = (bw = 100) => `S.biz.push({id:'k',type:'l2vpn',name:'Big Circuit',city:'nyc',city2:'ash',bw:${bw},rate:10,reqs:[],mood:80,since:0,day:0,route:'normal'});`;
function game(t, extra = '') { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.ev(BASE); assert.equal(hasCities(h.ev), true); h.ev(extra + 'compute();'); return h; }
const biz = (ev, id, k) => ev(`S.biz.find(b=>b.id===${lit(id)}).${k}`);
const modal = (ev) => ev("document.getElementById('modal').textContent");

test('a wave moves to another fiber: free, its channels go with it, and the first choice is on another trench', (t) => {
  const { ev, errors } = game(t, wave);
  const cash = ev('S.cash');
  assert.deepEqual(JSON.parse(ev("JSON.stringify(fiberTargets(S.biz[0]).map(x=>[x.l.id,x.diverse,x.no]))")), [['c', true, ''], ['b', false, '']]);
  assert.equal(ev("soldSlots(S.links.find(l=>l.id==='a'))"), 2);
  ev("ACT.pathOpen({id:'w'})");
  assert.match(modal(ev), /Fully diverse/); assert.match(modal(ev), /Same trench/);
  ev("ACT.pathMove({id:'w',link:'c'})");
  assert.equal(biz(ev, 'w', 'link'), 'c');
  assert.equal(ev("soldSlots(S.links.find(l=>l.id==='a'))"), 0);
  assert.equal(ev("soldSlots(S.links.find(l=>l.id==='c'))"), 2);
  assert.equal(ev('S.cash'), cash, 'free');
  assert.equal(biz(ev, 'w', 'rate'), 9000, 'the contract stands');
  assert.equal(ev("document.getElementById('modal').hidden"), true);
  assert.deepEqual(errors, []);
});

test('a wave needs room on the new fiber; a move is checked again when it is made', (t) => {
  const { ev, errors } = game(t, wave + "S.links.find(l=>l.id==='c').ch=Array(63).fill('zr4');");
  const c = JSON.parse(ev("JSON.stringify(fiberTargets(S.biz[0]).find(x=>x.l.id==='c'))"));
  assert.match(c.no, /1 free, needs 2/);
  ev("ACT.pathMove({id:'w',link:'c'})");
  assert.equal(biz(ev, 'w', 'link'), 'a', 'refused');
  for (const link of ['a', 'd', 'nope']) { ev(`ACT.pathMove({id:'w',link:${lit(link)}})`); assert.equal(biz(ev, 'w', 'link'), 'a', `${link}: not a fiber it can go to`); }
  assert.deepEqual(errors, []);
});

test('a carrier already renting waves on the new fiber ends up with one contract', (t) => {
  const { ev, errors } = game(t, wave + "S.biz.push({id:'w2',type:'wwave',name:'Zay-No Fiber',city:'nyc',city2:'ash',link:'c',slots:3,bw:1,rate:1000,reqs:[],mood:90,since:5,day:0,route:'normal',what:'x'});");
  ev("ACT.pathMove({id:'w',link:'c'})");
  assert.equal(ev("S.biz.filter(b=>b.type==='wwave').length"), 1);
  assert.equal(biz(ev, 'w2', 'slots'), 5); assert.equal(biz(ev, 'w2', 'rate'), 10000); assert.equal(biz(ev, 'w2', 'mood'), 80, 'the unhappier of the two'); assert.equal(biz(ev, 'w2', 'since'), 0);
  assert.match(biz(ev, 'w2', 'what'), /5/);
  assert.deepEqual(errors, []);
});

test('a wave leaves alone the channels kept back for your own traffic', (t) => {
  // 47 channels lit of 64: 17 free, but a quarter of the fiber is kept back, so 1 spare.
  const { ev, errors } = game(t, wave + "S.cm.hold=25;S.links.find(l=>l.id==='c').ch=Array(47).fill('zr4');");
  assert.match(ev("fiberTargets(S.biz[0]).find(x=>x.l.id==='c').no"), /1 left after the 25% you keep back.*needs 2/);
  ev("ACT.pathMove({id:'w',link:'c'})");
  assert.equal(biz(ev, 'w', 'link'), 'a', 'refused');
  ev("S.cm.hold=0;ACT.pathMove({id:'w',link:'c'})");
  assert.equal(biz(ev, 'w', 'link'), 'c', 'nothing kept back: it fits');
  assert.deepEqual(errors, []);
});

// Four managed 400G waves, 1.6T in all, carved out of fiber a's lit capacity.
const mwave = (id = 'm', link = 'a', g = 400, slots = 4) => `S.biz.push({id:'${id}',type:'mwave',g:${g},name:'Photon Express',city:'nyc',city2:'ash',link:'${link}',slots:${slots},bw:1,rate:5000,reqs:[],mood:80,since:0,day:0,route:'normal',what:'x'});`;

test('managed waves need that much spare lit capacity on the new fiber, on leased fiber too, and their capacity moves with them', (t) => {
  // c has 1.6T lit, but a quarter is kept back: 1.2T spare, room for three of the four. b has 3.2T: 2.4T spare.
  const { ev, errors } = game(t, mwave() + "S.cm.hold=25;S.links.find(l=>l.id==='c').ch=Array(4).fill('zr4');");
  const no = () => JSON.parse(ev("JSON.stringify(Object.fromEntries(fiberTargets(S.biz[0]).map(x=>[x.l.id,x.no])))"));
  assert.match(no().c, /Not enough spare capacity/);
  assert.equal(no().b, '');
  ev("ACT.pathMove({id:'m',link:'c'})");
  assert.equal(biz(ev, 'm', 'link'), 'a', '1.6T does not fit in 1.2T');
  // A leased fiber is lit capacity like any other: the reason is the room, not whose glass it is.
  ev("S.links.find(l=>l.id==='b').own=false;S.links.find(l=>l.id==='c').own=false;");
  assert.equal(no().b, '');
  assert.doesNotMatch(no().c, /own fiber/);
  assert.match(no().c, /spare capacity/);
  // What the fiber gives your own traffic follows the waves, at once.
  assert.equal(ev("mwG(S.links.find(l=>l.id==='a'))"), 1600);
  ev("ACT.pathMove({id:'m',link:'b'})");
  assert.equal(biz(ev, 'm', 'link'), 'b');
  assert.equal(ev("mwG(S.links.find(l=>l.id==='a'))"), 0);
  assert.equal(ev("mwG(S.links.find(l=>l.id==='b'))"), 1600);
  assert.equal(ev("dfCap0(S.links.find(l=>l.id==='a'))"), 3200);
  assert.equal(ev("dfCap0(S.links.find(l=>l.id==='b'))"), 1600);
  assert.match(biz(ev, 'm', 'what'), /4/);
  assert.deepEqual(errors, []);
});

test('a managed wave needs a channel as big as it is; a carrier renting the same size there gets one contract, another size does not', (t) => {
  { const { ev, errors } = game(t, mwave('m', 'a', 800, 1) + "S.cm.hold=0;");
    assert.match(ev("fiberTargets(S.biz[0]).find(x=>x.l.id==='c').no"), /Needs a channel lit at/, '400G optics only');
    ev("S.links.find(l=>l.id==='c').ch=Array(8).fill('zr8');");
    assert.equal(ev("fiberTargets(S.biz[0]).find(x=>x.l.id==='c').no"), '');
    assert.deepEqual(errors, []); }
  { const { ev, errors } = game(t, mwave() + mwave('m2', 'b', 100, 2) + "S.cm.hold=0;");
    ev("ACT.pathMove({id:'m',link:'b'})");
    assert.equal(ev("S.biz.filter(b=>b.type==='mwave'&&b.link==='b').length"), 2, '400G and 100G waves stay apart');
    assert.equal(biz(ev, 'm2', 'slots'), 2);
    assert.equal(ev("mwG(S.links.find(l=>l.id==='b'))"), 1800);
    assert.deepEqual(errors, []); }
  { const { ev, errors } = game(t, mwave() + mwave('m2', 'b', 400, 2) + "S.cm.hold=0;");
    ev("ACT.pathMove({id:'m',link:'b'})");
    assert.equal(ev("S.biz.filter(b=>b.type==='mwave').length"), 1);
    assert.equal(biz(ev, 'm2', 'slots'), 6); assert.equal(biz(ev, 'm2', 'rate'), 10000); assert.equal(biz(ev, 'm2', 'g'), 400);
    assert.match(biz(ev, 'm2', 'what'), /6/);
    assert.equal(ev("mwG(S.links.find(l=>l.id==='b'))"), 2400);
    assert.deepEqual(errors, []); }
});

test('fiber pairs follow the same rules as signing them: your own fiber, and pairs still free', (t) => {
  for (const type of ['dfpair', 'pairs', 'capfib']) {
    const { ev, errors } = game(t, pair(type) + pair('pairs', 'q', 'b') + "S.links.find(l=>l.id==='e').x=1;");
    const T = JSON.parse(ev("JSON.stringify(Object.fromEntries(fiberTargets(S.biz[0]).map(x=>[x.l.id,x.no])))"));
    assert.equal(T.c, '', `${type} can go to the free fiber`);
    assert.match(T.b, /already rented/, `${type} cannot join a fiber whose pairs are sold`);
    ev("ACT.pathMove({id:'p',link:'b'})"); assert.equal(biz(ev, 'p', 'link'), 'a');
    ev("ACT.pathMove({id:'p',link:'c'})"); assert.equal(biz(ev, 'p', 'link'), 'c');
    assert.deepEqual(errors, []);
  }
  const { ev } = game(t, pair('dfpair') + "S.links.find(l=>l.id==='c').own=false;");
  assert.match(ev("fiberTargets(S.biz[0]).find(x=>x.l.id==='c').no"), /your own fiber/);
});

test('only working fibers are offered, and a customer on a cut fiber can be moved off it', (t) => {
  const { ev, errors } = game(t, wave + "S.links.find(l=>l.id==='a').cut=S.day+9;S.links.find(l=>l.id==='b').eqDown=S.day+9;" + fib('f', 'nyc', 'ash', 300, 'tf') + "S.links.at(-1).ready=S.day+5;");
  assert.equal(ev("fiberOk(S.biz[0])"), false);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(fiberTargets(S.biz[0]).map(x=>x.l.id))")), ['c']);
  ev("ACT.pathMove({id:'w',link:'c'})");
  assert.equal(ev("fiberOk(S.biz[0])"), true);
  ev("S.links.find(l=>l.id==='c').ready=S.day+5;");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(fiberTargets(S.biz[0]).map(x=>x.l.id))")), [], 'nothing left');
  ev("ACT.pathOpen({id:'w'})");
  assert.match(modal(ev), /no other working fiber/);
  assert.deepEqual(errors, []);
});

test('a pinned circuit rides its path, and takes the load off the direct fibers', (t) => {
  const { ev, errors } = game(t, circuit(100));
  const cash = ev('S.cash');
  const load = () => JSON.parse(ev("JSON.stringify(Object.fromEntries(['a','b','c','d','e'].map(i=>[i,R.load[i]||0])))"));
  const direct = load();
  assert.equal(Math.round(direct.a + direct.b + direct.c), 100, 'by default it takes the direct edge');
  assert.equal(Math.round(direct.d), 0);
  const T = JSON.parse(ev("JSON.stringify(circuitTargets(S.biz[0]))"));
  assert.deepEqual(T.now, ['nyc', 'ash']);
  assert.deepEqual(T.alts.map((x) => x.p), [['nyc', 'bos', 'ash']]);
  assert.equal(T.alts[0].shared, 0, 'nothing in common with the direct fibers');
  ev("ACT.pathOpen({id:'k'})");
  assert.match(modal(ev), /Fully diverse/);
  ev("ACT.pathPin({id:'k',via:'nyc,bos,ash'})");
  const on = load();
  assert.equal(Math.round(on.a + on.b + on.c), 0);
  assert.equal(Math.round(on.d), 100); assert.equal(Math.round(on.e), 100);
  assert.equal(ev("R.l2.k"), 100);
  assert.ok(ev('R.l2lat.k') > 0);
  assert.equal(ev('S.cash'), cash, 'free');
  assert.deepEqual(errors, []);
});

test('a pin falls back to routing while a link on it is down, comes back by itself, and can be undone', (t) => {
  const { ev, errors } = game(t, circuit(100) + "S.biz[0].pin=['nyc','bos','ash'];");
  assert.equal(ev('Math.round(R.load.d)'), 100);
  ev("S.links.find(l=>l.id==='e').cut=S.day+9;compute();");
  assert.equal(ev('Math.round(R.load.d||0)'), 0, 'off the broken path');
  assert.equal(ev('R.l2.k'), 100, 'and the customer keeps its service');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.biz[0].pin)')), ['nyc', 'bos', 'ash'], 'the pin is kept');
  assert.equal(ev('pinUp(S.biz[0])'), false);
  assert.match(ev('pathCtl(S.biz[0])'), /That path is down/);
  ev("S.links.find(l=>l.id==='e').cut=0;compute();");
  assert.equal(ev('Math.round(R.load.d)'), 100, 'back by itself');
  assert.doesNotMatch(ev('pathCtl(S.biz[0])'), /That path is down/);
  ev("ACT.pathOpen({id:'k'})");
  assert.match(modal(ev), /Let routing choose again/);
  ev("ACT.pathAuto({id:'k'})");
  assert.equal(ev("S.biz[0].pin===undefined"), true);
  assert.equal(ev('Math.round(R.load.d||0)'), 0);
  assert.deepEqual(errors, []);
});

test('choosing a route mode unpins; a bad path is refused; SD-WANs, pending deals and puzzles have no move', (t) => {
  const { ev, errors } = game(t, circuit(100));
  for (const via of ['nyc,ash,bos', 'bos,nyc,ash', 'nyc', 'nyc,nowhere,ash', 'nyc,bos,nyc,ash', 'nyc,ash,ash']) {
    ev(`ACT.pathPin({id:'k',via:${lit(via)}})`);
    assert.equal(ev('S.biz[0].pin===undefined'), true, via);
  }
  ev("ACT.pathPin({id:'k',via:null})"); ev("ACT.pathPin({id:'k',via:7})"); ev("ACT.pathPin({id:'nope',via:'nyc,ash'})");
  assert.equal(ev('S.biz[0].pin===undefined'), true);
  ev("S.links=S.links.filter(l=>l.id!=='e');compute();ACT.pathPin({id:'k',via:'nyc,bos,ash'})");
  assert.equal(ev('S.biz[0].pin===undefined'), true, 'a hop with no link');
  ev("ACT.pathPin({id:'k',via:'nyc,ash'})");
  assert.equal(ev('S.biz[0].pin.length'), 2);
  ev("ACT.setRoute({id:'k',m:'fast'})");
  assert.equal(ev('S.biz[0].pin===undefined'), true);
  assert.equal(ev("pathKind({type:'mtrain',city:'nyc',city2:'ash',sites:['nyc','ash']})"), '');
  assert.equal(ev("pathKind({type:'capw',city:'nyc',city2:'ash',due:9,live:false})"), '', 'not delivered yet');
  assert.equal(ev("pathKind({type:'capw',city:'nyc',city2:'ash',due:9,live:true})"), 'circuit');
  assert.equal(ev("pathKind({type:'l2vpn',city:'nyc'})"), '', 'no second city');
  assert.equal(ev("pathKind({type:'wwave',city:'nyc',link:'a'})"), '', 'no second city');
  assert.equal(ev("pathKind({type:'wwave',city:'nyc',city2:'ash'})"), '', 'no fiber yet');
  assert.deepEqual(errors, []);
});

test('with no way round, the most diverse path shares what it must and says so', (t) => {
  // Boston reaches Ashburn only over the direct fibers' trench.
  const { ev, errors } = game(t, circuit(100) + "S.links.find(l=>l.id==='e').trench='ta';S.links=S.links.filter(l=>l.id!=='c');");
  const T = JSON.parse(ev('JSON.stringify(circuitTargets(S.biz[0]))'));
  assert.deepEqual(T.alts.map((x) => [x.p, x.shared]), [[['nyc', 'bos', 'ash'], 1]]);
  ev("ACT.pathOpen({id:'k'})");
  assert.match(modal(ev), /Shares 1 span/);
  assert.deepEqual(errors, []);
});

test('the window warns when a path is too small or too slow for the customer', (t) => {
  const { ev, errors } = game(t, circuit(1e6) + "S.biz[0].latMax=0.1;");
  ev("ACT.pathOpen({id:'k'})");
  assert.match(modal(ev), /Fits only/);
  assert.match(modal(ev), /Over the 0.1 ms budget/);
  assert.deepEqual(errors, []);
});

test('saves: a pin survives a reload, and a bad one is dropped, leaving old saves alone', (t) => {
  const { ev, errors } = game(t, circuit(100) + "S.biz[0].pin=['nyc','bos','ash'];");
  const again = (pin) => ev(`(()=>{const s=JSON.parse(JSON.stringify(packSave(S)));s.biz[0].pin=${lit(pin)};return JSON.stringify(migrate(s).biz[0].pin);})()`);
  assert.deepEqual(JSON.parse(again(['nyc', 'bos', 'ash'])), ['nyc', 'bos', 'ash']);
  for (const bad of ['nyc', [], ['nyc'], ['nyc', 'nowhere', 'ash'], ['bos', 'ash'], ['nyc', 'bos'], ['nyc', 'bos', 'nyc', 'ash'], [1, 2], { a: 1 }])
    assert.equal(again(bad), undefined, JSON.stringify(bad));
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(packSave(S)));delete s.biz[0].pin;return migrate(s).biz[0].pin===undefined;})()"), true);
  // Not a circuit: no pin.
  assert.equal(ev("(()=>{const s=JSON.parse(JSON.stringify(packSave(S)));s.biz[0].type='wwave';s.biz[0].pin=['nyc','ash'];return migrate(s).biz[0].pin===undefined;})()"), true);
  // A stale pin (a POP on it was closed) does no harm: routing carries the circuit.
  ev("delete S.pops.bos;S.links=S.links.filter(l=>l.a!=='bos'&&l.b!=='bos');compute();");
  assert.equal(ev('R.l2.k'), 100);
  assert.deepEqual(errors, []);
});

test('the buttons are in the panels: under a customer in its city, and on the fiber it rents', (t) => {
  const { ev, errors } = game(t, wave + circuit(100));
  ev("UI.tab='cust';UI.sel={type:'city',id:'nyc'};selectCity('nyc');UI.tab='cust';renderPanel();");
  assert.equal(ev("document.querySelectorAll('#panel [data-act=pathOpen]').length"), 2);
  ev("selectLink('a');renderPanel();");
  assert.equal(ev("[...document.querySelectorAll('#panel [data-act=pathOpen]')].length"), 1);
  assert.deepEqual(errors, []);
});
