// The Hyperscaler's charter card and Cloud tab as one design (93-ui/55-hyper-panel.js): what needs you comes first,
// worst first, four at most with the rest one tap away; one next step; short lines; Cloud Nine's conditions; offers
// open until folded; details folded. The Cloud tab is sections that fold, open by themselves when a flag says they need
// you. Every screen renders at 360 px (portrait and landscape) and at desktop width with no errors and no row of more
// than two buttons.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)}});`;
/* Regions in Frankfurt (home, a Server Barn), Paris and Amsterdam (Rack Shacks), transit at each, German and French
   users, waves between them; a fourth and fifth POP so the panel is past the early game (pnVet). */
function net(t) {
  const h = load({ seed: 11 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=8;S.nextFail=S.nextEvent=1e9;for(const c of ['par','ams','lon','mad'])ACT.buildPop({city:c});" +
    "for(const c in S.pops)S.pops[c].rgen=RG_TOP;for(const c of ['fra','par','ams','lon'])ACT.buyTransit({city:c,net:'cog',tier:3});" +
    "S.hs.rg.fra={t:1,ready:0,mw:20};S.hs.rg.par={t:0,ready:0,mw:5};S.hs.rg.ams={t:0,ready:0,mw:5};S.hs.cc.DE={d:300,since:0};S.hs.cc.FR={d:200,since:0};S.hs.rep.fra='ams';S.links=[];" +
    wave('fp', 'fra', 'par', 3) + wave('fa', 'fra', 'ams', 3) + wave('ap', 'ams', 'par', 3) + wave('al', 'ams', 'lon', 3) + wave('pm', 'par', 'mad', 3) +
    "compute();hsDay(S.day);checkGoals();S.log=[];UI.left='goals';UI.leftOpen=true;UI.sel=null;renderAll()");
  return h;
}
// Trouble of every kind the card knows, so it has more alerts than it shows.
const TROUBLE = "S.hs.prot.par={until:S.day+40,kind:'delay',g:1,on:'rg'};S.hs.pev.push({k:'heat',reg:'EU',until:S.day+9});S.hs.lag['fra>ams']=80;" +
  "S.hs.jo.push({id:'j1',n:'DeepThink Tank',a:'fra',b:'par',g:3200,wk:6,tb:1e6,fee:3e6,exp:S.day+3});hsRegionFail('par',2,'test');S.hs.cc.IN={d:50,since:0};compute()";
const sizes = [[360, 740, 'portrait'], [740, 360, 'landscape'], [1280, 800, 'desktop']];
const rows2 = (ev, sel) => ev(`[...document.querySelectorAll('${sel} .btns')].every(b=>b.querySelectorAll('button').length<=2)`);

test('the charter card: what needs you first, worst first, then the next step and the state of things', (t) => {
  const { ev, dom, errors } = net(t);
  ev(TROUBLE);
  const doc = dom.window.document;
  for (const [w, h, name] of sizes) {
    ev(`innerWidth=${w};innerHeight=${h};UI.fold={};UI._lh=null;renderAll()`);
    const card = doc.querySelector('#leftBody .hsc');
    assert.ok(card, `the card is there (${name})`);
    const al = [...card.querySelectorAll('.hsa')];
    assert.equal(al.length, 4, `four alerts shown (${name})`);
    assert.ok(al[0].classList.contains('lv0') && /Paris is down/.test(al[0].textContent), 'the region down comes first');
    const lv = al.map((a) => +a.className.match(/lv(\d)/)[1]);
    assert.deepEqual(lv, lv.slice().sort((a, b) => a - b), 'worst first');
    assert.ok(card.querySelector('[data-act="leftFold"][data-args*="hsal"]'), 'the rest one tap away');
    assert.ok(card.querySelector('.hsc-nx'), 'one next step');
    assert.equal(card.querySelectorAll('.hsc-nx').length, 1);
    assert.match(card.querySelector('.hsc-st').textContent, /Users: .*Regions .*Power: .*Replication .*backlog/s);
    assert.match(card.querySelector('.hsc-c9').textContent, /Regions on 1 of 5 continents/);
    assert.match(card.querySelector('.hsc-p').textContent, /\/4/);
    assert.match(card.querySelector('.hsc-off').textContent, /offers? waiting[\s\S]*DeepThink Tank/, 'offers open until folded');
    assert.equal(card.querySelector('.hsc-more'), null, 'details folded');
    assert.ok(rows2(ev, '#leftBody'), `rows of two buttons at most (${name})`);
    // The folds.
    ev("ACT.leftFold({k:'hsal'})");
    assert.ok(doc.querySelectorAll('#leftBody .hsa').length > 4, 'every alert once unfolded');
    assert.match(doc.querySelector('#leftBody .hsc').textContent, /offers? below end(s)? within 5 days/, 'an offer about to end is an alert');
    ev("ACT.leftFold({k:'hsmore'});ACT.leftFold({k:'hsoff'})");
    assert.match(doc.querySelector('#leftBody .hsc-more').textContent, /Users pay/);
    assert.doesNotMatch(doc.querySelector('#leftBody .hsc-off').textContent, /DeepThink Tank/, 'offers folded');
    assert.ok(rows2(ev, '#leftBody'));
  }
  // Calm: no alerts, no fold for them.
  ev("S.hs.prot={};S.hs.pev=[];S.hs.lag={};S.hs.jo=[];S.hs.down={};S.hs.out={};delete S.hs.cc.IN;S.inc=[];compute();UI.fold={};UI._lh=null;renderLeft()");
  assert.equal(doc.querySelectorAll('#leftBody .hsc .hsa').length, ev("hsAlerts().length"));
  assert.deepEqual(errors, []);
});

test('the Cloud tab: sections that fold, open when they need you, in the order a player asks', (t) => {
  const { ev, dom, errors } = net(t);
  ev(TROUBLE);
  const doc = dom.window.document;
  assert.equal(ev('pnVet()'), true, 'past the early game');
  for (const [w, h, name] of sizes) {
    ev(`innerWidth=${w};innerHeight=${h};selectCity('par');UI.tab='cust';UI._ph=null;renderAll()`);
    const secs = [...doc.querySelectorAll('#panelBody section.hsec')].map((s) => [s.dataset.sec, s.classList.contains('on')]);
    const order = secs.map((s) => s[0]);
    assert.deepEqual(order.filter((k) => ['hscc', 'hsrg', 'hspw', 'hsbt', 'hsfo', 'hsdoor', 'hsep', 'hsten'].includes(k)), ['hscc', 'hsrg', 'hspw', 'hsbt', 'hsfo', 'hsdoor', 'hsep', 'hsten'], `in order (${name})`);
    const on = Object.fromEntries(secs);
    assert.equal(on.hspw, true, 'the protest opens Power');
    assert.equal(on.hsrg, true, 'the region of a region city is open');
    assert.equal(on.hsten, false, 'nothing wrong with tenants: folded');
    assert.match(doc.querySelector('#panelBody section[data-sec="hspw"] .psb').textContent, /MW free · goodwill .*Protest/i);
    assert.match(doc.querySelector('#panelBody section[data-sec="hsrg"] .psb').textContent, /Rack Shack/);
    assert.ok(rows2(ev, '#panelBody'), `rows of two buttons at most (${name})`);
    // A tap folds it, another opens it.
    ev("document.querySelector('#panelBody section[data-sec=\"hspw\"] .psb').click()");
    assert.equal(doc.querySelector('#panelBody section[data-sec="hspw"]').classList.contains('on'), false);
    ev("document.querySelector('#panelBody section[data-sec=\"hsten\"] .psb').click()");
    assert.match(doc.querySelector('#panelBody section[data-sec="hsten"]').textContent, /No tenants here yet|Customers based here/);
    // Frankfurt: the failover section says ready or not, never drilled.
    ev("selectCity('fra');UI.tab='cust';UI._ph=null;renderAll()");
    assert.match(doc.querySelector('#panelBody section[data-sec="hsfo"] .psb').textContent, /into Amsterdam/);
    assert.match(doc.querySelector('#panelBody section[data-sec="hsbt"] .psb').textContent, /Backlog/i);
    // A city without a POP: the users and the launch.
    ev("selectCity('nyc');UI._ph=null;renderAll()");
    assert.match(doc.getElementById('panelBody').textContent, /Users in United States[\s\S]*Launch in United States/);
    assert.ok(rows2(ev, '#panelBody'));
  }
  assert.deepEqual(errors, []);
});
