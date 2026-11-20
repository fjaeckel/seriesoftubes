// The first minutes of a new game: title → (phone) install pitch → charter → the six tutorial steps, played by
// clicking the buttons the coach points at, on a phone and on a desktop. Each step's pink glow must sit on a real,
// rendered button that does the step, so the coach never points at something that is not there.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const VIEWS = { phone: 390, desktop: 1440 };

function begin(width) {
  const page = load();
  const { ev, dom } = page;
  dom.window.__TUBES_TUT__ = true;
  dom.window.__TUBES_CHARTER__ = true;
  ev(`window.innerWidth=${width};localStorage.removeItem('sot-tut');`);
  return page;
}
// The glowing button, checked to be the only one and not inside anything hidden.
function glow(ev) {
  return ev(`(()=>{const g=[...document.querySelectorAll('.coach-glow')];if(g.length!==1)return {n:g.length};const b=g[0];
    let hid=false;for(let e=b;e;e=e.parentElement)if(e.hidden)hid=true;
    return {n:1,act:b.dataset.act||b.id,args:b.dataset.args||'',hid,id:b.id||''};})()`);
}
const click = (ev, sel) => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true;})()`);
const step = (ev) => ev("S.tut");
const coach = (ev) => ev("document.getElementById('coach').hidden?null:document.getElementById('coach').textContent");

for (const [view, width] of Object.entries(VIEWS)) {
  test(`the tutorial's glow points at a real button at every step (${view})`, () => {
    const { ev, errors } = begin(width);
    const phone = view === 'phone';
    assert.equal(ev('isPhone()'), phone);
    assert.ok(click(ev, '[data-act="start"]'), 'Start building');
    if (phone) {
      assert.match(ev("$('modal').innerHTML"), /pitchSkip/, 'phones get the install pitch first');
      assert.ok(click(ev, '#modal [data-act="pitchSkip"]'));
    }
    assert.equal(ev("$('modal').className"), 'charter', 'then the charter');
    assert.equal(coach(ev), null, 'no coach over the charter');
    assert.ok(click(ev, '#modal [data-act="charter"][data-args*="global"]'));
    assert.equal(ev("$('modal').hidden"), true);

    // 1: Launch broadband, in the open home city.
    assert.equal(step(ev), 0);
    assert.match(coach(ev), /Step 1 of 6/);
    let g = glow(ev);
    assert.deepEqual([g.n, g.act, g.hid], [1, 'launchBB', false]);
    assert.ok(click(ev, '.coach-glow'));

    // 2: the Transit tab, then a carrier's port inside it.
    assert.equal(step(ev), 1);
    g = glow(ev);
    assert.deepEqual([g.act, g.args, g.hid], ['tab', '{"t":"up"}', false]);
    click(ev, '.coach-glow');
    g = glow(ev);
    assert.deepEqual([g.act, g.hid], ['buyTransit', false], 'the glow moves onto a port once the tab is open');
    click(ev, '.coach-glow');

    // 3: Peering tab, a port with a price list (not DE-KICKS' "price on request"), then the route server.
    assert.equal(step(ev), 2);
    g = glow(ev);
    assert.deepEqual([g.act, g.args], ['tab', '{"t":"peer"}']);
    click(ev, '.coach-glow');
    g = glow(ev);
    assert.equal(g.act, 'buyIx');
    assert.equal(ev(`isDk(${JSON.stringify(JSON.parse(g.args).city)})`), false, 'a challenger IX, not a sales quote');
    click(ev, '.coach-glow');
    assert.equal(ev("$('modal').hidden"), true, 'no quote window');
    g = glow(ev);
    assert.equal(g.act, 'rs', 'then Join route server');
    click(ev, '.coach-glow');

    // 4: the speed control of this layout (the HUD's 1× on a desktop, the tab bar's Speed on a phone).
    assert.equal(step(ev), 3);
    assert.match(coach(ev), /½ speed/);
    assert.ok(ev(phone ? "!!document.querySelector('#tabbar:not([hidden]) [data-act=\"phoneSpeed\"]')" : "!$('sp1').hidden"));
    g = glow(ev);
    assert.equal(g.n, 1);
    if (!phone) assert.equal(g.id, 'sp1');
    click(ev, '.coach-glow');
    assert.equal(ev('UI.speed'), 1, 'one tap is 1×');
    ev('renderAll()');
    assert.equal(glow(ev).n, 0, 'done: no glow inviting a second tap while the days run');
    ev("UI.speed=0;while(S.day<5)dayTick();renderAll()");

    // 5: the Infra tab, then "Link to a city", whose empty list starts with the nearest cities.
    assert.equal(step(ev), 4);
    assert.match(coach(ev), /Link to a city/);
    g = glow(ev);
    assert.deepEqual([g.act, g.args], ['tab', '{"t":"links"}']);
    click(ev, '.coach-glow');
    g = glow(ev);
    assert.equal(g.act, 'findLink');
    click(ev, '.coach-glow');
    assert.equal(ev("$('modal').className"), 'find');
    const rows = ev("[...document.querySelectorAll('#findList [data-act=\"linkTo\"]')].map(b=>JSON.parse(b.dataset.args).b)");
    assert.ok(rows.length >= 5, 'nearby cities are offered before anything is typed');
    const km = [...rows].map((c) => ev(`kmBetween(S.home,${JSON.stringify(c)})`));
    assert.deepEqual(km, [...km].sort((a, b) => a - b), 'nearest first');
    assert.match(ev("$('findList').textContent"), / km/);
    click(ev, '#findList [data-act="linkTo"]');
    assert.ok(click(ev, '#modal [data-act="buildLink"]'), 'the link window offers a link');
    assert.equal(ev('S.links.length'), 1);

    // 6: Deals (the tab of this layout), then Accept on an offer that is ready.
    assert.equal(step(ev), 5);
    g = glow(ev);
    assert.ok(['leftTab', 'phoneTab'].includes(g.act) && /deals/.test(g.args), 'a Deals tab (jsdom has no layout, so either one)');
    assert.ok(ev(phone ? "!!document.querySelector('#tabbar [data-act=\"phoneTab\"][data-args*=\\'\"deals\"\\']')" : "!!document.querySelector('#leftTabs [data-act=\"leftTab\"][data-args*=\\'\"deals\"\\']')"));
    ev(phone ? "ACT.phoneTab({t:'deals'})" : "ACT.leftTab({t:'deals'})");
    ev("S.offers=[];for(let i=0;i<200&&!S.offers.some(o=>o.city===S.home&&!o.b);i++)dayTick();UI.speed=0;renderAll()");
    const ready = ev("[...document.querySelectorAll('#left [data-act=\"accept\"]')].length");
    assert.ok(ready > 0, 'an offer to sign');
    g = glow(ev);
    assert.equal(g.act, 'accept', 'the glow sits on Accept once Deals is open');
    click(ev, '.coach-glow');
    if (ev('S.biz.length') === 0) { ev("for(const o of [...S.offers])ACT.accept({id:o.id})"); }
    assert.ok(ev('S.biz.length') > 0);
    ev('renderAll()');
    assert.equal(step(ev), null, 'tutorial over');
    assert.equal(coach(ev), null);
    assert.equal(ev("document.querySelectorAll('.coach-glow').length"), 0);
    assert.match(ev("$('toasts').textContent"), /Your Goals take it from here/);
    assert.deepEqual(errors, []);
  });
}

