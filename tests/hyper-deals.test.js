// The Hyperscaler among players (89-fedplay-hyper.js, docs/FEDERATION-PROTOCOL.md §5.1 rates.edge/rates.onramp, §5.3
// edge/onramp, §10.10): its published policy (open, free PNIs, never transit), the edge node in a home ISP's network and
// the cloud on-ramp, both computed by each side from published terms with the buyer reporting what crossed; computer-run
// stand-ins for solo games; saves repaired. Two real games share one fake relay node and a virtual clock: each publishes
// what it signs, the other reads it, as two players' games do.
const test = require('node:test');
const assert = require('node:assert/strict');
const { advanceUntil, fedPage, joinGame, settle, until, Net, URL1, NOW, rec, rid, key, asn, box, sealRec } = require('./helpers/fed');
const { load } = require('./harness');

const DAY = 86400;
const CLOUD = ['state', 'ix2', 'cloud'];
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));

// One relay node both games use: what either puts, both read after a reconnect (as a relay forwards records).
async function relay(net, n, ...ps) {
  // What each game queued has reached the node first.
  for (let i = 0; i < 40 && !ps.every((p) => p.ev('S.fed.out.length===0')); i++) { net.advance(500); await settle(10); }
  n.feed = n.puts.filter((r) => ['announce', 'offer', 'accept', 'decline'].includes(r.kind)).map((r) => ({ rec: r, rcpt: [] }));
  for (const ws of [...n.socks]) ws.drop();
  await settle(10);
  for (let i = 0; i < 40 && !ps.every((p) => p.ev("fedStatus().state==='connected'")); i++) { net.advance(2500); await settle(10); }
  assert.ok(ps.every((p) => p.ev("fedStatus().state==='connected'")), 'both reconnected');
  await settle(20);
}
// Two joined games on one node: a Hyperscaler in Frankfurt (a region at home, users in Germany, transit) and a classic
// home ISP in Frankfurt and Amsterdam with broadband, an exchange port and transit.
async function pair({ feats = CLOUD } = {}) {
  const net = new Net(), n = net.node(URL1, { feats });
  const H = fedPage({ net, seed: 7 }), I = fedPage({ net, seed: 9 });
  assert.equal(await joinGame(H, URL1, "ACT.start({});ACT.charter({k:'hyper'})"), null);
  assert.equal(await joinGame(I), null);
  H.ev("S.fed.joined-=100;S.cash=1e9;ACT.hsLaunch({cc:'DE'});ACT.buyTransit({city:'fra',net:'cog',tier:1});S.hs.cc.DE.d=200;compute()");
  I.ev("S.fed.joined-=100;S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});ACT.launchBB({city:'ams'});ACT.buyTransit({city:'ams',net:'cog',tier:1});S.pops.fra.bb.d=400;compute()");
  for (const p of [H, I]) assert.ok(await advanceUntil(p, () => p.ev('!!(S.fedp&&S.fedp.mine.length)'), { step: 1000, max: 60000 }), 'announced');
  return { net, n, H, I, kH: H.ev('S.fed.key.pub'), kI: I.ev('S.fed.key.pub') };
}
// Both games know each other from their newest announces.
async function meet(net, n, H, I) {
  await relay(net, n, H, I);
  for (const p of [H, I]) { await p.ev('fedPlayRefresh()'); await settle(10); }
  assert.ok(H.ev('S.fedn.nets.length===1') && I.ev('S.fedn.nets.length===1'), 'each sees the other');
  for (const p of [H, I]) p.ev('compute()');
}
// Announces again after terms changed, waits until it went out.
async function announce(p) { await p.ev('fedAnnounceMaybe(true)'); await settle(10); }

