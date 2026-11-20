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

  // The ISP's sheet in the Hyperscaler's game, on a phone: its edge card and the request, first when opened for it.
  H.ev('innerWidth=360;innerHeight=640');
  await H.ev(`ACT.fpNet({key:'${kI}',at:'fra',deal:'edge'})`);
  assert.match(H.ev("$('modal').textContent"), /Edge nodes in Amsterdam, Frankfurt: \$400 a node a month, up to 2 per city/);
  assert.equal(H.ev("document.querySelector('#modal .fp-ask').dataset.deal"), 'edge');
  assert.equal(H.ev("[...document.querySelectorAll('#modal .btns')].every(b=>b.querySelectorAll('button').length<=2)"), true);
  H.ev('closeModal()');
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
  // Users behind the ISP (its share of Germany, from its eyeball mix) reach the Hyperscaler over the PNI, off transit, in
  // both games.
  const peer = dH.find((d) => d.deal === 'peering').id;
  assert.ok(H.ev(`hsfPlayers().get('DE').length`) === 1);
  assert.ok(H.ev(`R.usePni['fed:${peer}:fra']`) > 0, 'the Hyperscaler sends the ISP\'s users their traffic over the PNI');
  assert.ok(I.ev(`R.usePni['fed:${peer}:fra']`) > 0, 'the ISP\'s customers reach the Hyperscaler over the PNI');
  assert.equal(H.ev('R.cost.fed'), 400);
  assert.equal(H.ev('R.rev.fed'), 2500);
  // Indirect Connect tenants in the ISP's cities count as reached through its on-ramp.
  assert.equal(H.ev("hsfRamp('ams')"), true);
  assert.equal(H.ev("hsfRamp('lon')"), false);
  H.ev("S.biz.push({id:'T1',name:'Federated Sock Wholesalers plc',type:'cloud',ck:'ent',p:['pc'],city:'ams',bw:5,rate:200,mood:80,since:S.day,reqs:[]});compute()");
  const withRamp = H.ev("hsNeedQ(R,S.biz.find(b=>b.id==='T1'),'pc')");
  H.ev("S.fed.deals.find(d=>d.deal==='onramp').on=false;compute()");
  const without = H.ev("hsNeedQ(R,S.biz.find(b=>b.id==='T1'),'pc')");
  H.ev("S.fed.deals.find(d=>d.deal==='onramp').on=true;S.biz=S.biz.filter(b=>b.id!=='T1');compute()");
  assert.ok(withRamp > without, 'an Indirect Connect tenant in Amsterdam is better served with the ISP\'s on-ramp');

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
  // The ISP's own enterprise customers now call for circuits into the Hyperscaler's cloud.
  I.ev('S.offers=[];for(let i=0;i<60;i++){S.day++;hsfRampDay();}');
  const calls = json(I, "S.offers.filter(o=>o.type==='onramp')");
  assert.ok(calls.length >= 1 && calls.length <= 3, 'a few calls, never a flood');
  assert.ok(calls.every((o) => o.city2 === 'fra' && o.bw <= 10 && o.name.includes(H.ev('S.name'))));
  // The deal rows say it, on a phone.
  I.ev(`innerWidth=360;innerHeight=640;UI.fpSel={};fedNetModal('${kH}')`);
  assert.match(I.ev("$('modal').textContent"), /They report/);
  assert.match(I.ev("$('modal').textContent"), /On-ramps into Frankfurt/);
  I.ev('closeModal()');
  assert.deepEqual(H.errors, []);
  assert.deepEqual(I.errors, []);
});

