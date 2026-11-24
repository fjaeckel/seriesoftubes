// #475: a supercluster leg whose path is over its latency limit moves its data (the links look full) but none of it
// counts. The run's row in the Cloud tab and the region pair in the NOC said "12.8T of 12.8T" and nothing else, so the
// run looked healthy while it stalled. Both now say the leg is stalled, how slow its path is against the limit, and
// which way it goes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const wave = (id, a, b, tier) => `S.links.push({id:${lit(id)},a:${lit(a)},b:${lit(b)},kind:'wave',tier:${tier},km:Math.round(kmBetween(${lit(a)},${lit(b)})),mo:1,cut:0,ready:0,trench:${lit(id)},day:-30});`;
// Regions in Frankfurt, Dubai and Abu Dhabi. Dubai and Abu Dhabi (123 km apart) are joined only through Muscat, as in
// the reporter's save; a lab's supercluster runs Dubai–Frankfurt and Abu Dhabi–Dubai.
function cloud(t, direct) {
  const h = load({ seed: 7 });
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e12;S.lvl=12;S.nextFail=S.nextEvent=1e9;S.rules=makeRules('freeze');for(const c of ['dxb','auh','mct'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=RG_TOP;" +
    "for(const c of ['fra','dxb','auh'])S.hs.rg[c]={t:3,ready:0,mw:200};for(const c in S.hs.rg)hsPwMk(c).cap=hsTown(c)+5000;S.links=[];" +
    wave('w1', 'dxb', 'mct', 5) + wave('w2', 'auh', 'mct', 5) + wave('w3', 'dxb', 'fra', 5) + (direct ? wave('w4', 'auh', 'dxb', 5) : '') +
    "compute();hsDay(S.day);hsClTake({id:'lab1',n:'Bigger Model Inc.',cl:1,legs:[['dxb','fra'],['auh','dxb']],a:'dxb',b:'fra',g:6400,wk:4,tb:1,fee:1e7,exp:S.day+20});compute()");
  return h;
}
const J = (ev, c) => JSON.parse(ev(`JSON.stringify(${c})`));
const leg = "S.hs.jobs.find(j=>j.a==='auh')";
const text = (ev, html) => ev(`(()=>{const d=document.createElement('div');d.innerHTML=${html};return d.textContent})()`);

test('#475 a stalled supercluster leg says so in its run row and in the NOC, with its path and limit', (t) => {
  const { ev, errors } = cloud(t, false);
  const x = J(ev, `R.hs.jobs[${leg}.id]`);
  assert.ok(x.got > 0, 'the leg moves data');
  assert.ok(x.ms > ev(`${leg}.lim`), 'over its limit through Muscat: ' + x.ms);
  // A day goes by: nothing counts.
  ev(`hsTrafficDay(S.day)`);
  assert.equal(ev(`${leg}.done`), 0);
  const row = text(ev, `hsRunRow(${leg},'auh')`);
  assert.match(row, /Stalled/);
  assert.match(row, /Abu Dhabi → Muscat → Dubai/);
  assert.match(row, new RegExp(`${ev(`${leg}.lim`)} ms`));
  const noc = text(ev, 'hnocPairSection(hnocPairs())');
  assert.match(noc, /Abu Dhabi ⇄ Dubai[\s\S]*stalled/i);
  assert.ok(ev("hnocPairSection(hnocPairs())").includes('hnoc-bad'), 'the pair is marked red');
  assert.deepEqual(errors, []);
});

test('#475 a leg within its limit shows no stall', (t) => {
  const { ev, errors } = cloud(t, true);
  const x = J(ev, `R.hs.jobs[${leg}.id]`);
  assert.ok(x.got > 0 && x.ms <= ev(`${leg}.lim`), 'direct: within the limit');
  ev(`hsTrafficDay(S.day)`);
  assert.ok(ev(`${leg}.done`) > 0, 'it moves on');
  assert.doesNotMatch(text(ev, `hsRunRow(${leg},'auh')`), /Stalled/);
  assert.doesNotMatch(text(ev, 'hnocPairSection(hnocPairs())'), /stalled/i);
  assert.deepEqual(errors, []);
});
