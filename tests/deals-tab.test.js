// The Deals tab puts what needs you first: unhappy customers and renewal haggles, then the offers you can sign today,
// then the ones that need work, then one line each for the seat, conferences, the sales desk and the level. Offers are
// short cards whose fine print unfolds; many offers get filter chips and a first page. The tab bar counts what you can
// act on, red while customers are unhappy.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const start = "ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.offers=[];";
const offer = (o) => `S.offers.push(${lit({ city: 'fra', bw: 1, rate: 600, reqs: [], exp: 30, type: 'dia', ...o })});`;
// Frankfurt and Amsterdam are yours, Bude is not.
function setup(extra = '') {
  const h = load();
  h.ev(start + "ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});" + extra + 'compute();UI.left="deals";UI.leftOpen=true;UI.sel=null;renderAll()');
  h.doc = h.dom.window.document;
  h.body = () => h.doc.getElementById('leftBody');
  h.names = () => [...h.body().querySelectorAll('.dl-o .nm')].map((e) => e.firstChild.textContent.trim());
  return h;
}

test('offers you can sign come first, then those that need work, each with its state and the right button', () => {
  const h = setup(offer({ id: 'pop', name: 'Needs Bude', city2: 'bde', type: 'l2vpn', exp: 5 })
    + offer({ id: 'req', name: 'Wants Generator', reqs: ['gen'], exp: 8 })
    + offer({ id: 'late', name: 'Ready Later', exp: 40 })
    + offer({ id: 'soon', name: 'Ready Soon', exp: 12, refN: 'Big Fan Ltd', reqs: ['puns'] }));
  const { ev, errors, body } = h;
  assert.deepEqual(h.names(), ['Ready Soon', 'Ready Later', 'Wants Generator', 'Needs Bude']);
  const card = (n) => [...body().querySelectorAll('.dl-o')].find((r) => r.querySelector('.nm').textContent.startsWith(n));
  assert.match(card('Ready Soon').textContent, /✓ Ready to sign · 1 special requirement/);
  assert.ok(card('Ready Soon').querySelector('[data-act=accept]'));
  assert.match(card('Wants Generator').textContent, /1 requirement not met yet/);
  assert.match(card('Wants Generator').textContent, /✗ .*generator/i, 'what is missing stays in sight');
  assert.ok(card('Wants Generator').querySelector('[data-act=acceptFix]'), 'and the button that buys it');
  assert.match(card('Needs Bude').textContent, /Needs a POP in Bude/);
  assert.equal(JSON.parse(card('Needs Bude').querySelector('[data-act=focusCity]').dataset.args).city, 'bde');
  assert.ok(!card('Needs Bude').querySelector('[data-act=accept]'));
  assert.ok(card('Needs Bude').querySelector('.dl-d.soon'), 'five days left is a red countdown');
  assert.ok(!card('Ready Later').querySelector('.dl-d.soon'));
  // The fine print of a ready offer is one tap away: who referred them, the requirements it already meets.
  assert.doesNotMatch(card('Ready Soon').textContent, /Referred by Big Fan Ltd/);
  card('Ready Soon').querySelector('[data-act=dealsFold]').click();
  assert.match(card('Ready Soon').textContent, /Referred by Big Fan Ltd/);
  assert.match(card('Ready Soon').textContent, /✓ .*puns/i);
  assert.equal(card('Ready Soon').querySelector('[data-act=dealsFold]').getAttribute('aria-expanded'), 'true');
  // Accept still signs from the card.
  ev("ACT.accept({id:'late'})");
  assert.ok(ev("S.biz.some(b=>b.id==='late')"));
  assert.ok(!h.names().includes('Ready Later'));
  assert.deepEqual(errors, []);
});

test('unhappy customers and renewal haggles come before the offers; sections below are one line that unfolds', () => {
  const h = setup("S.day=confDay(CONFS.find(c=>c.c==='fra'),0)-20;" + offer({ id: 'o1', name: 'Plain Offer', exp: 'X' })
    + "S.biz.push({id:'sad',city:'fra',name:'Grumpy GmbH',type:'dia',bw:1,rate:600,reqs:[],mood:10,since:0,te:S.day+300,mk:1});"
    + "S.biz.push({id:'hg',city:'fra',name:'Haggle Hosting',type:'dia',bw:5,rate:600,reqs:[],mood:90,since:0,te:S.day+20,mk:1,hag:{rate:540,until:S.day+20}});"
    + "S.offers[0].exp=S.day+30;S.seatOff={a:'syd',b:'akl',name:'Tasman Devil',km:seatKm('syd','akl'),exp:S.day+30};");
  const { ev, errors, body } = h;
  const html = body().innerHTML, at = (s) => html.indexOf(s);
  assert.ok(at('unhappy customer') >= 0 && at('unhappy customer') < at('Haggle Hosting'), 'unhappy customers first');
  assert.ok(at('Haggle Hosting') < at('Plain Offer'), 'then the renewal');
  assert.ok(at('Plain Offer') < at('Tasman Devil'), 'then the offers, then the rest');
  // Folded: a title and a summary, and none of their buttons.
  const txt = body().textContent;
  assert.match(txt, /Consortium seat: Tasman Devil/);
  assert.match(txt, /DENOG.* · in 20 days/);
  assert.match(txt, /Customer level 6/);
  for (const a of ['seatBuy', 'confGo', 'confSponsor']) assert.equal(body().querySelectorAll(`[data-act=${a}]`).length, 0, a);
  assert.ok(body().querySelector('[data-act=salesOpen]'), 'the sales desk is one line with its button');
  ev("ACT.dealsFold({k:'conf',o:1});ACT.dealsFold({k:'seat',o:1});ACT.dealsFold({k:'lvl',o:1})");
  assert.ok(body().querySelector('[data-act=confGo]'));
  assert.ok(body().querySelector('[data-act=seatBuy]'));
  assert.match(body().textContent, /Next: .*unlocks/i);
  ev("ACT.dealsFold({k:'conf',o:0})");
  assert.equal(body().querySelectorAll('[data-act=confGo]').length, 0);
  assert.deepEqual(errors, []);
});

