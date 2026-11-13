// Exchanges players run (89-fedplay-ix.js, docs/FEDERATION-PROTOCOL.md §5.1 rates.ix.members, §5.3 cofound): ports and
// co-founders you sell count as player members of your exchange and draw computer-run networks in faster; with feature
// ix2 your announce lists who is on it, so a port there reaches them; co-founding shares the cost and the fees; the
// Multimode sheet lists exchanges players run, where a port would save transit, and where founding one would gather
// players. Fake nodes, a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { advanceUntil, fedPage, joinGame, settle, until, URL1, NOW, rec, rid, key, asn, box, sealRec } = require('./helpers/fed');

const DAY = 86400;
const AUTO = { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto', wave: 'auto' };
const IX2 = ['state', 'ix2'];
function ann(name, over = {}, t = NOW - 60) {
  const k = key(name);
  return rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30,
    mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {}, auto: AUTO, ...over });
}
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const pid = (name) => 'fp' + key(name).pub.slice(0, 12).replace(/[-_]/g, 'x');
const txt = (p) => p.ev("$('modalCard').textContent");
// A joined game at Frankfurt (broadband, transit, a port at the exchange) with a POP in Amsterdam; feats: what the node
// lists in its welcome (ix2 or not).
async function game(feed, { feats = ['state'], setup = '' } = {}) {
  const p = fedPage(), n = p.net.node(URL1, { feats });
  n.got = []; const take = n.take.bind(n); n.take = (ws, text) => { n.got.push(JSON.parse(text)); take(ws, text); };
  n.feed = feed.map((r) => ({ rec: r, rcpt: [] }));
  assert.equal(await joinGame(p), null);
  p.ev('S.fed.joined-=100');
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:1});ACT.buildPop({city:'ams'});" + setup);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')), 'connected');
  const nets = feed.filter((r) => r.kind === 'announce').length;
  assert.ok(await advanceUntil(p, () => p.ev(`!!(S.fedn&&S.fedn.nets.length===${nets}&&S.fedp&&S.fedp.mine.length)`), { step: 1000, max: 60000 }), 'players built');
  await p.ev('fedPlayRefresh()');
  await settle(10);
  p.ev('compute()');
  return { p, n };
}
async function resync(p, n, recs) {
  n.feed = recs.map((r) => ({ rec: r, rcpt: [] }));
  for (const ws of n.socks) ws.drop();
  await settle(10);
  assert.ok(await advanceUntil(p, () => p.ev("fedStatus().state==='connected'"), { step: 2500, max: 100000 }), 'reconnected');
  await settle(20);
}
// Sells ports on your exchange and waits for the announce that says so.
async function sellPorts(p) {
  await p.ev("fedTermsApply({pol:'open',rates:{ix:{ports:[{mbps:10000,monthly:800}],join:'anyone'}}})");
  assert.ok(await advanceUntil(p, () => p.ev('!!(S.fedp.mine[0]&&S.fedp.mine[0].body.rates.ix)')), 'port card announced');
}
const IXCARD = (at, members) => ({ ports: [{ mbps: 10000, monthly: 800 }, { mbps: 100000, monthly: 4000 }], join: 'anyone', at, ...(members ? { members } : {}) });

test('every computer-run network id is a Net (§5): the shape an announce may list', () => {
  const p = fedPage();
  assert.deepEqual(json(p, "NETS.filter(n=>!n.fed&&!/^[a-z0-9]{2,8}$/.test(n.id)).map(n=>n.id)"), []);
  assert.equal(p.ev("fedNetId('q6-YSQabcdefghijk').length>8"), true, 'a player network never passes for one');
});

