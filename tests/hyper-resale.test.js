// Reselling your own fiber, phase 6 (38-hyper-resale.js): the resale desk, Glass Half Full Wholesale, offers carriers a
// spare pair (an IRU: up front, then a little a month) or a managed wave, only on fiber you built; what you sell is gone
// from your own replication and training; it is priced well below tenants, never IP transit or an L2VPN, never counts
// toward levels or goals; the capacity market stays out of this charter; the intern asks every month; saves; screens.
// These mechanics tests pin each country's users to its main city (one user zone) and keep the data lake out (it has
// its own test in hyper-traffic.test.js); zones are tested in hyper-zones-users.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

/* Regions in Frankfurt and Paris (Rack Shacks, 400 Gbps each), German and French users at home in each. Your own dark
   fiber Frankfurt–Paris (df1, two 400G optics, one pair lit of four) and a leased one Frankfurt–Amsterdam (df2). */
const df = (id, a, b, own, n) => `S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'df',own:${own},sys:'roadm',ch:Array(${n}).fill('zr4'),km:Math.round(kmBetween('${a}','${b}')*1.05),ready:0,day:0,cut:0,mo:100,trench:'${own ? 'own:' : ''}${id}',pairs:1});`;
function net(t, seed = 7) {
  const h = load({ seed });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});HS_ZC.s=S;for(const k of ['DE','FR','NL','GB','US','BE','ES','IN'])if(ccInfo(k))HS_ZC.m.set(k,[[ccInfo(k).main,1]]);HS_LAKE[0]=99;S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;ACT.buyTransit({city:S.home,net:'cog',tier:3});ACT.buyTransit({city:'par',net:'cog',tier:3});S.offers=[];" +
    "S.hs.rg.par={t:0,ready:0,mw:5};S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:400,since:0};S.links=[];" + df('df1', 'fra', 'par', true, 2) + df('df2', 'fra', 'ams', false, 2) + 'compute()');
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const offer = (k, g = 0, l = 'df1') => `(()=>{const L=S.links.find(x=>x.id==='${l}'),P=hsrPrice(L,'${k}',${g}),o={id:'r'+S.hs.rs.o.length+Math.random().toString(36).slice(2,6),l:'${l}',k:'${k}',g:${g},n:'Photon Express',up:P.up,mo:P.mo,exp:S.day+9};S.hs.rs.o.push(o);return o.id})()`;

test('the desk sells only fiber you built: a spare pair as an IRU, paid up front, never lit by you afterwards', (t) => {
  const { ev, errors } = net(t);
  assert.equal(ev("hsrPairs(S.links[0])"), 3, 'four pairs in the trench, one lit');
  assert.equal(ev("hsrPairs(S.links[1])"), 0, 'leased glass is not yours');
  assert.deepEqual(J(ev, 'hsrWaveG(S.links[1])'), []);
  // Offers only ever land on your own fiber.
  for (let i = 0; i < 12; i++) ev('S.hs.rs.o=[];S.hs.rs.nx=S.day;hsrDay(S.day);S.day++');
  assert.ok(ev("S.hs.rs.o.length") >= 1);
  const os = J(ev, "(()=>{const out=[];for(let d=0;d<40;d++){S.hs.rs.o=[];hsrSpawn(S.day+d);out.push(...S.hs.rs.o);}S.hs.rs.o=[];return out})()");
  assert.ok(os.length > 5 && os.every((o) => o.l === 'df1'), os.map((o) => o.l).join());
  assert.ok(os.some((o) => o.k === 'iru') && os.some((o) => o.k === 'w'), 'pairs and waves');
  assert.ok(os.every((o) => o.k === 'iru' || [100, 400].includes(o.g)));
  // A leased fiber's offer (an old save, say) is refused.
  ev('S.hs.rs.o=[]');
  const bad = ev(offer('iru', 0, 'df2'));
  ev(`ACT.hsrTake({id:'${bad}'})`);
  assert.equal(ev("S.biz.length"), 0);
  // An IRU: a sum up front, a small fee a month, a carrier on the fiber; the trench has one spare pair fewer.
  const id = ev(offer('iru'));
  const o = J(ev, `S.hs.rs.o.find(x=>x.id==='${id}')`);
  assert.ok(o.up > 20 * o.mo, `mostly up front: ${o.up} then ${o.mo}/mo`);
  ev('after()');
  const cash = ev('S.cash');
  ev(`ACT.hsrTake({id:'${id}'})`);
  const b = J(ev, "S.biz.find(b=>b.type==='dfpair')");
  assert.equal(b.link, 'df1');
  assert.equal(b.gh, 1);
  assert.equal(b.rate, o.mo);
  assert.ok(b.te - ev('S.day') >= 3600, 'a 10 to 20 year term');
  assert.equal(ev('S.cash') - cash, o.up);
  assert.equal(ev("hsrPairs(S.links[0])"), 2);
  // Two pairs sold: one more you can still light, then none.
  ev(`ACT.hsrTake({id:${offer('iru')}})`);
  assert.equal(ev("S.biz.filter(b=>b.type==='dfpair').length"), 2);
  ev("const L=S.links[0];L.pairs=2;L.ch=Array(chMax(L)).fill('zr4');S.log=[];ACT.addPair({id:'df1'})");
  assert.equal(ev('S.links[0].pairs'), 2, 'that pair is the carrier\'s');
  assert.match(ev('JSON.stringify(S.log)'), /sold as an IRU/);
  assert.deepEqual(errors, []);
});

