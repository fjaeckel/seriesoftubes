// The capacity market, Lambda Bazaar (37-fiber-market.js): products from spectrum to 1.6T waves and dark pairs, demand
// that moves and grows, thresholds, managed waves carved out of your own capacity, customers moving up a size, the
// Cable broker's fee and forecast, and saves.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();S.cash=1e9;S.lvl=6;S.offers=[];S.biz=[];S.inc=[]");
const fiber = (ev, id, a, b, ch = 'tp16', n = 8) => ev(`for(const c of ['${a}','${b}'])if(!S.pops[c])ACT.buildPop({city:c});closeModal();
  S.links.push({id:'${id}',a:'${a}',b:'${b}',kind:'df',own:true,sys:'cl',ch:Array(${n}).fill('${ch}'),km:Math.round(kmBetween('${a}','${b}')*1.05),ready:0,day:0,cut:0,mo:100,trench:'own:${id}',pairs:1});compute();`);
const route = (k) => `cmRoutes().get('${k}')`;

test('demand moves all the time: its own cycle, noise, and news; a forecast sees the cycle and the news already out', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams');
  const hs = JSON.parse(ev(`JSON.stringify(Array.from({length:24},(_, i)=>cmHeat(${route('ams|fra')},'w400',i*15)))`));
  assert.ok(Math.max(...hs) - Math.min(...hs) > 0.3, `heat over a year: ${Math.min(...hs).toFixed(2)} to ${Math.max(...hs).toFixed(2)}`);
  assert.ok(hs.every((h) => h >= 0.3 && h <= 2.5));
  assert.equal(ev(`cmFc(${route('ams|fra')},'w400',30)`), ev(`cmDem(${route('ams|fra')},'w400',S.day+30,true)`));
  // A cut on a fiber next door is news the next morning, and carriers want routes around it.
  const before = ev(`cmDem(${route('ams|fra')},'spec',S.day+10)`);
  // (No other news today: the daily roll for news of its own comes out high.)
  ev("S.inc.push({id:'cut1',type:'cut',ref:'own:f',until:S.day+5,msg:''});const r0=Math.random;Math.random=()=>0.99;cmShocks(S.day);Math.random=r0");
  assert.equal(ev('S.cm.news[0].why'), 'cut');
  assert.ok(ev(`cmDem(${route('ams|fra')},'spec',S.day+10)`) > before * 1.4, 'a cut makes the route around it hot');
  ev('const r0=Math.random;Math.random=()=>0.99;cmShocks(S.day);Math.random=r0');
  assert.equal(ev("S.cm.news.filter(n=>n.why==='cut').length"), 1, 'one incident is news once');
  assert.deepEqual(errors, []);
});

test('demand grows every year, and buyers move from 100G to 400G, 800G and 1.6T', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams');
  ev('S.cm.sh=[]');
  const gbps = (d) => ev(`CM_W.reduce((a,p)=>a+cmDem(${route('ams|fra')},p,${d},true)*CM_G[p],0)`);
  assert.ok(Math.abs(ev('cmGrowth(365*5)') - Math.pow(1.15, 5)) < 1e-9, 'about 15% more every year');
  assert.ok(gbps(365 * 5) > gbps(0) * 1.3, `five years on, carriers want ${Math.round(gbps(365 * 5))} G against ${Math.round(gbps(0))} G`);
  const sh = (p, d) => ev(`cmShare('${p}',${d})`);
  assert.ok(sh('w100', 0) > sh('w100', 365 * 4), '100G fades');
  assert.ok(sh('w1600', 0) < 0.05 && sh('w1600', 365 * 10) > 0.5, '1.6T is rare at first and common ten years on');
  assert.ok(Math.abs(['w100', 'w400', 'w800', 'w1600'].reduce((a, p) => a + sh(p, 900), 0) - 1) < 1e-9, 'the shares add up');
  assert.ok(ev('cmGrowth(365*40)') <= 8, 'growth has a ceiling');
  assert.deepEqual(errors, []);
});