test('player members: ports and co-founders you sell are members of your exchange, named, and draw networks in faster', async () => {
  const { p } = await game([ann('alice', { pops: ['fra', 'ams', 'lon', 'nte'] })], { setup: "ACT.buildPop({city:'nte'});ACT.foundIx({city:'nte'});" });
  const ka = key('alice').pub;
  assert.ok(p.ev('!!S.myIx.nte'), 'founded in Nantes, which has no exchange yet');
  assert.equal(p.ev("fedIxNext('nte',10)"), 10, 'no players: the usual wait');
  // Alice (an AI player) buys a 10G port on it.
  p.ev(`S.fedn.nets[0].ai=true;S.fedn.h='ai';compute();
    S.fed.deals.push({id:${JSON.stringify(rid(ann('bob')))},deal:'port',key:'${ka}',name:'Ping Floyd',asn:1,start:fedNow()-60,end:fedNow()+30*${DAY},terms:{at:'nte',mbps:10000,monthly:800,term:30},role:'sell',st:'run',on:false,rep:0,why:'',ai:true,renews:null});
    fedDealsOn(S,fedNow())`);
  assert.deepEqual(json(p, "fedIxPl('nte').map(d=>d.key)"), [ka]);
  assert.equal(p.ev("fedIxNext('nte',10)"), 8, 'a quarter faster per player');
  assert.equal(p.ev("fedIxNext('nte',17)"), 14);
  assert.equal(p.ev('S.myIx.nte.members.length'), 0, 'a player takes no computer member slot');
  // The exchange's panel names the player, with the robot.
  const h = p.ev("ixBlock('nte',false)");
  assert.match(h, /Players with a port/);
  assert.match(h, /🤖 Ping Floyd/);
  assert.match(h, /networks join 1\.25× faster/);
  assert.match(h, /10\.0 Gbps port · pays \$800\/mo/);
  // The day loop waits less for the next network.
  p.ev('S.myIx.nte.next=S.day+1;dayTick()');
  assert.ok(p.ev('S.myIx.nte.next-S.day') <= 14, 'the next look comes at most 14 days on');
  // Eight players count at most: never less than a day.
  assert.equal(p.ev("(()=>{const l=fedIxPl;fedIxPl=()=>Array(20).fill({});const v=fedIxNext('nte',10);fedIxPl=l;return v;})()"), 3);
  assert.deepEqual(p.errors, []);
});

test('ix2: the announce lists who is on your exchange and how you take co-founding, only while every server takes it', async () => {
  const setup = "ACT.buildPop({city:'nte'});ACT.foundIx({city:'nte'});";
  const { p, n } = await game([], { feats: IX2, setup });
  assert.deepEqual(n.got.find((f) => f.m === 'hello').feats, ['ix2'], 'the game lists ix2 in its hello');
  const nets = json(p, "NETS.filter(n=>!n.fed&&n.type!=='t1').slice(0,3).map(n=>n.id)");
  p.ev(`S.myIx.nte.members=${JSON.stringify(nets)}`);
  assert.equal(p.ev('fedIx2()'), true);
  await sellPorts(p);
  const b = json(p, 'S.fedp.mine[0].body');
  assert.deepEqual(b.rates.ix.members, [{ at: 'nte', nets, players: 0 }]);
  assert.equal(b.auto.cofound, 'review');
  assert.equal(p.ev(`FED_BODY.announce(S.fedp.mine[0].body,{rec:{t:S.fedp.mine[0].t},asn:S.fedp.mine[0].body.asn})`), null, 'a valid announce');
  // A server that does not list ix2 (relay 4.0): neither field.
  const o = await game([], { setup });
  o.p.ev(`S.myIx.nte.members=${JSON.stringify(nets)}`);
  assert.equal(o.p.ev('fedIx2()'), false);
  await sellPorts(o.p);
  const b2 = json(o.p, 'S.fedp.mine[0].body');
  assert.deepEqual(Object.keys(b2.rates.ix).sort(), ['at', 'join', 'ports']);
  assert.equal(b2.auto.cofound, undefined);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(o.p.errors, []);
});

test('a port on a player\'s exchange reaches its founder and its members; listed in the Multimode sheet and the looking glass', async () => {
  const p0 = fedPage(), m = json(p0, "NETS.filter(n=>!n.fed&&n.type!=='t1').slice(0,2).map(n=>n.id)");
  const alice = ann('alice', { rates: { ix: IXCARD(['ams'], [{ at: 'ams', nets: [...m, 'zz9'], players: 3 }]) } });
  const { p } = await game([alice]);
  const ka = key('alice').pub;
  assert.deepEqual(json(p, 'S.fedn.nets[0].x'), { ams: { n: m, p: 3 } }, 'the snapshot keeps the members, unknown ids left out');
  // The Multimode sheet lists her exchange: city, players, cheapest port, and a button for a port.
  p.ev("innerWidth=360;innerHeight=740;ACT.fuOpen({v:'home'})");
  await advanceUntil(p, () => /Exchanges run by players/.test(txt(p)), { max: 10000 });
  assert.match(txt(p), /Exchanges run by players/);
  assert.match(txt(p), /Ping Floyd.*Amsterdam · 3 players · ports from \$800\/mo/);
  const b = p.ev(`[...document.querySelectorAll('#modalCard [data-act="fpNet"]')].map(x=>x.dataset.args).find(a=>a.includes('"at":"ams"'))`);
  assert.ok(b, 'a Get a port button');
  assert.deepEqual(JSON.parse(b), { key: ka, at: 'ams', deal: 'port' });
  // It opens her sheet with the port request first, Amsterdam picked.
  await p.ev(`ACT.fpNet(${b})`);
  assert.equal(p.ev("document.querySelector('#modal .fp-ask').dataset.deal"), 'port');
  assert.ok(p.ev("document.querySelector('#modal .fp-ask').classList.contains('fp-focus')"));
  // Bought: it reaches Alice and her exchange's computer-run members, billed monthly.
  assert.equal(await p.ev(`fedRequest('${ka}','port',{at:'ams',mbps:10000})`), null);
  await settle(10);
  p.ev('compute()');
  const ex = json(p, "fedDealExits().filter(x=>x.city==='ams').map(x=>({set:[...x.set],cap:x.cap}))");
  assert.equal(ex.length, 1);
  assert.deepEqual(ex[0].set.sort(), [pid('alice'), ...m].sort());
  assert.equal(p.ev('R.cost.fed'), 800);
  // The looking glass lists it too, now as your port.
  p.ev("ACT.fuOpen({v:'glass'})");
  await advanceUntil(p, () => /Exchanges run by players/.test(txt(p)), { max: 10000 });
  assert.match(txt(p), /Ping Floyd.*Amsterdam.*your port/);
  assert.deepEqual(p.errors, []);
});