test('a new network with no transit is told how to reach the networks it lists', () => {
  const { ev, errors } = load();
  ev("ACT.start({});ACT.leftTab({t:'nets'})");
  assert.match(ev("$('leftBody').textContent"), /You reach nobody yet/);
  ev("ACT.launchBB({city:S.home});ACT.buyTransit({city:S.home,net:NETS.find(n=>sellsAt(n,S.home)).id,tier:0});compute();renderAll()");
  assert.ok(ev('R.reach') > 0);
  assert.doesNotMatch(ev("$('leftBody').textContent"), /You reach nobody yet/);
  assert.deepEqual(errors, []);
});

test('the coach fits a phone screen and moves out of the way of a full-height sheet', () => {
  const { ev, errors } = load();
  const css = ev("[...document.querySelectorAll('style')].map(s=>s.textContent).join('\\n')");
  assert.match(css, /#coach\{box-sizing:border-box;/, 'its width includes its padding and border');
  assert.match(css, /body\.sheet-open:has\(#panel\.full:not\(\[hidden\]\)[^{]*\) #coach\{bottom:calc\(var\(--tabbar\) \+ 8px\)\}/);
  assert.deepEqual(errors, []);
});

test('Help describes linking by tap and where the dashboard is on a phone', () => {
  const { ev, errors } = load();
  ev("ACT.start({});ACT.help()");
  const t = ev("$('modal').textContent");
  assert.match(t, /Link to a city/);
  assert.match(t, /Open NOC dashboard in the NOC tab/);
  assert.deepEqual(errors, []);
});

test('after the tutorial, no stale hint: a goal met on day 0 is stored as 0', () => {
  const { ev, errors } = load();
  ev("ACT.start({});UI.speed=0");
  assert.equal(ev("$('hint').hidden?null:$('hint').textContent"), 'Tap your city, then Launch broadband', 'before launching, the hint says what to do');
  ev("ACT.launchBB({city:S.home});ACT.buyTransit({city:S.home,net:NETS.find(n=>sellsAt(n,S.home)).id,tier:0});after()");
  assert.equal(ev('S.done.bb'), 0, 'met on day 0');
  assert.match(ev("$('hint').textContent"), /drag from your pink router/, 'next: the first fiber');
  ev("S.links.push({id:'x',a:S.home,b:'ams',kind:'wave',tier:0,km:1,mo:1,day:0});renderHint()");
  assert.equal(ev("$('hint').hidden"), true, 'and nothing once there is fiber');
  assert.deepEqual(errors, []);
});

test('a loaded save past the early game never shows the coach; a mid-tutorial one keeps its step; junk is repaired', () => {
  const fs = require('fs'), path = require('path');
  const big = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8'));
  const { ev, errors } = load();
  for (const tut of [0, 3, 5]) {
    big.tut = tut;
    ev(`S=migrate(${JSON.stringify(big)});UI.started=true;compute();renderAll()`);
    assert.equal(ev('S.tut'), null, `step ${tut} on a network with fiber and customers`);
    assert.equal(ev("$('coach').hidden"), true);
    assert.equal(ev("$('hint').hidden"), true, 'no first-minute hint on a late game either');
  }
  ev("ACT.start({});UI.speed=0;ACT.launchBB({city:S.home});S.tut=1;S=migrate(JSON.parse(JSON.stringify(S)));renderAll()");
  assert.equal(ev('S.tut'), 1, 'a real step of a game in its first minutes stays');
  assert.match(ev("$('coach').textContent"), /Step 2 of 6/);
  for (const bad of ['"x"', '-1', '99', '1.5', '{}']) {
    ev(`S.tut=${bad};S=migrate(JSON.parse(JSON.stringify(S)));renderAll()`);
    assert.equal(ev('S.tut'), null, `tut ${bad}`);
  }
  assert.deepEqual(errors, []);
});

test('a phone on its side keeps the Deals sheet open through an action', () => {
  const { ev, errors } = load();
  ev("innerWidth=844;innerHeight=390;window.matchMedia=q=>({matches:/coarse/.test(q),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});dispatchEvent(new Event('resize'))");
  ev("UI.pitched=true;ACT.start({});UI.speed=0");
  assert.equal(ev('isPhone()'), true);
  ev("ACT.phoneTab({t:'deals'})");
  assert.equal(ev('UI.leftOpen'), true);
  ev('after()');
  assert.equal(ev('UI.leftOpen'), true, 'renderAll does not tuck it away as on a tablet');
  assert.deepEqual(errors, []);
});

test('upright phones: Skip sits in the step line, and toasts move above the coach while it covers their spot', () => {
  const { ev, errors } = load();
  const css = ev("[...document.querySelectorAll('style')].map(s=>s.textContent).join('\\n')");
  assert.match(css, /@media \(max-width:760px\) and \(orientation:portrait\),\(orientation:landscape\) and \(max-height:500px\) and \(pointer:coarse\)\{\s*#coach\{display:block\}[^@]*#coach>\.b\{position:absolute;top:6px;right:8px/);
  assert.match(css, /@media \(max-width:760px\) and \(orientation:portrait\) and \(min-height:700px\)\{\s*body\.sheet-open:has\(#coach:not\(\[hidden\]\)\) #toasts\{top:calc\(env\(safe-area-inset-top,0px\) \+ 54px\) !important;bottom:auto !important;z-index:17\}/);
  assert.deepEqual(errors, []);
});
