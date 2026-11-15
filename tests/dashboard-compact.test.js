const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

// The NOC dashboard on a big network: short first pages, pinned tabs, and rows that unfold instead of stacking buttons.
const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
function big(t, width) {
  const h = load();
  t.after(() => h.dom.window.close());
  h.dom.window.__save = SAVE;
  h.ev(`${width ? `window.innerWidth=${width};` : ''}S=migrate(JSON.parse(window.__save));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute();renderAll();ACT.dash()`);
  return h;
}
const n = (ev, sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

test('the tabs and the close button sit in one pinned bar, and every tab is in it', (t) => {
  const { ev, errors } = big(t);
  assert.equal(n(ev, '#dashCard .dhead .dtabs button'), ev('DTABS.length'));
  assert.equal(n(ev, '#dashCard .dhead [data-act="dashClose"]'), 1);
  assert.equal(n(ev, '#dashCard [data-act="dashClose"]'), 1, 'one close button');
  assert.equal(n(ev, '#dashCard .dtitle .dtabs'), 0, 'the title is outside the pinned bar');
  for (const k of JSON.parse(ev('JSON.stringify(DTABS)'))) {
    ev(`ACT.dashTab({k:'${k}'})`);
    assert.equal(ev("document.querySelector('#dashCard .dhead .dtabs .on').dataset.args"), `{"k":"${k}"}`);
  }
  assert.deepEqual(errors, []);
});

test('every long list opens on a short page, grows on request, and loses nothing', (t) => {
  const { ev, errors } = big(t);
  const total = { cust: 'S.biz.length', conn: 'conns().length', pops: 'CITIES.filter(C=>cityOn(C.id)&&!S.pops[C.id]).length', lease: 'leaseSwaps().length' };
  const rows = { cust: '#custSec .row', conn: '#connSec tbody tr', pops: '#popsSec .row', lease: '#leaseSec .row', traffic: '#trafficSec tbody tr' };
  for (const k of ['cust', 'conn', 'pops', 'lease', 'traffic']) {
    ev(`ACT.dashTab({k:'${k}'})`);
    const [p0, p1] = JSON.parse(ev(`JSON.stringify(LIST_PG.${k})`));
    assert.ok(p0 <= 25, `${k} opens on at most 25 rows`);
    const first = n(ev, rows[k]);
    assert.ok(first <= p0, `${k}: ${first} rows`);
    if (total[k] && ev(total[k]) > p0) {
      assert.equal(first, p0);
      ev(`document.querySelector('#${k}Sec [data-act="listMore"]').click()`);
      assert.equal(n(ev, rows[k]), Math.min(ev(total[k]), p0 + p1), `${k} grows by its step`);
      let guard = 0;
      while (ev(`!!document.querySelector('#${k}Sec [data-act="listMore"]')`) && guard++ < 200) ev(`ACT.listMore({k:'${k}'})`);
      assert.equal(n(ev, rows[k]), ev(total[k]), `${k}: every row can be reached`);
    }
    assert.equal(n(ev, `#${k}Sec p.note`), first > 8 ? 0 : n(ev, `#${k}Sec p.note`), `${k}: no intro paragraph above a long list`);
    ev(`listReset('${k}')`);
  }
  // the traffic table starts short again after a new sort
  ev("ACT.dashTab({k:'traffic'})");
  const all = ev("(()=>{UI.listN={traffic:1e6};UI._dh=null;renderDash();return document.querySelectorAll('#trafficSec tbody tr').length})()");
  assert.ok(all > ev('LIST_PG.traffic[0]'), 'the fixture has more networks than a page');
  ev("ACT.dashSort({k:'name'})");
  assert.equal(n(ev, '#trafficSec tbody tr'), ev('LIST_PG.traffic[0]'));
  assert.deepEqual(errors, []);
});

test('a short list keeps its explanation', (t) => {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev("ACT.start({});closeModal();UI.speed=0;compute();ACT.dash();ACT.dashTab({k:'conn'})");
  h.ev("ACT.buyTransit({city:S.home,net:'cog',tier:0});compute();UI._dh=null;renderDash()");
  assert.ok(h.ev('conns().length') >= 1);
  assert.equal(n(h.ev, '#connSec p.note'), 1);
  assert.deepEqual(h.errors, []);
});

test('on a phone a connection row unfolds its buttons, one row at a time', (t) => {
  const { ev, errors } = big(t, 390);
  ev("ACT.dashTab({k:'conn'})");
  const acts = '#connSec [data-act="buyTransit"],#connSec [data-act="lagT"],#connSec [data-act="downT"],#connSec [data-act="connCancel"]';
  assert.ok(n(ev, '#connSec .row') > 5);
  assert.equal(n(ev, acts), 0, 'folded rows carry only Open and the unfold button');
  assert.equal(n(ev, '#connSec .row [data-act="goConn"]'), n(ev, '#connSec .row'));
  ev("document.querySelectorAll('#connSec [data-act=\"dashRow\"]')[0].click()");
  assert.equal(n(ev, '#connSec .rmore'), 1);
  assert.ok(n(ev, '#connSec .rmore [data-act="connCancel"]') === 1, 'the cancel button is in the unfolded line');
  // arming Cancel keeps the row open; unfolding another row folds this one and disarms it
  ev("document.querySelector('#connSec .rmore [data-act=\"connCancel\"]').click()");
  assert.equal(n(ev, '#connSec .rmore .b.red'), 1);
  ev("document.querySelectorAll('#connSec [data-act=\"dashRow\"]')[1].click()");
  assert.equal(n(ev, '#connSec .rmore'), 1);
  assert.equal(n(ev, '#connSec .rmore .b.red'), 0);
  assert.equal(ev('UI.confirm'), null);
  ev("document.querySelectorAll('#connSec [data-act=\"dashRow\"]')[1].click()");
  assert.equal(n(ev, '#connSec .rmore'), 0, 'a second tap folds it');
  ev("ACT.dashRow({k:null});ACT.dashRow({k:{}});ACT.dashRow({k:'x'.repeat(200)})");
  assert.equal(ev('UI.dashOpen'), null);
  assert.deepEqual(errors, []);
});

test('a leased line shows its best swap; Details unfolds every estimate and plan', (t) => {
  const { ev, errors } = big(t);
  ev("ACT.dashTab({k:'lease'})");
  const x = JSON.parse(ev("JSON.stringify((()=>{const x=leaseSwaps().slice(0,LIST_PG.lease[0]).find(x=>x.opts.length>1&&x.opts.some(o=>o.save>0));return x&&{k:'l:'+x.a+'|'+x.b,n:x.opts.length}})()||null)"));
  assert.ok(x, 'the fixture has a lease with two ways out');
  const row = `[...document.querySelectorAll('#leaseSec .row')].find(r=>r.querySelector('[data-act="dashRow"]')&&JSON.parse(r.querySelector('[data-act="dashRow"]').dataset.args).k===${JSON.stringify(x.k)})`;
  assert.equal(ev(`${row}.querySelectorAll('[data-act="leaseSwap"]').length`), 1, 'folded: the best plan only');
  assert.match(ev(`${row}.textContent`), /Saves .*pays for itself/);
  assert.equal(ev(`${row}.querySelectorAll('[data-act="dashLink"]').length`) >= 1, true, 'the lease can still be opened');
  ev(`${row}.querySelector('[data-act="dashRow"]').click()`);
  assert.equal(ev(`${row}.querySelectorAll('[data-act="leaseSwap"]').length`), x.n, 'unfolded: every plan');
  assert.match(ev(`${row}.textContent`), /up front/);
  assert.deepEqual(errors, []);
});

test('on a wide screen a connection row is Open and Change; the rest unfolds in a row of its own', (t) => {
  const { ev, errors } = big(t, 1280);
  ev("ACT.dashTab({k:'conn'})");
  const acts = '#connSec [data-act="lagT"],#connSec [data-act="downT"],#connSec [data-act="connCancel"],#connSec [data-act="lagP"],#connSec [data-act="lagIx"]';
  const rows = n(ev, '#connSec tbody tr');
  assert.ok(rows > 5);
  assert.equal(n(ev, acts), 0, 'folded rows carry only Open and Change');
  assert.equal(n(ev, '#connSec tbody [data-act="goConn"]'), rows, 'Open stays in every row');
  ev("document.querySelectorAll('#connSec [data-act=\"dashRow\"]')[0].click()");
  assert.equal(n(ev, '#connSec tr.rmtr'), 1);
  assert.ok(n(ev, '#connSec tr.rmtr [data-act="connCancel"]') === 1, 'cancel is in the unfolded row');
  assert.deepEqual(errors, []);
});

test('on a phone the traffic list is one card per network, its details behind one button', (t) => {
  const { ev, errors } = big(t, 390);
  ev("ACT.dashTab({k:'traffic'})");
  assert.equal(n(ev, '#trafficSec table'), 0, 'no table to scroll sideways');
  const cards = n(ev, '#trafficSec .trow');
  assert.equal(cards, ev('LIST_PG.traffic[0]'));
  assert.equal(n(ev, '#trafficSec .trow [data-act="dashRow"]'), cards, 'every card has its Details');
  assert.ok(n(ev, '#trafficSec .trow [data-act="pniAllOpen"]') <= cards, 'at most one peer button a card');
  // Peer and Details side by side, icon-sized, each named for screen readers.
  assert.equal(n(ev, '#trafficSec .trow .ract.trac'), cards);
  assert.equal(ev(`[...document.querySelectorAll('#trafficSec .trow .ract button')].every(b=>b.classList.contains('tib')&&b.getAttribute('aria-label'))`), true);
  assert.match(ev("[...document.querySelectorAll('style')].map(s=>s.textContent).join('')"), /\.ract\.trac\{flex-direction:row/);
  assert.equal(n(ev, '#trafficSec .tmore'), 0);
  ev("document.querySelector('#trafficSec [data-act=\"dashRow\"]').click()");
  assert.equal(n(ev, '#trafficSec .tmore'), 1);
  assert.match(ev("document.querySelector('#trafficSec .tmore').textContent"), /AS\d+/);
  ev("ACT.dashSort({k:'name'})");
  assert.equal(n(ev, '#trafficSec .trow'), ev('LIST_PG.traffic[0]'), 'a sort starts short again');
  assert.deepEqual(errors, []);
});

test('on a wide screen the traffic table keeps one line per network with Peer on all POPs in its last column', (t) => {
  const { ev, errors } = big(t, 1440);
  ev("ACT.dashTab({k:'traffic'})");
  const rows = n(ev, '#trafficSec tbody tr');
  assert.equal(rows, ev('LIST_PG.traffic[0]'));
  assert.equal(n(ev, '#trafficSec tbody td:first-child [data-act="pniAllOpen"]'), 0, 'no button under the names');
  assert.ok(n(ev, '#trafficSec tbody td:last-child [data-act="pniAllOpen"]') > 0);
  assert.deepEqual(errors, []);
});

test('on a phone a router is a short card; its buttons unfold, one card at a time', (t) => {
  const { ev, errors } = big(t, 390);
  ev("ACT.dashTab({k:'routers'})");
  const cards = n(ev, '#routersSec .rcard');
  assert.ok(cards > 5);
  assert.equal(n(ev, '#routersSec .rcard .rbars .bar'), cards * 2, 'load and ports side by side');
  assert.equal(n(ev, '#routersSec .rcard .fsc'), cards, 'a Flowspec chip each');
  assert.equal(n(ev, '#routersSec .rmore'), 0);
  const tg = '#routersSec [data-act="dashRow"]';
  ev(`document.querySelectorAll('${tg}')[0].click()`);
  assert.equal(n(ev, '#routersSec .rmore'), 1);
  ev(`document.querySelectorAll('${tg}')[1].click()`);
  assert.equal(n(ev, '#routersSec .rmore'), 1, 'one card at a time');
  assert.deepEqual(errors, []);
});
