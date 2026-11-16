// The bank: offers compare at a glance (amount, monthly, what they cost on top, term, rate, the catch), cheapest first,
// the cheapest whose conditions you already keep marked as the best deal; running loans show how far along they are; the credit rating explains itself behind "?".
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function game(t, w = 1440) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(`ACT.start({});closeModal();UI.speed=0;S.nextFail=S.nextEvent=1e9;S.loanOffers=[];S.loans=[];S.cash=2e6;window.innerWidth=${w};`);
  return h;
}
// An offer as spawnLoanOffer() makes it, from a bank picked here, with fixed terms.
const offer = (ev, id, bank, o) => ev(`S.loanOffers.push(Object.assign({id:'${id}',bank:'${bank}',amount:1e6,exp:S.day+20,covs:BANKS['${bank}'].covs.slice()},${JSON.stringify(o)}))`);
const card = (ev) => ev("$('bankCard')");
const q = (ev, sel) => ev(`[...document.querySelectorAll('#bankCard ${sel}')].map(e=>e.textContent.trim())`);

test('offers are compact cards: cheapest first and marked, with monthly, cost on top, term and rate side by side', (t) => {
  const { ev, errors } = game(t);
  offer(ev, 'dear', 'rev', { apr: 0.2, term: 12, pay: Math.round(1e6 * 0.2 / 12 / (1 - Math.pow(1 + 0.2 / 12, -12))) });
  offer(ev, 'cheap', 'spk', { apr: 0.05, term: 24, pay: Math.round(1e6 * 0.05 / 12 / (1 - Math.pow(1 + 0.05 / 12, -24))) });
  offer(ev, 'vult', 'vult', { share: 0.12 });
  offer(ev, 'bal', 'balloon', { apr: 0.12, term: 12, pay: 0, model: 'balloon' });
  ev('S.ixp.stg=1;ACT.bank({})');
  const ids = JSON.parse(ev("JSON.stringify([...document.querySelectorAll('#bankCard .boffer [data-act=\"takeLoan\"]')].map(b=>JSON.parse(b.dataset.args).id))"));
  assert.deepEqual(ids, ['cheap', 'dear', 'bal', 'vult'], 'cheapest for what it lends first; a share of revenue forever last');
  assert.equal(ev("document.querySelectorAll('#bankCard .boffer.best').length"), 1);
  assert.match(q(ev, '.boffer.best')[0], /Spätzle-Sparkasse/);
  assert.match(q(ev, '.boffer.best')[0], /Best deal/);
  const facts = q(ev, '.boffer.best .bf');
  assert.equal(facts.length, 4);
  assert.match(facts.join('|'), /Monthly.*\|Cost\+\$.*\|Term24 mo\|Rate5\.0%/);
  assert.equal(ev(`offerCost(S.loanOffers.find(o=>o.id==='cheap'))`), ev("(o=>o.pay*24-1e6)(S.loanOffers.find(o=>o.id==='cheap'))"));
  // The catch: what comes with the money besides the rate, as tags; and the conditions.
  const bal = q(ev, '.boffer').find(t => /Ballooney/.test(t));
  assert.match(bal, /Nothing to pay until the end/);
  assert.match(bal, /then about \$1\.1\dM at once/);
  assert.match(q(ev, '.boffer').find(t => /Vultures/.test(t)), /12% of revenue, forever/);
  assert.deepEqual(errors, []);
});

