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
  // A port you hold is one compact row: its load, its bill, the next size up and "Change"; the rest unfolds.
  const tchg = () => acts(g, 'panelFold').filter(b => /^t:/.test(JSON.parse(b.dataset.args).k));
  assert.equal(tchg().length, have);
  assert.ok(q(g, '.row')[0].querySelector('[data-act="panelFold"]'), 'your ports come first');
  assert.equal(acts(g, 'cancelTransit').length, 0, 'cancelling is behind "Change"');
  assert.equal(q(g, '.row.crow .cuse').length, have);
  tchg()[0].click();
  assert.equal(acts(g, 'cancelTransit').length, 1);
  const bs = [...q(g, '.row')[0].querySelectorAll('.b')].map(b => b.dataset.act);
  assert.equal(bs[bs.length - 1], 'cancelTransit', 'cancel comes last');
  assert.ok(q(g, '[data-act="cancelTransit"]')[0].classList.contains('quiet'));
  tchg()[0].click();
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

test('Peering: three sections with a summary line; what needs you is open, the rest one tap away', () => {
  const g = big(), { ev } = g;
  city(g, 'peer');
  assert.deepEqual(q(g, '.psec').map(x => x.dataset.sec), ['ix', 'pni', 'cache']);
  for (const x of q(g, '.psb')) assert.ok(x.querySelector('.pss').textContent.trim(), 'every heading has a summary');
  const sec = k => q(g, `.psec[data-sec="${k}"]`)[0], head = k => sec(k).querySelector('.psb');
  // Open by itself only with something flagged; and then only what needs you plus "Show all".
  for (const k of ['ix', 'pni', 'cache']) {
    const flagged = !!sec(k).querySelector('.psf');
    assert.equal(sec(k).classList.contains('on'), flagged, k);
    if (flagged) assert.ok(sec(k).querySelector('.pnmore [data-act="panelFold"]'), k + ': show all');
  }
  assert.equal(acts(g, 'cancelPni').length, 0);
  assert.ok(q(g, '.row').length < 12, 'a short first view, not dozens of rows');
  // The PNIs: every one you have is a short row once the section is open, its controls behind "Change".
  const pnis = ev("S.pni.filter(p=>p.city==='fra').length");
  assert.ok(pnis > 4);
  ev("ACT.panelFold({k:'s:pni',o:1})");
  assert.ok(sec('pni').classList.contains('on'));
  const chg = () => acts(g, 'panelFold').filter(b => /^p:/.test(JSON.parse(b.dataset.args).k));
  assert.equal(chg().length, pnis, 'every PNI you have here');
  assert.equal(q(g, '.psec[data-sec="pni"] .prow.crow .cuse').length, pnis, 'one line and a use bar each');
  chg()[0].click();
  assert.equal(acts(g, 'cancelPni').length, 1, 'Remove (one tap, then Undo)');
  assert.match(chg()[0].textContent, /▾ Change/);
  head('pni').click();
  assert.ok(!sec('pni').classList.contains('on'), 'the heading folds it again');
  assert.equal(acts(g, 'cancelPni').length, 0);
  // An exchange: its row, then the full block (members a page at a time) behind "Change".
  const x = ev("ixIdsIn('fra').filter(i=>S.ixp[i]!==undefined).sort((a,b)=>ixMembers(b).length-ixMembers(a).length)[0]"), n = ev(`ixMembers('${x}').length`);
  assert.ok(n > 6);
  if (!sec('ix').classList.contains('on')) head('ix').click();
  if (q(g, '.psec[data-sec="ix"] .pnmore [data-act="panelFold"]').length) q(g, '.psec[data-sec="ix"] .pnmore [data-act="panelFold"]')[0].click();
  assert.equal(q(g, '.psec[data-sec="ix"] .row.crow').length, ev("ixIdsIn('fra').length"), 'every exchange in town is a row');
  acts(g, 'panelFold').find(b => JSON.parse(b.dataset.args).k === 'x:' + x).click();
  const more = q(g, '[data-act="panelMore"]').find(b => JSON.parse(b.dataset.args).k === 'ix:' + x);
  assert.match(more.textContent, new RegExp(`\\+${n - 4} more networks`));
  // A search opens the sections it finds something in and folds the others.
  const pn = ev("NET[S.pni.find(p=>p.city==='fra').net].name");
  ev(`ACT.netFind({q:${JSON.stringify(pn)}})`);
  assert.ok(sec('pni').classList.contains('on'));
  assert.ok(q(g, '.psec[data-sec="pni"] .prow').length >= 1);
  ev("ACT.netFind({q:'zzzz no such network'})");
  assert.deepEqual(q(g, '.psec.on').map(x => x.dataset.sec), []);
  ev('ACT.netClear()');
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
  // The routers are one line (model × count, load and ports bars); their buttons and spec sheet unfold under Change.
  const rg = q(g, '.rgrp');
  assert.equal(rg.length, 1);
  assert.equal(rg[0].querySelectorAll('.rbars .bar').length, 2, 'load and ports');
  assert.equal(acts(g, 'upRouter').length + acts(g, 'addRouter').length, 0, 'folded: no router buttons');
  // POP standards stay one tap away (their own fold), not hidden behind the routers' Change (#315).
  assert.ok(ev('ptOn()'));
  assert.ok(acts(g, 'panelFold').some(b => JSON.parse(b.dataset.args).k === 'std'), 'POP standards in view');
  assert.match(q(g, '.scroll')[0].textContent, /POP standards/);
  const chg = rg[0].querySelector('[data-act="panelFold"]');
  assert.deepEqual(JSON.parse(chg.dataset.args), { k: 'rtc', o: 1 });
  ev(`ACT.panelFold(${chg.dataset.args})`);
  assert.ok(acts(g, 'upRouter').length + acts(g, 'addRouter').length > 0, 'the router buttons');
  const kv = q(g, '.kv span').map(x => x.textContent), btns = q(g, '.b').map(x => x.dataset.act);
  assert.ok(btns.indexOf('models') >= 0 && kv.includes('Boot time'));
  const html = q(g, '.scroll')[0].innerHTML;
  assert.ok(html.indexOf('data-act="models"') < html.indexOf('Boot time'), 'the buttons come before the spec sheet');
  // The rarely used sections are folded to one line each; their chip unfolds them.
  for (const k of ['metro', 'power', 'scrub']) assert.ok(!q(g, `.psec[data-sec="${k}"]`)[0].classList.contains('on'), k);
  ev("ACT.panelJump({k:'power'})");
  assert.ok(q(g, '.psec[data-sec="power"]')[0].classList.contains('on'));
  ev("ACT.panelJump({k:'no such'});ACT.panelJump({k:'\"]'})");
  assert.deepEqual(g.errors, []);
});

