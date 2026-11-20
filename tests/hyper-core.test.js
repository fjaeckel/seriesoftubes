// The Hyperscaler charter, phase 1 (37-hyper.js): signing, launching in countries, regions built and grown without
// going dark, front doors and the edge stack, the haul from region to front door over your own backbone (and what is
// lost when it is full), quality from the real path latency, cloud tenants as the only customers, saves, and the Cloud
// tab and charter card on a phone and on a desktop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A Hyperscaler in Frankfurt with plenty of cash; its home country launched and a transit port at home.
function start(opts = {}) {
  const page = load({ seed: 5, ...opts });
  page.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e9;ACT.hsLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});compute()");
  return page;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
// A POP in city c with transit, linked to Frankfurt by a link of tier t.
const door = (c, t = 1) => `ACT.buildPop({city:'${c}'});UI.via=null;UI.route=null;openLinkModal(S.home,'${c}');ACT.buildLink({tier:${t}});closeModal();ACT.buyTransit({city:'${c}',net:'cog',tier:1});`;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('signing the charter starts a Hyperscaler: a free Rack Shack at home, its own goals, no homes and no tutorial', () => {
  const { ev, errors } = load({ seed: 5 });
  ev("ACT.start({});UI.tutLater=true;ACT.charter({k:'hyper'})");
  assert.equal(ev('charter()'), 'hyper');
  assert.deepEqual(J(ev, 'S.hs.rg'), { fra: { t: 0, ready: 0, mw: 5 } });
  assert.deepEqual(J(ev, 'S.hs.cc'), {});
  assert.equal(ev('goals()===HYPER_GOALS'), true);
  assert.equal(ev('S.tut==null'), true, 'the classic tutorial (broadband first) does not start');
  ev("ACT.launchBB({city:S.home})");
  assert.equal(ev('S.pops[S.home].bb'), null, 'a Hyperscaler sells no home broadband');
  assert.match(ev('charterCard()'), /Cloud Nine/);
  assert.match(ev('charterCard()'), /Launch in Germany/, 'the card says what to do first');
  assert.deepEqual(errors, []);
});

test('launching costs once, brings the first users, and refuses where nobody is online', () => {
  const { ev, errors } = load({ seed: 5 });
  ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e6");
  const cash = ev('S.cash'), lic = ev("hsLic('DE')");
  ev("ACT.hsLaunch({cc:'DE'})");
  assert.equal(ev('S.cash'), cash - lic + 10000, 'the launch costs its licence, and the first goal pays');
  assert.ok(near(ev('S.hs.cc.DE.d'), ev("hsPot('DE')*HS_START")));
  ev("ACT.hsLaunch({cc:'DE'})");
  assert.equal(ev('S.cash'), cash - lic + 10000, 'twice is once');
  const cn = ev("CITIES.find(c=>c.cn).cc");
  ev(`ACT.hsLaunch({cc:'${cn}'})`);
  assert.equal(ev(`!!S.hs.cc['${cn}']`), false);
  assert.ok(ev('S.done.hs_launch!==undefined'));
  assert.deepEqual(errors, []);
});

test('users need a front door: a POP with a way out that the backbone joins to a region', () => {
  const { ev, errors } = start();
  const d = ev('S.hs.cc.DE.d');
  assert.equal(ev('R.hs.cc.DE.v'), 'fra');
  assert.ok(near(ev('R.served'), d));
  assert.ok(near(ev("hsQ(R,'DE')"), 1), 'served in full, next door');
  assert.ok(near(ev('R.rev.eyeballs'), d * ev('HS_RATE')));
  ev('S.transit=[];compute()');
  assert.equal(ev('R.hs.cc.DE.v'), null, 'no way out, no front door');
  assert.equal(ev('R.served'), 0);
  assert.equal(ev("hsQ(R,'DE')"), 0);
  assert.ok(near(ev('R.hs.short'), d));
  // An island POP with transit is no front door for regions it is not joined to.
  ev("ACT.buyTransit({city:S.home,net:'cog',tier:1});ACT.buildPop({city:'ams'});ACT.buyTransit({city:'ams',net:'cog',tier:1});ACT.hsLaunch({cc:'NL'});compute()");
  assert.equal(ev('R.hs.cc.NL.v'), 'fra', 'Dutch users enter where the cloud is reachable');
  ev(door('ams').replace("ACT.buildPop({city:'ams'});", '') + 'compute()');
  assert.equal(ev('R.hs.cc.NL.v'), 'ams', 'once linked, the nearest front door takes them');
  assert.deepEqual(errors, []);
});

