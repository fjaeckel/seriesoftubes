// Reporting a network (§5.10, 60-features/88-fed-report.js, 95-modals/49-fed-report.js): a player picks a pre-made
// reason and which joined servers' operators get it, and may mute the network too; the report is signed and put only to
// those servers, never queued for every server. Only an operator's game follows reports, and its panel counts them per
// network. Fake relay nodes on a virtual clock, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, URL1, SERVERS_JSON, PL, NOW, key, rec, rid, box, asn } = require('./helpers/fed');

const txt = (p) => p.ev("$('modalCard').textContent");
const click = (p, sel) => p.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)throw new Error('no '+${JSON.stringify(sel)});b.click();})()`);
const val = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const aval = async (p, x) => JSON.parse(await p.ev(`(async()=>JSON.stringify(await (${x})))()`));
// The core's timers and the sheets' async loads run, then the page is quiet (as in federation-ui.test.js).
async function run(p, ms = 3000) {
  for (let t = 0; t < ms; t += 500) { p.net.advance(500); await settle(); await new Promise((r) => setTimeout(r, 5)); }
  let last = null, same = 0;
  for (let i = 0; i < 400 && same < 4; i++) {
    const busy = p.ev('!!(typeof FU!=="undefined"&&(FU.loading||FU.loadNext||FU.busy))');
    if (busy) await p.ev('FU.loading||null');
    await settle(20); await new Promise((r) => setTimeout(r, 5));
    const html = p.ev("($('modalCard')||{}).innerHTML||''");
    same = !busy && html === last ? same + 1 : 0; last = html;
  }
}
const spy = (n) => { n.got = []; const take = n.take.bind(n); n.take = (ws, text) => { n.got.push(JSON.parse(text)); take(ws, text); }; return n; };
const ann = (name, t) => rec(name, 'announce', t, { name: 'Net ' + name, asn: asn(key(name).pub), box: box(name), home: 'DE', day: 120, founded: 20000, pops: ['fra'], ix: ['fra'], cust: 7,
  mix: { content: 200, eyeball: 700, enterprise: 100 }, traffic: { in: 1000, out: 900 }, policy: 'open', rates: {}, auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' } });
const M = key('mallory').pub;
async function joined(o = {}) {
  const p = fedPage({ registry: SERVERS_JSON, ...o }), n = spy(p.net.node(URL1));
  assert.equal(await joinGame(p), null);
  await run(p);
  // Mallory's network, heard on the joined server.
  const a = ann('mallory', NOW - 600);
  await p.ev(`fedAnnPut({rec:${JSON.stringify(a)},id:${JSON.stringify(rid(a))}},${NOW - 600},${JSON.stringify(PL.id)})`);
  return { p, n };
}

test('a player reports a network to its server\'s operators: a reason, the servers, and mute too if asked', async () => {
  const { p, n } = await joined();
  p.ev(`ACT.fuOpen({v:'net',key:${JSON.stringify(M)}})`);
  await run(p, 500);
  click(p, '#modalCard [data-act="fuReport"]');
  await run(p, 500);
  assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'report');
  assert.match(txt(p), /Net mallory/);
  assert.match(txt(p), /Cheating.*Offensive name.*Spam.*Abuse/s, 'the four pre-made reasons, nothing to type');
  assert.equal(p.ev("document.querySelectorAll('#modalCard textarea, #modalCard input[type=text]').length"), 0, 'no free text');
  assert.equal(p.ev(`document.querySelector('#modalCard input[data-act="fuRepPick"][data-args*="srv"]').checked`), true, 'the server it was seen on is picked');
  assert.equal(p.ev(`document.querySelector('#modalCard [data-act="fuRepGo"]').disabled`), true, 'no reason picked yet');
  click(p, '#modalCard [data-act="fuRepPick"][data-args*="offensive_name"]');
  click(p, '#modalCard input[data-act="fuRepPick"][data-args*="mute"]');
  await run(p, 300);
  assert.equal(p.ev(`document.querySelector('#modalCard [data-act="fuRepGo"]').disabled`), false);
  click(p, '#modalCard [data-act="fuRepGo"]');
  await run(p, 500);
  const reps = n.puts.filter((r) => r.kind === 'report');
  assert.equal(reps.length, 1);
  assert.deepEqual(reps[0].body, { server: PL.id, target: M, reason: 'offensive_name' });
  assert.equal(reps[0].key, p.ev('S.fed.key.pub'), 'signed by the reporting network');
  assert.equal(val(p, 'S.fed.out').filter((r) => r.kind === 'report').length, 0, 'never queued for every joined server');
  assert.deepEqual(val(p, 'S.fed.muted'), [M], 'muted too, as asked');
  assert.match(p.ev("document.body.textContent"), /Reported to the operators of Packet Lunch\./);
  assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'net', 'back where it came from');
  // The sheet remembers it was reported.
  p.ev(`ACT.fuReport({key:${JSON.stringify(M)}})`);
  await run(p, 500);
  assert.match(txt(p), /you reported it/);
  // Never about oneself, only pre-made reasons, only joined and connected servers.
  assert.equal((await p.ev(`fedReport(S.fed.key.pub,'spam',[${JSON.stringify(PL.id)}])`)).error, 'bad_field');
  assert.equal((await p.ev(`fedReport(${JSON.stringify(M)},'he is rude',[${JSON.stringify(PL.id)}])`)).error, 'bad_field');
  assert.deepEqual(await aval(p, `fedReport(${JSON.stringify(M)},'spam',['${'A'.repeat(43)}'])`), { ok: [], failed: [{ srv: 'A'.repeat(43), error: 'offline' }] });
  assert.deepEqual(p.errors, []);
});

test('the game stops a player at ten networks a day, and says what a server refused', async () => {
  const { p, n } = await joined();
  for (let i = 0; i < 9; i++) assert.deepEqual((await aval(p, `fedReport(${JSON.stringify(key('t' + i).pub)},'spam',[${JSON.stringify(PL.id)}])`)).ok, [PL.id]);
  // The same network again replaces the report: it is not one more.
  assert.deepEqual((await aval(p, `fedReport(${JSON.stringify(key('t0').pub)},'abuse',[${JSON.stringify(PL.id)}])`)).ok, [PL.id]);
  assert.deepEqual((await aval(p, `fedReport(${JSON.stringify(M)},'spam',[${JSON.stringify(PL.id)}])`)).ok, [PL.id]);
  assert.equal((await p.ev(`fedReport(${JSON.stringify(key('t10').pub)},'spam',[${JSON.stringify(PL.id)}])`)).error, 'too_many');
  // A day later it may report again; what the server refuses is shown in the sheet.
  p.net.t0 += 86401;
  n.refuse = 'too_many';
  p.ev(`ACT.fuReport({key:${JSON.stringify(key('t10').pub)}})`);
  await run(p, 500);
  click(p, '#modalCard [data-act="fuRepPick"][data-args*="spam"]');
  await run(p, 300);
  click(p, '#modalCard [data-act="fuRepGo"]');
  await run(p, 500);
  assert.match(txt(p), /enough reports for today/);
  assert.deepEqual(p.errors, []);
});

test('only an operator\'s game follows reports, keeps those of its own server and counts them per network', async () => {
  const p = fedPage({ registry: SERVERS_JSON }), n = spy(p.net.node(URL1)), t = NOW - 3600;
  const r1 = rec('bob', 'report', t, { server: PL.id, target: M, reason: 'spam' }), r2 = rec('carol', 'report', t + 60, { server: PL.id, target: M, reason: 'abuse' });
  const r3 = rec('bob', 'report', t - 600, { server: PL.id, target: M, reason: 'cheating' }); // older than bob's r1: replaced
  const other = rec('dave', 'report', t, { server: 'B'.repeat(43), target: M, reason: 'spam' });
  n.feed = [r3, r1, r2, other, ann('bob', t), ann('carol', t)].map((r) => ({ rec: r, rcpt: [] }));
  // A player's game: the node sends it no report, and it would keep none.
  assert.equal(await joinGame(p), null);
  await run(p);
  assert.ok(!n.got.some((f) => f.m === 'sub' && f.kinds.includes('report')), 'a player does not ask for reports');
  await p.ev(`fedRecs(FED.live.conns.get(${JSON.stringify(URL1)}),[{rec:${JSON.stringify(r1)},rcpt:[]}])`);
  assert.equal(await p.ev("fedGet('kv','reports')"), null, 'no report kept without an operator key');
  // With Anna's operator key: a sub of its own for reports.
  assert.equal(await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`), true);
  await run(p);
  assert.ok(n.got.some((f) => f.m === 'sub' && f.kinds.join() === 'report'), 'reports followed from their own cursor');
  const kept = await aval(p, "fedGet('kv','reports')");
  assert.deepEqual(kept.map((x) => x.rec.body.reason).sort(), ['abuse', 'spam'], 'the newest per reporter and network; another server\'s are not kept');
  assert.deepEqual(await aval(p, `fedReportsFor(${JSON.stringify(PL.id)})`), [{ target: M, reasons: { abuse: 1, spam: 1 }, reporters: [key('carol').pub, key('bob').pub], t: t + 60 }]);
  // The operator panel: counts, the reporters' network names only on demand, and the existing actions.
  p.ev(`ACT.fuOpen({v:'server',id:${JSON.stringify(PL.id)}})`);
  await run(p, 500);
  assert.match(txt(p), /Reports from players/);
  assert.match(txt(p), /Abuse 1 · Spam 1 · 2 players reported it/);
  assert.doesNotMatch(txt(p), /Net bob/);
  click(p, '#modalCard [data-act="fuRepWho"]');
  await run(p, 300);
  assert.match(txt(p), /Reported by: Net carol, Net bob/);
  click(p, '#modalCard .fu-op [data-act="fuOpHide"]');
  await run(p, 500);
  assert.deepEqual(n.puts.find((r) => r.kind === 'hide').body.hide, [M]);
  assert.match(txt(p), /hidden here/);
  click(p, '#modalCard .fu-op [data-act="fuOpShun"]');
  await run(p, 500);
  const vote = n.puts.find((r) => r.kind === 'shun');
  assert.deepEqual(vote.body, { server: PL.id, target: M, reason: 'abuse' });
  assert.match(txt(p), /voted to shun/);
  // The key removed: reports go with it and are not followed any more.
  await p.ev('fedOpKeyDel()');
  assert.equal(await p.ev("fedGet('kv','reports')"), null);
  assert.equal(n.got.filter((f) => f.m === 'unsub').length >= 2, true, 'votes and reports unsubscribed');
  assert.deepEqual(p.errors, []);
});

