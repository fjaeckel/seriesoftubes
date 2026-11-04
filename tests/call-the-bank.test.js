const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Calling a bank (#251). rating() comes from revenue and costs, so the tests pin it and the revenue to the case at hand:
// what is under test is what a rating gets you, not how a rating is earned.
function game(t, rt = 'AAA', rev = 5e6) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(`ACT.start({});closeModal();UI.speed=0;S.nextFail=S.nextEvent=1e9;S.loanOffers=[];S.loans=[];window.__rt=${JSON.stringify(rt)};rating=()=>window.__rt;R.revMo=${rev};`);
  return h;
}
// Arrays from the page belong to another realm: JSON brings them over, so deepEqual compares what is in them.
const json = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));
const offers = (ev) => json(ev, 'S.loanOffers');
const bank = (ev) => { ev('ACT.bank({})'); return ev("$('bankCard').textContent"); };
const buttons = (ev) => { ev('ACT.bank({})'); return json(ev, "[...document.querySelectorAll('#bankCard [data-act=\"callBank\"]')].map(b=>[JSON.parse(b.dataset.args).amount,b.disabled])"); };

test('below an AA rating nobody picks up, even for a direct call', (t) => {
  const { ev, errors } = game(t, 'A');
  assert.deepEqual(buttons(ev), []);
  assert.match(bank(ev), /Get to an AA rating/);
  ev('ACT.callBank({amount:1e5})');
  assert.equal(offers(ev).length, 0);
  assert.deepEqual(errors, []);
});

test('each rating gets its own bank, rate, conditions and payment, and better credit is never worse', (t) => {
  const { ev, errors } = game(t);
  const seen = {};
  for (const rt of ['AA', 'AAA']) {
    ev(`window.__rt='${rt}';ACT.callBank({amount:1e6})`);
    const [o] = offers(ev);
    seen[rt] = o;
    assert.equal(o.amount, 1e6);
    assert.equal(o.term, 36);
    assert.equal(o.exp, ev('S.day') + 25);
    assert.equal(o.pay, ev(`Math.round(annuity(1e6,${o.apr},36))`));
    assert.ok(!o.share, 'no slice of revenue on a called loan');
    assert.equal(ev(`rIdx(window.__rt)>=rIdx(BANKS['${o.bank}'].min)`), true, 'the bank would lend at this rating');
    assert.equal(ev(`${JSON.stringify(o.covs)}.every(c=>!!COVS[c])`), true, 'conditions the game knows');
  }
  assert.deepEqual([seen.AA.bank, seen.AAA.bank], ['gs', 'gs']);
  assert.deepEqual([seen.AA.apr, seen.AAA.apr], [0.075, 0.06]);
  assert.equal(ev('S.loanOffers[0].covs!==CALL_TERMS.AAA.covs'), true, 'an offer has its own list, not the table');
  // The usual conditions, and weird ones on top: one at AAA, two at AA.
  assert.deepEqual(seen.AAA.covs, ['golf', ...json(ev, 'callOdd(CALL_TERMS.AAA)')]);
  assert.deepEqual(seen.AA.covs, ['golf', 'continents2', ...json(ev, 'callOdd(CALL_TERMS.AA)')]);
  assert.equal(seen.AAA.covs.length, 2);
  assert.equal(new Set(seen.AA.covs).size, 4, 'two different weird ones');
  assert.deepEqual(errors, []);
});

test('the limit is months of revenue by rating, less debt; equity is not debt', (t) => {
  const { ev, errors } = game(t, 'AA', 3e5); // 6 x 300k = 1.8M
  assert.deepEqual(buttons(ev), [[1e5, false], [5e5, false], [1e6, false], [5e6, true], [1e7, true]]);
  assert.match(bank(ev), /up to \$1\.80M more/);
  ev('ACT.callBank({amount:5e6})');
  assert.equal(offers(ev).length, 0, 'over the limit is refused as well as greyed out');
  ev('window.__rt="AAA"');
  assert.equal(ev('callLimit(CALL_TERMS.AAA)'), 2.4e6);

  ev("window.__rt='AA';S.loans.push({id:'l1',bank:'db',bal:9e5,covs:[],amount:9e5,start:S.day,left:12,apr:.1,pay:1})");
  assert.deepEqual(buttons(ev), [[1e5, false], [5e5, false], [1e6, true], [5e6, true], [1e7, true]]);
  ev("S.loans.push({id:'l2',bank:'vult',bal:0,amount:7e6,share:.1,covs:[],start:S.day})");
  assert.equal(ev('callLimit(CALL_TERMS.AA)'), 9e5, 'an investor is not a creditor, whatever their bal says');
  ev("S.loans.find(l=>l.id==='l2').bal=7e6");
  assert.equal(ev('callLimit(CALL_TERMS.AA)'), 9e5);
  ev("S.loans[0].bal=9e9");
  assert.equal(ev('callLimit(CALL_TERMS.AA)'), 0, 'never below zero');
  assert.match(bank(ev), /up to \$0 more/);
  assert.deepEqual(errors, []);
});

