// The multiplayer interface (95-modals/47-49-fed-*.js): joining with the policy first, the settings sheet, the quiet
// status dot, invite links, the move-file warning, the operator key, the leaderboards with their filters, the looking
// glass and the operator panel, and every sheet at 360 px on a phone. Fake relay nodes on a virtual clock, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { fedPage, joinGame, settle, URL1, URL2, SERVERS_JSON, PL, key, rec, rid, canon, signText, box } = require('./helpers/fed');

const txt = (p) => p.ev("$('modalCard').textContent");
const click = (p, sel) => p.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)throw new Error('no '+${JSON.stringify(sel)});b.click();})()`);
// Lets the core's timers and the sheets' async loads run, then waits until the page is quiet: no sheet load queued or
// running, no action busy, and the sheet unchanged over several checks. WebCrypto and IndexedDB answer on their own
// time, so real milliseconds go by while waiting (up to a few seconds, never a fixed guess).
async function run(p, ms = 3000) {
  for (let t = 0; t < ms; t += 500) { p.net.advance(500); await settle(); await new Promise((r) => setTimeout(r, 5)); }
  let last = null, same = 0;
  for (let i = 0; i < 400 && same < 4; i++) {
    const busy = p.ev('!!(typeof FU!=="undefined"&&(FU.loading||FU.loadNext||FU.busy))');
    if (busy) await p.ev('FU.loading||null');
    await settle(20); await new Promise((r) => setTimeout(r, 5));
    const html = p.ev("($('modalCard')||{}).innerHTML||''") + p.ev('JSON.stringify(fedStatus().state)');
    same = !busy && html === last ? same + 1 : 0; last = html;
  }
}
// Values from the page's realm, as plain values of this one.
const val = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
async function joined(o = {}) {
  const p = fedPage({ registry: SERVERS_JSON, ...o });
  const n = p.net.node(URL1);
  assert.equal(await joinGame(p), null);
  await run(p);
  return { p, n };
}
const ann = (name, t, body) => rec(name, 'announce', t, { name: 'Net ' + name, asn: 4200000001, box: box(name), home: 'DE', day: 120, founded: 20000, pops: ['fra', 'ams'], ix: ['fra'], cust: 7,
  mix: { content: 200, eyeball: 700, enterprise: 100 }, traffic: { in: 1000, out: 900 }, policy: 'open', rates: {}, auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' }, ...body });

test('without WebCrypto Ed25519 multiplayer is not offered anywhere', async () => {
  const p = load();
  p.ev('ACT.start({});ACT.settings({})');
  await settle(40);
  p.ev('refreshSettings()');
  assert.doesNotMatch(txt(p), /Multimode/);
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
  assert.match(txt(p), /Multimode/, 'Settings has a Multimode line once Ed25519 is known to work');
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
  assert.match(txt(p), /Leave Multimode for good\?/);
  click(p, '#modalCard [data-act="fuQuit"]');
  await run(p, 6000);
  assert.equal(p.ev('S.fed.key'), null);
  assert.equal(p.ev('S.fed.on'), false);
  assert.deepEqual(p.errors, []);
});

test('a shunned player is told why and that solo play goes on; 14 days unreachable gives one gentle suggestion', async () => {
  const { p, n } = await joined();
  p.ev("fedExclInfo=async()=>({shunned:true,reasons:['cheating','spam']});ACT.fuOpen({v:'home'})");
  await run(p, 500);
  assert.match(txt(p), /The federation excluded your network/);
  assert.match(txt(p), /Spam/);
  assert.match(txt(p), /Cheating/);
  assert.doesNotMatch(txt(p), /Spam: |\d servers?\b/, 'the reasons, never how many servers chose each');
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

// A board: Bob and Carol (AI) and this network, ranked by a fake server that filters as a relay does (only the
// filters these tests use), and their announces as heard from Packet Lunch.
async function seedBoard(p, n) {
  const me = p.ev('S.fed.key.pub'), now = p.ev('FED.now()');
  const nets = [{ key: key('bob').pub, value: 3, ai: false, pol: 'open' }, { key: key('carol').pub, value: 2, ai: true, model: 'm1', pol: 'selective' }, { key: me, value: 1, ai: false, pol: 'open' }];
  if (n) n.ranks = (f) => {
    const F = f.filters || {};
    if (f.measure === 'growth') return { slot: 0, n: 0, rows: [], me: null };
    const ok = (x) => !(f.division === 'ai' && !x.ai || f.division === 'human' && x.ai || F.model != null && x.model !== F.model || F.policy != null && x.pol !== F.policy);
    const rows = nets.filter(ok).map((x, i) => ({ rank: i + 1, key: x.key, value: x.value, asn: 4200000001, ai: x.ai }));
    const mi = rows.findIndex((r) => r.key === me);
    return { slot: now - (now % 300), n: rows.length, rows, me: { rank: mi >= 0 ? mi + 1 : null, value: 1 } };
  };
  if (n) n.facets = { models: ['m1'], harnesses: ['h1'], from: ['DE'], homes: ['DE'] };
  for (const [nm, pol] of [['bob', 'open'], ['carol', 'selective']]) {
    const r = ann(nm, now - 100, { name: nm === 'bob' ? 'Bob <b>Net</b>' : 'Carol Bot', policy: pol, ...(pol === 'selective' ? { cond: { minMbps: 0, maxRatio: 300, minShared: 1, rpki: false, tier1: false, ai: true } } : {}) });
    await p.ev(`fedAnnPut({rec:${JSON.stringify(r)},id:${JSON.stringify(rid(r))}},${now - 100},${JSON.stringify(PL.id)})`);
  }
}

test('leaderboards: three boards, divisions with robot badges, own row in place, filters combine, offline "as of"', async () => {
  const { p, n } = await joined();
  await seedBoard(p, n);
  p.ev("ACT.fuOpen({v:'boards'});ACT.fuQ({k:'board',v:'pops'})");
  await run(p, 500);
  const rows = () => val(p, `[...document.querySelectorAll('#modalCard .fu-board .fu-row:not(.fu-me)')].map(r=>r.querySelector('.fu-nm').textContent.trim()+(r.querySelector('.fu-bot')?' 🤖':''))`);
  assert.deepEqual(rows(), ['Bob <b>Net</b>', 'Carol Bot 🤖'], 'names as typed, as text; the AI with its robot');
  assert.equal(p.ev(`document.querySelectorAll('#modalCard .fu-board b b').length`), 0, 'a typed name is never markup');
  assert.match(p.ev(`document.querySelector('#modalCard .fu-board .fu-me').textContent`), /^3.*you/s, 'own row in place with its rank');
  assert.match(txt(p), /All your servers, merged/);
  assert.doesNotMatch(txt(p), /as of /, 'a fresh answer');
  click(p, '#modalCard [data-act="fuQ"][data-args*="\\"ai\\""]');
  await run(p, 500);
  assert.deepEqual(rows(), ['Carol Bot 🤖']);
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
  assert.deepEqual(rows(), ['Carol Bot 🤖']);
  assert.equal(p.ev(`document.querySelectorAll('#modalCard .fu-chip.act').length`), 2);
  click(p, '#modalCard .fu-chip.act[data-args*="policy"]');
  click(p, '#modalCard .fu-chip.act[data-args*="model"]');
  await run(p, 500);
  assert.equal(rows().length, 2);
  // The boards open on now; the 24-hour board is asked once here, so it is kept for offline below.
  assert.equal(p.ev('fuQ().measure'), 'now');
  click(p, '#modalCard [data-act="fuQ"][data-args*="measure"][data-args*="\\"total\\""]');
  await run(p, 500);
  assert.equal(rows().length, 2);
  // Growth needs two days of records: nobody yet, and it says why.
  click(p, '#modalCard [data-act="fuQ"][data-args*="growth"]');
  await run(p, 500);
  assert.match(txt(p), /third day/);
  // Offline: the last answer of a slice, "as of" when it came.
  n.kill();
  await run(p, 500);
  click(p, '#modalCard [data-act="fuQ"][data-args*="measure"][data-args*="\\"total\\""]');
  await run(p, 500);
  assert.equal(rows().length, 2);
  assert.match(txt(p), /as of /, 'offline: the time of the kept answer');
  assert.ok(!n.asks.some((f) => f.m === 'board'));
  assert.deepEqual(p.errors, []);
});

test('looking glass: servers, policies, players; votes and the tally only for an operator, with the operator panel', async () => {
  const { p, n } = await joined();
  await seedBoard(p, n);
  const now = p.ev('FED.now()'), target = key('bob').pub;
  const vote = rec('anna', 'shun', now - 3600, { server: PL.id, target, reason: 'spam' });
  p.ev("ACT.fuOpen({v:'glass'})");
  await run(p, 500);
  assert.match(txt(p), /2 servers known/);
  assert.match(txt(p), /Packet Lunch In the registry/);
  assert.match(txt(p), /syncs openly · 2 players · 3 operators/);
  assert.doesNotMatch(txt(p), /Shun votes/, 'players see no votes');
  // A network's read-only status: no tally for a player.
  click(p, `#modalCard [data-act="fuOpen"][data-args*=${JSON.stringify(JSON.stringify(target).slice(1, -1))}]`);
  await run(p, 500);
  assert.match(txt(p), /AS4200000001/);
  assert.doesNotMatch(txt(p), /votes needed|Shun votes|Excluded by the federation/);
  assert.equal(p.ev(`document.querySelectorAll('#modalCard .fu-op').length`), 0, 'no operator tools without an operator key');
  // Excluded by the joined server: shown as the outcome only.
  n.exclude([target]);
  for (const ws of n.socks) ws.drop();
  await run(p, 6000);
  p.ev(`ACT.fuOpen({v:'net',key:${JSON.stringify(target)}})`);
  await run(p, 500);
  assert.match(txt(p), /Excluded by the federation/);
  assert.doesNotMatch(txt(p), /votes needed/);
  // With Anna's operator key: the votes and the tally, the panel on her server, and hide and shun on the network.
  assert.equal(await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`), true);
  await p.ev(`fedVotesAdd([{id:${JSON.stringify(rid(vote))},rec:${JSON.stringify(vote)}}])`);
  p.ev("ACT.fuOpen({v:'glass'})");
  await run(p, 500);
  assert.match(txt(p), /Packet Lunch voted to shun Bob <b>Net<\/b> · Spam/);
  assert.match(txt(p), /Only server operators see votes/);
  p.ev(`ACT.fuOpen({v:'net',key:${JSON.stringify(target)}})`);
  await run(p, 500);
  assert.match(txt(p), /1 of 5 votes needed/);
  assert.match(txt(p), /Spam: 1 server/);
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
  const { p, n } = await joined();
  await seedBoard(p, n);
  await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`);
  const css = p.ev(`[...document.querySelectorAll('style')].map(s=>s.textContent).join('')`);
  assert.doesNotMatch(css, /fu-chips[^{]*\{[^}]*overflow-x:auto/, 'no chip row scrolls sideways');
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
    click(p, '#modalCard .fu-more');
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

test('from the first screen: the invite shows at once, the menu has its tile, a new game opens the join sheet', { skip: 'timing-dependent on slow CI machines; to be made deterministic (4.0.0)' }, async () => {
  const p = fedPage({ registry: SERVERS_JSON, url: 'https://tests.invalid/#join=' + encodeURIComponent(URL2) });
  // The title drawn at load already names the invite (it is drawn before the multiplayer code boots).
  assert.match(p.ev("document.body.textContent"), /You were invited to wss:\/\/second\.example\.org:8443\/fed/);
  await settle(40);
  // Started without the title's switch (federation-start.test.js covers it), the invite opens the join sheet as before.
  p.ev('closeModal();ACT.start({})');
  // The capability check started at boot, so the very first menu has the tile (waited for: it is async, and slow on CI).
  await p.ev('fedCan()');
  await settle(40);
  p.ev('ACT.menu({})');
  assert.equal(p.ev(`!!document.querySelector('#modalCard [data-act="fuOpen"]')`), true, 'Multimode tile on the first menu');
  // The tile carries Multimode's own icon (an orange tube), hidden from screen readers, not the globe.
  assert.equal(p.ev(`(()=>{const s=document.querySelector('#modalCard [data-act="fuOpen"] i svg.mm-ico');return !!s&&s.getAttribute('aria-hidden')==='true'&&/#FF8C2E/.test(s.outerHTML)})()`), true, 'tube icon in the tile');
  assert.doesNotMatch(p.ev(`document.querySelector('#modalCard [data-act="fuOpen"]').textContent`), /🌐/);
  p.ev('closeModal()');
  // Signing the charter of the new game opens the join sheet with the invite on top.
  p.ev('ACT.charter({k:Object.keys(CHARTERS)[0]})');
  await run(p, 1000);
  assert.equal(p.ev('UI.fu&&UI.fu.v'), 'join');
  assert.match(txt(p), /You were invited/);
  assert.deepEqual(p.errors, []);
});

test('the traffic board says what it counts, and a small value reads in Mbps, not as "0.0 Gbps"', async () => {
  const p = load();
  assert.equal(p.ev(`fuVal({board:'traffic',measure:'total'},32)`), '32 Mbps');
  assert.equal(p.ev(`fuVal({board:'traffic',measure:'total'},0)`), '0 Mbps');
  assert.equal(p.ev(`fuVal({board:'traffic',measure:'total'},2500)`), '2.5 Gbps');
  assert.equal(p.ev(`fuVal({board:'pops',measure:'total'},7)`), '7');
  const { p: q } = await joined();
  q.ev("ACT.fuOpen({v:'boards'})");
  await run(q, 1000);
  assert.match(txt(q), /counted as both sides report it/);
  q.ev("ACT.fuQ({k:'board',v:'pops'})");
  await run(q, 500);
  assert.doesNotMatch(txt(q), /counted as both sides report it/);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(q.errors, []);
});

test('closing a modal gives keyboard focus back to what opened it', async () => {
  const p = load();
  p.ev("ACT.start({});const b=document.createElement('button');b.id='opener';document.body.appendChild(b);b.focus();ACT.menu({})");
  assert.notEqual(p.ev('document.activeElement.id'), 'opener', 'focus moved into the modal');
  p.ev('closeModal()');
  assert.equal(p.ev('document.activeElement.id'), 'opener');
  assert.deepEqual(p.errors, []);
});