test('the report sheet and the reports in the operator panel work on a 360 px phone, in every language', async () => {
  for (const lang of [null, 'de', 'es', 'fr', 'it', 'pt']) {
    const { p } = await joined(lang ? { lang } : {});
    await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`);
    const r = rec('bob', 'report', NOW - 60, { server: PL.id, target: M, reason: 'spam' });
    await p.ev(`fedReportsAdd([{id:${JSON.stringify(rid(r))},rec:${JSON.stringify(r)}}])`);
    for (const [w, h] of [[360, 740], [740, 360]]) {
      p.ev(`window.innerWidth=${w};window.innerHeight=${h};renderTabbar()`);
      assert.equal(p.ev('isPhone()'), true);
      for (const v of [{ v: 'report', key: M }, { v: 'server', id: PL.id }]) {
        p.ev(`ACT.fuOpen(${JSON.stringify(v)})`);
        await run(p, 500);
        assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), v.v);
        assert.ok(p.ev(`!!document.querySelector('#modalCard [data-act="fuClose"]')`), `${v.v}: can be closed`);
        assert.equal(p.ev(`[...document.querySelectorAll('#modalCard [style]')].filter(e=>/(^|;)\\s*(min-)?width:\\s*[4-9]\\d\\dpx/.test(e.getAttribute('style'))).length`), 0, v.v);
        assert.doesNotMatch(txt(p), /fedui\.|fedplay\./, `${lang} ${v.v}: no label shows untranslated`);
      }
    }
    assert.deepEqual(p.errors, [], lang);
  }
});

test('a player network\'s deals sheet offers Report, and comes back to the deals after', async () => {
  const { p, n } = await joined();
  await p.ev('fedPlayRefresh()');
  p.ev(`ACT.fpNet({key:${JSON.stringify(M)}})`);
  await run(p, 500);
  assert.equal(p.ev(`UI.fpOpen&&UI.fpOpen.k`), 'net');
  click(p, '#modalCard [data-act="fuReport"]');
  await run(p, 500);
  assert.equal(p.ev("$('modalCard').querySelector('.fedui').dataset.fu"), 'report');
  assert.equal(p.ev('UI.fpOpen'), null, 'the deals sheet does not redraw over it');
  click(p, '#modalCard [data-act="fuRepPick"][data-args*="cheating"]');
  await run(p, 300);
  click(p, '#modalCard [data-act="fuRepGo"]');
  await run(p, 500);
  assert.equal(n.puts.filter((r) => r.kind === 'report').length, 1);
  assert.equal(p.ev(`UI.fpOpen&&UI.fpOpen.k`), 'net', 'back on the deals sheet');
  assert.equal(p.ev('UI.fu'), null);
  assert.deepEqual(p.errors, []);
});
