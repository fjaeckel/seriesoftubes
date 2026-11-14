// The MCP server's act tool (the page's agent facade, src/agent/): typed, checked commands with
// outcomes and quotes, the raw reads (schema, catalog, state, results, ui), and screens beyond the side panel.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSession, TOOLS, actArgs } = require('../scripts/lib/mcp-game');

const tools = (s) => (name, args = {}) => TOOLS.find((t) => t.name === name).run(s, args);
const BIG = path.join(__dirname, 'fixtures', 'big-network.json');
// A sandbox network (money and every level, nothing breaks) with a POP in each city, broadband and transit at home.
function sandbox({ city = 'fra', pops = ['ams'], seed = 7 } = {}) {
  const s = createSession(), T = tools(s), ev = (x) => s.game.ev(x);
  T('new_game', { city, preset: 'sandbox', seed, name: 'Probe' });
  T('act', { action: 'launchBB', args: { city } });
  T('act', { action: 'buyTransit', args: { city, net: 'cog', tier: 1 } });
  for (const c of pops) T('act', { action: 'buildLink', args: { a: city, b: c, tier: 1 } });
  return { s, T, ev };
}
const act = (T, action, args, dryRun) => T('act', { action, args, dryRun });

test('every action in the game is in exactly one class, so a new one forces a decision', () => {
  const { s, ev } = sandbox({ pops: [] });
  const c = s.call('classes');
  const all = [...c.game, ...c.view, ...c.draft, ...c.session, ...c.denied];
  const acts = ev('JSON.stringify(Object.keys(ACT).sort())');
  assert.deepEqual(all.filter((x, i) => all.indexOf(x) !== i), [], 'no action in two classes');
  assert.deepEqual(JSON.parse(acts).filter((x) => !all.includes(x)), [], 'every action is classified');
  assert.deepEqual(all.filter((x) => !JSON.parse(acts).includes(x)), [], 'every classified action exists');
  // Every argument domain resolves, and the tools' fixed vocabularies are the game's.
  const bad = ev(`(()=>{const out=[];
    for(const [n,s] of Object.entries({...API_CMD,...API_VIEW,...API_SESSION}))
      for(const [nm,d] of (s.args||[])) if(!['string','boolean','integer'].includes(d)&&!API_DOMAINS[d]) out.push(n+'.'+nm+': no domain '+d);
    for(const [n,d] of Object.entries(API_DOMAINS)) if(d.table&&!API_TABLES[d.table]&&!(d.table in API_MADE)) out.push('domain '+n+': no table '+d.table);
    return JSON.stringify(out);})()`);
  assert.deepEqual(JSON.parse(bad), []);
  assert.deepEqual(TOOLS.find((t) => t.name === 'new_game').inputSchema.properties.chaos.enum, JSON.parse(ev('JSON.stringify(Object.keys(CHAOS))')));
  assert.deepEqual(s.errors(), []);
});

test('every declared argument is one the action really reads', () => {
  const { s } = sandbox({ pops: [] });
  // Confirmations act passes itself; args the game's own buttons pass (the intern's auto, the sheets' modal flag).
  const injected = { cancelTransit: ['ok'], cancelPni: ['ok'], cancelIx: ['ok', 'sure'], accept: ['auto'], utilityKit: ['modal'], utilityCaches: ['modal'] };
  // What each action destructures, from its source (in the page the actions are wrapped for puzzle mode).
  const reads = actArgs(), sch = TOOLS.find((t) => t.name === 'schema').run(s, {}), bad = [];
  for (const [n, c] of Object.entries({ ...sch.commands, ...sch.view, ...sch.session })) {
    const declared = c.args.map((a) => a.name), r = reads[n];
    if (!r) { if (declared.length && !c.opens && !['buildLink', 'orderDf', 'orderCable', 'decomGo', 'metricSet', 'traceRun', 'pzLinkTo', 'openVxc'].includes(n)) bad.push(`${n}: declares ${declared} but takes no {…}`); continue; }
    for (const x of r) if (!declared.includes(x) && !(injected[n] || []).includes(x)) bad.push(`${n} reads {${x}} but declares no such argument`);
    for (const d of declared) if (!r.includes(d) && !(injected[n] || []).includes(d) && !['buildLink', 'orderDf', 'orderCable', 'decomGo', 'metricSet', 'pzLinkTo'].includes(n)) bad.push(`${n} declares ${d} but does not read it`);
  }
  assert.deepEqual(bad, []);
});

