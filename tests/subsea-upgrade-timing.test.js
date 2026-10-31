const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev) {
  ev(`ACT.start({});S.cash=1e11;S.lvl=13;S.day=100;for(const g of GOALS)S.done[g.id]=0;
    S.links=[{id:'cable',a:'lag',b:'bde',kind:'df',own:true,sub:true,sys:'roadm',km:15000,ch:[],day:100,ready:1000,cut:0,mo:1}];`);
}

function dates(ev) {
  return JSON.parse(ev('JSON.stringify([S.links[0].ready,S.links[0].subterminal,S.links[0].subengineering])'));
}

test('upgrades queued during construction follow crews and keep their 30/180-day commissioning time', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev);
    ev("ACT.subUpgrade({id:'cable',k:'terminal'});ACT.subUpgrade({id:'cable',k:'engineering'})");
    assert.deepEqual(dates(ev), [1000, 1030, 1180]);
    const paid = ev('S.links[0].paid');
    ev("ACT.crews({id:'cable'})");
    assert.deepEqual(dates(ev), [970, 1000, 1150]);
    ev("for(let i=0;i<29;i++)ACT.crews({id:'cable'})");
    assert.deepEqual(dates(ev), [101, 131, 281], 'last crew purchase shifts dates by 29 days, not 30');
    const cash = ev('S.cash');
    ev("ACT.crews({id:'cable'})");
    assert.equal(ev('S.cash'), cash, 'one day remaining: crews cannot charge for saving zero days');
    assert.deepEqual(dates(ev), [101, 131, 281], 'commissioning cannot be rushed further through the cable');
    ev("UI.sel={type:'link',id:'cable'};renderPanel()");
    assert.equal(dom.window.document.querySelector('#panelBody [data-act=crews]').disabled, true);
    assert.equal(ev('S.links[0].paid'), paid, 'no second upgrade charge');
    ev('S=migrate(JSON.parse(JSON.stringify(S)))');
    assert.deepEqual(dates(ev), [101, 131, 281], 'save round trip preserves commissioning windows');
    ev('S.day=130');assert.equal(ev("subUpgradeReady(S.links[0],'terminal')"), false);
    ev('S.day=131');assert.equal(ev("subUpgradeReady(S.links[0],'terminal')"), true);
    ev('S.day=280');assert.equal(ev("subUpgradeReady(S.links[0],'engineering')"), false);
    ev('S.day=281');assert.equal(ev("subUpgradeReady(S.links[0],'engineering')"), true);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('ordering upgrades early is as fast as ordering after rushing the cable', () => {
  const { ev, dom } = load();
  try {
    setup(ev);
    ev("ACT.subUpgrade({id:'cable',k:'terminal'});ACT.subUpgrade({id:'cable',k:'engineering'});for(let i=0;i<30;i++)ACT.crews({id:'cable'})");
    const early = dates(ev);
    setup(ev);
    ev("for(let i=0;i<30;i++)ACT.crews({id:'cable'});S.day=101;ACT.subUpgrade({id:'cable',k:'terminal'});ACT.subUpgrade({id:'cable',k:'engineering'})");
    assert.deepEqual(dates(ev), early);
  } finally { dom.window.close(); }
});

test('packages included in the original order stay aligned with its accelerated finish', () => {
  const { ev, dom } = load();
  try {
    setup(ev);
    ev("S.won=true;UI.pending={a:'sin',b:'lax'};UI.seaterminal=UI.seaengineering=true;ACT.orderCable();S.links=[S.links.at(-1)]");
    assert.equal(ev('S.links[0].subterminal'), ev('S.links[0].ready'));
    assert.equal(ev('S.links[0].subengineering'), ev('S.links[0].ready'));
    ev("ACT.crews({id:S.links[0].id})");
    assert.equal(ev('S.links[0].subterminal'), ev('S.links[0].ready'));
    assert.equal(ev('S.links[0].subengineering'), ev('S.links[0].ready'));
    ev('S=migrate(JSON.parse(JSON.stringify(S)))');
    assert.equal(ev('S.links[0].subengineering'), ev('S.links[0].ready'));
  } finally { dom.window.close(); }
});

