// Deals belong to Sales: the NOC intern has no sales order any more, the sales desk signs deals for you in its own
// style (src/game/60-features/39-sales-auto.js), and orbit offers go through the desk too (99-pie-sales.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Frankfurt with 400G transit, level 4, nothing breaking, Change Freeze (no fat fingers).
const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=4;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');S.offers=[];S.biz=[];" +
  "ACT.launchBB({city:'fra'});S.pops.fra.rgen=3;ACT.buyTransit({city:'fra',net:'lvl',tier:3});compute()";
function game(t, who) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  if (who) h.ev(`ACT.salesHire({id:'${who}'});closeModal()`);
  return h;
}
const offer = (ev, id, extra = {}) => ev(`S.offers.push(${lit({ id, city: 'fra', name: id, type: 'dia', bw: 1, rate: 6000, reqs: [], exp: 60, ...extra })})`);
const ids = (ev, k) => JSON.parse(ev(`JSON.stringify(S.${k}.map(x=>x.id))`));
const desk = ev => ev('slAutoDay(S.day)');

test('an old save whose intern ran the sales order loads cleanly: the order is gone, its settings are at the sales desk', t => {
  const { ev, dom, errors } = game(t);
  ev("ACT.opsHire({id:'kevin'});closeModal()");
  // What 2.10 saved: the order on with its dials, a day that only signed and declined, a week's tally of it.
  ev(`S.ops.on.sales=true;S.ops.p.sales={acc:true,min:5000};S.ops.on.repair=true;
    S.ops.log=[{d:3,i:'kevin',r:[['sales',2,[]],['decline',5,[]]]},{d:2,i:'kevin',r:[['sales',1,[]],['repair',1,[]]]},{d:1,i:'kevin',r:[]}];
    S.ops.wk={w:0,i:'kevin',n:{sales:3,decline:5,repair:1},wh:{},up:0,mo:0,rev:18000,ff:0};S.ops.rep={w:0,i:'kevin',n:{sales:1},wh:{},up:0,mo:0,rev:6000,ff:0};
    delete S.slAuto;S=migrate(JSON.parse(JSON.stringify(S)))`);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(Object.keys(S.ops.on))')).includes('sales'), false, 'no sales order');
  assert.equal(ev("'sales' in S.ops.p"), false);
  assert.equal(ev('S.ops.on.repair'), true, 'everything else the intern did stays');
  assert.equal(ev("JSON.stringify(S.ops.log)"), '[{"d":2,"i":"kevin","r":[["repair",1,[]]]},{"d":1,"i":"kevin","r":[]}]', 'a day of only deals has nothing left to say');
  assert.equal(ev("JSON.stringify(S.ops.wk)"), '{"w":0,"i":"kevin","n":{"repair":1},"wh":{},"up":0,"mo":0,"ff":0}');
  assert.equal(ev('S.ops.rep'), null, 'a report of only deals goes');
  assert.equal(ev('JSON.stringify(S.slAuto)'), '{"on":true,"min":5000,"wk":null,"rep":null}', 'the switch and the minimum moved to the sales desk');
  // Nobody runs sales in that save, so nothing signs on its own yet: the player signs by hand, as without the intern.
  assert.equal(ev('slP()'), null);
  offer(ev, 'tiny', { rate: 600 }); offer(ev, 'ready');
  ev('for(let i=0;i<3;i++)dayTick()');
  assert.deepEqual(ids(ev, 'offers').slice(0, 2), ['tiny', 'ready'], 'nothing declined, nothing signed');
  assert.equal(ev('S.biz.length'), 0);
  ev("ACT.accept({id:'ready'})");
  assert.deepEqual(ids(ev, 'biz'), ['ready'], 'by hand, as before');
  // The Ops sheet has no sales order, and every order it shows still has a switch.
  dom.window.innerWidth = 360; ev('opsModal()');
  const doc = dom.window.document, ks = [...doc.querySelectorAll('#modalCard [data-act="opsToggle"]')].map(b => JSON.parse(b.dataset.args).k);
  assert.deepEqual(ks, JSON.parse(ev('JSON.stringify(OPS.map(o=>o.k))')));
  assert.ok(!ks.includes('sales'));
  assert.doesNotMatch(doc.getElementById('modalCard').textContent, /Handle sales|signed|declined/);
  // An intern who was not hired never ran the order: nothing to carry over.
  ev("S.ops.intern=null;S.ops.on.sales=true;delete S.slAuto;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.slAuto.on||S.slAuto.min'), 0);
  // Junk at the desk is repaired.
  ev("S.slAuto={on:'yes',min:1234,wk:{w:'x',p:'pirate'},rep:{w:2,p:'eng',n:-4,rev:9e99,x:3,y:'a'}};S=migrate(S)");
  assert.equal(ev('JSON.stringify(S.slAuto)'), '{"on":false,"min":0,"wk":null,"rep":{"w":2,"p":"eng","n":0,"rev":10000000000,"x":3,"y":0}}');
  assert.deepEqual(errors, []);
});

test('nobody at the desk: nothing is signed for you, and the sheet says how to change that', t => {
  const { ev, dom, errors } = game(t);
  ev('S.slAuto.on=true;S.slAuto.min=5000');
  offer(ev, 'tiny', { rate: 600 }); offer(ev, 'ready');
  desk(ev);
  assert.deepEqual(ids(ev, 'offers'), ['tiny', 'ready']);
  ev('ACT.salesAuto();ACT.salesMin()');
  assert.equal(ev('S.slAuto.on&&S.slAuto.min===5000'), true, 'the switches need someone at the desk');
  ev('ACT.salesOpen()');
  assert.match(dom.window.document.getElementById('modalCard').textContent, /you sign every deal by hand/);
  assert.equal(dom.window.document.querySelector('#modalCard [data-act="salesAuto"]'), null);
  assert.deepEqual(errors, []);
});

test('the engineer signs only what the trial says the network can serve: one trial a day, a misfit waits a week', t => {
  const { ev, errors } = game(t, 'eng');
  ev('ACT.salesAuto();ACT.salesMin();ACT.salesMin()');
  assert.equal(ev('S.slAuto.on&&S.slAuto.min'), 5000);
  offer(ev, 'tiny', { rate: 600 }); offer(ev, 'gen', { reqs: ['gen'] }); offer(ev, 'huge', { bw: 1e5, rate: 600 }); offer(ev, 'ok');
  ev("window.__t=0;window.__a=autoOffer;autoOffer=o=>{__t++;return __a(o)}");
  desk(ev);
  assert.equal(ev('__t'), 1, 'one routing trial a day');
  assert.deepEqual(ids(ev, 'offers'), ['gen', 'huge', 'ok'], 'the tiny one is declined; the unmet promise waits without a trial');
  ev('S.day++'); desk(ev);
  assert.deepEqual(ids(ev, 'biz'), ['ok']);
  assert.equal(ev("S.biz[0].by"), undefined, 'an offer nobody brought stays nobody\'s');
  assert.equal(ev('JSON.stringify([S.slAuto.wk.n,S.slAuto.wk.x])'), '[1,1]', 'the week\'s tally');
  ev('S.day++'); desk(ev);
  assert.equal(ev('__t'), 2, 'the misfit is not tried again within the week');
  ev('S.day+=7'); desk(ev);
  assert.equal(ev('__t'), 3);
  ev('autoOffer=__a');
  assert.deepEqual(errors, []);
});

test('the shark signs every offer the moment it lands, promises and all, while the cash covers the commission', t => {
  const { ev, errors } = game(t, 'shark');
  ev('ACT.salesAuto()');
  offer(ev, 'gen', { reqs: ['gen'], by: 'shark' }); offer(ev, 'a', { by: 'shark' }); offer(ev, 'b', { bw: 1e5, rate: 600 });
  ev("window.__t=0;window.__a=autoOffer;autoOffer=o=>{__t++;return __a(o)}");
  const c0 = ev('S.cash');
  desk(ev);
  assert.equal(ev('__t'), 0, 'no trial: the shark does not ask the NOC');
  assert.deepEqual(ids(ev, 'biz'), ['gen', 'a', 'b'], 'all three, the one the network cannot carry too');
  assert.equal(c0 - ev('S.cash'), 12000, 'a month of each of his own deals as commission');
  ev('autoOffer=__a');
  ev('S.cash=1000'); offer(ev, 'c', { by: 'shark' });
  desk(ev);
  assert.deepEqual(ids(ev, 'offers'), ['c'], 'no cash for the commission: it waits');
  assert.deepEqual(errors, []);
});

test('the CEO signs after a trial, and a decline is a handshake away; this week\'s and last week\'s tally in the sheet', t => {
  const { ev, dom, errors } = game(t, 'ceo');
  ev('ACT.salesAuto();for(let i=0;i<5;i++)ACT.salesMin()');
  assert.equal(ev('S.slAuto.min'), 50000);
  ev('window.__r=0;window.__r0=Math.random;Math.random=()=>{__r++;return __r0();}');
  ev("for(let i=0;i<60;i++)S.offers.push({id:'d'+i,city:'fra',name:'Deal '+i,type:'dia',bw:1,rate:600,reqs:[],exp:60})");
  desk(ev);
  ev('Math.random=__r0');
  assert.equal(ev('__r'), 0, 'hashes, not the game\'s random stream');
  const y = ev('S.slAuto.wk.y');
  assert.equal(ev('S.offers.length'), 0, 'every tiny one declined');
  assert.ok(y >= 10 && y <= 30, `about one in three already shaken on (${y} of 60)`);
  assert.equal(ev("S.biz.filter(b=>b.by==='ceo').length"), y);
  const w = ev('S.slAuto.wk.w');
  ev('S.day=(S.slAuto.wk.w+1)*7'); desk(ev);
  assert.equal(ev('S.slAuto.rep.w'), w, 'a new week: last week is the report');
  assert.match(ev('S.log[0].t'), new RegExp(`^Sales desk Last week the CEO declined 60 tiny offers, signed ${y} of those anyway\\.$`));
  ev('S.slAuto.min=0'); offer(ev, 'fit');
  desk(ev);
  assert.ok(ids(ev, 'biz').includes('fit'), 'and signs what fits');
  dom.window.innerWidth = 360; ev('ACT.salesOpen()');
  const card = dom.window.document.getElementById('modalCard');
  assert.equal(card.querySelectorAll('.sl-auto .ops-rep').length, 2, 'last week, and this week so far');
  assert.match(card.querySelector('.sl-auto').textContent, /This week the CEO signed a customer \(\+\$6\.0k\/mo\)\./);
  ev("UI.left='deals';renderLeft()");
  assert.match(dom.window.document.getElementById('left').textContent, /This week the CEO signed a customer/, 'and on the desk\'s card in Deals');
  assert.deepEqual(errors, []);
});

test('the sales sheet with signing for you works at 360 px in every language', t => {
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'pt']) {
    const h = load(lang === 'en' ? {} : { lang });
    const { ev, dom, errors } = h;
    ev(BASE); dom.window.innerWidth = 360;
    const doc = dom.window.document;
    ev("ACT.phoneTab({t:'deals'})");
    doc.querySelector('#leftBody [data-act="salesOpen"]').click();
    doc.querySelector('#modalCard [data-act="salesHire"][data-args*="eng"]').click();
    doc.querySelector('#modalCard [data-act="salesAuto"]').click();
    assert.equal(doc.querySelector('#modalCard [data-act="salesAuto"]').getAttribute('aria-pressed'), 'true', lang);
    doc.querySelector('#modalCard [data-act="salesMin"]').click();
    assert.equal(ev('S.slAuto.min'), 2000, lang);
    assert.doesNotMatch(doc.getElementById('modalCard').textContent, /\b(sales|ops)\.[a-z_]+/, lang);
    assert.deepEqual(errors, [], lang);
    dom.window.close();
  }
});

