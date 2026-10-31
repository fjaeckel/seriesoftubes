const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0";
const g = n => `RG.findIndex(r=>r.n===${JSON.stringify(n)})`;

test('every router is classed by the highest backbone it runs', () => {
  const { ev, errors } = load();
  const want = {
    0: ['Rusty Router 9000', 'Edge Lord 400', 'Sonic the Whitebox 32'],
    1: ['Mikrowtik CCR', 'Mikrowtik CCR 3.2T'],
    2: ['Chonk 800', 'Brocadabra MLX-16', 'Extremely Networks SLX 9740'],
    3: ['Absolute Unit 1.6T', 'Arrrhipster 7280R', 'Arrrhipster 7800R', 'Arrrhipster 7800R5'],
    4: ['Absolute Unit 3.2T', 'Disco 8K', 'Disco 8K Ultra', 'Knockia 7750', 'Knockia 7950 XRS', 'Sonic the Whitebox 64', 'The Router at the End of the Universe'],
  };
  for (const [lv, names] of Object.entries(want)) for (const n of names) assert.equal(ev(`RG[${g(n)}].cr`), +lv, n);
  assert.equal(ev('RG.length'), Object.values(want).flat().length, 'every model is classed');
  assert.equal(ev("RG.filter(r=>r.v==='arrrhipster').some(r=>r.cr>=4)"), false, 'no Arrrhipster runs SRv6');
  assert.equal(ev("RG.filter(r=>r.v==='disco'||r.v==='knockia').every(r=>r.cr===4)"), true, 'every Disco and Knockia does');
  // Everything below its top, except the whitebox that does SRv6 natively and no MPLS at all.
  assert.equal(ev(`[0,1,2,3,4].map(L=>rgCore(${g('Disco 8K')},L)).join()`), 'true,true,true,true,true');
  assert.equal(ev(`[0,1,2,3,4].map(L=>rgCore(${g('Sonic the Whitebox 64')},L)).join()`), 'true,false,false,false,true');
  assert.equal(ev(`[0,1,2].map(L=>rgCore(${g('Mikrowtik CCR')},L)).join()`), 'true,true,false');
  // The two new ones go at the end, so saved POPs keep their models.
  assert.equal(ev(g('Brocadabra MLX-16')), ev('RG.length') - 2);
  assert.equal(ev("RG[RG_TOP].n"), 'The Router at the End of the Universe');
  assert.equal(ev("RG_ART.length"), ev("RG.length"), 'a picture for each');
  assert.equal(ev("mainRG(1)"), ev(g('Edge Lord 400')), 'the default upgrade path is unchanged');
  assert.equal(ev(`PZ_RG.includes(${g('Brocadabra MLX-16')})`), false, 'puzzles keep their router list');
  assert.deepEqual(errors, []);
});

test('a new network runs plain IGP: no Auto-TE until the backbone is upgraded, one step at a time', () => {
  const { ev, dom, errors } = load();
  ev(start);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.core)')), { lv: 0, run: 0 });
  ev('ACT.buyTE()');
  assert.equal(ev('!!S.te'), false, 'no Auto-TE on plain IGP');
  ev("ACT.leftTab({t:'noc'})");
  assert.match(dom.window.document.body.textContent, /Backbone/);
  assert.match(dom.window.document.body.textContent, /Auto-TE needs an RSVP-TE/);
  const cash = ev('S.cash');
  ev('ACT.coreUp()');
  assert.equal(ev('S.core.lv'), 1);
  assert.equal(cash - ev('S.cash'), ev('CORE_COST[1]'));
  ev('ACT.buyTE()');
  assert.equal(ev('!!S.te'), false, 'LDP has no TE either');
  ev('ACT.coreUp()');
  assert.equal(ev('S.core.run'), 2);
  ev('ACT.buyTE()');
  assert.equal(ev('!!S.te'), true, 'RSVP-TE unlocks Auto-TE');
  // Customer levels gate each step.
  ev('S.lvl=3;ACT.coreUp()');
  assert.equal(ev('S.core.lv'), 2, 'SR-MPLS needs customer level 5');
  assert.deepEqual(errors, []);
});

