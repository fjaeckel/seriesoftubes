// The multiplayer interface (95-modals/47-49-fed-*.js): joining with the policy first, the settings sheet, the quiet
// status dot, invite links, the move-file warning, the operator key, the leaderboards with their filters, the looking
// glass and the operator panel, and every sheet at 360 px on a phone. Fake relay nodes on a virtual clock, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { fedPage, joinGame, settle, URL1, URL2, SERVERS_JSON, PL, key, rec, rid, canon, signText } = require('./helpers/fed');

const txt = (p) => p.ev("$('modalCard').textContent");
const click = (p, sel) => p.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)throw new Error('no '+${JSON.stringify(sel)});b.click();})()`);
// Lets the core's timers and the sheets' async loads run.
// WebCrypto answers on its own thread, so a few real milliseconds go by too.
async function run(p, ms = 3000) { for (let t = 0; t < ms; t += 500) { p.net.advance(500); await settle(); await new Promise((r) => setTimeout(r, 5)); } await settle(40); }
// Values from the page's realm, as plain values of this one.
const val = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
async function joined(o = {}) {
  const p = fedPage({ registry: SERVERS_JSON, ...o });
  const n = p.net.node(URL1);
  assert.equal(await joinGame(p), null);
  await run(p);
  return { p, n };
}
const ann = (name, t, body) => rec(name, 'announce', t, { name: 'Net ' + name, asn: 4200000001, home: 'DE', day: 120, founded: 20000, pops: ['fra', 'ams'], ix: ['fra'], cust: 7,
  mix: { content: 200, eyeball: 700, enterprise: 100 }, traffic: { in: 1000, out: 900 }, policy: 'open', rates: {}, auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' }, ...body });

test('without WebCrypto Ed25519 multiplayer is not offered anywhere', async () => {
  const p = load();
  p.ev('ACT.start({});ACT.settings({})');
  await settle(40);
  p.ev('refreshSettings()');
  assert.doesNotMatch(txt(p), /Multiplayer/);
  p.ev('ACT.menu({})');
  assert.equal(p.ev(`!!document.querySelector('#modalCard [data-act="fuOpen"]')`), false);
  assert.equal(p.ev("$('hFed').hidden"), true);
  assert.deepEqual(p.errors, []);
});

test('joining: the catalog with each policy first, names are public, the dot turns green; leaving turns it off', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  const n = p.net.node(URL1);
  p.ev('ACT.start({});ACT.settings({})');
  await run(p, 500);
  assert.match(txt(p), /Multiplayer/, 'Settings has a multiplayer line once Ed25519 is known to work');
  click(p, '#modalCard [data-act="fuOpen"]');
  await run(p, 1000);
  click(p, '#modalCard .btns [data-act="fuOpen"][data-args*="join"]');
  await run(p, 1000);
  assert.match(txt(p), /name is public on every server you join: better not to use your real name/);
  const cards = val(p, `[...document.querySelectorAll('#modalCard .fu-srv')].map(c=>({first:c.firstElementChild.className,name:c.querySelector('b').textContent,reg:!!c.querySelector('.fu-tag.reg')}))`);
  assert.deepEqual(cards.map((c) => c.name).sort(), ['Hop Shop', 'Packet Lunch']);
  assert.ok(cards.every((c) => c.first === 'fu-pol' && c.reg), 'the policy comes first, registry entries are marked');
  assert.match(txt(p), /Open: syncs with every open server/);
  click(p, `#modalCard [data-act="fuJoin"][data-args*="relay.example.net"]`);
  await run(p);
  assert.equal(p.ev('S.fed.on'), true);
  assert.deepEqual(val(p, 'S.fed.servers'), [URL1]);
  assert.match(txt(p), /Joined Packet Lunch/);
  assert.match(txt(p), /Packet Lunch/, 'the joined server is listed by name');
  assert.equal(p.ev("$('hFed').hidden"), false);
  assert.equal(p.ev("$('hFed').className"), 'fed-dot connected');
  // The server dies: a quiet dot, no modal, no red toast.
  p.ev('ACT.fuClose()');
  assert.match(txt(p), /Settings/, 'opened from Settings, closing goes back there');
  p.ev('ACT.settingsClose()');
  n.kill();
  await run(p, 2000);
  assert.equal(p.ev("$('hFed').className"), 'fed-dot offline');
  assert.match(p.ev("$('hFed').title"), /offline since/);
  assert.equal(p.ev("$('modal').hidden"), true, 'no dialog');
  assert.equal(p.ev("document.querySelectorAll('#toasts .toast.bad').length"), 0, 'no red toast');
  p.ev("ACT.fuOpen({v:'home'})");
  await run(p, 500);
  click(p, `#modalCard [data-act="fuLeave"]`);
  await settle(20);
  assert.equal(p.ev('S.fed.on'), false);
  assert.equal(p.ev("$('hFed').hidden"), true);
  assert.deepEqual(p.errors, []);
});

