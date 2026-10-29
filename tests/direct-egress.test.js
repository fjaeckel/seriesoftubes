const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const port = (ev, carrier, city) => ev(`S.transit.find(t=>t.net==='${carrier}'${city ? `&&t.city==='${city}'` : ''}).id`);
const via = (ev, id, dest) => ev(`((R.tNet['${id}']||{})['${dest}'])||0`);

// New York with eyeballs, and Level Tree and Tell-Ya ports in the same POP.
function newYork(lvlTier = 1, demand = 800) {
  const g = load();
  g.ev(`ACT.pickStart({city:'nyc'});ACT.start({});S.cash=1e9;ACT.launchBB({city:'nyc'});S.pops.nyc.bb.d=${demand};
    ACT.buyTransit({city:'nyc',net:'lvl',tier:${lvlTier}});ACT.buyTransit({city:'nyc',net:'tly',tier:1});compute()`);
  g.lvl = port(g.ev, 'lvl'); g.tly = port(g.ev, 'tly');
  return g;
}

// Chicago has the eyeballs; Level Tree is in New York, Tell-Ya in Chicago, and a 100G wave joins them.
function twoPops() {
  const g = load();
  g.ev(`ACT.pickStart({city:'nyc'});ACT.start({});S.cash=1e9;ACT.buildPop({city:'chi'});
    UI.via=null;UI.route='same';UI.lmode=null;openLinkModal('nyc','chi');ACT.buildLink({tier:1});closeModal();
    ACT.launchBB({city:'chi'});S.pops.chi.bb.d=80;
    ACT.buyTransit({city:'nyc',net:'lvl',tier:1});ACT.buyTransit({city:'chi',net:'tly',tier:1});compute()`);
  g.lvl = port(g.ev, 'lvl'); g.tly = port(g.ev, 'tly');
  g.link = g.ev("S.links[0].id");
  return g;
}

test('at its own POP a carrier\'s port takes the traffic bound for that carrier, not an even split', () => {
  const { ev, lvl, tly, errors } = newYork();
  assert.ok(via(ev, lvl, 'lvl') > 1, 'Level Tree traffic goes out of the Level Tree port');
  assert.equal(via(ev, tly, 'lvl'), 0, 'and none of it out of Tell-Ya');
  assert.ok(via(ev, tly, 'tly') > 1 && via(ev, lvl, 'tly') === 0, 'the same for Tell-Ya');
  assert.ok(via(ev, lvl, 'cog') > 1 && via(ev, tly, 'cog') > 1, 'traffic for a carrier you have no port of still shares both ports');
  assert.deepEqual(errors, []);
});

test('traffic for a carrier\'s customers prefers that carrier too, and a carrier beats its own customers\' other upstreams', () => {
  const { ev, lvl, tly, errors } = newYork();
  // Tee-Hee Mobile buys from Level Tree and Not That Telecom, not from Tell-Ya.
  assert.deepEqual(JSON.parse(ev("JSON.stringify(NET.tmo.up)")), ['lvl', 'ntt']);
  assert.ok(via(ev, lvl, 'tmo') > 0 && via(ev, tly, 'tmo') === 0, 'Tee-Hee Mobile goes out of the Level Tree port');
  // Add Not That Telecom: it is just as good an upstream for Tee-Hee, so the two share it. Its own traffic stays on its own port.
  ev("ACT.buyTransit({city:'nyc',net:'ntt',tier:1});compute()");
  const ntt = port(ev, 'ntt');
  assert.ok(via(ev, lvl, 'tmo') > 0 && via(ev, ntt, 'tmo') > 0 && via(ev, tly, 'tmo') === 0, 'two upstreams of the same network share its traffic');
  assert.ok(via(ev, ntt, 'ntt') > 0 && via(ev, lvl, 'ntt') === 0 && via(ev, tly, 'ntt') === 0);
  assert.deepEqual(errors, []);
});

test('when the carrier\'s own port is full, the rest spills onto the other transit ports', () => {
  const { ev, lvl, tly, errors } = newYork(0);   // a 10G Level Tree port
  assert.ok(ev(`R.useT['${lvl}']`) > 9.99, 'the small port is full');
  assert.ok(via(ev, lvl, 'lvl') > 9, 'mostly with Level Tree traffic');
  assert.ok(via(ev, tly, 'lvl') > 1, 'and the rest of Level Tree\'s traffic goes out of Tell-Ya');
  assert.deepEqual(errors, []);
});