test('a Hyperscaler never sells transit: no card, the editor says so, a transit request is declined on arrival even on a forged basis', async () => {
  const { net, n, H, I, kH, kI } = await pair();
  await meet(net, n, H, I);
  // The buyer's side: nothing to ask for.
  assert.deepEqual(json(I, `fedOffer('${kH}','transit',{at:'fra'}).miss.map(x=>x.l)`), ['declines']);
  // The editor: no transit section to switch on, a line instead; turning it on does nothing.
  H.ev("innerWidth=360;innerHeight=640;UI.fpDraft=null;fedTermsModal()");
  assert.match(H.ev("$('modal').textContent"), /never sells transit/);
  assert.equal(H.ev("[...document.querySelectorAll('#modal select')].some(s=>JSON.parse(s.dataset.args).f==='tr.on')"), false);
  assert.equal(H.ev("[...document.querySelectorAll('#modal select')].some(s=>JSON.parse(s.dataset.args).f==='a.transit')"), false);
  H.ev("fedTermsEdit('tr.on','1');closeModal()");
  assert.equal(H.ev('!!UI.fpDraft.rates.transit'), false);
  H.ev('UI.fpDraft=null');
  // A forged request: its own last announce hacked to sell transit automatically, an offer on exactly that card.
  H.ev("S.fedp.mine[0].body.rates.transit={perGbps:100,commit:[],term:30};S.fedp.mine[0].body.auto.transit='auto'");
  const mine = json(H, 'S.fedp.mine[0]');
  I.ev(`FEDN.ann.get('${kH}').rec.body.rates.transit={perGbps:100,commit:[],term:30}`);
  const before = n.puts.length;
  // Signed by the ISP's game, as a modified client would.
  const body = { to: kH, deal: 'transit', basis: mine.id, terms: { mbps: 1000, perGbps: 100, term: 30, at: ['fra'] } };
  I.w.__b = body;
  const r = await I.ev('fedSignMine("offer",__b,S.fed).then(r=>{fedQueue(r,S.fed);return 1;})');
  assert.equal(r, 1);
  await relay(net, n, H, I);
  for (let i = 0; i < 20; i++) { net.advance(500); await settle(10); }
  assert.equal(H.ev("S.fed.deals.some(d=>d.deal==='transit')"), false, 'no transit deal in the Hyperscaler\'s game');
  assert.equal(H.ev("S.fedp.rq.some(q=>q.rec.body.deal==='transit')"), false, 'not even waiting for review');
  assert.ok(n.puts.slice(before).some((x) => x.kind === 'decline' && x.key === kH), 'declined, so the asker is not left waiting');
  // Buying transit from a player is fine.
  await I.ev("fedTermsApply({pol:'open',rates:{transit:{perGbps:500,commit:[],term:30}},auto:{transit:'auto'}})");
  await settle(10); net.advance(1000);
  await meet(net, n, H, I);
  assert.deepEqual(json(H, `fedOffer('${kI}','transit',{at:'fra',mbps:1000}).miss`), []);
  assert.deepEqual(H.errors, []);
});

test('servers that do not take cloud deals: no edge or on-ramp terms go out, and requests say why', async () => {
  const { net, n, H, I, kH, kI } = await pair({ feats: ['state', 'ix2'] });
  await I.ev("fedTermsApply({pol:'open',rates:{edge:{monthly:0,cap:2,term:90}},auto:{edge:'auto'}})");
  await settle(10);
  const ib = json(I, 'S.fedp.mine[0].body'), hb = json(H, 'S.fedp.mine[0].body');
  assert.equal(ib.rates.edge, undefined); assert.equal(ib.auto.edge, undefined);
  assert.equal(hb.rates.onramp, undefined); assert.equal(hb.auto.onramp, undefined);
  assert.equal(I.ev('S.fedp.rates.edge.cap'), 2, 'the card is kept until the servers take it');
  await meet(net, n, H, I);
  assert.deepEqual(json(H, `fedOffer('${kI}','edge',{at:'fra'}).miss.map(x=>x.l)`), ['cloud']);
  assert.match(H.ev(`fedMissText(fedOffer('${kI}','edge',{at:'fra'}).miss)`), /does not carry cloud deals/);
  // The editor says why.
  I.ev('innerWidth=360;innerHeight=640;UI.fpDraft=null;fedTermsModal()');
  assert.match(I.ev("$('modal').textContent"), /every server you joined takes them/);
  I.ev('closeModal()');
  assert.deepEqual(I.errors, []);
});

