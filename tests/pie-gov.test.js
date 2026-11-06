// Pie in the Sky: government money (src/game/60-features/99-pie-subsidies.js, 85-pitcairn.js). The Rural Digital Pie
// Fund's auctions and awards, the Ex-Im Pie Bank's loan and its space covenants, and Pitcairn's satellite grant.
// Seeded; auctions, rival bids and days are set or driven directly, so nothing depends on luck.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// The backhaul world (tests/pie-backhaul.test.js): a London – New York – Auckland backbone, a full lasered Shortcrust and
// Pitcairn on its own, with broadband and a dish, reaching the backbone only through orbit.
const pitcairn = (ev) => {
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9");
  ev("for(const c of ['lon','nyc','akl','pcn'])if(!S.pops[c])ACT.buildPop({city:c});S.links=[];"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'na',a:'nyc',b:'akl',kind:'wave',tier:3,km:14200,sub:true,cut:0,mo:1});for(const c of ['lon','nyc'])ACT.buyTransit({city:c,net:'cog',tier:1});ACT.buyTransit({city:'akl',net:'sgt',tier:1})");
  ev("ACT.pieFound();for(const c of ['lon','nyc','akl','pcn']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX");
  ev("S.pops.pcn.bb={d:5};S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];compute()");
};
// The spats world (tests/pie-spats.test.js): a normal game with real chaos and open gates, dishes in NL, BE, DE, SG.
const sky = (ev) => {
  ev("beginGame('Sky','fra',{mode:'normal',preset:'oncall',rules:{gates:'open'}});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;S.nextFail=1e9;S.nextEvent=1e9;S.monkey&&(S.monkey.next=1e9)");
  ev("for(const c of ['sin','ams','bru','lon'])ACT.buildPop({city:c});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});for(const c of ['ams','bru','fra','sin'])ACT.pieDish({city:c});for(const cc of ['NL','BE','DE','SG'])ACT.pieLic({cc})");
  ev('pieCohort(\'short\',1200,true);S.day=S.pie.born+120;compute();S.pie.stock=400');
};
const J = (ev, x) => JSON.parse(ev(`JSON.stringify(${x})`));
// Days of the fund alone (no failures, no other randomness): the day counter and pieGovDay().
const govDays = (ev, n) => ev(`for(let i=0;i<${n};i++){S.day++;pieGovDay(S.day);}`);

test('Pitcairn served from orbit earns the UK satellite grant: less than the fiber grant, latency forgiven', () => {
  const { ev, errors } = load();
  pitcairn(ev);
  assert.ok(ev("sfOf(R,'pcn')") < 0.9, `orbit's latency keeps sfOf under the fiber bar (${ev("sfOf(R,'pcn')")})`);
  assert.equal(ev('grantOn(R)'), false, 'no fiber grant');
  assert.equal(ev('grantSky(R)'), true, 'but the satellite tier');
  assert.equal(ev('R.rev.grant'), ev('GRANT_SKY_MO'));
  assert.ok(ev('GRANT_SKY_MO') < ev('GRANT_MO'), 'it pays less');
  assert.equal(ev('R.pie.gov.sky'), ev('GRANT_SKY_MO'), 'and counts in the orbit\'s books');
  ev('S.pie.book.earned=0;R.pie.gov.rdf=0;pieGovDay(S.day)');
  assert.ok(Math.abs(ev('S.pie.book.earned') - ev('GRANT_SKY_MO') / 30) < 1e-6, 'a day of it is booked');
  assert.match(ev("grantFact('pcn')"), /satellite grant/);
  // Under the bar (a dish of one antenna for a big town) or no orbit at all: nothing.
  ev("S.pops.pcn.bb={d:300};S.pie.dishes.find(x=>x.city==='pcn').ant=1;compute()");
  assert.equal(ev('R.rev.grant'), 0, 'a full pipe is not service');
  ev("S.pops.pcn.bb={d:5};S.pie.dishes=S.pie.dishes.filter(x=>x.city!=='pcn');compute()");
  assert.equal(ev('R.rev.grant'), 0, 'no dish, no grant');
  assert.deepEqual(errors, []);
});