test('the haul: users far from the region ride the backbone, and lose what it cannot carry', () => {
  const { ev, errors } = start();
  ev(door('ams', 1) + "ACT.hsLaunch({cc:'NL'});S.hs.cc.NL.d=40;compute()");
  const o = J(ev, 'R.hs.cc.NL');
  assert.equal(o.v, 'ams');
  assert.equal(o.home, 'fra');
  assert.ok(near(o.want, 40), 'everything dynamic is hauled from Frankfurt');
  assert.ok(near(o.got, 40));
  assert.ok(near(ev('R.hs.door.ams.got'), 40));
  const link = ev("S.links[0].id");
  assert.ok(ev(`R.load['${link}']`) >= 40 - 1e-6, 'the haul is on the link');
  // More than the link carries: the rest is lost, and quality shows it.
  const cap = ev('capOf(S.links[0])');
  ev(`S.hs.cc.NL.d=${cap + 60};compute()`);
  const o2 = J(ev, 'R.hs.cc.NL');
  assert.ok(o2.got <= cap + 1e-6 && o2.got < o2.want - 50, `got ${o2.got} of ${o2.want}`);
  assert.ok(ev("hsQ(R,'NL')") < 0.9);
  assert.match(ev('hsCard()'), /Backbone to Amsterdam full/);
  // Cut the link: Amsterdam is no front door for Frankfurt any more, and the users come home the long way.
  ev("S.links[0].cut=S.day+5;compute()");
  assert.equal(ev('R.hs.cc.NL.v'), 'fra');
  assert.deepEqual(errors, []);
});

test('the edge stack serves a quarter at the front door, never hauled, and needs a way out', () => {
  const { ev, errors } = start();
  ev(door('ams') + "ACT.hsLaunch({cc:'NL'});S.hs.cc.NL.d=40;ACT.buildPop({city:'par'})");
  const cash = ev('S.cash');
  ev("ACT.hsEdge({city:'par'})");
  assert.equal(ev("!!S.hs.edge.par"), false, 'no way out in Paris yet');
  assert.equal(ev('S.cash'), cash);
  ev("ACT.hsEdge({city:'ams'});compute()");
  assert.equal(ev('S.hs.edge.ams'), 1);
  assert.ok(ev('S.cash') < cash - ev('HS_EDGE_COST') + ev("HYPER_GOALS.find(g=>g.id==='hs_edge').r") + 1, 'paid for (less the goal it completes)');
  const o = J(ev, 'R.hs.cc.NL');
  assert.ok(near(o.st, 10), '25% served at the door');
  assert.ok(near(o.want, 30), 'only the dynamic 75% is hauled');
  assert.ok(near(ev('R.hs.door.ams.g'), 30));
  assert.ok(ev('R.cost.cloud') >= ev('HS_T[0].mo+HS_EDGE_MO'));
  ev('dayTick()');
  assert.ok(ev('S.done.hs_edge!==undefined'));
  assert.deepEqual(errors, []);
});

test('quality comes from the path latency, front door to region, and the edge stack halves what users feel', () => {
  const { ev, errors } = start();
  ev(door('ams') + "ACT.buildPop({city:'nyc'});UI.via=null;openLinkModal('ams','nyc');ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'nyc',net:'cog',tier:1});ACT.hsLaunch({cc:'US'});S.hs.cc.US.d=20;compute()");
  const o = J(ev, 'R.hs.cc.US');
  assert.equal(o.v, 'nyc');
  assert.equal(o.home, 'fra');
  // The real path: Frankfurt, Amsterdam, then across the Atlantic; its latency, not the great-circle distance.
  const path = ev("S.links.reduce((a,l)=>a+linkLat(l),0)"), acc = ev("hsAcc('nyc',ccInfo('US').main)");
  const part = o.parts.find((p) => p[3] === 'fra');
  assert.ok(near(part[2], path + acc, 1e-6), `latency ${part[2]} = backbone ${path} + the users' own way in ${acc}`);
  assert.ok(path > ev("kmBetween('fra','nyc')") / 200, 'the path is longer than the crow flies');
  const q0 = ev("hsQ(R,'US')");
  assert.ok(q0 < 1 && q0 > 0.5, 'across the Atlantic feels slower: ' + q0);
  assert.ok(near(ev("hsQ(R,'DE')"), 1), 'next door does not');
  ev("ACT.hsEdge({city:'nyc'});compute()");
  assert.ok(ev("hsQ(R,'US')") > q0, 'the edge stack makes the far region feel nearer');
  // A US region removes the Atlantic from the path.
  ev("S.hs.rg.nyc={t:1,ready:0,mw:20};compute()");
  assert.equal(ev('R.hs.cc.US.home'), 'nyc');
  assert.ok(near(ev("hsQ(R,'US')"), 1));
  assert.deepEqual(errors, []);
});

