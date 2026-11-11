// #340: alien waves you list by hand stay listed, whatever the capacity market's thresholds say. The broker's daily pass
// used to overwrite the listing with what the thresholds allowed, so 128 listed waves came back as 96, or as nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const setup = () => {
  const r = load();
  r.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.biz=[];S.offers=[];for(const c of ['lon','nyc'])if(!S.pops[c])ACT.buildPop({city:c})");
  r.ev("S.links.push({id:'f',a:'lon',b:'nyc',kind:'df',own:true,sys:'cl',ch:[],km:5570,ready:0,day:0,cut:0,mo:1,trench:'own:f',pairs:1});after()");
  return r;
};
// Objects from the page come from another realm: compare them as JSON.
const J = (ev, x) => JSON.parse(ev(`JSON.stringify(${x})`));
const L = ev => J(ev, "S.links.find(l=>l.id==='f').list||null");
// A day of the market with no buyer (so nothing sells and only the listing logic runs).
const quietDay = ev => ev("(()=>{const r=Math.random;Math.random=()=>0.99;try{cmDay(S.day)}finally{Math.random=r}})()");

test('#340 a hand-made listing survives the broker when demand is below your minimum or the price below your floor', () => {
  const { ev, errors } = setup();
  ev("S.cm.p.spec.on=true;S.cm.p.spec.min=8;S.cm.p.spec.floor=120");
  ev("ACT.listFiber({id:'f',w:128})");
  assert.equal(L(ev).w, 128);
  quietDay(ev);
  assert.equal(L(ev).w, 128, 'still listed the next day');
  // Changing a setting relists right away; it must not take the hand-made listing away either.
  ev("ACT.mktCfg({p:'spec',k:'floor',v:100})");
  assert.equal(L(ev).w, 128);
  ev("ACT.mktCfg({p:'spec',k:'on',v:0})");
  assert.equal(L(ev).w, 128, 'switching the product off keeps what you listed by hand');
  ev("ACT.mktCfg({p:'spec',k:'on',v:1});ACT.mktRoute({k:'lon|nyc'})");
  assert.equal(L(ev).w, 128, 'leaving the route alone keeps it too');
  ev("ACT.unlistFiber({id:'f'})");
  assert.equal(L(ev), null, 'unlisting still clears it');
  assert.deepEqual(errors, []);
});

test('#340 the broker adds its share on top of yours, and sales take from its share first', () => {
  const { ev, errors } = setup();
  ev("S.cm.p.spec.on=true;S.cm.p.spec.min=1;S.cm.p.spec.floor=60;S.cm.hold=25");
  quietDay(ev);
  const auto = L(ev).w;
  assert.equal(auto, 96, 'the broker lists what is spare after the 25% kept back');
  ev("ACT.listFiber({id:'f',w:4})");
  quietDay(ev);
  assert.equal(L(ev).w, 100, 'your 4 come out of what is kept back');
  // A buyer takes a wave: the broker's share shrinks, yours stays.
  ev("(()=>{const r=Math.random;Math.random=()=>0;try{cmDay(S.day)}finally{Math.random=r}})()");
  assert.equal(ev("S.biz.filter(b=>b.type==='wwave').reduce((a,b)=>a+b.slots,0)"), 1);
  assert.equal(L(ev).hw, 4);
  quietDay(ev);
  assert.equal(L(ev).w, 99, '95 spare after the reserve, plus your 4');
  assert.equal(L(ev).hw, 4);
  assert.deepEqual(errors, []);
});

test('#340 the hand-made part of a listing round-trips through a save, and old saves load as before', () => {
  const { ev, errors } = setup();
  ev("ACT.listFiber({id:'f',w:12})");
  const back = J(ev, "((()=>{const s=parseSave(JSON.stringify(S)).s;migrate(s);return s.links.find(l=>l.id==='f').list})())");
  assert.deepEqual(back, { w: 12, p: 0, hw: 12 });
  assert.deepEqual(J(ev, "(cmClean({w:5,p:0,hw:40}))"), { w: 5, p: 0, hw: 5 }, 'never more by hand than listed');
  assert.deepEqual(J(ev, "(cmClean({w:5,p:0}))"), { w: 5, p: 0 }, 'an old listing has nothing by hand');
  assert.equal(ev("cmClean({w:0,p:0,hw:3})"), null);
  assert.deepEqual(errors, []);
});
