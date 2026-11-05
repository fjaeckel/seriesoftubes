const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = (ev) => ev(`S=migrate(JSON.parse(${lit(SAVE)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute()`);
// Everything a player sees from routing: totals, money, every link, port and city.
const digest = "JSON.stringify([R.served,R.demand,R.reach,R.peered,R.revMo,R.costMo,R.cost,R.egT,R.load,R.useT,R.usePni,R.useIx,R.useCache,R.citySrv,R.cityDem])";

test('a field routing never reads really changes nothing it gives (every key the shortcut skips)', () => {
  const { ev, errors } = load({ seed: 3 });
  big(ev);
  const base = ev(digest);
  const keys = JSON.parse(ev('JSON.stringify([...RK_SKIP])'));
  for (const k of keys) {
    // Change the field all through: every number moves, every flag flips, text changes, lists grow, objects gain a field.
    ev(`(()=>{const m=x=>x==null?1:typeof x==='number'?x+12345:typeof x==='string'?x+'x':typeof x==='boolean'?!x:Array.isArray(x)?x.map(m).concat(x.length?[m(x[0])]:[]):Object.assign(Object.fromEntries(Object.entries(x).map(([a,b])=>[a,m(b)])),{zz:1});const v=S[${lit(k)}];window.__k=[${lit(k)},v];S[${lit(k)}]=m(JSON.parse(JSON.stringify(v===undefined?null:v)));compute();})()`);
    assert.equal(ev(digest), base, `routing reads S.${k}: take it off RK_SKIP`);
    ev('S[__k[0]]=__k[1];compute()');
  }
  assert.deepEqual(errors, []);
});

test('clicks that change nothing routing reads skip routing; real changes route again', () => {
  const { ev, errors } = load();
  big(ev);
  ev('window.__n=0;const _c=compute;compute=function(){__n++;return _c.apply(this,arguments)}');
  ev('after()');
  ev('__n=0;after();S.log.push({d:S.day,t:"x"});after();S.cash+=1000;after()');
  assert.equal(ev('__n'), 0, 'the log and cash do not reroute');
  ev("S.transit[0].pref='low';after()");
  assert.equal(ev('__n'), 1, 'a port setting does');
  ev('R=Object.assign({},R);after()');
  assert.equal(ev('__n'), 2, 'and so does a routing result from elsewhere (a day, the worker)');
  assert.deepEqual(errors, []);
});

test('routing never even reads a field the shortcut skips (so an empty one cannot hide it)', () => {
  const { ev, errors } = load();
  big(ev);
  const read = JSON.parse(ev(`(()=>{const seen=new Set(),real=S;S=new Proxy(real,{get(t,k){if(typeof k==='string')seen.add(k);return t[k];}});try{compute();}finally{S=real;}return JSON.stringify([...seen]);})()`));
  assert.deepEqual(read.filter((k) => ev(`RK_SKIP.has(${lit(k)})`)), [], 'routing reads these: take them off RK_SKIP');
  assert.ok(read.includes('loans'), 'loans pay into the month, so routing reads them');
  assert.deepEqual(errors, []);
});