test('Rural Digital Pie Fund: a cut-off town is auctioned, the lowest ask wins and is paid monthly', () => {
  const { ev, errors } = load();
  pitcairn(ev);
  assert.ok(J(ev, 'pieRdfCands()').includes('pcn'), 'Pitcairn on backhaul is a candidate');
  assert.ok(!J(ev, 'pieRdfCands()').includes('akl'), 'a POP on the backbone is not');
  ev("pieRdfOpen('pcn')");
  assert.ok(ev('S.log[0].t').includes('Pitcairn') || ev('S.log[0].t').includes('Adamstown'), 'announced');
  assert.equal(J(ev, 'pieRdfCands()').includes('pcn'), false, 'one auction per town');
  // The rival asks 60%: asking 50% wins, at 50% of the reserve.
  ev("const a=S.pie.gov.auc[0];a.riv=0.6;ACT.pieBid({id:a.id,f:0.5})");
  assert.equal(ev('S.pie.gov.auc[0].bid'), 0.5);
  ev('ACT.pieBid({id:S.pie.gov.auc[0].id,f:0.33})');
  assert.equal(ev('S.pie.gov.auc[0].bid'), 0.5, 'only the offered bids');
  const ask = ev('S.pie.gov.auc[0].ask');
  govDays(ev, ev('PIE_RDF_DAYS'));
  assert.equal(ev('S.pie.gov.auc.length'), 0, 'closed');
  const w = J(ev, 'S.pie.gov.aw[0]');
  assert.equal(w.city, 'pcn');
  assert.equal(w.mo, Math.round(ask * 0.5));
  ev('compute()');
  assert.equal(ev('R.rev.gov'), w.mo, 'the subsidy is revenue');
  assert.equal(ev('R.pie.gov.rdf'), w.mo, 'and orbit income in the books');
  ev('S.pie.book.earned=0');
  govDays(ev, 3);
  assert.ok(Math.abs(ev('S.pie.book.earned') - 3 * (w.mo + ev('GRANT_SKY_MO')) / 30) < 1e-3, 'three days booked');
  // Served well past the deadline: still paid.
  govDays(ev, ev('PIE_RDF_DUE'));
  assert.equal(ev('S.pie.gov.aw.length'), 1, 'kept while served');
  assert.ok(ev("pieRdfSrv('pcn')") >= ev('PIE_RDF_NEED'));
  assert.deepEqual(errors, []);
});

test('the rival under your ask wins; you only hear about auctions you bid in', () => {
  const { ev, errors } = load();
  pitcairn(ev);
  ev("pieRdfOpen('pcn');const a=S.pie.gov.auc[0];a.riv=0.6;a.rv=0;ACT.pieBid({id:a.id,f:0.9})");
  govDays(ev, ev('PIE_RDF_DAYS'));
  assert.equal(ev('S.pie.gov.aw.length'), 0);
  assert.match(ev('S.log[0].t'), /ViaSad won/);
  ev("pieRdfOpen('pcn');S.pie.gov.auc[0].riv=0.95");
  const n = ev('S.log.length');
  govDays(ev, ev('PIE_RDF_DAYS'));
  assert.equal(ev('S.pie.gov.aw.length'), 0, 'no bid, no award');
  assert.equal(ev('S.log.length'), n, 'and no news');
  assert.deepEqual(errors, []);
});

