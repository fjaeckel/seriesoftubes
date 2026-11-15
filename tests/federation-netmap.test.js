// A small map of another player's network in its card (95-modals/49-fed-netmap.js): read-only, from its newest
// announce; the legend, the canvas painted after each render, cities you share ringed, a 360 px phone, every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, SERVERS_JSON, URL1, PL, key, rec, rid, box } = require('./helpers/fed');

async function run(p, ms = 1000) {
  for (let t = 0; t < ms; t += 500) { p.net.advance(500); await settle(); await new Promise((r) => setTimeout(r, 5)); }
  for (let i = 0; i < 200 && p.ev('!!(FU.loading||FU.loadNext||FU.busy)'); i++) { await p.ev('FU.loading||null'); await settle(20); }
  await settle(20);
}
const ann = (name, t, body) => rec(name, 'announce', t, { name: 'Net ' + name, asn: 4200000001, box: box(name), home: 'DE', day: 120, founded: 20000, pops: ['ams', 'lon', 'par'], ix: ['ams'], cust: 7,
  mix: { content: 200, eyeball: 700, enterprise: 100 }, traffic: { in: 42000, out: 9000 }, policy: 'open', auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' },
  rates: { ix: { ports: [{ mbps: 10000, monthly: 500 }], join: 'anyone', at: ['lon'] }, wave: { routes: [{ a: 'ams', b: 'lon' }], sizes: [{ gbps: 100, monthly: 9000 }], term: 30 } }, ...body });
// mkWhy(p): what the node answers rankwhy with, made once the page exists.
async function setup(o = {}, body = {}, mkWhy = null) {
  const p = fedPage({ registry: SERVERS_JSON, ...o });
  const n = p.net.node(URL1);
  if (mkWhy) n.why = mkWhy(p);
  assert.equal(await joinGame(p), null);
  await run(p, 3000);
  const now = p.ev('FED.now()'), bob = key('bob').pub, r = ann('bob', now - 100, body);
  await p.ev(`fedAnnPut({rec:${JSON.stringify(r)},id:${JSON.stringify(rid(r))}},${now - 100},${JSON.stringify(PL.id)})`);
  p.ev(`ACT.fuOpen({v:'net',key:${JSON.stringify(bob)}})`);
  await run(p);
  return { p, bob, n, now };
}
// A live state (§5.11): exactly a stats body.
const state = (name, t, body) => rec(name, 'state', t, { mode: 'normal', pops: { ams: 1, lon: 1, par: 1 }, traffic: [], total: 0, tier1: false, shareCountry: false, ...body });
const txt = (p) => p.ev("$('modalCard').textContent");

test('the card shows the network on a small map, with a legend of what its announce says', async () => {
  const { p } = await setup();
  assert.equal(p.ev('S.home'), 'fra', 'the test game starts away from those cities');
  assert.ok(p.ev("!!$('fnmCv')"), 'a map in the card');
  for (const t of [/3 POPs/, /at 1 exchange/, /runs 1 exchange/, /1 wave route/]) assert.match(p.ev("$('modalCard').querySelector('.fnm-lg').textContent"), t);
  assert.doesNotMatch(txt(p), /where you are too/, 'no shared city yet');
  assert.match(txt(p), /3 cities where you are not/);
  assert.ok(p.ev("$('fnmCv').getContext('2d').calls.n") > 0, 'painted after the render');
  // A city you have a POP in is counted (and ringed on the map); reading the card changes nothing in the save.
  p.ev("S.pops.ams=S.pops.ams||{...S.pops[S.home]}");
  const saved = p.ev('JSON.stringify(S)');
  p.ev('fuRender()');
  assert.match(txt(p), /1 city where you are too.*2 cities where you are not/);
  assert.equal(p.ev('JSON.stringify(S)'), saved);
  assert.deepEqual(p.errors, []);
});

test('the map leaves out cities this version does not know, and is not shown without a known POP', async () => {
  const { p } = await setup({}, { pops: ['ams', 'zzq'], ix: [], rates: {} });
  assert.match(p.ev("$('modalCard').querySelector('.fnm-lg').textContent"), /^1 POP1 city where you are not$/);
  const { p: q } = await setup({}, { pops: ['zzq'], ix: [], rates: {} });
  assert.equal(q.ev("!!$('fnmCv')"), false);
  assert.deepEqual([...p.errors, ...q.errors], []);
});

test('the map fits a 360 px phone in portrait and landscape', async () => {
  const { p, bob } = await setup();
  for (const [w, h] of [[360, 740], [740, 360]]) {
    p.ev(`window.innerWidth=${w};window.innerHeight=${h};renderTabbar()`);
    assert.equal(p.ev('isPhone()'), true);
    p.ev(`ACT.fuOpen({v:'net',key:${JSON.stringify(bob)}})`);
    await run(p, 500);
    assert.ok(p.ev("!!$('fnmCv')"));
    assert.equal(p.ev("$('tabbar').hidden"), false);
  }
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.match(css, /\.fnm canvas\{display:block;width:100%/, 'the map takes the width of the sheet, never more');
  assert.deepEqual(p.errors, []);
});

test('the legend speaks every language', async () => {
  for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
    const { p } = await setup({ lang });
    assert.doesNotMatch(txt(p), /netmap\.|fedplay\./, lang);
  }
});

