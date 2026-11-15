// Orbit offers say when the sky cannot deliver them (pieOfferFit, 99-pie-orbit-customers.js): no crust over the city,
// every crust over it full, no dish to land it, or too little room for what they want. The card warns the player and
// the sales desk does not sign them; the shark only needs a landing and oversells the bandwidth.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// London, New York and Frankfurt with a full dish each and a lasered Shortcrust at cov.
function sky(t, who, cov = 1) {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev } = h;
  ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;S.pieV=1;S.lvl=13;S.offers=[];S.biz=[];S.cash=1e9");
  ev("for(const c of ['lon','nyc','fra'])if(!S.pops[c])ACT.buildPop({city:c});S.links=S.links.filter(l=>0);"
    + "S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'lf',a:'lon',b:'fra',kind:'wave',tier:3,km:640,sub:false,cut:0,mo:1});for(const c of ['lon','nyc','fra'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  ev("ACT.pieFound();for(const c of ['lon','nyc','fra']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX");
  ev(`S.pie.crusts.short.cohorts=[{n:Math.ceil(CRUSTS.short.full*${cov}),day:S.day,las:true}];compute()`);
  if (who) ev(`ACT.salesHire({id:'${who}'});closeModal()`);
  return h;
}
const offer = (id, city, type, bw) => `S.offers.push(${lit({ id, city, city2: null, name: id, type, bw, rate: 100, reqs: [], exp: 1e6 })})`;
const why = (ev, id) => ev(`(pieOfferFit(S.offers.find(o=>o.id==='${id}')).w||{k:''}).k`);
const ids = (ev, k) => JSON.parse(ev(`JSON.stringify(S.${k}.map(x=>x.id))`));

test('an orbit offer the sky can deliver is clean; one it cannot says why on its card', t => {
  const { ev, errors } = sky(t);
  ev(offer('ok', 'lon', 'pizza', 1));
  ev(offer('big', 'lon', 'boat', 1e5));
  ev(offer('arctic', 'brw', 'pizza', 1));
  assert.equal(why(ev, 'ok'), '');
  assert.equal(why(ev, 'big'), 'room', 'more than the landing has left');
  assert.equal(why(ev, 'arctic'), 'nocrust', 'Shortcrust does not reach the Arctic');
  ev("UI.left='deals';renderLeft()");
  const deals = ev("(document.getElementById('leftBody')||document.getElementById('left')).innerHTML");
  assert.match(deals, /Only .+ left where they would land \(.+\), for the .+ they want/);
  assert.match(deals, /No crust of yours carries traffic over Utqiaġvik yet/);
  assert.equal((deals.match(/🥧/g) || []).length, 2, 'the offer that fits carries no warning');
  // The city panel lists the same warning.
  assert.match(ev("offersHere('lon')"), /Only .+ left where they would land/);
  assert.deepEqual(errors, []);
});

test('a full crust and a missing dish are told apart', t => {
  const { ev, errors } = sky(t);
  ev(offer('more', 'fra', 'pizza', 1));
  assert.equal(why(ev, 'more'), '');
  // The dishes fill long before a whole crust does: the last compute's crust is filled by hand.
  ev("for(const x of R.pie.crust)x.used=x.cap");
  assert.equal(why(ev, 'more'), 'skyfull');
  ev("S.pie.dishes=S.pie.dishes.filter(x=>x.city==='nyc');S.pie.crusts.short.cohorts[0].las=false;compute()");
  assert.equal(why(ev, 'more'), 'nodish', 'no dish within reach of Frankfurt and no lasers to go further');
  assert.match(ev("pieOfferWhy(S.offers[0])"), /No dish of yours can land Frankfurt/);
  assert.deepEqual(errors, []);
});

for (const who of ['eng', 'ceo']) {
  test(`the sales desk (${who}) signs only the orbit offers the sky can deliver`, t => {
    const { ev, errors } = sky(t, who);
    ev('ACT.salesAuto()');
    ev(offer('ok', 'lon', 'pizza', 1) + ';' + offer('big', 'lon', 'boat', 1e5) + ';' + offer('arctic', 'brw', 'pizza', 1));
    ev('slAutoDay(S.day)');
    assert.deepEqual(ids(ev, 'biz'), ['ok']);
    assert.deepEqual(ids(ev, 'offers').sort(), ['arctic', 'big'], 'left for the player to decide');
    assert.deepEqual(errors, []);
  });
}

test('the shark oversells the bandwidth, but not a city the sky cannot land', t => {
  const { ev, errors } = sky(t, 'shark');
  ev('ACT.salesAuto()');
  ev(offer('ok', 'lon', 'pizza', 1) + ';' + offer('big', 'lon', 'boat', 1e5) + ';' + offer('arctic', 'brw', 'pizza', 1));
  ev('slAutoDay(S.day)');
  assert.deepEqual(ids(ev, 'biz').sort(), ['big', 'ok']);
  assert.deepEqual(ids(ev, 'offers'), ['arctic']);
  assert.deepEqual(errors, []);
});