test('the state and results references cover every field', () => {
  const s = createSession(), T = tools(s), ev = (x) => s.game.ev(x);
  const docs = T('schema', { section: 'state' }), rdoc = T('schema', { section: 'results' });
  for (const [label, setup] of [['a new game', () => {}], ['a scenario', () => T('act', { action: 'startScn', args: { id: 'stg' } })], ['the big network', () => T('load_save', { path: BIG })]]) {
    setup();
    assert.deepEqual(Object.keys(T('state')).filter((k) => !docs[k]), [], `${label}: every state field has a line in schema state`);
    assert.deepEqual(Object.keys(T('results')).filter((k) => !rdoc[k]), [], `${label}: every results field has a line in schema results`);
  }
  assert.deepEqual(JSON.parse(ev('JSON.stringify(Object.keys(emptyR()))')).filter((k) => !rdoc[k]), []);
});

test('typed text reaches the game: rename, RouteScript, the custom metric, traceroute', () => {
  const { s, T, ev } = sandbox();
  const r = act(T, 'renameGo', { name: 'Renamed Net' });
  assert.equal(r.outcome, 'applied');
  assert.equal(ev('S.name'), 'Renamed Net');
  for (let i = 0; i < 3; i++) act(T, 'coreUp');
  assert.equal(act(T, 'buyTE').outcome, 'applied');
  const chk = act(T, 'teCheck', { script: 'avoid transit for ggl' });
  assert.equal(chk.outcome, 'applied');
  assert.ok(chk.report.length > 10, 'the check comes back as a report');
  assert.equal(ev("$('modal').hidden"), true, 'and its window is closed');
  const dep = act(T, 'teDeploy', { script: 'avoid transit for ggl' });
  assert.equal(dep.outcome, 'applied');
  assert.equal(ev('S.te.script'), 'avoid transit for ggl', 'the script given is the one deployed');
  const l = ev('S.links[0].id');
  assert.equal(act(T, 'setMetric', { id: l, v: 'custom' }).outcome, 'applied');
  act(T, 'metricMode', { id: l, k: 'w' });
  assert.equal(act(T, 'metricSet', { id: l, v: '42' }).outcome, 'applied');
  assert.equal(ev(`JSON.stringify(Object.values(S.pairMet)[0])`), JSON.stringify({ k: 'w', v: 42 }));
  const t = act(T, 'traceRun', { from: 'fra', to: 'ggl' });
  assert.equal(t.outcome, 'applied');
  assert.match(t.report, /traceroute/);
  assert.deepEqual(s.errors(), []);
});

test('multi-step builds take their choices as arguments: waves, dark fiber, own cable, circuits, closing POPs', () => {
  const { s, T, ev } = sandbox({ city: 'lon', pops: [] });
  const w = act(T, 'buildLink', { a: 'lon', b: 'ams', tier: 1 });
  assert.equal(w.outcome, 'applied');
  assert.equal(ev("S.links.filter(l=>l.kind==='wave').length"), 1);
  assert.ok(ev('!!S.pops.ams'), 'the far end gets a POP');
  assert.equal(act(T, 'orderDf', { a: 'lon', b: 'par', source: 'lease', system: 'roadm' }).outcome, 'applied');
  assert.equal(ev("S.links.filter(l=>l.kind==='df').length"), 1);
  const cab = act(T, 'orderCable', { a: 'lon', b: 'nyc', design: 'standard' });
  assert.equal(cab.outcome, 'applied');
  assert.ok(cab.charged > 0, 'charged is what the cable cost');
  const fab = ev('Object.keys(FAB)[0]');
  act(T, 'buyNni', { city: 'lon', prov: fab, tier: 0 });
  act(T, 'buyNni', { city: 'ams', prov: fab, tier: 0 });
  assert.equal(act(T, 'buyVxc', { a: 'lon', b: 'ams', prov: fab, t: 0 }).outcome, 'applied');
  assert.equal(ev("S.links.filter(l=>l.kind==='vxc').length"), 1);
  assert.equal(act(T, 'decomGo', { cities: ['par'] }).outcome, 'applied');
  assert.ok(ev('!S.pops.par'));
  assert.deepEqual(s.errors(), []);
});

