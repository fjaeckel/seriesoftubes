// #272: "The Long Way Round" asks for a link round Cape Horn. Your own subsea cable from Buenos Aires to Santiago
// goes round the Horn too, not only a wave leased on the old ring.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const horn = (ev) => ev("BADGES.find(b=>b.id==='horn').ok()");
const start = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=5e9;S.lvl=4;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'bue'});ACT.launchBB({city:'bue'})");

test('#272 your own subsea cable from Buenos Aires to Santiago earns The Long Way Round', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(horn(ev), false, 'no link round the Horn yet');
  assert.equal(ev("ownCabWhy('bue','scl')"), '', 'a cable can be laid Buenos Aires–Santiago');
  ev("UI.lmode='df';UI.dfSrc='lease';openLinkModal('bue','scl');ACT.ownCab();ACT.orderCable()");
  assert.ok(ev("S.links.some(l=>l.own&&l.sub&&!l.cable&&[l.a,l.b].includes('scl'))"), 'the cable is ordered');
  assert.equal(horn(ev), true, 'it goes round Cape Horn');
  ev('checkBadges()');
  assert.notEqual(ev("S.ach.horn"), undefined, 'and the badge is earned');
  assert.deepEqual(errors, []);
});

test('#272 a wave on the old ring still earns it, a cable that stays north of the Horn does not', () => {
  const { ev, errors } = load();
  start(ev);
  ev("S.links.push({id:'w1',a:'bue',b:'scl',kind:'wave',tier:1,km:5000,sub:true,cable:'sam1',mo:1,mult:1,trench:'cab:sam1',cut:0,day:0})");
  assert.equal(horn(ev), true, 'a wave on the ring round the Horn');
  ev("S.links=S.links.filter(l=>l.id!=='w1')");
  ev("S.links.push({id:'c1',a:'bue',b:'rio',kind:'df',own:true,sub:true,seaPath:[[-58.4,-34.6],[-50,-30],[-43.2,-22.9]],km:2000,cable:null,ch:[],mo:1,trench:'own:c1',cut:0,day:0,ready:0})");
  assert.equal(horn(ev), false, 'Buenos Aires–Rio never gets near the Horn');
  assert.deepEqual(errors, []);
});
