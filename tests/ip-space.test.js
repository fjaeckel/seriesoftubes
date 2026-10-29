const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A small European network: four leased waves and one lit dark fiber (links 0 to 4), day 120.
function network(opts) {
  const g = load(opts);
  const { ev } = g;
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("for(const c of ['ams','par','ber'])ACT.buildPop({city:c});const L=(a,b)=>{UI.via=null;openLinkModal(a,b);ACT.buildLink({tier:1});closeModal();};L('fra','ams');L('fra','par');L('fra','ber');L('ams','par');S.links.push({id:'dfx',a:'ams',b:'ber',kind:'df',km:580,sys:'lite',ch:['zr4'],ready:0,mo:500,day:0,cut:0});S.day=120;S.nextFail=1e9;S.nextEvent=1e9;compute()");
  return g;
}
const fire = (ev) => ev("window.__fe=" + ev('fireEvent.toString()').replace(/^function fireEvent/, 'function').replace('const e=pick(opts);', "const e='ipspace';") + ";__fe()");
// Script the next Math.random calls: which link (a fraction of the eligible list), how many days (the roll), which reason.
const script = (ev, rolls) => ev(`window.__rr=Math.random;window.__q=${JSON.stringify(rolls)};window.__qi=0;Math.random=()=>__q[__qi++%__q.length]`);
const unscript = (ev) => ev('Math.random=window.__rr');
const strike = (ev, rolls) => { script(ev, rolls); try { fire(ev); } finally { unscript(ev); } };
const offered = (ev) => {
  ev('window.__fe=' + ev('fireEvent.toString()').replace(/^function fireEvent/, 'function').replace('const e=pick(opts);', "window.__opts=opts.slice();const e='viral';") + ';__fe()');
  return JSON.parse(ev('JSON.stringify(__opts)')).includes('ipspace');
};

test('revoked address space darkens 7 to 60 days, far more often the short end', () => {
  const { ev, errors } = load();
  assert.equal(ev('ipsDays(0)'), 7, 'the shortest is a week');
  assert.equal(ev('ipsDays(0.99999)'), 60, 'the longest is 60 days');
  const days = JSON.parse(ev('JSON.stringify(Array.from({length:1000},(_,i)=>ipsDays(i/1000)))'));
  assert.ok(days.every((d, i) => d >= 7 && d <= 60 && (i === 0 || d >= days[i - 1])), 'always between 7 and 60, longer for a higher roll');
  assert.ok(days.filter(d => d <= 33).length > 650, 'more than half the outages are under the midpoint of the range');
  assert.ok(days.reduce((a, d) => a + d, 0) / days.length < 30, 'and the average sits well below it');
  assert.equal(ev("incTitle('ipspace')"), 'IP space revoked');
  assert.deepEqual(errors, []);
});

test('Lair-us pulls the /31 under one link, which stays dark for its days and then comes back', () => {
  const { ev, errors } = network();
  const day = ev('S.day');
  strike(ev, [0.5, 0.99999, 0]); // the third link, 60 days, the first reason
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.links.map(l=>linkDown(l)))')), [false, false, true, false, false], 'exactly one link goes');
  assert.equal(ev('S.links[2].cut'), day + 60);
  const inc = "S.inc.find(i=>i.type==='ipspace')";
  assert.equal(ev("S.inc.filter(i=>i.type==='ipspace').length"), 1);
  assert.equal(ev(`${inc}.ref===S.links[2].id`), true, 'it points at the link, so the NOC and the toast can open it');
  assert.equal(ev(`${inc}.until`), day + 60);
  assert.equal(ev(`${inc}.cost`), 0, 'no rush repair: there is no one to bribe');
  assert.equal(typeof ev(`${inc}.impact`), 'number', 'the NOC can say how much traffic it cost');
  assert.match(ev(`${inc}.msg`), /^Lair-us, who leases you .* Frankfurt–Berlin .* Renumbering it takes 60 days\.$/);
  assert.match(ev("document.getElementById('toasts').textContent"), /IP space revoked.*Frankfurt–Berlin/, 'the player is told when it happens');
  for (let d = 0; d < 59; d++) ev('dayTick()');
  assert.equal(ev('linkDown(S.links[2])'), true, 'still dark on day 59');
  ev('dayTick()');
  assert.equal(ev('linkDown(S.links[2])'), false, 'back after 60 days');
  assert.equal(ev("S.inc.some(i=>i.type==='ipspace')"), false, 'and the incident is gone');
  assert.match(ev("document.getElementById('toasts').textContent"), /Resolved/);
  // The shortest outage is a week.
  strike(ev, [0, 0, 0.3]);
  assert.equal(ev("S.inc.find(i=>i.type==='ipspace').until-S.day"), 7);
  for (let d = 0; d < 7; d++) ev('dayTick()');
  assert.equal(ev("S.links.some(l=>linkDown(l))"), false);
  assert.deepEqual(errors, []);
});

