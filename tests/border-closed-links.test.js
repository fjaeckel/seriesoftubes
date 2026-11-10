// #329: a link a political event takes down (the Gulf spat, Russia's sovereign internet drill) is drawn broken on
// the map, so its panel must say why and for how long, and the link modal must warn before you lease one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;";
const panel = ev => ev("document.getElementById('panel').textContent");

test('#329 a link down for the Gulf spat says so in its panel, with the days left', () => {
  const { ev, errors } = load();
  ev(start + "ACT.launchBB({city:'doh'});S.pops.auh={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:3};compute()");
  ev("S.links.push({id:'w1',a:'doh',b:'auh',kind:'wave',tier:0,km:300,sub:false,mo:1,cut:0,day:0})");
  const id = 'w1';
  ev('S.ev.gulf=S.day+40;compute()');
  assert.equal(ev(`linkDown(S.links.find(l=>l.id==='${id}'))`), true, 'the spat takes it down');
  ev(`selectLink('${id}')`);
  assert.match(panel(ev), /Border closed/);
  assert.match(panel(ev), /Qatar/);
  assert.match(panel(ev), /Back in 40 days/);
  // Leasing another one now warns that it stays dark.
  ev("openLinkModal('doh','auh')");
  assert.match(ev("document.getElementById('modalCard').textContent"), /stay dark/);
  assert.match(ev("dfModalBody('doh','auh',300,0)"), /stay dark/, 'dark fiber warns too');
  // On a phone the panel is a bottom sheet with the same note.
  ev(`closeModal();window.innerWidth=390;selectLink('${id}')`);
  assert.match(panel(ev), /Border closed/);
  ev('window.innerWidth=1280');
  // After the spat, nothing about it.
  ev('S.ev.gulf=0;compute();closeModal()');
  ev(`selectLink('${id}')`);
  assert.doesNotMatch(panel(ev), /Border closed/);
  ev("openLinkModal('doh','auh')");
  assert.doesNotMatch(ev("document.getElementById('modalCard').textContent"), /stay dark/);
  assert.deepEqual(errors, []);
});

test('#329 dark fiber and virtual circuits into Qatar explain the spat too, and Russia\'s drill is named', () => {
  const { ev, errors } = load();
  ev(start + "ACT.launchBB({city:'doh'});S.pops.auh={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:3};compute()");
  ev("S.links.push({id:'dfx',a:'doh',b:'auh',kind:'df',own:false,sys:'lite',ch:[],km:300,sub:false,mo:1,ready:0,cut:0,day:0});S.ev.gulf=S.day+10");
  ev("selectLink('dfx')");
  assert.match(panel(ev), /Border closed/);
  ev("S.links.push({id:'vx1',a:'doh',b:'auh',kind:'vxc',prov:Object.keys(FAB)[0],vt:0,km:300,sub:false,mo:1,cut:0,day:0})");
  ev("selectLink('vx1')");
  assert.match(panel(ev), /Border closed/);
  assert.match(panel(ev), /Qatar/);
  ev("S.links.push({id:'ru1',a:'mos',b:'hel',kind:'wave',tier:0,km:900,sub:false,mo:1,cut:0,day:0});S.ev.gulf=0;S.ev.runet=S.day+1");
  ev("selectLink('ru1')");
  assert.match(panel(ev), /Border closed/);
  assert.match(panel(ev), /Russia/);
  assert.deepEqual(errors, []);
});
