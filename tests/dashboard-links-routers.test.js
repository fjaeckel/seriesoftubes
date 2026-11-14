// The NOC dashboard's Links and Routers tabs: every link and every POP, sorted by load or by name, filtered by kind, load
// and city, with the link panel's own buttons for one more optic, one more fiber pair or a bigger wave.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
// mixed: the fixture only has leased waves, so a few become IRU dark fiber, fiber of your own and subsea fiber of your own.
const MIXED = (() => { const j = JSON.parse(BIG);
  j.links.forEach((l, i) => { if (i < 3) Object.assign(l, { kind: 'df', own: false });
    else if (i < 7) Object.assign(l, { kind: 'df', own: true, sys: 'lite', ch: [] });
    else if (i < 9) Object.assign(l, { kind: 'df', own: true, sub: true, sys: 'roadm', ch: [] }); });
  return JSON.stringify(j); })();
const big = (t, save = BIG, tab = 'links') => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.ev(`S=migrate(JSON.parse(${lit(save)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();ACT.dash();ACT.dashTab({k:'${tab}'})`); return h; };
const json = (ev, code) => JSON.parse(ev(`JSON.stringify(${code})`));
const links = (ev) => json(ev, "[...document.querySelectorAll('#linksSec .ihit')].map(b=>JSON.parse(b.dataset.args).id)");
const pops = (ev) => json(ev, "[...document.querySelectorAll('#routersSec .rrow')].map(b=>JSON.parse(b.dataset.args).city)");
const more = (ev, k) => { while (ev(`!!document.querySelector('#${k}Sec [data-act="listMore"]')`)) ev(`ACT.listMore({k:'${k}'})`); };
const use = (ev, ids) => json(ev, `${lit(ids)}.map(id=>{const l=S.links.find(x=>x.id===id),c=capOf(l);return c>0?(R.load[id]||0)/c:0;})`);
const linkNames = (ev) => json(ev, `${lit(links(ev))}.map(id=>{const l=S.links.find(x=>x.id===id);return (CITY[l.a].name+' '+CITY[l.b].name).toLowerCase();})`);
const chips = (ev, act) => json(ev, `[...document.querySelectorAll('#dashCard [data-act="${act}"]')].map(b=>b.textContent)`);
const desc = (a) => a.every((v, i) => !i || a[i - 1] >= v);
const asc = (a) => a.every((v, i) => !i || a[i - 1] <= v);

test('Links and Routers are tabs of their own; the old tab name and the n k / n r keys find them', (t) => {
  const { ev, errors } = big(t);
  const tabs = json(ev, "[...document.querySelectorAll('.dtabs button')].map(b=>JSON.parse(b.dataset.args).k)");
  assert.ok(tabs.includes('links') && tabs.includes('routers') && !tabs.includes('infra'));
  assert.ok(ev("!!$('linksSec')&&!$('routersSec')"), 'the Links tab shows links only');
  ev("ACT.dashTab({k:'routers'})");
  assert.ok(ev("!$('linksSec')&&!!$('routersSec')"), 'the Routers tab shows routers only');
  assert.ok(ev("$('dashCard').textContent.includes('AS'+S.asn)"), 'with the AS facts next to them');
  ev("ACT.dashTab({k:'infra'})");
  assert.equal(ev('UI.dtab'), 'links', 'the old name still opens Links');
  assert.deepEqual(json(ev, "[DASH_KEYS.k,DASH_KEYS.r]"), ['links', 'routers']);
  assert.deepEqual(errors, []);
});

test('every link and every POP is listed: the top 10 first, then 50 more at a time', (t) => {
  const { ev, errors } = big(t);
  const nl = ev('S.links.length'), np = ev('Object.keys(S.pops).length');
  assert.ok(nl > 100 && np > 100, 'the fixture is big enough to need a third page');
  assert.equal(links(ev).length, 10, 'the first look fits the window');
  assert.match(ev("$('linksSec').textContent"), /View 50 more links/);
    assert.ok(ev("$('linksSec').firstElementChild.classList.contains('ibar')"), 'the filters come first');
  ev("ACT.listMore({k:'links'})");
  assert.equal(links(ev).length, 60);
  assert.ok(ev("document.querySelector('#linksSec .btns.lmore')&&!document.querySelector('#linksSec .btns.lmore').getAttribute('style')"), 'no stray inline margin');
  assert.ok(ev("$('linksSec').lastElementChild.classList.contains('lmore')"), 'the button is the last thing in the panel');
  more(ev, 'links');
  assert.equal(links(ev).length, nl);
  ev("ACT.dashTab({k:'routers'})"); more(ev, 'routers');
  assert.equal(pops(ev).length, np);
  assert.ok(ev("!document.querySelector('#routersSec .lmore')"), 'no button once everything is shown');
  assert.deepEqual(errors, []);
});