test('ineligible modes are explained, a typed address is checked, queued actions say so', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  p.ev("ACT.start({});S.mode='sandbox';ACT.fuOpen({v:'join'})");
  await run(p, 1000);
  assert.match(txt(p), /Sandbox and open-gates networks play alone/);
  assert.equal(p.ev(`document.querySelectorAll('#modalCard [data-act="fuJoin"]').length`), 0);
  p.ev("S.mode='normal';delete S.rules;ACT.fuOpen({v:'join'})");
  await run(p, 1000);
  p.ev("$('fuUrl').value='http://nope.example'");
  click(p, '#modalCard [data-act="fuJoinTyped"]');
  await run(p, 500);
  assert.match(txt(p), /That is not a server address/);
  assert.equal(p.ev('S.fed'), null, 'nothing joined, nothing made');
  // Joined but offline: an offer waiting in the queue says it is queued.
  p.net.node(URL1).up = false;
  p.ev(`$('fuUrl').value=${JSON.stringify(URL1)}`);
  click(p, '#modalCard [data-act="fuJoinTyped"]');
  await run(p, 2000);
  assert.equal(p.ev('S.fed.on'), true);
  p.ev(`S.fed.out.push({kind:'offer'});fuDot();ACT.fuOpen({v:'home'})`);
  await run(p, 500);
  assert.match(txt(p), /1 action is queued: it goes out when a server answers/);
  assert.match(p.ev("$('hFed').title"), /1 action queued/);
  assert.deepEqual(p.errors, []);
});

test('an invite link is taken from the address bar, mentioned on the title screen, and offered when joining', async () => {
  const p = fedPage({ registry: SERVERS_JSON, url: 'https://tests.invalid/#join=' + encodeURIComponent(URL2) });
  await settle(20);
  assert.equal(p.ev('location.hash'), '');
  assert.equal(p.ev('UI.fedInvite'), URL2);
  p.ev('showTitle()');
  assert.match(txt(p), /You were invited to wss:\/\/second\.example\.org:8443\/fed/);
  p.ev("ACT.start({});ACT.fuOpen({v:'join'})");
  await run(p, 1000);
  assert.match(txt(p), /You were invited/);
  assert.equal(p.ev(`document.querySelector('#modalCard .fu-box .fu-srv b').textContent`), 'Packet Lunch', 'the invite is recognised as a node of a known server');
  // A broken invite is ignored.
  const q = fedPage({ url: 'https://tests.invalid/#join=javascript%3Aalert(1)' });
  await settle(20);
  assert.equal(q.ev('UI.fedInvite||null'), null);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(q.errors, []);
});

