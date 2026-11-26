const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// #489: a shark cut a subsea cable, and a new wave on that same cable came up working the same day.
test('#489 no new waves on a cable while it is cut', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'lon'});ACT.buildPop({city:'nyc'});S.pops.lon.rgen=S.pops.nyc.rgen=3;compute()");
  ev("window.__cab=cablesFor('lon','nyc')[0].cid;UI.pending={a:'lon',b:'nyc'};UI.via=__cab;ACT.buildLink({tier:0})");
  const w = "S.links.find(l=>l.kind==='wave'&&l.cable===__cab)";
  assert.ok(ev(`!!${w}`), 'the first wave is lit');
  // the shark: every link in the trench is cut, with its incident, as failureRun() does it
  ev(`const l=${w};l.cut=S.day+12;addInc({type:'cut',ref:l.trench,until:S.day+12,msg:'shark',cost:4000});compute()`);
  const n = () => ev('S.links.length');
  const before = n();
  ev("UI.pending={a:'lon',b:'nyc'};UI.via=__cab;ACT.buildLink({tier:0})");
  assert.equal(n(), before, 'no wave is sold on a cut cable');
  assert.ok(ev("!!soldOut('lon','nyc',0,__cab)"), 'the wave sheet shows the route as unavailable');
  assert.equal(ev("soldOut('lon','nyc',0,__cab).until-S.day"), 12, 'until the repair is done');
  assert.equal(ev("soldOut('lon','nyc',0,cablesFor('lon','nyc').find(c=>c.cid!==__cab).cid)"), null, 'another cable on the route still sells waves');
  ev(`ACT.upLink({id:${w}.id,tier:1})`);
  assert.equal(ev(`${w}.tier`), 0, 'nor can the cut wave be upgraded');
  // the sheet says why, in the player's words
  ev("openLinkModal('lon','nyc')");
  assert.match(ev("document.getElementById('modal').textContent"), /sold out for 12 days/i);
  ev('closeModal()');
  // mended: waves are on sale again
  ev("clearInc(S.inc.find(i=>i.type==='cut'));compute()");
  assert.equal(ev("soldOut('lon','nyc',0,__cab)"), null);
  ev("UI.pending={a:'lon',b:'nyc'};UI.via=__cab;ACT.buildLink({tier:0})");
  assert.equal(n(), before + 1, 'the repaired cable sells waves again');
  assert.deepEqual(errors, []);
});
