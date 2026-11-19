const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = ev => ev("beginGame('Autarky','fra',{mode:'normal',preset:'oncall',rules:{mods:['autarky']}});if(UI.pendGame)ACT.pitchSkip()");

test('Autarky blocks leased waves and IRUs while allowing owned land-fiber builds', () => {
  const { ev, dom, errors } = load();
  start(ev);
  ev("S.cash=1e12;S.lvl=LEVELS.length;ACT.buildPop({city:'ams'});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:0})");
  assert.equal(ev("S.links.some(l=>l.kind==='wave')"), false, 'a direct action cannot lease a wave');

  ev("openLinkModal('fra','ams')");
  const doc = dom.window.document;
  assert.equal(doc.querySelector('#modal [data-act="dfMode"][data-args*=\"wave\"]'), null, 'the modal has no wave tab');
  assert.equal(doc.querySelector('#modal [data-act="buildLink"]'), null, 'the modal has no leased-wave tiers');
  assert.equal(doc.querySelector('#modal [data-act="dfSrc"][data-args*=\"lease\"]'), null, 'the modal has no IRU option');

  ev("UI.dfSrc='lease';ACT.orderDf()");
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&!l.own)"), false, 'a direct action cannot buy an IRU');
  ev("UI.dfSrc='build';ACT.orderDf()");
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&l.own&&!l.seat)"), true, 'owned land fiber can still be built');

  ev("S.links.push({id:'old-wave',a:'fra',b:'ams',kind:'wave',tier:0,km:450,mo:1,mult:1,cable:null,sub:false});ACT.upLink({id:'old-wave',tier:1})");
  assert.equal(ev("S.links.find(l=>l.id==='old-wave').tier"), 0, 'a direct action cannot upgrade a leased wave');
  assert.equal(ev("opsCtl('waveup')"), false, 'the optical team cannot be configured to grow leased waves');
  assert.deepEqual(errors, []);
});

test('Autarky still allows owned subsea cables and consortium seats', () => {
  const { ev, errors } = load();
  start(ev);
  ev("S.cash=1e12;S.lvl=LEVELS.length;S.won=true;ACT.buildPop({city:'mrs'});UI.pending={a:'mrs',b:'nbo'};UI.seaDesign='standard';ACT.orderCable()");
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&l.own&&l.sub&&!l.seat)"), true, 'an owned subsea cable can still be laid');
  ev("S.lvl=2;seatConf('lon')");
  assert.ok(ev('S.seatOff'), 'the capacity conference can still offer a consortium seat');
  ev('ACT.seatBuy({n:1})');
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&l.seat)"), true, 'a consortium seat remains available');
  assert.deepEqual(errors, []);
});

test('Autarky hides a remembered Multimode choice and starts solo', () => {
  const { ev, dom, errors } = load();
  ev("FU.can=true;UI.mode='normal';UI.mods=[];UI.fs={on:true,url:'wss://s1.seriesoftub.es/fed',typed:'',inv:null,note:null};showTitle()");
  const doc = dom.window.document;
  assert.ok(doc.querySelector('#fsTog'), 'Multimode is shown before enabling a challenge mode');
  doc.querySelector('.add-options summary').click();
  doc.querySelector('[data-mode-id=autarky]').click();
  assert.equal(doc.querySelector('#fsTog'), null, 'Autarky hides the Multimode switch');
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(ev('S.fed'), null, 'a challenge-mode game starts without Multimode');
  assert.equal(ev('fedEligible(S)'), false);
  assert.deepEqual(errors, []);
});