test('settings: share my country, mutes, the move file behind its warning, the operator key, quitting', async () => {
  const { p } = await joined();
  p.ev("window.__files=[];saveDl=(txt,nm,fn)=>__files.push({name:fn,text:txt});ACT.fuOpen({v:'home'})");
  await run(p, 500);
  assert.match(txt(p), /Share my country/);
  assert.match(txt(p), /never anything finer/);
  click(p, '#modalCard [data-act="fuShare"][data-args*="false"]');
  assert.equal(p.ev('S.fed.share'), false);
  p.ev(`fedMute(${JSON.stringify(key('bob').pub)},true);fuRender()`);
  assert.equal(p.ev(`document.querySelectorAll('#modalCard [data-act="fuMute"]').length`), 1);
  click(p, '#modalCard [data-act="fuMute"]');
  assert.deepEqual(val(p, 'S.fed.muted'), []);
  // The move file: a warning first, then the one file with the key.
  click(p, '#modalCard [data-act="fuOpen"][data-args*="move"]');
  assert.match(txt(p), /Anyone with this file can post as your network/);
  assert.match(txt(p), /Never attach it to a bug report/);
  assert.equal(p.ev('__files.length'), 0, 'nothing downloaded before the warning is accepted');
  click(p, '#modalCard [data-act="fuMoveGo"]');
  assert.equal(p.ev('__files.length'), 1);
  assert.match(p.ev('__files[0].name'), /-move-PRIVATE\.json$/);
  // The operator key: a bad paste is refused, a good one kept on the device (never in the save), and removable.
  click(p, '#modalCard [data-act="fuOpen"][data-args*="opkey"]');
  p.ev("$('fuOpIn').value='not a key'");
  click(p, '#modalCard [data-act="fuOpKeyGo"]');
  await run(p, 500);
  assert.match(txt(p), /That is not an operator key/);
  p.ev(`$('fuOpIn').value=${JSON.stringify(key('anna').seed)}`);
  click(p, '#modalCard [data-act="fuOpKeyGo"]');
  await run(p, 500);
  assert.match(txt(p), /Operator key on this device/);
  assert.doesNotMatch(p.ev('JSON.stringify(S)'), new RegExp(key('anna').seed));
  click(p, '#modalCard [data-act="fuOpKeyDel"]');
  await run(p, 500);
  assert.match(txt(p), /Operator key removed/);
  assert.equal(await p.ev('fedOpKey()'), null);
  // Quitting asks first, then sends a signed leave and forgets the identity.
  click(p, '#modalCard [data-act="fuOpen"][data-args*="quit"]');
  assert.match(txt(p), /Leave multiplayer for good\?/);
  click(p, '#modalCard [data-act="fuQuit"]');
  await run(p, 6000);
  assert.equal(p.ev('S.fed.key'), null);
  assert.equal(p.ev('S.fed.on'), false);
  assert.deepEqual(p.errors, []);
});

test('a shunned player is told why and that solo play goes on; 14 days unreachable gives one gentle suggestion', async () => {
  const { p, n } = await joined();
  p.ev("fedShunInfo=async()=>({shunned:true,voters:12,need:5,votes:5,reasons:{spam:3,cheating:2}});ACT.fuOpen({v:'home'})");
  await run(p, 500);
  assert.match(txt(p), /The federation excluded your network/);
  assert.match(txt(p), /Spam: 3 servers/);
  assert.match(txt(p), /Cheating: 2 servers/);
  assert.match(txt(p), /plays on as always, solo and offline/);
  p.ev('ACT.fuClose()');
  // Last reached 15 days ago (this device remembers), and the server is gone now.
  const pub = p.ev('S.fed.key.pub');
  p.ev(`localStorage.setItem('sot-fed-seen',JSON.stringify({[${JSON.stringify(pub)}]:{t:FED.now()-15*86400,told:0}}))`);
  n.kill();
  await run(p, 2000);
  assert.equal(p.ev(`[...document.querySelectorAll('#toasts .toast')].filter(t=>/not answered for two weeks/.test(t.textContent)).length`), 1);
  assert.equal(p.ev("document.querySelectorAll('#toasts .toast.bad').length"), 0);
  assert.equal(p.ev("$('modal').hidden"), true);
  p.net.advance(60000); await settle();
  assert.equal(p.ev(`[...document.querySelectorAll('#toasts .toast')].filter(t=>/not answered for two weeks/.test(t.textContent)).length`), 1, 'only once');
  p.ev("ACT.fuOpen({v:'home'})");
  await run(p, 500);
  assert.match(txt(p), /not answered for two weeks/);
  assert.deepEqual(p.errors, []);
});

