// The leaderboards sheet as a phone shows it (95-modals/48-fed-boards.js) and the HUD's rank chip (48-fed-rank.js):
// compact controls that never scroll sideways, rows that fit 360 px, the own row in place or kept at the bottom, a
// note for every board, and the 🏆 chip only for a save that joined. Fake relay nodes on a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, SERVERS_JSON, URL1, key } = require('./helpers/fed');

const txt = (p) => p.ev("$('modalCard').textContent");
const val = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
// Lets the core's timers and the sheet's async loads run until the sheet stops changing.
async function run(p, ms = 1500) {
  for (let t = 0; t < ms; t += 500) { p.net.advance(500); await settle(); await new Promise((r) => setTimeout(r, 5)); }
  let last = null, same = 0;
  for (let i = 0; i < 400 && same < 4; i++) {
    const busy = p.ev('!!(typeof FU!=="undefined"&&(FU.loading||FU.loadNext||FU.busy||FUR.busy||FU.bBusy))');
    await settle(20); await new Promise((r) => setTimeout(r, 5));
    const html = p.ev("($('modalCard')||{}).innerHTML||''") + p.ev("$('hud').innerHTML");
    same = !busy && html === last ? same + 1 : 0; last = html;
  }
}
// A joined game whose server ranks 30 networks; the own network is 25th on the default board, 40th elsewhere.
async function joined(o = {}) {
  const p = fedPage({ registry: SERVERS_JSON, ...o });
  const n = p.net.node(URL1);
  // The answer is set up before joining: the rank chip asks as soon as the game connects. me is read when asked.
  let me = null;
  n.ranks = (f) => {
    me = me || p.ev('S.fed&&S.fed.key&&S.fed.key.pub');
    const rows = [];
    for (let i = 0; i < 30; i++) rows.push({ rank: i + 1, key: i === 24 && f.board === 'traffic' ? me : key('n' + i).pub, value: 50000 - i * 1000, asn: 4200000100 + i, ai: i % 5 === 1, ...(i === 2 ? { name: 'Extraordinarily Long Network Name Corp' } : { name: 'Net ' + i }), home: 'DE' });
    const top = (o.n || 30);
    return { slot: 0, n: 60, rows: rows.slice(0, top), me: f.board === 'traffic' ? { rank: 25, value: 26000 } : { rank: 40, value: 10 } };
  };
  assert.equal(await joinGame(p), null);
  me = p.ev('S.fed.key.pub');
  await run(p);
  return { p, n, me };
}
const phone = (p, w = 360, h = 740) => p.ev(`window.innerWidth=${w};window.innerHeight=${h};renderTabbar()`);