test('confirmations are given in one call; a click still arms them as in the game', () => {
  const { s, T, ev } = sandbox({ pops: ['ams', 'par'] });
  ev(`ACT.addSite({city:'ams'});S.scrubs.push({city:'fra',tier:0});
    S.biz.push({id:'b1',city:'fra',city2:null,reqs:[],name:'C',type:'dia',bw:10,rate:5,mood:100,since:0});
    S.pni.push({id:'p1',city:'fra',net:'lvl',tier:1,ready:S.day});spawnLoanOffer();compute()`);
  act(T, 'takeLoan', { id: ev('S.loanOffers[0].id') });
  const checks = [
    ['rmLink', { id: ev('S.links[0].id') }, 'S.links.length===1'], ['rmSite', { city: 'ams' }, '!S.pops.ams.site2'],
    ['rmScrub', { city: 'fra' }, 'S.scrubs.length===0'], ['dropBiz', { id: 'b1' }, 'S.biz.length===0'],
    ['repayLoan', { id: ev('S.loans[0].id') }, 'S.loans.length===0'], ['cancelPni', { id: 'p1' }, '!S.pni.length'],
    ['cancelTransit', { id: ev('S.transit[0].id') }, '!S.transit.length'],
  ];
  for (const [n, args, did] of checks) {
    assert.equal(act(T, n, args).outcome, 'applied', n);
    assert.equal(ev(did), true, `${n} really did it`);
  }
  const p = T('panel', { link: ev('S.links[0].id') });
  const rm = p.buttons.find((b) => b.act === 'rmLink');
  const c1 = T('click', { button: rm.n });
  assert.equal(ev('S.links.length'), 1, 'the first click only arms the button');
  const again = c1.screen.buttons.find((b) => b.act === 'rmLink');
  T('click', { button: again.n });
  assert.equal(ev('S.links.length'), 0, 'the second one removes the link');
  assert.deepEqual(s.errors(), []);
});

test('the utilities sheet\'s one-call buttons work without a quote in hand', () => {
  const { s, T, ev } = sandbox({ pops: [] });
  const kit = act(T, 'utilityKit', { city: 'fra' });
  assert.equal(kit.outcome, 'applied');
  assert.ok(ev('!!S.pops.fra.gen'), 'the generator is in');
  assert.notEqual(act(T, 'utilityCaches', { city: 'fra' }).outcome, 'rejected');
  assert.deepEqual(s.errors(), []);
});

test('arguments are checked before anything runs, with what would fit', () => {
  const { s, T, ev } = sandbox({ pops: [] });
  const before = ev('JSON.stringify(S)');
  for (const [n, args, re] of [
    ['buyTransit', { city: 'fra', net: 'cog', tier: 9 }, /tier: 9 is not a portTier \(0\.\.\d\)/],
    ['buyTransit', { city: 'fra', net: 'nope', tier: 1 }, /net: "nope" is not a netId \(see catalog NETS or find\)/],
    ['buildPop', { city: 'atlantis' }, /city: "atlantis" is not a cityId/],
    ['peerPol', { p: 'yolo' }, /p: "yolo" is not a peerPolicy \(one of open, selective, closed\)/],
    ['lagT', { id: 'x', d: 5 }, /d: 5 is not a step \(one of 1, -1\)/],
    ['buyTransit', { city: 'fra', net: 'cog' }, /tier is required/],
    ['buildPop', { city: 'ams', size: 3 }, /size is not an argument/],
  ]) assert.throws(() => act(T, n, args), re, n);
  assert.equal(ev('JSON.stringify(S)'), before, 'nothing ran');
  assert.throws(() => act(T, 'dash', {}, true), /only game commands/);
  assert.deepEqual(s.errors(), []);
});