// A cached board: Bob and Carol (AI) and this network, as if fetched earlier from Packet Lunch.
async function seedBoard(p) {
  const me = p.ev('S.fed.key.pub'), now = p.ev('FED.now()'), slot = now - (now % 300) - 600;
  const row = (k, id, body) => ({ id, key: k, slot, t: slot + 10, cc: 'DE', body: { mode: 'normal', pops: { fra: 1 }, traffic: [], tier1: false, shareCountry: true, ...body } });
  const items = [
    row(key('bob').pub, 'b'.repeat(43), { pops: { fra: 1, ams: 1, lon: 1 } }),
    row(key('carol').pub, 'c'.repeat(43), { pops: { fra: 1, ams: 1 }, ai: { model: 'm1', harness: 'h1' } }),
    row(me, 'd'.repeat(43), { pops: { fra: 1 } }),
  ];
  await p.ev(`fedBoardPut(${JSON.stringify(PL.id)},${JSON.stringify(items)})`);
  for (const [nm, pol] of [['bob', 'open'], ['carol', 'selective']]) {
    const r = ann(nm, now - 100, { name: nm === 'bob' ? 'Bob <b>Net</b>' : 'Carol Bot', policy: pol, ...(pol === 'selective' ? { cond: { minMbps: 0, maxRatio: 300, minShared: 1, rpki: false, tier1: false, ai: true } } : {}) });
    await p.ev(`fedAnnPut({rec:${JSON.stringify(r)},id:${JSON.stringify(rid(r))}},${now - 100},${JSON.stringify(PL.id)})`);
  }
}

