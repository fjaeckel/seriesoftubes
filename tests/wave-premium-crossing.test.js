// A wave across the China border keeps whether it was bought as a premium crossing: its panel says which crossing
// it is and how much it loses there, and the city panel tags premium ones, so the choice is visible after buying.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;";
const panel = ev => ev("document.getElementById('panel').textContent");
const pop = c => `S.pops.${c}={day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:3};`;

test('a premium crossing bought in the link modal shows in the wave and city panels', () => {
  const { ev, errors } = load();
  ev(start + "" + pop('hkg') + pop('sha') + 'compute()');
  ev("S.cnLic={state:'ok'};openLinkModal('hkg','sha');UI.cnPrem=true;ACT.buildLink({tier:0})");
  const id = ev("(S.links.find(l=>l.a!==l.b&&[l.a,l.b].sort().join()==='hkg,sha')||{}).id");
  assert.ok(id, 'the wave was bought');
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').premium`), true);
  ev(`selectLink('${id}')`);
  assert.match(panel(ev), /China border crossing/);
  assert.match(panel(ev), /Premium · ~3% loss/);
  ev("UI.tab='links';selectCity('hkg')");
  assert.match(panel(ev), /Shanghai[^→]* premium 10G/);
  assert.deepEqual(errors, []);
});

test('a regular crossing says so, with the loss of a stricter border, and other waves say nothing', () => {
  const { ev, errors } = load();
  ev(start + "" + pop('hkg') + pop('sha') + pop('sin') + 'compute()');
  ev("S.links.push({id:'r1',a:'hkg',b:'sha',kind:'wave',border:true,premium:false,tier:0,km:1200,sub:false,mo:1,mult:3,cut:0,day:0})");
  ev("S.links.push({id:'n1',a:'hkg',b:'sin',kind:'wave',border:false,premium:false,tier:0,km:2600,sub:true,mo:1,mult:1,cut:0,day:0});compute()");
  ev("selectLink('r1')");
  assert.match(panel(ev), /Regular · ~20% loss/);
  ev("S.ev.gfw=S.day+10;selectLink('r1')");
  assert.match(panel(ev), /Regular · ~35% loss/);
  ev("selectLink('n1')");
  assert.doesNotMatch(panel(ev), /China border crossing/);
  ev("UI.tab='links';selectCity('hkg')");
  assert.doesNotMatch(panel(ev), /premium/);
  // On a phone the wave panel is a bottom sheet with the same row.
  ev("window.innerWidth=390;selectLink('r1')");
  assert.match(panel(ev), /China border crossing/);
  assert.deepEqual(errors, []);
});

test('the Redundancy section tags a premium wave among the other links, as the city panel does', () => {
  const { ev, errors } = load();
  ev(start + pop('hkg') + pop('sha') + 'compute()');
  ev("S.links.push({id:'p1',a:'hkg',b:'sha',kind:'wave',border:true,premium:true,tier:0,km:1227,sub:false,mo:1,mult:4.8,trench:'p1',cut:0,day:0})");
  ev("S.links.push({id:'r1',a:'hkg',b:'sha',kind:'wave',border:true,premium:false,tier:0,km:1300,sub:false,mo:1,mult:3,trench:'r1',cut:0,day:0})");
  ev("S.links.push({id:'d1',a:'hkg',b:'sha',kind:'df',own:false,sys:'lite',ch:[],km:1300,sub:false,mo:1,trench:'d1',cut:0,day:0,ready:0})");
  const red = id => ev(`selectLink('${id}');[...document.querySelectorAll('#panel section')].find(s=>/Redundancy/.test(s.querySelector('h3').textContent)).innerHTML`);
  // From the regular wave: the premium one is tagged, the dark fiber is not.
  let h = red('r1');
  assert.match(h, /10G parallel link <span class="tag paid">premium<\/span>/);
  assert.equal((h.match(/tag paid/g) || []).length, 1, 'only the premium wave is tagged');
  // From the dark fiber's panel too.
  h = red('d1');
  assert.equal((h.match(/tag paid">premium/g) || []).length, 1);
  // From the premium wave itself: its siblings are not premium, so no tag.
  assert.doesNotMatch(red('p1'), /tag paid/);
  // The phone bottom sheet shows the same.
  ev('window.innerWidth=390');
  assert.match(red('r1'), /tag paid">premium/);
  assert.deepEqual(errors, []);
});