test('regions: big metros only, capped by level, built for months, grown without going dark', () => {
  const { ev, errors } = start();
  const cash = ev('S.cash');
  ev("ACT.hsRegion({city:S.home})");
  assert.equal(ev('S.cash'), cash - ev('HS_T[1].cost'));
  assert.equal(ev('S.hs.rg.fra.up.t'), 1);
  ev("S.hs.cc.DE.d=300;compute()");
  assert.ok(near(ev('R.hs.rg.fra.load'), 300), 'the Rack Shack serves while the Barn goes up');
  ev("S.day=S.hs.rg.fra.up.ready-1;dayTick()");
  assert.equal(ev('S.hs.rg.fra.t'), 1);
  assert.equal(ev('S.hs.rg.fra.mw'), 20);
  // A second region: the level allows two at level 1; a third waits for level 2.
  ev(door('ams') + door('par') + "ACT.hsRegion({city:'ams'})");
  assert.equal(ev('S.hs.rg.ams.t'), 1);
  ev("ACT.hsRegion({city:'par'})");
  assert.equal(ev('!!S.hs.rg.par'), false);
  ev("S.lvl=2;ACT.hsRegion({city:'par'})");
  assert.equal(ev('!!S.hs.rg.par'), true);
  // Gigawatt Gulch needs level 8; small towns are no region metros.
  ev("S.hs.rg.fra.t=2;ACT.hsRegion({city:S.home})");
  assert.equal(ev('!!S.hs.rg.fra.up'), false);
  const town = ev("CITIES.filter(c=>!c.cn&&!c.off&&c.cc==='DE'&&!hsSite(c.id)).sort((a,b)=>a.P-b.P)[0].id");
  ev(`S.lvl=13;ACT.buildPop({city:'${town}'});ACT.hsRegion({city:'${town}'})`);
  assert.equal(ev(`!!S.hs.rg['${town}']`), false);
  // A level counts live regions (not ones still being built) and continents with one.
  ev("for(const c in S.pops)S.pops[c].down=0;S.hs.rg.ams.ready=S.day");
  assert.equal(ev('lvPlaces()'), 2);
  assert.equal(ev('lvRegions()'), 1);
  assert.deepEqual(errors, []);
});

test('tenants are the only customers: cloud bundles, a compute slot each, traffic from their region', () => {
  const { ev, errors } = start();
  ev("S.lvl=5;for(let i=0;i<40;i++)spawnOffer()");
  const kinds = J(ev, '[...new Set(S.offers.map(o=>o.type))]');
  assert.deepEqual(kinds, ['cloud']);
  assert.ok(ev('S.offers.every(o=>o.p.length&&o.p.every(id=>own(CLOUD_PRODUCTS,id))&&own(CLOUD_TENANTS,o.ck))'));
  ev("S.offers=S.offers.slice(0,1);const o=S.offers[0];o.city=S.home;o.bw=20;ACT.accept({id:o.id});compute()");
  const b = J(ev, 'S.biz[0]');
  assert.equal(b.type, 'cloud');
  assert.equal(b.rg, 'fra');
  assert.ok(Array.isArray(b.p) && b.p.length);
  assert.ok(ev('R.hs.ten[S.biz[0].id].want') > 0, 'its traffic is placed in the region');
  assert.ok(ev('R.hs.rg.fra.load') > ev('S.hs.cc.DE.d'));
  const q = ev('hsTenQ(R,S.biz[0])');
  assert.ok(q > 0 && q <= 1);
  assert.ok(ev('R.rev.business') > 0);
  assert.match(ev("cityPanel(S.home)"), /Customers based here/);
  // The Rack Shack has four compute slots: a fifth tenant waits.
  ev("for(let i=0;i<3;i++){const b=JSON.parse(JSON.stringify(S.biz[0]));b.id='t'+i;S.biz.push(b);}S.offers=[];for(let i=0;i<20&&!S.offers.length;i++)spawnOffer()");
  assert.equal(ev('S.offers.length'), 0, 'no slot, no caller');
  ev("S.offers.push(hsOffer('startup',S.home,5));ACT.accept({id:S.offers[0].id})");
  assert.equal(ev("S.biz.length"), 4);
  assert.deepEqual(errors, []);
});

