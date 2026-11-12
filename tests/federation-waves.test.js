// Waves sold between players (docs/FEDERATION-PROTOCOL.md §5.1 rates.wave, §10.10): the buyer gets a wave link like a
// leased one, billed monthly, gone when the deal ends; the seller earns the price and the wave comes off its lit fiber.
// Fake nodes, a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, rid, key, asn, box, sealRec } = require('./helpers/fed');

const DAY = 86400;
const AUTO = { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto', wave: 'auto' };
function ann(name, over = {}, t = NOW - 60) {
  const k = key(name);
  return rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30,
    mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {}, auto: AUTO, ...over });
}
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
async function game(feed, setup) {
  const p = fedPage(), n = p.net.node(URL1);
  n.feed = feed.map((r) => ({ rec: r, rcpt: [] }));
  assert.equal(await joinGame(p), null);
  // An established player (joined 100 days ago): it pays card prices, not the newcomer price (§10.10).
  p.ev("S.fed.joined-=100");
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});" + (setup || ''));
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')), 'connected');
  const nets = feed.filter((r) => r.kind === 'announce').length;
  const ready = `!!(S.fedn&&S.fedn.nets.length===${nets}&&S.fedp&&S.fedp.mine.length&&S.fedp.leakD)`;
  for (let i = 0; i < 60 && !p.ev(ready); i++) { p.net.advance(1000); await until(async () => (await settle(5), p.ev(ready)), 300); }
  assert.ok(p.ev(ready), 'players built, terms announced');
  await p.ev('fedPlayRefresh()');
  await settle(10);
  return { p, n };
}
async function resync(p, n, recs) {
  n.feed = recs.map((r) => ({ rec: r, rcpt: [] }));
  for (const ws of n.socks) ws.drop();
  await settle(10);
  p.net.advance(5000);
  await settle(20);
}
const CARD = { routes: [{ a: 'ams', b: 'fra' }, { a: 'fra', b: 'lon' }], sizes: [{ gbps: 100, monthly: 900 }, { gbps: 400, monthly: 2400 }], term: 90 };