test('service under the minimum past the deadline: a warning, then the award is revoked and part of it clawed back', () => {
  const { ev, errors } = load();
  pitcairn(ev);
  ev("pieRdfOpen('pcn');const a=S.pie.gov.auc[0];a.riv=1;ACT.pieBid({id:a.id,f:0.7})");
  govDays(ev, ev('PIE_RDF_DAYS'));
  const w = J(ev, 'S.pie.gov.aw[0]');
  // The pies go to safe mode: Pitcairn is cut off. Before the deadline the fund waits.
  ev('S.pie.safe=true;compute()');
  assert.equal(ev("pieRdfSrv('pcn')"), 0);
  govDays(ev, 60);
  assert.equal(ev('S.pie.gov.aw.length'), 1, 'still building out: no check before the deadline');
  assert.equal(ev('S.pie.gov.aw[0].k'), 0);
  govDays(ev, 30);
  assert.equal(ev('S.pie.gov.aw.length'), 1, 'the first bad month past the deadline is a warning');
  assert.equal(ev('S.pie.gov.aw[0].k'), 1);
  assert.match(ev('S.log[0].t'), /watching/);
  ev('S.pie.book.earned=1e9');
  govDays(ev, 30);
  assert.equal(ev('S.pie.gov.aw.length'), 0, 'the second in a row revokes it');
  const paid = 120 * w.mo / 30, claw = Math.round(Math.min(paid, 12 * w.mo) * ev('PIE_RDF_CLAW'));
  // The month's subsidy was booked day by day (compute() still counted it), then the claw came off.
  assert.equal(ev('R.pie.gov.sky'), 0, 'no satellite grant in safe mode');
  assert.ok(Math.abs(ev('1e9-S.pie.book.earned') - (claw - w.mo)) < 2, `clawed back ${claw}`);
  assert.match(ev('S.log[0].t'), /revoked/);
  assert.equal(ev('S.stats.pieRdfLost'), 1);
  ev('compute()');
  assert.equal(ev('R.rev.gov'), 0, 'no more subsidy');
  assert.deepEqual(errors, []);
});

test('a good month clears the warning', () => {
  const { ev, errors } = load();
  pitcairn(ev);
  ev("pieRdfOpen('pcn');const a=S.pie.gov.auc[0];a.riv=1;ACT.pieBid({id:a.id,f:0.7})");
  govDays(ev, ev('PIE_RDF_DAYS'));
  ev('S.pie.safe=true;compute()');
  govDays(ev, 90);
  assert.equal(ev('S.pie.gov.aw[0].k'), 1);
  ev('S.pie.safe=false;compute()');
  govDays(ev, 30);
  assert.equal(ev('S.pie.gov.aw[0].k'), 0);
  ev('S.pie.safe=true;compute()');
  govDays(ev, 30);
  assert.equal(ev('S.pie.gov.aw.length'), 1, 'one bad month again: only a warning');
  assert.deepEqual(errors, []);
});