test('running a lower level is free, and Auto-TE and RouteScript pause below RSVP-TE', () => {
  const { ev, errors } = load();
  ev(start + ";ACT.coreUp();ACT.coreUp();ACT.coreUp();ACT.buyTE();S.te.script='spill at 80%'");
  assert.equal(ev('S.core.lv'), 3);
  assert.ok(ev('!!teRules()'), 'RouteScript runs on SR-MPLS');
  const cash = ev('S.cash');
  ev('ACT.coreSet({v:1})');
  assert.equal(ev('S.core.run'), 1);
  assert.equal(ev('S.cash'), cash, 'free');
  assert.equal(ev('teRules()'), null, 'paused on LDP');
  ev('compute()');
  assert.equal(ev('R.teMoved'), 0);
  ev('ACT.coreSet({v:3})');
  assert.ok(ev('!!teRules()'), 'back on, script and all');
  ev('ACT.coreSet({v:4})');
  assert.equal(ev('S.core.run'), 3, 'cannot run what was never bought');
  assert.deepEqual(errors, []);
});

test('the core costs router CPU, less the higher it goes; POPs whose router cannot run it stay outside', () => {
  const { ev, errors } = load();
  ev(start + `;ACT.buildPop({city:'ams'});S.pops.fra.rgen=${g('Disco 8K')}`);
  const cap = c => ev(`nodeCap('${c}')`);
  const base = cap('fra');
  const at = [];
  for (let L = 1; L <= 4; L++) { ev('ACT.coreUp()'); at.push(cap('fra') / base); }
  assert.deepEqual(at.map(x => +x.toFixed(2)), [0.9, 0.92, 0.95, 0.97], 'LDP costs the most CPU, SRv6 the least');
  assert.equal(ev("inCore('ams')"), false, 'a Rusty Router cannot run SRv6');
  assert.equal(cap('ams'), ev('RG[0].cap'), 'and pays no CPU for it');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(coreOut())')), ['ams']);
  assert.deepEqual(errors, []);
});

test('label switching: traffic passing through a POP costs its router less from LDP up', () => {
  const pass = lv => {
    const { ev, errors } = load();
    ev(start + ";ACT.buildPop({city:'ams'});ACT.buildPop({city:'bru'});ACT.launchBB({city:'ams'});S.pops.ams.bb.d=150");
    ev(`for(const c in S.pops)S.pops[c].rgen=${g('Mikrowtik CCR')};S.pops.bru.rgen=${g('Chonk 800')};`);
    ev("const L=(a,b,t)=>{openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};L('ams','bru',1);L('bru','fra',1);ACT.buyTransit({city:'fra',net:'cog',tier:1})");
    for (let i = 0; i < lv; i++) ev('ACT.coreUp()');
    ev('compute()');
    assert.deepEqual(errors, []);
    return { load: ev("R.nodeLoad.bru||0"), served: ev('R.served') };
  };
  const ip = pass(0), ldp = pass(1);
  assert.ok(ip.served > 50 && Math.abs(ldp.served - ip.served) < 1, 'same traffic either way');
  assert.ok(ldp.load < ip.load * 0.7, `Brussels only passes it on: lighter with labels (${ldp.load.toFixed(1)} vs ${ip.load.toFixed(1)})`);
});

test('interop failures: only with mixed vendors at the top of what some router can do', () => {
  const { ev, errors } = load();
  ev(start + `;ACT.buildPop({city:'ams'});S.pops.fra.rgen=${g('Disco 8K')};S.pops.ams.rgen=${g('Knockia 7750')};`);
  ev("const L=(a,b,t)=>{openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};L('fra','ams',1)");
  for (let i = 0; i < 4; i++) ev('ACT.coreUp()');
  assert.ok(ev('coreIopRisk()') > 0, 'Disco and Knockia at SRv6, the top for both');
  ev('ACT.coreSet({v:3})');
  assert.equal(ev('coreIopRisk()'), 0, 'one step below: they get along');
  ev('ACT.coreSet({v:4})');
  ev(`S.pops.ams.rgen=${g('Disco 8K Ultra')}`);
  assert.equal(ev('coreIopRisk()'), 0, 'one vendor never fights itself');
  ev(`S.pops.ams.rgen=${g('Knockia 7750')};ACT.coreSet({v:2})`);
  assert.equal(ev('coreIopRisk()'), 0, 'RSVP-TE is below both');
  ev(`S.pops.fra.rgen=${g('Chonk 800')}`);
  assert.ok(ev('coreIopRisk()') > 0, 'a Chonk 800 at RSVP-TE is at its top');
  assert.ok(ev('coreIopRisk()') < ev('CORE_IOP[4]'), 'and RSVP-TE squabbles less than SRv6');
  ev("fireFailure('interop')");
  const inc = "S.inc.find(i=>i.type==='interop')";
  assert.ok(ev(`!!${inc}`), 'an interop incident');
  assert.equal(ev(`linkDown(S.links.find(l=>l.id===${inc}.ref))`), true, 'the link between the vendors is down');
  assert.equal(ev("incTitle('interop')"), 'Vendor interop failure');
  assert.deepEqual(errors, []);
});

