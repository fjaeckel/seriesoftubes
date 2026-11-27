// Mainland China meets the world only at its gateways (CN_GATE): a new link into it starts in Hong Kong or Seoul, and
// inside it only the state carriers dig, so dark fiber there is leased (an IRU), never built, by you or your optical
// team. Links a save already has into China from elsewhere keep loading and carrying traffic.
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

test('dark fiber inside mainland China is leased, never dug, by you or your optical team', (t) => {
  const { ev, errors } = game(t);
  ev("UI.lmode='df';UI.dfSrc='build';openLinkModal('pek','sha')");
  assert.match(modal(ev), /only the state carriers dig fiber/);
  assert.equal(ev("document.querySelector('#modal [data-act=\"dfSrc\"][data-args*=\"build\"]').disabled"), true);
  assert.match(ev("document.querySelector('#modal [data-act=\"orderDf\"]').textContent"), /IRU/, 'the order is a lease');
  ev("UI.pending={a:'pek',b:'sha'};UI.dfSrc='build';ACT.orderDf()");
  assert.equal(links(ev, 'pek', 'sha'), 0, 'digging is refused');
  ev("UI.pending={a:'pek',b:'sha'};UI.dfSrc='lease';ACT.orderDf()");
  assert.equal(ev("(S.links.find(l=>l.kind==='df'&&[l.a,l.b].sort().join()==='pek,sha')||{}).own"), false, 'a leased pair');
  assert.equal(ev("optxQuote('pek','sha')"), null);
  // Elsewhere you still dig.
  ev("UI.pending={a:'hkg',b:'sin'}");
  assert.equal(ev("cnNoDig('hkg','sin')"), false);
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