// ---------- solo: computer-run stand-ins ----------
function solo() {
  const p = load({ seed: 5 });
  p.ev("ACT.start({});ACT.charter({k:'hyper'});S.cash=1e9;ACT.hsLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.hs.cc.DE.d=100;compute()");
  return p;
}
test('solo: computer-run home ISPs host edge nodes on fixed terms; the users behind them get their static share there', () => {
  const { ev, errors } = solo();
  const hosts = JSON.parse(ev("JSON.stringify(hsfNpcHosts('fra'))"));
  assert.ok(hosts.length >= 2, 'the country\'s home ISPs, biggest first');
  const [net, w] = hosts[0];
  const cash = ev('S.cash');
  ev(`ACT.hsfNpcEdge({city:'fra',net:'${net}'})`);
  assert.equal(ev('S.cash'), cash - ev('HSF_NPC_MO'), 'the first month up front');
  assert.equal(ev('S.hs.ne.length'), 1);
  ev('compute()');
  assert.equal(ev('R.hs.cc.DE.nd'), 0, 'not before it is racked');
  ev(`S.day=S.hs.ne[0].ready;compute()`);
  const d = ev('S.hs.cc.DE.d'), nd = ev('R.hs.cc.DE.nd');
  assert.ok(Math.abs(nd - Math.min(d * w * ev('HS_EDGE'), ev('HSF_EDGE_G'))) < 1e-6, 'the static quarter of the users behind that ISP');
  assert.ok(Math.abs(ev(`R.hs.fe['npc:fra|${net}']`) - nd) < 1e-9);
  assert.equal(ev("hsQ(R,'DE')"), 1, 'served in full');
  assert.equal(ev('R.cost.cloud') - ev('HS_T[0].mo'), ev('HSF_NPC_MO'), 'a month per node on the Cost Exploder');
  // At most two per city and ISP; launch first; only the country's own ISPs.
  ev(`ACT.hsfNpcEdge({city:'fra',net:'${net}'});ACT.hsfNpcEdge({city:'fra',net:'${net}'})`);
  assert.equal(ev('S.hs.ne.length'), 2);
  ev("ACT.hsfNpcEdge({city:'ams',net:'kpn'})");
  assert.equal(ev('S.hs.ne.length'), 2, 'no users in the Netherlands yet');
  ev("ACT.hsfNpcEdge({city:'fra',net:'cog'})");
  assert.equal(ev('S.hs.ne.length'), 2, 'a transit carrier is no home ISP');
  ev(`ACT.hsfNpcEdgeOff({city:'fra',net:'${net}'})`);
  assert.equal(ev('S.hs.ne.length'), 1);
  // A player host is never dearer: a published fee is capped at the computer-run price.
  assert.equal(ev('fedRatesClean({edge:{monthly:99999,cap:4,term:90}}).edge.monthly'), ev('HSF_NPC_MO'));
  assert.deepEqual(errors, []);
});

test('solo: the Cloud tab and the Deals tab offer the stand-ins, on a phone and on a desktop', () => {
  for (const [w, h] of [[360, 640], [1280, 800]]) {
    const { ev, errors } = solo();
    ev(`innerWidth=${w};innerHeight=${h};UI.sel={type:'city',id:'fra'};renderPanel()`);
    const panel = ev("$('panel').textContent");
    assert.match(panel, /Edge nodes in partner networks/);
    assert.match(panel, /snacks/);
    // Rows of two buttons at most.
    assert.equal(ev("[...document.querySelectorAll('#panel .btns')].every(b=>b.querySelectorAll('button').length<=2)"), true);
    const add = ev("[...document.querySelectorAll('#panel [data-act=\"hsfNpcEdge\"]')].length");
    assert.ok(add >= 2);
    ev("document.querySelector('#panel [data-act=\"hsfNpcEdge\"]').click()");
    assert.equal(ev('S.hs.ne.length'), 1, 'the button places a node');
    ev("UI.dl={f:'all',n:5,open:{cloud:1}}");
    const deals = ev('dealsTab()');
    assert.match(deals, /Cloud partners/);
    assert.match(deals, /never sells transit/);
    assert.match(deals, /Edge nodes at computer-run ISPs/);
    assert.deepEqual(errors, []);
  }
});