test('a bundle sits nearer its worst product: a database without a second region sours it', () => {
  const { ev, errors } = start();
  ev("S.offers.push(Object.assign(hsOffer('ent',S.home,10),{p:['vm','db']}));ACT.accept({id:S.offers[0].id});compute()");
  const vm = ev("hsNeedQ(R,S.biz[0],'vm')"), db = ev("hsNeedQ(R,S.biz[0],'db')"), q = ev('hsTenQ(R,S.biz[0])');
  assert.ok(near(vm, 1));
  assert.ok(db < 0.9);
  assert.ok(q < (vm + db) / 2, 'closer to the worst than the average');
  assert.match(ev("hsTenSection(S.home)"), /Wants: a second region/);
  ev(door('ams') + "S.hs.rg.ams={t:1,ready:0,mw:20};compute()");
  assert.ok(near(ev("hsNeedQ(R,S.biz[0],'db')"), 1), 'a pair of regions fixes it');
  assert.deepEqual(errors, []);
});

test('saves: junk repaired, S.hs and tenants only in the charter, a round trip through parseSave and migrate', () => {
  const { ev, errors } = start();
  ev("S.offers.push(hsOffer('game',S.home,20));ACT.accept({id:S.offers[0].id});ACT.hsEdge({city:S.home});compute()");
  const s = J(ev, 'S');
  const back = J(ev, `(()=>{const r=parseSave(${JSON.stringify(JSON.stringify(s))});return migrate(r.s);})()`);
  assert.deepEqual(back.hs, s.hs);
  assert.deepEqual(back.biz.map((b) => [b.type, b.p, b.ck, b.rg]), s.biz.map((b) => [b.type, b.p, b.ck, b.rg]));
  const junk = { ...s, hs: { cc: { DE: { d: 'x', since: null }, XX: { d: 5 }, US: 7 }, rg: { fra: { t: 99, ready: 'soon', up: { t: 1 } }, zzz: { t: 1 }, nyc: { t: 1, ready: 0 } }, edge: { fra: 1, nyc: 1, zzz: 1 }, t1: 'no', won: -4 },
    biz: s.biz.map((b) => ({ ...b, p: ['vm', 'teleporter', 'vm', 7], ck: 'pirates', rg: 'atlantis' })) };
  const m = J(ev, `migrate(${JSON.stringify(junk)})`);
  assert.deepEqual(Object.keys(m.hs.cc), ['DE']);
  assert.equal(m.hs.cc.DE.d, 1);
  assert.deepEqual(m.hs.rg, { fra: { t: 3, ready: 0, mw: 200 } });
  assert.deepEqual(m.hs.edge, { fra: 1 });
  assert.deepEqual([m.hs.t1, m.hs.won], [0, 0]);
  assert.deepEqual(m.biz[0].p, ['vm']);
  assert.equal(m.biz[0].ck, 'startup');
  assert.equal(m.biz[0].rg, undefined);
  assert.equal(ev(`(()=>{const x=migrate(${JSON.stringify({ ...junk, hs: 'nonsense' })});return JSON.stringify(x.hs.rg)})()`), '{"fra":{"t":0,"ready":0,"mw":5}}');
  // Outside the charter there is no S.hs and no cloud tenant.
  const g = J(ev, `migrate(${JSON.stringify({ ...s, charter: 'global' })})`);
  assert.equal(g.hs, undefined);
  assert.equal(g.biz.filter((b) => b.type === 'cloud').length, 0);
  ev(`S=migrate(${JSON.stringify(s)});compute();for(let i=0;i<3;i++)dayTick()`);
  assert.equal(ev('charter()'), 'hyper');
  assert.deepEqual(errors, []);
});

test('the Cloud tab and the charter card render on a phone and on a desktop', () => {
  const { ev, dom, errors } = start();
  ev(door('ams') + "ACT.hsLaunch({cc:'NL'});ACT.hsEdge({city:'ams'});S.offers.push(hsOffer('startup',S.home,5));ACT.accept({id:S.offers[0].id});S.offers.push(hsOffer('tv','ams',50));compute()");
  for (const w of [1280, 360]) {
    ev(`window.innerWidth=${w};selectCity(S.home);UI.tab='cust';renderAll()`);
    const panel = dom.window.document.getElementById('panelBody').textContent;
    assert.match(panel, /Users in Germany/);
    assert.match(panel, /Region/);
    assert.match(panel, /Front door/);
    assert.match(panel, /Customers based here/);
    assert.match(dom.window.document.getElementById('panel').textContent, /Cloud/);
    ev("selectCity('ams');UI.tab='cust';renderAll()");
    const ams = dom.window.document.getElementById('panelBody').textContent;
    assert.match(ams, /Edge stack running/);
    assert.match(ams, /Offers here/);
    assert.match(ams, /CloudFrontal Lobe/);
    assert.match(ev('hsCard()'), /Regions 1\/2/);
  }
  ev("selectCity('nyc');renderAll()");
  assert.match(dom.window.document.getElementById('panelBody').textContent, /Launch in United States/);
  ev("UI.leftTab='goals';renderLeft()");
  assert.match(dom.window.document.getElementById('leftBody').textContent, /Cloud Nine/);
  assert.deepEqual(errors, []);
});

