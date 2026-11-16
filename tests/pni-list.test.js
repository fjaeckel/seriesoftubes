// The PNI list (#175, #172): how you reach each network, whether a PNI here is worth it, sorted, filtered and grouped.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt with 100G of Cogentle transit and 50G of eyeballs: nothing dropped, everything over transit.
const fra = (ev, d = 50) => {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev(`S.pops.fra.bb.d=${d};S.grace=null;ACT.buyTransit({city:'fra',net:'cog',tier:1});for(const t of S.transit)t.ready=0;compute()`);
};
const chip = (ev, id, c = 'fra') => ev(`(()=>{const d=document.createElement('div');d.innerHTML=pniChip('${id}',${c ? `'${c}'` : 'null'});return d.textContent})()`);

test('one status chip per network, most direct first', () => {
  const { ev, errors } = load();
  fra(ev);
  assert.equal(chip(ev, 'ggl'), '💸 Via transit');
  // PNI here, with its size and load
  ev("S.pni.push({id:'pg',net:'ggl',city:'fra',tier:1});compute()");
  const load_ = ev("pct(R.usePni[S.pni[0].id]/100)");
  assert.equal(chip(ev, 'ggl'), `🔗 PNI here · 100G · ${load_}`);
  // On order shows as such
  ev("S.pni[0].ready=S.day+20;compute()");
  assert.equal(chip(ev, 'ggl'), '🔗 PNI here · on order');
  ev("S.pni[0].ready=0;compute()");
  // Elsewhere: the city names, and in the Networks tab (no POP) "PNI at"
  ev("for(const c of ['ams','lon','par'])S.pni.push({id:'x'+c,net:'nfx',city:c,tier:1});compute()");
  assert.equal(chip(ev, 'nfx'), '🔗 PNI elsewhere: Amsterdam, London +1');
  assert.equal(chip(ev, 'ggl', null), '🔗 PNI at Frankfurt');
  // IX session
  ev("ACT.buyIx({city:'fra',tier:1,signed:true});S.peers['akm@fra']=true;compute()");
  assert.equal(chip(ev, 'akm'), `🤝 Peers at ${ev("ixName('fra')")}`);
  // Through a peer's customer cone: named after the peer that carries it (R.cone)
  ev("S.pni.push({id:'pntt',net:'ntt',city:'fra',tier:1});compute()");
  assert.equal(ev("R.cone.voc"), 'ntt');
  assert.equal(chip(ev, 'voc'), `🧺 Via ${ev("NET.ntt.name")}'s cone`);
  // Not reached once transit goes
  ev("S.transit=[];compute()");
  assert.equal(ev("R.reachable.lvl"), false);
  assert.equal(chip(ev, 'lvl'), '🚫 Not reached');
  assert.deepEqual(errors, []);
});

test('the value line matches the transit bill by hand, and the worth-it rule', () => {
  const { ev, errors } = load();
  fra(ev);
  const v = ev("pniVal('ggl','fra')");
  const t = ev("(()=>{const t=S.transit[0];return {q:R.p95[t.id],per:transitPerG(NET[t.net],t.city,premOn(t))*S.priceMul,floor:PORT[t.tier].g*0.2}})()");
  assert.ok(v.t > 1 && v.ix === 0 && v.p === 0 && v.u < 1e-6, 'all of it over transit');
  assert.ok(t.q - v.t > t.floor, 'above the commit, so each Gbps saved is the per-Gbps price');
  assert.ok(Math.abs(v.saved - v.t * t.per) < 1e-6, 'saved = Gbps × transit price');
  assert.equal(v.cost, ev("PORT[1].pni"), 'a 100G PNI with Goggle (no fee, no per-G)');
  assert.equal(v.tier, 1, 'the smallest port Goggle accepts');
  assert.equal(v.val, v.saved - v.cost);
  assert.equal(v.worth, v.val > 0);
  // Below the commit floor nothing is saved: a tiny network has little to gain.
  const small = ev("pniVal('pst','fra')");
  assert.ok(small.g < 1 && !small.worth);
  // A full transit port drops traffic: a PNI that carries it is worth it even if it saves no transit.
  ev("S.pops.fra.bb.d=400;compute()");
  const big = ev("pniVal('nfx','fra')");
  assert.ok(big.u >= 1 && big.drop >= 1 && big.worth, 'dropped traffic makes it worth it');
  // Information only: routing is the same with or without the list reading it.
  const before = ev("JSON.stringify(R.usePni)+R.served");
  ev("renderAll();UI.sel={type:'city',id:'fra'};UI.tab='peer';renderPanel();compute()");
  assert.equal(ev("JSON.stringify(R.usePni)+R.served"), before);
  assert.deepEqual(errors, []);
});