test('worth peering with: a port on a player\'s exchange that reaches two players you pay transit for, with the saving', async () => {
  const alice = ann('alice', { rates: { ix: IXCARD(['ams']) } }), bob = ann('bob', { name: 'Packet Lunch' });
  const { p } = await game([alice, bob]);
  const ka = key('alice').pub;
  const l = json(p, 'fedSuggestPorts()');
  assert.equal(l.length, 1);
  assert.equal(l[0].k, ka);
  assert.equal(l[0].at, 'ams');
  assert.deepEqual(l[0].ids.sort(), [pid('alice'), pid('bob')].sort(), 'Alice, and Bob (open, at the exchange in Amsterdam)');
  assert.ok(Math.abs(l[0].saved - p.ev(`fedTransitSaved(${l[0].g})`)) < 1e-9, 'the combined saving, billed for real');
  assert.ok(Math.abs(l[0].g - p.ev(`(R.netEg['${pid('alice')}'].t+R.netEg['${pid('bob')}'].t)`)) < 1e-9);
  const h = p.ev('fedSuggestHtml()');
  assert.match(h, /Get a port on Ping Floyd's exchange in Amsterdam/);
  assert.match(h, /reaches Ping Floyd, Packet Lunch|reaches Packet Lunch, Ping Floyd/);
  // Taken: no longer suggested.
  assert.equal(await p.ev(`fedRequest('${ka}','port',{at:'ams',mbps:10000})`), null);
  await settle(10);
  p.ev('compute()');
  assert.deepEqual(json(p, 'fedSuggestPorts()'), []);
  assert.deepEqual(p.errors, []);
});

test('a nudge to found: where you have a POP, nobody runs an exchange and two players are; gone once founded', async () => {
  const pops = ['fra', 'ams', 'lon', 'nte'];
  const { p } = await game([ann('alice', { pops }), ann('bob', { name: 'Packet Lunch', pops })], { setup: "ACT.buildPop({city:'nte'});" });
  assert.deepEqual(json(p, 'fedFoundHints()'), [{ c: 'nte', n: 2 }], 'Nantes; never Frankfurt or Amsterdam, which have exchanges');
  p.ev("innerWidth=360;innerHeight=740;ACT.fuOpen({v:'home'})");
  await advanceUntil(p, () => /Found an exchange in Nantes/.test(txt(p)), { max: 10000 });
  assert.match(txt(p), /Found an exchange in Nantes2 players could join/);
  const cash = p.ev('S.cash');
  p.ev(`document.querySelector('#modalCard [data-act="foundIx"]').click()`);
  assert.ok(p.ev('!!S.myIx.nte'), 'the existing founding flow');
  assert.equal(p.ev('S.cash'), cash - p.ev('MYIX_COST'));
  assert.deepEqual(json(p, 'fedFoundHints()'), []);
  // Where a player already runs one: a port there, not a second exchange.
  const o = await game([ann('alice', { pops, rates: { ix: IXCARD(['nte']) } }), ann('bob', { name: 'Packet Lunch', pops })], { setup: "ACT.buildPop({city:'nte'});" });
  assert.deepEqual(json(o.p, 'fedFoundHints()'), []);
  assert.deepEqual(p.errors, []);
});

test('co-founding, the founder\'s side: invite from the exchange panel, the setup and monthly shares in, the fee share out', async () => {
  const pops = ['fra', 'ams', 'lon', 'nte'];
  const setup = "ACT.buildPop({city:'nte'});ACT.foundIx({city:'nte'});";
  const { p, n } = await game([ann('alice', { pops, auto: { ...AUTO, cofound: 'review' } }), ann('bob', { name: 'Packet Lunch', pops })], { feats: IX2, setup });
  const ka = key('alice').pub, kb = key('bob').pub, me = p.ev('S.fed.key.pub');
  // Not selling ports yet: the panel says to, and an offer misses it.
  assert.match(p.ev("ixBlock('nte',false)"), /Sell ports on your exchange first/);
  assert.ok(json(p, `fedOffer('${ka}','cofound',{at:'nte'}).miss.map(x=>x.l)`).includes('ixsell'));
  await sellPorts(p);
  p.ev(`S.myIx.nte.members=${JSON.stringify(json(p, "NETS.filter(n=>!n.fed&&n.type!=='t1').slice(0,3).map(n=>n.id)"))}`);
  // The panel lists players with a POP there to invite; the button opens the player's sheet with co-founding first.
  const h = p.ev("ixBlock('nte',false)");
  assert.match(h, /Co-founders \(0 of 2\)/);
  assert.match(h, new RegExp(`data-act="fpNet"[^>]*${ka.slice(0, 10)}[^>]*cofound`));
  await p.ev(`ACT.fpNet({key:'${ka}',at:'nte',deal:'cofound'})`);
  assert.equal(p.ev("document.querySelector('#modal .fp-ask').dataset.deal"), 'cofound');
  assert.match(txt(p), /25% of the exchange in Nantes · \$20\.0k once · \$750\/mo · 180 days/);
  // Bob's announce has no auto.cofound (an older game): declined before anything is sent.
  assert.deepEqual(json(p, `fedOffer('${kb}','cofound',{at:'nte'}).miss.map(x=>x.l)`), ['declines']);
  const x = json(p, `fedOffer('${ka}','cofound',{at:'nte',share:250,term:180})`);
  assert.deepEqual(x.miss, []);
  assert.deepEqual(x.terms, { at: 'nte', share: 250, setup: 20000, monthly: 750, term: 180 });
  await p.ev(`ACT.fpReq({key:'${ka}',deal:'cofound',at:'nte',share:250,term:180})`);
  await settle(10);
  const d0 = json(p, "S.fed.deals.find(d=>d.deal==='cofound')");
  assert.equal(d0.role, 'sell');
  assert.equal(d0.st, 'wait');
  // Alice accepts: the setup share comes in once, the monthly share every month, and her share of the fees goes out.
  const cash = p.ev('S.cash');
  await resync(p, n, [ann('alice', { pops, auto: { ...AUTO, cofound: 'review' } }), rec('alice', 'accept', p.net.now(), { offer: d0.id, to: me })]);
  assert.ok(await advanceUntil(p, () => p.ev("S.fed.deals.find(d=>d.deal==='cofound').st==='run'")), 'accepted');
  assert.equal(p.ev('S.cash'), cash + 20000);
  p.ev('compute()');
  assert.equal(p.ev('R.rev.fed'), 750);
  assert.equal(p.ev('R.cost.fed'), 3 * 1500 * 250 / 1000);
  assert.deepEqual(json(p, "fedIxPl('nte').map(d=>d.deal)"), ['cofound']);
  assert.match(p.ev("ixBlock('nte',false)"), /co-founder · 25% · pays \$750\/mo/);
  assert.match(p.ev("ixBlock('nte',false)"), /Co-founders \(1 of 2\)/);
  // The announce counts her among the players.
  await p.ev('fedAnnounceMaybe(true)');
  assert.equal(p.ev('S.fedp.mine[0].body.rates.ix.members[0].players'), 1);
  // At most two co-founders.
  p.ev(`S.fed.deals.push({...S.fed.deals.find(d=>d.deal==='cofound'),id:${JSON.stringify(rid(ann('carol')))},key:'${kb}'})`);
  assert.ok(json(p, `fedOffer('${ka}','cofound',{at:'nte'}).miss.map(x=>x.l)`).includes('cofull'));
  // No renewal button for co-founding; it ends like other deals.
  assert.doesNotMatch(p.ev('fedDealRow(S.fed.deals.find(d=>d.deal===\'cofound\'))'), /fpRenew/);
  assert.deepEqual(p.errors, []);
});

test('co-founding, the co-founder\'s side: reviewed, paid once and monthly, earns its share of the founder\'s member fees', async () => {
  const p0 = fedPage(), m = json(p0, "NETS.filter(n=>!n.fed&&n.type!=='t1').slice(0,4).map(n=>n.id)");
  const pops = ['fra', 'ams', 'lon', 'nte'];
  const alice = ann('alice', { pops, rates: { ix: IXCARD(['nte'], [{ at: 'nte', nets: m, players: 1 }]) } });
  const { p, n } = await game([alice], { feats: IX2, setup: "ACT.buildPop({city:'nte'});" });
  const ka = key('alice').pub;
  const mine = json(p, 'S.fedp.mine[0]'), to = p.ev('S.fed.key.pub');
  assert.equal(mine.body.auto.cofound, 'review', 'it takes co-founding offers, by hand');
  const terms = { at: 'nte', share: 250, setup: 20000, monthly: 750, term: 180 };
  const offer = sealRec('alice', 'offer', p.net.now(), { to, deal: 'cofound', basis: mine.id, terms }, to, mine.body.box);
  const greedy = sealRec('alice', 'offer', p.net.now() + 1, { to, deal: 'cofound', basis: mine.id, terms: { ...terms, setup: 60000 } }, to, mine.body.box);
  await resync(p, n, [alice, offer, greedy]);
  assert.ok(await advanceUntil(p, () => p.ev('S.fedp.rq.length') === 2), 'both wait for review');
  p.ev('ACT.dash()');
  assert.match(p.ev("$('dash').textContent"), /Co-founding.*25% of the exchange in Nantes/);
  // More than a quarter of the founding cost for a quarter: refused when accepted.
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev(`fedAcceptRq('${rid(greedy)}')`))).miss.map((x) => x.l), ['fair']);
  const cash = p.ev('S.cash');
  assert.equal(await p.ev(`fedAcceptRq('${rid(offer)}')`), null);
  const d = json(p, "S.fed.deals.find(d=>d.deal==='cofound')");
  assert.equal(d.role, 'buy');
  assert.equal(d.st, 'run');
  assert.equal(p.ev('S.cash'), cash - 20000);
  p.ev('compute()');
  assert.equal(p.ev('R.cost.fed'), 750);
  assert.equal(p.ev('R.rev.fed'), m.length * 1500 * 250 / 1000, 'a quarter of the fees of the four members her announce lists');
  // Its port reaches Alice and those members.
  const ex = json(p, "fedDealExits().filter(x=>x.city==='nte').map(x=>[...x.set])");
  assert.deepEqual(ex[0].sort(), [pid('alice'), ...m].sort());
  // Not enough cash: missing.
  p.ev('S.cash=10');
  assert.ok(json(p, `fedTheirMiss(S,{deal:'cofound',terms:${JSON.stringify(terms)}},'${ka}')`).map((x) => x.l).includes('cash'));
  assert.deepEqual(p.errors, []);
});