test('Prefer, Backup only and RouteScript keep the say they had', () => {
  // A Prefer-marked port of another carrier takes everything first, as it always did.
  let g = newYork(1, 150);
  g.ev(`ACT.setPref({kind:'t',id:'${g.tly}',v:'high'});compute()`);
  assert.ok(via(g.ev, g.tly, 'lvl') > 1 && via(g.ev, g.lvl, 'lvl') === 0, 'Prefer on Tell-Ya sends Level Tree traffic there too');
  assert.deepEqual(g.errors, []);
  // A port set to Backup only is the last resort, even for its own traffic.
  g = newYork(1, 150);
  g.ev(`ACT.setPref({kind:'t',id:'${g.lvl}',v:'low'});compute()`);
  assert.equal(via(g.ev, g.lvl, 'lvl'), 0, 'Level Tree on backup carries none of its own traffic while Tell-Ya has room');
  assert.ok(via(g.ev, g.tly, 'lvl') > 1);
  assert.deepEqual(g.errors, []);
  // RouteScript's avoid transit is policy, and beats the shorter path.
  g = newYork(1, 150);
  g.ev("S.te={on:true,script:'avoid transit level tree'};compute()");
  assert.ok(g.ev("!!teRules()"), 'the script is active');
  assert.equal(via(g.ev, g.lvl, 'lvl'), 0, 'avoid transit level tree keeps even its own traffic off it');
  assert.ok(via(g.ev, g.tly, 'lvl') > 1);
  assert.deepEqual(g.errors, []);
});

test('from a POP without the carrier\'s port, traffic uses the nearest port, or crosses your network when the port carries', () => {
  const { ev, lvl, tly, link, errors } = twoPops();
  ev("S.te=null");
  assert.ok(via(ev, tly, 'lvl') > 1, 'by default Chicago sends Level Tree traffic out of its own nearest port, Tell-Ya');
  assert.equal(via(ev, lvl, 'lvl'), 0);
  assert.equal(ev(`R.load['${link}']||0`), 0, 'nothing crosses the link');
  ev(`ACT.setCarry({id:'${lvl}',on:1})`);
  assert.equal(ev(`S.transit.find(t=>t.id==='${lvl}').carry`), true);
  assert.ok(via(ev, lvl, 'lvl') > 1, 'with Carry here, it crosses to New York and leaves by Level Tree');
  assert.ok(via(ev, tly, 'lvl') < 0.001, 'and not by Tell-Ya');
  assert.ok(ev(`R.load['${link}']`) > 1, 'over the circuit');
  assert.ok(via(ev, tly, 'tly') > 1 && via(ev, lvl, 'tly') === 0, 'Tell-Ya\'s own traffic is not affected');
  ev(`ACT.setCarry({id:'${lvl}',on:0})`);
  assert.equal(ev(`S.transit.find(t=>t.id==='${lvl}').carry`), undefined, 'switching it off removes the flag');
  assert.ok(via(ev, tly, 'lvl') > 1, 'and the nearest port is used again');
  assert.deepEqual(errors, []);
});

test('traceroute shows the exit that routing uses, and says why', () => {
  const { ev, lvl, errors } = twoPops();
  const why = (to, from = 'chi') => ev(`traceroute('${from}',{net:'${to}'}).why`);
  const tly = port(ev, 'tly');
  assert.match(why('lvl'), /Tell-Ya.*Chicago/, 'nearest port from Chicago');
  assert.doesNotMatch(why('lvl'), /straight to/);
  assert.ok(via(ev, tly, 'lvl') > 1 && via(ev, lvl, 'lvl') === 0, 'and that is the port routing really uses');
  ev(`ACT.setCarry({id:'${lvl}',on:1})`);
  assert.ok(via(ev, lvl, 'lvl') > 1 && via(ev, tly, 'lvl') < 0.001, 'routing now uses the carrying port too');
  assert.match(why('lvl'), /Level Tree.*New York/, 'the carrying port, in New York');
  assert.match(why('lvl'), /straight to Level Tree/, 'because it goes straight to the carrier');
  assert.match(why('tmo'), /Tee-Hee Mobile buys transit from Level Tree/, 'and for its customers');
  assert.match(why('lvl', 'nyc'), /Level Tree.*New York/, 'at its own POP the carrier\'s port wins without carrying');
  ev(`ACT.setCarry({id:'${lvl}',on:0})`);
  assert.match(why('lvl', 'nyc'), /Level Tree.*New York.*straight to Level Tree/, 'also with carry off');
  assert.deepEqual(errors, []);
});