test('a wave sold is gone from your own bulk: replication and training get less on that fiber', (t) => {
  const { ev, errors } = net(t);
  ev("S.links=S.links.filter(l=>l.id!=='df2');S.hs.jobs.push({id:'j1',n:'Overfit and Sons',a:'fra',b:'par',g:3200,tb:1e9,done:0,due:S.day+99,fee:1,start:S.day});compute()");
  const rep0 = ev('R.hs.rep.fra.got+R.hs.rep.par.got'), job0 = ev('R.hs.jobs.j1.got');
  assert.ok(job0 > 400, 'training takes what replication left: ' + job0);
  // Without the training run tonight, the desk sees 400G spare and a carrier buys it.
  ev("const J0=S.hs.jobs;S.hs.jobs=[];compute();globalThis.J0=J0");
  assert.ok(ev('hsrWaveG(S.links[0]).includes(400)'));
  ev(`ACT.hsrTake({id:${offer('w', 400)}})`);
  assert.equal(ev("mwG(S.links[0])"), 400, 'counted as sold managed waves');
  assert.equal(ev("dfCap(S.links[0])"), 400, 'off your own capacity');
  ev('S.hs.jobs=globalThis.J0;compute()');
  assert.ok(Math.abs(ev('R.hs.rep.fra.got+R.hs.rep.par.got') - rep0) < 1e-6, 'replication still fits');
  assert.ok(Math.abs(ev('R.hs.jobs.j1.got') - (job0 - 400)) < 1e-6, `training lost the wave: ${ev('R.hs.jobs.j1.got')} vs ${job0}`);
  assert.equal(ev("hsrWaveG(S.links[0]).length"), 0, 'nothing more to sell');
  // The fiber panel shows it, as "Sold as managed waves".
  ev("selectLink('df1');renderPanel()");
  const txt = ev("$('panel').textContent");
  assert.match(txt, /Resale: Glass Half Full Wholesale/);
  assert.match(txt, /Sold as managed waves/);
  assert.match(txt, /Photon Express/);
  assert.deepEqual(errors, []);
});

test('never transit, never an L2VPN, never a tenant; priced well below tenants; never counts toward levels or goals', (t) => {
  const { ev, errors } = net(t);
  ev("S.offers=[];for(let d=0;d<60;d++){hsrSpawn(S.day+d);for(const o of S.hs.rs.o.slice())ACT.hsrTake({id:o.id});S.hs.rs.o=[];compute()}");
  const types = J(ev, '[...new Set(S.biz.map(b=>b.type))].sort()');
  assert.ok(types.length >= 1 && types.every((k) => k === 'dfpair' || k === 'mwave'), types.join());
  assert.ok(ev("S.biz.every(b=>BIZ_T[b.type].fiber&&!BIZ_T[b.type].l2&&b.type!=='transit'&&b.type!=='cloud')"));
  assert.equal(ev('hsTen().length'), 0, 'carriers, not tenants');
  assert.ok(ev("S.offers.every(o=>o.type==='cloud')"));
  // A 100G wave earns a small fraction of what 100G of tenants pays.
  const per = ev("hsrPrice(S.links[0],'w',100).mo/100"), ten = ev("Math.min(...Object.values(CLOUD_TENANTS).map(K=>cloudRate(K.p)))");
  assert.ok(per < ten / 4, `${per}/Gbps vs ${ten}/Gbps`);
  // Levels and goals: the same with or without the sales, however much they bring in.
  ev('compute()');
  const lv = ev('custLevel()'), gs = J(ev, 'goals().map(g=>!!g.ok())'), peak = ev('R.served'), btw = ev('R.hs.btw');
  ev("for(const b of S.biz)b.rate*=1000;compute()");
  assert.ok(ev('R.rev.business') > 2e5, 'rich: ' + ev('R.rev.business'));
  assert.equal(ev('custLevel()'), lv);
  assert.deepEqual(J(ev, 'goals().map(g=>!!g.ok())'), gs);
  assert.equal(ev('R.served'), peak);
  assert.ok(ev('R.hs.btw') <= btw + 1e-9);
  // The capacity market does not trade a Hyperscaler's fiber, and its tab is not there.
  ev("S.biz=[];S.cm.p.spec.on=S.cm.p.w100.on=S.cm.p.w400.on=S.cm.p.iru.on=true;S.cm.p.spec.min=S.cm.p.w100.min=S.cm.p.iru.min=1;cmRelist();for(let i=0;i<200;i++)cmDay(S.day+i)");
  assert.equal(ev('S.biz.length'), 0);
  assert.doesNotMatch(ev('dashTabs()'), /dashTab.*"market"/);
  // Waves sold to other players: only on fiber you built.
  assert.deepEqual(J(ev, 'fedWaveLit()'), ['fra|par']);
  assert.equal(ev("fedWaveRoom('ams','fra',100)"), false);
  assert.deepEqual(errors, []);
});

