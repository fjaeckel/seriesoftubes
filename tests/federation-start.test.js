// Starting a new game in multiplayer from the title screen (95-modals/47-fed-start.js): the "Play with others" switch
// under the Normal door, its lazy server picker, the invite, joining once the charter is signed (no join sheet), a
// failed join that starts solo with a toast, the choice remembered per device, and the switch at 360 px on a phone.
// Fake relay nodes on a virtual clock, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { fedPage, settle, URL1, URL2, SERVERS_JSON } = require('./helpers/fed');

const val = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const click = (p, sel) => p.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)throw new Error('no '+${JSON.stringify(sel)});b.click();})()`);
async function run(p, ms = 3000) {
  for (let t = 0; t < ms; t += 500) { p.net.advance(500); await settle(); await new Promise((r) => setTimeout(r, 5)); }
  for (let i = 0; i < 40; i++) { await settle(20); await new Promise((r) => setTimeout(r, 5)); if (!p.ev('FS.busy')) break; }
  await settle(40);
}
// A page whose registry fetches are counted (FED.fetch is the only way the game asks for servers.json).
function page(o = {}) {
  const p = fedPage({ registry: SERVERS_JSON, ...o });
  p.fetches = 0;
  const f = p.w.__fetch;
  p.w.__fetch = (u) => { p.fetches++; return f(u); };
  return p;
}
const sw = (p) => p.ev(`(()=>{const b=document.querySelector('#fsTog');return b?b.getAttribute('aria-checked'):null})()`);
const rows = (p) => val(p, `[...document.querySelectorAll('#modalCard .fs-srv')].map(b=>({name:b.querySelector('b').textContent,url:b.dataset.url,on:b.classList.contains('on')}))`);
const toasts = (p) => p.ev("$('toasts').textContent");
const charter = (p) => p.ev('ACT.charter({k:Object.keys(CHARTERS)[0]})');

test('the switch shows under the Normal door only, and only where the browser signs and seals', async () => {
  const solo = load();
  await settle(40);
  solo.ev('showTitle()');
  assert.equal(sw(solo), null, 'no WebCrypto Ed25519: no switch');
  assert.deepEqual(solo.errors, []);

  const p = page();
  await run(p, 500);
  assert.equal(sw(p), 'false', 'off by default');
  assert.ok(p.ev(`!!document.querySelector('#doorNormal #fsTog')`), 'inside the Normal door');
  assert.match(p.ev("$('modalCard').textContent"), /Play with others/);
  // Sandbox hides it, and starting there carries no multiplayer choice.
  p.ev("ACT.modeSet({m:'sandbox'})");
  assert.equal(p.ev("$('doorNormal').hidden"), true);
  click(p, '#doorNormal #fsTog');
  p.ev('ACT.start({})');
  assert.equal(p.ev('S.mode'), 'sandbox');
  assert.equal(p.ev('UI.fedGo'), null);
  // Scenarios open their own list, without the switch.
  p.ev('showTitle();ACT.scenarios()');
  assert.equal(sw(p), null);
  p.ev('ACT.startScn({id:SCN[0].id})');
  assert.equal(p.ev('UI.fedGo'), null);
  assert.deepEqual(p.errors, []);
});

test('turning the switch on is what fetches the registry; the default is the open server that answered last', async () => {
  const p = page();
  await run(p, 1000);
  p.ev('showTitle()');
  await run(p, 500);
  assert.equal(p.fetches, 0, 'drawing the title (twice) fetched nothing');
  assert.equal(p.ev(`document.querySelector('#modalCard .fs-list')`), null, 'no picker while off');
  click(p, '#fsTog');
  await run(p, 500);
  assert.equal(p.fetches, 1, 'one fetch, when switched on');
  assert.equal(sw(p), 'true');
  const r = rows(p);
  assert.deepEqual(r.map((x) => x.name), ['Hop Shop', 'Packet Lunch'], 'registry servers by name');
  assert.deepEqual(r.filter((x) => x.on).map((x) => x.url), [URL1], 'Packet Lunch (open, answered most recently) is picked');
  assert.match(p.ev("$('modalCard').textContent"), /Open: syncs with every open server/, 'each row says its policy');
  assert.match(p.ev("$('modalCard').textContent"), /name is public on every server you join/);
  // Off and on again: no second fetch on this page.
  click(p, '#fsTog'); click(p, '#fsTog');
  await run(p, 300);
  assert.equal(p.fetches, 1);
  // Picking another row, then typing an address, which wins over the rows.
  click(p, '#modalCard .fs-srv[data-url="wss://third.example.com"]');
  assert.deepEqual(rows(p).filter((x) => x.on).map((x) => x.name), ['Hop Shop']);
  p.ev(`const i=$('fsUrl');i.value='wss://typed.example/fed';i.dispatchEvent(new Event('input'))`);
  assert.deepEqual(rows(p).filter((x) => x.on), [], 'typing deselects the rows');
  assert.equal(p.ev('fsSel()'), 'wss://typed.example/fed');
  assert.deepEqual(p.errors, []);
});

test('an invite switches it on and picks the invited server first, without fetching until asked', async () => {
  const p = page({ url: 'https://tests.invalid/#join=' + encodeURIComponent(URL2) });
  await run(p, 500);
  assert.equal(sw(p), 'true', 'on by default with an invite');
  assert.equal(p.fetches, 0, 'switched on by the invite: the cached catalog only');
  assert.deepEqual(rows(p), [{ name: URL2 + ' You were invited', url: URL2, on: true }], 'not in the cache yet: the invited address itself, picked');
  // Asked for: the registry knows the invite as a node of Packet Lunch, which comes first, still picked at the invite.
  click(p, '#fsTog'); click(p, '#fsTog');
  await run(p, 500);
  assert.equal(p.fetches, 1);
  const r = rows(p);
  assert.equal(r[0].url, URL2);
  assert.match(r[0].name, /^Packet Lunch You were invited$/);
  assert.equal(r[0].on, true);
  assert.equal(r.filter((x) => x.on).length, 1);
  assert.deepEqual(p.errors, []);
});

test('starting with the switch on joins the pick once the charter is signed, without the join sheet', async () => {
  const p = page({ url: 'https://tests.invalid/#join=' + encodeURIComponent(URL1) });
  const n = p.net.node(URL1);
  await run(p, 500);
  p.ev('ACT.start({})');
  assert.equal(p.ev('UI.started'), true);
  assert.equal(p.ev('!!(S.fed&&S.fed.on)'), false, 'nothing joined before the charter');
  assert.deepEqual(val(p, 'fsMem()'), { on: true, url: URL1 }, 'the choice is remembered');
  charter(p);
  await run(p, 3000);
  assert.equal(p.ev('S.fed.on'), true);
  assert.deepEqual(val(p, 'S.fed.servers'), [URL1]);
  assert.ok(n.hellos >= 1, 'the node was dialled');
  assert.equal(p.ev('UI.fu&&UI.fu.v||null'), null, 'no join sheet');
  assert.equal(p.ev("!!$('modalCard').querySelector('.fedui')"), false);
  assert.match(toasts(p), /Joined Packet Lunch/);
  assert.equal(p.ev("$('hFed').hidden"), false);
  assert.equal(p.ev("$('hFed').className"), 'fed-dot connected');
  assert.equal(p.ev('UI.fedInvite'), null, 'the invite is used up');
  assert.deepEqual(p.errors, []);
});

test('a join that fails starts solo, with a toast that opens the join sheet', async () => {
  // A typed address that is not one.
  const p = page();
  await run(p, 500);
  click(p, '#fsTog');
  await run(p, 300);
  p.ev(`const i=$('fsUrl');i.value='http://nope.example';i.dispatchEvent(new Event('input'))`);
  p.ev('ACT.start({})');
  charter(p);
  await run(p, 500);
  assert.equal(p.ev('UI.started'), true, 'the game started');
  assert.equal(p.ev('!!(S.fed&&S.fed.on)'), false, 'solo');
  assert.match(toasts(p), /Your network starts solo: That is not a server address/);
  assert.ok(p.ev(`!!document.querySelector('#toasts [data-act="fuOpen"]')`), 'with a button to the join sheet');
  click(p, '#toasts [data-act="fuOpen"]');
  await run(p, 300);
  assert.equal(p.ev('UI.fu.v'), 'join');
  assert.deepEqual(p.errors, []);

  // A server that never answers: joined for a moment, then left again.
  const q = page();
  q.net.node(URL1).up = false;
  await run(q, 500);
  click(q, '#fsTog');
  await run(q, 300);
  q.ev('ACT.start({})');
  charter(q);
  await run(q, 40000);
  assert.equal(q.ev('S.fed.on'), false, 'back to solo');
  assert.deepEqual(val(q, 'S.fed.servers'), []);
  assert.match(toasts(q), /Packet Lunch did not answer, so your network starts solo/);
  assert.equal(q.ev("$('hFed').hidden"), true);
  assert.equal(q.ev('UI.fu&&UI.fu.v||null'), null, 'no sheet opened by itself');
  assert.deepEqual(q.errors, []);
});

test('the choice is remembered for the next new game on this device, never forced', async () => {
  const p = page({ storage: { 'sot-fed-start': JSON.stringify({ on: true, url: URL2 }) } });
  await run(p, 500);
  assert.equal(sw(p), 'true', 'remembered on');
  assert.equal(p.fetches, 0, 'remembered on: still no fetch on load');
  assert.deepEqual(rows(p).filter((x) => x.on).map((x) => x.url), [URL2]);
  click(p, '#fsTog');
  p.ev('ACT.start({})');
  assert.deepEqual(val(p, 'fsMem()'), { on: false, url: URL2 }, 'turned off, remembered off');
  charter(p);
  await run(p, 500);
  assert.equal(p.ev('!!(S.fed&&S.fed.on)'), false);
  assert.equal(p.ev('UI.fu&&UI.fu.v||null'), null);
  p.ev('showTitle()');
  assert.equal(sw(p), 'false');
  // Broken memory is ignored; on with nothing known and nothing typed asks for a server instead of starting.
  const q = page({ storage: { 'sot-fed-start': '{"on":true,"url":"javascript:alert(1)"}' }, registry: null });
  await run(q, 500);
  assert.equal(sw(q), 'true');
  assert.deepEqual(rows(q), []);
  assert.match(q.ev("$('modalCard').textContent"), /No servers known yet/);
  q.ev('ACT.start({})');
  assert.equal(q.ev('!!UI.started'), false);
  assert.match(toasts(q), /Pick a server to play with others/);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(q.errors, []);
});

test('the switch and its picker fit a 360 px phone, in portrait and landscape', async () => {
  const p = page();
  await run(p, 500);
  click(p, '#fsTog');
  await run(p, 500);
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.match(css, /\.fs-list\{[^}]*max-height:min\(190px,30vh\);overflow-y:auto/, 'the list scrolls inside the card');
  assert.match(css, /\.fs-srv\{[^}]*min-width:0[^}]*overflow-wrap:anywhere/, 'long names and addresses wrap');
  for (const [w, h] of [[360, 740], [740, 360]]) {
    p.ev(`window.innerWidth=${w};window.innerHeight=${h};showTitle()`);
    await run(p, 200);
    assert.equal(p.ev('isPhone()'), true);
    assert.equal(sw(p), 'true');
    assert.equal(rows(p).length, 2);
    assert.equal(p.ev(`[...document.querySelectorAll('#fsBox [style]')].length`), 0, 'no fixed sizes in the picker');
    assert.ok(p.ev(`!!document.querySelector('#modalCard #fsUrl.t')`), 'the address field is the full-width text field');
  }
  for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
    const q = page({ lang });
    await run(q, 500);
    click(q, '#fsTog');
    await run(q, 300);
    assert.doesNotMatch(q.ev("$('modalCard').textContent"), /fedui\./, lang);
    assert.deepEqual(q.errors, [], lang);
  }
  assert.deepEqual(p.errors, []);
});