test('two players: a Hyperscaler and a home ISP peer, place an edge node and sell an on-ramp; both compute the same deals, traffic moves in both games, usage is reported', async () => {
  const { net, n, H, I, kH, kI } = await pair();
  // The Hyperscaler's published policy: open, free PNIs on 10G and 100G ports, on-ramps into its region, never transit;
  // a balanced mix, so a ratio-minded network takes it.
  const hb = json(H, 'S.fedp.mine[0].body');
  assert.equal(hb.policy, 'open');
  assert.deepEqual(hb.rates.pni, { setup: 0, ports: [{ mbps: 10000, monthly: 0 }, { mbps: 100000, monthly: 0 }], term: 365 });
  assert.equal(hb.rates.transit, undefined);
  assert.equal(hb.auto.transit, 'decline');
  assert.equal(hb.auto.peering, 'auto');
  assert.deepEqual(hb.rates.onramp.at, ['fra']);
  assert.equal(hb.auto.onramp, 'auto');
  assert.ok(hb.mix.content < 500 && hb.mix.eyeball < 500, 'not a one-way content network');
  // The home ISP hosts edge nodes: a fee per node, two per city at most, automatically.
  net.advance(1000);
  await I.ev("fedTermsApply({pol:'selective',cond:{minMbps:0,maxRatio:300,minShared:0,rpki:false,tier1:false,ai:true},rates:{edge:{monthly:400,cap:2,term:90}},auto:{peering:'auto',edge:'auto'}})");
  await settle(10);
  const ib = json(I, 'S.fedp.mine[0].body');
  assert.deepEqual(ib.rates.edge, { at: ['ams', 'fra'], monthly: 400, cap: 2, term: 90 }, 'the cities it sells broadband in');
  assert.equal(ib.auto.edge, 'auto');
  await meet(net, n, H, I);
  // Ratio-minded: the ISP's selective policy (3:1 at most) takes the Hyperscaler's traffic.
  assert.ok(I.ev(`fedPair(fedNetOf('${kH}')).mbps`) > 0, 'traffic between them');
  assert.deepEqual(json(I, `fedCondMiss(S.fedp.cond,fedMeFor(fedNetOf('${kH}')))`), []);
  assert.deepEqual(json(H, `fedCondMiss(FEDN.ann.get('${kI}').rec.body.cond,fedMeFor(fedNetOf('${kI}')))`), []);

  // Peering over a PNI in Frankfurt, asked by the ISP: the Hyperscaler peers automatically.
  assert.equal(await I.ev(`fedRequest('${kH}','peering',{via:'pni',at:'fra'})`), null);
  // An edge node in the ISP's Frankfurt: the Hyperscaler asks on the ISP's card.
  const eo = json(H, `fedOffer('${kI}','edge',{at:'fra',nodes:1})`);
  assert.deepEqual(eo.miss, []);
  assert.deepEqual(eo.terms, { at: 'fra', nodes: 1, monthly: 400, term: 90 });
  assert.deepEqual(json(H, `fedOffer('${kI}','edge',{at:'fra',nodes:3}).miss.map(x=>x.l)`), ['cap']);
  assert.equal(await H.ev(`fedRequest('${kI}','edge',{at:'fra',nodes:1})`), null);
  // An on-ramp into the Hyperscaler's Frankfurt region, bought by the ISP.
  assert.deepEqual(json(I, `fedOffer('${kH}','onramp',{at:'fra',mbps:10000}).terms`), { at: 'fra', mbps: 10000, monthly: 2500, term: 90 });
  assert.equal(await I.ev(`fedRequest('${kH}','onramp',{at:'fra',mbps:10000})`), null);
  await relay(net, n, H, I);
  for (const p of [H, I]) assert.ok(await advanceUntil(p, () => p.ev("S.fed.deals.filter(d=>d.st==='run').length===3"), { step: 500, max: 20000 }), 'three deals running');
  // Both games hold the same three deals with the same terms, start and end; each books its own side.
  const dH = json(H, 'S.fed.deals.map(d=>({id:d.id,deal:d.deal,role:d.role,st:d.st,start:d.start,end:d.end,terms:d.terms}))');
  const dI = json(I, 'S.fed.deals.map(d=>({id:d.id,deal:d.deal,role:d.role,st:d.st,start:d.start,end:d.end,terms:d.terms}))');
  for (const k of ['peering', 'edge', 'onramp']) {
    const a = dH.find((d) => d.deal === k), b = dI.find((d) => d.deal === k);
    assert.ok(a && b, k + ' in both games');
    assert.equal(a.id, b.id); assert.equal(a.st, 'run'); assert.equal(b.st, 'run');
    assert.equal(a.start, b.start); assert.equal(a.end, b.end); assert.deepEqual(a.terms, b.terms);
  }
  assert.equal(dH.find((d) => d.deal === 'edge').role, 'buy'); assert.equal(dI.find((d) => d.deal === 'edge').role, 'sell');
  assert.equal(dH.find((d) => d.deal === 'onramp').role, 'sell'); assert.equal(dI.find((d) => d.deal === 'onramp').role, 'buy');
  const edge = dH.find((d) => d.deal === 'edge').id, ramp = dH.find((d) => d.deal === 'onramp').id;
  assert.equal(edge.length > 0, true);

  // The host's game: the node is a rank-0 exit for the Hyperscaler's network, and the static share of what its customers
  // ask of it leaves there, off transit.
  I.ev("S.biz.push({id:'R1',name:'Sock On-Ramp',type:'onramp',city:'ams',city2:'fra',bw:5,rate:200,mood:80,since:S.day,reqs:[]});fedDealsOn(S,fedNow());compute()");
  const hNet = I.ev(`fedNetOf('${kH}').id`);
  assert.ok(I.ev(`R.useCache['fed:${edge}']`) > 0, 'the edge node serves in the host\'s game');
  assert.ok(I.ev(`R.useCache['fed:${edge}']`) <= I.ev(`R.demTo['${hNet}']`) * 0.25 + 1e-6, 'never more than the static quarter');
  assert.equal(I.ev('R.rev.fed'), 400 + I.ev("hsfRampPrem(S.fed.deals.find(d=>d.deal==='onramp'))"), 'the host earns its node fee (and the on-ramp premium)');
  assert.ok(I.ev(`R.usePni['fed:${ramp}']`) >= 0);
  assert.equal(I.ev('R.cost.fed'), 2500, 'the ISP pays its on-ramp port');
  assert.ok(I.ev(`hsfRampPrem(S.fed.deals.find(d=>d.deal==='onramp'))`) > 0, 'its on-ramp customer to Frankfurt pays a cloud premium');
  // The Hyperscaler's game: users behind the ISP get their static share at the node; the deal costs, the on-ramp earns.
  H.ev('fedDealsOn(S,fedNow());compute()');
  assert.ok(H.ev(`R.hs.fe['${edge}']`) > 0, 'the node serves the ISP\'s users in the Hyperscaler\'s game');
  assert.ok(H.ev('R.hs.cc.DE.nd') > 0);
  assert.equal(H.ev('R.cost.fed'), 400);
  assert.equal(H.ev('R.rev.fed'), 2500);
  // Indirect Connect tenants in the ISP's cities count as reached through its on-ramp.
  assert.equal(H.ev("hsfRamp('ams')"), true);
  assert.equal(H.ev("hsfRamp('lon')"), false);

  // Usage: each buyer reports what crossed in its stats; the seller keeps it as the deal's rep.
  const sI = json(I, 'FED.hooks.stats({tier1:false})'), sH = json(H, 'FED.hooks.stats({tier1:false})');
  assert.ok(sI.traffic.find((x) => x.key === kH).in >= 5000, 'the ISP reports its on-ramp traffic');
  assert.ok(sH.traffic.find((x) => x.key === kI).in > 0, 'the Hyperscaler reports what its node served');
  H.ev(`fedDealsTick(S,fedNow(),new Set(),new Set(),new Map([['${kI}',${JSON.stringify(sI)}]]))`);
  I.ev(`fedDealsTick(S,fedNow(),new Set(),new Set(),new Map([['${kH}',${JSON.stringify(sH)}]]))`);
  const rp = H.ev("S.fed.deals.find(d=>d.deal==='onramp').rep");
  assert.ok(rp >= 5000 && rp <= 10000, 'what the buyer reported, never past the port');
  assert.ok(I.ev("S.fed.deals.find(d=>d.deal==='edge').rep") > 0);
  assert.ok(I.ev("S.fed.deals.find(d=>d.deal==='edge').rep") <= 100000, 'never past the node');
  // The deal rows say it, on a phone.
  I.ev(`innerWidth=360;innerHeight=640;UI.fpSel={};fedNetModal('${kH}')`);
  assert.match(I.ev("$('modal').textContent"), /They report/);
  assert.match(I.ev("$('modal').textContent"), /On-ramps into Frankfurt/);
  I.ev('closeModal()');
  assert.deepEqual(H.errors, []);
  assert.deepEqual(I.errors, []);
});