test('it is rare: only with a few links to lose, after the first two months, and never two at once', () => {
  const { ev, errors } = network();
  assert.equal(offered(ev), true, 'five links on day 120');
  ev('S.day=60');
  assert.equal(offered(ev), false, 'not in the first two months');
  ev('S.day=120');
  strike(ev, [0.5, 0.5, 0]);
  assert.equal(offered(ev), false, 'not while a link is still being renumbered');
  ev("for(const i of S.inc.slice())clearInc(i);compute()");
  assert.equal(offered(ev), true, 'and again once it is over');
  ev("S.links.splice(2)");
  assert.equal(offered(ev), false, 'not with two links');
  assert.deepEqual(errors, []);
});

test('only waves and lit fibers that carry traffic can be hit', () => {
  const { ev, errors } = network();
  ev("S.links[0].cut=S.day+5;S.links.push({id:'bld',a:'par',b:'ber',kind:'df',km:880,sys:'lite',ch:['zr4'],ready:S.day+30,mo:300,day:S.day,cut:0},{id:'drk',a:'ams',b:'par',kind:'df',km:510,sys:'lite',ch:[],ready:0,mo:300,day:0,cut:0});compute()");
  const ids = JSON.parse(ev("JSON.stringify(ipsLinks().map(l=>l.id))"));
  assert.equal(ids.includes('bld'), false, 'a fiber still being built has no interfaces yet');
  assert.equal(ids.includes('drk'), false, 'an unlit fiber has nothing to renumber');
  assert.equal(ids.includes(ev('S.links[0].id')), false, 'a link that is already down is not hit again');
  assert.equal(ids.length, 4, 'three waves and the lit fiber');
  // With nothing eligible, nothing happens and nothing breaks.
  ev("for(const l of S.links)l.cut=S.day+5;compute()");
  fire(ev);
  assert.equal(ev("S.inc.some(i=>i.type==='ipspace')"), false);
  assert.deepEqual(errors, []);
});

test('another outage ending does not light a link the revocation still holds, and the other way round', () => {
  const { ev, errors } = network();
  const day = ev('S.day');
  strike(ev, [0, 0.99999, 0]);
  assert.equal(ev('S.links[0].cut'), day + 60);
  // A backhoe cut on the same wave, shorter than the revocation: clearing it must leave the link dark.
  ev("S.links[0].cut=Math.max(S.links[0].cut,S.day+10);addInc({type:'cut',ref:S.links[0].trench||S.links[0].id,until:S.day+10,msg:'',cost:0})");
  ev("clearInc(S.inc.find(i=>i.type==='cut'));compute()");
  assert.equal(ev('S.links[0].cut'), day + 60, 'still dark for the revocation');
  assert.equal(ev('linkDown(S.links[0])'), true);
  // And the revocation cleared early hands the link back to the cut that still holds it.
  ev("addInc({type:'cut',ref:S.links[0].trench||S.links[0].id,until:S.day+10,msg:'',cost:0})");
  ev("clearInc(S.inc.find(i=>i.type==='ipspace'));compute()");
  assert.equal(ev('S.links[0].cut'), day + 10, 'the cut still holds it');
  ev("clearInc(S.inc.find(i=>i.type==='cut'));compute()");
  assert.equal(ev('linkDown(S.links[0])'), false);
  assert.deepEqual(errors, []);
});

