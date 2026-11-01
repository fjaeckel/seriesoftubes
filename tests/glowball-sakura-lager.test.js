const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('Glowball Sakura Lager is a Tier 2 in the big hubs, not everywhere', () => {
  const { ev, errors } = load();
  assert.equal(ev("NET.gsl.name"), 'Glowball Sakura Lager');
  assert.equal(ev("NET.gsl.type"), 't2');
  assert.equal(ev("NET.gsl.pol"), 'open');
  const n = ev("NET.gsl.pops.length");
  assert.ok(n >= 40 && n <= 60, `a few dozen cities, like the real network (${n})`);
  for (const c of ['nyc', 'lon', 'fra', 'sin', 'tok', 'akl']) assert.ok(ev(`NET.gsl.pops.includes('${c}')`), `in ${c}`);
  assert.equal(ev("NET.gsl.pops.some(c=>CITY[c].reg==='AF')"), false, 'no African facilities listed');
  for (const c of ['ash', 'sao', 'gum', 'mct', 'chc']) assert.ok(ev(`NET.gsl.pops.includes('${c}')`), `confirmed facility in ${c}`);
  assert.equal(ev("NET.gsl.pops.includes('pcn')||NET.gsl.pops.includes('ivc')||NET.gsl.pops.includes('prr')"), false, 'not in the remote towns');
  assert.equal(ev("NET.gsl.ix.every(c=>NET.gsl.pops.includes(c))"), true, 'exchanges only where it has a PoP');
  assert.equal(ev("NET.gsl.pops.some(c=>CITY[c].cn)"), false);
  assert.equal(ev("t1Need().some(n=>n.id==='gsl')"), false, 'not a Tier 1, so no Tier 1 club PNI is needed for it');
  assert.equal(ev("NET.gsl.up.every(u=>NET[u]&&!NET[u].tail)&&NET.gsl.up.includes('tpr')"), true, 'its observed upstreams include the Australian backbone behind the retail brand');
  assert.equal(ev("PNI_NETS.lvl.includes('gsl')"), true, 'a PNI with an upstream reaches it');
  assert.equal(ev("NETS.filter(n=>n.asn===NET.gsl.asn).length"), 1);
  assert.equal(ev("initials(NET.gsl)"), 'GSL');
  assert.deepEqual(errors, []);
});

test('it sells transit only where it is, and never to Australians, but peers on the big Australian exchanges', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  assert.ok(ev("CITIES.some(c=>sellsAt(NET.gsl,c.id))"), 'offered in selected markets');
  assert.ok(ev("CITIES.filter(c=>sellsAt(NET.gsl,c.id)).every(c=>NET.gsl.pops.includes(c.id))"));
  assert.equal(ev("Object.keys(CITY).filter(c=>!NET.gsl.pops.includes(c)).some(c=>sellsAt(NET.gsl,c))"), false, 'nowhere else');
  assert.equal(ev("sellsAt(NET.gsl,'ivc')||sellsAt(NET.gsl,'prr')"), false, 'the remote towns stay without transit');
  assert.equal(ev("Object.keys(CITY).filter(c=>CITY[c].au).some(c=>sellsAt(NET.gsl,c))"), false, 'no transit for Australians');
  assert.equal(ev("AU_SELLERS.includes('gsl')"), false);
  assert.equal(ev("ixMembers('fra').includes('gsl')&&ixMembers('lon').includes('gsl')"), true);
  assert.equal(ev("ixMembers('syd').includes('gsl')"), true, 'Australian exchanges follow auIx');
  assert.equal(ev("ixMembers('adl').includes('gsl')"), true, 'Adelaide is now listed on the Australian exchanges');
  assert.equal(ev("ixMembers('lag').includes('gsl')"), false, 'not on exchanges where it has no PoP');
  assert.deepEqual(errors, []);
});

test('far from home it costs more than the locals, so it is never the cheap way in', () => {
  const { ev, errors } = load();
  ev("ACT.start({})");
  const price = (net, c) => ev(`NET.${net}.price*netMult(NET.${net},'${c}')`);
  assert.equal(price('gsl', 'nyc'), 5, 'its own price at home in the US');
  assert.ok(price('gsl', 'sin') > ev("NET.gsl.price*regionMult('sin')"), 'a markup in Asia on top of the regional price');
  assert.ok(price('gsl', 'akl') > ev("NET.gsl.price*regionMult('akl')"), 'and in New Zealand');
  assert.equal(ev("NET.gsl.pops.filter(c=>sellsAt(NET.gsl,c)).some(c=>{const p=n=>n.price*netMult(n,c);return NETS.some(n=>n.id!=='gsl'&&sellsAt(n,c))&&p(NET.gsl)<Math.min(...NETS.filter(n=>n.id!=='gsl'&&sellsAt(n,c)).map(p));})"), false, 'never the cheapest seller in any of its cities');
  // The bill uses the same price as the panel.
  ev("S.cash=1e8;ACT.buildPop({city:'mct'});ACT.buyTransit({city:'mct',net:'gsl',tier:1});compute()");
  const t = "S.transit.find(t=>t.net==='gsl')";
  assert.equal(ev(`transitMo(${t},100)`), ev(`Math.max(100,PORT[${t}.tier].g*0.2)*NET.gsl.price*S.priceMul*netMult(NET.gsl,'mct')+PORT[${t}.tier].tmo`), 'billed with the markup');
  assert.deepEqual(errors, []);
});

