const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const fresh = ev => ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
// Fake a network of n POPs spread over the given regions, without building anything.
const fake = (ev, n, regs, peak) => ev(`(()=>{const rs=${JSON.stringify(regs)},pick=[];for(const r of rs){const c=CITIES.find(x=>x.reg===r&&!pick.includes(x.id));pick.push(c.id);}for(const c of CITIES){if(pick.length>=${n})break;if(!pick.includes(c.id)&&rs.includes(c.reg))pick.push(c.id);}S.pops={};for(const c of pick)S.pops[c]={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};S.stats.peak=${peak};return custLevel();})()`);

test('thirteen customer levels, each harder than the last', () => {
  const { ev, errors } = load();
  fresh(ev);
  assert.equal(ev('LEVELS.length'), 13);
  assert.equal(ev('LV_REQ.length'), 13);
  assert.equal(ev('LEVELS.every(L=>L.n&&L.req&&L.unlock&&L.q)'), true, 'every level has a name, a goal, an unlock and a joke');
  assert.equal(ev('LV_REQ.slice(2).every((q,i)=>q.pk>LV_REQ[i+1].pk&&q.pops>LV_REQ[i+1].pops)'), true);
  assert.equal(fake(ev, 10, ['EU', 'AM', 'AS'], 3000), 4, 'level 4 is still where it was');
  assert.equal(fake(ev, 15, ['EU', 'AM', 'AS'], 6000), 4, 'level 5 needs a fourth continent');
  assert.equal(fake(ev, 15, ['EU', 'AM', 'AS', 'OC'], 6000), 5);
  assert.equal(fake(ev, 79, ['EU', 'AM', 'AS', 'OC', 'SA', 'AF'], 60000), 12, 'level 13 needs 80 POPs');
  assert.equal(fake(ev, 80, ['EU', 'AM', 'AS', 'OC', 'SA', 'AF'], 50000), 13);
  ev("S.lvl=8;S.pops={fra:S.pops.fra||{day:0,routers:1,rgen:0}};renderAll()");
  assert.equal(ev("lvlItems().map(x=>x.l+':'+x.max).join()"), 'Peak traffic:21000,POPs:40,Continents:6');
  assert.deepEqual(errors, []);
});

test('traffic eras raise the eyeball ceiling as you level up', () => {
  const { ev, errors } = load();
  fresh(ev);
  const P = ev('CITY.fra.P');
  ev('S.lvl=4');
  assert.equal(ev("eyeP('fra')"), P);
  ev('S.lvl=5');
  assert.ok(Math.abs(ev("eyeP('fra')") - P * 1.15) < 1e-6, '4K everything');
  ev('S.lvl=13');
  assert.ok(Math.abs(ev("eyeP('fra')") / P - 1.15 * 1.15 * 1.2 * 1.25) < 1e-6);
  // with great service, Frankfurt's eyeballs now grow past the old ceiling
  ev("S.pops.fra.bb.d=CITY.fra.P*0.99;R.cityDem={fra:1};R.citySrv={fra:1};const t=compute;compute=()=>{};for(let i=0;i<60;i++){S.day++;dayTick();R.cityDem={fra:1};R.citySrv={fra:1};}compute=t");
  assert.ok(ev('S.pops.fra.bb.d') > P * 1.05, `grew to ${ev('S.pops.fra.bb.d')} of ${P}`);
  assert.deepEqual(errors, []);
});

test('new routers: the 3.2T main line, side-grades, and 3.2T ports only once unlocked', () => {
  const { ev, errors } = load();
  fresh(ev);
  ev('S.lvl=4');
  const up = ev("RG[mainRG(RG[3].cls+1)].n");
  assert.equal(up, 'Absolute Unit 3.2T', 'the 1.6T Absolute Unit upgrades to its big sibling');
  assert.equal(ev("mainRG(1)"), 1, 'old main line keeps its indexes');
  assert.equal(ev('portShown(5)'), false, 'no 3.2T port buttons at level 4');
  assert.equal(ev('waveShown(6)'), false);
  ev('S.lvl=7');
  assert.equal(ev('portShown(5)'), true);
  assert.equal(ev('waveShown(6)'), true);
  ev("S.pops.fra.rgen=3;S.pops.fra.routers=1;ACT.upRouter({city:'fra'})");
  assert.equal(ev("RG[S.pops.fra.rgen].n"), 'Absolute Unit 3.2T');
  ev("const g=RG.findIndex(r=>r.lvl===13);ACT.upRouter({city:'fra',g})");
  assert.equal(ev("RG[S.pops.fra.rgen].n"), 'Absolute Unit 3.2T', 'the Router at the End of the Universe waits for level 13');
  ev("S.lvl=13;ACT.upRouter({city:'fra',g:RG.findIndex(r=>r.lvl===13)})");
  assert.equal(ev("RG[S.pops.fra.rgen].ports"), 256);
  // every model's numbers make sense for its class
  assert.equal(ev("RG.every(r=>PORT[r.maxP]&&LT[r.maxLT]&&r.pn===PORT[r.maxP].n&&r.lvl>=1&&r.lvl<=LEVELS.length)"), true);
  assert.deepEqual(errors, []);
});