test('leaderboards: three boards, divisions with robot badges, own row pinned, filters combine, offline "as of"', async () => {
  const p = fedPage({ registry: SERVERS_JSON });
  p.net.node(URL1).up = false;// offline: the boards come from the cache
  await joinGame(p);
  await run(p, 1000);
  await seedBoard(p);
  p.ev("ACT.fuOpen({v:'boards'});ACT.fuQ({k:'board',v:'pops'})");
  await run(p, 500);
  const rows = () => val(p, `[...document.querySelectorAll('#modalCard .fu-board:not(.pinned) .fu-row')].map(r=>r.querySelector('.fu-nm').textContent.trim())`);
  assert.deepEqual(rows().map((r) => r.split(' AS')[0]), ['Bob <b>Net</b>', 'Carol Bot 🤖'], 'names as typed, as text; the AI with its robot');
  assert.equal(p.ev(`document.querySelectorAll('#modalCard .fu-board b b').length`), 0, 'a typed name is never markup');
  assert.match(p.ev(`document.querySelector('#modalCard .fu-board.pinned').textContent`), /#3.*you/s, 'own row pinned with its rank');
  assert.match(txt(p), /All your servers, merged/);
  assert.match(txt(p), /as of /, 'offline: the time of the cached board');
  click(p, '#modalCard [data-act="fuQ"][data-args*="\\"ai\\""]');
  await run(p, 500);
  assert.deepEqual(rows().map((r) => r.split(' AS')[0]), ['Carol Bot 🤖']);
  assert.match(txt(p), /not in this slice/);
  click(p, '#modalCard [data-act="fuQ"][data-args*="\\"all\\""]');
  await run(p, 500);
  // More filters: a second sheet; a policy chip filters and shows as an active chip that removes itself.
  click(p, '#modalCard [data-act="fuOpen"][data-args*="filters"]');
  await run(p, 500);
  assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'filters');
  for (const t of [/AI setup/, /Region/, /Home market/, /Players from/, /Network age/, /Tier 1/, /Peering policy/, /Peers with me/]) assert.match(txt(p), t);
  click(p, '#modalCard [data-act="fuQ"][data-args*="selective"]');
  await run(p, 500);
  assert.match(txt(p), /Show 1 network/);
  p.ev(`(()=>{const s=$('fuF_model');s.value='m1';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await run(p, 500);
  assert.equal(p.ev('UI.fu.q.model'), 'm1');
  click(p, '#modalCard .cta [data-act="fuOpen"]');
  await run(p, 500);
  assert.deepEqual(rows().map((r) => r.split(' AS')[0]), ['Carol Bot 🤖']);
  assert.equal(p.ev(`document.querySelectorAll('#modalCard .fu-chip.act').length`), 2);
  click(p, '#modalCard .fu-chip.act[data-args*="policy"]');
  click(p, '#modalCard .fu-chip.act[data-args*="model"]');
  await run(p, 500);
  assert.equal(rows().length, 2);
  // Growth needs two days of records: nobody yet, and it says why.
  click(p, '#modalCard [data-act="fuQ"][data-args*="growth"]');
  await run(p, 500);
  assert.match(txt(p), /third day/);
  assert.deepEqual(p.errors, []);
});

test('looking glass: servers, policies, players, votes in public; operator panel and hide/shun for an operator', async () => {
  const { p, n } = await joined();
  await seedBoard(p);
  const now = p.ev('FED.now()'), target = key('bob').pub;
  const vote = rec('anna', 'shun', now - 3600, { server: PL.id, target, reason: 'spam' });
  await p.ev(`fedVotesAdd([{id:${JSON.stringify(rid(vote))},rec:${JSON.stringify(vote)}}])`);
  p.ev("ACT.fuOpen({v:'glass'})");
  await run(p, 500);
  assert.match(txt(p), /2 servers known/);
  assert.match(txt(p), /Packet Lunch In the registry/);
  assert.match(txt(p), /syncs openly · 3 players · 3 operators/);
  assert.match(txt(p), /Packet Lunch voted to shun Bob <b>Net<\/b> · Spam/);
  // A network's read-only status.
  click(p, `#modalCard [data-act="fuOpen"][data-args*=${JSON.stringify(JSON.stringify(target).slice(1, -1))}]`);
  await run(p, 500);
  assert.match(txt(p), /AS4200000001/);
  assert.match(txt(p), /1 of 5 votes needed/);
  assert.match(txt(p), /Spam: 1 server/);
  assert.equal(p.ev(`document.querySelectorAll('#modalCard .fu-op').length`), 0, 'no operator tools without an operator key');
  // With Anna's operator key: the panel on her server, and hide and shun on the network.
  assert.equal(await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`), true);
  p.ev(`ACT.fuOpen({v:'server',id:${JSON.stringify(PL.id)}})`);
  await run(p, 500);
  for (const t of [/Operator panel/, /Proposals to sign/, /Node status/, /Recent errors/]) assert.match(txt(p), t);
  assert.match(txt(p), /wss:\/\/relay\.example\.net\/fed\s*connected/);
  assert.match(txt(p), /second\.example\.org:8443\/fed\s*not in use by this game/);
  p.ev(`ACT.fuOpen({v:'net',key:${JSON.stringify(target)}})`);
  await run(p, 500);
  assert.match(txt(p), /Operator actions on Packet Lunch/);
  assert.match(txt(p), /This server votes to shun it \(Spam\)/);
  click(p, '#modalCard [data-act="fuOpHide"][data-args*="\\"hide\\""]');
  await run(p, 500);
  const hide = n.puts.find((r) => r.kind === 'hide');
  assert.ok(hide, 'a signed hide went out');
  assert.deepEqual(hide.body.hide, [target]);
  assert.match(txt(p), /Unhide/);
  click(p, '#modalCard [data-act="fuOpShun"]');// withdraw the vote
  await run(p, 500);
  assert.ok(n.puts.some((r) => r.kind === 'unshun' && r.body.target === target));
  click(p, '#modalCard [data-act="fuOpShun"][data-args*="cheating"]');
  await run(p, 500);
  assert.ok(n.puts.some((r) => r.kind === 'shun' && r.body.reason === 'cheating'));
  // Only pre-made reasons: anything else is refused before signing.
  assert.equal((await p.ev(`fedOpShun(${JSON.stringify(PL.id)},${JSON.stringify(target)},'i do not like them')`)).error, 'bad_field');
  assert.deepEqual(p.errors, []);
});

test('every multiplayer sheet works on a 360 px phone, in portrait and landscape, with the tab bar', async () => {
  const { p } = await joined();
  await seedBoard(p);
  await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`);
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.match(css, /\.fedui \.fu-chips:not\(\.wrap\)\{flex-wrap:nowrap;overflow-x:auto/, 'chip rows scroll sideways on phones');
  for (const [w, h] of [[360, 740], [740, 360]]) {
    p.ev(`window.innerWidth=${w};window.innerHeight=${h};renderTabbar()`);
    assert.equal(p.ev('isPhone()'), true);
    assert.equal(p.ev("$('tabbar').hidden"), false, 'the tab bar stays');
    for (const v of [{ v: 'home' }, { v: 'join' }, { v: 'boards' }, { v: 'filters' }, { v: 'glass' }, { v: 'server', id: PL.id }, { v: 'net', key: key('bob').pub }, { v: 'move' }, { v: 'quit' }, { v: 'opkey' }]) {
      p.ev(`ACT.fuOpen(${JSON.stringify(v)})`);
      await run(p, 500);
      assert.equal(p.ev("$('modal').hidden"), false, v.v);
      assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), v.v);
      assert.ok(p.ev(`!!document.querySelector('#modalCard [data-act="fuClose"]')`), `${v.v}: can be closed`);
      // Nothing is laid out wider than the phone: no fixed widths in the sheet.
      assert.equal(p.ev(`[...document.querySelectorAll('#modalCard [style]')].filter(e=>/(^|;)\\s*(min-)?width:\\s*[4-9]\\d\\dpx/.test(e.getAttribute('style'))).length`), 0, v.v);
      assert.doesNotMatch(txt(p), /fedui\./, `${v.v}: no label shows untranslated`);
    }
    // "More filters" is a second sheet on phones, with its own way back to the board.
    p.ev("ACT.fuOpen({v:'boards'})");
    await run(p, 300);
    click(p, '#modalCard .fu-chip.more');
    await run(p, 300);
    assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'filters');
    click(p, '#modalCard .fu-back');
    await run(p, 300);
    assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'boards');
  }
  assert.deepEqual(p.errors, []);
});

