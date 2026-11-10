// #196: the two city names at the top of a link panel (wave, dark fiber, virtual circuit) open that city's panel.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;";
const ends = ev => JSON.parse(ev("JSON.stringify([...document.querySelectorAll('#panel .ph h2 button[data-act=\"popGo\"]')].map(b=>[b.textContent,JSON.parse(b.dataset.args).city]))"));
const click = (ev, i) => ev(`document.querySelectorAll('#panel .ph h2 button[data-act="popGo"]')[${i}].click()`);

function setup(ev) {
  ev(start + "ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});compute()");
  ev("S.links.push({id:'w1',a:'fra',b:'ams',kind:'wave',tier:0,km:360,sub:false,mo:1,cut:0,day:0})");
  ev("S.links.push({id:'df1',a:'fra',b:'ams',kind:'df',own:false,sys:'lite',ch:[],km:360,sub:false,mo:1,ready:0,cut:0,day:0})");
  ev("S.links.push({id:'vx1',a:'fra',b:'ams',kind:'vxc',prov:Object.keys(FAB)[0],vt:0,km:360,sub:false,mo:1,cut:0,day:0});compute()");
}

for (const [id, kind] of [['w1', 'wave'], ['df1', 'dark fiber'], ['vx1', 'virtual circuit']]) {
  test(`#196 a ${kind} panel links both of its cities, and a click opens the city`, () => {
    const { ev, errors } = load();
    setup(ev);
    ev(`selectLink('${id}')`);
    assert.deepEqual(ends(ev), [['Frankfurt', 'fra'], ['Amsterdam', 'ams']]);
    assert.match(ev("document.querySelector('#panel .ph h2').textContent"), /Frankfurt ⇄ Amsterdam/);
    click(ev, 1);
    assert.equal(ev("UI.sel.type+':'+UI.sel.id"), 'city:ams', 'the far end is selected');
    assert.equal(ev("cam.x"), ev("CITY.ams.x"), 'and the map moves to it');
    assert.match(ev("document.querySelector('#panel .ph h2').textContent"), /Amsterdam/);
    ev(`selectLink('${id}')`);
    click(ev, 0);
    assert.equal(ev("UI.sel.id"), 'fra');
    assert.deepEqual(errors, []);
  });
}

test('#196 on a 390 px phone the city links sit in the bottom sheet header and still open the city', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("window.innerWidth=390;renderAll();selectLink('w1')");
  assert.equal(ev("isPhone()"), true);
  assert.equal(ends(ev).length, 2);
  // The link styling: reads as heading text that wraps, not a button that pushes the header wider.
  assert.match(ev("document.querySelector('#panel .ph h2 button').className"), /\bclink\b/);
  click(ev, 0);
  assert.equal(ev("UI.sel.type+':'+UI.sel.id"), 'city:fra');
  assert.deepEqual(errors, []);
});

test('#196 a city the map does not show stays plain text', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("selectLink('w1')");
  // cityOn() is false for an off-map city without a POP or IX port: no button to a panel that would not open.
  ev("CITY.ams.off=true;delete S.pops.ams;renderPanel()");
  assert.deepEqual(ends(ev), [['Frankfurt', 'fra']]);
  assert.match(ev("document.querySelector('#panel .ph h2').textContent"), /Frankfurt ⇄ Amsterdam/);
  ev("delete CITY.ams.off");
  assert.deepEqual(errors, []);
});