test('many offers: filter chips and a first page', () => {
  let s = '';
  for (let i = 0; i < 9; i++) s += offer({ id: 'r' + i, name: 'Ready ' + i, exp: 20 + i });
  for (let i = 0; i < 4; i++) s += offer({ id: 'w' + i, name: 'Far ' + i, city2: 'bde', type: 'l2vpn', exp: 10 + i });
  const h = setup(s);
  const { ev, errors, body } = h;
  assert.equal(h.names().length, ev('DL_PG'), 'a short first page');
  assert.equal(h.names()[0], 'Ready 0', 'ready first, even when others expire sooner');
  const more = body().querySelector('[data-act=dealsMore]');
  assert.match(more.textContent, /\+8 more/);
  more.click();
  assert.equal(h.names().length, 13);
  const chips = [...body().querySelectorAll('[data-act=dealsF]')].map((b) => b.textContent);
  assert.deepEqual(chips, ['All 13', 'Ready 9', 'Needs work 4']);
  ev("ACT.dealsF({v:'work'})");
  assert.deepEqual(h.names(), ['Far 0', 'Far 1', 'Far 2', 'Far 3']);
  ev("ACT.dealsF({v:'work'})");
  assert.equal(h.names().length, ev('DL_PG'), 'a second tap shows all again, from the first page');
  // A short list has no chips, and a filter left on does not hide anything there.
  ev("ACT.dealsF({v:'work'});S.offers=S.offers.slice(0,3);renderLeft()");
  assert.equal(body().querySelectorAll('[data-act=dealsF]').length, 0);
  assert.equal(h.names().length, 3);
  assert.deepEqual(errors, []);
});

test('the Deals badge counts what you can act on, red while customers are unhappy, on a phone and on a desktop', () => {
  const h = setup(offer({ id: 'a', name: 'A' }) + offer({ id: 'b', name: 'B' }) + offer({ id: 'c', name: 'C', city2: 'bde', type: 'l2vpn' }));
  const { ev, dom, errors, doc } = h;
  const deskCnt = () => doc.querySelector('#leftTabs [data-args*="deals"] .cnt');
  assert.equal(deskCnt().textContent, '2', 'two offers you can sign; the one that needs a POP is not counted');
  assert.ok(!deskCnt().classList.contains('red'));
  ev("S.biz.push({id:'hg',city:'fra',name:'H',type:'dia',bw:5,rate:600,reqs:[],mood:90,since:0,te:S.day+20,mk:1,hag:{rate:540,until:S.day+20}});renderAll()");
  assert.equal(deskCnt().textContent, '3', 'and a haggle waiting for an answer');
  ev("S.biz.push({id:'sad',city:'fra',name:'G',type:'dia',bw:1,rate:600,reqs:[],mood:10,since:0,te:S.day+300,mk:1});renderAll()");
  assert.ok(deskCnt().classList.contains('red'), 'red while a customer is unhappy');
  dom.window.innerWidth = 390;
  ev("UI.started=true;ACT.phoneTab({t:'deals'})");
  const phone = () => doc.querySelector('#tabbar [data-args*="deals"] .cnt');
  assert.equal(phone().textContent, '3');
  assert.ok(phone().classList.contains('red'));
  ev("S.offers=[];S.biz.find(b=>b.id==='hg').hag=null;renderAll()");
  assert.ok(phone().classList.contains('dot'), 'nothing to sign, but unhappy customers: a red dot');
  ev("S.biz=S.biz.filter(b=>b.id!=='sad');renderAll()");
  assert.equal(phone(), null, 'nothing at all: no badge');
  assert.deepEqual(errors, []);
});

test('a new network is told where offers come from; a conference reminder opens Deals with conferences unfolded', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});S.offers=[];S.biz=[];UI.left='deals';UI.leftOpen=true;renderAll()");
  const body = () => dom.window.document.getElementById('leftBody');
  assert.match(body().textContent, /No offers yet\. Businesses call networks that have a POP in their city/);
  ev("UI.left='goals';renderAll();S.day=confDay(CONFS.find(c=>c.c==='fra'),0)-30;S.confReg={};confTick(S.day)");
  const show = [...dom.window.document.querySelectorAll('#toasts [data-act=dealsFold]')][0];
  assert.ok(show, 'the reminder has a Show me button');
  show.click();
  assert.equal(ev('UI.left'), 'deals');
  assert.ok(body().querySelector('[data-act=confGo]'), 'with the conferences open');
  assert.equal(ev("S.log.find(e=>/DENOG|conference/i.test(e.t)).o.a"), 'tab', 'the notification log still opens the tab');
  assert.deepEqual(errors, []);
});

test('the Deals tab fits a 360 px phone with long offers', () => {
  const h = setup(offer({ id: 'x', name: 'A Very Long Business Name Incorporated International', reqs: ['gen', 'routers', 'puns'], city2: 'ams', type: 'l2vpn' }));
  const { ev, dom, errors } = h;
  dom.window.innerWidth = 360;
  ev("UI.started=true;ACT.phoneTab({t:'deals'})");
  assert.ok(h.body().querySelector('[data-act=acceptFix]'));
  assert.doesNotMatch(h.body().textContent, /\b(deals|hud_and_panels)\.[a-z_]+/);
  assert.deepEqual(errors, []);
});
