const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// #198: submarine upgrades that change nothing on a cable can't be bought.
function cable(ev, km) {
  ev(`ACT.start({});S.cash=1e11;S.lvl=13;S.day=100;S.won=true;for(const g of GOALS)S.done[g.id]=0;
    S.links=[{id:'c',a:'atn',b:'syd',kind:'df',own:true,sub:true,sys:'roadm',km:${km},ch:['tp16'],day:0,ready:50,cut:0,mo:1}];
    UI.sel={type:'link',id:'c'};renderPanel()`);
}
const installBtn = (dom, k) => dom.window.document.querySelector(`#panelBody [data-act=subUpgrade][data-args*="${k}"]`);

test('#198 upgrades that do nothing on a long Pacific cable are disabled and refused', () => {
  const { ev, dom, errors } = load();
  try {
    cable(ev, 17500); // about Atlanta to Sydney: 400G per channel with or without upgrades
    for (const k of ['terminal', 'engineering']) {
      assert.equal(installBtn(dom, k).disabled, true, `${k} button disabled`);
      const cash = ev('S.cash');
      ev(`ACT.subUpgrade({id:'c',k:'${k}'})`);
      assert.equal(ev('S.cash'), cash, `${k}: no charge`);
      assert.equal(ev(`S.links[0].sub${k}`), undefined, `${k}: not installed`);
    }
    assert.match(dom.window.document.getElementById('panelBody').textContent, /Makes no difference on this cable/);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('#198 upgrades that only help together stay buyable, and one made useless by the other is not', () => {
  const { ev, dom, errors } = load();
  try {
    cable(ev, 15000); // each alone: 400G, both: 800G
    assert.equal(installBtn(dom, 'terminal').disabled, false);
    assert.equal(installBtn(dom, 'engineering').disabled, false);
    ev("ACT.subUpgrade({id:'c',k:'terminal'})");
    assert.ok(ev('S.links[0].subterminal') > 0, 'terminal bought');
    ev('renderPanel()');
    assert.equal(installBtn(dom, 'engineering').disabled, false, 'engineering finishes the job');
    ev("ACT.subUpgrade({id:'c',k:'engineering'})");
    assert.ok(ev('S.links[0].subengineering') > 0, 'engineering bought');

    cable(ev, 20000); // terminal lights it; engineering adds nothing once terminal is in
    ev("ACT.subUpgrade({id:'c',k:'terminal'});renderPanel()");
    assert.ok(ev('S.links[0].subterminal') > 0);
    assert.equal(installBtn(dom, 'engineering').disabled, true);
    ev("ACT.subUpgrade({id:'c',k:'engineering'})");
    assert.equal(ev('S.links[0].subengineering'), undefined);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('#198 ordering a cable: useless upgrades can not be picked, and stale picks are not charged', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e11;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'lon'});ACT.buildPop({city:'nyc'});UI.lmode='df';UI.dfSrc='cable';UI.seaDesign='standard';openLinkModal('lon','nyc')");
    // A transatlantic cable already runs every optic at its long-haul best.
    const btn = k => dom.window.document.querySelector(`#modalCard [data-act=seaPackage][data-args*="${k}"]`);
    assert.equal(btn('terminal').disabled, true);
    assert.equal(btn('engineering').disabled, true);
    ev("ACT.seaPackage({k:'terminal'})");
    assert.equal(ev('!!UI.seaterminal'), false, 'refused');
    // Picks left over from a longer route (or a different design) neither show as picked nor get charged.
    ev("UI.seaterminal=true;UI.seaengineering=true;ACT.seaDesign({v:'standard'})");
    assert.equal(btn('terminal').textContent.includes('✓'), false);
    assert.equal(btn('engineering').textContent.includes('✓'), false);
    const cash = ev('S.cash'), cost = ev("seaQuote('lon','nyc','standard').cost");
    ev('ACT.orderCable()');
    assert.equal(cash - ev('S.cash'), cost, 'no upgrade charged');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('#198 ordering a transpacific cable: both upgrades help together, and the redundant one of a pair drops out', () => {
  const { ev, dom, errors } = load();
  try {
    ev("ACT.start({});S.cash=1e11;S.lvl=13;S.won=true;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'sin'});ACT.buildPop({city:'lax'});UI.lmode='df';UI.dfSrc='cable';ACT.ownCab();UI.pending={a:'sin',b:'lax'};openLinkModal('sin','lax')");
    const km = ev("seaQuote('sin','lax','standard').km");
    assert.ok(km > 14000 && km < 17000, 'a route where only both upgrades together beat 400G');
    ev("ACT.seaPackage({k:'terminal'});ACT.seaPackage({k:'engineering'})");
    assert.equal(ev('!!UI.seaterminal&&!!UI.seaengineering'), true, 'both picked');
    assert.equal(ev("JSON.stringify(seaUps(seaQuote('sin','lax','standard').km))"), '{"terminal":true,"engineering":true}');
    // At 20,000 km either one alone lights the cable, so a pair keeps only the cheaper terminals.
    assert.equal(ev("JSON.stringify(seaUps(20000))"), '{"terminal":true,"engineering":false}');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