test('only the amounts on the buttons can be asked for', (t) => {
  const { ev, errors } = game(t);
  for (const a of ['"1000000"', '-1e6', '0', '123456', '1e12', 'NaN', 'null', '{}', 'undefined']) {
    ev(`ACT.callBank({amount:${a}})`);
    assert.equal(offers(ev).length, 0, String(a));
  }
  assert.deepEqual(buttons(ev).map((b) => b[0]), [1e5, 5e5, 1e6, 5e6, 1e7]);
  assert.deepEqual(errors, []);
});

test('a second call replaces the first; offers that came by themselves stay', (t) => {
  const { ev, errors } = game(t);
  ev("S.loanOffers.push({id:'r1',bank:'rev',amount:9e4,exp:S.day+20,covs:['app'],apr:.2,term:6,pay:1})");
  for (const a of [1e5, 1e6, 5e6]) ev(`ACT.callBank({amount:${a}})`);
  assert.deepEqual(offers(ev).map((o) => o.amount).sort((a, b) => a - b), [9e4, 5e6]);
  assert.deepEqual(errors, []);
});

test('calling moves no money; taking the offer makes an ordinary loan', (t) => {
  const { ev, errors } = game(t);
  ev('S.cash=1000;ACT.callBank({amount:1e6})');
  assert.equal(ev('S.cash'), 1000);
  assert.equal(ev('S.loans.length'), 0);
  assert.equal(ev('$("hBank").hidden'), false, 'the badge counts it straight away, paused or not');
  assert.equal(ev('JSON.parse(slotRaw(UI.slot)).loanOffers.length'), 1, 'saved right away');
  assert.match(bank(ev), /Goldman Sacks offers/);
  ev('ACT.takeLoan({id:S.loanOffers[0].id})');
  assert.equal(ev('S.cash'), 1000 + 1e6);
  assert.equal(offers(ev).length, 0);
  const l = ev('S.loans[0]');
  assert.equal(l.bal, 1e6);
  assert.equal(l.apr, 0.06);
  assert.equal(l.left, 36);
  assert.equal(l.share, 0);
  assert.equal(l.call, undefined);
  ev('S.cash=1e7;for(let m=0;m<40&&S.loans.length;m++){loanTick(S.day+=31);R.revMo=5e6;}');
  assert.ok(ev('S.loans.length===0||S.loans[0].left<36'), 'it pays down like any other');
  assert.deepEqual(errors, []);
});

test('calling rolls no dice: the game after it goes on exactly the same', (t) => {
  const run = (call) => {
    const { ev, dom, errors } = load();
    t.after(() => dom.window.close());
    ev(`ACT.start({});closeModal();UI.speed=0;rating=()=>'AAA';R.revMo=5e6;window.__n=0;const mr=Math.random;Math.random=function(){window.__n++;return mr();};`);
    if (call) ev('ACT.callBank({amount:1e5})');
    assert.deepEqual(errors, []);
    return [ev('window.__n'), ev('Math.random()')];
  };
  assert.deepEqual(run(true), run(false));
});

test('with half a billion in the vault the section is gone, like the banks', (t) => {
  const { ev, errors } = game(t);
  ev('S.cash=RICH_NO_LOANS;ACT.callBank({amount:1e5})');
  assert.equal(offers(ev).length, 0);
  assert.deepEqual(buttons(ev), []);
  assert.doesNotMatch(bank(ev), /Call the bank|Get to an AA rating/);
  ev('S.cash=RICH_NO_LOANS-1');
  assert.equal(buttons(ev).length, 5);
  assert.deepEqual(errors, []);
});

test('a save holding a called offer loads, and the offer can still be taken', (t) => {
  const { ev, errors } = game(t);
  ev('ACT.callBank({amount:5e5})');
  ev('window.__s2=migrate(JSON.parse(JSON.stringify(S)));S=__s2;compute();');
  assert.equal(offers(ev).length, 1);
  ev('ACT.bank({});ACT.takeLoan({id:S.loanOffers[0].id})');
  assert.equal(ev('S.loans[0].amount'), 5e5);
  // An offer from a save that names no bank we know is dropped by sanitize, called or not.
  ev("window.__s3=JSON.parse(JSON.stringify(S));__s3.loanOffers=[{id:'x',bank:'nope',call:1,amount:1,covs:[],exp:1e9}];S=migrate(__s3);compute();");
  assert.equal(offers(ev).length, 0);
  assert.deepEqual(errors, []);
});

test('the amounts sit in the usual button row, which wraps on a phone', (t) => {
  const { ev, errors } = game(t);
  ev('ACT.bank({})');
  assert.equal(ev("document.querySelectorAll('#bankCard .btns [data-act=\"callBank\"]').length"), 5);
  assert.deepEqual(errors, []);
});

test('weird conditions always apply, and turn over every week, not every call', (t) => {
  const { ev, errors } = game(t);
  const odd = () => { ev('ACT.callBank({amount:1e5})'); return offers(ev)[0].covs.slice(1); };
  ev('S.day=0');
  const w0 = odd();
  assert.equal(w0.length, 1);
  assert.equal(ev(`CALL_ODD.includes(${JSON.stringify(w0[0])})`), true, 'from the weird list');
  ev('S.day=6');
  assert.deepEqual(odd(), w0, 'calling again the same week gets the same quirk');
  ev('S.day=7');
  assert.notDeepEqual(odd(), w0, 'next week, another one');
  assert.deepEqual(errors, []);
});
