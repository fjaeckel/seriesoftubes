// #298: a PNI is peering like an IX port. Traffic leaves at the nearest one instead of crossing an ocean to a PNI,
// and where both are in the same city the PNI goes first.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt (home), London and New York; a NetChill PNI in London and a NetChill session at the New York IX.
const net = `ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;S.cash=1e10;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;
  for(const c of ['lon','nyc'])ACT.buildPop({city:c});for(const c of ['fra','lon','nyc'])ACT.launchBB({city:c});ACT.buyIx({city:'nyc',tier:1,signed:true});
  S.transit=[];S.links=[{id:'fl',a:'fra',b:'lon',kind:'wave',tier:3,km:640,cut:0,mo:1},{id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5570,cut:0,mo:1}];
  S.peers['nfx@nyc']=true;S.pni=[{id:'pl',net:'nfx',city:'lon',tier:2,ready:0}];compute()`;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);

test('#298 traffic leaves at the nearest peering, not over the Atlantic to a PNI', () => {
  const { ev, dom, errors } = load();
  try {
    ev(net);
    const nyc = ev('R.useIx.nyc'), pni = ev('R.usePni.pl');
    assert.ok(nyc > 0, 'New York sends NetChill traffic out at its own IX');
    assert.ok(pni > 0, 'Frankfurt and London still use the London PNI');
    near(ev('R.load.ln||0'), 0, 'nothing crosses the Atlantic');
    near(nyc + pni, ev('R.netEg.nfx.p+R.netEg.nfx.ix'), 'all of it is served by peering');
    // Backup only still means backup only: the PNI takes nothing while the IX has room.
    ev("S.pni[0].pref='low';compute()");
    near(ev('R.usePni.pl||0'), 0, 'a backup-only PNI waits');
    // RouteScript can still pull every gigabit onto the PNI, the way local-pref would.
    ev("S.pni[0].pref='normal';S.core={lv:2,run:2,legacy:true};S.te={on:true,script:'prefer pni for netchill'};compute()");
    assert.ok(ev('teRules()'), 'the rule is active');
    near(ev('R.useIx.nyc||0'), 0, 'prefer pni hauls New York to London again');
    assert.ok(ev('R.load.ln') > 0);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('#298 in the same city the PNI goes first, and the IX port takes what does not fit', () => {
  const { ev, dom, errors } = load();
  try {
    ev(net + ";ACT.buyIx({city:'lon',tier:1,signed:true});S.peers['nfx@lon']=true;compute()");
    const lon = ev('R.useIx.lon||0'), pni = ev('R.usePni.pl');
    near(lon, 0, 'the London IX port carries none of it while the PNI has room');
    assert.ok(pni > 0);
    near(ev('R.load.ln||0'), 0, 'New York still uses its own IX');
    // The traceroute shows the same choice.
    assert.match(ev("traceroute('lon',{net:'nfx'}).text"), /pni-/i, 'London traces out over the PNI');
    assert.doesNotMatch(ev("traceroute('nyc',{net:'nfx'}).text"), /pni-/i, 'New York traces out over its IX');
    // A PNI too small for London and Frankfurt: the rest goes to the London IX, not across the ocean.
    ev("S.pni[0].g1=true;compute()");
    const cap = ev("liveCap(pniG(S.pni[0]),'lon',S.pni[0].site,S.pni[0].n)");
    assert.ok(ev('R.usePni.pl') <= cap + 1e-6 && ev('R.usePni.pl') > cap * 0.99, 'the PNI fills up');
    assert.ok(ev('R.useIx.lon') > 0, 'the IX port takes the rest');
    near(ev('R.load.ln||0'), 0);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