test('links sort busiest first, flip to quietest first, and sort by name', (t) => {
  const { ev, errors } = big(t);
  more(ev, 'links');
  assert.ok(desc(use(ev, links(ev))), 'busiest first by default');
  ev("ACT.infraSort({w:'links',k:'use'})");
  assert.equal(links(ev).length, 10, 'a new order starts again at the first page');
  more(ev, 'links');
  assert.ok(asc(use(ev, links(ev))), 'a second tap shows the quietest first');
  ev("ACT.infraSort({w:'links',k:'name'})"); more(ev, 'links');
  assert.ok(asc(linkNames(ev)), 'A to Z');
  assert.match(ev("document.querySelector('#linksSec .pink[data-act=\"infraSort\"]').textContent"), /Name ▲/);
  ev("ACT.infraSort({w:'links',k:'name'})"); more(ev, 'links');
  assert.ok(desc(linkNames(ev)), 'Z to A');
  assert.deepEqual(errors, []);
});

test('routers sort on their own and filter by load', (t) => {
  const { ev, errors } = big(t, BIG, 'routers');
  ev("ACT.infraSort({w:'routers',k:'name'})"); more(ev, 'routers');
  const names = json(ev, `${lit(pops(ev))}.map(c=>CITY[c].name.toLowerCase())`);
  assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  ev("ACT.infraSort({w:'routers',k:'use'})"); more(ev, 'routers');
  assert.ok(desc(json(ev, `${lit(pops(ev))}.map(c=>(R.nodeLoad[c]||0)/(R.nodeCap[c]||1))`)), 'busiest routers first');
  assert.equal(json(ev, 'infraSortOf("links")').k, 'use', 'the links keep their own order');
  ev("for(const c of Object.keys(S.pops).slice(0,3))R.nodeLoad[c]=(R.nodeCap[c]||1)*0.95;renderDash()");
  assert.ok(chips(ev, 'infraHot').some((c) => c === 'Over 90% full (3)'), JSON.stringify(chips(ev, 'infraHot')));
  assert.ok(!chips(ev, 'infraHot').some((c) => /Down/.test(c)), 'routers have no "down" filter');
  ev("ACT.infraHot({w:'routers',v:'hot'})");
  assert.deepEqual([...pops(ev)].sort(), json(ev, 'Object.keys(S.pops).slice(0,3).sort()'));
  ev("ACT.infraHot({w:'routers',v:'hot'})");
  assert.equal(pops(ev).length, 10, 'a second tap shows every router again');
  assert.deepEqual(errors, []);
});

test('links filter by kind: leased waves, IRU dark fiber, own terrestrial fiber, own subsea fiber', (t) => {
  const { ev, errors } = big(t, MIXED);
  const kinds = json(ev, 'Object.fromEntries(LK.map(k=>[k,S.links.filter(l=>lkOf(l)===k).map(l=>l.id).sort()]))');
  assert.ok(kinds.wave.length > 100 && kinds.iru.length === 3 && kinds.own.length === 4 && kinds.sea.length === 2);
  assert.deepEqual(chips(ev, 'infraF'), [`All (${ev('S.links.length')})`, `Leased waves (${kinds.wave.length})`, 'IRU dark fiber (3)', 'Own terrestrial fiber (4)', 'Own subsea fiber (2)'], 'no chip for a kind you do not have');
  for (const k of ['iru', 'own', 'sea', 'wave']) {
    ev(`ACT.infraF({v:'${k}'})`); more(ev, 'links');
    assert.deepEqual([...links(ev)].sort(), kinds[k], k);
    assert.ok(desc(use(ev, links(ev))), `${k}: still sorted by load`);
  }
  ev("ACT.infraF({v:'own'})");
  assert.match(ev("$('linksSec').textContent"), /Own terrestrial fiber · /, 'each row says what kind of link it is');
  ev("ACT.infraSort({w:'links',k:'name'})");
  assert.ok(asc(linkNames(ev)) && links(ev).length === 4, 'the filter and the sort work together');
  ev("ACT.infraF({v:'vxc'})");
  assert.equal(links(ev).length, 10, 'a kind you do not have shows everything');
  assert.deepEqual(errors, []);
});

test('only one kind of link: no kind chips to choose from', (t) => {
  const { ev, errors } = big(t);
  assert.deepEqual(chips(ev, 'infraF'), []);
  assert.deepEqual(errors, []);
});