test('the outcome says what happened', () => {
  const { s, T, ev } = sandbox({ pops: [] });
  assert.equal(act(T, 'buildPop', { city: 'ams' }).outcome, 'applied');
  assert.equal(act(T, 'buildPop', { city: 'ams' }).outcome, 'no_effect', 'a POP that is already there');
  assert.equal(act(T, 'setStandby', { id: 'nope', on: true }).outcome, 'no_effect', 'a wrong id');
  assert.equal(act(T, 'dash').outcome, 'shown');
  ev('closeModal();$("dash").hidden=true;S.cash=0');
  const r = act(T, 'buildPop', { city: 'nyc' });
  assert.equal(r.outcome, 'rejected');
  assert.ok(r.toasts.some((t) => /^bad: /.test(t)), 'with the game\'s words');
  ev('S.cash=1e9');
  const tr = act(T, 'buyTransit', { city: 'fra', net: 'ntt', tier: 1 });
  assert.equal(tr.charged, ev('PORT[1].setup'), 'charged is the price at the money gate');
  // A De-Kicks quote is a question: other game commands wait until it is answered or closed.
  const d = act(T, 'buyIx', { city: 'fra', tier: 1 });
  assert.equal(d.outcome, 'decision');
  assert.ok(d.decision.options.some((o) => o.command === 'dkAccept'));
  const wait = act(T, 'buildPop', { city: 'par' });
  assert.equal(wait.outcome, 'decision', 'blocked behind the question');
  assert.ok(!ev('S.pops.par'));
  assert.equal(act(T, 'dkAccept').outcome, 'applied', 'an option answers it');
  assert.equal(act(T, 'buildPop', { city: 'par' }).outcome, 'applied');
  // A sheet the agent opened itself is not a question, even with game commands on it.
  act(T, 'opsOpen');
  assert.equal(T('screen').question, false);
  assert.equal(act(T, 'buildPop', { city: 'lon' }).outcome, 'applied');
  ev('closeModal();S.lost=true');
  assert.equal(act(T, 'buildPop', { city: 'nyc' }).outcome, 'stopped');
  assert.deepEqual(s.errors(), []);
});

test('dry runs do not use up the dice: the seeded game plays on exactly as without them', () => {
  const play = (dry) => {
    const s = createSession(), T = tools(s);
    T('new_game', { city: 'fra', seed: 9 });
    act(T, 'launchBB', { city: 'fra' });
    act(T, 'buyTransit', { city: 'fra', net: 'cog', tier: 1 });
    if (dry) for (const [n, a] of [['pni', { city: 'fra', net: 'lvl', tier: 1 }], ['buildLink', { a: 'fra', b: 'ams', tier: 1 }], ['buildPop', { city: 'ams' }],
      ['orderDf', { a: 'fra', b: 'ams', source: 'lease', system: 'lite' }], ['hackback', {}], ['coreUp', {}]]) assert.equal(act(T, n, a, true).outcome, 'quote');
    T('advance', { days: 90 });
    // Entity ids and the log's wall-clock stamps differ from run to run anyway; everything else is the game.
    return JSON.stringify(JSON.parse(s.game.ev('JSON.stringify(S)'), (k, v) => (k === 'id' || k === 'at' ? undefined : v)));
  };
  assert.equal(play(true), play(false));
});