test('the carry setting is saved, repaired and optional', () => {
  const { ev, errors } = twoPops();
  ev(`ACT.setCarry({id:'${port(ev, 'lvl')}',on:1});save(true)`);
  const saved = ev("localStorage.getItem('sot-save-v1')");
  const again = load({ storage: { 'sot-save-v1': saved } });
  assert.equal(again.ev("S.transit.find(t=>t.net==='lvl').carry"), true, 'survives a reload');
  assert.equal(again.ev("S.transit.find(t=>t.net==='tly').carry"), undefined, 'and is off for the others');
  // Hand-edited or imported garbage is dropped; an old save without the field just loads.
  const bad = JSON.parse(saved);
  bad.transit.forEach((t, i) => { t.carry = i ? 'yes' : 1; });
  const fixed = load({ storage: { 'sot-save-v1': JSON.stringify(bad) } });
  assert.equal(fixed.ev("S.transit.some(t=>'carry' in t)"), false);
  const old = JSON.parse(saved);
  old.transit.forEach((t) => { delete t.carry; });
  assert.equal(load({ storage: { 'sot-save-v1': JSON.stringify(old) } }).ev("S.transit.length"), 2);
  assert.deepEqual([...errors, ...again.errors, ...fixed.errors], []);
});

test('each port offers the choice when it can matter, on a desktop and a phone', () => {
  for (const w of [1280, 360]) {
    const { ev, dom, errors } = load();
    ev(`window.innerWidth=${w};ACT.pickStart({city:'nyc'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;ACT.buyTransit({city:'nyc',net:'lvl',tier:1});UI.sel={type:'city',id:'nyc'};UI.tab='up';renderPanel()`);
    const body = () => dom.window.document.getElementById('panelBody');
    assert.equal(body().querySelectorAll('[data-act="setCarry"]').length, 0, `${w}px: one POP, one carrier: nothing to choose`);
    ev("ACT.buildPop({city:'chi'});ACT.buyTransit({city:'chi',net:'tly',tier:1});UI.sel={type:'city',id:'nyc'};UI.tab='up';renderPanel()");
    assert.equal(body().querySelectorAll('[data-act="setCarry"]').length, 2, `${w}px: Nearest port and Carry here for the Level Tree port`);
    assert.match(body().textContent, /Traffic for Level Tree/);
    assert.match(body().textContent, /At this POP, Level Tree's traffic always uses this port/);
    body().querySelector('[data-act="setCarry"][data-args*="\\"on\\":1"]').click();
    assert.equal(ev("S.transit.find(t=>t.net==='lvl').carry"), true, `${w}px: the button works`);
    assert.match(body().textContent, /Every POP carries Level Tree's traffic across your network to this port/);
    assert.deepEqual(errors, []);
  }
});

test('the control reads right in every language', () => {
  for (const lang of ['it', 'pt', 'fr', 'es', 'de']) {
    const { ev, dom, errors } = load({ lang });
    ev("ACT.pickStart({city:'nyc'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;ACT.buyTransit({city:'nyc',net:'lvl',tier:1});ACT.buildPop({city:'chi'});ACT.buyTransit({city:'chi',net:'tly',tier:1});UI.sel={type:'city',id:'nyc'};UI.tab='up';renderPanel()");
    const text = dom.window.document.getElementById('panelBody').textContent;
    assert.ok(!/\{net\}|link_panels\./.test(text), `${lang}: no raw placeholders or labels`);
    assert.notEqual(ev("tr('link_panels.carry_here')"), 'Carry here', `${lang}: translated`);
    assert.deepEqual(errors, []);
  }
});
