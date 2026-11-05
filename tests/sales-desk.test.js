// The sales desk: one salesperson at a time, three kinds (the engineer turned salesdroid, the shark, the CEO), each
// bringing deals their own way and leaving their mark on the customers they sign.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const start = "ACT.start({});S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['ams','lon','par','fra','nyc','ash'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=3;compute()";
// Offers as the day brings them, shaped by whoever is at the desk.
const offers = (ev, n = 600) => JSON.parse(ev(`(()=>{const out=[];for(let i=0;i<${n};i++){S.offers=[];spawnOffer();mktPrice(0);salesShape(0);out.push(...S.offers.map(o=>({t:o.type,by:o.by||null,bw:o.bw,rate:o.rate,reqs:(o.reqs||[]).length})));}return JSON.stringify(out);})()`));

test('one salesperson at a time, from customer level 2, with a salary; the CEO is free and cannot be fired', () => {
  const { ev, errors } = load();
  ev(start);
  ev("S.lvl=1;ACT.salesHire({id:'eng'})");
  assert.equal(ev('slP()'), null, 'level 1: the desk is not open yet');
  ev("S.lvl=4;ACT.salesHire({id:'eng'})");
  assert.equal(ev('slP()'), 'eng');
  ev("ACT.salesHire({id:'shark'})");
  assert.equal(ev('slP()'), 'eng', 'one at a time');
  assert.equal(ev('salesMo()'), 9000, 'on the payroll');
  ev('compute()');
  assert.ok(ev('R.cost.extras') >= 9000);
  ev('ACT.salesFire()'); ev('ACT.salesFire()');
  assert.equal(ev('slP()'), null, 'let go after a confirmation');
  ev("ACT.salesHire({id:'ceo'})");
  assert.equal(ev('slP()'), 'ceo');
  assert.equal(ev('salesMo()'), 0);
  ev('ACT.salesFire()'); ev('ACT.salesFire()');
  assert.equal(ev('slP()'), 'ceo', 'nobody fires the CEO');
  const cash = ev('S.cash');
  ev('ACT.salesVp()');
  assert.equal(ev('S.cash'), cash - ev('SALES_VP'), 'a board meeting costs');
  ev('for(let i=0;i<SALES_VP_DAYS;i++)salesDay(S.day+i+1)');
  assert.equal(ev('slP()'), null, 'a month later the VP of Sales frees the desk');
  assert.deepEqual(errors, []);
});

test('the engineer: more offers, never the huge deals, books every NOG at the usual price, and their customers stay', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'eng'})");
  const o = offers(ev);
  assert.ok(o.length > 300);
  assert.ok(o.every(x => !ev(`salesBig('${x.t}')`)), 'no mega AI, hyperscaler or AGI deals');
  assert.ok(o.every(x => x.by === 'eng'), 'every offer is theirs');
  assert.ok(ev('salesSpawn()') > 1, 'more offers come in');
  // A meeting 30 days out: they register you and you pay the ticket.
  const r = JSON.parse(ev(`(()=>{const cf=upcomingConfs(400).find(c=>!c.cap);S.day=cf.day-30;const cash=S.cash;salesDay(S.day);const n=upcomingConfs(30).filter(c=>!c.cap&&c.day===cf.day).length;return JSON.stringify({reg:!!S.confReg[cf.key],paid:cash-S.cash,n});})()`));
  assert.equal(r.reg, true);
  assert.equal(r.paid, r.n * ev('CONF_COST'), 'every meeting that day, each at the usual ticket price: not for free');
  assert.equal(ev("salesLeaveMul({by:'eng',type:'hft'})"), 0.5, 'the nerds love them');
  assert.ok(ev("salesLeaveMul({by:'eng',type:'dia'})") < 1);
  assert.ok(ev('salesAsk()') < 0.8, 'and they haggle badly');
  assert.deepEqual(errors, []);
});