test('Ex-Im Pie Bank: a cheap loan sized to the constellation, with space covenants', () => {
  const { dom, ev, errors } = load();
  sky(ev);
  ev("S.pie.crusts.short.cohorts=[{n:100,day:S.day,las:true}];pieGovDay(S.day)");
  const o = J(ev, 'S.pie.gov.ex');
  assert.ok(o, 'offered once there is a factory');
  assert.ok(J(ev, 'piePopCc()').includes(o.cc), 'by a country you have a POP in');
  assert.ok(o.amt >= ev('PIE_EXIM_MIN') && o.amt <= ev('pieEximCap()'), `${o.amt}`);
  assert.ok(o.apr >= 0.015 && o.apr <= 0.025, `cheap: ${o.apr}`);
  // Bigger constellation, bigger loan, never past the cap.
  ev("S.pie.gov.ex=null;pieCohort('short',200,true);pieGovDay(S.day)");
  assert.ok(ev('S.pie.gov.ex.amt') > o.amt, 'grows with the pies');
  ev("pieCohort('short',30000,true);S.pie.gov.ex=null;pieGovDay(S.day)");
  assert.equal(ev('S.pie.gov.ex.amt'), ev('pieEximCap()'));
  ev("S.pie.gov.ex.cc='GB'");
  const cash = ev('S.cash'), amt = ev('S.pie.gov.ex.amt');
  ev('ACT.pieExim()');
  const l = J(ev, "S.loans.find(l=>l.bank==='exim')");
  assert.ok(l, 'taken');
  assert.equal(ev('S.cash') - cash >= amt - 1, true, 'paid out');
  assert.deepEqual(l.covs, ['pielaunch', 'piedish']);
  assert.equal(l.pie.cc, 'GB');
  assert.equal(ev('S.pie.gov.ex'), null);
  ev('pieGovDay(S.day)');
  assert.equal(ev('S.pie.gov.ex'), null, 'one at a time');
  ev('compute()');
  assert.ok(ev('R.cost.loans') >= l.pay, 'billed like any loan');
  // Launches count; the dish covenant wants a dish in Britain.
  ev('for(const f of PIE_ON.launch)f({n:20,test:false},true)');
  assert.equal(ev("S.loans.find(l=>l.bank==='exim').pie.flown"), 20);
  assert.equal(ev("COVS.pielaunch.ok(S.loans.find(l=>l.bank==='exim'))"), true, 'before the deadline');
  assert.equal(ev("COVS.piedish.ok(S.loans.find(l=>l.bank==='exim'))"), false, 'no dish in GB');
  // The bank and Pie Control show it, on a phone.
  ev("window.innerWidth=360;UI.started=true;$('bankBox').hidden=false;renderBank()");
  const bank = dom.window.document.querySelector('#bankCard').textContent;
  assert.match(bank, /Ex-Im Pie Bank/);
  assert.match(bank, /Launch \d+ pies by .* \(20 so far\)/);
  assert.match(bank, /Keep a pie dish in/);
  ev("$('bankBox').hidden=true;ACT.pieGovOpen()");
  assert.equal(ev("$('bankBox').hidden"), false, 'the toast button opens the bank');
  assert.match(dom.window.document.querySelector('#bankGov').parentNode.textContent, /Ex-Im Pie Bank/);
  ev('ACT.bankClose()');
  assert.deepEqual(errors, []);
});

test('a broken space covenant: the bank penalty, tighter terms and a spat in the lending country', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("pieGovDay(S.day);S.pie.gov.ex.cc='GB';ACT.pieExim()");
  const L = "S.loans.find(l=>l.bank==='exim')";
  const apr = ev(`${L}.apr`);
  assert.equal(ev('pieChaos()'), true);
  ev("S.pie.spat={};for(let i=0;i<26;i++){S.day++;loanTick(S.day);}");
  assert.ok(Math.abs(ev(`${L}.apr`) - apr - ev('PIE_EXIM_PEN')) < 1e-9, 'rate up');
  assert.equal(ev(`${L}.pie.br`), 1);
  assert.equal(ev('S.pie.spat.home&&S.pie.spat.home.cc'), 'GB', 'no dish in Britain: "data stays home"');
  assert.ok(ev('S.loanStrikes') >= 1, 'and the bank\'s own penalty');
  // A dish there mends that one; missing the launch target reschedules it and Britain is cross again.
  ev(`ACT.pieDish({city:'lon'});ACT.pieLic({cc:'GB'});S.pie.spat={};${L}.pie.by=S.day;${L}.breach=0`);
  assert.equal(ev(`COVS.piedish.ok(${L})`), true);
  ev('for(let i=0;i<11;i++){S.day++;loanTick(S.day);}');
  assert.equal(ev(`${L}.pie.br`), 2);
  assert.ok(ev(`${L}.pie.by`) > ev('S.day'), 'a new deadline');
  assert.equal(ev(`COVS.pielaunch.ok(${L})`), true);
  assert.equal(ev('S.pie.spat.lic&&S.pie.spat.lic.cc'), 'GB', 'landing rights questioned');
  // Without chaos: tighter terms, no spat (rule O5).
  ev(`S.rules.chaos='none';S.pie.spat={};${L}.pie.by=S.day;${L}.breach=0;for(let i=0;i<11;i++){S.day++;loanTick(S.day);}`);
  assert.equal(ev(`${L}.pie.br`), 3);
  assert.deepEqual(J(ev, 'Object.keys(S.pie.spat)'), []);
  assert.deepEqual(errors, []);
});