test('a closed or decommissioned region gives its place back at once, and the picker lists the Hyperscaler first', () => {
  const { ev, errors } = load();
  ev("beginGame('Cloud','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});S.cash=1e9;S.lvl=3;for(const c of ['par','ams','lon','nyc'])ACT.buildPop({city:c});");
  assert.equal(ev('hsRgMax()'), 3);
  for (const c of ['par', 'ams']) ev(`ACT.hsRegion({city:'${c}'})`);
  assert.equal(ev('hsRgN()'), 3);
  ev("ACT.hsRegion({city:'lon'})");
  assert.equal(ev('!!S.hs.rg.lon'), false, 'the level holds three');
  // Decommissioning the POP takes its region with it, without a reload.
  ev("UI.decom=['ams'];ACT.decomGo({})");
  assert.equal(ev('!!S.hs.rg.ams'), false);
  assert.equal(ev('hsRgN()'), 2);
  ev("ACT.hsRegion({city:'nyc'})");
  assert.equal(ev('!!S.hs.rg.nyc'), true, 'a region on another continent fits again');
  // Closing a region keeps the POP: the first tap arms it, the second closes it and pays a quarter back.
  const cash = ev('S.cash');
  ev("ACT.hsRgClose({city:'par'})");
  assert.equal(ev('!!S.hs.rg.par'), true);
  ev("ACT.hsRgClose({city:'par'})");
  assert.equal(ev('!!S.hs.rg.par'), false);
  assert.equal(ev('!!S.pops.par'), true);
  assert.equal(ev('S.cash') - cash, ev('HS_T[1].cost*0.25'));
  ev("ACT.hsRegion({city:'lon'})");
  assert.equal(ev('!!S.hs.rg.lon'), true);
  // The last region cannot go.
  ev("for(const c of ['nyc','lon']){ACT.hsRgClose({city:c});ACT.hsRgClose({city:c});}ACT.hsRgClose({city:'fra'});ACT.hsRgClose({city:'fra'})");
  assert.equal(ev('hsRgN()'), 1);
  assert.match(ev('charterPickHtml()'), /data-args='\{"k":"hyper"\}'[\s\S]*data-args='\{"k":"global"\}'/);
  assert.deepEqual(errors, []);
});

test('a POP with no region lists customers based there, never as hosted; the region lists who runs in it; names are never shared', () => {
  const { ev, errors } = load();
  ev("beginGame('Cloud','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});S.cash=1e9;S.lvl=3;ACT.buildPop({city:'nte'});ACT.buyTransit({city:'nte',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'cog',tier:1});" +
    "S.hs.cc.FR={d:20,since:0};const o=hsOffer('tv','nte',10);S.offers.push(o);ACT.accept({id:o.id});compute()");
  assert.equal(ev("S.biz.filter(b=>b.type==='cloud'&&b.city==='nte').length"), 1);
  const nte = ev("cityPanel('nte')");
  assert.match(nte, /Customers based here/);
  assert.match(nte, /nobody is hosted in this POP/);
  assert.doesNotMatch(nte, /Running in this region/);
  const fra = ev("cityPanel('fra')");
  assert.match(fra, /Running in this region/);
  assert.match(fra, /based in Nantes/);
  // Every name of a kind taken: the next one is a sequel, not a twin.
  ev("for(const n of CLOUD_TENANTS.tv.names)useName(n);for(let i=0;i<6;i++){const x=hsOffer('tv','nte',10);S.offers.push(x);}");
  const names = ev("JSON.stringify(S.biz.concat(S.offers).filter(b=>b.type==='cloud').map(b=>b.name))");
  assert.equal(new Set(JSON.parse(names)).size, JSON.parse(names).length, names);
  assert.deepEqual(errors, []);
});