test('construction delays move pending commissioning dates without reinstalling completed equipment', () => {
  const { ev, dom } = load();
  try {
    setup(ev);
    ev(`ACT.subUpgrade({id:'cable',k:'engineering'});S.links[0].subterminal=80;
      // Force the actual construction-delay event, and keep all other randomness harmless.
      S.nextFail=S.nextEvent=1e8;Math.random=()=>0;dayTick();`);
    assert.deepEqual(dates(ev), [1010, 80, 1190]);
    assert.equal(ev("subUpgradeReady(S.links[0],'terminal')"), true);
  } finally { dom.window.close(); }
});

test('old saves repair excessive pending waits without changing valid dates, charges or installed upgrades', () => {
  const { ev, dom } = load();
  try {
    setup(ev);
    ev(`const incoming=JSON.parse(JSON.stringify(S));incoming.day=500;const template=incoming.links[0];incoming.links=[
      {...template,id:'finished',ready:101,subterminal:1030,subengineering:1180,paid:8e7},
      {...template,id:'building',ready:600,subterminal:1030,subengineering:1180},
      {...template,id:'recently-finished',ready:490,subterminal:1030,subengineering:1180},
      {...template,id:'recent',ready:101,subterminal:520,subengineering:650},
      {...template,id:'installed',ready:101,subterminal:80,subengineering:400},
      {...template,id:'bundled',ready:600,subterminal:600,subengineering:600},
      {...template,id:'bare',ready:101}
    ];S=migrate(incoming);`);
    const result = JSON.parse(ev('JSON.stringify(S.links.map(l=>[l.subterminal,l.subengineering]))'));
    assert.deepEqual(result, [[131, 281], [630, 780], [520, 670], [520, 650], [80, 400], [600, 600], [null, null]]);
    assert.equal(ev('S.links[0].paid'), 8e7);
    assert.equal(ev('S.links[0].ready'), 101);
    assert.equal(ev("subUpgradeReady(S.links[0],'terminal')&&subUpgradeReady(S.links[0],'engineering')"), true, 'elapsed commissioning time is credited');
    ev('S=migrate(JSON.parse(JSON.stringify(S)))');
    assert.deepEqual(JSON.parse(ev('JSON.stringify(S.links.map(l=>[l.subterminal,l.subengineering]))')), result, 'loading again does not restart or shorten legitimate timers');
    ev('S.day=510;S=migrate(JSON.parse(JSON.stringify(S)))');
    assert.deepEqual(JSON.parse(ev('JSON.stringify(S.links.map(l=>[l.subterminal,l.subengineering]))')), result, 'elapsed repair time is retained');
  } finally { dom.window.close(); }
});

test('land fiber, leased cables, invalid upgrades and rejected crew purchases remain unaffected', () => {
  const { ev, dom } = load();
  try {
    setup(ev);
    ev("S.links[0].subterminal=1030;S.links[0].subengineering=1180;S.cash=0;ACT.crews({id:'cable'})");
    assert.deepEqual(dates(ev), [1000, 1030, 1180]);
    ev(`S.links.push({...S.links[0],id:'land',sub:false},{...S.links[0],id:'leased',own:false});
      setCableReady(S.links[1],970);setCableReady(S.links[2],970);`);
    assert.equal(ev('S.links[1].subterminal'), 1030);
    assert.equal(ev('S.links[2].subengineering'), 1180);
    ev("S.links[0].subterminal='soon';S.links[0].subengineering=-1;S=sanitize(S)");
    assert.equal(ev('S.links[0].subterminal'), undefined);
    assert.equal(ev('S.links[0].subengineering'), undefined);
    assert.equal(ev('S.links[1].subterminal'), undefined);
    assert.equal(ev('S.links[2].subengineering'), undefined);
  } finally { dom.window.close(); }
});