test('buying transit from it reaches the whole internet', () => {
  const { ev, errors } = load();
  ev("beginGame('Local','mil',{mode:'sandbox'});S.cash=1e8;ACT.launchBB({city:'mil'});ACT.buyTransit({city:'mil',net:'gsl',tier:1});compute()");
  assert.equal(ev("S.transit.length"), 1);
  assert.ok(ev("R.reach") > 0.999, 'transit reaches every network');
  assert.ok(ev("R.served") > 0);
  assert.ok(ev("Object.values(R.useT).reduce((a,b)=>a+b,0)") > 0);
  assert.deepEqual(errors, []);
});

test('it takes a PNI and open peering at an exchange, and carries its own traffic over them', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});S.pops.fra.bb.d=400");
  assert.equal(ev("peerOk('gsl','pni','fra').ok"), true);
  assert.equal(ev("peerOk('gsl','ix','fra').ok"), true);
  ev("ACT.pni({city:'fra',net:'gsl',tier:1});for(const p of S.pni)p.ready=0;compute()");
  assert.equal(ev("S.pni.length"), 1, 'the PNI order went through');
  assert.ok(ev("R.netEg.gsl.p") > 0, 'traffic for it goes over the PNI');
  ev("S.pni=[];ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'});compute()");
  assert.equal(ev("ixSessions('fra').has('gsl')"), true, 'the route server session comes up by itself');
  assert.ok(ev("R.netEg.gsl.ix") > 0, 'traffic for it goes over the exchange');
  assert.deepEqual(errors, []);
});

test('a PNI carries observed customers, including hosting and overseas access networks', () => {
  const { ev, errors } = load();
  for (const id of ['bdc', 'slw', 'rsh', 'lpt']) {
    assert.ok(ev(`NET.${id}.up.includes('gsl')`), `${id} has an observed provider relationship`);
    assert.ok(ev(`PNI_NETS.gsl.includes('${id}')&&ANC.${id}.includes('gsl')`));
  }
  assert.equal(ev("NET.pes.up.includes('gsl')"), false, 'Pessimum no longer has a fabricated upstream');
  assert.equal(ev("PNI_NETS.gsl.slice(1).every(id=>new Set(NET[id].up).size===NET[id].up.length)"), true);
  ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'lvl',tier:1});S.pops.fra.bb.d=40;ACT.pni({city:'fra',net:'gsl',tier:1});for(const p of S.pni)p.ready=0;compute()");
  assert.ok(ev("(R.netEg.slw||{}).p") > 0, 'the PNI carries its content customer');
  assert.equal(ev("sellsAt(NET.gsl,'syd')"), false, 'Australian transit sales restrictions still apply');
  ev("S.pni=[];compute()");
  assert.equal(ev("(R.netEg.slw||{}).p||0"), 0, 'the customer returns to transit without that PNI');
  assert.deepEqual(errors, []);
});

test('a game saved before it existed gets the courtesy route to it', () => {
  const a = load();
  a.ev("ACT.start({});S.day=40;S.seen=S.seen.filter(x=>x!=='gsl');save(true)");
  const b = load({ storage: { 'sot-save-v1': a.ev("slotRaw(UI.slot)") } });
  assert.equal(b.ev("S.grace.nets.includes('gsl')"), true);
  assert.equal(b.ev("S.seen.includes('gsl')"), true);
  assert.equal(b.ev("R.reachable.gsl"), true, 'reachable through the courtesy route until you find your own way');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
});

test('the city panel offers it as a transit provider, on a desktop and a phone', () => {
  for (const w of [1280, 360]) {
    const { ev, dom, errors } = load();
    ev(`window.innerWidth=${w};ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;UI.sel={type:'city',id:'mil'};UI.tab='up';renderPanel()`);
    assert.match(dom.window.document.getElementById('panelBody').textContent, /Glowball Sakura Lager/, `${w}px`);
    assert.deepEqual(errors, []);
  }
});