test('links filter by load (over 65%, over 90%, down) and by city', (t) => {
  const { ev, errors } = big(t);
  const warm = ev("S.links.filter(l=>(R.load[l.id]||0)/capOf(l)>=0.65).length"), hot = ev("S.links.filter(l=>(R.load[l.id]||0)/capOf(l)>=0.9).length");
  assert.ok(hot > 0 && warm > hot);
  assert.deepEqual(chips(ev, 'infraHot'), [`Over 65% full (${warm})`, `Over 90% full (${hot})`], 'no "down" chip while nothing is down');
  ev("ACT.infraHot({w:'links',v:'hot'})"); more(ev, 'links');
  assert.equal(links(ev).length, hot);
  assert.ok(use(ev, links(ev)).every((u) => u >= 0.9));
  ev("ACT.infraHot({w:'links',v:'warm'})"); more(ev, 'links');
  assert.equal(links(ev).length, warm);
  // A backhoe: the cut link shows as down, and only it is listed under Down.
  const cut = ev("(()=>{const l=S.links[5];l.cut=S.day+5;compute();renderDash();return l.id})()");
  ev("ACT.infraHot({w:'links',v:'down'})");
  assert.deepEqual(links(ev), [cut]);
  assert.match(ev("document.querySelector('#linksSec .ihit .lpct').textContent"), /down/i);
  ev("ACT.infraHot({w:'links',v:'down'})");
  assert.ok(links(ev).length > 1, 'a second tap clears the load filter');
  // City: only links with an end there; the select lists only cities with links.
  const c = ev("S.links[0].a"), want = json(ev, `S.links.filter(l=>l.a==='${c}'||l.b==='${c}').map(l=>l.id).sort()`);
  ev(`ACT.infraCity({v:'${c}'})`); more(ev, 'links');
  assert.deepEqual([...links(ev)].sort(), want);
  assert.equal(ev("document.querySelector('#linksSec select[data-chg=\"infraCity\"]').value"), c);
  ev("ACT.infraCity({v:'not-a-city'})");
  assert.equal(links(ev).length, 10, 'a bad city shows everything');
  assert.deepEqual(errors, []);
});