/* ---------- orbit ---------- */
// A sandbox with London, New York and Frankfurt, a company, a 16-antenna dish with landing rights at each POP and a
// lasered Shortcrust at cov (1: full).
function sky(t, who, cov = 1) {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev } = h;
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;S.pieV=1;S.lvl=13;S.offers=[];S.biz=[]");
  ev("for(const c of ['lon','nyc','fra'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'lf',a:'lon',b:'fra',kind:'wave',tier:3,km:640,sub:false,cut:0,mo:1});for(const c of ['lon','nyc','fra'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['lon','nyc','fra']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX");
  ev(`S.pie.crusts.short.cohorts=[{n:Math.ceil(CRUSTS.short.full*${cov}),day:S.day,las:true}];compute()`);
  if (who) ev(`ACT.salesHire({id:'${who}'});closeModal()`);
  return h;
}
// n orbit offers as the day brings them (pieSpawn on an empty table, compute kept), by whoever is at the desk.
const spawn = (ev, n = 300) => JSON.parse(ev(`(()=>{const out=[];for(let i=0;i<${n};i++){S.offers=[];const t=pieOfferTypes();if(!t.length)break;pieSpawn(pick(pieSlTypes(t)));for(const o of S.offers)out.push({t:o.type,by:o.by||null,bw:o.bw,rate:o.rate,list:BIZ_T[o.type].rate,reqs:o.reqs.slice(),city:o.city});}S.offers=[];return JSON.stringify(out);})()`));
const avg = (l, f) => l.reduce((a, x) => a + f(x), 0) / Math.max(1, l.length);