test('the intern asks about the Spare Pair Affair every month; a launch freeze holds sales; saves', (t) => {
  const { ev, dom, errors } = net(t);
  ev(`ACT.hsrTake({id:${offer('iru')}});S.log=[];S.hs.rs.mo=-1;hsrDay(S.day)`);
  assert.match(ev('JSON.stringify(S.log)'), /Spare Pair Affair/);
  ev('S.log=[];hsrDay(S.day)');
  assert.doesNotMatch(ev('JSON.stringify(S.log)'), /Spare Pair Affair/, 'once a month');
  ev('S.day+=31;hsrDay(S.day)');
  assert.match(ev('JSON.stringify(S.log)'), /Spare Pair Affair/);
  // Frozen: no sales.
  const id = ev(offer('w', 100));
  ev("CX_FREEZE.push(()=>({show:'a test',until:S.day+1}))");
  ev(`ACT.hsrTake({id:'${id}'})`);
  assert.ok(ev(`S.hs.rs.o.some(o=>o.id==='${id}')`), 'refused during the freeze');
  ev('CX_FREEZE.pop()');
  // The card offers it, in rows of two buttons, on a phone and a desktop.
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};renderAll()`);
    const card = ev('hsCard()');
    assert.match(card, /Glass Half Full Wholesale: 1 sale/);
    assert.match(card, /Photon Express: 1× 100G managed wave on your Frankfurt–Paris fiber/);
    const d = dom.window.document.createElement('div');
    d.innerHTML = card;
    for (const b of d.querySelectorAll('.btns')) assert.ok(b.querySelectorAll('button').length <= 2);
  }
  ev("selectLink('df2');renderPanel()");
  assert.match(ev("$('panel').textContent"), /Leased glass is not yours to resell/);
  // Saves: a round trip keeps it; junk is repaired; an old save gets the defaults.
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  assert.deepEqual(back.hs.rs, s.hs.rs);
  assert.equal(back.biz.find((b) => b.type === 'dfpair').gh, 1);
  const old = { ...s, hs: { ...s.hs } };
  delete old.hs.rs;
  assert.deepEqual(J(ev, `migrate(${JSON.stringify(old)}).hs.rs`), { o: [], nx: s.day + 60, mo: -1 });
  const junk = { ...s, hs: { ...s.hs, rs: { o: [{ id: 'a', l: 'df2', k: 'iru' }, { id: 'b', l: 'df1', k: 'zz', g: 7, up: -5, mo: 'x' }, { id: 'b', l: 'df1' }, 'x', { l: 'df1' }], nx: 'soon', mo: 'may' } } };
  const m = J(ev, `migrate(${JSON.stringify(junk)}).hs.rs`);
  assert.deepEqual(m.o.map((o) => [o.id, o.k, o.g, o.up, o.mo]), [['b', 'w', 100, 0, 1]]);
  assert.deepEqual([m.nx, m.mo], [0, -1]);
  ev(`S=migrate(${JSON.stringify(junk)});compute();for(let i=0;i<3;i++)dayTick()`);
  assert.deepEqual(errors, []);
});
