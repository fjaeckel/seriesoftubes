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

test('Autarky allows buying NNI ports but blocks virtual circuits over them', () => {
  const { ev, errors } = load();
  start(ev);
  ev("S.cash=1e12;S.lvl=LEVELS.length;ACT.buildPop({city:'ams'})");
  const fab = ev("FABS.find(f=>f.cities.includes('fra')&&f.cities.includes('ams')).id");
  ev(`ACT.buyNni({city:'fra',prov:'${fab}',tier:0});ACT.buyNni({city:'ams',prov:'${fab}',tier:0})`);
  assert.equal(ev(`S.nni.filter(p=>p.prov==='${fab}').length`), 2, 'NNI ports remain purchasable');
  ev("UI.tab='links'");
  assert.doesNotMatch(ev("cityPanel('fra')"), /data-act="openVxc"/, 'the city panel hides circuit creation');
  assert.match(ev("cityPanel('fra')"), /Autarky mode does not allow virtual circuits over fabric ports/);
  ev(`ACT.openVxc({from:'fra',prov:'${fab}'});ACT.buyVxc({a:'fra',b:'ams',prov:'${fab}',t:0})`);
  assert.equal(ev("S.links.some(l=>l.kind==='vxc')"), false, 'a direct action cannot create a fabric circuit');
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

test('Autarky lets a land route switch to an own subsea cable and back', () => {
  const { ev, dom, errors } = load();
  start(ev);
  ev("S.cash=1e12;S.lvl=LEVELS.length;S.won=true;ACT.buildPop({city:'mia'})");
  assert.equal(ev("!isSub('mia','pan')&&seaCab('mia','pan')&&!ownCabWhy('mia','pan')"), true, 'Miami to Panama is land with a cable option');
  ev("openLinkModal('mia','pan');ACT.ownCab()");
  const doc = dom.window.document;
  assert.ok(doc.querySelector('#modal [data-act="orderCable"]'), 'the own-cable quote opens');
  assert.equal(doc.querySelector('#modal [data-act="dfSrc"][data-args*="lease"]'), null, 'Back does not offer an IRU');
  ev("ACT.dfSrc({v:'build'})");
  assert.equal(doc.querySelector('#modal [data-act="orderCable"]'), null, 'Back returns to digging');
  ev("ACT.ownCab();ACT.orderCable()");
  assert.equal(ev("S.links.some(l=>l.kind==='df'&&l.own&&l.sub&&l.a==='mia')"), true, 'the cable is laid');
  assert.deepEqual(errors, []);
});
