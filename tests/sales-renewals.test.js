// The sales desk answers renewal haggles (39-sales-renewals.js): the engineer talks technology, the shark gives
// nothing away, the CEO settles it on the golf course. Every answer is a hash of the contract, so the tests make
// many customers and look at what each kind of salesperson does with them, and never depend on luck.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['ams','lon','par'])ACT.buildPop({city:c});compute()";
// A customer 27 days from the end of its term, asking $700 instead of the $1,000 it pays: the desk answers it today.
const hag = (id, type = 'dia', extra = '') => `{id:'${id}',city:'ams',city2:null,name:'${id}',type:'${type}',bw:5,rate:1000,reqs:[],mood:90,since:S.day-800,te:S.day+27,mk:1,hag:{rate:700,until:S.day+27}${extra}}`;
// What one kind of salesperson does with n customers of a type: the outcome of each, its new rate and term.
const run = (ev, p, type, n = 300) => {
  ev(`S.sales.p='${p}';S.biz=S.biz.filter(b=>!b.hag)`);
  return JSON.parse(ev(`(()=>{const out=[];for(let i=0;i<${n};i++){const b=${hag('x', type)};b.id=b.name='${p}-${type}-'+i;S.biz.push(b);const te0=b.te,how=slRenOne(b,'${p}');
    out.push({how,rate:b.rate,te:b.te-te0,hag:!!b.hag,here:S.biz.includes(b),reqs:b.reqs.length});}return JSON.stringify(out);})()`));
};
const share = (o, how) => o.filter((x) => x.how === how).length / o.length;

test('off until you switch it on; the desk answers three days into the haggle, unless you did first', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.biz.push(" + hag('early') + ");S.biz.find(b=>b.id==='early').hag.until=S.day+29;S.biz.find(b=>b.id==='early').te=S.day+29");
  ev("S.biz.push(" + hag('due') + ")");
  ev('slRenDay(S.day)');
  assert.ok(ev("S.biz.every(b=>!b.id.match(/early|due/)||b.hag)"), 'nobody at the desk: nothing happens');
  ev("ACT.salesHire({id:'eng'})");
  ev('slRenDay(S.day)');
  assert.ok(ev("S.biz.find(b=>b.id==='due').hag"), 'someone at the desk, but the switch is off');
  assert.equal(ev('!!S.slAuto.ren'), false);
  ev('ACT.salesOpen()');
  assert.match(ev("document.getElementById('modal').innerHTML"), /data-act="salesRen"/, 'the switch is in the sales sheet');
  ev('ACT.salesRen()');
  assert.equal(ev('S.slAuto.ren'), true);
  ev("UI.left='deals';renderLeft()");
  assert.match(ev("document.getElementById('left').innerHTML"), /answers this on/, 'the haggle says when the desk answers');
  ev('slRenDay(S.day)');
  assert.equal(ev("!!S.biz.find(b=>b.id==='due').hag"), false, 'three days in: answered');
  assert.equal(ev("!!S.biz.find(b=>b.id==='early').hag"), true, 'one day in: not yet, you can still answer it');
  ev("ACT.renewMatch({id:'early'})");
  assert.equal(ev("S.biz.find(b=>b.id==='early').rate"), 700, 'and your answer is the one that counts');
  assert.deepEqual(errors, []);
});

test('the engineer: business customers get their discount, nerds a tour of the network, and nobody leaves', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'eng'})");
  const biz = run(ev, 'eng', 'dia');
  assert.ok(biz.every((x) => x.how === 'cave' && x.rate === 700 && x.here), 'every business customer renews at what it asked');
  const nerds = run(ev, 'eng', 'hft');
  assert.ok(nerds.every((x) => x.here && !x.hag), 'nobody leaves');
  const tech = share(nerds, 'tech');
  assert.ok(tech > 0.6 && tech < 0.8, `most nerds pay the market price (${Math.round(tech * 100)}%)`);
  const fair = ev("clFair(" + hag('f', 'hft') + ")");
  for (const x of nerds) assert.equal(x.rate, x.how === 'tech' ? Math.max(700, Math.min(1000, fair)) : 850);
  assert.deepEqual(errors, []);
});

test('the shark: the old price, a fee for the save and fresh promises; some walk, nerds most of all', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'shark'})");
  const cash = ev('S.cash');
  const o = run(ev, 'shark', 'dia');
  const hold = o.filter((x) => x.how === 'hold');
  assert.ok(hold.length / o.length > 0.4 && hold.length / o.length < 0.6, `most renew at the old price (${hold.length} of ${o.length})`);
  assert.ok(hold.every((x) => x.rate === 1000 && x.here));
  assert.equal(cash - ev('S.cash'), hold.length * 5 * 300, 'a month of what he saved you, for each');
  assert.ok(hold.some((x) => x.reqs > 0), 'with a promise now and then');
  const walk = share(o, 'walk'), nerdWalk = share(run(ev, 'shark', 'hft'), 'walk');
  assert.ok(walk > 0.05 && walk < 0.2, `some walk (${Math.round(walk * 100)}%)`);
  assert.ok(nerdWalk > walk * 2, `nerds walk more (${Math.round(nerdWalk * 100)}%)`);
  assert.ok(o.filter((x) => x.how === 'walk').every((x) => !x.here), 'and are gone');
  assert.ok(o.filter((x) => x.how === 'mid').every((x) => x.rate === 850));
  assert.deepEqual(errors, []);
});

test('the CEO: a deeper discount for twice the term, a quick yes, or a fight; all from hashes', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'ceo'})");
  ev('window.__r=0;window.__r0=Math.random;Math.random=()=>{__r++;return __r0();};');
  const o = run(ev, 'ceo', 'dia');
  ev('Math.random=__r0');
  assert.equal(ev('__r'), 0, 'no draws from the game\'s random stream');
  const golf = o.filter((x) => x.how === 'golf'), yes = o.filter((x) => x.how === 'yes'), fight = o.filter((x) => x.how === 'fight');
  assert.ok(fight.length / o.length > 0.15 && fight.length / o.length < 0.35, `${fight.length} fights`);
  assert.ok(golf.length && golf.every((x) => x.rate === 630 && x.here), 'golf: 10% under what they asked');
  const term = (l) => l.reduce((a, x) => a + x.te, 0) / l.length;
  assert.ok(term(golf) > term(yes) * 1.6, `for a contract about twice as long (${Math.round(term(golf))} vs ${Math.round(term(yes))} days)`);
  assert.ok(yes.every((x) => x.rate === 700), 'a quick yes is what they asked');
  assert.ok(fight.every((x) => !x.here));
  assert.deepEqual(errors, []);
});

test('saves remember the switch, and an old save has it off', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'shark'});ACT.salesRen()");
  const s = JSON.parse(ev('JSON.stringify(packSave(S))'));
  assert.equal(JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${JSON.stringify(JSON.stringify(s))})).slAuto)`)).ren, true);
  s.slAuto.ren = 'yes please'; assert.equal(JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${JSON.stringify(JSON.stringify(s))})).slAuto)`)).ren, undefined);
  delete s.slAuto.ren; assert.equal(JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${JSON.stringify(JSON.stringify(s))})).slAuto)`)).ren, undefined);
  assert.deepEqual(errors, []);
});