test('a wave bought from a player: what is missing, then a link that routes, billed monthly, gone at the end of its term', async () => {
  const { p } = await game([ann('alice', { rates: { wave: CARD } })], "ACT.launchBB({city:'ams'});");
  const k = key('alice').pub;
  // No POP in London; routers that only take 100G.
  assert.deepEqual(json(p, `fedOffer('${k}','wave',{at:'fra|lon',mbps:100000}).miss.map(x=>x.l)`), ['ends']);
  assert.deepEqual(json(p, `fedOffer('${k}','wave',{at:'ams|fra',mbps:400000}).miss.map(x=>x.l)`), ['gear']);
  assert.match(p.ev(`fedMissText(fedOffer('${k}','wave',{at:'ams|fra',mbps:400000}).miss)`), /400G/);
  // Their sheet lists the card and asks for a wave, with what a computer-run vendor would charge.
  p.ev(`innerWidth=360;innerHeight=640;UI.fpSel={};fedNetModal('${k}')`);
  const sheet = p.ev("$('modal').textContent");
  assert.match(sheet, /Waves on Amsterdam–Frankfurt, Frankfurt–London, 90 days minimum/);
  assert.match(sheet, /computer-run vendor charges/);
  assert.ok(p.ev(`[...document.querySelectorAll('#modal [data-act="fpReq"]')].some(b=>JSON.parse(b.dataset.args).deal==='wave')`));
  p.ev('closeModal()');
  p.ev("S.pops.fra.rgen=1;S.pops.ams.rgen=1;");
  const x = json(p, `fedOffer('${k}','wave',{at:'ams|fra',mbps:400000})`);
  assert.deepEqual(x.miss, []);
  assert.deepEqual(x.terms, { a: 'ams', b: 'fra', gbps: 400, monthly: 2400, term: 90 });
  // Automatic acceptance: it runs at once, and the buyer's game has a 400G wave Amsterdam–Frankfurt.
  assert.equal(await p.ev(`fedRequest('${k}','wave',{at:'ams|fra',mbps:400000})`), null);
  const d = json(p, "S.fed.deals.find(x=>x.deal==='wave')");
  assert.equal(d.role, 'buy');
  assert.equal(d.st, 'run');
  const l = json(p, 'S.links.find(l=>l.fwv)');
  assert.equal(l.fwv, d.id);
  assert.equal(l.kind, 'wave');
  assert.equal(p.ev(`LT[${l.tier}].g`), 400);
  p.ev('compute()');
  assert.equal(p.ev('R.cost.fed'), 2400, 'billed its monthly price');
  assert.ok(p.ev(`R.load['${l.id}']`) > 0, 'Amsterdam\'s customers reach transit in Frankfurt over it');
  // The link panel names the seller and has no decommission; ending is the deal's.
  p.ev(`UI.sel={type:'link',id:'${l.id}'};renderPanel()`);
  assert.match(p.ev("$('panel').textContent"), /Wave from Ping Floyd/);
  p.ev(`ACT.rmLink({id:'${l.id}'});ACT.rmLink({id:'${l.id}'})`);
  assert.ok(p.ev(`S.links.some(l=>l.id==='${l.id}')`), 'not handed back from the panel');
  // A save keeps it; an old save without the deal loses the link with it.
  const txt = p.ev('JSON.stringify(S)');
  assert.equal(p.ev(`(()=>{const s=JSON.parse(${JSON.stringify(txt)});migrate(s);return s.links.filter(l=>l.fwv).length;})()`), 1);
  assert.equal(p.ev(`(()=>{const s=JSON.parse(${JSON.stringify(txt)});s.fed.deals=s.fed.deals.filter(d=>d.deal!=='wave');migrate(s);return s.links.filter(l=>l.fwv).length;})()`), 0);
  assert.equal(p.ev(`(()=>{const s=JSON.parse(${JSON.stringify(txt)});delete s.fedp;migrate(s);return s.fedp===null&&s.links.filter(l=>l.fwv).length;})()`), 1, 'deals kept without terms');
  // The term runs out: the deal is over and the link gone.
  p.ev(`fedDealsOn(S,${d.end})`);
  assert.equal(p.ev("S.fed.deals.find(x=>x.deal==='wave').why"), 'term');
  assert.equal(p.ev('S.links.some(l=>l.fwv)'), false);
  p.ev('compute()');
  assert.equal(p.ev('R.cost.fed||0'), 0);
  assert.deepEqual(p.errors, []);
});