test('orbit offers without a salesperson are what they were: nobody\'s, list price, no promises', t => {
  const { ev, errors } = sky(t);
  const o = spawn(ev);
  assert.ok(o.length > 200);
  assert.ok(o.every(x => x.by === null && x.rate === x.list && !x.reqs.length));
  assert.deepEqual(errors, []);
});

test('the engineer sells orbit only where the dish has room to spare, and those customers stay', t => {
  const { ev, errors } = sky(t, 'eng');
  const o = spawn(ev);
  assert.ok(o.length > 200 && o.every(x => x.by === 'eng' && x.rate === x.list && !x.reqs.length));
  // Every dish nearly full: the room left fits the smallest deal, but not with the engineer's headroom.
  ev("S.biz=[];window.__room=()=>{const ds=pieDishes();return ds.map(d=>d.g)};for(const c of ['lon','nyc','fra'])S.biz.push({id:'fill'+c,type:'pizza',city:c,city2:null,bw:pieDishes().find(d=>d.city===c).g-30,rate:1,reqs:[],latMax:null,route:'normal',name:'Fill '+c,mood:100,since:0,sites:null});compute()");
  assert.ok(ev("pieOfferTypes().length") > 0, 'the market still has room');
  assert.equal(spawn(ev, 50).filter(x => x.t === 'flywifi').length, 0, 'not even a 20G airline where the dish has 30G left');
  ev("S.salesBak=S.sales.p;S.sales.p=null");
  assert.ok(spawn(ev, 50).some(x => x.t === 'flywifi'), 'without them, that airline is offered');
  ev('S.sales.p=S.salesBak;delete S.salesBak');
  assert.equal(ev("salesLeaveMul({by:'eng',type:'pizza'})"), 0.5, 'their orbit customers renew like the nerds');
  assert.equal(ev("salesLeaveMul({by:'eng',type:'dia'})"), 0.75);
  assert.deepEqual(errors, []);
});