test('saves: members in the snapshot, co-founding deals and terms are checked; old saves load with the defaults', () => {
  const p = fedPage();
  p.ev('ACT.start({})');
  const k = key('alice').pub, nets = json(p, "NETS.filter(n=>!n.fed).slice(0,2).map(n=>n.id)");
  const clean = (x) => json(p, `fednClean({nets:[{k:'${k}',name:'Ping Floyd',asn:4200000001,pops:['fra'],ix:[],mix:[600,300,100]${x === undefined ? '' : ',x:' + JSON.stringify(x)}}]}).nets[0].x||null`);
  assert.equal(clean(undefined), null, 'a save from before has none');
  assert.deepEqual(clean({ ams: { n: [...nets, 'nope', 7], p: 2 } }), { ams: { n: nets, p: 2 } });
  assert.deepEqual(clean({ atlantis: { n: nets, p: 1 }, ams: { n: 'x' } }), null);
  assert.deepEqual(clean({ ams: { n: nets, p: 99 } }), { ams: { n: nets, p: 0 } });
  // Terms from before co-founding get the default, a running co-founding deal is kept, a broken one dropped.
  p.ev("S.fedp=fedPNew();delete S.fedp.auto.cofound;fedpSanitize(S)");
  assert.equal(p.ev('S.fedp.auto.cofound'), 'review');
  const deal = (terms) => json(p, `fedDealClean({id:${JSON.stringify(rid(rec('alice', 'offer', NOW, {})))},deal:'cofound',key:'${k}',name:'Ping Floyd',asn:1,start:${NOW},end:${NOW + 180 * DAY},terms:${JSON.stringify(terms)},role:'buy',st:'run',on:true})`);
  assert.equal(deal({ at: 'nte', share: 250, setup: 20000, monthly: 750, term: 180 }).role, 'buy');
  assert.equal(deal({ at: 'nte', share: 600, setup: 20000, monthly: 750, term: 180 }), null);
  assert.deepEqual(p.errors, []);
});