test('selling waves: the card lists lit routes under the ceiling; an accepted wave earns and takes room on the fiber, never oversold', async () => {
  // One 400G optic lit Amsterdam–Frankfurt.
  const lit = "S.links.push({id:'D1',a:'ams',b:'fra',kind:'df',own:true,sys:'cl',ch:['zr4'],km:Math.round(kmBetween('ams','fra')*1.05),ready:0,day:0,cut:0,mo:100,trench:'own:D1',pairs:1});compute();";
  const { p, n } = await game([ann('alice')], lit);
  assert.deepEqual(json(p, 'fedWaveLit()'), ['ams|fra']);
  p.ev("fedTermsApply({pol:'open',rates:{wave:{routes:[{a:'ams',b:'fra'},{a:'fra',b:'nyc'}],sizes:[{gbps:400,monthly:1e9}],term:90}},auto:{wave:'review'}})");
  const ceil = p.ev("fedWaveCeil('ams','fra',400)");
  assert.equal(p.ev('S.fedp.rates.wave.sizes[0].monthly'), ceil, 'capped at what a computer-run vendor charges');
  assert.ok(await until(async () => (await settle(5), p.ev('!!(S.fedp.mine[0]&&S.fedp.mine[0].body.rates.wave)'))), 'card announced');
  const mine = json(p, 'S.fedp.mine[0]');
  assert.deepEqual(mine.body.rates.wave.routes, [{ a: 'ams', b: 'fra' }], 'only routes lit today are published');
  assert.equal(mine.body.auto.wave, 'review');
  // The editor: a lit route toggles, the default card is under the ceiling.
  p.ev("UI.fpDraft=null;fedTermsEdit('wv.on','0');fedTermsEdit('wv.on','1')");
  assert.ok(p.ev("UI.fpDraft.rates.wave.sizes.every(x=>x.monthly<=fedWaveCeil('ams','fra',x.gbps))"));
  p.ev("fedTermsEdit('wv.r','ams|fra')");
  assert.equal(p.ev('UI.fpDraft.rates.wave.routes.length'), 0);
  p.ev('innerWidth=360;innerHeight=640;fedTermsModal()');
  assert.match(p.ev("$('modal').textContent"), /Sell waves/);
  p.ev("UI.fpDraft=null;closeModal()");
  // Two offers for a 400G wave: the first accepted earns the price and takes the optic's 400G; no room for the second.
  const to = p.ev('S.fed.key.pub'), terms = { a: 'ams', b: 'fra', gbps: 400, monthly: ceil, term: 90 };
  const o1 = sealRec('alice', 'offer', p.net.now(), { to, deal: 'wave', basis: mine.id, terms }, to, mine.body.box);
  const o2 = sealRec('alice', 'offer', p.net.now() + 1, { to, deal: 'wave', basis: mine.id, terms: { ...terms, term: 180 } }, to, mine.body.box);
  await resync(p, n, [o1, o2]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.rq.length') === 2)), 'both wait for review');
  p.ev('ACT.dash()');
  assert.match(p.ev("$('dash').textContent"), /400G wave Amsterdam–Frankfurt/);
  assert.equal(p.ev("dfCap0(S.links.find(l=>l.id==='D1'))"), 400);
  assert.equal(await p.ev(`fedAcceptRq('${rid(o1)}')`), null);
  const d = json(p, "S.fed.deals.find(x=>x.deal==='wave')");
  assert.equal(d.role, 'sell');
  p.ev('compute()');
  assert.equal(p.ev('R.rev.fed'), ceil);
  assert.equal(p.ev("mwG(S.links.find(l=>l.id==='D1'))"), 400, 'counted like a managed wave sold');
  assert.equal(p.ev("dfCap0(S.links.find(l=>l.id==='D1'))"), 0);
  assert.equal(p.ev('S.links.some(l=>l.fwv)'), false, 'the seller gets no link');
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev(`fedAcceptRq('${rid(o2)}')`))).miss.map((x) => x.l), ['room']);
  // At the end of its term the room comes back.
  p.ev(`fedDealsOn(S,${d.end})`);
  assert.equal(p.ev("mwG(S.links.find(l=>l.id==='D1'))"), 0);
  assert.deepEqual(p.errors, []);
});

test('the shared rule takes only the published card: route, size, price and term', async () => {
  const { p } = await game([]);
  const A = { id: 'A1', kind: 'announce', key: 'kA', t: NOW - DAY, body: { rates: { wave: CARD }, auto: AUTO } };
  const off = (terms) => `fedDeal(${JSON.stringify([A])},{id:'O1',key:'kB',t:${NOW},body:${JSON.stringify({ to: 'kA', deal: 'wave', basis: 'A1', terms })}},null,null)`;
  const ok = { a: 'ams', b: 'fra', gbps: 400, monthly: 2400, term: 90 };
  assert.deepEqual(json(p, off(ok)), { ok: true, auto: true, start: NOW, end: NOW + 90 * DAY });
  for (const bad of [{ ...ok, a: 'fra', b: 'nyc' }, { ...ok, gbps: 800 }, { ...ok, monthly: 2000 }, { ...ok, term: 30 }]) assert.equal(json(p, off(bad)).error, 'bad_terms');
  const old = { ...A, body: { rates: {}, auto: { ...AUTO, wave: undefined } } };
  assert.equal(json(p, `fedDeal(${JSON.stringify([old])},{id:'O1',key:'kB',t:${NOW},body:${JSON.stringify({ to: 'kA', deal: 'wave', basis: 'A1', terms: ok })}},null,null)`).error, 'declined', 'an announce from before waves declines them');
  assert.deepEqual(p.errors, []);
});