test('the shark: bigger deals at a quarter more, oversold promises, no nerds, a commission, tougher peering', () => {
  const { ev, errors } = load();
  ev(start);
  const plain = offers(ev);
  ev("ACT.salesHire({id:'shark'})");
  const o = offers(ev);
  assert.ok(o.every(x => !ev(`SALES_NERDS.includes('${x.t}')`)), 'no technical customers');
  const avg = (l, t) => { const x = l.filter(y => y.t === t); return x.reduce((a, y) => a + y.rate, 0) / Math.max(1, x.length); };
  assert.ok(avg(o, 'dia') > avg(plain, 'dia') * 1.15, `priced higher (${avg(o, 'dia')} vs ${avg(plain, 'dia')})`);
  const oversold = o.filter(x => x.reqs > 0).length / o.length, before = plain.filter(x => x.reqs > 0).length / plain.length;
  assert.ok(oversold > before + 0.15, `oversold: ${Math.round(oversold * 100)}% with promises, ${Math.round(before * 100)}% without the shark`);
  assert.equal(ev('salesPeerMul()'), 1.25);
  assert.equal(ev('salesMeet()'), 0.9, 'wins most haggles');
  assert.equal(ev("salesLeaveMul({by:'shark',type:'dia'})"), 1.5, 'and their customers leave sooner');
  // Signing one of theirs pays the commission.
  ev("S.offers=[];for(let i=0;i<200&&!S.offers.some(o=>o.by==='shark'&&bHas(o)&&!BIZ_T[o.type].event&&!BIZ_T[o.type].fiber);i++){spawnOffer();salesShape(0);}");
  const r = JSON.parse(ev("(()=>{const o=S.offers.find(o=>o.by==='shark'&&bHas(o)&&!BIZ_T[o.type].event&&!BIZ_T[o.type].fiber);const cash=S.cash;ACT.accept({id:o.id});const b=S.biz.find(b=>b.id===o.id);return JSON.stringify({by:b&&b.by,paid:cash-S.cash,mo:b?bizMo(b):0});})()"));
  assert.equal(r.by, 'shark', 'the customer remembers who signed it');
  assert.equal(r.paid, Math.round(r.mo), 'a month of the deal as commission');
  assert.deepEqual(errors, []);
});

test('the CEO: golf deals at 30% off, the odd declined offer signed anyway, opinions; all from hashes, not Math.random', () => {
  const { ev, errors } = load();
  ev(start);
  ev("ACT.salesHire({id:'ceo'})");
  ev('window.__r=0;window.__r0=Math.random;Math.random=()=>{__r++;return __r0();};');
  const n0 = ev('S.biz.length');
  ev('for(let i=1;i<=200;i++)salesDay(S.day+i)');
  ev('Math.random=__r0');
  assert.equal(ev('__r'), 0, 'no draws from the game\'s random stream');
  const golf = JSON.parse(ev(`JSON.stringify(S.biz.slice(${n0}).map(b=>({by:b.by,t:b.type,bw:b.bw,rate:b.rate,list:BIZ_T[b.type].rate})))`));
  assert.ok(golf.length >= 2 && golf.length <= 4, `a golf deal every 50–80 days (${golf.length} in 200 days)`);
  for (const g of golf) {
    assert.equal(g.by, 'ceo');
    assert.ok(g.rate <= Math.round(g.list * 0.7 * ev('mkt()')) + 1, '30% off list');
  }
  assert.ok(ev("S.log.some(e=>/The CEO: /.test(e.t))"), 'and opinions');
  // Declining: about one in three, he already shook hands.
  const r = JSON.parse(ev(`(()=>{let over=0,n=0;for(let i=0;i<300;i++){S.offers=[];spawnOffer();const o=S.offers.find(o=>bHas(o)&&!BIZ_T[o.type].event);if(!o)continue;n++;const b0=S.biz.length;ACT.decline({id:o.id});if(S.biz.length>b0)over++;}return JSON.stringify({over,n});})()`));
  assert.ok(r.n > 50 && r.over / r.n > 0.2 && r.over / r.n < 0.45, `${r.over} of ${r.n} declines signed anyway`);
  assert.deepEqual(errors, []);
});

test('the desk in Deals and its sheet, and saves that remember who is at the desk', () => {
  const { ev, errors } = load();
  ev(start);
  ev("UI.left='deals';renderLeft()");
  assert.match(ev("document.getElementById('left').innerHTML"), /data-act="salesOpen"/);
  ev('ACT.salesOpen()');
  const m = ev("document.getElementById('modal').innerHTML");
  for (const id of ['eng', 'shark', 'ceo']) assert.match(m, new RegExp(`data-act="salesHire" data-args="\\{&quot;id&quot;:&quot;${id}&quot;\\}"`));
  ev("ACT.salesHire({id:'shark'})");
  const s = JSON.parse(ev('JSON.stringify(packSave(S))'));
  s.offers = [{ id: 'o1', city: 'ams', name: 'X', type: 'dia', bw: 1, rate: 600, reqs: [], exp: 99, by: 'pirate' }];
  const out = JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${lit(JSON.stringify(s))})))`));
  assert.equal(out.sales.p, 'shark');
  assert.equal(out.offers[0].by, undefined, 'only real salespeople');
  s.sales = { p: 'intern', hired: 'yesterday' };
  assert.equal(JSON.parse(ev(`JSON.stringify(sanitize(JSON.parse(${lit(JSON.stringify(s))})).sales)`)).p, null);
  assert.deepEqual(errors, []);
});
