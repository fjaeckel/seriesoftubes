// Pie in the Sky, scaling up: factory lines, launch towers, every-pad launches, landing rights years ahead, bulk antennas
// and dishes, and the Dishes tab by country. Seeded; a sandbox, so costs are read from what it would have paid.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const company = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['sin','mia','fra','ams','lon','man'])if(!S.pops[c])ACT.buildPop({city:c});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});compute()");
};
const cost = (ev, code) => { const c = ev('S.pie.book.wouldHave'); ev(code); return Math.round(ev('S.pie.book.wouldHave') - c); };
const doc = (dom) => dom.window.document;

test('production lines bake more pies and hold more on the shelf, up to six', () => {
  const { ev, errors } = load();
  company(ev);
  const mo = ev('pieMo()');
  assert.equal(cost(ev, 'ACT.pieLine()'), ev('piePrice(PIE_LINE)'));
  assert.equal(ev('S.pie.lines'), 2);
  assert.equal(ev('pieMo()') - mo, ev('PIE_LINE_MO'));
  ev('S.pie.stock=0;for(let d=1;d<=30;d++)pieDay(S.day+d)');
  assert.equal(Math.round(ev('S.pie.stock')), 2 * ev('PIE_FAC_MONTH'));
  ev('S.pie.stock=1e9;pieDay(S.day+31)');
  assert.equal(ev('S.pie.stock'), 2 * ev('PIE_STOCK_MAX'));
  for (let i = 0; i < 8; i++) ev('ACT.pieLine()');
  assert.equal(ev('S.pie.lines'), ev('PIE_LINE_MAX'));
  assert.equal(cost(ev, 'ACT.pieLine()'), 0, 'no seventh line');
  assert.deepEqual(errors, []);
});

test('towers let one pad fly more often, and every pad queues one launch per tower', () => {
  const { ev, errors } = load();
  company(ev);
  ev('S.pie.stock=400');
  assert.equal(cost(ev, "ACT.pieTower({city:'sin'})"), ev('piePrice(PIE_TOWER)'));
  assert.equal(ev("S.pie.pads[0].t"), 2);
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'})");
  const gap = ev("leadDays(ROCKETS.falcon.gap)");
  assert.equal(ev("S.pie.pads[0].next-S.pie.q[0].day"), Math.ceil(gap / 2), 'half the gap with two towers');
  assert.equal(ev("pieSlots('short')"), 2);
  ev("ACT.piePad({city:'mia'});ACT.pieAll();closeModal()");
  assert.equal(ev('pieSlots("short")'), 3);
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'})");
  assert.equal(ev('S.pie.q.length'), 4, 'one more launch per tower');
  ev("ACT.pieTower({city:'sin'});ACT.pieTower({city:'sin'})");
  assert.equal(ev("S.pie.pads[0].t"), ev('PIE_TOWER_MAX'), 'three at most');
  assert.equal(ev('PIE_PAD_MAX'), 6, 'six as before: towers are how a pad grows');
  assert.deepEqual(errors, []);
});

test('landing rights run for whole years at a time, never more than ten years ahead', () => {
  const { ev, errors } = load();
  company(ev);
  const p = ev("pieLicPrice('DE')");
  assert.equal(cost(ev, "ACT.pieLic({cc:'DE',y:5})"), 5 * p);
  assert.equal(ev("S.pie.lic.DE.until-S.day"), 5 * 360);
  assert.equal(cost(ev, "ACT.pieLic({cc:'DE',y:5})"), 0, 'already covered');
  assert.equal(cost(ev, "ACT.pieLic({cc:'DE',y:10})"), 5 * p);
  assert.equal(cost(ev, "ACT.pieLic({cc:'DE'})"), 0, 'the old one-year button stops at the cap');
  ev("S.pie.lic.GB={state:'ok',until:S.day+180}");
  assert.equal(cost(ev, "ACT.pieLic({cc:'GB',y:10})"), 9 * ev("pieLicPrice('GB')"), 'nine whole years fit under the cap');
  ev("S.pie.lic.NL={state:'refused',until:S.day+60}");
  assert.equal(cost(ev, "ACT.pieLic({cc:'NL',y:1})"), 0, 'refused rights are not for sale');
  // every country with a dish
  ev("for(const c of ['sin','mia','ams'])ACT.pieDish({city:c})");
  const q = JSON.parse(ev('JSON.stringify(pieLicAllQuote(10))'));
  assert.deepEqual(q.list.map((x) => x[0]).sort(), ['SG', 'US'], 'not the refused one, not the ones already covered');
  assert.equal(cost(ev, 'ACT.pieLicAll({y:10})'), q.cost);
  assert.ok(ev("pieLicYears('SG',10)===0&&pieLicYears('US',10)===0"));
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.equal(ev("S.pie.lic.SG.until-S.day"), 3600, 'ten years survives a save');
  assert.deepEqual(errors, []);
});