test('Infra: full routers unfold their buttons by themselves; the kit is one row with its buttons', () => {
  const g = big(), { ev } = g;
  city(g, 'links');
  // The redundancy kit: its name and price on the left, Apply and Utilities on the same row.
  const kit = q(g, 'section.kitl .row');
  assert.equal(kit.length, 1);
  assert.ok(kit[0].querySelector('[data-act="utilities"]') && kit[0].querySelector('[data-act="utilityKit"]'));
  // A router at its limit needs you: the buttons show without a tap, and Change folds them away.
  ev("R.nodeLoad.fra=R.nodeCap.fra;renderPanel()");
  assert.ok(acts(g, 'upRouter').length + acts(g, 'addRouter').length > 0);
  assert.deepEqual(JSON.parse(q(g, '.rgrp [data-act="panelFold"]')[0].dataset.args), { k: 'rtc', o: 0 });
  ev("ACT.panelFold({k:'rtc',o:0})");
  assert.equal(acts(g, 'upRouter').length + acts(g, 'addRouter').length, 0);
  assert.deepEqual(g.errors, []);
});

test('Infra early in the game: every router button in view, no Change to find', () => {
  const { ev, errors, dom } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();closeModal();S.cash=1e9;ACT.buildPop({city:'fra'});closeModal();selectCity('fra');ACT.tab({t:'links'})");
  const d = dom.window.document;
  assert.ok(d.querySelector('#panelBody .rgrp'));
  assert.ok(d.querySelector('#panelBody [data-act="addRouter"]'), 'Add router');
  assert.equal(d.querySelector('#panelBody .rgrp [data-act="panelFold"]'), null);
  assert.deepEqual(errors, []);
});

