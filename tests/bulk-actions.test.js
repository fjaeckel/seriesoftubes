// Late-game busywork: one policy or one button instead of many clicks, never a decision taken away.
// #316 the intern can leave new fiber dark, #119 the link panel stays open on a sibling, #317 the kit at every POP,
// #241 buy what a customer needs on signing, #315 POP standards by kind, #199 find a network at a POP.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

function setup(t, extra = '') {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.nextFail=S.nextEvent=1e9;UI.speed=0;compute();" + extra);
  return h;
}
const doc = h => h.dom.window.document;
const text = (h, sel) => [...doc(h).querySelectorAll(sel)].map(e => e.textContent).join('\n');
const reload = ev => ev("save();S=migrate(JSON.parse(slotRaw(UI.slot)));compute()");

/* ---------- #316: new fiber stays dark when the player says so ---------- */
const FIBER = "S.lvl=4;S.rules=makeRules('freeze');ACT.launchBB({city:'fra'});S.pops.fra.rgen=2;ACT.buildPop({city:'ams'});S.pops.ams.rgen=2;compute();" +
  "ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal();" +
  "S.links.push({id:'f',a:'fra',b:'ams',kind:'df',sys:'roadm',ch:[],km:450,sub:false,ready:0,cut:0,mo:1,trench:'f'});compute();S.ops.on.optics=true;";
const ch = ev => JSON.parse(ev("JSON.stringify(S.links.find(l=>l.id==='f').ch)"));

test('#316 by default the intern still lights new fiber, also in a save from before the switch', t => {
  const { ev, errors } = setup(t, FIBER);
  assert.equal(ev("opsP('optics','fresh')"), true);
  ev("S.ops.p.optics={}");
  reload(ev);
  assert.equal(ev("opsP('optics','fresh')"), true, 'an old save has no setting: the old behaviour');
  ev('opsDay(S.day)');
  assert.ok(ch(ev).length > 0);
  assert.deepEqual(errors, []);
});