test('the shark sells airlines and cruise lines, the biggest that fits at a quarter more, and promises a full sky', t => {
  const { ev, errors } = sky(t, 'shark', 0.7);
  const plain = (() => { ev("S.sales.p=null"); const x = spawn(ev); ev("S.sales.p='shark'"); return x; })();
  const o = spawn(ev);
  assert.ok(o.every(x => x.by === 'shark' && x.rate === Math.round(x.list * 1.25)));
  assert.ok(o.every(x => ['flywifi', 'boat', 'marsorb'].includes(x.t)), 'no pizza homes while bigger fish are around');
  const size = l => avg(l, x => x.bw * x.rate);
  assert.ok(size(o) > size(plain) * 1.5, `bigger deals (${Math.round(size(o))} vs ${Math.round(size(plain))} a month)`);
  const over = o.filter(x => x.reqs.includes('skyfull')).length / o.length;
  assert.ok(over > 0.35 && over < 0.65, `half of them promised a full sky at 70% (${Math.round(over * 100)}%)`);
  // Signing one pays the commission; the promise makes them grumble, never cancel, until the sky is full.
  ev("S.offers=[];for(let i=0;i<50&&!S.offers.some(o=>o.reqs.includes('skyfull'));i++){S.offers=[];pieSpawn('boat');}");
  const r = JSON.parse(ev("(()=>{const o=S.offers[0],c=S.cash;ACT.accept({id:o.id});const b=S.biz.find(b=>b.id===o.id);return JSON.stringify({paid:c-S.cash,mo:b.bw*b.rate,by:b.by});})()"));
  assert.equal(r.by, 'shark');
  assert.equal(r.paid, r.mo, 'a month of the deal as commission');
  // One the sky serves in full (a full dish is the shark's other way to oversell), promised more than it has.
  ev("S.biz=[{id:'cruise',type:'boat',city:'lon',city2:null,bw:50,rate:34375,reqs:['skyfull'],latMax:null,route:'normal',name:'Promised Cruises',mood:100,since:-100,sites:null,by:'shark'}];compute()");
  assert.ok(ev("bizSf(S.biz[0])") >= 0.95, 'served in full');
  ev("const b=S.biz[0];window.__m=[];for(let i=0;i<80;i++){dayTick();__m.push(Math.round(b.mood));}");
  const m = JSON.parse(ev('JSON.stringify(__m)'));
  assert.ok(ev('S.biz.length') === 1 && m.at(-1) === ev('PIE_GRUMBLE'), `grumbles down to ${ev('PIE_GRUMBLE')} and stays (${m.slice(0, 5)}…${m.at(-1)})`);
  ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute();for(let i=0;i<10;i++)dayTick()");
  assert.ok(ev('S.biz[0].mood') > m.at(-1), 'a full sky keeps the promise: happier again');
  assert.deepEqual(errors, []);
});