test('a link: redundancy check next to the parallel link, what is on it one line that unfolds to the top three sources', () => {
  const g = big(), { ev } = g;
  const id = ev("S.links.filter(l=>l.kind!=='df'&&l.kind!=='vxc'&&!linkDown(l)&&R.ef[edgeKey(l)]&&Object.keys(R.ef[edgeKey(l)].net).length>5)[0].id");
  ev(`ACT.selLink({id:'${id}'})`);
  const row = acts(g, 'addParallel')[0].parentElement;
  assert.ok(row.querySelector('[data-act="linkCheck"]'), 'one row: add a parallel link, check redundancy');
  assert.equal(acts(g, 'linkCheck').length, 1);
  const txt = () => q(g, '.scroll')[0].textContent;
  assert.ok(!/Redundancy check/.test(txt()) && !/Enters your network at/.test(txt()) && !/Going to customers in/.test(txt()));
  const traf = () => q(g, 'section[data-sec="traf"]')[0];
  if (!traf().querySelector('.psf')) {
    // A link with room folds to its total and its biggest source; a busy one opens with its biggest feeder.
    assert.ok(!traf().classList.contains('on') && /%/.test(traf().querySelector('.pss').textContent));
    assert.equal(q(g, '.kv .dot').length, 0);
  }
  ev("ACT.panelFold({k:'s:traf',o:1})");
  assert.equal(q(g, '.kv .dot').length, 3, 'three sources');
  const fold = acts(g, 'panelFold').find(b => JSON.parse(b.dataset.args).k === 'tr');
  assert.match(fold.textContent, /▸ More: where it enters, where it goes/);
  fold.click();
  assert.equal(q(g, '.kv .dot').length, 6);
  assert.ok(/Enters your network at/.test(txt()) && /Going to customers in/.test(txt()));
  assert.ok(acts(g, 'goEgress').length > 0, 'the entry points can be opened');
  // The daily re-render keeps it open; the next link has it open too (it is one fold for every link, see sticky-more-folds) until you fold it.
  ev('renderAll()');
  assert.ok(/Going to customers in/.test(txt()));
  const next = ev(`S.links.filter(l=>l.id!=='${id}'&&l.kind!=='df'&&l.kind!=='vxc'&&!linkDown(l)&&R.ef[edgeKey(l)]&&Object.keys(R.ef[edgeKey(l)].net).length>5)[0].id`);
  ev(`ACT.selLink({id:'${next}'});ACT.panelFold({k:'s:traf',o:1})`);
  assert.ok(/Going to customers in/.test(txt()), 'open on the next link, as you left it');
  acts(g, 'panelFold').find(b => JSON.parse(b.dataset.args).k === 'tr').click();
  assert.ok(!/Going to customers in/.test(txt()));
  ev(`ACT.selLink({id:'${id}'});ACT.panelFold({k:'s:traf',o:1})`);
  assert.ok(!/Going to customers in/.test(txt()), 'folded again, and forgotten');
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
  // A beginner's Peering tab: every section open, every explanation in view.
  ev("ACT.tab({t:'peer'})");
  assert.deepEqual(q(g, '.psec').map(x => x.classList.contains('on')), [true, true, true]);
  assert.equal(q(g, '.hb').length, 0);
  assert.ok(q(g, '.scroll')[0].textContent.includes(ev("tr('city_panel.cdns_put_free_cache_servers_inside')")));
  assert.deepEqual(g.errors, []);
});

test('NOC tab on a phone: Inspect gets a finger-sized tap area without taller rows', () => {
  const g = big(), { ev } = g;
  ev("UI.left='noc';UI.leftOpen=true;renderAll()");
  const d = g.dom.window.document;
  assert.ok(d.querySelector('#leftBody .row>.b.sm[data-act="selLink"],#leftBody .row>.b.sm[data-act="focusCity"]'), 'row buttons are direct children of their row');
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('');
  assert.match(css, /#leftBody \.row>\.b\.sm\{min-height:32px;position:relative\}/);
  assert.match(css, /#leftBody \.row>\.b\.sm::after\{content:"";position:absolute;inset:-5\.5px -4px\}/, 'the hit area reaches past the 2.5 px border: about 38 px tall');
  assert.deepEqual(g.errors, []);
});
