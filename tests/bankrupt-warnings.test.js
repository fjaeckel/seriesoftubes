// A bankruptcy is never a mystery: a balloon loan is announced about two months, one month and a week before it takes
// its whole balance in one go (and says when that would sink you), the bankruptcy screen lists the day's bad news, and
// a young cloud's lost data costs at most a month of its revenue.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A balloon of amount over three months, taken today; days ticked one by one until it pops (or the game is lost).
function balloon(ev, amount, cash) {
  ev(`S.cash=${cash};S.nextFail=S.nextEvent=1e9;S.loans=[];S.loanOffers=[{id:'bl',bank:'balloon',amount:${amount},exp:S.day+20,covs:[],apr:0.12,term:3,pay:0,model:'balloon'}];ACT.takeLoan({id:'bl'});S.cash=${cash};S.log=[]`);
  const notes = [];
  for (let i = 0; i < 100 && ev("S.loans.some(l=>l.id==='bl')") && !ev('S.lost'); i++) {
    ev('dayTick();closeModal()');
    for (const e of JSON.parse(ev("JSON.stringify((S.log||[]).filter(e=>e.d===S.day&&/balloon/i.test(e.t)).map(e=>({d:e.d,k:e.k,t:e.t})))"))) notes.push(e);
  }
  return notes;
}

test('a balloon is announced two months, one month and a week ahead, with what it will take', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});S.rules=makeRules('freeze')");
  const start = ev('S.day');
  const notes = balloon(ev, 100000, 1e7);
  const warn = notes.filter(e => /is due in about/.test(e.t)), pop = notes.find(e => /popped/.test(e.t));
  assert.ok(pop, 'it popped');
  assert.deepEqual(warn.map(e => pop.d - e.d).map(x => (x >= 58 && x <= 62 ? 60 : x >= 28 && x <= 31 ? 30 : x)), [60, 30, 7], 'about 60, 30 and 7 days ahead');
  assert.ok(warn.every(e => e.k === '' && /About \$1\d\dk/.test(e.t)), 'with the amount, calm when it fits: ' + warn.map(e => e.t).join(' | '));
  assert.ok(start < warn[0].d);
  assert.deepEqual(errors, []);
});

test('a balloon that would bankrupt you says so, and the bankruptcy screen names it', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});S.rules=makeRules('freeze')");
  const notes = balloon(ev, 2.5e6, 1e5);
  const warn = notes.filter(e => /would bankrupt you/.test(e.t));
  assert.equal(warn.length, 3, 'three warnings that it would sink you');
  assert.ok(warn.every(e => e.k === 'bad'));
  assert.ok(ev('S.lost'), 'and it did');
  const modal = ev("document.getElementById('modal').textContent").replace(/\s+/g, ' ');
  assert.match(modal, /Bankrupt/);
  assert.match(modal, /What happened today:.*the balloon popped/i, 'the screen says why');
  assert.deepEqual(errors, []);
});

test('a young cloud\'s lost data costs at most a month of its revenue', () => {
  const { ev, errors } = load({ seed: 3 });
  ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=5e6;compute()");
  ev('R.revMo=40000');
  assert.equal(ev('hsLossFee(500)'), 40000, 'a month of revenue, not the $250k base');
  ev('R.revMo=5e6');
  assert.equal(ev('hsLossFee(500)'), ev('HS_LOSS_FEE+500*HS_LOSS_TB'), 'a big cloud pays the base and the TB price');
  assert.equal(ev('hsLossFee(1e6)'), ev('HS_LOSS_MAX'));
  ev('S.cash=100000');
  assert.equal(ev('hsLossFee(1e6)'), 150000, 'never more than leaves $50k in the red');
  assert.deepEqual(errors, []);
});
