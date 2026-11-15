// The city and link panels stay short: a first page of every long list with "+N more", explanations behind a "?" once
// the network has a few POPs, the link's full traffic breakdown one tap away, and chips that jump to a section.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');
const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = () => {
  const g = load();
  g.dom.window.__big = BIG;
  g.ev('S=migrate(JSON.parse(window.__big));UI.started=true;UI.speed=0;UI.sel=null;closeModal();compute()');
  return g;
};
const q = (g, s) => [...g.dom.window.document.querySelectorAll('#panelBody ' + s)];
const city = (g, tab) => g.ev(`selectCity('fra');ACT.tab({t:'${tab}'})`);
const acts = (g, act) => q(g, `[data-act="${act}"]`);

test('the city header: picture, name, close and the traceroute icon on one row, the facts under them', () => {
  const g = big();
  city(g, 'cust');
  const ph = q(g, '.ph.cph')[0];
  assert.ok(ph, 'the city header');
  assert.deepEqual([...ph.children].map(x => x.className.split(' ')[0]), ['rgpic', 'pht', 'x', 'facts']);
  const tr = ph.querySelector('.facts [data-act="trace"]');
  assert.equal(tr.getAttribute('aria-label'), 'Traceroute');
  assert.equal(tr.getAttribute('title'), 'Traceroute');
  assert.deepEqual(g.errors, []);
});

test('Transit: your ports first, then a short page of sellers; the lead folds behind a "?"', () => {
  const g = big(), { ev } = g;
  city(g, 'up');
  const have = ev("S.transit.filter(t=>t.city==='fra').length"), all = ev("NETS.filter(n=>sellsAt(n,'fra')).length");
  assert.ok(have > 0 && all - have > 6, 'the fixture has ports in Frankfurt and many more sellers');
  assert.equal(q(g, '.row').length, have + 2, 'every port you have and two more sellers');
  assert.equal(acts(g, 'cancelTransit').length, have);
  assert.ok(q(g, '.row')[0].querySelector('[data-act="cancelTransit"]'), 'your ports come first');
  const more = q(g, '.pnmore [data-act="panelMore"]')[0];
  assert.match(more.textContent, new RegExp(`\\+${all - have - 2} more networks`));
  more.click();
  assert.equal(q(g, '.row').length, Math.min(all, have + 22), 'another page');
  // The explanation: gone from view, one tap on "?" away.
  const lead = ev("tr('city_panel.pay_a_bigger_network_per_gbps')");
  assert.ok(!q(g, '.scroll')[0].textContent.includes(lead));
  const hb = q(g, 'h3 .hb')[0];
  assert.equal(hb.getAttribute('aria-expanded'), 'false');
  hb.click();
  assert.ok(q(g, '.scroll')[0].textContent.includes(lead));
  assert.equal(q(g, 'h3 .hb')[0].getAttribute('aria-expanded'), 'true');
  // Another tab starts short again.
  ev("ACT.tab({t:'cust'});ACT.tab({t:'up'})");
  assert.equal(q(g, '.row').length, have + 2);
  assert.deepEqual(g.errors, []);
});

test('Peering: exchanges list four members at a time, PNIs you have always show, chips jump to a section', () => {
  const g = big(), { ev } = g;
  city(g, 'peer');
  const x = ev("ixIdsIn('fra').filter(i=>S.ixp[i]!==undefined).sort((a,b)=>ixMembers(b).length-ixMembers(a).length)[0]"), n = ev(`ixMembers('${x}').length`);
  assert.ok(n > 6, 'a joined exchange with more members than a first page');
  const more = q(g, '[data-act="panelMore"]').find(b => JSON.parse(b.dataset.args).k === 'ix:' + x);
  assert.match(more.textContent, new RegExp(`\\+${n - 4} more networks`));
  const pnis = ev("S.pni.filter(p=>p.city==='fra').length");
  assert.ok(pnis > 0);
  // With this many PNIs each one is a short row; its controls unfold with "Change".
  assert.ok(pnis > 4);
  const chg = () => acts(g, 'panelFold').filter(b => /^p:/.test(JSON.parse(b.dataset.args).k));
  assert.equal(chg().length, pnis, 'every PNI you have here is on the first page');
  assert.equal(q(g, '.pchip.pk-here').length, pnis);
  assert.equal(acts(g, 'cancelPni').length, 0);
  chg()[0].click();
  assert.equal(acts(g, 'cancelPni').length, 1, 'one tap shows the upgrades, the egress choice and Remove');
  assert.match(chg()[0].textContent, /▾ Change/);
  assert.ok(q(g, '.prow').length < pnis + 3 * 5 + 1, 'at most three candidates per group');
  assert.ok(q(g, '.row').length < 60, 'a few dozen rows, not hundreds');
  assert.deepEqual(acts(g, 'panelJump').map(b => b.textContent), ['Internet Exchanges', 'PNIs', 'Caches']);
  for (const k of ['ix', 'pni', 'cache']) assert.equal(q(g, `[data-sec="${k}"]`).length, 1, k);
  ev("ACT.panelJump({k:'pni'});ACT.panelJump({k:'no such'});ACT.panelJump({k:'\"]'})");
  assert.deepEqual(g.errors, []);
});