test('#316 told not to, the intern leaves new fiber dark but still grows hot lit fiber', t => {
  const { ev, errors } = setup(t, FIBER);
  ev("ACT.opsOpen();ACT.opsParam({k:'optics',p:'fresh',v:1})");
  assert.equal(ev("opsP('optics','fresh')"), false);
  ev('opsDay(S.day)');
  assert.deepEqual(ch(ev), [], 'dark fiber stays dark');
  ev("S.links.find(l=>l.id==='f').ch=['zr8'];compute();R.load.f=dfCap(S.links.find(l=>l.id==='f'))*0.95;opsDay(S.day)");
  assert.ok(ch(ev).length > 1, 'a lit, hot fiber still gets more optics');
  reload(ev);
  assert.equal(ev("opsP('optics','fresh')"), false, 'the switch survives a reload');
  ev("S.ops.p.optics.fresh='maybe';S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev("opsP('optics','fresh')"), true, 'a bad value is repaired to the default');
  assert.deepEqual(errors, []);
});

test('#316 the switch is in the Ops sheet', t => {
  const h = setup(t, FIBER);
  h.ev('ACT.opsOpen()');
  assert.match(h.ev("document.getElementById('modalCard').textContent"), /Light new fiber/);
  assert.deepEqual(h.errors, []);
});

/* ---------- #119: decommissioning one of several waves keeps the panel open ---------- */
test('#119 the link panel moves on to the next parallel link, and closes after the last', t => {
  const h = setup(t, "ACT.buildPop({city:'ams'});" +
    "for(const id of ['w1','w2','w3'])S.links.push({id,a:'fra',b:'ams',kind:'wave',tier:0,km:450,sub:false,cut:0,mo:1000});compute();UI.sel={type:'link',id:'w1'};renderAll()");
  const { ev, errors } = h;
  ev("ACT.rmLink({id:'w1'});ACT.rmLink({id:'w1'})");
  assert.equal(ev("S.links.some(l=>l.id==='w1')"), false);
  assert.equal(ev('JSON.stringify(UI.sel)'), JSON.stringify({ type: 'link', id: 'w2' }));
  assert.equal(ev("document.getElementById('panel').hidden"), false, 'the panel is still open');
  ev("ACT.rmLink({id:'w2'});ACT.rmLink({id:'w2'})");
  assert.equal(ev('UI.sel.id'), 'w3');
  ev("ACT.rmLink({id:'w3'});ACT.rmLink({id:'w3'})");
  assert.equal(ev('UI.sel'), null, 'the last link closes it');
  assert.deepEqual(errors, []);
});

/* ---------- #317: the redundancy kit at every POP ---------- */
const POPS = "for(const c of ['ams','lon','par'])ACT.buildPop({city:c});compute();";
test('#317 one button kits every POP, at the sum of the per-POP quotes', t => {
  const { ev, errors } = setup(t, POPS + 'S.lvl=2;');
  const q = JSON.parse(ev('JSON.stringify(utilityKitAll())'));
  assert.equal(q.cities.length, 4);
  assert.equal(q.cost, ev("Object.keys(S.pops).reduce((a,c)=>a+utilityKit(c).cost,0)"));
  ev("ACT.utilities({})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Kit all 4 POPs/);
  const cash = ev('S.cash');
  ev(`ACT.utilityKitAll({cost:${q.cost + 1}})`);
  assert.equal(ev('S.cash'), cash, 'a stale quote buys nothing');
  assert.match(ev("document.getElementById('modalCard').textContent"), /quote changed/);
  ev(`ACT.utilityKitAll({cost:${q.cost}})`);
  assert.equal(ev('S.cash'), cash - q.cost);
  assert.equal(ev("Object.values(S.pops).every(p=>p.gen&&p.site2&&p.routers>=2)"), true);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Every POP has the full kit/);
  assert.deepEqual(errors, []);
});

test('#317 needs level 2, never spends what is not there, and can put the kit in the intern\'s template', t => {
  const { ev, errors } = setup(t, POPS);
  ev('S.lvl=1;ACT.utilities({})');
  assert.equal(ev('utilityKitAll()'), null);
  assert.doesNotMatch(ev("document.getElementById('modalCard').textContent"), /Redundancy kit everywhere/);
  ev('S.lvl=2;window.q=utilityKitAll().cost;S.cash=q-1;ACT.utilityKitAll({cost:q})');
  assert.equal(ev('S.cash'), ev('q-1'));
  assert.equal(ev("Object.values(S.pops).some(p=>p.gen)"), false);
  ev("S.cash=1e8;ACT.opsHire({id:'annie'});closeModal();S.ops.tpl.kit=false;ACT.utilities({})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /come without the kit/);
  ev('ACT.utilityKitNew({})');
  assert.equal(ev('S.ops.tpl.kit'), true);
  assert.match(ev("document.getElementById('modalCard').textContent"), /get the kit too/);
  assert.deepEqual(errors, []);
});

/* ---------- #241: buy what the customer asks for, on signing ---------- */
const OFFER = (reqs, extra = {}) => `ACT.buildPop({city:'ams'});S.offers.push(${lit({ id: 'o1', city: 'fra', city2: 'ams', name: 'Needy Corp', type: 'l2vpn', bw: 1, rate: 900, reqs, exp: 30, ...extra })});compute();`;
test('#241 the offer shows what is missing with its price, and one button buys it and signs', t => {
  const h = setup(t, OFFER(['gen', 'routers']));
  const { ev, errors } = h;
  const q = JSON.parse(ev("JSON.stringify(reqFix(S.offers[0]))"));
  assert.deepEqual(q.items.map(x => x.k + '@' + x.city), ['gen@fra', 'gen@ams', 'routers@fra']);
  assert.equal(q.cost, ev("2*GEN_COST+routerCost(0,1)"));
  ev("UI.left='deals';UI.leftOpen=true;window.innerWidth=390;renderAll()");
  const card = text(h, '#left');
  assert.match(card, /Missing: a backup generator in Frankfurt, a backup generator in Amsterdam, a second router in Frankfurt/);
  assert.match(card, /Buy it and sign/);
  assert.ok(doc(h).querySelector('[data-act="acceptFix"]'), 'the button is there on a phone');
  const cash = ev('S.cash');
  ev(`ACT.acceptFix({id:'o1',cost:${q.cost}})`);
  assert.equal(ev('S.cash'), cash - q.cost);
  assert.equal(ev("S.pops.fra.gen&&S.pops.ams.gen&&S.pops.fra.routers===2"), true);
  assert.equal(ev("S.biz.some(b=>b.id==='o1')&&!S.offers.length"), true, 'signed');
  assert.equal(ev("reqOk(S.biz.find(b=>b.id==='o1'))"), true, 'and every requirement is met');
  assert.deepEqual(errors, []);
});

test('#241 never silent: a stale price, too little cash or a deal that cannot be signed buys nothing', t => {
  const { ev, errors } = setup(t, OFFER(['metro']));
  const cost = ev("reqFix(S.offers[0]).cost");
  assert.equal(cost, ev('2*SITE2_COST'));
  ev(`ACT.acceptFix({id:'o1',cost:${cost - 1}})`);
  assert.equal(ev("!!S.pops.fra.site2||S.biz.length>0"), false);
  ev(`S.cash=${cost - 1};ACT.acceptFix({id:'o1',cost:${cost}})`);
  assert.equal(ev("!!S.pops.fra.site2||S.biz.length>0"), false);
  ev(`S.cash=1e8;S.offers[0].city2='lon';ACT.acceptFix({id:'o1',cost:${cost}})`);
  assert.equal(ev("!!S.pops.fra.site2||S.biz.length>0"), false, 'no POP in London: nothing is bought');
  assert.equal(ev("reqFixHtml(S.offers[0])"), '');
  ev("S.offers[0].city2='ams';S.offers[0].reqs=['nocog']");
  assert.equal(ev("reqFix(S.offers[0])"), null, 'only hardware at a POP is offered');
  assert.deepEqual(errors, []);
});

/* ---------- #315: POP standards by kind ---------- */
test('#315 save a standard, bring a POP up to it, then every POP of that kind at once', t => {
  const h = setup(t, POPS + "S.lvl=4;S.pops.fra.routers=2;S.pops.fra.rgen=1;compute();");
  const { ev, errors } = h;
  ev("UI.sel={type:'city',id:'fra'};UI.tab='links';window.innerWidth=390;renderAll()");
  assert.match(text(h, '#panel'), /POP standards/);
  assert.match(text(h, '#panel'), /Regional hub/);
  ev("ACT.ptSave({city:'fra',k:'medium'})");
  assert.equal(ev("JSON.stringify(S.popTiers.def.medium)"), JSON.stringify({ g: 1, rt: 2 }));
  assert.equal(ev('S.popTiers.at.fra'), 'medium');
  const q = JSON.parse(ev("JSON.stringify(ptPlan('ams','medium'))"));
  assert.deepEqual(q.steps, ['swap', 'add'], 'an empty POP swaps first, then adds');
  const cash = ev('S.cash');
  ev(`ACT.ptApply({city:'ams',k:'medium',cost:${q.cost}})`);
  assert.equal(ev('S.cash'), cash - q.cost, 'charged exactly the quote');
  assert.equal(ev("S.pops.ams.routers===2&&S.pops.ams.rgen===1&&S.popTiers.at.ams==='medium'"), true);
  // The standard grows: one button brings both medium POPs up.
  ev("S.pops.fra.routers=3;S.pops.fra.rgen=2;S.pops.fra.rupDay=-1;ACT.ptSave({city:'fra',k:'medium'});S.pops.fra.routers=2;S.pops.fra.rgen=1;S.pops.ams.rupDay=-1;compute()");
  const A = JSON.parse(ev("JSON.stringify({n:ptAll('medium').todo.length,cost:ptAll('medium').cost})"));
  assert.equal(A.n, 2);
  ev('ACT.utilities({})');
  assert.match(ev("document.getElementById('modalCard').textContent"), /Bring 2 POPs up/);
  ev(`ACT.ptAll({k:'medium',cost:${A.cost}})`);
  assert.equal(ev("['fra','ams'].every(c=>S.pops[c].routers===3&&S.pops[c].rgen===2)"), true);
  assert.equal(ev("ptAll('medium').todo.length"), 0);
  assert.deepEqual(errors, []);
});

test('#315 a busy lone router gets its partner before the swap, and never a step down', t => {
  const { ev, errors } = setup(t, POPS + "S.lvl=4;ACT.launchBB({city:'ams'});S.popTiers.def.hub={g:2,rt:2};S.popTiers.def.micro={g:0,rt:1};compute();");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(ptPlan('ams','hub').steps)")), ['add', 'swap']);
  ev("ACT.ptApply({city:'ams',k:'hub',cost:ptPlan('ams','hub').cost})");
  assert.equal(ev("S.pops.ams.routers===2&&S.pops.ams.rgen===2"), true);
  assert.equal(ev("S.inc.some(i=>i.type==='maint'&&i.ref==='ams')"), false, 'a rolling upgrade, no maintenance window');
  assert.equal(ev("ptPlan('ams','micro')"), null, 'a smaller standard asks for nothing');
  ev("ACT.ptApply({city:'ams',k:'micro',cost:0})");
  assert.equal(ev("S.pops.ams.rgen===2&&S.pops.ams.routers===2&&S.popTiers.at.ams==='micro'"), true, 'only marked');
  assert.deepEqual(errors, []);
});

test('#315 level 1 has no standards, and saves old and broken load', t => {
  const h = setup(t, POPS);
  const { ev, errors } = h;
  ev("UI.sel={type:'city',id:'fra'};UI.tab='links';renderAll()");
  assert.doesNotMatch(text(h, '#panel'), /POP standards/);
  ev("ACT.ptSave({city:'fra',k:'micro'})");
  assert.equal(ev('S.popTiers.def.micro'), null);
  ev('delete S.popTiers;S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.equal(ev('JSON.stringify(S.popTiers)'), JSON.stringify({ def: { micro: null, medium: null, hub: null }, at: {} }));
  ev("S.popTiers={def:{micro:{g:999,rt:2},hub:{g:1,rt:99},bogus:{g:1,rt:1}},at:{fra:'hub',ams:'nope',xyz:'micro',ber:'hub'}};S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('JSON.stringify(S.popTiers)'), JSON.stringify({ def: { micro: null, medium: null, hub: { g: 1, rt: ev('RMAX') } }, at: { fra: 'hub' } }));
  assert.deepEqual(errors, []);
});

/* ---------- #199: find a network at a POP ---------- */
test('#199 search and connected-only filter the transit, exchange and PNI lists, on a phone', t => {
  const h = setup(t, "S.lvl=4;ACT.buyTransit({city:'fra',net:'cog',tier:0});compute();window.innerWidth=390;UI.sel={type:'city',id:'fra'};UI.tab='up';renderAll()");
  const { ev, errors } = h;
  const rows = () => [...doc(h).querySelectorAll('#panel .row .nm')].map(e => e.textContent.trim());
  const all = rows().length;
  assert.ok(doc(h).getElementById('netQ'), 'the search box is there');
  ev("ACT.netOnly()");
  assert.equal(rows().length, 1);
  assert.match(rows()[0], /Cogentle/);
  ev("ACT.netClear()");
  assert.equal(rows().length, all);
  // Typing into the box filters as you go, and the box keeps focus and text.
  ev("const i=document.getElementById('netQ');i.focus();i.value='goggle';i.dispatchEvent(new window.Event('input',{bubbles:true}))");
  assert.equal(ev("document.activeElement.id"), 'netQ');
  assert.equal(ev("UI.netQ"), 'goggle');
  ev("UI.tab='peer';renderAll()");
  const peer = rows();
  assert.ok(peer.length > 0 && peer.every(r => /Goggle/.test(r)), peer.join(' | '));
  ev("ACT.netFind({q:'zzzz'})");
  assert.match(text(h, '#panel'), /No network here matches this filter/);
  ev("ACT.netFind({q:String(NET.ggl.asn)})");
  assert.match(text(h, '#panel'), /Goggle/, 'an AS number finds the network');
  assert.deepEqual(errors, []);
});
