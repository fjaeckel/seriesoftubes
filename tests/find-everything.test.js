const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// The late-game network: about 100 POPs, 170 customers, 150 links and 300 networks to search through.
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8'));
function big(opts) {
  const g = load(opts);
  g.ev(`S=migrate(JSON.parse(${lit(JSON.stringify(fx.S || fx))}));S.nextFail=1e9;S.nextEvent=1e9;UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();renderAll()`);
  const doc = g.dom.window.document, W = g.dom.window;
  g.type = q => { const i = doc.getElementById('findIn'); i.value = q; i.dispatchEvent(new W.Event('input', { bubbles: true })); return i; };
  g.key = (k, t, o) => (t || doc.body).dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  g.rows = () => [...doc.querySelectorAll('#findList .findrow')];
  g.heads = () => [...doc.querySelectorAll('#findList .findh')].map(h => h.textContent);
  // The groups of a query as {city:[ids], net:[ids], ...}, in the order they are shown.
  g.find = q => JSON.parse(g.ev(`JSON.stringify(findAll(${lit(q)}).map(x=>[x.g,x.rows.map(r=>r[1].k+':'+r[1].id)]))`));
  return g;
}

test('one box finds cities, networks, customers, offers, links and screens', () => {
  const g = big(), { ev, errors } = g;
  ev('ACT.findOpen()');
  const by = q => Object.fromEntries(g.find(q));
  assert.equal(by('amster').city[0], 'city:ams', 'cities as before');
  // Networks by name, by AS number with or without "AS", and in any case.
  const asn = ev('NET.cog.asn');
  assert.equal(by('cogent').net[0], 'net:cog');
  assert.equal(by('AS' + asn).net[0], 'net:cog');
  assert.equal(by('as' + asn).net[0], 'net:cog');
  assert.equal(by(String(asn)).net[0], 'net:cog', 'the bare number');
  assert.ok(!by(String(asn)).city, 'a number finds no city');
  // Customers you signed, and open offers, by name.
  const biz = ev('S.biz[0].name'), off = ev('S.offers[0].name');
  assert.ok(by(biz).cust.includes('cust:' + ev('S.biz[0].id')));
  assert.ok(by(off.toUpperCase()).cust.includes('offer:' + ev('S.offers[0].id')));
  assert.equal(new Set(by('ctrl').cust.map(x => ev(`(S.biz.find(b=>'cust:'+b.id===${lit(x)})||{name:${lit(x)}}).name+'|'+(S.biz.find(b=>'cust:'+b.id===${lit(x)})||{}).city`))).size, by('ctrl').cust.length, 'the same customer in the same city is listed once');
  // Links by the cities at their ends: ids or names, in either order.
  const l = JSON.parse(ev('JSON.stringify(S.links[0])'));
  assert.equal(l.a + ' ' + l.b, 'fra bet');
  for (const q of ['fra bet', 'bet fra', 'Frankfurt Bettembourg', 'frankf bett', 'fra-bet']) assert.equal(by(q).link[0], 'link:' + l.id, q);
  assert.ok(by('fra').link.every(x => ev(`(l=>l.a==='fra'||l.b==='fra')(S.links.find(l=>'link:'+l.id===${lit(x)}))`)), 'one city: its links');
  assert.ok(by('fra').link.length > 1);
  // Two cities with no link between them: both cities, so the search still leads somewhere.
  assert.deepEqual(by('fra ams'), { city: ['city:fra', 'city:ams'] });
  // Screens by their translated name.
  assert.deepEqual(by('bank').go, ['go:bank']);
  assert.ok(by('routing').go.includes('go:routing'));
  assert.ok(by('leased').go.includes('go:d-lease'));
  assert.ok(by('standing').go.includes('go:ops'));
  assert.ok(by('export').go.includes('go:export'));
  assert.deepEqual(g.find('zzqqxx'), []);
  assert.deepEqual(errors, []);
});