test('saves: edge nodes and cloud terms repaired, unknown deal kinds dropped, classic games untouched', () => {
  const { ev, errors } = solo();
  const net = JSON.parse(ev("JSON.stringify(hsfNpcHosts('fra'))"))[0][0];
  ev(`ACT.hsfNpcEdge({city:'fra',net:'${net}'})`);
  const fix = (patch) => JSON.parse(ev(`(()=>{const s=JSON.parse(JSON.stringify(S));${patch};migrate(s);return JSON.stringify({ne:s.hs.ne,fedp:s.fedp});})()`));
  assert.deepEqual(fix('').ne, [{ c: 'fra', net, ready: ev('S.hs.ne[0].ready') }], 'a round trip keeps it');
  assert.deepEqual(fix("delete s.hs.ne").ne, [], 'older saves get none');
  assert.deepEqual(fix("s.hs.ne='junk'").ne, []);
  const junk = fix(`s.hs.ne=[null,{c:'zzz',net:'${net}'},{c:'fra',net:'cog'},{c:'fra',net:'nope'},{c:'fra',net:'${net}',ready:'x'},{c:'fra',net:'${net}',ready:5},{c:'fra',net:'${net}',ready:6}]`).ne;
  assert.deepEqual(junk, [{ c: 'fra', net, ready: 0 }, { c: 'fra', net, ready: 5 }], 'bad cities, carriers, unknown networks dropped; at most two per city');
  // Published terms from a save: junk cards dropped, a Hyperscaler's transit gone.
  const t = fix("s.fedp={pol:'open',rates:{transit:{perGbps:5,commit:[],term:30},edge:{monthly:-1,cap:99,term:90},onramp:{ports:'x',term:90}},auto:{transit:'auto',edge:'maybe'}}").fedp;
  assert.equal(t.rates.transit, undefined); assert.equal(t.auto.transit, 'decline');
  assert.equal(t.rates.edge, undefined); assert.equal(t.rates.onramp, undefined);
  // Deals: a running edge deal with bad terms is dropped, an unknown kind (from a newer game) is ignored.
  const D = { id: 'A'.repeat(43), key: key('alice').pub, start: 1, end: 2, role: 'buy', st: 'run' };
  assert.equal(ev(`fedDealClean(${JSON.stringify({ ...D, deal: 'merger', terms: {} })})`), null);
  assert.equal(ev(`fedDealClean(${JSON.stringify({ ...D, deal: 'edge', terms: { at: 'fra', nodes: 99, monthly: 1, term: 90 } })})`), null);
  assert.equal(ev(`fedDealClean(${JSON.stringify({ ...D, deal: 'onramp', terms: { at: 'fra', mbps: 10000, monthly: 1, term: 90 } })}).deal`), 'onramp');
  // A classic game: no Hyperscaler state, no edge or on-ramp terms.
  const c = load({ seed: 5 });
  c.ev("ACT.start({});ACT.charter({k:'global'});fedP();compute()");
  assert.equal(c.ev("'hs' in S||'hs' in R"), false);
  assert.equal(c.ev('!!S.fedp.rates.edge||!!S.fedp.rates.onramp'), false);
  assert.equal(c.ev('S.fedp.auto.transit'), 'review', 'a classic network still sells transit if it wants');
  assert.deepEqual(errors, []);
  assert.deepEqual(c.errors, []);
});