test('a dry run prices every command that has a price, and changes nothing', () => {
  const { s, T, ev } = sandbox({ pops: ['ams'] });
  act(T, 'orderDf', { a: 'fra', b: 'par', source: 'lease', system: 'lite' });
  ev(`S.scrubs.push({city:'fra',tier:0});spawnLoanOffer();compute()`);
  const quoted = Object.entries(T('schema', { section: 'commands' })).filter(([, c]) => c.dryRun).map(([n]) => n);
  assert.ok(quoted.length >= 50, 'the priceable surface: ' + quoted.length);
  const wave = ev("S.links.find(l=>l.kind==='wave').id"), df = ev("S.links.find(l=>l.kind==='df').id"), fab = ev('Object.keys(FAB)[0]');
  const sample = {
    buildPop: { city: 'nyc' }, launchBB: { city: 'ams' }, ad: { city: 'fra' }, addRouter: { city: 'fra' }, rmRouter: { city: 'fra' }, upRouter: { city: 'fra' },
    addGen: { city: 'fra' }, addSite: { city: 'fra' }, buyTransit: { city: 'fra', net: 'cog', tier: 2 }, lagT: { id: ev('S.transit[0].id'), d: 1 },
    cleanPipe: { id: ev('S.transit[0].id') }, buyIx: { city: 'ams', tier: 1 }, foundIx: { city: 'nyc' }, myIxUp: { city: 'nyc' },
    pni: { city: 'fra', net: 'lvl', tier: 1 }, cache: { city: 'fra', net: 'nfx' }, buildLink: { a: 'fra', b: 'nyc', tier: 1 }, upLink: { id: wave, tier: 2 },
    rmLink: { id: wave }, buyNni: { city: 'fra', prov: fab, tier: 0 }, lagNni: { city: 'fra', prov: fab, d: 1 }, buyVxc: { a: 'fra', b: 'ams', prov: fab, t: 0 }, upVxc: { id: wave, t: 1 },
    orderDf: { a: 'fra', b: 'ams', source: 'lease', system: 'lite' }, orderCable: { a: 'lis', b: 'nyc' }, subUpgrade: { id: df, k: 'terminal' },
    crews: { id: df }, addCh: { id: df, o: 'zr4' }, addPair: { id: df }, upSys: { id: df }, regen: { id: df, d: 1 }, buySpare: { o: 'zr4' }, sellSpare: { o: 'zr4' },
    setChCount: { id: df, o: 'zr4', n: 2 }, repayLoan: { id: 'none' }, buildScrub: { city: 'ams', tier: 1 }, scrubUp: { city: 'fra', tier: 1 },
    fixInc: { id: 'none' }, confGo: { key: T('catalog', { name: 'conferences' })[0].key }, confSponsor: { key: T('catalog', { name: 'conferences' })[0].key },
    opsHire: { id: ev('Object.keys(INTERNS)[0]') }, opsNewPop: { city: 'nyc' }, pniAll: { net: 'cog', tier: 1 }, seatBuy: { n: 2 }, layShip: { id: df }, seaRush: { id: df },
    utilityKit: { city: 'fra' }, utilityCaches: { city: 'fra' }, acceptFix: { id: 'none' }, ptApply: { city: 'fra', k: 'medium' }, ptAll: { k: 'medium' }, teDeploy: { script: 'spill at 85%' }, upLinkX: {},
    pieRd: { k: 'reuse' }, pieAnt: { id: 'none' }, pieTower: { city: 'sin' },
  };
  const missing = quoted.filter((n) => !sample[n] && T('schema', { section: 'commands' })[n].args.some((a) => a.required));
  assert.deepEqual(missing, [], 'every priced command with arguments has a sample here');
  for (const n of quoted) {
    const S0 = ev('JSON.stringify(S)'), U0 = JSON.stringify(T('ui'));
    const q = act(T, n, sample[n] || {}, true);
    assert.equal(q.outcome, 'quote', n);
    assert.equal(q.consistent, true, n);
    assert.ok(Number.isFinite(q.quote.setup) && Array.isArray(q.quote.blocked) && q.quote.blocked.every((b) => typeof b === 'string'), n);
    assert.equal(ev('JSON.stringify(S)'), S0, `${n} leaves the game alone`);
    assert.equal(JSON.stringify(T('ui')), U0, `${n} leaves the view alone`);
  }
  // The price is what the game then charges.
  for (const [n, args] of [['buildPop', { city: 'nyc' }], ['addRouter', { city: 'fra' }], ['buyTransit', { city: 'nyc', net: 'cog', tier: 1 }], ['buildLink', { a: 'fra', b: 'par', tier: 1 }], ['hwLock', {}]]) {
    const q = act(T, n, args, true), r = act(T, n, args);
    assert.equal(r.outcome, 'applied', n);
    assert.equal(r.charged, q.quote.setup, `${n}: the quote is the price`);
  }
  assert.match(act(T, 'orderCable', { a: 'fra', b: 'ams' }, true).quote.blocked[0], /on land/i, 'a blocked quote says why, in the game\'s words');
  assert.deepEqual(s.errors(), []);
});