test('a new game never gets interop incidents or CPU costs: the classic game is unchanged', () => {
  const { ev, errors } = load();
  ev(start + `;ACT.buildPop({city:'ams'});S.pops.ams.rgen=${g('Knockia 7750')};S.pops.fra.rgen=${g('Disco 8K')}`);
  assert.equal(ev('coreIopRisk()'), 0);
  assert.equal(ev("nodeCap('ams')"), ev(`RG[${g('Knockia 7750')}].cap`));
  assert.deepEqual(errors, []);
});

test('saves: an old save with Auto-TE keeps it on the old rules, scenarios ignore the core, garbage is repaired', () => {
  const { ev, errors } = load();
  ev(start + ";ACT.coreUp();ACT.coreUp();ACT.buyTE()");
  ev("const s=JSON.parse(JSON.stringify(S));delete s.core;window.__t=migrate(s)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__t.core)')), { lv: 2, run: 2, legacy: true }, 'Auto-TE bought before backbones: legacy RSVP-TE');
  ev("S=__t;compute()");
  assert.equal(ev('coreOn()'), false, 'the old rules');
  assert.equal(ev('coreTE()'), true, 'Auto-TE keeps running');
  ev('ACT.coreSet({v:2})');
  assert.equal(ev('coreOn()'), true, 'changing the backbone switches to the new rules');
  ev("const s=JSON.parse(JSON.stringify(S));delete s.core;delete s.te;window.__t=migrate(s)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__t.core)')), { lv: 0, run: 0 }, 'no Auto-TE: plain IGP');
  ev("const s=JSON.parse(JSON.stringify(S));s.core={lv:9,run:-3,legacy:'yes'};window.__t=migrate(s)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__t.core)')), { lv: 4, run: 0 });
  ev("S.scn={id:'x',rules:{},days:9};S.core={lv:0,run:0}");
  assert.equal(ev('coreOn()'), false, 'scenarios set TE up themselves');
  assert.deepEqual(errors, []);
});

test('the backbone panel and the router panels, on a phone too', () => {
  for (const w of [1280, 360]) {
    const { ev, dom, errors } = load();
    ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
    ev(`window.innerWidth=${w};` + start.replace('ACT.start({});', '') + `;ACT.buildPop({city:'ams'});S.pops.fra.rgen=${g('Disco 8K')};ACT.coreUp();ACT.coreUp();ACT.leftTab({t:'noc'});renderAll()`);
    const txt = dom.window.document.body.textContent;
    assert.match(txt, /RSVP-TE\/MPLS/, `${w}px`);
    assert.match(txt, /outside the backbone/, 'Amsterdam is left out');
    assert.match(txt, /Upgrade to SR-MPLS/);
    ev("UI.sel={type:'city',id:'fra'};UI.tab='links';UI.models=true;renderPanel()");
    const p = dom.window.document.getElementById('panelBody').textContent;
    assert.match(p, /Disco · backbone up to SRv6/);
    assert.match(p, /Brocadabra · backbone up to RSVP-TE\/MPLS/);
    assert.match(p, /Whitebox · backbone up to SRv6 · no MPLS, SRv6 only/);
    assert.deepEqual(errors, []);
  }
});

test('an upgraded backbone brings its own customers: L3VPN from LDP, flex-algo from SR-MPLS, slices from SRv6', () => {
  const { ev, errors } = load();
  ev(start + ";for(const c of ['ams','lon','par'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=" + g('Disco 8K'));
  const offered = () => ev("coreProducts(Object.keys(S.pops)).join()");
  assert.equal(offered(), '', 'plain IGP: none of them');
  ev('ACT.coreUp()');
  assert.equal(offered(), 'l3vpn,l3vpn');
  ev('ACT.coreUp();ACT.coreUp()');
  assert.equal(offered(), 'l3vpn,l3vpn,flex,flex');
  ev('ACT.coreUp()');
  assert.equal(offered(), 'l3vpn,l3vpn,flex,flex,slice,slice');
  ev('ACT.coreSet({v:0})');
  assert.equal(offered(), '', 'running plain IGP again: no new offers');
  // Each kind spawns a real offer that can be signed.
  ev('ACT.coreSet({v:4})');
  for (const t of ['l3vpn', 'flex', 'slice']) {
    ev(`S.offers=[];Math.random=(()=>{let s=7;return()=>(s=(s*9301+49297)%233280)/233280;})();for(let i=0;i<60&&!S.offers.some(o=>o.type==='${t}');i++){const p=coreProducts;coreProducts=()=>['${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}','${t}'];spawnOffer();coreProducts=p;}`);
    assert.ok(ev(`S.offers.some(o=>o.type==='${t}')`), `a ${t} offer`);
    assert.ok(ev(`S.offers.find(o=>o.type==='${t}').rate`) > 0, `${t} pays`);
    assert.equal(typeof ev(`bTerms(S.offers.find(o=>o.type==='${t}'))`), 'string');
  }
  // A legacy save or a scenario never sees them.
  ev("S.core.legacy=true");
  assert.equal(offered(), '');
  assert.deepEqual(errors, []);
});

test('fast reroute: from RSVP-TE up, customers lose half as much happiness while a link is cut', () => {
  const hit = run => {
    const { ev, errors } = load();
    ev(start + `;ACT.buildPop({city:'ams'});S.pops.fra.rgen=S.pops.ams.rgen=${g('Disco 8K')};for(let i=0;i<${run};i++)ACT.coreUp();`);
    ev("const L=(a,b,t)=>{openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};L('fra','ams',1);S.links[0].ready=0");
    ev("S.biz.push({id:'b1',type:'dia',city:'ams',name:'X',bw:1,rate:600,mood:80,since:-99});S.links[0].cut=3;bizSf=()=>0.5;dayTick()");
    assert.deepEqual(errors, []);
    return 80 - ev("S.biz.find(b=>b.id==='b1').mood");
  };
  const plain = hit(0), frr = hit(2);
  assert.ok(plain > 0, 'a cut hurts');
  assert.ok(Math.abs(frr - plain / 2) < 0.01, `half as much with FRR (${plain} vs ${frr})`);
  assert.ok(Math.abs(hit(1) - plain) < 0.01, 'LDP has no fast reroute');
});

test('an interop lab cuts interop incidents, is bought once, and survives a save', () => {
  const { ev, errors } = load();
  ev(start + `;ACT.buildPop({city:'ams'});S.pops.fra.rgen=${g('Disco 8K')};S.pops.ams.rgen=${g('Knockia 7750')};`);
  ev("const L=(a,b,t)=>{openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();};L('fra','ams',1)");
  ev('ACT.coreLab()');
  assert.equal(ev('!!S.core.lab'), false, 'nothing to test on plain IGP');
  for (let i = 0; i < 4; i++) ev('ACT.coreUp()');
  const before = ev('coreIopRisk()'), cash = ev('S.cash');
  ev('ACT.coreLab()');
  assert.equal(ev('S.cash'), cash - ev('CORE_LAB'));
  assert.ok(Math.abs(ev('coreIopRisk()') - before * 0.4) < 1e-9, '60% fewer');
  ev('ACT.coreLab()');
  assert.equal(ev('S.cash'), cash - ev('CORE_LAB'), 'bought once');
  ev("S=sanitize(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.core.lab'), true);
  ev("S.core.lab='yes';S=sanitize(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.core.lab'), undefined, 'garbage is dropped');
  assert.deepEqual(errors, []);
});

test('badges for the backbone: label switcher, bleeding edge, single-vendor shop, vendor zoo', () => {
  const { ev, errors } = load();
  const ok = id => ev(`BADGES.find(b=>b.id==='${id}').ok()`);
  ev(start + ";for(const c of ['ams','lon','par','bru','mad','mil','sto'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=" + g('Disco 8K'));
  assert.equal(ev('Object.keys(S.pops).length'), 8);
  for (const id of ['label', 'bleed', 'mono', 'zoo']) assert.equal(ok(id), false, id);
  ev('ACT.coreUp()');
  assert.equal(ok('label'), true);
  ev('ACT.coreUp();ACT.coreUp()');
  assert.equal(ok('mono'), true, 'eight POPs of one vendor on SR-MPLS');
  ev('ACT.coreUp()');
  assert.equal(ok('bleed'), true);
  ev(`S.pops.ams.rgen=${g('Knockia 7750')};S.pops.lon.rgen=${g('Absolute Unit 3.2T')};S.pops.par.rgen=${g('Sonic the Whitebox 64')}`);
  assert.equal(ok('mono'), false);
  assert.equal(ok('zoo'), true, 'Disco, Knockia, Junipurr and Whitebox');
  ev('ACT.coreSet({v:0})');
  assert.equal(ok('zoo'), false, 'not on plain IGP');
  assert.deepEqual(errors, []);
});
