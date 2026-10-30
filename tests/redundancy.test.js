const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function base(ev) {
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
}

test('redundant links can be reviewed and decommissioned safely in bulk', () => {
  const { ev, dom, errors } = load();
  base(ev);
  const doc = dom.window.document;

  // Build second POP in Amsterdam and create 3 parallel links between Frankfurt and Amsterdam
  ev("ACT.buildPop({city:'ams'})");
  ev("S.links.push(" +
    "{id:'l1',a:'fra',b:'ams',kind:'wave',tier:3,km:360,mo:15000,sub:false,trench:'tr1',cut:0,day:0}," +
    "{id:'l2',a:'fra',b:'ams',kind:'wave',tier:3,km:360,mo:15000,sub:false,trench:'tr1',cut:0,day:0}," +
    "{id:'l3',a:'fra',b:'ams',kind:'wave',tier:5,km:360,mo:45000,sub:false,trench:'tr2',cut:0,day:0}" +
  ");compute();renderAll()");

  // Open link panel for l1
  ev("UI.sel={type:'link',id:'l1'};renderPanel()");
  const panel = doc.getElementById('panelBody').textContent;
  assert.match(panel, /Manage redundancy/);

  // Open redundancy modal
  ev("ACT.redundOpen({a:'fra',b:'ams'})");
  const modal = () => doc.getElementById('modalCard').textContent;
  assert.match(modal(), /Redundant links: Frankfurt ⇄ Amsterdam/);
  assert.match(modal(), /3 links/);

  // Quick select idle & standby links: l1 and l2 are idle, l3 has highest capacity so it stays active
  ev("ACT.redundSelectIdle()");
  assert.equal(ev("UI.redund.sel.size"), 2);
  assert.equal(ev("UI.redund.sel.has('l1')"), true);
  assert.equal(ev("UI.redund.sel.has('l2')"), true);
  assert.equal(ev("UI.redund.sel.has('l3')"), false, 'keeps best link unselected');

  // Verify monthly savings displayed
  assert.match(modal(), /-\$30\.0k\/mo/);
  assert.match(modal(), /Remaining capacity .* is sufficient/);

  // Test Select All / Deselect All functionality
  ev("ACT.redundSelectAll()");
  assert.equal(ev("UI.redund.sel.size"), 3, 'selects all 3 links');
  assert.match(modal(), /Deselect all/);

  ev("ACT.redundSelectAll()");
  assert.equal(ev("UI.redund.sel.size"), 0, 'deselects all links');
  assert.match(modal(), /Select all/);

  // Verify scroll position is preserved across toggles
  const listEl = doc.getElementById('redundList');
  assert.ok(listEl, 'redundList scroll container exists');
  listEl.scrollTop = 120;
  ev("ACT.redundToggle({id:'l1'})");
  assert.equal(doc.getElementById('redundList').scrollTop, 120, 'scroll position maintained after toggle');

  // Safety rule 3: customer committed link cannot be selected
  ev("S.biz.push({id:'biz1',city:'fra',city2:'ams',type:'wwave',name:'Big Corp Wave',link:'l1',rate:20000,bw:100,mood:100});ACT.redundOpen({a:'fra',b:'ams'})");
  const leasedInput = doc.querySelector('input[data-args*="l1"]');
  assert.equal(leasedInput.disabled, true, 'leased link checkbox is disabled');

  // Clear customer and execute safe bulk removal of l1 and l2
  ev("S.biz=[];ACT.redundOpen({a:'fra',b:'ams'});ACT.redundSelectIdle();ACT.redundGo()");
  let remaining = JSON.parse(ev("JSON.stringify(pairLinks('fra','ams'))"));
  assert.equal(remaining.length, 1, 'only l3 remains');
  assert.equal(remaining[0].id, 'l3');

  // Verify single remaining link still shows Manage redundancy in linkPanel
  ev("UI.sel={type:'link',id:'l3'};renderPanel()");
  const pSingle = doc.getElementById('panelBody').textContent;
  assert.match(pSingle, /Manage redundancy/);

  // Test total disconnection with confirmation ("Are you sure?") directly on single link
  ev("ACT.redundOpen({a:'fra',b:'ams'});ACT.redundSelectAll()");
  assert.equal(ev("UI.redund.sel.size"), 1, 'remaining link selected');
  assert.match(modal(), /Removing all links will disconnect these cities/);

  // First click on redundGo asks for confirmation
  ev("ACT.redundGo()");
  assert.equal(ev("UI.redund.confirm"), true, 'confirm state activated');
  assert.match(modal(), /Are you sure\?/);
  assert.equal(ev("pairLinks('fra','ams').length"), 1, 'link not removed yet');

  // Second click confirms and disconnects the cities completely
  ev("ACT.redundGo()");
  assert.equal(ev("pairLinks('fra','ams').length"), 0, 'all links removed upon confirmation');

  assert.deepEqual(errors, []);
});

test('redundancy manager warns if remaining capacity is insufficient or breaks diverse paths', () => {
  const { ev, dom, errors } = load();
  base(ev);
  const doc = dom.window.document;

  ev("ACT.buildPop({city:'ams'});ACT.buildPop({city:'par'})");
  // Two diverse paths between fra and ams: direct and via par
  ev("S.links.push(" +
    "{id:'d1',a:'fra',b:'ams',kind:'wave',tier:3,km:360,mo:10000,sub:false,trench:'trA',cut:0,day:0}," +
    "{id:'d2',a:'fra',b:'ams',kind:'wave',tier:1,km:360,mo:5000,sub:false,trench:'trB',cut:0,day:0}" +
  ");compute();renderAll()");

  // Customer requiring diverse paths
  ev("S.biz.push({id:'div_cust',name:'Diverse Bank',city:'fra',city2:'ams',type:'l2vpn',reqs:['diverse'],bw:50,rate:100,mood:100})");
  ev("compute()");

  // Open redundancy modal
  ev("ACT.redundOpen({a:'fra',b:'ams'})");
  ev("ACT.redundToggle({id:'d2'})");
  const modal = () => doc.getElementById('modalCard').textContent;
  assert.match(modal(), /Breaks diverse path requirement for Diverse Bank/);

  // Simulate heavy traffic overload warning
  ev("R.load.d1=900;R.load.d2=900;ACT.redundOpen({a:'fra',b:'ams'});ACT.redundToggle({id:'d1'})");
  assert.match(modal(), /Traffic .* exceeds remaining capacity/);

  assert.deepEqual(errors, []);
});
