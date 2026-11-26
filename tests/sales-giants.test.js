// #493: with Dave (the engineer) at the sales desk, giant offers vanished as they arrived, so "Sign a giant" could never
// be met. They still come in now; Dave neither brings, signs nor declines them, and the player signs them by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e10;S.lvl=13;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['ams','lon','par','fra','nyc','ash'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=3;compute()";
// Offers as the day brings them, until a giant (a mega deal, as the goal counts them) turns up.
const giant = "(()=>{for(let i=0;i<5000;i++){S.offers=[];spawnOffer();mktPrice(0);salesShape(0);const o=S.offers.find(x=>BIZ_T[x.type].mega&&!BIZ_T[x.type].event);if(o){S.offers=[o];return o.id;}}return null;})()";

test('#493 with Dave at the desk, giant offers still come in, unattributed', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'eng'})");
  assert.equal(ev('slP()'), 'eng');
  const id = ev(giant);
  assert.ok(id, 'a giant offer reaches the deals list');
  assert.equal(ev(`S.offers[0].by||null`), null, 'Dave did not bring it');
  assert.match(ev('dlOffer(S.offers[0],dlSt(S.offers[0]))'), /Too big for Dave/);
  ev("ACT.salesFire();ACT.salesFire()");
  assert.doesNotMatch(ev('dlOffer(S.offers[0],dlSt(S.offers[0]))'), /Too big for/, 'only while Dave is at the desk');
  assert.deepEqual(errors, []);
});

test('#493 Dave neither signs nor declines a giant; the player signs it and the goal is met', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'eng'});S.slAuto.on=true;S.slAuto.min=SL_MINS.at(-1)");
  const id = ev(giant);
  assert.ok(id);
  // A small offer next to it, below the minimum: the desk still declines that one.
  ev("(()=>{for(let i=0;i<5000;i++){const n=S.offers.length;spawnOffer();mktPrice(n);salesShape(n);const o=S.offers[n];if(o&&!salesBig(o.type)&&!BIZ_T[o.type].event&&bizMo(o)<SL_MINS.at(-1)){o.exp=S.day+30;return;}S.offers.length=n;}})()");
  assert.equal(ev('S.offers.length'), 2);
  ev('runNow(slAutoRun(S.day))');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.offers.map(o=>o.id))')), [id], 'the small one declined, the giant untouched');
  assert.equal(ev('S.biz.some(b=>BIZ_T[b.type].mega)'), false, 'and not signed by the desk');
  // The deals list says why it waits.
  assert.match(ev('dlOffer(S.offers[0],dlSt(S.offers[0]))'), /Too big for Dave: sign this one yourself\./);
  ev('for(const c of bCities(S.offers[0]))if(!S.pops[c])ACT.buildPop({city:c});compute()');
  ev(`ACT.accept({id:${JSON.stringify(id)}})`);
  assert.equal(ev("S.biz.some(b=>BIZ_T[b.type].mega&&!BIZ_T[b.type].event)"), true, 'signed by hand');
  assert.equal(ev("!!GOALS.find(g=>g.id==='gi').ok()"), true, 'Sign a giant is met');
  assert.equal(ev("S.biz.find(b=>BIZ_T[b.type].mega).by||null"), null, "not one of Dave's customers");
  assert.deepEqual(errors, []);
});