test('Customers: offers first once broadband runs, a first page of businesses with the unhappy ones on top', () => {
  const g = big(), { ev } = g;
  const c = ev("(()=>{const n={};for(const b of S.biz)for(const x of bCities(b))n[x]=(n[x]||0)+1;return Object.keys(n).filter(x=>S.pops[x]&&S.pops[x].bb).sort((a,b)=>n[b]-n[a])[0]})()");
  const n = ev(`S.biz.filter(b=>bCities(b).includes('${c}')).length`);
  ev(`S.biz.filter(b=>bCities(b).includes('${c}')).slice(-1)[0].mood=5;S.offers=[{...S.offers[0],id:'ofx',city:'${c}',city2:null}];selectCity('${c}');ACT.tab({t:'cust'})`);
  const heads = q(g, 'section h3').map(h => h.textContent);
  assert.equal(heads[0], 'Offers here');
  if (n > 7) {
    assert.equal(acts(g, 'dropBiz').length, 5);
    assert.match(q(g, '.pnmore')[0].textContent, new RegExp(`\\+${n - 5} more customers`));
  } else assert.equal(acts(g, 'dropBiz').length, n);
  const last = ev(`S.biz.filter(b=>bCities(b).includes('${c}')).slice(-1)[0].id`);
  assert.equal(JSON.parse(acts(g, 'dropBiz')[0].dataset.args).id, last, 'the unhappy customer leads the list');
  assert.deepEqual(g.errors, []);
});

test('Infra: links right under the routers, the standards folded, every section one chip away', () => {
  const g = big(), { ev } = g;
  city(g, 'links');
  const secs = q(g, '[data-sec]').map(x => x.dataset.sec);
  assert.deepEqual(secs.slice(0, 5), ['rt', 'fib', 'metro', 'power', 'scrub']);
  assert.ok(acts(g, 'upRouter').length + acts(g, 'addRouter').length > 0, 'the router buttons');
  const kv = q(g, '.kv span').map(x => x.textContent), btns = q(g, '.b').map(x => x.dataset.act);
  assert.ok(btns.indexOf('models') >= 0 && kv.includes('Boot time'));
  const html = q(g, '.scroll')[0].innerHTML;
  assert.ok(html.indexOf('data-act="models"') < html.indexOf('Boot time'), 'the buttons come before the spec sheet');
  assert.deepEqual(g.errors, []);
});

test('a link: redundancy check next to the parallel link, the top three sources, the rest unfolds', () => {
  const g = big(), { ev } = g;
  const id = ev("S.links.filter(l=>l.kind!=='df'&&l.kind!=='vxc'&&!linkDown(l)&&R.ef[edgeKey(l)]&&Object.keys(R.ef[edgeKey(l)].net).length>5)[0].id");
  ev(`ACT.selLink({id:'${id}'})`);
  const row = acts(g, 'addParallel')[0].parentElement;
  assert.ok(row.querySelector('[data-act="linkCheck"]'), 'one row: add a parallel link, check redundancy');
  assert.equal(acts(g, 'linkCheck').length, 1);
  const txt = () => q(g, '.scroll')[0].textContent;
  assert.ok(!/Redundancy check/.test(txt()) && !/Enters your network at/.test(txt()) && !/Going to customers in/.test(txt()));
  assert.equal(q(g, '.kv .dot').length, 3, 'three sources');
  const fold = acts(g, 'panelFold').find(b => JSON.parse(b.dataset.args).k === 'tr');
  assert.match(fold.textContent, /▸ More: where it enters, where it goes/);
  fold.click();
  assert.equal(q(g, '.kv .dot').length, 6);
  assert.ok(/Enters your network at/.test(txt()) && /Going to customers in/.test(txt()));
  assert.ok(acts(g, 'goEgress').length > 0, 'the entry points can be opened');
  // The daily re-render keeps it open; another link starts folded.
  ev('renderAll()');
  assert.ok(/Going to customers in/.test(txt()));
  ev(`ACT.selLink({id:S.links.find(l=>l.id!=='${id}'&&l.kind!=='df'&&l.kind!=='vxc').id})`);
  assert.ok(!/Going to customers in/.test(txt()));
  assert.deepEqual(g.errors, []);
});

test('a new game keeps every explanation and has no "?" yet; short lists are never cut for one or two rows', () => {
  const g = load(), { ev } = g;
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e8;selectCity(S.home);ACT.tab({t:'up'})");
  assert.equal(q(g, '.hb').length, 0);
  assert.ok(q(g, '.scroll')[0].textContent.includes(ev("tr('city_panel.pay_a_bigger_network_per_gbps')")));
  assert.equal(ev('pnN("x",8,6)'), 8, 'eight rows show whole: "more" would hide two');
  assert.equal(ev('pnN("x",9,6)'), 6);
  ev("ACT.tab({t:'links'})");
  assert.ok(/Redundancy check|Fiber from/.test(q(g, '.scroll')[0].textContent));
  assert.ok(q(g, '.scroll')[0].textContent.includes(ev("tr('city_panel.the_model_sets_your_fastest')")));
  assert.deepEqual(g.errors, []);
});
