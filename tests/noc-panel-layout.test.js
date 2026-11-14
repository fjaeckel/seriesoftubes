// The NOC tab's top row (Pie Control next to the NOC dashboard), the traceroute inside Routing & DDoS, government money
// in the bank, and Pie Control's four tabs as one segmented control. Seeded; state is set directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const sandbox = "ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9";
const noc = "UI.started=true;UI.left='noc';UI.leftOpen=true;UI.sel=null;renderLeft()";
const acts = (root) => [...root.querySelectorAll('[data-act]')].map((b) => b.dataset.act);

test('the NOC tab: Pie Control in the top row once unlocked, no Connections or Traceroute buttons', () => {
  const { dom, ev, errors } = load();
  const doc = dom.window.document;
  ev("window.innerWidth=360;ACT.start({});if(UI.pendGame)ACT.pitchSkip();ACT.launchBB({city:'fra'});" + noc);
  const top = () => acts(doc.querySelector('#leftBody .btns'));
  assert.deepEqual(top(), ['dash', 'routingOpen'], 'no rocket company yet: no Pie Control');
  assert.ok(!acts(doc.getElementById('leftBody')).includes('connOpen'), 'Connections lives in the NOC dashboard');
  assert.ok(!acts(doc.getElementById('leftBody')).includes('trace'), 'the traceroute moved into Routing & DDoS');
  ev(sandbox + ';ACT.pieFound();' + noc);
  assert.deepEqual(top(), ['dash', 'pieOpen', 'routingOpen'], 'Pie Control sits next to the NOC dashboard');
  assert.equal(doc.querySelectorAll('#leftBody [data-act=pieOpen]').length, 1, 'and the old card is gone');
  assert.equal(doc.querySelector('#leftBody .pie-card'), null);
  doc.querySelector('#leftBody .btns [data-act=pieOpen]').click();
  assert.equal(ev("$('modal').className"), 'pie');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('Routing & DDoS opens the traceroute', () => {
  const { dom, ev, errors } = load();
  const doc = dom.window.document;
  ev("window.innerWidth=360;ACT.start({});if(UI.pendGame)ACT.pitchSkip();ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.routingOpen()");
  const b = doc.querySelector('#modalCard [data-act=trace]');
  assert.ok(b, 'a traceroute entry in the modal');
  assert.match(doc.querySelector('#modalCard .rt-trace').textContent, /Traceroute/);
  b.click();
  assert.equal(doc.querySelector('#modalCard [data-routing]'), null, 'the traceroute modal took over');
  assert.ok(doc.getElementById('trFrom'), 'with its source picker');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});

test('the bank shows Government money only with a rocket company, and pieGovOpen opens it there', () => {
  const { dom, ev, errors } = load();
  const doc = dom.window.document;
  ev(sandbox + ";window.innerWidth=360;ACT.bank()");
  assert.equal(doc.getElementById('bankGov'), null, 'nothing to show before the company');
  ev('ACT.bankClose();ACT.pieFound();ACT.pieOpen();ACT.pieGovOpen()');
  assert.equal(ev("$('modal').hidden"), true, 'Pie Control steps aside');
  assert.equal(ev("$('bankBox').hidden"), false);
  const card = doc.getElementById('bankCard');
  assert.ok(doc.getElementById('bankGov'));
  for (const re of [/Government money/, /Rural Digital Pie Fund/, /Pitcairn/, /Ex-Im Pie Bank/]) assert.match(card.textContent, re);
  ev('ACT.bankClose()');
  assert.deepEqual(errors, []);
});

test('Pie Control: NOC-style tabs; old Gov and Founder tabs fall back', () => {
  const { dom, ev, errors } = load();
  const doc = dom.window.document;
  ev(sandbox + ";window.innerWidth=360;ACT.pieFound();UI.pieTab=null;ACT.pieOpen()");
  const seg = doc.querySelector('#modalCard .dtabs.pie-tabs');
  assert.ok(seg, 'one tab bar, as on the NOC dashboard');
  assert.deepEqual([...seg.querySelectorAll('button')].map((b) => JSON.parse(b.dataset.args).t), ['home', 'fix', 'crust', 'dish', 'cust', 'co']);
  assert.equal(seg.querySelectorAll('button.on').length, 1);
  assert.equal(seg.querySelector('button.on').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(PIE_TABS)')), ['home', 'fix', 'crust', 'dish', 'cust', 'co']);
  // A tab name left over from before: Founder lands on Company, Gov on the overview (or the bank, when asked for by name).
  ev("UI.pieTab='founder';ACT.pieOpen()");
  assert.equal(ev('UI.pieTab'), 'co');
  ev("UI.pieTab='book';ACT.pieOpen()");
  assert.equal(ev('UI.pieTab'), 'co');
  ev("UI.pieTab='gov';ACT.pieOpen()");
  assert.equal(ev('UI.pieTab'), 'home');
  ev("UI.pieTab='nonsense';ACT.pieOpen()");
  assert.equal(ev('UI.pieTab'), 'home');
  ev("ACT.pieTab({t:'gov'})");
  assert.equal(ev("$('bankBox').hidden"), false, 'the old Gov tab name opens the bank');
  ev("ACT.bankClose();ACT.pieTab({t:'book'})");
  assert.equal(ev('UI.pieTab'), 'co');
  ev('closeModal()'); // an open globe keeps its animation loop, and this process, alive
  assert.deepEqual(errors, []);
});

test('the Company tab ends with the Founder\'s posts, the newest three and the rest folded', () => {
  const { dom, ev, errors } = load();
  const doc = dom.window.document;
  ev(sandbox + ";window.innerWidth=360;ACT.pieFound();for(let i=0;i<5;i++)pieFounder(N_('pie.fp_rename'));ACT.pieTab({t:'co'})");
  const feed = doc.querySelector('#modalCard .pie-feed');
  assert.ok(feed, 'the feed is on the Company tab');
  assert.equal(feed, [...doc.querySelectorAll('#modalCard > *')].pop(), 'at the bottom');
  assert.match(feed.textContent, /The Founder posts/);
  assert.match(feed.textContent, /Promises/);
  const n = ev('S.pie.founder.posts.length');
  assert.equal(feed.querySelectorAll(':scope > .ops-rep').length, 3);
  assert.equal(feed.querySelectorAll('details .ops-rep').length, n - 3);
  assert.match(feed.querySelector('summary').textContent, new RegExp(`${n - 3} older posts`));
  assert.match(doc.getElementById('modalCard').textContent, /Spent so far/, 'the books moved here too');
  ev('closeModal()');
  assert.deepEqual(errors, []);
});
