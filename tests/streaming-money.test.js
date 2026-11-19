const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A Streaming service in Frankfurt, live in Germany, served from its starter origin.
const start = () => {
  const page = load();
  page.ev("ACT.start({});ACT.charter({k:'content'});S.cash=1e9;S.lvl=5;ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});compute()");
  return page;
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test('plans: each country gets the plan its wallets suit, and the price trades subscribers for money', () => {
  const { ev, errors } = start();
  assert.equal(ev("prOf('DE')"), 1, 'Germany starts on standard');
  assert.equal(ev("prFit('IN')"), 0, 'thin wallets suit the budget plan');
  assert.equal(ev("prFit('AU')"), 2, 'fat ones the premium plan');
  const pot1 = ev("ccPot('DE')"), rev1 = ev("R.rev.eyeballs"), d1 = ev("S.cnt.cc.DE.d");
  ev("ACT.cntPrice({cc:'DE',p:0});compute()");
  assert.ok(ev("ccPot('DE')") > pot1 * 1.3, 'budget: many more homes can afford it');
  near(ev("R.rev.eyeballs"), rev1 * 0.6, 'budget: each pays less');
  assert.equal(ev("S.cnt.cc.DE.d"), d1, 'a price cut loses nobody');
  ev("S.cnt.cc.DE.d=ccPot('DE')");
  const full = ev("S.cnt.cc.DE.d");
  ev("ACT.cntPrice({cc:'DE',p:2});compute()");
  const after = ev("S.cnt.cc.DE.d");
  assert.ok(after < full * 0.8 && after > full * 0.6, 'a big rise loses viewers at once: ' + after / full);
  assert.ok(ev("S.log.slice(0,5).some(x=>/Price rise in Germany/.test(x.t))"), 'the backlash toast (a badge may land right after it)');
  assert.ok(ev("ccPot('DE')") < pot1 * 0.7, 'premium: fewer homes');
  assert.ok(ev("cntMul('churn','DE')") > 1, 'and they leave faster when it buffers');
  // Above the new ceiling the rest drift off at renewal, down to it and no further.
  ev("for(let i=0;i<400;i++)for(const f of CNT_DAY)f(S.day)");
  near(ev("S.cnt.cc.DE.d"), ev("ccPot('DE')"), 'drifted to the premium ceiling');
  assert.equal(ev("S.cnt.drift.DE"), undefined, 'and stopped drifting');
  // In a poor country the same premium plan costs far more of the audience.
  ev("S.cnt.pr.IN=2");
  // The price's own share of the ceiling (rival streamers move cntMul too, differently per country).
  assert.ok(ev("CNT_MUL.pot[0]('IN')") < ev("CNT_MUL.pot[0]('DE')") * 0.3);
  assert.deepEqual(errors, []);
});

test('a premiere or event bonus above the ceiling does not drift away', () => {
  const { ev, errors } = start();
  ev("S.cnt.cc.DE.d=ccPot('DE')*1.2");
  const d = ev("S.cnt.cc.DE.d");
  ev("for(let i=0;i<20;i++)for(const f of CNT_DAY)f(S.day)");
  assert.ok(ev("S.cnt.cc.DE.d") >= d - 1e-9);
  assert.deepEqual(errors, []);
});

test('the ad tier: more viewers paying less, plus ads that only pay when they play, most on big nights', () => {
  const { ev, errors } = start();
  const pot = ev("ccPot('DE')"), d = ev("S.cnt.cc.DE.d"), q = ev("ccQ(R,'DE')");
  ev("ACT.cntAds({cc:'DE',on:true});compute()");
  near(ev("ccPot('DE')"), pot * 1.3, 'more homes sign up');
  near(ev("R.rev.eyeballs"), d * q * 220 * 0.6 + d * q ** 3 * 220 * 0.4, 'subscriptions at 60% plus the ads that played');
  // A spinner in the ad break is a refund: the ad money falls with the cube of the picture.
  ev("for(const c in R.citySrv)R.citySrv[c]*=0.8");
  const q8 = ev("ccQ(R,'DE')");
  assert.ok(q8 < 0.85 && q8 > 0.7, 'the picture buffers: ' + q8);
  near(ev("adRev(R,'DE')"), ev("R.cnt.cc.DE.D") * q8 ** 3 * 220 * 0.4, 'ads at 80% picture pay about half');
  ev("compute()");
  // A premiere in Europe tonight: more viewers and dearer ad breaks; the sponsor reports after the last night.
  const plain = ev("adRev(R,'DE')");
  ev("S.cnt.prem={day:S.day,reg:'EU',n:0,pf:0,w:1,live:0};compute()");
  assert.ok(ev("adRev(R,'DE')") > plain * PREM_MUL_X(ev), 'a premiere night pays its ads double, on more viewers');
  ev("for(const f of CNT_DAY)f(S.day)");
  assert.ok(ev("S.cnt.adEv.v") > 0, 'the big night is counted');
  ev("S.cnt.prem=null;compute();for(const f of CNT_DAY)f(S.day)");
  assert.equal(ev("S.cnt.adEv.v"), 0);
  assert.match(ev("JSON.stringify(S.log.slice(0,3))"), /paid .* for the ad breaks on the big night/);
  ev("ACT.cntAds({cc:'DE',on:false});compute()");
  near(ev("ccPot('DE')"), pot, 'ad-free again');
  assert.equal(ev("S.cnt.drift.DE"), 1, 'and the extra viewers drift off');
  assert.deepEqual(errors, []);
});
// A premiere multiplies demand by PREM_MUL and ad prices by AD_CPM_PREM.
function PREM_MUL_X(ev) { return ev('PREM_MUL*AD_CPM_PREM') * 0.99; }

test('licensing: shows are cleared at home only; buy or rent a continent, or live with the cap', () => {
  const { ev, errors } = start();
  ev("ACT.cntLaunch({cc:'US'});ACT.cntCat({});compute()");
  assert.equal(ev("S.cnt.cat"), 1);
  assert.equal(ev("licT('EU')"), 1, 'home is cleared');
  assert.equal(ev("licT('AM')"), 0, 'away is not');
  const capped = ev("ccPot('US')"), cost0 = ev("cntCost()");
  assert.match(ev("ccSection('nyc')"), /not cleared in/);
  assert.equal(ev("ccSection('fra').includes('not cleared')"), false);
  ev("ACT.cntLic({reg:'AM',k:'rent'});compute()");
  const mo = ev("S.cnt.lic.AM.mo");
  assert.ok(mo >= 3000);
  near(ev("ccPot('US')"), capped * ev("CAT_T[1].pot"), 'the licence lifts the cap');
  near(ev("cntCost()"), cost0 + mo, 'rent is a monthly cost');
  assert.match(ev("ccSection('nyc')"), /Stop renting/);
  // Stop renting: the cap comes back and the extra viewers drift off.
  ev("S.cnt.cc.US.d=ccPot('US');ACT.cntLic({reg:'AM',k:'stop'})");
  assert.equal(ev("S.cnt.lic.AM"), undefined);
  assert.equal(ev("S.cnt.drift.US"), 1);
  // Buying costs eighteen months of rent once, then nothing a month; a bigger catalogue needs a top-up.
  const cash = ev("S.cash"), buy = ev("licBuy('AM')");
  assert.equal(buy, mo * 18);
  ev("ACT.cntLic({reg:'AM',k:'buy'})");
  assert.equal(ev("S.cash"), cash - buy);
  assert.equal(ev("S.cnt.lic.AM.mo"), 0);
  near(ev("cntCost()"), cost0, 'owned rights cost nothing a month');
  ev("S.lvl=6;ACT.cntCat({})");
  assert.equal(ev("licT('AM')"), 1, 'the new shows are not cleared yet');
  assert.equal(ev("licBuy('AM')"), ev("licMo('AM',2)*18-licMo('AM',1)*18"), 'only the top-up');
  ev("ACT.cntLic({reg:'AM',k:'rent'})");
  assert.equal(ev("S.cnt.lic.AM.mo"), 0, 'owned rights are topped up, not swapped for rent');
  ev("ACT.cntLic({reg:'EU',k:'buy'})");
  assert.equal(ev("S.cnt.lic.EU"), undefined, 'nothing to buy at home');
  assert.deepEqual(errors, []);
});

test('plans, ads and licences survive a save; old saves and junk load clean', () => {
  const { ev, errors } = start();
  ev("ACT.cntLaunch({cc:'US'});ACT.cntCat({});ACT.cntPrice({cc:'DE',p:2});ACT.cntAds({cc:'US',on:true});ACT.cntLic({reg:'AM',k:'rent'})");
  const back = JSON.parse(ev("(()=>{const s=JSON.parse(JSON.stringify(S));sanitize(s);return JSON.stringify(s.cnt);})()"));
  assert.equal(back.pr.DE, 2);
  assert.equal(back.ads.US, 1);
  assert.equal(back.lic.AM.t, 1);
  assert.ok(back.lic.AM.mo > 0);
  assert.equal(back.drift.DE, 1);
  const old = JSON.parse(ev("(()=>{const s=JSON.parse(JSON.stringify(S));for(const k of ['pr','ads','lic','drift','adEv'])delete s.cnt[k];sanitize(s);return JSON.stringify(s.cnt);})()"));
  assert.deepEqual([old.pr, old.ads, old.lic, old.drift, old.adEv], [{}, {}, {}, {}, { v: 0, q: 1 }]);
  const junk = JSON.parse(ev("(()=>{const s=JSON.parse(JSON.stringify(S));s.cnt.pr={DE:9,FR:1,x:'a'};s.cnt.ads='yes';s.cnt.lic={ZZ:{t:1},AM:{t:99,mo:-5}};s.cnt.adEv=null;sanitize(s);return JSON.stringify(s.cnt);})()"));
  assert.deepEqual(junk.pr, { DE: 2 }, 'clamped, and only for countries you are live in');
  assert.deepEqual(junk.ads, {});
  assert.deepEqual(junk.lic, { AM: { t: ev('CAT_T.length-1'), mo: 0 } });
  assert.deepEqual(junk.adEv, { v: 0, q: 1 });
  assert.deepEqual(errors, []);
});

test('the plan buttons show in a country block; the classic game has none of it', () => {
  const { ev, errors } = start();
  const h = ev("ccSection(S.home)");
  assert.match(h, /Budget/);
  assert.match(h, /Premium/);
  assert.match(h, /Add an ad tier/);
  assert.match(h, /Local wallets suit Standard/);
  ev("ACT.cntAds({cc:'DE',on:true});compute()");
  assert.match(ev("ccSection(S.home)"), /Tonight's ad break/);
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;ACT.cntPrice({cc:'DE',p:2});ACT.cntAds({cc:'DE',on:true});ACT.cntLic({reg:'AM',k:'buy'})");
  assert.equal(g.ev("typeof S.cnt"), 'undefined');
  assert.equal(g.ev("S.cash"), 1e9);
  assert.deepEqual(errors, []);
  assert.deepEqual(g.errors, []);
});
