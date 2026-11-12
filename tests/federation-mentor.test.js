// Newcomers and their mentors (docs/plans/federation.md, "Newcomers"; FEDERATION-PROTOCOL §10.10): a network in its
// first 30 days buys from established ones at the newcomer price, both games agreeing on it; an established network
// dealing with a newcomer earns a one-off bonus in its own game when the newcomer grows, under anti-farming rules (heard
// on 3 UTC days, at most 5 newcomers in 14 days, once per milestone). Fake nodes, a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, rid, key, asn, box, sealRec, openRec } = require('./helpers/fed');

const DAY = 86400, TODAY = Math.floor(NOW / DAY);
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const AUTO = { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto', wave: 'review' };
function ann(name, over = {}, t = NOW - 60) {
  const k = key(name);
  return rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30,
    mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {}, auto: AUTO, ...over });
}
const TRANSIT = { transit: { perGbps: 900, commit: [{ mbps: 10000, off: 100 }], term: 90 } };
async function game(feed, setup = '') {
  const p = fedPage(), n = p.net.node(URL1);
  n.feed = feed.map((r) => ({ rec: r, rcpt: [] }));
  assert.equal(await joinGame(p), null);
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});" + setup);
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

test('a newcomer buys transit at the newcomer price; the seller\'s rule and the opened offer agree on it', async () => {
  const { p, n } = await game([ann('alice', { rates: TRANSIT })]);
  const k = key('alice').pub;
  assert.equal(p.ev('fedIsNew(S.fed.joined,fedNow())'), true, 'a save that joined today is a newcomer');
  const x = json(p, `fedOffer('${k}','transit',{at:'fra',mbps:10000})`);
  // Card: div(900 * 900, 1000) = 810; newcomer: div(810 * 750, 1000) = 607.
  assert.deepEqual(x.terms, { mbps: 10000, perGbps: 607, term: 90, at: ['fra'], founded: p.ev('S.fed.joined') });
  assert.equal(await p.ev(`fedRequest('${k}','transit',{at:'fra',mbps:10000})`), null);
  const d = json(p, "S.fed.deals.find(x=>x.deal==='transit')");
  assert.equal(d.st, 'run');
  assert.equal(d.terms.perGbps, 607);
  // What Alice's game opens is the same offer, and her copy of the rule (§10.10) takes it at that price.
  const me = p.ev('S.fed.key.pub'), myBox = await p.ev('fedBoxPub(S.fed.key.priv)');
  assert.ok(await until(async () => (await settle(5), n.puts.some((r) => r.kind === 'offer' && (openRec('alice', r, me, myBox) || {}).deal === 'transit'))));
  const sent = n.puts.find((r) => r.kind === 'offer' && (openRec('alice', r, me, myBox) || {}).deal === 'transit'), o = openRec('alice', sent, me, myBox);
  assert.deepEqual(o.terms, d.terms);
  const a = ann('alice', { rates: TRANSIT });
  const res = json(p, `fedDeal([{id:'${rid(a)}',kind:'announce',key:'${k}',t:${a.t},body:${JSON.stringify(a.body)}}],{id:'x',key:'${me}',t:${sent.t},body:${JSON.stringify({ ...o, to: k, basis: rid(a) })}},null,null)`);
  assert.equal(res.ok, true, JSON.stringify(res));
  // The deal row says so; an established buyer would pay 810.
  p.ev("ACT.dash()");
  p.ev('S.fed.joined-=100');
  assert.equal(json(p, `fedOffer('${k}','transit',{at:'fra',mbps:10000}).terms`).perGbps, 810);
  assert.deepEqual(p.errors, []);
});

