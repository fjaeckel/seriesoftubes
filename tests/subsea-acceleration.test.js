const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Hurrying anything at sea takes a cable ship: a charter for a build, a place in the repair queue for a cut. Both cost
// millions, while the same hurry on land stays cheap.
const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.day=200;for(const g of GOALS)S.done[g.id]=0;";

test('more crews on a subsea build means chartering a cable ship, for millions', () => {
  const { ev, dom, errors } = load();
  ev(start + "S.links=[{id:'sea',a:'lag',b:'bde',kind:'df',own:true,sub:true,sys:'roadm',km:6000,ch:[],day:200,ready:800,cut:0,mo:1},"
    + "{id:'land',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',km:400,ch:[],day:200,ready:500,cut:0,mo:1}]");
  assert.equal(ev("crewCost(S.links[0])"), 3000000 + 6000 * 500, 'mobilising a ship plus its time at sea');
  assert.ok(ev("crewCost(S.links[1])") < 50000, 'land crews stay cheap');
  const cash = ev('S.cash');
  ev("ACT.crews({id:'sea'})");
  assert.equal(cash - ev('S.cash'), 6000000);
  assert.equal(ev('S.links[0].ready'), 770);
  assert.match(dom.window.document.body.innerHTML, /Another cable ship joins the lay/);
  ev("UI.sel={type:'link',id:'sea'};renderPanel()");
  const panel = () => dom.window.document.querySelector('#panelBody').textContent;
  assert.match(panel(), /Charter another cable ship/);
  assert.match(panel(), /Only a few dozen cable ships exist/);
  assert.doesNotMatch(panel(), /Hire extra crews/);
  ev("UI.sel={type:'link',id:'land'};renderPanel()");
  assert.match(panel(), /Hire extra crews/);
  assert.doesNotMatch(panel(), /cable ship/);
  // The whole lay in one go is the charter times every 30 days left.
  ev("S.cash=1e9;UI.sel={type:'link',id:'sea'};renderPanel()");
  assert.equal(ev("crewSteps(S.links[0])*crewCost(S.links[0])"), 19 * 6000000);
  assert.deepEqual(errors, []);
});

test('a rush repair on a subsea cut, even on a leased wave, costs a cable ship, a trench cut stays cheap', () => {
  const { ev, errors } = load();
  ev(start + "S.links=[{id:'sea',a:'lag',b:'bde',kind:'wave',sub:true,tier:0,km:6000,cut:0,mo:1000}];S.inc=[];fireFailure('cut')");
  const sea = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='cut'))"));
  assert.equal(sea.cost, 1000000 + 6000 * 200);
  assert.equal(sea.fix, 'Jump the cable-ship queue');
  ev("S.links=[{id:'land',a:'fra',b:'ams',kind:'wave',tier:0,km:400,cut:0,mo:1000}];S.inc=[];fireFailure('cut')");
  const land = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='cut'))"));
  assert.equal(land.cost, 4000);
  assert.equal(land.fix, undefined);
  // Paying it brings the cable back at once, like any rush repair.
  ev("S.links=[{id:'sea',a:'lag',b:'bde',kind:'wave',sub:true,tier:0,km:6000,cut:0,mo:1000}];S.inc=[];fireFailure('cut')");
  const id = ev("S.inc.find(i=>i.type==='cut').id"), cash = ev('S.cash');
  ev(`ACT.fixInc({id:'${id}'})`);
  assert.equal(cash - ev('S.cash'), 2200000);
  assert.equal(ev("linkDown(S.links[0])"), false);
  assert.deepEqual(errors, []);
});

test('the chaos monkey snipping a subsea cable prices the rush the same way', () => {
  const { ev, errors } = load();
  ev(start + "S.links=[{id:'sea',a:'lag',b:'bde',kind:'wave',sub:true,tier:0,km:3000,cut:0,mo:1000}];S.inc=[];"
    + "S.monkey={n:0,hurt:0,until:S.day+100};mkSnip()");
  const i = JSON.parse(ev("JSON.stringify(S.inc.find(i=>i.type==='cut'))"));
  assert.equal(i.cost, 1000000 + 3000 * 200);
  assert.deepEqual(errors, []);
});