test('quick buttons in a link row: one more optic, one more fiber pair, a bigger wave', (t) => {
  const { ev, errors } = big(t, MIXED);
  ev('S.cash=1e12');
  // One more optic on your own dark fiber, the same as clicking it in the link panel.
  ev("ACT.infraF({v:'own'})");
  const id = links(ev)[0], o = ev(`quickOpt(S.links.find(l=>l.id==='${id}'))`);
  assert.ok(o, 'a dark fiber of your own can take an optic');
  const cost = ev(`chCost(S.links.find(l=>l.id==='${id}'),'${o}')`), cash = ev('S.cash');
  ev(`document.querySelector('#linksSec .ihit[data-args*="${id}"] [data-act="addCh"]').click()`);
  assert.deepEqual(json(ev, `S.links.find(l=>l.id==='${id}').ch`), [o]);
  assert.equal(ev('S.cash'), cash - cost);
  assert.ok(!ev("$('dash').hidden"), 'the button acts in place: the dashboard stays open');
  // Now that it is lit, that optic type gets − and +: + adds one more, − puts one back on the spares shelf.
  const sel = (act) => `document.querySelector('#linksSec .ihit[data-args*="${id}"] .optq [data-act="${act}"][data-args*="${o}"]')`;
  assert.match(ev(`$('linksSec').querySelector('.ihit[data-args*="${id}"] .optq').textContent`), new RegExp(`×1`));
  ev(`${sel('addCh')}.click()`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').ch.length`), 2);
  const spares = ev(`spareN('${o}')`);
  ev(`${sel('rmCh')}.click()`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').ch.length`), 1);
  assert.equal(ev(`spareN('${o}')`), spares + 1, 'the optic goes to the spares shelf');
  ev(`${sel('rmCh')}.click()`);
  assert.deepEqual(json(ev, `S.links.find(l=>l.id==='${id}').ch`), []);
  assert.ok(ev(`!!document.querySelector('#linksSec .ihit[data-args*="${id}"] [data-act="addCh"]')&&!document.querySelector('#linksSec .ihit[data-args*="${id}"] .optq')`), 'with none lit, back to one button for the best optic');
  // A full subsea pair of your own offers the next pair.
  ev("ACT.infraF({v:'sea'})");
  const sea = links(ev)[0];
  ev(`(()=>{const l=S.links.find(x=>x.id==='${sea}'),k=quickOpt(l);l.ch=Array(chMax(l)).fill(k);compute();renderDash();})()`);
  assert.equal(ev(`quickOpt(S.links.find(l=>l.id==='${sea}'))`), null, 'a full line system takes no more optics');
  assert.ok(ev(`document.querySelector('#linksSec .ihit[data-args*="${sea}"] .optq [data-act="addCh"]').disabled`), 'a full system: + is greyed out');
  assert.ok(ev(`document.querySelector('#linksSec .ihit[data-args*="${sea}"] .optq [data-act="addCh"]').title.length>0`), 'and says why');
  ev(`document.querySelector('#linksSec .ihit[data-args*="${sea}"] [data-act="addPair"]').click()`);
  assert.equal(ev(`S.links.find(l=>l.id==='${sea}').pairs`), 2);
  // IRU fiber is not yours to light more pairs on.
  ev("ACT.infraF({v:'iru'})");
  assert.ok(ev("!document.querySelector('#linksSec [data-act=\"addPair\"]')"));
  // A leased wave offers the next size the route sells, at the panel's price.
  ev("ACT.infraF({v:'wave'})");
  const w = ev("(()=>{const l=S.links.find(l=>l.kind==='wave'&&quickWave(l));return l&&l.id})()");
  assert.ok(w, 'some wave can grow');
  const want = json(ev, `quickWave(S.links.find(l=>l.id==='${w}'))`);
  ev(`ACT.infraSort({w:'links',k:'name'});UI.listN={links:1e6};renderDash()`);
  ev(`document.querySelector('#linksSec .ihit[data-args*="${w}"] [data-act="upLink"]').click()`);
  assert.equal(ev(`S.links.find(l=>l.id==='${w}').tier`), want.i);
  assert.deepEqual(errors, []);
});

test('a link row says what is used and, on dark fiber, what is sold (alien-wave channels, managed waves) and, with managed waves, what is lit', (t) => {
  const { ev, errors } = big(t, MIXED);
  ev("ACT.infraF({v:'own'})");
  const id = links(ev)[0];
  // Light four channels, rent two more out as alien waves and sell 2 × 400G as managed waves on top of the lit ones.
  ev(`(()=>{const l=S.links.find(x=>x.id==='${id}'),o=quickOpt(l);l.ch=[o,o,o,o];
    S.biz.push({id:'aw',type:'wwave',link:l.id,slots:2,rate:1000,name:'Alien',city:l.a,city2:l.b,bw:1,reqs:[],mood:80,since:0,day:0,what:'x'});
    S.biz.push({id:'mw',type:'mwave',link:l.id,slots:2,g:400,rate:5000,name:'Managed',city:l.a,city2:l.b,bw:1,reqs:[],mood:80,since:0,day:0,route:'normal',what:'x'});
    compute();renderDash();})()`);
  const row = ev(`document.querySelector('#linksSec .ihit[data-args*="${id}"]').textContent`);
  const max = ev(`chMax(S.links.find(l=>l.id==='${id}'))`);
  assert.ok(row.includes(`Channels: 4 lit · 2 sold · ${max - 6} free of ${max}`), row);
  assert.ok(row.includes('800G sold as managed waves'), 'managed waves, as the link panel words them');
  const used = ev(`fmtG(R.load['${id}']||0)`), cap = ev(`fmtG(capOf(S.links.find(l=>l.id==='${id}')))`);
  const lit = ev(`fmtG(dfLit(S.links.find(l=>l.id==='${id}')))`);
  assert.ok(row.includes(`Used ${used} of ${cap} (${lit} lit)`), 'used against what is left for your own traffic, and everything lit');
  // Another own fiber without managed waves: lit is what is left, so no lit total.
  const other = links(ev).find((x) => x !== id);
  ev(`(()=>{const l=S.links.find(x=>x.id==='${other}'),o=quickOpt(l);l.ch=[o];compute();renderDash();})()`);
  const r2 = ev(`document.querySelector('#linksSec .ihit[data-args*="${other}"]').textContent`);
  assert.match(r2, /Used .+ of /); assert.doesNotMatch(r2, / lit\)/);
  assert.ok(ev(`capOf(S.links.find(l=>l.id==='${id}'))===dfLit(S.links.find(l=>l.id==='${id}'))-800`), 'managed waves come out of your own lit capacity');
  // A leased wave sells nothing: only what is used.
  ev("ACT.infraF({v:'wave'})");
  const w = ev("document.querySelector('#linksSec .ihit').textContent");
  assert.match(w, /Used .+ of /);
  assert.doesNotMatch(w, /Channels:|managed waves/);
  assert.deepEqual(errors, []);
});

test('tapping a row picks it in the side panel behind the dashboard, which stays open; Open goes there', (t) => {
  const { ev, errors } = big(t);
  const [id, id2] = links(ev);
  ev(`document.querySelector('#linksSec .ihit .nm').click()`);
  assert.ok(!ev("$('dash').hidden"), 'a stray tap does not leave the NOC');
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'link', id });
  assert.ok(ev("!$('panel').hidden&&$('panel').textContent.length>0"), 'the side panel is ready behind it');
  assert.equal(json(ev, "[...document.querySelectorAll('#linksSec .ihit.on')].map(r=>JSON.parse(r.dataset.args).id)").join(), id, 'the picked row is marked');
  ev(`document.querySelector('#linksSec .ihit[data-args*="${id2}"] [data-act="dashLink"]:not(.ihit)').click()`);
  assert.ok(ev("$('dash').hidden"), 'Open leaves the dashboard for the panel');
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'link', id: id2 });
  ev("ACT.dash();ACT.dashTab({k:'routers'})");
  const city = pops(ev)[0];
  ev(`document.querySelector('#routersSec .rrow b').click()`);
  assert.ok(!ev("$('dash').hidden"));
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'city', id: city });
  assert.equal(ev('UI.tab'), 'links', 'at the Infra tab');
  assert.ok(ev(`$('routersSec').querySelector('.rrow.on').dataset.args.includes('${city}')`));
  ev(`document.querySelector('#routersSec .rrow [data-act="dashPop"]:not(.rrow)').click()`);
  assert.ok(ev("$('dash').hidden"));
  ev("ACT.dash();ACT.dashPop({city:'nowhere',bg:1});ACT.dashLink({id:'nope',bg:1})");
  assert.ok(!ev("$('dash').hidden"), 'a city without a POP or a link that is gone is ignored');
  assert.deepEqual(json(ev, 'UI.sel'), { type: 'city', id: city });
  assert.deepEqual(errors, []);
});

