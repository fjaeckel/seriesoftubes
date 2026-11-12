// Saves from files or old versions are checked on load (CLAUDE.md: saves are sacred): numbers a bill reads stay numbers,
// a malformed field never rejects the whole save. Also: leaving the page with a
// day in flight finishes and saves that day.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function game() {
  const p = load();
  p.ev("ACT.start({});S.cash=1e7;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});ACT.launchBB({city:'ams'});for(let i=0;i<5;i++)dayTick();");
  p.ev("window.__B=JSON.stringify(packSave(S))");
  const run = (edit) => JSON.parse(p.ev(`(()=>{const s=JSON.parse(__B);${edit};const q=parseSave(JSON.stringify(s));if(q.err)return JSON.stringify({err:q.err});
    try{S=migrate(JSON.parse(JSON.stringify(q.s)));compute();}catch(e){return JSON.stringify({fail:String(e)});}
    for(let d=0;d<3;d++)dayTick();return JSON.stringify({cash:S.cash,cost:R.costMo});})()`));
  return { p, run };
}

test('a loan with hostile numbers in a save never turns cash into NaN', () => {
  const { p, run } = game();
  const loan = "s.loans=[{id:'L1',bank:Object.keys(BANKS)[0],start:0,amount:1e6,got:1e6,bal:1e6,apr:0.05,apr0:0.05,pay:5000,left:12,term:12,share:0,covs:[]}]";
  for (const bad of ["s.loans[0].pay='x'", 's.loans[0].pay=[]', 's.loans[0].share=1e308', "s.loans[0].bal='1e400'", 's.loans[0].left=-5']) {
    const r = run(loan + ';' + bad);
    assert.ok(!r.err && !r.fail, bad + ': loads');
    assert.ok(Number.isFinite(r.cash), bad + ': cash stays a number');
  }
  assert.deepEqual(p.errors, []);
});

test('a malformed grace field does not reject the save when a release adds a network', () => {
  const { run } = game();
  const r = run('s.grace={until:1e6,nets:5};s.seen=(s.seen||[]).slice(1)');
  assert.ok(!r.err && !r.fail, JSON.stringify(r));
});

test('a transit history that is not a list loads instead of throwing', () => {
  const { run } = game();
  const r = run("s.transit[0].hist='x'");
  assert.ok(!r.err && !r.fail, JSON.stringify(r));
});

test('hiding the page while a day is in flight finishes that day and saves it', () => {
  const p = load();
  p.ev("ACT.start({});ACT.launchBB({city:'fra'});dayTick();");
  // A day that rests between steps and whose next frame never comes (a hidden tab draws none).
  p.ev("window.__w=[];const o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(v).length>1000)__w.push(k);return o.call(this,k,v);}");
  p.ev('RW.budget=-1;RW.later=()=>{};rwDay()');
  assert.ok(p.ev('!!RW.job'), 'the day is in flight');
  p.ev('save()');
  assert.equal(p.ev('__w.length'), 0, 'an ordinary save waits for the day to end');
  p.ev("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'))");
  assert.equal(p.ev('!!RW.job'), false, 'the day was finished on the page');
  assert.ok(p.ev('__w.length') > 0, 'and saved');
  assert.deepEqual(p.errors, []);
});