test('the best match leads, groups are capped with a "more" row, and the index is built once per open', () => {
  const g = big(), { ev, dom, errors } = g, doc = dom.window.document;
  ev('ACT.findOpen()');
  // "fra": the city is the best match, so Cities come first; two words for two ends put Links first.
  assert.equal(g.find('fra')[0][0], 'city');
  assert.equal(g.find('fra bet')[0][0], 'link');
  assert.equal(g.find('AS' + ev('NET.cog.asn'))[0][0], 'net');
  assert.equal(g.find('new york')[0][0], 'city', 'two words of one city name are not a link');
  g.type('co');
  const groups = g.heads();
  assert.ok(groups.includes('Cities') && groups.includes('Networks') && groups.includes('Customers'), groups.join());
  const cap = ev('FIND_CAP'), acts = g.rows().map(r => r.dataset.act);
  const netRows = () => g.rows().filter(r => r.dataset.act === 'findPick' && JSON.parse(r.dataset.args).k === 'net').length;
  assert.equal(netRows(), cap, 'four networks');
  assert.ok(acts.includes('findMore'), 'and a row for the rest');
  assert.match(doc.getElementById('findList').textContent, /\+\d+ more/);
  assert.equal(g.rows().filter(r => r.classList.contains('on')).length, 1, 'one highlighted row');
  assert.ok(g.rows()[0].classList.contains('on'), 'the first');
  // More: that group opens up, the others stay short.
  g.rows().find(r => r.dataset.act === 'findMore' && JSON.parse(r.dataset.args).g === 'net').click();
  assert.ok(netRows() > cap && netRows() <= ev('FIND_ALL'), 'more networks');
  assert.equal(ev("!!$('findIn')&&!$('modal').hidden"), true, 'the box stays open');
  g.type('com');
  assert.ok(netRows() <= cap, 'typing folds it again');
  // Keys are built when the box opens, not per keystroke: a customer signed later shows up on the next open.
  const ix = ev('UI.findIx===UI.findIx&&!!UI.findIx');
  assert.equal(ix, true);
  ev("window.__ix=UI.findIx");
  g.type('comec');
  assert.equal(ev('UI.findIx===window.__ix'), true, 'same index after typing');
  ev("ACT.closeModal();ACT.findOpen()");
  assert.equal(ev('UI.findIx===window.__ix'), false, 'a fresh one on the next open');
  // Rows are wide enough to tap and say what they are.
  g.type('cogent');
  assert.match(g.rows()[0].textContent, /Cogentle/);
  assert.match(g.rows()[0].textContent, new RegExp('AS' + ev('NET.cog.asn')));
  assert.deepEqual(errors, []);
});

test('taking a result opens it where the game already shows it', () => {
  const g = big(), { ev, dom, errors } = g, doc = dom.window.document;
  const pick = (q, k) => { ev('ACT.findOpen()'); g.type(q); const r = g.rows().find(x => x.dataset.act === 'findPick' && JSON.parse(x.dataset.args).k === k); assert.ok(r, q + ' has a ' + k); r.click(); assert.equal(ev("$('modal').hidden"), true, q + ' closes the box'); };
  pick('tokyo', 'city');
  assert.equal(ev('UI.sel.id'), 'tok');
  pick('cogentle', 'net');
  assert.equal(ev('UI.netFocus'), 'cog');
  assert.equal(ev('UI.left+UI.leftOpen'), 'netstrue', 'the Networks tab, on that network');
  assert.match(doc.getElementById('leftBody').textContent, /Cogentle/);
  const b = JSON.parse(ev('JSON.stringify(S.biz[0])'));
  pick(b.name, 'cust');
  assert.equal(ev('UI.sel.id+UI.tab'), b.city + 'cust', "the customer's city, on its Customers tab");
  const o = JSON.parse(ev('JSON.stringify(S.offers[0])'));
  pick(o.name, 'offer');
  assert.equal(ev('UI.sel.id'), o.city);
  assert.equal(ev('UI.offerAt'), o.id, 'the offer is marked');
  pick('fra bet', 'link');
  assert.equal(ev('UI.sel.type+UI.sel.id'), 'link' + ev('S.links[0].id'));
  pick('leased', 'go');
  assert.equal(ev("!$('dash').hidden&&UI.dtab"), 'lease', 'a dashboard tab');
  pick('bank', 'go');
  assert.equal(ev("$('dash').hidden&&!$('bankBox').hidden"), true, 'the bank');
  ev('ACT.bankClose()');
  pick('deals', 'go');
  assert.equal(ev('UI.left+UI.leftOpen'), 'dealstrue');
  // Windows open through their own action, in place of the box.
  ev('ACT.findOpen()'); g.type('routing');
  const r = g.rows().find(x => x.dataset.act === 'routingOpen'); assert.ok(r); r.click();
  assert.equal(ev("!$('modal').hidden&&!!$('modalCard').querySelector('[data-routing]')"), true);
  ev('ACT.closeModal()');
  // Things that are gone, and made-up ids, do nothing.
  ev("ACT.findOpen();ACT.findPick({k:'link',id:'nope'});ACT.findPick({k:'go',id:'export'});ACT.findPick({k:'wat',id:'fra'});ACT.findPick({});ACT.findMore({g:'wat'})");
  assert.equal(ev("$('modal').hidden"), false, 'the box is still open');
  assert.equal(ev('UI.sel.type'), 'link');
  assert.deepEqual(errors, []);
});