test('links and routers sort by raw capacity, biggest first, and flip', (t) => {
  const { ev, errors } = big(t, MIXED);
  ev("ACT.infraSort({w:'links',k:'cap'})"); more(ev, 'links');
  const caps = json(ev, `${lit(links(ev))}.map(id=>capOf(S.links.find(l=>l.id===id)))`);
  assert.equal(caps.length, ev('S.links.length'));
  assert.ok(desc(caps) && caps[0] > caps.at(-1), 'biggest first');
  assert.match(ev("document.querySelector('#linksSec .pink[data-act=\"infraSort\"]').textContent"), /Capacity ▼/);
  ev("ACT.infraSort({w:'links',k:'cap'})"); more(ev, 'links');
  assert.ok(asc(json(ev, `${lit(links(ev))}.map(id=>capOf(S.links.find(l=>l.id===id)))`)), 'smallest first, unlit fiber at the top');
  ev("ACT.infraF({v:'wave'});ACT.infraSort({w:'links',k:'cap'})"); more(ev, 'links');
  assert.ok(desc(json(ev, `${lit(links(ev))}.map(id=>capOf(S.links.find(l=>l.id===id)))`)), 'with a filter too');
  ev("ACT.dashTab({k:'routers'});ACT.infraSort({w:'routers',k:'cap'})"); more(ev, 'routers');
  assert.ok(desc(json(ev, `${lit(pops(ev))}.map(c=>R.nodeCap[c]||0)`)));
  assert.deepEqual(errors, []);
});