test('prices: a 400G wave is 2.7 times a 100G one on land and 3.8 on subsea, short straight routes earn more, and floors hold', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams');
  const r = route('ams|fra');
  assert.ok(Math.abs(ev(`cmList(${r},'w400')/cmList(${r},'w100')`) - 2.7) < 1e-9);
  assert.ok(Math.abs(ev(`(()=>{const x={...${r},sub:true};return cmList(x,'w400')/cmList(x,'w100')})()`) - 3.8) < 1e-9);
  assert.ok(ev(`cmList(${r},'w1600')/16 < cmList(${r},'w100')`), 'a bit on a 1.6T wave is cheaper than on a 100G one');
  assert.ok(ev(`${r}.lp`) > ev(`({...${r},lp:0}, cmRoute('ams','fra',[{...S.links.find(l=>l.id==='f'),km:2000}]).lp)`), 'a long detour loses the latency premium');
  // Each unit sold makes the next cheaper, and the broker never sells below the floor.
  ev("for(const p of CM_P){S.cm.p[p].on=true;S.cm.p[p].floor=100;S.cm.p[p].min=1;}__reseed(5)");
  ev('for(let d=0;d<400;d++){S.day++;cmDay(S.day);}');
  const sales = JSON.parse(ev("JSON.stringify(S.biz.map(b=>({t:b.type,g:b.g||0})))"));
  assert.ok(sales.length > 0, 'something sold');
  assert.ok(ev(`(()=>{const rs=cmRoutes(),s=cmSold(rs).get('ams|fra');return CM_P.every(p=>!s[p]||cmIdx(rs.get('ams|fra'),p,s[p]-1,0,S.day)*100>=0)})()`));
  assert.deepEqual(errors, []);
});

test('auto-listing follows the thresholds and the share kept back; managed waves come out of your own capacity', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams', 'zr4', 8);
  ev("S.cm.hold=50;S.cm.p.w400.on=true;S.cm.p.w400.min=1;S.cm.p.w400.floor=60;S.cm.p.w800.on=true;S.cm.p.w800.min=1;S.cm.p.w800.floor=60;cmRelist()");
  const L = () => JSON.parse(ev("JSON.stringify(S.links.find(l=>l.id==='f').list||{})"));
  assert.ok(L().m4 > 0 && L().m4 <= 4, `half of 3.2T kept back leaves at most four 400G waves (${L().m4})`);
  assert.equal(L().m8, undefined, 'no 800G wave on 400G optics');
  ev("S.cm.p.w400.min=16;cmRelist()");
  assert.equal(L().m4, undefined, 'below the minimum demand the broker takes it off');
  // A sold managed wave carves its capacity out of your own; when your optics cannot carry it, its customer suffers.
  ev("const l=S.links.find(x=>x.id==='f');cmSell(l,'w400',2,1000,0);compute()");
  assert.equal(ev("dfLit(S.links.find(l=>l.id==='f'))-dfCap(S.links.find(l=>l.id==='f'))"), 800);
  assert.equal(ev("fiberOk(S.biz.find(b=>b.type==='mwave'))"), true);
  ev("S.links.find(l=>l.id==='f').ch=['zr4']");
  assert.equal(ev("fiberOk(S.biz.find(b=>b.type==='mwave'))"), false, '400G lit cannot carry 800G sold');
  ev("ACT.mktCfg({p:'w400',k:'on',v:0})");
  assert.equal(ev("S.cm.p.w400.on"), false);
  assert.deepEqual(errors, []);
});

