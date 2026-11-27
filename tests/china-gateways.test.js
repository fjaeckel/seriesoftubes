// Mainland China, closer to how it works: a new link into it starts at a gateway (CN_GATE: Hong Kong or Seoul); only
// the state carriers own fiber there, so foreign networks lease waves; a carrier's POPs stand in Beijing and Shanghai,
// the campus towns being for the Hyperscaler's partners; the licence is a real joint venture's price and wait; the
// regular border loses a tenth on average. Links a save already has into China keep loading and carrying traffic.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.cnLic={state:'ok'};";
const pop = c => `S.pops.${c}={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:3};`;
const links = (ev, a, b) => ev(`S.links.filter(l=>[l.a,l.b].sort().join()===[${JSON.stringify(a)},${JSON.stringify(b)}].sort().join()).length`);
const modal = ev => ev("document.getElementById('modal').textContent");
function game(t) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(start + ['fra', 'tok', 'sin', 'mos', 'hkg', 'icn', 'pek', 'sha'].map(pop).join('') + 'compute()');
  return h;
}
const wave = (ev, a, b) => ev(`UI.pending={a:'${a}',b:'${b}'};UI.via='';UI.cnPrem=false;UI.route='';ACT.buildLink({tier:0})`);

test('a wave into mainland China is leased only from Hong Kong or Seoul', (t) => {
  const { ev, errors } = game(t);
  for (const [a, b] of [['fra', 'pek'], ['tok', 'sha'], ['sin', 'sha'], ['mos', 'pek'], ['pek', 'fra']]) {
    wave(ev, a, b);
    assert.equal(links(ev, a, b), 0, `${a}–${b} is refused`);
  }
  ev("openLinkModal('fra','pek')");
  assert.match(modal(ev), /only in Hong Kong and Seoul/);
  wave(ev, 'hkg', 'pek');
  assert.equal(links(ev, 'hkg', 'pek'), 1, 'Hong Kong–Beijing over land');
  wave(ev, 'icn', 'sha');
  assert.equal(links(ev, 'icn', 'sha'), 1, 'Seoul–Shanghai under the sea');
  wave(ev, 'fra', 'hkg');
  assert.equal(links(ev, 'fra', 'hkg'), 1, 'Hong Kong itself is open to everyone');
  // Inside China, from China: no border, no gate needed.
  wave(ev, 'pek', 'sha');
  assert.equal(links(ev, 'pek', 'sha'), 1);
  assert.equal(ev("hsOpsWaveQuote('fra','pek',10)"), null, "the Hyperscaler's wave order never quotes one either");
  assert.deepEqual(errors, []);
});

test('mainland China sells foreign networks waves, never fiber: no pair to dig or lease, for you or your optical team', (t) => {
  const { ev, errors } = game(t);
  ev("UI.lmode='df';UI.dfSrc='build';openLinkModal('pek','sha')");
  assert.match(modal(ev), /only the state carriers own fiber/);
  assert.equal(ev("!!document.querySelector('#modal [data-act=\"orderDf\"]')"), false, 'nothing to order');
  for (const src of ['build', 'lease']) {
    ev(`UI.pending={a:'pek',b:'sha'};UI.dfSrc='${src}';ACT.orderDf()`);
    assert.equal(links(ev, 'pek', 'sha'), 0, `${src} is refused`);
  }
  assert.equal(ev("dfAllowed('hkg','pek')"), false, 'nor across the border');
  assert.equal(ev("optxQuote('pek','sha')"), null);
  assert.equal(ev("dfAllowed('hkg','sin')||dfAllowed('fra','par')"), true, 'elsewhere fiber is still for sale');
  wave(ev, 'pek', 'sha');
  assert.equal(links(ev, 'pek', 'sha'), 1, 'a wave inside China is fine');
  assert.deepEqual(errors, []);
});

test("China's campus towns are for the Hyperscaler's partners: a carrier builds in Beijing and Shanghai", (t) => {
  const { ev, errors } = game(t);
  for (const c of ['gya', 'zhy', 'zjk']) {
    assert.equal(ev(`cityOn('${c}')`), false, c);
    ev(`ACT.buildPop({city:'${c}'})`);
    assert.equal(ev(`!!S.pops.${c}`), false, `no POP in ${c}`);
    wave(ev, 'pek', c);
    assert.equal(links(ev, 'pek', c), 0, `no link to ${c}`);
  }
  assert.match(ev("popOffWhy('zjk')"), /Beijing and Shanghai/);
  assert.equal(ev("cityOn('pek')&&cityOn('sha')"), true);
  // A save that already has a POP there keeps it on the map.
  ev(pop('zjk'));
  assert.equal(ev("cityOn('zjk')"), true);
  assert.deepEqual(errors, []);
});

test('the China licence costs what a real joint venture does, takes about half a year, and the border loses a tenth', (t) => {
  const { ev, errors } = game(t);
  ev("S.cnLic={state:'none'};S.cash=2e6;ACT.applyCn()");
  assert.equal(ev("S.cash"), 2e6 - 1500000);
  assert.equal(ev("S.cnLic.ready-S.day"), ev("leadDays(180)"));
  assert.equal(ev("gfwLoss(false,false)"), 0.1);
  assert.equal(ev("gfwLoss(false,true)"), 0.3);
  assert.equal(ev("gfwLoss(true,false)"), 0.03);
  ev("S.cnLic={state:'ok'};UI.lmode='wave';openLinkModal('hkg','pek')");
  assert.match(modal(ev), /lose about 10% of traffic at the border/);
  assert.deepEqual(errors, []);
});

test('a save with a wave into China from elsewhere keeps it, and it still carries traffic', (t) => {
  const h = load();
  t.after(() => h.dom.window.close());
  const { ev, errors } = h;
  ev(start + "ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});" + pop('pek') +
    "S.links.push({id:'old1',a:'fra',b:'pek',kind:'wave',border:true,premium:false,tier:0,km:7781,sub:false,mo:1,mult:3,trench:'old1',cut:0,day:0});ACT.launchBB({city:'pek'});compute()");
  ev("(()=>{const q=parseSave(JSON.stringify(packSave(S)));S=migrate(q.s);compute()})()");
  assert.equal(ev("S.links.some(l=>l.id==='old1')"), true);
  assert.ok(ev("(R.load&&R.load.old1)||0") > 0, 'traffic still crosses on it');
  assert.deepEqual(errors, []);
});