test('controls: a board picker, two small segmented controls, filters with a count; no chip row scrolls sideways', async () => {
  const { p } = await joined();
  phone(p);
  p.ev("ACT.fuOpen({v:'boards'})");
  await run(p);
  // The title is "Leaderboards"; the board is the picker under it, not repeated as a title.
  assert.match(p.ev("$('modalCard').querySelector('h2').textContent"), /Leaderboards/);
  assert.doesNotMatch(p.ev("$('modalCard').querySelector('h2').textContent"), /Traffic with players/);
  assert.deepEqual(val(p, "[...document.querySelectorAll('#modalCard select.fu-bsel option')].map(o=>o.value)"), ['traffic', 'total', 'pops', 'pies', 'cone']);
  assert.equal(p.ev("document.querySelector('#modalCard select.fu-bsel').value"), 'traffic');
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-seg').length"), 2);
  assert.deepEqual(val(p, "[...document.querySelectorAll('#modalCard .fu-seg')[0].querySelectorAll('button')].map(b=>b.textContent)"), ['Now', 'p95 · 24 h', 'Growth'], 'Now first; the 24 h traffic measure says it is the 95th percentile');
  // Picking a board through the select.
  p.ev("(()=>{const s=document.querySelector('#modalCard select.fu-bsel');s.value='pops';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await run(p);
  assert.equal(p.ev('UI.fu.q.board'), 'pops');
  assert.deepEqual(val(p, "[...document.querySelectorAll('#modalCard .fu-seg')[0].querySelectorAll('button')].map(b=>b.textContent)"), ['Now', '24 h', 'Growth'], 'POPs count what is there: no p95');
  // Filters: the button carries a count when some are active.
  assert.equal(p.ev("!!document.querySelector('#modalCard .fu-more .fu-cnt')"), false);
  p.ev("ACT.fuQ({k:'policy',v:'open'})");
  await run(p);
  assert.equal(p.ev("document.querySelector('#modalCard .fu-more .fu-cnt').textContent"), '1');
  // Nothing in the boards or filter sheet scrolls sideways (the old phone rule is gone).
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.doesNotMatch(css, /fu-chips[^{]*\{[^}]*overflow-x:auto/);
  assert.doesNotMatch(css, /\.fu-chip\{[^}]*white-space:nowrap/);
  assert.match(css, /\.fu-ctl\{display:flex;flex-wrap:wrap/);
  p.ev("ACT.fuOpen({v:'filters'})");
  await run(p);
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-chips.wrap').length"), 0, 'one kind of chip row, and it wraps');
  assert.deepEqual(p.errors, []);
});

test('rows: rank, a bold name button over AS and country, the value in its own cell; no fixed widths at 360 px', async () => {
  const { p, me } = await joined();
  phone(p);
  p.ev("ACT.fuOpen({v:'boards'})");
  await run(p);
  const rows = val(p, `[...document.querySelectorAll('#modalCard .fu-board .fu-row')].map(r=>({rank:r.querySelector('.fu-rank').textContent,nm:r.querySelector('.fu-nm').textContent,sub:r.querySelector('.fu-sub').textContent,v:r.querySelector('.fu-v').textContent,btn:r.querySelector('.fu-who').tagName,top:/top\\d/.test(r.className),me:r.classList.contains('fu-me')}))`);
  assert.equal(rows.length, 30);
  assert.deepEqual(rows[0], { rank: '1', nm: 'Net 0', sub: 'AS4200000100 · Germany', v: '50.0 Gbps', btn: 'BUTTON', top: true, me: false });
  assert.match(rows[1].sub, /^🤖 AS4200000101/, 'an AI network has its robot first in the small line');
  assert.equal(rows[3].top, false);
  assert.equal(rows[2].nm, 'Extraordinarily Long Network Name Corp', 'long names are whole in the page; CSS truncates them');
  // The own row is highlighted in place, not pinned above the board, and no sticky row is added.
  assert.equal(rows[24].me, true);
  assert.equal(rows[24].btn, 'DIV', 'the own row opens nothing');
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-mine').length"), 0);
  assert.equal(p.ev("document.querySelectorAll('#modalCard .pinned').length"), 0);
  assert.ok(me);
  // Phone layout: no inline widths, names and lines ellipsize, the value column is fixed.
  assert.equal(p.ev(`[...document.querySelectorAll('#modalCard [style]')].filter(e=>/(^|;)\\s*(min-)?width:\\s*[1-9]\\d\\dpx/.test(e.getAttribute('style'))).length`), 0);
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.match(css, /\.fu-nm\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css, /\.fu-sub\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css, /\.fedui \.fu-row\{grid-template-columns:2\.1em minmax\(0,1fr\) 5\.9em/);
  assert.match(css, /\.fu-who\{[^}]*min-height:44px/, 'tap targets of 44 px');
  assert.deepEqual(p.errors, []);
});

test('the own row outside the rows shown sticks to the bottom of the sheet with its rank and value', async () => {
  const { p } = await joined();
  phone(p);
  p.ev("ACT.fuOpen({v:'boards'});ACT.fuQ({k:'board',v:'total'})");
  await run(p);
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-board:not(.fu-mine .fu-board) .fu-me').length"), 0);
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-mine').length"), 1);
  assert.equal(p.ev("$('modalCard').querySelector('.fedui').lastElementChild.className"), 'fu-mine', 'last in the sheet');
  assert.equal(p.ev("document.querySelector('#modalCard .fu-mine .fu-rank').textContent"), '40');
  assert.equal(p.ev("document.querySelector('#modalCard .fu-mine .fu-v').textContent"), '10 Mbps');
  assert.match(p.ev("document.querySelector('#modalCard .fu-mine').textContent"), new RegExp(p.ev('S.name') + '.*you'));
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.match(css, /\.fu-mine\{position:sticky;bottom:/);
  assert.deepEqual(p.errors, []);
});

test('the open board refreshes every 30 s for any measure, never two asks at once, and stops when closed', async () => {
  const { p, n } = await joined();
  p.ev("ACT.fuOpen({v:'boards'});ACT.fuQ({k:'board',v:'pops'});ACT.fuQ({k:'measure',v:'growth'})");
  await run(p, 500);
  const asks = () => n.asks.filter((f) => f.m === 'rank' && f.board === 'pops' && f.measure === 'growth').length, a0 = asks();
  p.ev("window.__row=document.querySelectorAll('#modalCard .fu-row')[5]");
  await run(p, 20000);
  assert.equal(asks(), a0, 'not within 30 s');
  await run(p, 11000);
  assert.equal(asks(), a0 + 1, 'once after 30 s');
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-row')[5]===__row"), true, 'an unchanged answer leaves the rows alone');
  // A tick with an ask in flight is skipped.
  p.ev('FU.bBusy=true');
  await run(p, 30000);
  assert.equal(asks(), a0 + 1, 'skipped while one is in flight');
  p.ev('FU.bBusy=false');
  await run(p, 30000);
  assert.equal(asks(), a0 + 2);
  // Closed: no more asks for it.
  p.ev('ACT.fuClose()');
  await run(p, 65000);
  assert.equal(asks(), a0 + 2, 'stops with the sheet');
  assert.deepEqual(p.errors, []);
});

test('every board has its note, in one line that opens on a tap', async () => {
  const { p } = await joined();
  p.ev("ACT.fuOpen({v:'boards'})");
  await run(p);
  const notes = {};
  p.ev("ACT.fuQ({k:'measure',v:'total'})");
  for (const b of ['traffic', 'total', 'pops', 'pies', 'cone']) {
    p.ev(`ACT.fuQ({k:'board',v:'${b}'})`);
    await run(p, 500);
    notes[b] = p.ev("document.querySelector('#modalCard .fu-note .fu-nt').textContent");
    assert.ok(notes[b].length > 20, b);
    assert.doesNotMatch(notes[b], /fedui\./, b);
  }
  assert.equal(new Set(Object.values(notes)).size, 5, 'each board its own');
  for (const b of ['traffic', 'total', 'cone']) assert.match(notes[b], /95th percentile over the last 24 hours, like transit billing/, b);
  for (const b of ['pops', 'pies']) { assert.doesNotMatch(notes[b], /95th|lowest/, b); assert.match(notes[b], /right now/, b); }
  assert.equal(p.ev("document.querySelector('#modalCard .fu-note').getAttribute('aria-expanded')"), 'false');
  p.ev("document.querySelector('#modalCard .fu-note').click()");
  assert.equal(p.ev("document.querySelector('#modalCard .fu-note').getAttribute('aria-expanded')"), 'true');
  assert.deepEqual(p.errors, []);
});

test('a re-render keeps the sheet\'s nodes, so its scroll and focus stay put', async () => {
  const { p } = await joined();
  p.ev("ACT.fuOpen({v:'boards'})");
  await run(p);
  p.ev("window.__row=document.querySelectorAll('#modalCard .fu-row')[10];window.__sel=document.querySelector('#modalCard select.fu-bsel');__sel.focus()");
  p.ev('fuRender();fuRender()');
  assert.equal(p.ev("document.querySelectorAll('#modalCard .fu-row')[10]===__row&&document.querySelector('#modalCard select.fu-bsel')===__sel"), true);
  assert.equal(p.ev('document.activeElement===__sel'), true);
  assert.deepEqual(p.errors, []);
});

test('German: the controls and rows hold their long words without widening the sheet', async () => {
  const { p } = await joined({ lang: 'de' });
  phone(p);
  p.ev("ACT.fuOpen({v:'boards'})");
  await run(p);
  assert.match(p.ev("$('modalCard').querySelector('h2').textContent"), /Ranglisten/);
  assert.match(txt(p), /p95 · 24 Std\./);
  assert.doesNotMatch(txt(p), /fedui\./);
  assert.deepEqual(p.errors, []);
});

test('the HUD rank chip: only for a joined save, shows the rank, opens the boards; the menu has a tile', async () => {
  // Never joined: no chip, no tile.
  const q = fedPage({ registry: SERVERS_JSON });
  q.ev('ACT.start({})');
  await settle(40);
  q.ev('fuDot()');
  assert.equal(q.ev("$('hFu').hidden"), true);
  q.ev('ACT.menu({})');
  assert.equal(q.ev(`!!document.querySelector('#modalCard [data-act="fuBoards"]')`), false);
  assert.deepEqual(q.errors, []);
  // Joined: the chip shows the own rank on the default board, from the server's answer.
  const { p, n } = await joined();
  assert.equal(p.ev("$('hFu').hidden"), false);
  assert.equal(p.ev("$('hFuVal').textContent"), '#25');
  assert.equal(p.ev("$('hFu').getAttribute('aria-label')"), 'Leaderboards: you are #25');
  assert.ok(n.asks.some((f) => f.m === 'rank' && f.board === 'traffic'));
  assert.deepEqual(val(p, 'fuMyRank()'), { rank: 25, value: 26000 });
  // Every 30 s while visible and connected, and not sooner.
  const asks = () => n.asks.filter((f) => f.m === 'rank').length, a0 = asks();
  p.ev('fuMyRankLoad()');
  await run(p, 500);
  assert.equal(asks(), a0, 'not again within 30 s');
  await run(p, 31000);
  assert.equal(asks(), a0 + 1, 'once after 30 s');
  await run(p, 30000);
  assert.equal(asks(), a0 + 2, 'and again 30 s later');
  // Hidden: paused; shown again: at once.
  p.ev("Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true})");p.net.vis = false;
  await run(p, 61000);
  assert.equal(asks(), a0 + 2, 'nothing while the page is hidden');
  p.net.vis = true;p.ev("Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))");
  await run(p, 500);
  assert.equal(asks(), a0 + 3, 'at once when shown again');
  // The chip opens the boards; the menu has a Leaderboards tile next to Multimode.
  p.ev("$('hFu').click()");
  await run(p, 500);
  assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'boards');
  p.ev('ACT.menu({})');
  assert.equal(p.ev(`!!document.querySelector('#modalCard .mtile[data-act="fuBoards"]')`), true);
  // The Multimode sheet leads with the leaderboards.
  p.ev("ACT.fuOpen({v:'home'})");
  await run(p, 500);
  const first = p.ev(`(()=>{const c=$('modalCard').querySelector('.fedui');return [...c.querySelectorAll('[data-act]')].filter(b=>!b.classList.contains('x')).map(b=>b.dataset.args||'')[0];})()`);
  assert.match(first, /boards/);
  assert.match(p.ev("document.querySelector('#modalCard .fu-lb').textContent"), /Leaderboards.*#25/s);
  assert.deepEqual(p.errors, []);
});

test('the rank chip offline with nothing kept shows the trophy alone; on a phone the HUD still fits', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  n.ranks = () => ({ slot: 0, n: 0, rows: [], me: null });
  assert.equal(await joinGame(p), null);
  await run(p);
  n.kill();
  await run(p, 500);
  p.ev('FUR.me=null;FUR.shown=null;fuRankChip()');
  assert.equal(p.ev("$('hFu').hidden"), false);
  assert.equal(p.ev("$('hFuVal').textContent"), '');
  assert.equal(p.ev("$('hFu').getAttribute('aria-label')"), 'Leaderboards');
  // Phones: the chip is a square trophy with the rank as a badge, the find chip slims down and the caret goes.
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.match(css, /@media \(max-width:420px\)\{\s*#hud \.chip\.fu-hud\{width:34px;min-width:34px/);
  assert.match(css, /#hud:has\(#hFu:not\(\[hidden\]\)\) \.menubtn \.caret\{display:none\}/);
  // Leaving hides it.
  p.ev('S.fed.on=false;fuDot()');
  assert.equal(p.ev("$('hFu').hidden"), true);
  assert.deepEqual(p.errors, []);
});