test('live: its traffic now, a line of it while the card is open, the players it exchanges with; asked again, and no more once closed', async () => {
  let total = 48000;
  const carol = key('carol').pub, ca = { asn: null };
  const { p, n, bob } = await setup({}, {}, (p) => () => {
    const now = p.ev('FED.now()'), me = p.ev('S.fed&&S.fed.key?S.fed.key.pub:null');
    return { items: [
      { rec: state('bob', now - 4, { total, traffic: [{ key: carol, in: 1800, out: 2400 }, ...(me ? [{ key: me, in: 300, out: 100 }] : [])] }) },
      { rec: state('carol', now - 6, { total: 9000, traffic: [{ key: key('bob').pub, in: 2400, out: 1800 }] }) },
      ...(ca.asn ? [{ rec: ann('carol', now - 50, { name: 'Carol Net', asn: ca.asn }) }] : []),
      { rec: { kind: 'state', key: key('bob').pub, t: now, v: 1, sig: 'forged', body: { total: 1 } } },
    ], at: now };
  });
  const live = () => p.ev("$('modalCard').querySelector('.fnm-live').textContent");
  assert.match(live(), /48\.0 Gbps/);
  assert.match(live(), /traffic now · updated \d+ s ago/);
  // The total with other players on one line; each of them behind a button.
  assert.match(live(), /Traffic with other players: ↓2\.1 Gbps ↑2\.5 Gbps · 2 players/);
  assert.equal(p.ev("$('modalCard').querySelectorAll('.fnm-peers').length"), 0, 'folded by default');
  p.ev(`document.querySelector('#modalCard [data-act="fnmPeers"]').click()`);
  assert.equal(p.ev(`document.querySelector('#modalCard [data-act="fnmPeers"]').getAttribute('aria-expanded')`), 'true');
  assert.match(live(), /Of174J…UKns\s*↓1\.8 Gbps ↑2\.4 Gbps/, 'an unknown player shows by its key');
  assert.match(live(), /you\s*↓300 Mbps ↑100 Mbps/);
  assert.ok(n.asks.some((f) => f.m === 'rankwhy' && f.board === 'traffic' && f.measure === 'now' && f.key === bob));
  const asked = () => n.asks.filter((f) => f.m === 'rankwhy').length, a1 = asked();
  ca.asn = await p.ev(`fedAsn(${JSON.stringify(carol)})`);
  total = 60000;
  await run(p, 16000);
  assert.ok(asked() > a1, 'asked again while the card is open');
  assert.match(live(), /60\.0 Gbps/);
  assert.match(live(), /Carol Net\s*↓1\.8 Gbps ↑2\.4 Gbps/, 'named from an announce in the answer');
  assert.equal(p.ev("$('modalCard').querySelectorAll('.fnm-spark').length"), 1, 'a line of what it did since the card opened');
  p.ev('ACT.fuClose()');
  const a2 = asked();
  await run(p, 31000);
  assert.equal(asked(), a2, 'nothing is asked once the card is closed');
  assert.deepEqual(p.errors, []);
});

test('live: a network not playing now shows the last traffic it announced', async () => {
  const { p } = await setup({}, {}, () => () => ({ items: [] }));
  assert.match(p.ev("$('modalCard').querySelector('.fnm-live').textContent"), /Not playing right now\. Last traffic it announced: 42\.0 Gbps/);
  assert.deepEqual(p.errors, []);
});

test('the map: a tap on a POP says what is there; ± zoom and back to the whole network', async () => {
  const { p } = await setup({}, { rates: { ix: { ports: [{ mbps: 10000, monthly: 500 }, { mbps: 100000, monthly: 2500 }], join: 'anyone', at: ['lon'] }, wave: { routes: [{ a: 'ams', b: 'lon' }], sizes: [{ gbps: 100, monthly: 9000 }], term: 30 } } });
  assert.match(txt(p), /Tap a POP on the map/);
  // A tap where London is drawn picks it.
  const [x, y] = JSON.parse(p.ev("(()=>{const q=FNM.pts.find(q=>q.c==='lon');return JSON.stringify([q.x,q.y]);})()"));
  p.ev(`(()=>{const cv=$('fnmCv'),E=window.PointerEvent||window.MouseEvent;for(const t of ['pointerdown','pointerup'])cv.dispatchEvent(new E(t,{clientX:${x},clientY:${y},pointerId:1,bubbles:true}));})()`);
  const sel = p.ev("$('modalCard').querySelector('.fnm-sel').textContent");
  for (const t of [/London/, /Runs the exchange here · ports from \$500\/mo/, /Waves to Amsterdam · from \$9\.0k\/mo/, /You have no POP here/]) assert.match(sel, t);
  // A tap on the sea picks nothing.
  p.ev(`(()=>{const cv=$('fnmCv'),E=window.PointerEvent||window.MouseEvent;for(const t of ['pointerdown','pointerup'])cv.dispatchEvent(new E(t,{clientX:2,clientY:2,pointerId:2,bubbles:true}));})()`);
  assert.equal(p.ev("!!$('modalCard').querySelector('.fnm-sel')"), false);
  const z0 = p.ev('FNM.view.z');
  p.ev('ACT.fnmZoom({d:1})');
  assert.ok(p.ev('FNM.view.z') > z0);
  p.ev('ACT.fnmZoom({d:0})');
  assert.equal(p.ev('FNM.view.z'), z0);
  assert.deepEqual(p.errors, []);
});