test('C+L line systems double the channels; level 12 trenches hold eight pairs', () => {
  const { ev, errors } = load();
  fresh(ev);
  ev("S.lvl=6;ACT.buildPop({city:'ams'});S.pops.fra.rgen=S.pops.ams.rgen=3;S.links.push({id:'own1',a:'fra',b:'ams',kind:'df',own:true,km:450,sys:'roadm',ch:[],ready:0,mo:500,day:0,cut:0,pairs:2});compute()");
  assert.equal(ev("chMax(S.links[0])"), 128);
  const c0 = ev('S.cash');
  ev("ACT.upSys({id:'own1'})");
  assert.equal(ev('S.links[0].sys'), 'cl');
  assert.equal(c0 - ev('S.cash'), 2 * ev('DF_SYS.cl.cost'), 'both lit pairs get the new gear');
  assert.equal(ev("chMax(S.links[0])"), 256);
  assert.equal(ev("pairsMax(S.links[0])"), 4);
  ev('S.lvl=12');
  assert.equal(ev("pairsMax(S.links[0])"), 8);
  ev("S.links[0].pairs=8;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.links[0].pairs'), 8, 'kept at level 12');
  ev("S.lvl=5;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.links[0].pairs'), 4, 'clamped below level 12');
  ev("S.links[0].sys='cl';S.links[0].ch=['tp32'];compute()");
  assert.match(ev("chWhy(S.links[0],'tp32')"), /level 8/);
  assert.deepEqual(errors, []);
});

test('paid-peering giants give you a free PNI once you are big enough', () => {
  const { ev, errors } = load();
  fresh(ev);
  ev("S.lvl=5;compute()");
  assert.equal(ev("peerOk('dtk','pni','fra').fee"), ev('NET.dtk.paidFee'));
  assert.match(ev("offTransitHint('dtk','fra')"), /Free from customer level 6/);
  const p = "({id:'p1',city:'fra',net:'dtk',tier:2,n:1})";
  assert.equal(ev(`pniMo(${p},0)`), ev('PORT[2].pni') + ev('NET.dtk.paidFee'));
  ev('S.lvl=6');
  assert.equal(ev("peerOk('dtk','pni','fra').free"), true);
  assert.match(ev("offTransitHint('dtk','fra')"), /too big to charge/);
  assert.equal(ev(`pniMo(${p},0)`), ev('PORT[2].pni'), 'only the port is left to pay');
  assert.equal(ev("peerOk('dtk','ix','fra').ok"), false, 'still no IX peering');
  assert.equal(ev("NETS.filter(n=>n.freeLv).every(n=>n.pol==='paid'&&!n.perG&&n.freeLv>4)"), true, 'Korean sender-pays stays');
  assert.deepEqual(errors, []);
});

test('the new customer types turn up at their levels', () => {
  const { ev, errors } = load();
  fresh(ev);
  ev("for(const c of ['ams','lon','par','ash','nyc'])ACT.buildPop({city:c});S.lvl=4;S.offers=[];for(let i=0;i<600;i++){spawnOffer();S.offers.length=0;}");
  const types = lv => ev(`(()=>{S.lvl=${lv};const seen=new Set();for(let i=0;i<1500;i++){S.offers=[];spawnOffer();for(const o of S.offers)seen.add(o.type);}return [...seen].sort().join();})()`);
  const at4 = types(4).split(',');
  for (const t of ['esport', 'sov', 'cgame', 'metav', 'agi', 'mars']) assert.ok(!at4.includes(t), `${t} not before its level`);
  const at13 = types(13).split(',');
  for (const t of ['esport', 'sov', 'cgame', 'metav', 'agi', 'mars']) assert.ok(at13.includes(t), `${t} shows up at level 13 (${at13})`);
  ev("S.offers=[];S.lvl=13;let o;for(let i=0;i<3000&&!o;i++){S.offers=[];spawnOffer();o=S.offers.find(x=>x.type==='agi');}window.__o=o");
  assert.ok(ev('__o.bw') >= 12800 && ev("__o.reqs.includes('diverse')"), 'AGI labs want huge diverse AI WANs');
  assert.deepEqual(errors, []);
});

test('old saves keep their level; nonsense levels are clamped', () => {
  const { ev, errors } = load();
  fresh(ev);
  ev("S.lvl=4;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.lvl'), 4);
  ev("S.lvl=99;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.lvl'), 13);
  ev("UI.left='goals';UI.leftOpen=true;renderAll()");
  assert.match(ev("document.getElementById('leftBody').textContent"), /Customer level 13 of 13/);
  assert.match(ev("document.getElementById('leftBody').textContent"), /You are the internet/);
  assert.deepEqual(errors, []);
});

test('a big old network that jumps several levels hears about each one in the event log', () => {
  const { ev, errors } = load();
  fresh(ev);
  ev(`S.lvl=4;${"(()=>{const rs=['EU','AM','AS','OC','SA'],add=c=>{S.pops[c]=S.pops[c]||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};};for(const r of rs)add(CITIES.find(c=>c.reg===r).id);for(const c of CITIES){if(Object.keys(S.pops).length>=25)break;if(rs.includes(c.reg))add(c.id);}})()"};S.stats.peak=12500;document.getElementById('toasts').innerHTML='';dayTick()`);
  assert.equal(ev('S.lvl'), 7);
  const t = ev("S.log.map(e=>e.t).join(' | ')");
  for (const n of ['Customer level 5', 'Customer level 6', 'Customer level 7']) assert.ok(t.includes(n), n);
  assert.deepEqual(errors, []);
});