test('nothing typed: what you opened last, your home, cities with trouble and every screen', () => {
  const g = big(), { ev, errors } = g;
  ev('ACT.findOpen()');
  assert.deepEqual(g.heads(), ['Cities', 'Screens & actions'], 'no recent picks yet');
  assert.deepEqual(JSON.parse(g.rows()[0].dataset.args), { k: 'city', id: ev('S.home') });
  assert.match(g.rows()[0].textContent, /home/);
  const acts = g.rows().map(r => r.dataset.act + (r.dataset.act === 'findPick' ? ':' + JSON.parse(r.dataset.args).id : ''));
  for (const a of ['findPick:dash', 'findPick:d-cust', 'findPick:d-conn', 'findPick:d-traffic', 'findPick:d-links', 'findPick:d-routers', 'findPick:d-pops', 'findPick:d-lease', 'findPick:d-market', 'findPick:goals', 'findPick:deals', 'findPick:noc', 'findPick:nets', 'findPick:bank', 'routingOpen', 'opsOpen', 'settings', 'help', 'keys', 'exportSave']) assert.ok(acts.includes(a), a);
  // An incident in a city lists it, with what is wrong.
  ev("S.inc.push({id:'x1',type:'power',ref:'tok',start:S.day,until:S.day+3,msg:'dark'},{id:'x2',type:'power',ref:'tok',start:S.day,until:S.day+3,msg:'dark'});ACT.closeModal();ACT.findOpen()");
  const tok = g.rows().find(r => r.dataset.act === 'findPick' && JSON.parse(r.dataset.args).id === 'tok');
  assert.ok(tok, 'Tokyo is listed');
  assert.match(tok.textContent, new RegExp(ev("incTitle('power')")));
  assert.equal(g.rows().filter(r => r.dataset.args.includes('"tok"')).length, 1, 'once');
  // Picks are remembered, newest first, and things that are gone drop out.
  tok.click();
  ev("ACT.findOpen()"); g.type('fra bet'); g.rows()[0].click();
  ev("ACT.findPick({k:'net',id:'cog'});ACT.findOpen()");
  assert.equal(g.heads()[0], 'Recent');
  const lid = ev('S.links[0].id');
  assert.deepEqual(g.rows().slice(0, 3).map(r => JSON.parse(r.dataset.args)), [{ k: 'net', id: 'cog' }, { k: 'link', id: lid }, { k: 'city', id: 'tok' }]);
  ev("S.links=S.links.filter(l=>l.id!==" + lit(lid) + ");ACT.closeModal();ACT.findOpen()");
  assert.deepEqual(g.rows().slice(0, 2).map(r => JSON.parse(r.dataset.args).k), ['net', 'city']);
  for (let i = 0; i < 6; i++) ev(`ACT.findPick({k:'city',id:${lit(['ams', 'lon', 'par', 'nyc', 'syd', 'sin'][i])}})`);
  assert.equal(ev('UI.findRecent.length'), ev('FIND_CAP'), 'a short memory');
  // Clearing the box brings the shortcuts back.
  ev('ACT.findOpen()'); g.type('tokyo'); assert.equal(g.heads()[0], 'Cities'); assert.ok(!g.heads().includes('Recent')); g.type('  ');
  assert.equal(g.heads()[0], 'Recent');
  assert.deepEqual(errors, []);
});