test('the sheets are complete in every language', async () => {
  for (const lang of ['de', 'es', 'fr', 'it', 'pt']) {
    const { p } = await joined({ lang });
    for (const v of ['home', 'join', 'boards', 'filters', 'glass']) {
      p.ev(`ACT.fuOpen({v:'${v}'})`);
      await run(p, 300);
      assert.doesNotMatch(txt(p), /fedui\./, `${lang} ${v}`);
    }
    assert.deepEqual(p.errors, [], lang);
  }
});

test('the operator panel lists a pending proposal and signs it with the operator key', async () => {
  const { p, n } = await joined();
  const now = p.ev('FED.now()'), body = { server: PL.id, prev: PL.server.body.head, action: 'add_operator', target: key('dave').pub };
  const prop = { v: 1, kind: 'operators', key: key('anna').pub, t: now - 100, body };
  prop.sigs = [{ key: key('anna').pub, sig: signText(key('anna'), canon(prop)) }];
  n.feed = [{ rec: PL.genesis }, ...PL.chain.map((r) => ({ rec: r })), { rec: prop }];
  n.cosigns = [];
  const take = n.take.bind(n);
  n.take = (ws, t) => { const f = JSON.parse(t); if (f.m === 'cosign') { n.cosigns.push(f); n.send(ws, { m: 'ack', id: f.id, rid: f.rid, dup: false }); return; } take(ws, t); };
  await p.ev(`fedOpKeySet(${JSON.stringify(key('ben').seed)})`);
  p.ev(`ACT.fuOpen({v:'server',id:${JSON.stringify(PL.id)}})`);
  await run(p, 1000);
  assert.match(txt(p), /Add an operator/);
  assert.match(txt(p), /1 of 3 signatures/);
  click(p, '#modalCard [data-act="fuOpSign"]');
  await run(p, 1000);
  assert.equal(n.cosigns.length, 1);
  assert.equal(n.cosigns[0].key, key('ben').pub);
  const { sigs, ...unsigned } = prop;
  assert.equal(n.cosigns[0].rid, rid(unsigned));
  assert.deepEqual(p.errors, []);
});