test('everything an action needs can be read: loan offers, conference keys, recipes, reference tables', () => {
  const { s, T, ev } = sandbox({ pops: [] });
  ev('spawnLoanOffer();compute()');
  const offers = T('state', { path: 'loanOffers' });
  assert.equal(offers.length, 1);
  assert.equal(act(T, 'takeLoan', { id: offers[0].id }).outcome, 'applied');
  assert.equal(T('state', { path: 'loans' }).length, 1);
  const cf = T('catalog', { name: 'conferences' }).find((c) => !c.capacity);
  assert.equal(act(T, 'confGo', { key: cf.key }).outcome, 'applied');
  assert.equal(T('state', { path: `confReg.${cf.key}` }), true);
  for (let i = 0; i < 3; i++) act(T, 'coreUp');
  act(T, 'buyTE');
  const rec = T('catalog', { name: 'TE_RECIPES' })[0];
  assert.equal(act(T, 'teDeploy', { script: rec.script }).outcome, 'applied');
  assert.equal(ev('S.te.script'), rec.script);
  const idx = T('catalog').tables.map((t) => t.name);
  for (const k of ['CITIES', 'NETS', 'OPT', 'INTERNS', 'OPSK', 'CHARTERS', 'SCN', 'conferences', 'BADGES']) assert.ok(idx.includes(k), k);
  assert.throws(() => T('catalog', { name: 'NOPE' }), /No table/);
  assert.deepEqual(T('state', { path: 'pops.fra' }), JSON.parse(ev('JSON.stringify(S.pops.fra)')), 'a subtree is the save\'s own');
  assert.equal(T('state', { path: 'nextFail' }), ev('S.nextFail'), 'nothing is held back');
  assert.equal(T('results', { path: 'served' }), ev('R.served'));
  assert.equal(T('state', { path: 'no.such.path' }), null);
  assert.ok('pending' in T('ui') && !('hover' in T('ui')), 'the view state, without render scratch');
  assert.throws(() => T('schema', { section: 'nope' }), /No section/);
  assert.deepEqual(Object.keys(T('schema')).sort(), ['clock', 'commands', 'denied', 'domains', 'drafts', 'mode', 'results', 'session', 'state', 'view']);
  const a = T('actions');
  for (const x of ['buildLink(a,b,tier,cable?,route?,premiumCrossing?)', 'orderDf(a,b,source,system)', 'teDeploy(script)', 'renameGo(name)', 'rtbh(id?)', 'startScn(id)', 'dfSrc(v)']) assert.ok(a.includes(x), x);
  assert.deepEqual(s.errors(), []);
});

test('the dashboard, the bank, the left drawer and the puzzle box read as text; long text comes in pages', () => {
  const { s, T, ev } = sandbox({ pops: ['ams'] });
  ev('spawnLoanOffer();compute()');
  const bank = act(T, 'bank');
  assert.equal(bank.screen.where, 'bank');
  assert.ok(bank.screen.buttons.some((b) => b.act === 'takeLoan' && b.args.id === ev('S.loanOffers[0].id')), 'the loan offer and its button');
  act(T, 'bankClose');
  ev(`for(const c of ['fra','ams'])S.biz.push({id:uid(),city:c,city2:null,reqs:[],name:'C '+c,type:'dia',bw:10,rate:5,mood:100,since:0});compute()`);
  const dash = act(T, 'dash');
  assert.equal(dash.screen.where, 'dash');
  assert.ok(dash.screen.text.length > 50);
  act(T, 'custOpen');
  const sel = T('screen').buttons.find((b) => b.select === 'custCity');
  assert.ok(sel && sel.options.length > 1, 'a list the game acts on, with its options');
  const pick = T('click', { button: sel.n, value: 'fra' });
  assert.equal(pick.outcome, 'shown');
  assert.throws(() => T('click', { button: T('screen').buttons.find((b) => b.select === 'custCity').n, value: 'nowhere' }), /is a list/);
  act(T, 'dashClose');
  const deals = T('panel', { left: 'deals' });
  assert.equal(deals.where, 'left');
  assert.equal(deals.leftTab, 'deals');
  T('act', { action: 'pzStart', args: { id: ev('PZ[0].id') } });
  assert.equal(ev('S.mode'), 'puzzle');
  const pz = T('screen');
  assert.equal(pz.where, 'puzzle', 'a puzzle shows its box');
  assert.ok(pz.text.length > 50);
  // A big network's panel is longer than one page.
  T('load_save', { path: BIG });
  const p1 = T('panel', { city: 'fra', tab: 'peer' });
  assert.match(p1.textMore || '', /offset \d+/, 'the panel says where the next page starts');
  const off = +/offset (\d+)/.exec(p1.textMore)[1];
  const p2 = T('screen', { where: 'panel', offset: off });
  assert.equal(p2.textFrom, off);
  assert.ok(p2.text.length > 0 && p2.text !== p1.text);
  assert.throws(() => T('screen', { where: 'nope' }), /where is one of/);
  assert.deepEqual(s.errors(), []);
});

