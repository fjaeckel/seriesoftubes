// Charters (#300): a Normal game asks what it is building before anything else, in a popup that waits for an answer:
// Global backbone, Low-latency boutique or Cable broker. The broker builds and lights glass from day one at the usual
// prices, runs its own goal ladder and wins Glass Baron; everything else unlocks by level as always. Classic networks
// may lay their own subsea cable from customer level 9 as well as after the Tier 1 win.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const modal = (ev) => ev("document.getElementById('modal').hidden?'':document.getElementById('modal').className");
function picked(k, opts) {
  const h = load({ seed: 300, ...opts });
  h.ev(`ACT.start({});ACT.charter({k:'${k}'})`);
  return h;
}
// A dark fiber of your own, ready and lit, between two cities with POPs.
const df = (id, a, b, more = '') => `(()=>{for(const c of ['${a}','${b}'])S.pops[c]=S.pops[c]||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:RG.length-1};
  S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'df',own:true,sys:'roadm',ch:['tp16','tp16'],km:kmBetween('${a}','${b}'),sub:isSub('${a}','${b}'),cable:null,mo:0,trench:'${id}',cut:0,day:0,ready:0,spares:false${more}});})()`;

test('a new Normal game asks for its charter first, and the popup waits for an answer', () => {
  const { ev, dom, errors } = load({ seed: 300 });
  ev('window.__TUBES_CHARTER__=true;ACT.start({})');
  assert.equal(modal(ev), 'charter', 'the picker is open, and an open window holds the clock');
  const opts = [...dom.window.document.querySelectorAll('#modalCard .chopt')].map((b) => JSON.parse(b.dataset.args).k);
  assert.deepEqual(opts, ['global', 'boutique', 'broker']);
  assert.match(dom.window.document.getElementById('modalCard').textContent, /Glass Baron/, 'each charter says what it is and how it wins');
  assert.equal(ev('UI.tutLater'), true, 'the tutorial waits for the charter');
  // Escape, or anything that closes the window, does not get past it.
  ev("dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  assert.equal(modal(ev), 'charter');
  ev('closeModal();renderAll()');
  assert.equal(modal(ev), 'charter', 'closed some other way, it comes straight back');
  dom.window.document.querySelector('#modalCard [data-args*="broker"]').click();
  assert.equal(ev('S.charter'), 'broker');
  assert.equal(ev('S.chartSet'), true);
  assert.equal(modal(ev), '', 'signed: the window closes and the game runs');
  assert.equal(ev('UI.tutLater'), false, 'and the tutorial may start');
  ev("ACT.charter({k:'global'})");
  assert.equal(ev('S.charter'), 'broker', 'one charter for the life of the network');
  assert.deepEqual(errors, []);
});

test('sandbox, scenarios and puzzles never ask; a save still in its first month that never picked does', () => {
  for (const o of ["{mode:'sandbox'}", '{scn:SCN[0]}']) {
    const { ev, errors } = load({ seed: 300 });
    ev(`window.__TUBES_CHARTER__=true;beginGame('X','fra',${o});if(UI.pendGame)ACT.pitchSkip()`);
    assert.notEqual(modal(ev), 'charter', o);
    assert.equal(ev('charterDue()'), false, o);
    assert.deepEqual(errors, []);
  }
  const { ev, errors } = load({ seed: 300 });
  ev('ACT.start({})');
  const s = JSON.parse(ev('JSON.stringify(S)'));
  ev(`window.__TUBES_CHARTER__=true;S=migrate(${JSON.stringify({ ...s, day: 12, chartSet: false })});closeModal();renderAll()`);
  assert.equal(modal(ev), 'charter', 'a save in its first month that never picked is asked on load');
  ev(`S=migrate(${JSON.stringify({ ...s, day: 40, chartSet: false })});closeModal();renderAll()`);
  assert.equal(modal(ev), '', 'past the first month it is a Global backbone, as before');
  assert.deepEqual([ev('S.charter'), ev('S.chartSet')], ['global', true]);
  assert.deepEqual(errors, []);
});

test('the broker has glass and the gear to light it from day one, at the usual prices', () => {
  const { ev, errors } = picked('broker');
  assert.equal(ev('lvl()'), 1, 'still customer level 1');
  assert.equal(ev('glassLvl()'), ev('LEVELS.length'));
  for (const o of ['zr4', 'zr8', 'tp16', 'tp32']) {
    assert.equal(ev(`techOk('opt','${o}',OPT.${o}.lvl)`), true, o);
    assert.equal(ev(`optCost('${o}')`), ev(`Math.round(OPT.${o}.cost*hwMul('opt'))`), `${o} at the catalog price, no demo markup`);
  }
  for (const k of ['lite', 'roadm', 'cl']) assert.equal(ev(`sysCost('${k}')`), ev(`DF_SYS.${k}.cost`), k);
  assert.equal(ev('digMul()'), 1, 'no pioneer markup for digging');
  assert.equal(ev('cabOpen()'), true, 'own subsea cables');
  assert.equal(ev('pairsMax({sub:false})'), ev('PAIRS_BIG'));
  assert.equal(ev('RG.every((r,g)=>r.cls>RG_GLASS||rgOpen(g))'), true, 'every router the optics need');
  // Dark fiber on the best line system, at level 1.
  ev("ACT.buildPop({city:'ams'});UI.pending={a:'fra',b:'ams'};UI.dfSrc='lease';UI.dfSys='cl';ACT.orderDf()");
  assert.equal(ev("S.links.filter(l=>l.kind==='df').map(l=>l.sys).join()"), 'cl');
  // The rest of the game still unlocks by level.
  ev('ACT.buyTE()');
  assert.ok(!ev('S.te'), 'Auto-TE waits for customer level 3');
  assert.equal(ev("techOk('rg',RG.findIndex(r=>r.cls>RG_GLASS),99)"), false);
  assert.deepEqual(errors, []);
});

test('the other charters keep their gates; own subsea cables open at level 9 for everyone (#300)', () => {
  for (const k of ['global', 'boutique']) {
    const { ev, errors } = picked(k);
    assert.equal(ev('glassLvl()'), 1);
    assert.equal(ev("techOk('opt','tp16',OPT.tp16.lvl)"), false, `${k}: optics still follow the level`);
    assert.equal(ev('digMul()'), ev('PIONEER'));
    ev("ACT.buildPop({city:'ams'});UI.pending={a:'fra',b:'ams'};UI.dfSrc='lease';UI.dfSys='lite';ACT.orderDf()");
    assert.equal(ev("S.links.filter(l=>l.kind==='df').length"), 0, `${k}: no dark fiber at level 1`);
    ev('S.lvl=8');
    assert.equal(ev('cabOpen()'), false);
    assert.match(ev("ownCabWhy('lon','nyc')"), /level 9, or Tier 1/);
    ev('S.lvl=9');
    assert.equal(ev('cabOpen()'), true, `${k}: level 9 lays its own subsea cable`);
    ev('S.lvl=1;S.won=true');
    assert.equal(ev('cabOpen()'), true, `${k}: so does a Tier 1 at any level`);
    assert.deepEqual(errors, []);
  }
});

test('the broker runs its own ladder, every goal can be met, and Glass Baron is its own win', () => {
  const { ev, dom, errors } = picked('broker');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(goals().map(g=>g.id))')),
    ['bk_df', 'bk_wave', 'bk_pair', 'bk_sea', 'bk_deal', 'bk_10k', 'bk_16t', 'bk_c4', 'bk_10t', 'bk_win']);
  ev("ACT.leftTab({t:'goals'});renderAll()");
  assert.match(dom.window.document.getElementById('left').textContent, /0\/10/);
  assert.match(dom.window.document.getElementById('left').textContent, /Glass Baron/, 'the Glass Baron card');
  const ok = (id) => ev(`BROKER_GOALS.find(g=>g.id==='${id}').ok()`);
  for (const id of ['bk_df', 'bk_wave', 'bk_pair', 'bk_sea', 'bk_deal', 'bk_10k', 'bk_16t', 'bk_c4', 'bk_10t', 'bk_win']) assert.equal(ok(id), false, `${id} not met on day 0`);
  // Glass across Europe, and cables over the oceans onto six continents.
  ev(df('e1', 'fra', 'ams') + ';' + df('e2', 'ams', 'ham'));
  for (const [id, a, b] of [['s1', 'lon', 'nyc'], ['s2', 'sin', 'per'], ['s3', 'for', 'lag']]) ev(df(id, a, b));
  ev('compute()');
  assert.equal(ok('bk_df'), true);
  assert.equal(ok('bk_sea'), true);
  assert.equal(ok('bk_16t'), true, 'fra–ams–ham, 3.2T each');
  assert.equal(ok('bk_c4'), true);
  assert.equal(ev('cableConts()'), 6);
  assert.ok(ok('bk_10k'), `${Math.round(ev('glassKm()'))} km of own glass`);
  // A seat on a consortium cable, or a leased IRU, is not your own glass.
  assert.equal(ev("ownGlassL({kind:'df',own:true,seat:true,ready:0})||ownGlassL({kind:'df',own:false,ready:0})"), false);
  // Carriers buy: a wave, a pair, a delivered subsea deal of 12.8T worth more than $1M a month.
  ev(`S.biz.push({id:'w',type:'wwave',city:'fra',city2:'ams',link:'e1',slots:2,bw:1,rate:3000,reqs:[],mood:100,since:0,name:'W'},
    {id:'p',type:'dfpair',city:'ams',city2:'ham',link:'e2',bw:1,rate:2000,reqs:[],mood:100,since:0,name:'P'},
    {id:'d',type:'capsub',city:'lon',city2:'nyc',bw:12800,rate:90,reqs:[],mood:100,since:0,live:true,due:400,name:'D'});S.stats.capDone=1;`);
  for (const id of ['bk_wave', 'bk_pair', 'bk_deal', 'bk_10t', 'bk_win']) assert.equal(ok(id), true, id);
  assert.equal(ev('capSoldG()'), 800 + 12800, 'waves at 400G each, plus subsea capacity; a dark pair is the buyer’s to light');
  // A deal not yet delivered sells nothing.
  ev("S.biz.find(b=>b.id==='d').live=false");
  assert.equal(ok('bk_win'), false);
  ev("S.biz.find(b=>b.id==='d').live=true");
  const cash = ev('S.cash');
  ev('checkGoals()');
  assert.equal(ev('goals().every(g=>S.done[g.id]!==undefined)'), true, 'the whole ladder');
  assert.equal(ev('S.cash') - cash, ev('BROKER_GOALS.reduce((a,g)=>a+g.r,0)'), 'every reward paid');
  assert.ok(ev('S.baronWon') > 0, 'Glass Baron won');
  assert.equal(ev('!!S.won'), false, 'Tier 1 is still its own thing');
  assert.equal(ev("S.ach&&S.ach.baron!==undefined"), true, 'with its badge');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Glass Baron/);
  assert.equal(ev("Object.keys(S.done).some(k=>GOALS.some(g=>g.id===k))"), false, 'the classic ladder is untouched');
  assert.deepEqual(errors, []);
});