test('the PNI list: worth it first, filters, groups by type folded when idle, phones', () => {
  const { ev, errors, dom } = load();
  dom.window.innerWidth = 360;
  fra(ev, 400);
  ev("S.pni.push({id:'pg',net:'ggl',city:'fra',tier:1});compute()");
  const panel = () => { ev("UI.sel={type:'city',id:'fra'};UI.tab='peer';UI._ph=null;renderPanel()"); return dom.window.document.getElementById('panelBody'); };
  let p = panel();
  const heads = [...p.querySelectorAll('.pgrp')].map(x => x.textContent);
  assert.ok(heads.length >= 4, 'grouped by type');
  assert.match(heads[0], /Tier 1/);
  assert.ok(heads.some(h => /Paid peering/.test(h)), 'paid networks get their own group');
  // A group with nothing worth it and no PNI stays folded; one with a worth-it network is open, best first.
  const rows = ev("(()=>{const r=NETS.filter(n=>n.pops.includes('fra')&&n.type==='cdn'&&n.pol!=='paid').map(n=>({id:n.id,v:pniVal(n.id,'fra')})).filter(x=>!S.pni.some(p=>p.net===x.id));return r})()");
  const w = rows.filter(r => r.v.worth).sort((a, b) => b.v.val - a.v.val);
  assert.ok(w.length, 'some content network is worth it at 400G of demand');
  const names = [...p.querySelectorAll('.prow .nm')].map(x => x.textContent);
  const first = ev(`NET.${w[0].id}.name`);
  assert.ok(names.some(n => n.startsWith(first) && /Worth it/.test(n)), 'best candidate is tagged');
  assert.equal(p.querySelectorAll('.prow .pchip').length, names.length, 'every row has a status chip');
  assert.ok(p.querySelector('.pval'), 'value line');
  // Filters
  ev("ACT.pniFilter({f:'pni'})");p = panel();
  assert.deepEqual([...p.querySelectorAll('.prow .nm')].map(x => x.textContent.split(' ')[0]), [ev("NET.ggl.name").split(' ')[0]]);
  ev("ACT.pniFilter({f:'worth'})");p = panel();
  assert.ok([...p.querySelectorAll('.prow .nm')].every(x => /Worth it/.test(x.textContent)));
  ev("ACT.pniFilter({f:'t'})");p = panel();
  assert.ok([...p.querySelectorAll('.pchip')].every(x => /Via transit|Not reached/.test(x.textContent)));
  // Folding and unfolding by hand, A-Z sort
  ev("ACT.pniFilter({f:'all'})");
  ev("ACT.pniGrp({g:'t1',o:0})");p = panel();
  assert.match(p.querySelector('.pgrp').textContent, /▸/);
  ev("ACT.pniGrp({g:'t1',o:1});ACT.pniSort()");p = panel();
  assert.match(p.textContent, /Sort: A–Z/);
  // Phone: chips wrap, value text stays on one line
  const css = ev("[...document.querySelectorAll('style')].map(s=>s.textContent).join('')");
  assert.match(css, /\.pchips\{display:flex;flex-wrap:wrap/);
  assert.match(css, /\.pval\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
  assert.equal(ev("isPhone()"), true);
  assert.deepEqual(errors, []);
});

test('the same chip in the Networks tab and the bulk PNI preview', () => {
  const { ev, errors, dom } = load();
  fra(ev);
  ev("S.pni.push({id:'pg',net:'ggl',city:'fra',tier:1});compute()");
  ev("UI.sel=null;UI.left='nets';UI.leftOpen=true;UI._lh=null;renderLeft()");
  const left = dom.window.document.getElementById('leftBody');
  assert.ok(left.querySelectorAll('.pchip').length >= 10);
  assert.ok(/PNI at Frankfurt/.test(left.textContent), 'Goggle shows its PNI');
  ev("ACT.pniAllOpen({net:null})");
  const m = dom.window.document.getElementById('modal');
  assert.ok(m.querySelectorAll('.pchip').length > 0);
  assert.ok(/Via transit/.test(m.textContent), 'bulk preview chips');
  assert.deepEqual(errors, []);
});

test('every language renders the PNI list without raw labels', () => {
  for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
    const { ev, errors, dom } = load({ lang });
    fra(ev, 400);
    ev("UI.sel={type:'city',id:'fra'};UI.tab='peer';renderPanel();UI.left='nets';UI.leftOpen=true;renderLeft()");
    const txt = dom.window.document.getElementById('panelBody').textContent + dom.window.document.getElementById('leftBody').textContent;
    assert.doesNotMatch(txt, /pni_list\./, lang);
    assert.ok(dom.window.document.querySelector('#panelBody .pchip'), lang);
    assert.deepEqual(errors, [], lang);
  }
});

// The list asks about the one POP on screen, after every routing: its sums come from that POP's flows alone
// (pniFlows()), and must be what adding up every flow of the network gives, flow by flow, in the same order.
test('one POP\'s flows add up to the same sums as a pass over every flow', () => {
  const { ev, errors } = load();
  const BIG = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  ev(`S=migrate(JSON.parse(${JSON.stringify(BIG)}));UI.started=true;compute()`);
  assert.ok(ev('R.flc.NF') > 10000, 'a big network');
  const same = ev(`(()=>{const F={};for(const f of R.fl){if(f.junk)continue;const m=F[f.c]||(F[f.c]={});let o=m[f.n];if(!o)o=m[f.n]={t:0,ix:0,p:0,h:0,u:0,T:{},I:{}};
    o.u+=f.rem;o.t+=f.gt;o.ix+=f.gi;o.p+=f.gp;o.h+=f.gh;if(f.gt)o.T[f.ti]=(o.T[f.ti]||0)+f.gt;if(f.gi)o.I[f.ii]=(o.I[f.ii]||0)+f.gi;}
    let n=0;for(const c of Object.keys(S.pops)){if(JSON.stringify(pniFlows(c))!==JSON.stringify(F[c]||{}))return 'differs at '+c;n+=Object.keys(F[c]||{}).length;}
    return n>1000?'same':'too few sums: '+n;})()`);
  assert.equal(same, 'same');
  // A POP that is asked about twice gets the sums it already has, a city with no POP gets none, and a new routing starts over.
  assert.equal(ev("pniFlows('fra')===pniFlows('fra')"), true);
  assert.equal(ev("JSON.stringify(pniFlows(CITIES.find(c=>!S.pops[c.id]).id))"), '{}');
  assert.equal(ev("(()=>{const a=pniFlows('fra');compute();return pniFlows('fra')!==a&&JSON.stringify(pniFlows('fra'))===JSON.stringify(a);})()"), true);
  // What a PNI would be worth still agrees with the order the intern sorts by.
  assert.equal(ev("NETS.filter(n=>!n.tail&&n.pops.includes('fra')).every(n=>Math.abs(pniVal(n.id,'fra').want-pniWant('fra',n.id))<1e-9)"), true);
  assert.deepEqual(errors, []);
});