test('the CEO and the Founder sign a big orbit deal on the golf course at 30% off; jumpy markets cost him', t => {
  const { ev, errors } = sky(t, 'ceo', 0.8);
  const golfDay = ev("(()=>{for(let d=S.day+1;d<S.day+400;d++)if(slR('golfsky|'+d)<PIE_GOLF_SKY)return d;})()");
  ev('window.__r=0;window.__r0=Math.random;Math.random=()=>{__r++;return __r0();}');
  ev(`S.day=${golfDay};salesGolf(S.day)`);
  ev('Math.random=__r0');
  assert.equal(ev('__r'), 0, 'no draws from the game\'s random stream');
  const b = JSON.parse(ev("JSON.stringify(S.biz.at(-1))"));
  assert.equal(b.type, 'marsorb', 'the Mars mission first');
  assert.equal(b.by, 'ceo');
  assert.equal(b.rate, Math.round(ev('BIZ_T.marsorb.rate') * 0.7), '30% off list');
  assert.deepEqual(b.reqs, ['skyfull'], 'with a promise nobody checked (the crust is at 80%)');
  assert.match(ev('S.log[0].t'), /The CEO and the Founder signed .+ on the golf course: .+ in orbit over .+, 30% off list\. He also promised: Promised a full sky/);
  // Jitters: his own orbit offers get cheaper, a golf deal too, and from 0.6 the Founder does not show up.
  ev('S.pie.founder.jit=0.5');
  const o = spawn(ev, 50);
  assert.ok(o.every(x => x.by === 'ceo' && x.rate === Math.round(x.list * 0.8)), 'orbit prices 20% down at jitters 0.5');
  const n = ev('S.biz.length');
  ev(`salesGolf(${golfDay})`);
  assert.equal(ev('S.biz.length'), n + 1);
  assert.equal(ev('S.biz.at(-1).rate'), Math.round(ev(`BIZ_T.${ev('S.biz.at(-1).type')}.rate`) * 0.7 * 0.8), 'and the golf deal too');
  ev('S.pie.founder.jit=0.7');
  ev(`salesGolf(${golfDay})`);
  assert.equal(ev('S.biz.length'), n + 1, 'the Founder skipped golf');
  assert.match(ev('S.log[0].t'), /The Founder skipped golf/);
  // A golf day of the other kind is on the ground, as before.
  const ground = ev("(()=>{for(let d=S.day+1;d<S.day+400;d++)if(slR('golfsky|'+d)>=PIE_GOLF_SKY)return d;})()");
  ev(`salesGolf(${ground})`);
  assert.equal(ev('BIZ_T[S.biz.at(-1).type].orbit'), undefined, 'on the ground');
  assert.deepEqual(errors, []);
});

test('the sales desk signs orbit offers where the dish has room, without a routing trial', t => {
  const { ev, errors } = sky(t, 'eng');
  ev('ACT.salesAuto()');
  ev("S.offers=[];pieSpawn('pizza');pieSpawn('boat')");
  const want = ids(ev, 'offers');
  ev("window.__t=0;window.__a=autoOffer;autoOffer=o=>{__t++;return __a(o)}");
  ev('slAutoDay(S.day);autoOffer=__a');
  assert.equal(ev('__t'), 0);
  assert.deepEqual(ids(ev, 'biz'), want, 'both signed in one day');
  assert.ok(ev("S.biz.every(b=>b.by==='eng')"));
  // A full dish: an offer that does not fit waits.
  ev("S.offers=[{id:'big',city:'lon',city2:null,name:'Big Boat',type:'boat',bw:1e5,rate:27500,reqs:[],exp:S.day+40,by:'eng'}];slAutoDay(S.day)");
  assert.deepEqual(ids(ev, 'offers'), ['big']);
  assert.deepEqual(errors, []);
});