test('a broker hears from carriers: more wave and pair offers, and capacity deals by phone', () => {
  const share = (k) => {
    const { ev } = picked(k);
    ev("S.lvl=3;" + df('e1', 'fra', 'ams') + ';' + df('e2', 'fra', 'par') + ';compute()');
    return ev("(()=>{let n=0,c=0;for(let i=0;i<400;i++){S.offers=[];spawnOffer();for(const o of S.offers){c++;if(['wwave','dfpair','pairs'].includes(o.type))n++;}}return n/Math.max(1,c);})()");
  };
  const g = share('global'), b = share('broker');
  assert.ok(b > g * 1.8, `capacity offers: ${(b * 100).toFixed(0)}% for a broker, ${(g * 100).toFixed(0)}% for a backbone`);
  const { ev, errors } = picked('broker');
  const day = ev('(()=>{for(let d=BROKER_CALL_FROM;d<2000;d++)if(hstr(S.asn+"|capcall|"+d)%BROKER_CALL===0)return d;return -1;})()');
  assert.ok(day >= 60);
  ev(`S.offers=[];brokerDay(${day})`);
  const o = JSON.parse(ev('JSON.stringify(S.offers)'));
  assert.equal(o.length, 1);
  assert.ok(['capw', 'capsub', 'capfib'].includes(o[0].type), 'a capacity deal from the conferences’ routes');
  ev('S.offers=[];for(let d=0;d<BROKER_CALL_FROM;d++)brokerDay(d)');
  assert.equal(ev('S.offers.length'), 0, 'not in the first two months');
  // Capacity conferences are open to a broker at any level.
  assert.equal(ev('glassLvl()>=CAP_LV'), true);
  assert.deepEqual(errors, []);
});

test('saves keep the broker and its win, and refuse charters that do not exist', () => {
  const { ev, errors } = picked('broker');
  ev('S.baronWon=1234');
  const s = JSON.parse(ev('JSON.stringify(S)'));
  ev(`S=migrate(${JSON.stringify(s)})`);
  assert.deepEqual([ev('S.charter'), ev('S.baronWon'), ev('charter()')], ['broker', 1234, 'broker']);
  ev(`S=migrate(${JSON.stringify({ ...s, charter: 'evil', baronWon: 'x' })})`);
  assert.deepEqual([ev('S.charter'), ev('S.baronWon')], ['global', 0]);
  ev(`S=migrate(${JSON.stringify(s)});S.scn={id:'x'}`);
  assert.equal(ev('charter()'), 'global', 'a scenario plays as the classic game');
  assert.equal(ev('glassLvl()'), ev('lvl()'));
  assert.deepEqual(errors, []);
});
