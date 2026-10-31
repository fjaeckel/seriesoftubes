const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = (t) => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.ev(`S=migrate(JSON.parse(${JSON.stringify(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();`); return h; };
// R as JSON; DDoS reports hold the live attack, whose `worst` dayTick updates, so it is named by id.
const rj = (ev) => ev("JSON.stringify(R,(k,v)=>k==='attack'||k==='parent'?(v&&v.id):v)");

test('95th percentile: a recompute later in the day bills the same 30 days as the day tick did', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'lvl',tier:1});closeModal()");
  // Thirty days on file, two of them huge: counting today twice (and dropping the oldest day left) would lose one.
  ev("S.offers=[];const t=S.transit[0];t.hist=Array.from({length:30},(_,i)=>i===1||i===3?5000:1);S.nextFail=S.nextEvent=S.day+99;dayTick()");
  const tick = ev('R.p95[S.transit[0].id]'), cost = ev('R.cost.transit');
  assert.equal(tick, 5000, 'the tick bills the 29 days before today and today');
  ev('compute()');
  assert.equal(ev('R.p95[S.transit[0].id]'), tick);
  assert.equal(ev('R.cost.transit'), cost);
  assert.deepEqual(errors, []);
});

test('compute() is a pure function of the game: a second call right after a day changes nothing', (t) => {
  const { ev, errors } = big(t);
  for (let d = 0; d < 4; d++) {
    ev('S.nextFail=S.day+99;S.nextEvent=S.day+99;dayTick();compute()');
    const a = rj(ev); ev('compute()');
    assert.equal(rj(ev), a, `day ${d}`);
  }
  assert.deepEqual(errors, []);
});

test('scenic circuits keep the last path unless a new one is clearly better, so two calls converge', (t) => {
  const { ev, errors } = big(t);
  ev("for(const b of S.biz)if(BIZ_T[b.type].l2)b.route='scenic';R=emptyR();compute()");
  ev('compute()'); const b = rj(ev);
  ev('compute()'); assert.equal(rj(ev), b);
  assert.deepEqual(errors, []);
});