test('the link panel says why a wave or fiber is dark and when it is back, and the NOC lists it', () => {
  const { ev, errors } = network();
  const panel = () => ev("document.getElementById('panelBody').textContent");
  strike(ev, [0, 0, 0]); // the first wave, a week
  strike(ev, [0.99, 0.5, 0]); // of the four left, the fiber, 20 days
  ev("ACT.selLink({id:S.links[0].id})");
  assert.match(panel(), /Dark!/);
  assert.match(panel(), /Lair-us/);
  assert.match(panel(), /Back in 7 days\./);
  ev("ACT.selLink({id:'dfx'})");
  assert.match(panel(), /Dark!/);
  assert.match(panel(), /Lair-us/);
  assert.match(panel(), /Back in 20 days\./);
  ev("ACT.leftTab({t:'noc'})");
  const noc = ev("document.getElementById('left').textContent");
  assert.match(noc, /IP space revoked/);
  assert.match(noc, /Auto-fix in 7 days/);
  assert.match(noc, /Auto-fix in 20 days/);
  assert.deepEqual(errors, []);
});

test('giving up the dark link takes the incident along', () => {
  const { ev, errors } = network();
  strike(ev, [0, 0.5, 0]);
  assert.equal(ev("S.inc.some(i=>i.type==='ipspace')"), true);
  ev("const l=S.links[0];S.links=S.links.filter(x=>x!==l);purgeInc()");
  assert.equal(ev("S.inc.some(i=>i.type==='ipspace')"), false);
  assert.deepEqual(errors, []);
});

test('saves keep a revocation, old saves load as before, and a dangling one is harmless', () => {
  const g = network();
  strike(g.ev, [0.5, 0.5, 0]);
  g.ev('save()');
  const saved = g.ev("localStorage.getItem('sot-save-v1')");
  const b = load({ storage: { 'sot-save-v1': saved } });
  assert.equal(b.ev("S.inc.filter(i=>i.type==='ipspace').length"), 1, 'the revocation survives a reload');
  assert.equal(b.ev("S.links.filter(l=>linkDown(l)).length"), 1);
  assert.deepEqual(b.errors, []);
  // An old save has none of this.
  const old = JSON.parse(saved);
  old.inc = old.inc.filter(i => i.type !== 'ipspace');
  for (const l of old.links) l.cut = 0;
  const c = load({ storage: { 'sot-save-v1': JSON.stringify(old) } });
  assert.equal(c.ev("S.inc.some(i=>i.type==='ipspace')||S.links.some(l=>linkDown(l))"), false);
  assert.deepEqual(c.errors, []);
  // One pointing at a link that is gone (or at nothing a link could be) does no harm and clears on time.
  const bad = JSON.parse(saved);
  bad.inc = [{ id: 'x1', type: 'ipspace', ref: 'nope', until: bad.day + 3, cost: 0, msg: 'a' }, { id: 'x2', type: 'ipspace', ref: { a: 1 }, until: bad.day + 3, cost: 0, msg: 'b' }, { id: 'x3', type: 'ipspace', until: bad.day + 3, cost: 0, msg: 'c' }];
  for (const l of bad.links) l.cut = 0;
  const d = load({ storage: { 'sot-save-v1': JSON.stringify(bad) } });
  d.ev("ACT.leftTab({t:'noc'});S.nextFail=1e9;S.nextEvent=1e9");
  for (let i = 0; i < 4; i++) d.ev('dayTick()');
  assert.equal(d.ev("S.inc.some(i=>i.type==='ipspace')"), false);
  assert.deepEqual(d.errors, []);
});

test('the revocation reads right in every language', () => {
  for (const lang of ['it', 'pt', 'fr', 'es', 'de']) {
    const { ev, errors } = network({ lang });
    for (let r = 0; r < 4; r++) { // every reason
      ev("for(const i of S.inc.slice())clearInc(i);for(const l of S.links)l.cut=0;compute()");
      strike(ev, [0.5, 0.5, r / 4]);
      const msg = ev("S.inc.find(i=>i.type==='ipspace').msg");
      assert.match(msg, /Lair-us/, lang);
      assert.match(msg, /Frankfurt/, `${lang}: names the link`);
      assert.match(msg, /\b(?:19|20|21|22) /, `${lang}: says how many days`);
      assert.ok(msg.length < 400, `${lang}: the message fits the 400 characters a save keeps`);
      assert.doesNotMatch(msg, /\{[a-z]+\}/, `${lang}: every placeholder is filled`);
    }
    assert.notEqual(ev("incTitle('ipspace')"), 'IP space revoked', `${lang} has its own title`);
    ev("ACT.selLink({id:S.links.find(l=>linkDown(l)).id})");
    assert.match(ev("document.getElementById('panelBody').textContent"), /Lair-us/, lang);
    assert.deepEqual(errors, [], lang);
  }
});