test('antennas and dishes in bulk', () => {
  const { ev, errors } = load();
  company(ev);
  ev("ACT.pieDish({city:'sin'});ACT.pieDish({city:'lon'})");
  const a = ev('piePrice(PIE_ANT)'), id = ev('S.pie.dishes[0].id');
  assert.equal(cost(ev, `ACT.pieAntMax({id:'${id}'})`), 15 * a);
  assert.equal(ev('S.pie.dishes[0].ant'), 16);
  assert.equal(cost(ev, 'ACT.pieAntAll()'), 15 * a, 'only what is missing');
  assert.ok(ev('S.pie.dishes.every(x=>x.ant===PIE_ANT_MAX)'));
  assert.equal(cost(ev, "ACT.pieDishAll({cc:'GB'})"), ev('piePrice(PIE_DISH+PIE_ANT)'), 'Manchester, London has one');
  assert.deepEqual(ev("JSON.stringify(S.pie.dishes.map(x=>x.city).sort())"), JSON.stringify(['lon', 'man', 'sin']));
  assert.deepEqual(errors, []);
});

test('saves keep lines and towers, repair bad values, and old saves load with one of each', () => {
  const { ev, errors } = load();
  company(ev);
  ev("ACT.pieLine();ACT.pieTower({city:'sin'});S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.pie.lines'), 2);
  assert.equal(ev('S.pie.pads[0].t'), 2);
  ev("const o=JSON.parse(JSON.stringify(S));o.pie.lines=99;o.pie.pads[0].t=-4;S=migrate(o)");
  assert.equal(ev('S.pie.lines'), ev('PIE_LINE_MAX'));
  assert.equal(ev('S.pie.pads[0].t'), 1);
  ev("const o=JSON.parse(JSON.stringify(S));delete o.pie.lines;delete o.pie.pads[0].t;o.pie.stock=1e9;S=migrate(o)");
  assert.equal(ev('S.pie.lines'), 1);
  assert.equal(ev('S.pie.pads[0].t'), 1);
  assert.equal(ev('S.pie.stock'), ev('PIE_STOCK_MAX'));
  assert.deepEqual(errors, []);
});

test('the Dishes tab lists countries, folds them open, and filters by dish, rights and region', () => {
  const { ev, dom, errors } = load();
  company(ev);
  ev("ACT.pieDish({city:'lon'});ACT.pieLic({cc:'GB',y:5});ACT.pieTab({t:'dish'})");
  const rows = () => [...doc(dom).querySelectorAll('#modal .pie-cc')].map((b) => JSON.parse(b.dataset.args).cc);
  assert.ok(rows().includes('GB') && rows().includes('DE') && rows().includes('SG'));
  assert.equal(doc(dom).querySelector('#modal [data-act=pieDish]'), null, 'folded shut');
  ev("ACT.pieCc({cc:'GB'})");
  const box = doc(dom).querySelector('#modal .pie-ccb');
  assert.match(box.textContent, /London 📡 1\/16/);
  assert.match(box.textContent, /Manchester no dish/);
  assert.ok(box.querySelector('[data-act=pieLic]'), 'rights for 1, 5 or 10 years');
  assert.equal(box.querySelectorAll('[data-act=pieLic]').length, 3);
  ev("ACT.pieGf({v:'dish'})");
  assert.deepEqual(rows(), ['GB']);
  ev("ACT.pieGf({v:'none'});ACT.pieGr({v:'AS'})");
  assert.deepEqual(rows(), ['SG']);
  ev("ACT.pieGr({v:''});ACT.pieGf({v:'lic'})");
  assert.deepEqual(rows(), [], 'five years left is not soon');
  ev("S.pie.lic.GB.until=S.day+30;ACT.pieTab({t:'dish'})");
  assert.deepEqual(rows(), ['GB']);
  // the Production tab offers only coastal POPs for a pad, nearest the equator first
  ev("ACT.pieTab({t:'co'})");
  assert.equal(doc(dom).querySelector('#modal .pie-site'), null, 'the sites wait behind a button once you have a pad');
  ev('ACT.piePadNew()');
  const opts = [...doc(dom).querySelectorAll('#modal .pie-site [data-act=piePad]')].map((b) => JSON.parse(b.dataset.args).city);
  assert.equal(opts[0], 'mia', 'Singapore has its pad; Miami is next nearest the equator');
  assert.ok(!opts.includes('fra'), 'Frankfurt is inland');
  assert.equal(doc(dom).querySelectorAll('#modal .pie-site')[0].querySelectorAll('.pie-cr.on').length, 1, 'Miami reaches every crust: one chip says so');
  assert.ok(doc(dom).querySelector('#modal [data-act=pieLine]') && doc(dom).querySelector('#modal [data-act=pieTower]'));
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('the Dishes tab sorts countries by name, antennas, rights and free POPs', () => {
  const { ev, dom, errors } = load();
  company(ev);
  ev("ACT.pieDish({city:'lon'});ACT.pieDish({city:'sin'});ACT.pieAntMax({id:S.pie.dishes[1].id});ACT.pieLic({cc:'SG',y:1});ACT.pieLic({cc:'GB',y:5});ACT.pieTab({t:'dish'})");
  const rows = () => [...doc(dom).querySelectorAll('#modal .pie-cc')].map((b) => JSON.parse(b.dataset.args).cc);
  ev("ACT.pieGs({v:'ant'})");
  assert.deepEqual(rows().slice(0, 2), ['SG', 'GB'], 'most antennas first');
  ev("ACT.pieGs({v:'lic'})");
  assert.deepEqual(rows().slice(0, 2), ['SG', 'GB'], 'rights ending first');
  ev("ACT.pieGs({v:'free'})");
  const free = (cc) => ev(`pieDishFree('${cc}').length`);
  assert.deepEqual(rows().map(free), rows().map(free).sort((a, b) => b - a), 'most POPs without a dish first');
  ev("ACT.pieGs({v:'name'})");
  const names = rows().map((cc) => ev(`pieLicCountry('${cc}')`));
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
  ev("ACT.pieGs({v:'nonsense'})");
  assert.equal(ev('UI.pieGs'), 'reg');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('the Traffic tab names each bottleneck with the button that fixes it', () => {
  const { ev, errors } = load();
  company(ev);
  ev("for(const c of ['lon','sin']){ACT.pieDish({city:c});ACT.pieLic({cc:CITY[c].cc,y:1});}S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
  const Q = (code) => ev(`(()=>{const Q=R.pie;${code}})()`);
  // a full dish with room for antennas
  Q("Q.dish.find(d=>d.city==='lon').u=0.97;Q.dish.find(d=>d.city==='lon').used=Q.dish.find(d=>d.city==='lon').cap*0.97");
  let fx = JSON.parse(Q("return JSON.stringify((PIE_FX=null,pieFixes(Q)).map(x=>x.b))"));
  assert.ok(fx.some((b) => /pieAntMax/.test(b)), 'antennas on the full dish');
  // at 16 antennas, a dish in a POP nearby
  ev("S.pie.dishes.find(x=>x.city==='lon').ant=PIE_ANT_MAX");
  fx = JSON.parse(Q("return JSON.stringify((PIE_FX=null,pieFixes(Q)).map(x=>x.b))"));
  assert.ok(fx.some((b) => /data-act="pieDish"[^>]*(ams|man)/.test(b)), 'a second dish within reach');
  // a full crust at full coverage points at another crust
  Q("const c=Q.crust.find(x=>x.id==='short');c.used=c.cap");
  const t = Q("return (PIE_FX=null,pieFixes(Q)).map(x=>x.h).join(' | ')");
  assert.match(t, /fully covered/);
  // the panel shows it
  ev("ACT.pieTab({t:'fix'})");
  assert.ok(ev("document.querySelectorAll('#modal .pie-fxl .pie-fx').length")>=2, 'every bottleneck, not just the first few');
  ev("ACT.pieFk({v:'sky'})");
  assert.equal(ev("document.querySelectorAll('#modal .pie-fxl .pie-fx').length"), 1, 'filtered to crusts');
  ev("ACT.pieFk({v:''});ACT.pieFs({v:'lack'})");
  const lack = JSON.parse(ev("JSON.stringify([...document.querySelectorAll('#modal .pie-fxl .pie-fx-n')].map(e=>e.textContent))"));
  assert.ok(lack.length >= 2);
  // a greyed button says why underneath
  ev("window.__cb=pieCanBuild;pieCanBuild=()=>false;ACT.pieTab({t:'fix'})");
  assert.ok(ev("[...document.querySelectorAll('#modal .pie-bw')].some(b=>b.querySelector('button[disabled]')&&/Tier 1/.test(b.textContent))"));
  ev('pieCanBuild=__cb;closeModal()');
  assert.deepEqual(errors, []);
});

test('a pad can be closed for a quarter of its cost, after asking, and never with launches queued', () => {
  const { ev, dom, errors } = load();
  company(ev);
  ev("ACT.pieTower({city:'sin'});ACT.piePad({city:'mia'});ACT.pieTab({t:'co'})");
  ev("ACT.piePadClose({city:'mia'})");
  assert.equal(ev('S.pie.pads.length'), 2, 'the first tap only asks');
  assert.ok(doc(dom).querySelector('#modal [data-act=piePadClose].red'), 'the confirm button');
  const back = ev("Math.round(piePrice(PIE_PAD)*PIE_SALVAGE)");
  assert.equal(-cost(ev, "ACT.piePadClose({city:'mia',ok:true})"), back);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.pie.pads.map(p=>p.city))')), ['sin']);
  ev("S.pie.stock=100;ACT.pieLaunch({rk:'falcon',cr:'short'});ACT.piePadClose({city:'sin',ok:true})");
  assert.equal(ev('S.pie.pads.length'), 1, 'launches queued there keep it open');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('launch options stay set across saves, and the Launch tab explains rockets and room', () => {
  const { ev, dom, errors } = load();
  company(ev);
  ev("ACT.pieIns();ACT.pieAll();S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.pie.opt)')), { ins: true, las: false, all: true });
  ev("ACT.pieTab({t:'crust'})");
  const t = doc(dom).getElementById('modalCard').textContent.replace(/\s+/g, ' ');
  assert.match(t, /Medium rocket/);
  assert.match(t, /Heavy rocket/);
  assert.match(t, /room for \d+/);
  assert.equal(doc(dom).querySelectorAll('#modal .pie-tg.on').length, 2);
  ev("ACT.pieTab({t:'cust'})");
  assert.ok(doc(dom).querySelector('#modal .pgcv'), 'the Customers tab has the globe');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('the globe zooms, turns to a dish, and the load view and crust cards offer actions', () => {
  const { ev, dom, errors } = load();
  company(ev);
  ev("for(const c of ['lon','sin']){ACT.pieDish({city:c});ACT.pieLic({cc:CITY[c].cc,y:1});}S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];compute();UI.pieDv='load';ACT.pieTab({t:'dish'})");
  const z0 = ev('PG.zoom');
  ev("ACT.pieGlobeZoom({d:1})");
  assert.ok(ev('PG.zoom') > z0, 'zooms in');
  ev("for(let i=0;i<20;i++)ACT.pieGlobeZoom({d:1})");
  assert.equal(ev('PG.zoom'), ev('PG_ZMAX'), 'never past the cap');
  ev("for(let i=0;i<20;i++)ACT.pieGlobeZoom({d:-1})");
  assert.equal(ev('PG.zoom'), 1, 'never smaller than the whole globe');
  const d = doc(dom);
  assert.deepEqual([...d.querySelectorAll('#modal .pie-dr')[0].querySelectorAll('[data-act]')].map((b) => b.dataset.act), ['pieDishGo'], 'one button per dish row: see the dish');
  ev("ACT.pieLook({city:'lon'})");
  assert.ok(ev('!PG.cv||(PG.goal&&PG.goal.z>1)'), 'turns and zooms to it');
  ev("ACT.pieTab({t:'crust'})");
  assert.match(d.getElementById('modalCard').textContent, /0 of \d+ pies have lasers/, 'each crust card counts lasers');
  assert.ok(d.querySelector('#modal .pie-lasr [data-act=pieRd]'), 'without the laser research, the Crusts tab offers it');
  ev("S.pie.crusts.short.cohorts.push({n:100,day:S.day,las:true});ACT.pieTab({t:'crust'})");
  assert.match(d.getElementById('modalCard').textContent, /100 of \d+ pies have lasers/);
  ev("ACT.pieTab({t:'dish'});ACT.pieDv({v:'load'});ACT.pieDs({v:'name'})");
  const rows = [...d.querySelectorAll('#modal .pie-dr .nm b')].map((s) => s.textContent.replace('📡 ', '').trim());
  assert.deepEqual(rows, rows.slice().sort((a, b) => a.localeCompare(b)));
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('a load row leads to its dish in the country view', () => {
  const { ev, dom, errors } = load();
  company(ev);
  ev("for(const c of ['lon','man']){ACT.pieDish({city:c});}ACT.pieLic({cc:'GB',y:1});S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];compute();UI.pieGf='none';UI.pieDv='load';ACT.pieTab({t:'dish'})");
  const b = dom.window.document.querySelector("#modal .pie-dr [data-act=pieDishGo]");
  assert.ok(b, 'each dish row has the button');
  ev("ACT.pieDishGo({city:'man'})");
  assert.equal(ev('UI.pieTab'), 'dish');
  assert.equal(ev('UI.pieGf'), '', 'filters cleared so the row shows');
  assert.equal(ev('UI.pieDv'), 'cc', 'back to the country view');
  assert.ok(dom.window.document.querySelector('#modal .pie-focus[data-dish="man"]'), 'the row is marked, its country open');
  assert.ok(dom.window.document.querySelector('#modal .pgcv'), 'the Dishes tab has the globe');
  assert.ok(ev('!PG.cv||(PG.goal&&PG.goal.z>1)'), 'turned and zoomed onto the dish');
  const g = JSON.parse(ev('JSON.stringify(pieGlobeData())'));
  assert.equal(g.focus, 'man');
  assert.ok(g.pops.some((p) => p.city === 'fra') && !g.pops.some((p) => p.city === 'lon'), 'POPs without a dish are on the globe');
  ev('ACT.pieNoSats()');
  assert.equal(ev('pieGlobeData().noSats'), true, 'satellites can be hidden');
  ev("pieGlobePick('fra')");
  assert.equal(ev('UI.pieFocus'), 'fra', 'a tap on the globe finds the POP in the list');
  assert.ok(dom.window.document.querySelector('#modal .pie-focus[data-dish="fra"]'));
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('a factory line can be removed, down to one, for a quarter of its price', () => {
  const { ev, errors } = load();
  company(ev);
  ev('ACT.pieLine();ACT.pieLine()');
  const mo = ev('pieMo()');
  assert.equal(-cost(ev, 'ACT.pieLineDel()'), ev('Math.round(piePrice(PIE_LINE)*PIE_SALVAGE)'));
  assert.equal(ev('S.pie.lines'), 2);
  assert.equal(mo - ev('pieMo()'), ev('PIE_LINE_MO'));
  ev('ACT.pieLineDel();ACT.pieLineDel()');
  assert.equal(ev('S.pie.lines'), 1, 'the first line stays');
  assert.deepEqual(errors, []);
});

test('lasers are research: every pie launched afterwards has them, and lasered launches replace pies without', () => {
  const { ev, errors } = load();
  company(ev);
  ev("S.pie.stock=480;S.pie.crusts.short.cohorts=[{n:Math.floor(CRUSTS.short.full*PIE_SPARE),day:S.day,las:false}]");
  assert.match(ev("pieQuote('falcon','short',{las:false}).why||''"), /full/i, 'at its ceiling without lasers');
  assert.equal(cost(ev, "ACT.pieRd({k:'las'})"), ev('piePrice(PIE_RD.las.cost)'));
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'})");
  assert.equal(ev('S.pie.q[0].las'), true, 'the new launch has lasers');
  // past the ceiling, the arrival deorbits as many pies without lasers
  ev("S.pie.crusts.short.cohorts=[{n:Math.floor(CRUSTS.short.full*PIE_SPARE),day:S.day,las:false}];S.pie.crusts.short.queued=0;pieFly(S.pie.q.shift())");
  assert.equal(ev('pieLive("short")'), ev('Math.floor(CRUSTS.short.full*PIE_SPARE)'), 'the crust stays at its ceiling');
  assert.equal(ev('pieLiveLas("short")'), 20, 'twenty lasered pies replaced twenty without');
  // fewer pies without lasers than a rocket carries: still a launch, the crust ends a few over its ceiling
  ev("S.pie.crusts.short.cohorts=[{n:Math.floor(CRUSTS.short.full*PIE_SPARE)-4,day:S.day,las:true},{n:4,day:S.day,las:false}];S.pie.q=[];S.pie.crusts.short.queued=0");
  assert.equal(ev("pieQuote('falcon','short',{las:true}).ok"), true, 'four left to replace is enough to launch');
  ev("ACT.pieLaunch({rk:'falcon',cr:'short'});pieFly(S.pie.q.shift())");
  assert.equal(ev('pieNoLas("short")'), 0, 'the last four are gone');
  assert.match(ev("pieQuote('falcon','short',{las:true}).why||''"), /full/i, 'and then it is full');
  // a save that flew lasered pies under the old toggle has the research
  ev("const o=JSON.parse(JSON.stringify(S));o.pie.rd.las=false;S=migrate(o)");
  assert.equal(ev('S.pie.rd.las'), true);
  assert.deepEqual(errors, []);
});

test('frequency bands: V and E double and double again what an antenna carries, dish by dish', () => {
  const { ev, errors } = load();
  company(ev);
  ev("ACT.pieDish({city:'lon'});ACT.pieLic({cc:'GB',y:1})");
  const id = ev('S.pie.dishes[0].id');
  assert.equal(ev('pieDishes()[0].g'), 20);
  ev("ACT.pieRd({k:'eband'})");
  assert.equal(ev('S.pie.rd.eband'), false, 'E band needs V band first');
  ev("ACT.pieRd({k:'vband'})");
  const v = ev('pieBandCost(S.pie.dishes[0])');
  assert.equal(v, ev('pieAntPrice(1)-pieAntPrice(0)'), 'one antenna to move up');
  assert.equal(cost(ev, `ACT.pieBand({id:'${id}'})`), v);
  assert.equal(ev('pieDishes()[0].g'), 40);
  ev("ACT.pieDish({city:'man'})");
  assert.equal(ev("S.pie.dishes.find(x=>x.city==='man').band"), 1, 'new dishes start at the best band');
  ev("ACT.pieRd({k:'eband'});ACT.pieBandAll()");
  assert.equal(ev('pieDishes()[0].g'), 80);
  // rain hurts a higher band more
  ev("S.inc.push({id:'r',type:'pierain',ref:'lon',start:S.day,until:S.day+3,cost:0,msg:''})");
  assert.ok(ev('pieDishes()[0].g') < 80 * ev('PIE_RAIN'));
  ev("const o=JSON.parse(JSON.stringify(S));o.pie.dishes[0].band=9;o.pie.rd.eband=false;S=migrate(o)");
  assert.equal(ev('S.pie.dishes[0].band'), 1, 'never above what is researched');
  assert.deepEqual(errors, []);
});