test('an offer whose conditions you break today says so on the card, and is not the best deal', (t) => {
  const { ev, errors } = game(t);
  offer(ev, 'cheap', 'spk', { apr: 0.05, term: 24, pay: Math.round(1e6 * 0.05 / 12 / (1 - Math.pow(1 + 0.05 / 12, -24))) });
  offer(ev, 'dear', 'rev', { apr: 0.2, term: 12, pay: Math.round(1e6 * 0.2 / 12 / (1 - Math.pow(1 + 0.2 / 12, -12))) });
  ev('delete S.ixp.stg;ACT.bank({})');
  assert.match(q(ev, '.boffer')[0], /1 condition broken now/);
  assert.match(q(ev, '.boffer')[0], /Spätzle/, 'still listed first: it is the cheapest');
  assert.match(q(ev, '.boffer.best')[0], /Revoloot/, 'the best deal is the cheapest you can take as you are');
  // Every offer breaks something: nothing is marked.
  ev("S.loanOffers=S.loanOffers.filter(o=>o.id==='cheap');S.loanOffers.push(Object.assign({},S.loanOffers[0],{id:'c2'}));UI._bh=null;renderBank()");
  assert.equal(ev("document.querySelectorAll('#bankCard .boffer.best').length"), 0);
  // The deadline is never cut off: it comes before the bank's blurb.
  const meta = ev("document.querySelector('#bankCard .boffer .bblurb').textContent");
  assert.ok(meta.indexOf('offer ends in') < meta.indexOf(ev("BANKS.spk.blurb")));
  assert.deepEqual(errors, []);
});

test('no offers: the empty state says when banks call', (t) => {
  const { ev } = game(t);
  assert.match(ev("(ACT.bank({}),$('bankCard').textContent)"), /Banks call about once every 40 days/);
  ev('S.cash=6e8;ACT.bank({})');
  assert.match(ev("$('bankCard').textContent"), /The banks have stopped calling/);
});

test('a running loan: how much is repaid as a bar, kept conditions folded, early repay still two taps', (t) => {
  const { ev, errors } = game(t);
  offer(ev, 'l1', 'spk', { apr: 0.05, term: 24, pay: 44000 });
  ev("S.ixp.stg=1;ACT.takeLoan({id:'l1'});const l=S.loans[0];l.bal=l.amount*0.4;ACT.bank({})");
  assert.match(q(ev, '.bloan')[0], /60% repaid/);
  assert.equal((q(ev, '.bloan')[0].match(/\$400k/g) || []).length, 1, 'what is still owed is said once');
  assert.equal(ev("document.querySelector('#bankCard .bloan .bprog .bar i').style.width"), '60%');
  assert.match(q(ev, '.bloan .bcovs')[0], /2 conditions kept/);
  assert.equal(ev("document.querySelectorAll('#bankCard .bloan .bcov').length"), 0, 'kept conditions fold away');
  ev("document.querySelector('#bankCard .bloan .bcovs').click()");
  assert.equal(ev("document.querySelectorAll('#bankCard .bloan .bcov').length"), 2);
  // A broken one shows by itself.
  ev("delete S.ixp.stg;ACT.bank({})");
  assert.ok(ev("document.querySelectorAll('#bankCard .bloan .bcov').length") > 0);
  ev("ACT.repayLoan({id:'l1'})");
  assert.equal(ev('S.loans.length'), 1, 'repaying costs money: it still asks first');
  ev("ACT.repayLoan({id:'l1'})");
  assert.equal(ev('S.loans.length'), 0);
  assert.deepEqual(errors, []);
});

test('the credit rating explains itself behind "?"', (t) => {
  const { ev, errors } = game(t);
  ev('S.loanStrikes=2;ACT.bank({})');
  assert.equal(ev("document.querySelectorAll('#bankCard .bwhy').length"), 0);
  ev("document.querySelector('#bankCard .btiles .hb').click()");
  const why = ev("$('bankCard').querySelector('.bwhy').textContent");
  assert.match(why, /Making a profit/);
  assert.match(why, /2 bank penalties on your record/);
  assert.match(why, /from AA up you can call the bank/);
  assert.equal(ev("document.querySelector('#bankCard .btiles .hb').getAttribute('aria-expanded')"), 'true');
  ev('ACT.bankClose();ACT.bank({})');
  assert.equal(ev("document.querySelectorAll('#bankCard .bwhy').length"), 0, 'it starts folded again');
  assert.deepEqual(errors, []);
});
