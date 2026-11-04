const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;S.hist=[];for(let d=1;d<=40;d++)S.hist.push({d,dem:100+d,srv:90+d,c:10,p:20,ix:30,t:40+d,l2:5,rev:1000+d*10,cost:900+d*5})";
const dash = ev => ev("(renderDash(),$('dash').innerHTML)");

test('NOC legend entries hide and show a series, and the scale follows the rest', () => {
  const { ev, errors } = load();
  ev(start); ev("$('dash').hidden=false");
  let h = dash(ev);
  assert.match(h, /data-ch="traffic"/);
  assert.match(h, /data-ch="money"/);
  assert.equal((h.match(/class="lg"/g) || []).length, 8, 'six traffic entries and two money ones, all on');
  const stacked = html => (html.match(/fill-opacity="\.85"/g) || []).length;
  assert.equal(stacked(h), 5);
  ev("ACT.chartToggle({c:'traffic',k:'t'})");
  h = ev("$('dash').innerHTML");
  assert.equal(stacked(h), 4, 'transit is gone from the stack');
  assert.match(h, /class="lg off" aria-pressed="false"[^>]*data-args="[^"]*&quot;k&quot;:&quot;t&quot;/);
  ev("ACT.chartToggle({c:'traffic',k:'ix'})");
  assert.equal(stacked(ev("$('dash').innerHTML")), 3, 'several at once');
  ev("ACT.chartToggle({c:'traffic',k:'t'})");
  assert.equal(stacked(ev("$('dash').innerHTML")), 4, 'a second click brings it back');
  // Hiding the last visible series shows everything again instead of an empty chart.
  ev("UI.chartOff={}");
  for (const k of ['c', 'p', 'ix', 'l2', 'dem']) ev(`ACT.chartToggle({c:'traffic',k:'${k}'})`);
  assert.equal(stacked(ev("$('dash').innerHTML")), 1, 'only transit left');
  ev("ACT.chartToggle({c:'traffic',k:'t'})");
  assert.equal(stacked(ev("$('dash').innerHTML")), 5);
  // Nonsense is ignored, and the other chart is untouched.
  ev("ACT.chartToggle({c:'nope',k:'t'});ACT.chartToggle({c:'money',k:'zzz'})");
  assert.equal(ev("JSON.stringify(UI.chartOff.money||{})"), '{}');
  assert.deepEqual(errors, []);
});

test('hovering a NOC chart shows the day and every visible series; leaving hides it', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev(start); ev("$('dash').hidden=false;renderDash()");
  const svg = doc.querySelector('svg.chart[data-ch="traffic"]');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 180, right: 600, bottom: 180 });
  const move = (t, x) => t.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: x, clientY: 60, bubbles: true }));
  move(svg, 50 + 542);   // the right edge of the plot: the newest day
  const tip = doc.querySelector('.chtip');
  assert.ok(tip && !tip.hidden, 'tooltip appears');
  assert.match(tip.textContent, /Y1 · /);
  assert.match(tip.textContent, /Transit/);
  assert.match(tip.textContent, /Demand/);
  assert.match(tip.textContent, /Total/);
  assert.equal(tip.textContent.includes('80.0 Gbps'), true, 'newest transit 40+40 Gbps');
  ev("ACT.chartToggle({c:'traffic',k:'t'})");
  move(doc.querySelector('svg.chart[data-ch="traffic"]'), 50);
  assert.doesNotMatch(tip.textContent, /Transit/, 'hidden series are left out');
  assert.match(tip.textContent, /Gbps/);
  move(doc.body, 10);
  assert.equal(tip.hidden, true, 'moving away hides it');
  assert.deepEqual(errors, []);
});

test('the "how it arrives" bars on the Traffic tab show the same tip with each way in and its share', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev("ACT.start({});S.cash=1e8;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});compute();UI.dtab='traffic';$('dash').hidden=false;renderDash()");
  const bars = [...doc.querySelectorAll('.mix[data-mix]')].filter(b => Object.keys(JSON.parse(b.dataset.mix)).length);
  assert.ok(bars.length, 'a network with traffic has a bar');
  assert.equal(bars[0].hasAttribute('title'), false, 'no plain browser tooltip next to ours');
  assert.match(bars[0].getAttribute('aria-label'), /Gbps/);
  bars[0].dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true }));
  const tip = doc.querySelector('.chtip');
  assert.ok(tip && !tip.hidden);
  assert.match(tip.textContent, /Transit.*Gbps · \d+%/);
  assert.equal(doc.querySelector('.chcur').hidden, true, 'no cursor line for a bar');
  doc.body.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 5, clientY: 5, bubbles: true }));
  assert.equal(tip.hidden, true);
  assert.deepEqual(errors, []);
});

test('the Traffic tab legend picks which ways in count, and the table follows', () => {
  const { ev, dom, errors } = load();
  const doc = dom.window.document;
  ev("ACT.start({});S.cash=1e8;S.nextFail=1e9;S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'});compute();UI.dtab='traffic';$('dash').hidden=false;renderDash()");
  const rows = () => doc.querySelectorAll('.tbl tbody tr').length;
  const kinds = () => new Set([...doc.querySelectorAll('.tbl .mix[data-mix]')].flatMap(b => Object.keys(JSON.parse(b.dataset.mix))));
  const all = rows();
  assert.ok(kinds().has('t'), 'transit carries something');
  assert.equal(doc.querySelectorAll('.legend .lg').length, 4, 'one entry per way in');
  ev("ACT.chartToggle({c:'mix',k:'t'})");
  assert.equal(kinds().has('t'), false, 'transit is out of every bar');
  assert.ok(rows() < all, 'networks that only came in over transit are gone');
  assert.equal(doc.querySelectorAll('.legend .lg.off').length, 1);
  ev("ACT.chartToggle({c:'mix',k:'t'})");
  assert.equal(rows(), all, 'switching it back restores the table');
  assert.deepEqual(errors, []);
});