test('a carrier on your glass moves up a size once the next one is common, if there is room', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams', 'tp16', 8);
  ev("S.day=365*4;S.cm.hold=0;const l=S.links.find(x=>x.id==='f');cmSell(l,'w400',2,2000,0);compute()");
  const b0 = JSON.parse(ev("JSON.stringify(S.biz.find(b=>b.type==='mwave'))"));
  ev("Math.random=()=>0;cmGrow(S.day)");
  const b1 = JSON.parse(ev("JSON.stringify(S.biz.find(b=>b.type==='mwave'))"));
  assert.equal(b1.g, 800);
  assert.ok(b1.rate > b0.rate, `pays more: ${b0.rate} to ${b1.rate}`);
  assert.equal(ev("dfLit(S.links.find(l=>l.id==='f'))-dfCap(S.links.find(l=>l.id==='f'))"), 1600);
  // No room: it asks, and does not ask again for half a year (1.6T is common by year 9).
  ev("S.links.find(l=>l.id==='f').ch=['tp16'];S.cm.hold=50;S.day=365*9;cmGrow(S.day)");
  const gw = ev('S.biz.find(b=>b.type===\'mwave\').gw');
  ev('S.day+=30;cmGrow(S.day)');
  const b2 = JSON.parse(ev("JSON.stringify(S.biz.find(b=>b.type==='mwave'))"));
  assert.equal(b2.g, 800);
  assert.equal(gw, 365 * 9);
  assert.equal(b2.gw, 365 * 9, 'not again a month later');
  assert.deepEqual(errors, []);
});

test('a Cable broker pays 3% instead of 10% and sees routes it could build with their forecast', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev('cmCut()'), 0.9);
  ev("ACT.charter({k:'broker'});closeModal();S.cash=1e9");
  assert.equal(ev('cmCut()'), 0.97);
  for (const c of ['fra', 'ams', 'par', 'bru']) ev(`if(!S.pops['${c}'])ACT.buildPop({city:'${c}'});closeModal()`);
  const sc = JSON.parse(ev('JSON.stringify(cmScout().map(r=>r.k))'));
  assert.ok(sc.length > 0 && sc.every((k) => k.includes('|')));
  ev("UI.dtab='market';$('dash').hidden=false;renderDash()");
  const html = ev("$('dashCard').textContent");
  assert.match(html, /Lambda Bazaar/);
  assert.match(html, /Routes you could build/);
  assert.deepEqual(errors, []);
});

test('the market is kept in the save, checked, and old saves get the defaults', () => {
  const { ev, errors } = load();
  start(ev);
  fiber(ev, 'f', 'fra', 'ams');
  ev("S.cm.hold=10;S.cm.p.w1600.on=true;S.cm.p.w1600.min=2;S.cm.off['ams|fra']=1;cmNews('glut',{k:'ams|fra',a:'ams',b:'fra'},S.day);cmSell(S.links[S.links.length-1],'w800',1,500,0)");
  ev('const t=JSON.stringify(packSave(S));S=migrate(JSON.parse(t))');
  const cm = JSON.parse(ev('JSON.stringify(S.cm)'));
  assert.equal(cm.hold, 10);
  assert.deepEqual(cm.p.w1600, { on: true, min: 2, floor: 80 });
  assert.equal(cm.off['ams|fra'], 1);
  assert.equal(cm.sh[0].why, 'glut');
  assert.equal(ev("S.biz.find(b=>b.type==='mwave').g"), 800);
  ev("const o=JSON.parse(JSON.stringify(packSave(S)));o.cm={hold:33,p:{w100:{on:'yes',min:999,floor:-1}},off:{'zzz|ams':1},sh:[{why:'nope'},{why:'dc',c:'atlantis'}],news:'x'};o.biz.find(b=>b.type==='mwave').g=999;o.links.find(l=>l.id==='f').list={m8:'lots',m16:3};S=migrate(o)");
  const c2 = JSON.parse(ev('JSON.stringify(S.cm)'));
  assert.equal(c2.hold, 25);
  assert.deepEqual(c2.p.w100, { on: true, min: 4, floor: 80 });
  assert.deepEqual(c2.off, {});
  assert.deepEqual(c2.sh, []);
  assert.deepEqual(c2.news, []);
  assert.equal(ev("S.biz.find(b=>b.type==='mwave').g"), 100);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.links.find(l=>l.id==='f').list)")), { w: 0, p: 0, m16: 3 });
  ev('const o=JSON.parse(JSON.stringify(packSave(S)));delete o.cm;S=migrate(o)');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.cm.p.spec)')), { on: false, min: 2, floor: 80 });
  assert.deepEqual(errors, []);
});