test('new_game takes your own ASN and the sandbox chaos dial', () => {
  const s = createSession(), T = tools(s), ev = (x) => s.game.ev(x);
  assert.equal(T('new_game', { city: 'ams', asn: 213337, seed: 2 }).asn, 213337);
  assert.throws(() => T('new_game', { asn: ev('NET.dtk.asn') }), /cannot be yours/, 'a real network\'s ASN');
  assert.throws(() => T('new_game', { asn: 64512 }), /cannot be yours/, 'a private ASN');
  T('new_game', { preset: 'sandbox', chaos: 'spicy' });
  assert.equal(ev('S.rules.chaos'), 'spicy');
  assert.throws(() => T('new_game', { chaos: 'calm' }), /sandbox/);
  assert.throws(() => T('new_game', { preset: 'sandbox', chaos: 'mayhem' }), /chaos is one of/);
  assert.notEqual(T('new_game', { city: 'fra' }).asn, 213337, 'the ASN does not stick to the next game');
  assert.deepEqual(s.errors(), []);
});

test('every button the panels, drawers, dashboard and windows render is classified, and typed ones pass their domains', () => {
  const { s, T, ev } = sandbox({ pops: ['ams'] });
  ev(`ACT.buyIx({city:'ams',tier:1,signed:true});ACT.rs({city:'ams'});S.scrubs.push({city:'fra',tier:0});
    S.pni.push({id:uid(),city:'fra',net:'lvl',tier:1,ready:S.day});S.biz.push({id:uid(),city:'fra',city2:null,reqs:[],name:'C',type:'dia',bw:10,rate:5,mood:100,since:0});
    S.offers.push({id:uid(),city:'fra',name:'O',type:'dia',bw:10,rate:5,exp:S.day+30});spawnLoanOffer();compute()`);
  const c = s.call('classes'), known = new Set([...c.game, ...c.view, ...c.draft, ...c.session, ...c.denied]);
  const typed = T('schema');
  const seen = [];
  const scan = (scr, where) => { for (const b of scr.buttons) { const n = b.act || b.select; seen.push(n);
    assert.ok(known.has(n), `${where}: unclassified ${n}`);
    const spec = typed.commands[n] || typed.view[n];
    if (spec && b.act) for (const k of Object.keys(b.args)) assert.ok(spec.args.some((a) => a.name === k) || ['ok', 'sure', 'auto', 'modal'].includes(k), `${where}: ${n} passes ${k}`); } };
  for (const t of ['cust', 'up', 'peer', 'infra', 'links']) scan(T('panel', { city: 'fra', tab: t }), 'city ' + t);
  scan(T('panel', { link: ev('S.links[0].id') }), 'link');
  for (const l of ['goals', 'deals', 'noc', 'nets']) scan(T('panel', { left: l }), 'left ' + l);
  scan(act(T, 'bank').screen, 'bank'); act(T, 'bankClose');
  for (const k of JSON.parse(ev('JSON.stringify(DTABS)'))) { act(T, 'dash'); scan(act(T, 'dashTab', { k }).screen, 'dash ' + k); }
  act(T, 'dashClose');
  for (const v of ['opsOpen', 'utilities', 'models', 'teHelp', 'puzzleMenu', 'scenarios']) { scan(act(T, v).screen, v); ev('closeModal()'); }
  scan(T('open_link', { from: 'fra', to: 'nyc' }).screen, 'link window');
  assert.ok(seen.length > 100, 'a real sweep: ' + seen.length + ' buttons');
  assert.deepEqual(s.errors(), []);
});
