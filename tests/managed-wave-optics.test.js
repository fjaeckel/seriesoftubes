// #440: managed waves sold on a dark fiber take their Gbps off what its optics light (dfCap0()). Taking optics
// out until the waves use all of it left your own traffic nothing, and the fiber went dark with no reason given.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const setup = (ev) => ev(`ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();S.cash=1e9;S.lvl=6;S.offers=[];S.biz=[];S.inc=[];
  for(const c of ['qro','bcv'])if(!S.pops[c])ACT.buildPop({city:c});closeModal();
  S.links.push({id:'f',a:'qro',b:'bcv',kind:'df',own:true,sys:'cl',ch:Array(11).fill('zr4'),km:Math.round(kmBetween('qro','bcv')*1.05),ready:0,day:0,cut:0,mo:100,trench:'own:f',pairs:1});
  cmSell(S.links.find(l=>l.id==='f'),'w400',10,1000,0);compute();`);
const L = "S.links.find(l=>l.id==='f')";

test('#440 optics carrying sold managed waves cannot be taken out, so the fiber stays up', () => {
  const { ev, errors } = load();
  setup(ev);
  assert.equal(ev(`mwG(${L})`), 4000, 'ten 400G managed waves sold');
  assert.equal(ev(`linkDown(${L})`), false, '11 × 400G leaves 400G for your own traffic');
  for (const act of ["ACT.setChCount({id:'f',o:'zr4',n:10})", "ACT.rmCh({id:'f',o:'zr4'})"]) {
    ev(act);
    assert.equal(ev(`${L}.ch.length`), 11, `${act} is refused`);
    assert.equal(ev(`linkDown(${L})`), false, 'the fiber is still up');
    assert.match(ev("document.getElementById('toasts').textContent"), /managed waves/);
    ev("document.getElementById('toasts').innerHTML=''");
  }
  // Optics beyond what the waves need still come out.
  ev(`${L}.ch.push('zr4','zr4');compute();ACT.setChCount({id:'f',o:'zr4',n:11})`);
  assert.equal(ev(`${L}.ch.length`), 11);
  ev("ACT.rmCh({id:'f',o:'zr4'})");
  assert.equal(ev(`${L}.ch.length`), 11, 'the last spare 400G is your own traffic\'s share');
  // Without managed waves, every optic comes out as before.
  ev("S.biz=[];CM_V++;ACT.setChCount({id:'f',o:'zr4',n:0})");
  assert.equal(ev(`${L}.ch.length`), 0);
  assert.deepEqual(errors, []);
});