test('the bank\'s Government money section fits a phone and lists the auction, the awards, Pitcairn and the bank', () => {
  const { dom, ev, errors } = load();
  pitcairn(ev);
  ev("window.innerWidth=360;pieRdfOpen('pcn');S.pie.gov.aw.push({id:'w1',city:'akl',mo:5e6,start:S.day,due:S.day+90,end:S.day+1800,s:0,n:0,paid:0});UI.pieTab=null;ACT.pieGovOpen()");
  const m = dom.window.document.querySelector('#bankCard');
  assert.equal(ev("$('bankBox').hidden"), false);
  assert.ok(m.querySelector('#bankGov'), 'opened at its section');
  assert.equal(m.querySelectorAll('[data-act=pieBid]').length, 3, 'three asks');
  assert.match(m.textContent, /Rural Digital Pie Fund/);
  assert.match(m.textContent, /Auckland/);
  assert.match(m.textContent, /Pitcairn/);
  assert.match(m.textContent, /satellite grant/);
  assert.doesNotMatch(m.querySelector('.bank-gov').textContent, /pie_gov\.|banks\.|undefined|NaN/);
  ev("ACT.pieBid({id:S.pie.gov.auc[0].id,f:0.7})");
  assert.ok(dom.window.document.querySelector('#bankCard [data-act=pieBid].pink'), 'your bid is marked, in the open bank');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('saves: the fund and the bank survive a round trip, garbage is repaired, old saves load', () => {
  const { ev, errors } = load();
  sky(ev);
  ev("pieRdfOpen('ams');S.pie.gov.aw.push({id:'w1',city:'bru',mo:5e6,start:S.day-10,due:S.day+80,end:S.day+1790,s:4.5,n:5,k:1,paid:1e6});pieGovDay(S.day);S.pie.gov.ex.cc='GB';ACT.pieExim()");
  const before = J(ev, 'S.pie.gov');
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.deepEqual(J(ev, 'S.pie.gov'), before);
  assert.equal(ev("S.loans.find(l=>l.bank==='exim').pie.cc"), 'GB');
  // Garbage.
  ev("S.pie.gov={auc:[{city:'nowhere'},{id:'x',city:'ams',ask:1e30,close:-5,riv:7,bid:0.42}],aw:'lots',ex:{cc:'XX'},told:'yes'};S.loans.find(l=>l.bank==='exim').pie={cc:'XX',n:-4};S.loans.find(l=>l.bank==='exim').covs=['golf'];S=migrate(JSON.parse(JSON.stringify(S)))");
  const g = J(ev, 'S.pie.gov');
  assert.equal(g.auc.length, 1);
  assert.equal(g.auc[0].bid, 0);
  assert.ok(g.auc[0].ask <= ev('PIE_RDF_MO*20'));
  assert.ok(g.auc[0].riv <= 1);
  assert.deepEqual(g.aw, []);
  assert.equal(g.ex, null);
  const l = J(ev, "S.loans.find(l=>l.bank==='exim')");
  assert.equal(l.pie.cc, 'DE', 'the home country');
  assert.equal(l.pie.n, 0);
  assert.deepEqual(l.covs, ['pielaunch', 'piedish']);
  // A save from before: no gov at all.
  ev('delete S.pie.gov;S=migrate(JSON.parse(JSON.stringify(S)));pieGovDay(S.day);compute()');
  assert.deepEqual(J(ev, 'S.pie.gov.aw'), []);
  assert.equal(ev('R.rev.gov'), 0);
  assert.deepEqual(errors, []);
});

test('ordinary banks never offer the Ex-Im loan', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.day=100;S.cash=1000;for(let i=0;i<300;i++){S.loanOffers=[];spawnLoanOffer(i%2===0);if(S.loanOffers.some(o=>o.bank==='exim'))break;}");
  assert.equal(ev("S.loanOffers.some(o=>o.bank==='exim')"), false);
  assert.deepEqual(errors, []);
});
