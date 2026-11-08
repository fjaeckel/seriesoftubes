const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// #322: a construction delay that hits your own subsea cable while the lay ship is at sea holds the ship where it is.
// It used to move the whole laying stretch later: the ship vanished, the laid km went back to zero and the survey and
// factory could be hurried (and paid for) all over again.
const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.day=200;S.nextFail=S.nextEvent=1e8;for(const g of GOALS)S.done[g.id]=0;";
const own = "S.links=[{id:'own',a:'cpt',b:'bue',kind:'df',own:true,sub:true,sys:'roadm',km:6000,ch:[],day:200,ready:800,cut:0,mo:1}];";

test('#322 a delay while laying holds the lay ship; it does not start over', () => {
  const { ev, dom, errors } = load();
  ev(start + own);
  assert.equal(ev('layStart(S.links[0])'), 760);
  ev("S.day=770");
  const laid = ev('layDone(S.links[0],S.day)');
  assert.equal(laid, 0.25);
  // A storm: 20 days late, as the daily construction delay does it.
  ev("setCableReady(S.links[0],S.links[0].ready+20)");
  assert.equal(ev('S.links[0].ready'), 820);
  assert.ok(ev('S.day>=layStart(S.links[0])'), 'still laying: the ship stays on the map');
  assert.equal(ev('layDone(S.links[0],S.day)'), laid, 'nothing laid is lost');
  assert.equal(ev('prepSteps(S.links[0])'), 0, 'no paying for the survey and factory again');
  assert.equal(ev('layQuote(S.links[0])'), null);
  ev("UI.sel={type:'link',id:'own'};renderPanel()");
  const panel = () => dom.window.document.querySelector('#panelBody').textContent;
  assert.match(panel(), /at sea, laying/);
  assert.match(panel(), /1,500 of 6,000 km/);
  assert.doesNotMatch(panel(), /Survey, permits and the cable factory|Hurry/);
  // The ship waits out the delay, then lays the other 30 days' worth, never going backwards.
  let prev = laid;
  for (let d = 770; d < 820; d++) {
    ev('S.day=' + d);
    const q = ev('layDone(S.links[0],S.day)');
    assert.ok(q >= prev, `day ${d}: ${q} < ${prev}`);
    assert.ok(ev('S.day>=layStart(S.links[0])'), `day ${d}: the ship is at sea`);
    if (d <= 790) assert.equal(q, laid, `day ${d}: waiting out the storm`);
    prev = q;
  }
  assert.equal(ev('layDone(S.links[0],819.5)') < 1, true);
  assert.equal(ev('layDone(S.links[0],820)'), 1);
  // A second delay during the wait adds to it.
  ev(start + own + "S.day=770;setCableReady(S.links[0],810);S.day=780;setCableReady(S.links[0],820)");
  assert.equal(ev('S.links[0].lay.t'), 790, 'held until 780, then 10 days more');
  assert.equal(ev('layDone(S.links[0],790)'), 0.25);
  assert.ok(ev('layDone(S.links[0],791)') > 0.25);
  assert.equal(ev('layDone(S.links[0],820)'), 1);
  assert.deepEqual(errors, []);
});

test('#322 a held lay ship survives a save, and bad saved values are repaired', () => {
  const { ev, errors } = load();
  ev(start + own + "S.day=770;setCableReady(S.links[0],820)");
  const q = ev('layDone(S.links[0],795)');
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.equal(ev('layDone(S.links[0],795)'), q);
  assert.equal(ev('layDone(S.links[0],770)'), 0.25);
  // Junk from an edited save, or on a cable that is not your own subsea build, goes away.
  ev("S.links[0].lay={s:'x',q:7,t:-5};S=migrate(JSON.parse(JSON.stringify(S)))");
  const l = JSON.parse(ev('JSON.stringify(S.links[0].lay)'));
  assert.ok(l.q >= 0 && l.q <= 1 && l.s <= 770 && l.t <= 820, JSON.stringify(l));
  ev("S.links[0].lay=[1];S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.links[0].lay'), undefined);
  ev("S.links[0].sub=false;S.links[0].lay={s:760,q:.5,t:790};S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.links[0].lay'), undefined);
  // A finished cable drops it.
  ev(start + own + "S.day=770;setCableReady(S.links[0],820);S.day=819;dayTick()");
  assert.equal(ev('S.links[0].ready<=S.day'), true);
  assert.equal(ev('S.links[0].lay'), undefined);
  // Old saves (no lay field) lay as before.
  ev(start + own + "S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('layStart(S.links[0])'), 760);
  assert.equal(ev('layDone(S.links[0],780)'), 0.5);
  assert.deepEqual(errors, []);
});