for (const tab of ['links', 'routers']) {
  test(`${tab}: the page scrolls like every tab, and the filter bar sticks under the tab bar`, (t) => {
    const { ev, errors } = big(t, BIG, tab);
    const sec = `#${tab}Sec`;
    assert.ok(ev(`$('${tab}Sec').querySelector('.ibar')===$('${tab}Sec').firstElementChild`), 'the filters come first');
    assert.ok(ev(`!document.querySelector('${sec} .ilist .ibar')`), 'and the rows come after them, not inside');
    assert.match(ev("document.querySelector('style').textContent"), /\.ibar\{position:sticky;top:calc\(var\(--dtabh/, 'sticky, below the tab bar');
    assert.doesNotMatch(ev("document.querySelector('style').textContent"), /\.ilist\{[^}]*overflow/, 'no box of its own to scroll');
    assert.deepEqual(errors, []);
  });
}

const thText = (ev) => json(ev, "[...document.querySelectorAll('#routersSec thead th')].map(th=>th.textContent)");
const sortBy = (ev, k) => ev(`[...document.querySelectorAll('#routersSec thead [data-act="infraSort"]')].find(b=>JSON.parse(b.dataset.args).k==='${k}').click()`);

test('Routers: Your AS on top, then a table of city, router type and count, capacity, load, ports and Flowspec rules', (t) => {
  const { ev, errors } = big(t, BIG, 'routers');
  assert.ok(ev("$('asSec').compareDocumentPosition($('routersSec'))&Node.DOCUMENT_POSITION_FOLLOWING"), 'Your AS comes first');
  assert.ok(ev("$('asSec').textContent.includes('AS'+S.asn)"));
  assert.deepEqual(thText(ev), ['City', 'Router type', 'Routers', 'Capacity', 'Forwarding load ▼', 'Router ports', 'Flowspec rules', '']);
  // A flood under way uses Flowspec rules on one POP's routers.
  const c = pops(ev)[0];
  ev(`R.fsUse={'${c}':{used:3,cap:fsCap('${c}')}};UI._dh=null;renderDash()`);
  const cells = json(ev, `[...document.querySelector('#routersSec .rrow[data-args*="${c}"]').children].map(td=>td.textContent)`);
  assert.equal(cells[0], ev(`CITY['${c}'].name`));
  assert.equal(cells[1], ev(`RG[S.pops['${c}'].rgen||0].n`), 'router type');
  assert.equal(cells[2], String(ev(`S.pops['${c}'].routers||1`)), 'number of routers');
  assert.equal(cells[3], ev(`fmtG(R.nodeCap['${c}'])`), 'capacity');
  assert.ok(cells[4].startsWith(ev(`fmtG(R.nodeLoad['${c}']||0)`)), 'forwarding load');
  assert.equal(cells[5], `${ev(`fmtPorts(portsUsed('${c}'))`)} / ${ev(`portsMax('${c}')`)} in use`, 'router ports, as the city panel counts them');
  assert.equal(cells[6], ev(`fsCap('${c}')`) ? `3 / ${ev(`fsCap('${c}')`)} in use` : 'none (no TCAM)', 'Flowspec rules in use');
  assert.equal(ev("document.querySelectorAll('#routersSec .ibar [data-act=\"infraSort\"]').length"), 0, 'sorting is in the table header, not in buttons');
  assert.deepEqual(errors, []);
});

test('Routers sort from the table header: city, router type, routers, capacity, forwarding load, router ports, Flowspec rules', (t) => {
  const { ev, errors } = big(t, BIG, 'routers');
  // Give the POPs a spread of models and router counts, so type and count orders mean something.
  ev("Object.keys(S.pops).forEach((c,i)=>{S.pops[c].routers=1+i%4;S.pops[c].rgen=i%5;});compute();UI._dh=null;renderDash()");
  // A flood under way on a few POPs, so the Flowspec order means something too.
  ev("R.fsUse={};Object.keys(S.pops).slice(0,5).forEach((c,i)=>{if(fsCap(c))R.fsUse[c]={used:i+1,cap:fsCap(c)};});UI._dh=null;renderDash()");
  const col = { name: 'CITY[c].name.toLowerCase()', type: 'RG[S.pops[c].rgen||0].cap', n: '(S.pops[c].routers||1)', cap: 'R.nodeCap[c]||0', use: '(R.nodeLoad[c]||0)/(R.nodeCap[c]||1)', ports: 'portsUsed(c)/portsMax(c)', fs: '(R.fsUse[c]?R.fsUse[c].used:0)' };
  const vals = (k) => json(ev, `${lit(pops(ev))}.map(c=>${col[k]})`);
  for (const [k, first] of [['name', 'asc'], ['type', 'desc'], ['n', 'desc'], ['cap', 'desc'], ['ports', 'desc'], ['fs', 'desc'], ['use', 'desc']]) {
    if (ev(`infraSortOf('routers').k`) !== k) sortBy(ev, k);
    more(ev, 'routers');
    const v = vals(k);
    assert.equal(v.length, ev('Object.keys(S.pops).length'), k);
    assert.ok(first === 'asc' ? asc(v) : desc(v), `${k}: ${first} first`);
    assert.match(thText(ev).find((x) => /[▲▼]/.test(x)), first === 'asc' ? /▲$/ : /▼$/, `${k}: the header shows the order`);
    sortBy(ev, k); more(ev, 'routers');
    assert.ok(first === 'asc' ? desc(vals(k)) : asc(vals(k)), `${k}: a second tap flips it`);
  }
  const before = ev('JSON.stringify(UI.infraSort)');
  ev("ACT.infraSort({w:'links',k:'ports'});ACT.infraSort({w:'links',k:'type'});ACT.infraSort({w:'links',k:'n'});ACT.infraSort({w:'links',k:'fs'})");
  assert.equal(ev('JSON.stringify(UI.infraSort)'), before, 'links have no ports, type, count or Flowspec to sort by');
  assert.deepEqual(errors, []);
});

test('Routers filter by region, city and Flowspec rules, with the load filter on top', (t) => {
  const { ev, errors } = big(t, BIG, 'routers');
  assert.match(ev("$('routersSec').querySelector('h3').textContent"), /^Routers \d+ \/ \d+/, 'the heading says Routers');
  assert.deepEqual(json(ev, "[...document.querySelectorAll('#routersSec .ibar select')].map(s=>s.dataset.chg)"), ['rtrReg', 'rtrCity', 'rtrFs'], 'region before city, then Flowspec');
  const c = pops(ev)[0], reg = ev(`CITY['${c}'].reg`);
  ev(`ACT.rtrCity({v:'${c}'})`);
  assert.deepEqual(pops(ev), [c]);
  assert.equal(ev("document.querySelector('#routersSec select[data-chg=\"rtrCity\"]').value"), c);
  ev("ACT.rtrCity({v:''})");
  ev(`ACT.rtrReg({v:'${reg}'})`); more(ev, 'routers');
  const want = json(ev, `Object.keys(S.pops).filter(c=>CITY[c].reg==='${reg}').sort()`);
  assert.deepEqual([...pops(ev)].sort(), want, 'every POP in the region, and only those');
  const regions = json(ev, "[...document.querySelectorAll('#routersSec select[data-chg=\"rtrReg\"] option')].map(o=>o.value).filter(Boolean)");
  assert.deepEqual(regions, json(ev, "Object.keys(REG).filter(k=>Object.keys(S.pops).some(c=>CITY[c].reg===k))"), 'only regions with a POP');
  ev(`for(const c of ${lit(want)}.slice(0,2))R.nodeLoad[c]=(R.nodeCap[c]||1)*0.95;ACT.infraHot({w:'routers',v:'hot'})`);
  assert.deepEqual([...pops(ev)].sort(), want.slice(0, 2).sort(), 'region and load together');
  ev("ACT.rtrReg({v:''});ACT.infraHot({w:'routers',v:'hot'})");
  // Flowspec: rules in use during a flood, routers with a TCAM, routers without one.
  const fsPops = json(ev, "Object.keys(S.pops).filter(c=>fsCap(c)>0)"), noTcam = json(ev, "Object.keys(S.pops).filter(c=>!fsCap(c))");
  ev(`R.fsUse={'${fsPops[0]}':{used:2,cap:fsCap('${fsPops[0]}')}};ACT.rtrFs({v:'use'})`);
  assert.deepEqual(pops(ev), [fsPops[0]], 'rules in use');
  ev("ACT.rtrFs({v:'has'})"); more(ev, 'routers');
  assert.deepEqual([...pops(ev)].sort(), [...fsPops].sort(), 'routers with Flowspec');
  ev("ACT.rtrFs({v:'none'})"); more(ev, 'routers');
  assert.deepEqual([...pops(ev)].sort(), [...noTcam].sort(), 'routers with no TCAM');
  assert.equal(ev("document.querySelector('#routersSec select[data-chg=\"rtrFs\"]').value"), 'none');
  ev("ACT.rtrReg({v:'XX'});ACT.rtrCity({v:'nowhere'});ACT.rtrFs({v:'lots'})");
  assert.deepEqual(json(ev, 'UI.rtrF'), { city: '', reg: '', fs: '' }, 'unknown values clear the filters');
  assert.deepEqual(errors, []);
});

test('Routers: add a router or swap to the next model, exactly where and as the NOC intern would', (t) => {
  const { ev, errors, dom } = load({ seed: 777 }); t.after(() => dom.window.close());
  // Broadband at home: the POP is in use, so a swap with one router would be a maintenance window (not idle, popIdle()).
  ev("ACT.start({});closeModal();UI.speed=0;S.cash=1e12;S.lvl=12;S.nextFail=S.nextEvent=1e9;ACT.launchBB({city:S.home});compute();ACT.dash();ACT.dashTab({k:'routers'})");
  assert.equal(ev('popIdle(S.home)'), false);
  const acts = (c) => json(ev, `[...document.querySelectorAll('#routersSec .rrow[data-args*="${c}"] .btns [data-act]')].filter(b=>b.dataset.act!=='dashPop').map(b=>[b.dataset.act,b.classList.contains('pink')])`);
  const home = ev('S.home');
  // A quiet POP: the intern would leave it alone, so nothing is its pick, though both buttons are there.
  ev(`S.pops['${home}'].routers=1;S.pops['${home}'].rgen=0;R.nodeLoad['${home}']=0;UI._dh=null;renderDash()`);
  assert.ok(ev(`rtrLoad('${home}',portsUsed('${home}'))<opsP('routers','at')/100`));
  assert.deepEqual(acts(home), [['addRouter', false]], 'quiet: no pick');
  // Busy (over the intern's "at" setting). One router: no swap (it would be a maintenance window), only an add, the pick.
  const busy = `R.nodeLoad['${home}']=R.nodeCap['${home}']*2;UI._dh=null;renderDash()`;
  ev(busy);
  let nr = json(ev, `rtrNext('${home}')`);
  assert.equal(nr.swap, false); assert.equal(nr.pick, 'add');
  assert.deepEqual(acts(home), [['addRouter', true]]);
  // Four routers: both open, the intern swaps.
  ev(`S.pops['${home}'].routers=4;compute();${busy}`);
  nr = json(ev, `rtrNext('${home}')`);
  assert.equal(nr.pick, nr.swap ? 'swap' : 'add');
  assert.deepEqual(acts(home), [['addRouter', nr.pick === 'add'], ...(nr.swap ? [['upRouter', true]] : [])]);
  assert.equal(ev(`document.querySelector('#routersSec .rrow[data-args*="${home}"] .pink').title`), 'What the NOC intern would do here');
  // The buttons are the city panel's: one more router, then the next model; the dashboard stays open.
  const rt = ev(`S.pops['${home}'].routers`);
  ev(`document.querySelector('#routersSec .rrow[data-args*="${home}"] [data-act="addRouter"]').click()`);
  assert.equal(ev(`S.pops['${home}'].routers`), rt + 1);
  assert.ok(!ev("$('dash').hidden"));
  if (nr.swap) {
    ev(`S.pops['${home}'].rupDay=-1;compute();${busy}`);
    ev(`document.querySelector('#routersSec .rrow[data-args*="${home}"] [data-act="upRouter"]').click()`);
    assert.equal(ev(`S.pops['${home}'].rgen`), nr.nx, 'swapped to the model the intern would pick');
  }
  // A POP that had new routers today waits, like the intern.
  ev(`S.pops['${home}'].rupDay=S.day;UI._dh=null;renderDash()`);
  assert.deepEqual(acts(home), []);
  assert.match(ev(`document.querySelector('#routersSec .rrow[data-args*="${home}"]').textContent`), /New routers went in today/);
  assert.deepEqual(errors, []);
});

test('the intern adds and swaps routers just as before rtrNext() and rtrLoad() were shared with the dashboard', (t) => {
  const { ev, errors } = big(t);
  const loads = ev(`Object.keys(S.pops).every(c=>{const u=portsUsed(c);return rtrLoad(c,u)===Math.max((R.nodeLoad[c]||0)*opsAhead()/(R.nodeCap[c]||nodeCap(c)||1),u/Math.max(1,portsMax(c)));})`);
  assert.equal(loads, true, 'the same busy measure');
  // Every POP: the old inline rule, side by side with rtrNext().
  const diff = ev(`(()=>{let n=0;for(const c of Object.keys(S.pops)){const p=S.pops[c];for(const rt of [1,2,4,RMAX]){p.routers=rt;
    const g=p.rgen||0,nx=mainRG(RG[g].cls+1),swap=nx>=0&&rgOpen(nx)&&!modelFits(c,nx)&&(rt>1||popIdle(c)),add=rt<RMAX,o=rtrNext(c);
    if(o.nx!==nx||o.swap!==swap||o.add!==add||o.pick!==(swap&&(rt>=4||!add)?'swap':add?'add':null))n++;}}return n;})()`);
  assert.equal(diff, 0);
  assert.deepEqual(errors, []);
});

test('Routers on a phone: one POP per row, with the same numbers and buttons', (t) => {
  const { ev, errors } = big(t, BIG, 'routers');
  ev("window.innerWidth=360;UI._dh=null;renderDash()");
  assert.ok(ev("!document.querySelector('#routersSec table')&&document.querySelectorAll('#routersSec .row.rrow').length===10"));
  const c = pops(ev)[0], row = ev(`document.querySelector('#routersSec .rrow[data-args*="${c}"]').textContent`);
  for (const s of ['Forwarding load', 'Router ports', 'Flowspec rules']) assert.ok(row.includes(s), s);
  assert.deepEqual(json(ev, "[...document.querySelectorAll('#routersSec .ibar [data-act=\"infraSort\"]')].map(b=>JSON.parse(b.dataset.args).k)"), ['name', 'type', 'n', 'cap', 'use', 'ports', 'fs'], 'no table header on a phone: the sorts are buttons');
  assert.ok(ev(`!!document.querySelector('#routersSec .rrow[data-args*="${c}"] [data-act="dashPop"]:not(.rrow)')`));
  assert.deepEqual(errors, []);
});

test('bad arguments change nothing', (t) => {
  const { ev, errors } = big(t);
  const before = ev('JSON.stringify([UI.infraSort||null,UI.infraF??null,UI.infraHot||null])');
  ev("ACT.infraSort({w:'nope',k:'use'});ACT.infraSort({w:'links',k:'cost'});ACT.listMore({k:'bogus'});ACT.infraF({v:'dark'});ACT.infraF({v:null})");
  ev("ACT.infraHot({w:'routers',v:'down'});ACT.infraHot({w:'links',v:'lava'});ACT.infraHot({w:'x',v:'hot'})");
  assert.equal(ev('JSON.stringify([UI.infraSort||null,UI.infraF??null,UI.infraHot||null])'), before);
  assert.deepEqual(errors, []);
});

for (const w of [360, 640]) {
  test(`a ${w} px phone gets the same lists, filters and buttons`, (t) => {
    const { ev, errors } = big(t, MIXED);
    ev(`window.innerWidth=${w};ACT.infraF({v:'own'})`);
    assert.equal(links(ev).length, 4);
    assert.ok(ev("document.querySelectorAll('#linksSec [data-act=\"infraSort\"]').length===3"));
    assert.ok(ev("!!document.querySelector('#linksSec .ihit [data-act=\"addCh\"]')"));
    assert.deepEqual(errors, []);
  });
}