test('the seller\'s game takes a newcomer\'s offer at the newcomer price and refuses a wrong one or a wrong join day', async () => {
  const bobDay = TODAY - 3;
  const { p, n } = await game([ann('bob', { founded: bobDay, name: 'Hop Dog' })], 'S.fed.joined-=100;');
  p.ev("fedTermsApply({pol:'open',rates:{transit:{perGbps:900,commit:[{mbps:10000,off:100}],term:90}},auto:{transit:'auto'}})");
  assert.ok(await until(async () => (await settle(5), p.ev('!!(S.fedp.mine[0]&&S.fedp.mine[0].body.rates.transit)'))), 'terms announced');
  const mine = json(p, 'S.fedp.mine[0]'), me = p.ev('S.fed.key.pub'), card = mine.body.rates.transit.perGbps;
  const price = Math.floor(Math.floor(card * 900 / 1000) * 750 / 1000);
  const offer = (t, terms) => sealRec('bob', 'offer', p.net.now() + t, { to: me, deal: 'transit', basis: mine.id, terms: { mbps: 10000, term: 90, at: ['fra'], ...terms } }, me, mine.body.box);
  const good = offer(0, { perGbps: price, founded: bobDay }), full = offer(1, { perGbps: Math.floor(card * 900 / 1000), founded: bobDay }), lie = offer(2, { perGbps: price, founded: bobDay + 1 });
  await resync(p, n, [ann('bob', { founded: bobDay, name: 'Hop Dog' }), good, full, lie]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fed.deals.length') === 1)), 'one deal');
  const d = json(p, 'S.fed.deals[0]');
  assert.equal(d.id, rid(good));
  assert.equal(d.role, 'sell');
  assert.equal(d.terms.perGbps, price, 'both games run it at the same price');
  // The other two are declined: the full price with a newcomer claim breaks the rule; a join day other than Bob's
  // announce says breaks the seller's conditions.
  assert.ok(await until(async () => (await settle(5), n.puts.filter((r) => r.kind === 'decline').length === 2)));
  const why = n.puts.filter((r) => r.kind === 'decline').map((r) => openRec('bob', r, me, mine.body.box)).map((x) => x && x.reason).sort();
  assert.deepEqual(why, ['conditions', 'conditions']);
  assert.deepEqual(p.errors, []);
});

// The mentor dividend on its own: deals and nets answers set by hand, the hourly look called with a chosen clock.
async function mentor() {
  const p = fedPage();
  p.net.node(URL1);
  assert.equal(await joinGame(p), null);
  p.ev(`S.fed.joined=${TODAY - 100};fedP(S);R.revMo=100000;`);
  return p;
}
const NK = (i) => key('new' + i).pub;
// A running deal with newcomer i, started at `start`; its announce says it joined on `founded`.
const deal = (i, start) => ({ id: 'd' + i, deal: 'peering', key: NK(i), name: 'Newbie ' + i, asn: 1, start, end: null, terms: { at: ['fra'], via: 'ix' }, role: 'peer', st: 'run', on: true, rep: 0, why: '', ai: false });
function tick(p, now, stats, founded) {
  return p.ev(`(()=>{const st=new Map(${JSON.stringify(Object.entries(stats))}.map(([k,v])=>[k,{seen:true,...v}]));const f=${JSON.stringify(founded)};
    return fedMentorTick(S,${now},st,k=>f[k]??null);})()`);
}

test('mentor dividend: milestones pay once each, only after 3 heard days, never what the newcomer had at the first look', async () => {
  const p = await mentor(), T0 = (TODAY - 2) * DAY + 3600, k = NK(1), F = { [k]: TODAY - 5 };
  p.ev(`S.fed.deals=[${JSON.stringify(deal(1, T0 - 600))}]`);
  const st = (o, day) => ({ [k]: { pops: 3, tier2: false, cust: 0, slot: day * DAY + 300, ...o } });
  // First look: it already has a customer; that never pays.
  tick(p, T0, st({ cust: 1 }, TODAY - 2), F);
  assert.deepEqual(json(p, 'S.fedp.ment.map(x=>[x.m,x.v])'), [['seen', 0], ['cust', 0]]);
  // 10 POPs, heard on two days only: nothing yet.
  const cash = p.ev('S.cash');
  tick(p, T0 + DAY, st({ pops: 10, cust: 1 }, TODAY - 1), F);
  assert.equal(p.ev('S.cash'), cash, 'heard on 2 days: no payout');
  // A third day: it pays, 25% of the monthly revenue (25000, within 10000 to 1e6).
  tick(p, T0 + 2 * DAY, st({ pops: 10, cust: 1 }, TODAY), F);
  assert.equal(p.ev('S.cash') - cash, 25000, 'heard on 3 days: paid');
  tick(p, T0 + 2 * DAY + 3600, st({ pops: 12, cust: 1 }, TODAY), F);
  assert.equal(p.ev('S.cash') - cash, 25000, 'once per milestone');
  // Tier 2 later pays its own bonus (50%: 50000).
  tick(p, T0 + 3 * DAY, st({ pops: 12, tier2: true, cust: 1 }, TODAY + 1), F);
  assert.equal(p.ev('S.cash') - cash, 75000);
  assert.deepEqual(json(p, 'fedMentorPaid(S).map(x=>[x.m,x.v])'), [['t2', 50000], ['pops', 25000]]);
  // The players card lists them.
  p.ev('ACT.dash()');
  assert.match(p.ev('fedPlayCard()'), /Mentor bonus: Newbie 1 became a Tier 2 \(\+\$50/);
  // Not a newcomer when the deal started, a deal not running, or past 60 days: nothing.
  for (const [d, f, now] of [[deal(2, T0), { [NK(2)]: TODAY - 40 }, T0], [{ ...deal(3, T0), on: false }, { [NK(3)]: TODAY - 5 }, T0], [deal(4, T0 - 61 * DAY), { [NK(4)]: TODAY - 65 }, T0]]) {
    p.ev(`S.fed.deals.push(${JSON.stringify(d)})`);
    assert.equal(p.ev(`fedMentees(S,${now},k=>(${JSON.stringify(f)})[k]??null).has('${d.key}')`), false, d.id);
  }
  // A mentor that is itself new earns nothing.
  p.ev(`S.fed.joined=${TODAY - 10}`);
  assert.equal(p.ev(`fedMentees(S,${T0},k=>(${JSON.stringify(F)})[k]??null).size`), 0);
  assert.deepEqual(p.errors, []);
});

test('mentor dividend: at most 5 newcomers in any 14 days; a 6th is not paid nor kept, and pays again once the window rolls', async () => {
  const p = await mentor(), T0 = TODAY * DAY, F = {};
  const deals = [];
  for (let i = 1; i <= 7; i++) { deals.push(deal(i, T0 - 600)); F[NK(i)] = TODAY - 2; }
  p.ev(`S.fed.deals=${JSON.stringify(deals)}`);
  const stats = (pops, day, keys) => Object.fromEntries(keys.map((k) => [k, { pops, tier2: false, cust: 0, slot: day * DAY }]));
  const all = deals.map((d) => d.key);
  // First looks, then three heard days with fewer than 10 POPs.
  for (let d = 0; d < 3; d++) tick(p, T0 + d * DAY, stats(4, TODAY + d, all), F);
  const cash = p.ev('S.cash');
  // Newcomers 1 to 6 reach 10 POPs on day 3: five are paid, the 6th is refused (and not kept).
  tick(p, T0 + 3 * DAY, stats(10, TODAY + 3, all.slice(0, 6)), F);
  assert.equal(p.ev('S.cash') - cash, 5 * 25000);
  assert.deepEqual(json(p, `S.fedp.ment.filter(x=>x.m==='pops').map(x=>[x.k===${JSON.stringify(all[5])},x.v,!!x.cap])`).filter((x) => x[0]), [[true, 0, true]]);
  // Newcomer 1 (already paid in the window) still pays its next milestone.
  tick(p, T0 + 4 * DAY, { ...stats(10, TODAY + 4, all.slice(0, 6)), [all[0]]: { pops: 10, tier2: true, cust: 0, slot: (TODAY + 4) * DAY } }, F);
  assert.equal(p.ev('S.cash') - cash, 5 * 25000 + 50000);
  // Newcomer 7 within the window: refused; the 6th's 10 POPs never come back.
  tick(p, T0 + 5 * DAY, stats(10, TODAY + 5, all.slice(5)), F);
  assert.equal(p.ev('S.cash') - cash, 5 * 25000 + 50000);
  // 14 days after the payouts the window has rolled: newcomer 6's Tier 2 and 7's customer pay.
  const later = T0 + 3 * DAY + 14 * DAY + 60;
  tick(p, later, { [all[5]]: { pops: 10, tier2: true, cust: 0, slot: (TODAY + 17) * DAY }, [all[6]]: { pops: 10, tier2: false, cust: 2, slot: (TODAY + 17) * DAY } }, F);
  assert.equal(p.ev('S.cash') - cash, 5 * 25000 + 50000 + 50000 + 50000);
  assert.deepEqual(p.errors, []);
});

test('mentor lists and newcomer terms survive a save; an old save gets them empty; broken entries are repaired', async () => {
  const p = await mentor();
  p.ev(`S.fedp.ment=[{k:'${NK(1)}',n:'Newbie 1',m:'pops',v:25000,t:${NOW}},{k:'nope',n:'x',m:'pops',v:1,t:1},{k:'${NK(2)}',n:'<b>',m:'t9',v:1,t:1},{k:'${NK(3)}',n:'Newbie 3',m:'cust',v:0,t:${NOW},cap:true}];
    S.fedp.heard=[{k:'${NK(1)}',d:[3,1,1,2,9]},{k:'bad',d:[1]}];`);
  const back = json(p, '(()=>{const s=JSON.parse(JSON.stringify(S));sanitize(s);return {ment:s.fedp.ment,heard:s.fedp.heard};})()');
  assert.deepEqual(back.ment, [{ k: NK(1), n: 'Newbie 1', m: 'pops', v: 25000, t: NOW }, { k: NK(3), n: 'Newbie 3', m: 'cust', v: 0, t: NOW, cap: true }]);
  assert.deepEqual(back.heard, [{ k: NK(1), d: [1, 2, 3] }]);
  // A save from before: terms without the lists.
  const old = json(p, '(()=>{const s=JSON.parse(JSON.stringify(S));delete s.fedp.ment;delete s.fedp.heard;sanitize(s);return [s.fedp.ment,s.fedp.heard];})()');
  assert.deepEqual(old, [[], []]);
  // A save gets S.fedp (with empty lists) only when it joins; newGame() starts it as null.
  assert.deepEqual(json(p, '[fedPNew().ment,fedPNew().heard]'), [[], []]);
  assert.deepEqual(p.errors, []);
});

test('a running transit deal is published as cust on the seller\'s side and up on the buyer\'s; Tier 2 too', async () => {
  const p = await mentor(), a = NK(1), b = NK(2);
  p.ev(`S.fed.deals=[${JSON.stringify({ ...deal(1, NOW - 600), deal: 'transit', role: 'sell' })},${JSON.stringify({ ...deal(2, NOW - 600), deal: 'transit', role: 'buy' })},
    ${JSON.stringify({ ...deal(3, NOW - 600), deal: 'transit', role: 'sell', st: 'over', on: false })}]`);
  const b0 = json(p, 'fedStatsBody()');
  assert.deepEqual(b0.cust, [a]);
  assert.deepEqual(b0.up, [b]);
  assert.equal(typeof b0.tier2, 'boolean');
  // A body with neither: the fields are left out.
  p.ev('S.fed.deals=[]');
  const b1 = json(p, 'fedStatsBody()');
  assert.equal('cust' in b1 || 'up' in b1, false);
  // Every body it sends passes the record rules (§5.2).
  assert.equal(await p.ev('(async()=>{const r=await fedSignRec(S.fed.key.priv,"stats",{...fedStatsBody(),cust:[' + JSON.stringify(a) + ']},fedNow());return (await fedCheck(r,fedNow())).ok;})()'), true);
  assert.deepEqual(p.errors, []);
});