test('one-click completion costs the same as repeated crew hires and advances pending upgrades identically', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev);
    ev("ACT.subUpgrade({id:'cable',k:'terminal'});ACT.subUpgrade({id:'cable',k:'engineering'});UI.sel={type:'link',id:'cable'};renderPanel()");
    const button = [...dom.window.document.querySelectorAll('#panelBody [data-act=crews]')].find(b => JSON.parse(b.dataset.args).all);
    assert.ok(button && !button.disabled, 'one-click option is available');
    const cash = ev('S.cash');
    assert.ok(button.textContent.includes(ev('fmt$(30*Math.round(15000+15000*6))')), 'full price is shown before purchase');
    button.click();
    const bulkDates = dates(ev), bulkCash = ev('S.cash');
    assert.deepEqual(bulkDates, [101, 131, 281]);
    assert.equal(cash - bulkCash, 30 * 105000);
    const after = [...dom.window.document.querySelectorAll('#panelBody [data-act=crews]')];
    assert.ok(after.every(b => b.disabled), 'both options stop at one day');
    ev("ACT.crews({id:'cable',all:1})");
    assert.equal(ev('S.cash'), bulkCash, 'repeat submission cannot charge again');
    setup(ev);
    ev("ACT.subUpgrade({id:'cable',k:'terminal'});ACT.subUpgrade({id:'cable',k:'engineering'});for(let i=0;i<30;i++)ACT.crews({id:'cable'})");
    assert.deepEqual(dates(ev), bulkDates);
    assert.equal(ev('S.cash'), bulkCash);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('one-click completion is atomic when unaffordable and handles short or completed construction', () => {
  const { ev, dom } = load();
  try {
    setup(ev);
    ev("S.cash=30*105000-1;UI.sel={type:'link',id:'cable'};renderPanel()");
    const bulk = [...dom.window.document.querySelectorAll('#panelBody [data-act=crews]')].find(b => JSON.parse(b.dataset.args).all);
    assert.equal(bulk.disabled, true);
    ev("ACT.crews({id:'cable',all:1})");
    assert.equal(ev('S.cash'), 30 * 105000 - 1);
    assert.equal(ev('S.links[0].ready'), 1000, 'no partial purchase');
    ev("S.cash=105000;S.links[0].ready=102;ACT.crews({id:'cable',all:1})");
    assert.equal(ev('S.cash'), 0);
    assert.equal(ev('S.links[0].ready'), 101, 'two days remaining costs one normal hire');
    assert.match(dom.window.document.body.textContent, /Construction is 1 day ahead\./);
    ev("S.cash=105000;S.day=101;ACT.crews({id:'cable',all:1})");
    assert.equal(ev('S.cash'), 105000, 'completed construction cannot be rushed');
    ev("S.day=100;S.links[0].ready=1000;S.links[0].own=false;ACT.crews({id:'cable',all:1})");
    assert.equal(ev('S.links[0].ready'), 1000, 'leased handovers cannot buy construction crews');
  } finally { dom.window.close(); }
});

test('owned ground fiber exposes the one-click button and uses the same crew pricing', () => {
  const { ev, dom, errors } = load();
  try {
    setup(ev);
    ev("ACT.buildPop({city:'ams'});Object.assign(S.links[0],{a:'fra',b:'ams',sub:false,km:800,ready:191});UI.sel={type:'link',id:'cable'};renderPanel()");
    const bulk = [...dom.window.document.querySelectorAll('#panelBody [data-act=crews]')].find(b => JSON.parse(b.dataset.args).all);
    assert.ok(bulk && !bulk.disabled, 'ground construction has the same one-click control');
    assert.ok(bulk.textContent.includes(ev('fmt$(3*(15000+800*6))')), '91 days remaining requires three hires');
    const cash = ev('S.cash');
    bulk.click();
    assert.equal(ev('S.links[0].ready'), 101);
    assert.equal(cash - ev('S.cash'), 59400);
    assert.equal(ev('S.links[0].subterminal'), undefined);
    assert.equal(ev('S.links[0].subengineering'), undefined);
    assert.ok([...dom.window.document.querySelectorAll('#panelBody [data-act=crews]')].every(b => b.disabled));
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