test('keyboard: arrows walk every group, Enter takes the highlighted row, Escape closes, Ctrl+K opens', () => {
  const g = big(), { ev, dom, errors } = g, doc = dom.window.document;
  g.key('k', null, { ctrlKey: true });
  assert.equal(ev("!$('modal').hidden&&!!$('findIn')"), true, 'Ctrl+K opens it');
  g.key('Escape', doc.getElementById('findIn'));
  assert.equal(ev("$('modal').hidden"), true);
  g.key('k', null, { metaKey: true });
  assert.equal(ev("!!$('findIn')&&!$('modal').hidden"), true, 'and Cmd+K');
  ev('ACT.closeModal()');
  g.key('k');
  assert.equal(ev("$('modal').hidden"), true, 'a plain k does not');
  g.key('/');
  const inp = g.type('fra');
  const rows = g.rows(), n = rows.length;
  assert.ok(n > ev('FIND_CAP') + 2, 'several groups');
  // Down past the Cities group into the next one.
  const cityN = rows.filter(r => r.dataset.args.includes('"k":"city"')).length, at = cityN + 1;
  for (let i = 0; i < at; i++) g.key('ArrowDown', inp);
  assert.equal(g.rows().findIndex(r => r.classList.contains('on')), at);
  const want = JSON.parse(g.rows()[at].dataset.args);
  assert.notEqual(want.k, 'city');
  for (let i = 0; i < n + 5; i++) g.key('ArrowDown', inp);
  assert.equal(g.rows().findIndex(r => r.classList.contains('on')), n - 1, 'stops at the last row');
  for (let i = 0; i < n + 5; i++) g.key('ArrowUp', inp);
  assert.equal(g.rows().findIndex(r => r.classList.contains('on')), 0, 'and at the first');
  for (let i = 0; i < at; i++) g.key('ArrowDown', inp);
  g.key('Enter', inp);
  assert.equal(ev("$('modal').hidden"), true, 'Enter takes it');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(UI.findRecent[0])')), want);
  // Enter on the "more" row opens the group and keeps the box.
  g.key('/'); const i2 = g.type('co');
  const m = g.rows().findIndex(r => r.dataset.act === 'findMore');
  for (let i = 0; i < m; i++) g.key('ArrowDown', i2);
  const before = g.rows().length;
  g.key('Enter', i2);
  assert.ok(g.rows().length > before);
  assert.equal(ev("$('modal').hidden"), false);
  assert.deepEqual(errors, []);
});

test('on a phone the screens fit, and picking a link from a POP still only lists cities', () => {
  const g = big(), { ev, dom, errors } = g, doc = dom.window.document;
  ev('window.innerWidth=360;ACT.findOpen()');
  assert.equal(g.rows().some(r => r.dataset.act === 'keys'), false, 'no keyboard shortcuts on a phone');
  assert.doesNotMatch(doc.getElementById('modalCard').textContent, /Ctrl/, 'and no keyboard tip');
  assert.ok(doc.querySelector('#modalCard .findtop #findIn'), 'the box is in the pinned head');
  assert.ok(doc.querySelector('#modalCard .findtop [data-act="closeModal"]'), 'with a close button');
  ev("ACT.findPick({k:'go',id:'nets'})");
  assert.equal(ev('UI.left+UI.leftOpen'), 'netstrue');
  ev("ACT.findOpen();ACT.findPick({k:'go',id:'nets'})");
  assert.equal(ev('UI.left+UI.leftOpen'), 'netstrue', 'a tab that is open stays open');
  ev("ACT.findOpen();ACT.findPick({k:'net',id:'cog'})");
  assert.equal(ev('UI.netFocus+UI.leftOpen'), 'cogtrue');
  // The link picker (#343) is the same box with cities only.
  ev("ACT.findLink({city:'fra'})");
  assert.match(doc.getElementById('modalCard').textContent, /New link from Frankfurt/);
  g.type('cogent');
  assert.equal(g.rows().length, 0);
  assert.match(doc.getElementById('findList').textContent, /No city matches/);
  g.type('tokyo');
  assert.deepEqual(g.rows().map(r => r.dataset.act), ['linkTo']);
  assert.deepEqual(g.heads(), []);
  assert.deepEqual(errors, []);
});

test('in German the headings and screens are German, and screens are found by their German names', () => {
  const g = big({ lang: 'de' }), { ev, errors } = g;
  ev('ACT.findOpen()');
  assert.match(g.dom.window.document.getElementById('modalCard').textContent, /Alles finden/);
  assert.deepEqual(g.heads(), ['Städte', 'Ansichten & Aktionen']);
  assert.ok(Object.fromEntries(g.find('einstell')).go.includes('go:settings'));
  assert.deepEqual(errors, []);
});
