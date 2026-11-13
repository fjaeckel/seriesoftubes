// Multiplayer gameplay (docs/plans/federation.md, "Gameplay"): other players' networks become networks your customers
// ask for, reached by peering, PNIs or transit bought from a player; published terms decide requests; quiet and shunned
// networks go dark with their deals ended; deals book money only in their own game. Fake nodes, a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, rid, key, asn, box, sealRec, openRec } = require('./helpers/fed');

const DAY = 86400;
// An announce of a fake player (name in the vectors' key list), with its POPs and exchanges and published terms.
function ann(name, over = {}, t = NOW - 60) {
  const k = key(name);
  return rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30,
    mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {},
    auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' }, ...over });
}
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
// A joined game at Frankfurt with broadband, transit and a port at the exchange; the node's feed brings `feed`.
async function game(feed) {
  const p = fedPage(), n = p.net.node(URL1);
  n.feed = feed.map((r) => ({ rec: r, rcpt: [] }));
  assert.equal(await joinGame(p), null);
  // An established player (joined 100 days ago): it pays card prices, not the newcomer price (§10.10).
  p.ev("S.fed.joined-=100");
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:1});ACT.buildPop({city:'ams'});ACT.buyIx({city:'ams',tier:1})");
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')), 'connected');
  // The first look (2 s after connecting, on the virtual clock) builds the snapshot, announces and checks the shared
  // leak last; records arriving later refresh 1 s after them. Move the clock a second at a time until all of it is done,
  // then wait out any refresh still queued, so every test starts from the same state.
  const nets = feed.filter((r) => r.kind === 'announce').length;
  const ready = `!!(S.fedn&&S.fedn.nets.length===${nets}&&S.fedp&&S.fedp.mine.length&&S.fedp.leakD)`;
  for (let i = 0; i < 60 && !p.ev(ready); i++) { p.net.advance(1000); await until(async () => (await settle(5), p.ev(ready)), 300); }
  assert.ok(p.ev(ready), 'players built, terms announced');
  await p.ev('fedPlayRefresh()');
  await settle(10);
  return { p, n };
}
// The node sends more records: the client drops, reconnects and subscribes again.
async function resync(p, n, recs) {
  n.feed = recs.map((r) => ({ rec: r, rcpt: [] }));
  for (const ws of n.socks) ws.drop();
  await settle(10);
  p.net.advance(5000);
  await settle(20);
}
const pid = (name) => 'fp' + key(name).pub.slice(0, 12).replace(/[-_]/g, 'x');

test('another player\'s announce becomes a network your customers ask for, reached over transit until you deal', async () => {
  const { p, n } = await game([ann('alice')]);
  const id = pid('alice');
  assert.equal(p.ev('S.fedn.nets.length'), 1);
  assert.equal(p.ev(`NET['${id}'].name`), 'Ping Floyd');
  assert.deepEqual(json(p, `NET['${id}'].pops`), [], 'no POPs of its own for the computer-run rules');
  assert.deepEqual(json(p, `NET['${id}'].fpops`), ['fra', 'ams', 'lon']);
  p.ev('compute()');
  assert.ok(p.ev(`R.demTo['${id}']`) > 0, 'customers ask for traffic to it');
  assert.ok(Math.abs(p.ev('Object.values(NSH).reduce((a,b)=>a+b,0)') - 1) < 1e-9, 'shares still sum to 1');
  assert.ok(p.ev(`(R.netEg['${id}']||{}).t`) > 0, 'reached over transit');
  assert.equal(p.ev(`!!R.nt['${id}']`), false, 'not without transit yet');
  // This network announces itself: name, ASN of its key, home, POPs and exchanges, published terms.
  p.net.advance(3000); await settle(20);
  assert.ok(await until(async () => (await settle(5), n.puts.some((r) => r.kind === 'announce'))), 'announced');
  const a = n.puts.find((r) => r.kind === 'announce').body;
  assert.equal(a.asn, await p.ev('fedAsn(S.fed.key.pub)'));
  assert.deepEqual(a.ix.sort(), ['ams', 'fra']);
  assert.equal(a.policy, 'open');
  // Its traffic with players goes into stats (the traffic board).
  assert.deepEqual(json(p, 'fedStatsBody().traffic.map(x=>x.key)'), [], 'nothing exchanged directly yet');
  assert.deepEqual(p.errors, []);
});

test('peering on published terms: automatic acceptance binds at once, traffic leaves at the exchange, stats report it', async () => {
  const { p, n } = await game([ann('alice')]);
  const id = pid('alice'), k = key('alice').pub;
  const r = await p.ev(`fedRequest('${k}','peering',{via:'ix'})`);
  assert.equal(r, null);
  const d = json(p, 'S.fed.deals[0]');
  assert.equal(d.deal, 'peering');
  assert.equal(d.st, 'run');
  assert.equal(d.on, true);
  assert.deepEqual(d.terms.at.sort(), ['ams', 'fra']);
  p.ev('compute()');
  assert.ok(p.ev(`(R.netEg['${id}']||{}).ix`) > 0, 'over the exchange');
  assert.equal(p.ev(`!!R.nt['${id}']`), true);
  assert.ok(json(p, 'fedStatsBody().traffic').some((x) => x.key === k && x.in > 0));
  await settle(10);
  // It went out sealed (§5.3): the relay sees to and a box; Alice opens it with this network's box.
  const me = p.ev('S.fed.key.pub'), myBox = await p.ev('fedBoxPub(S.fed.key.priv)');
  assert.ok(await until(async () => (await settle(5), n.puts.some((x) => x.kind === 'offer' && (openRec('alice', x, me, myBox) || {}).deal === 'peering'))), 'the signed offer went out');
  const sent = n.puts.find((x) => x.kind === 'offer');
  assert.deepEqual(Object.keys(sent.body).sort(), ['enc', 'to'], 'nothing of the deal in clear');
  assert.equal(openRec('carol', sent, me, myBox), null, 'a third network cannot open it');
  // Depeering only costs a detour: back over transit, and a signed decline tells them.
  p.ev(`ACT.fpEnd({id:'${d.id}'})`);
  p.ev('compute()');
  assert.equal(p.ev(`!!R.nt['${id}']`), false);
  assert.ok(p.ev(`(R.netEg['${id}']||{}).t`) > 0);
  assert.ok(await until(async () => (await settle(5), n.puts.some((x) => x.kind === 'decline' && (openRec('alice', x, me, myBox) || {}).reason === 'depeer'))));
  assert.deepEqual(p.errors, []);
});

test('a selective policy shows what is missing; transit bought from a player is billed on its terms, under the computer-run ceiling', async () => {
  const sel = ann('bob', { name: 'Hop Dog', policy: 'selective', cond: { minMbps: 1000000, maxRatio: 300, minShared: 3, rpki: true, tier1: false, ai: true },
    rates: { transit: { perGbps: 900, commit: [{ mbps: 10000, off: 100 }], term: 90 } } });
  const { p } = await game([sel]);
  const k = key('bob').pub;
  const miss = json(p, `fedOffer('${k}','peering',{via:'ix'}).miss.map(x=>x.l)`);
  assert.deepEqual(miss, ['mbps', 'ratio', 'shared', 'rpki']);
  assert.match(p.ev(`fedMissText(fedOffer('${k}','peering',{via:'ix'}).miss)`), /1 more shared exchange|more shared exchanges/);
  const r = await p.ev(`fedRequest('${k}','peering',{via:'ix'})`);
  assert.deepEqual(JSON.parse(JSON.stringify(r)).miss.map((x) => x.l), ['mbps', 'ratio', 'shared', 'rpki'], 'nothing is sent while something is missing');
  // Transit on the rate card: the commit discount applies, and it runs at once (auto).
  assert.equal(await p.ev(`fedRequest('${k}','transit',{at:'fra',mbps:10000})`), null);
  const d = json(p, `S.fed.deals.find(x=>x.deal==='transit')`);
  assert.equal(d.terms.perGbps, 810);
  assert.equal(d.role, 'buy');
  p.ev('compute()');
  assert.ok(p.ev('R.cost.fed') >= 810 * 10, 'billed at least the commit');
  assert.equal(p.ev('R.rev.fed||0'), 0, 'a buyer earns nothing from it');
  assert.ok(p.ev(`Object.keys(R.useT).some(x=>x.startsWith('fed:'))`), 'an exit of its own');
  // The editor never publishes a transit price above the computer-run ceiling.
  p.ev("fedTermsApply({pol:'open',rates:{transit:{perGbps:1e9,commit:[],term:90}},auto:{}})");
  assert.equal(p.ev('S.fedp.rates.transit.perGbps'), p.ev('fedCeilMine()'));
  assert.deepEqual(p.errors, []);
});

test('an offer waiting for review queues in the NOC dashboard; accepting starts it and earns the seller in its own game', async () => {
  const { p, n } = await game([ann('alice')]);
  p.ev("fedTermsApply({pol:'open',rates:{pni:{setup:5000,ports:[{mbps:10000,monthly:1500}],term:180}},auto:{pni:'review'}})");
  assert.ok(await until(async () => (await settle(5), p.ev('!!(S.fedp.mine[0]&&S.fedp.mine[0].body.rates.pni)'))), 'terms announced');
  const mine = json(p, 'S.fedp.mine[0]');
  const offer = sealRec('alice', 'offer', p.net.now(), { to: p.ev('S.fed.key.pub'), deal: 'pni', basis: mine.id, terms: { at: 'fra', mbps: 10000, setup: 5000, monthly: 1500, term: 180 } }, p.ev('S.fed.key.pub'), mine.body.box);
  await resync(p, n, [offer]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.rq.length') === 1)), 'waiting for review');
  p.ev("ACT.dash()");
  assert.match(p.ev("$('dash').textContent"), /Ping Floyd/);
  const cash = p.ev('S.cash');
  assert.equal(await p.ev(`fedAcceptRq('${rid(offer)}')`), null);
  const d = json(p, 'S.fed.deals[0]');
  assert.equal(d.role, 'sell');
  assert.equal(d.st, 'run');
  assert.equal(p.ev('S.cash') - cash, 5000, 'the seller earns the setup fee');
  p.ev('compute()');
  assert.equal(p.ev('R.rev.fed'), 1500);
  assert.ok(await until(async () => (await settle(5), n.puts.some((x) => x.kind === 'accept'))));
  assert.deepEqual(p.errors, []);
});

test('a network silent for 40 days goes dark: no demand, deals ended with a notice and no bill; muted ones disappear', async () => {
  const { p } = await game([ann('alice'), ann('carol', { name: 'Carol Net' })]);
  const k = key('alice').pub, id = pid('alice');
  assert.equal(await p.ev(`fedRequest('${k}','peering',{via:'ix'})`), null);
  p.ev(`FED.now=()=>${NOW + 40 * DAY}`);
  await p.ev('fedPlayRefresh()');
  assert.equal(p.ev(`S.fedn.nets.find(x=>x.k==='${k}').st`), 'dark');
  p.ev('compute()');
  assert.equal(p.ev(`NSH['${id}']`), 0);
  assert.equal(p.ev(`R.demTo['${id}']||0`), 0);
  const d = json(p, 'S.fed.deals[0]');
  assert.equal(d.st, 'over');
  assert.equal(d.why, 'quiet');
  assert.ok(p.ev("S.log.some(e=>/gone dark/.test(e.t))"), 'a NOC notice');
  // Muting takes a network off this game.
  p.ev(`FED.now=()=>${NOW}`);
  p.ev(`fedMute('${key('carol').pub}',true)`);
  await p.ev('fedPlayRefresh()');
  assert.equal(p.ev(`!!NET['${pid('carol')}']`), false);
  assert.deepEqual(p.errors, []);
});

test('the snapshot is in the save: an old save loads, a broken one is repaired, routing comes back with it', async () => {
  const { p } = await game([ann('alice')]);
  const id = pid('alice');
  const txt = p.ev('JSON.stringify(S)');
  p.ev(`(()=>{const s=JSON.parse(${JSON.stringify(txt)});s.fedn.nets.push({k:'nope'},null);s.fedp.rq=[{id:'x'}];s.fed.deals.push({id:'bad'});migrate(s);window.__s=s;})()`);
  assert.equal(p.ev('__s.fedn.nets.length'), 1);
  assert.equal(p.ev('__s.fedp.rq.length'), 0);
  const old = p.ev(`(()=>{const s=JSON.parse(${JSON.stringify(txt)});delete s.fedn;delete s.fedp;migrate(s);return s.fedn===null&&s.fedp===null;})()`);
  assert.equal(old, true, 'a save from before stays without');
  p.ev('S.fedn=null;compute()');
  assert.equal(p.ev(`!!NET['${id}']`), false, 'gone from routing with the snapshot');
  p.ev(`S.fedn=__s.fedn;compute()`);
  assert.equal(p.ev(`!!NET['${id}']`), true);
  assert.deepEqual(p.errors, []);
});

test('a capacity swap carries your traffic while your cable is cut; a consortium is funded once enough sign', async () => {
  const { p, n } = await game([ann('alice', { auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'auto', consortium: 'review', port: 'auto' } })]);
  const k = key('alice').pub;
  p.ev("S.links.push({id:'L1',a:'fra',b:'ams',kind:'wave',border:false,premium:false,tier:1,km:kmBetween('fra','ams'),sub:false,cable:null,mo:100,mult:1,trench:'L1',cut:0,day:S.day});compute()");
  assert.equal(await p.ev(`fedRequest('${k}','swap',{at:'ams|fra',mbps:100000})`), null);
  p.ev('S.links.find(l=>l.id===\'L1\').cut=S.day+10;dayTick()');
  assert.ok(p.ev("S.links.some(l=>l.fsw)"), 'the partner\'s wave appeared');
  assert.ok(p.ev("S.log.some(e=>/carrying your traffic/.test(e.t))"));
  p.ev("S.links.find(l=>l.id==='L1').cut=0;dayTick()");
  assert.equal(p.ev("S.links.some(l=>l.fsw)"), false, 'gone once the cable is back');
  // A consortium cable opened by Alice: two more signers fund it, and this game lays its own fibre pairs.
  // Its share is the honest one (fedConsShare): a lower share would cost this member the honest price anyway.
  const share = p.ev("fedConsShare('fra','nyc',2)");
  const off = rec('alice', 'offer', NOW, { deal: 'consortium', terms: { name: 'Brine Line FRA–NYC', a: 'fra', b: 'nyc', members: 3, share, pairs: 2 } });
  await resync(p, n, [off]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.cons.length') === 1)), 'the project is listed');
  const cash = p.ev('S.cash');
  assert.equal(await p.ev(`fedConsJoin('${rid(off)}')`), null);
  assert.equal(p.ev('S.fedp.cons[0].st'), 'open');
  await resync(p, n, [rec('carol', 'accept', NOW + 10, { offer: rid(off), to: k })]);
  assert.ok(await until(async () => (await settle(5), p.ev('S.fedp.cons[0].st') === 'funded')), 'funded');
  assert.equal(cash - p.ev('S.cash'), share, 'this member paid its own share');
  assert.ok(p.ev("S.links.some(l=>l.seat&&l.cname==='Brine Line FRA–NYC'&&l.pairs===2)"));
  assert.deepEqual(p.errors, []);
});

test('the players card and a player\'s sheet render at phone width, the traceroute names player networks', async () => {
  const { p } = await game([ann('alice')]);
  const k = key('alice').pub, id = pid('alice');
  p.ev('innerWidth=360;innerHeight=640;UI.left=\'nets\';UI.leftOpen=true;renderAll()');
  assert.match(p.ev("$('leftBody').textContent"), /Players[\s\S]*Ping Floyd/);
  p.ev(`ACT.fpNet({key:'${k}'})`);
  assert.match(p.ev("$('modal').textContent"), /Ask for[\s\S]*Peering/);
  p.ev('ACT.fpTerms()');
  assert.match(p.ev("$('modal').textContent"), /Peering policy/);
  p.ev("ACT.fpEdit({f:'pol',v:'selective'})");
  assert.match(p.ev("$('modal').textContent"), /Shared exchanges/);
  assert.equal(await p.ev(`fedRequest('${k}','peering',{via:'ix'})`), null);
  const t = json(p, `traceroute('fra',{net:'${id}'},'normal')`);
  assert.match(t.text, /Ping Floyd/);
  assert.match(t.why, /exchange|IX/i);
  assert.deepEqual(p.errors, []);
});

test('a shunned network goes dark at once with a notice; a shared leak hits partners without RPKI and stops at those who filter', async () => {
  const { p } = await game([ann('alice')]);
  const k = key('alice').pub;
  assert.equal(await p.ev(`fedRequest('${k}','peering',{via:'ix'})`), null);
  // A real day on which the federation's leak comes from Alice, as every game that knows both networks works it out.
  const D = p.ev(`(()=>{const me=S.fed.key.pub;for(let d=20400;d<23000;d++)if(hstr('leak|'+d)%FEDP_LEAK===0&&hstr(d+'|${k}')<hstr(d+'|'+me))return d;return 0;})()`);
  assert.ok(D > 0);
  p.ev(`S.fedp.rpki=true;fedLeakCheck(S,${D * DAY + 100})`);
  assert.ok(p.ev("S.log.some(e=>/RPKI filters dropped it/.test(e.t))"), 'contained by filtering');
  assert.equal(p.ev('!!(S.ev.leak&&S.ev.leak.until>S.day)'), false);
  p.ev(`S.fedp.rpki=false;S.fedp.leakD=0;fedLeakCheck(S,${D * DAY + 100})`);
  assert.equal(p.ev('S.ev.leak.until>S.day'), true, 'without filtering it spreads here');
  assert.ok(p.ev("S.inc.some(i=>i.type==='leak')"));
  // Shunned by the federation: dark at once, deals ended with a notice that says why.
  p.ev(`fedExcl=async()=>({keys:new Set(['${k}']),ok:new Set(['${k}']),by:new Map([['${k}',[{srv:'a',url:'wss://a.example'},{srv:'b',url:'wss://b.example'}]]]),n:2,why:new Map()})`);
  await p.ev('fedPlayRefresh()');
  assert.equal(p.ev(`S.fedn.nets[0].st`), 'dark');
  assert.equal(p.ev('S.fed.deals[0].why'), 'excluded');
  assert.ok(p.ev("S.log.some(e=>/federation excluded/.test(e.t))"));
  assert.deepEqual(p.errors, []);
});

test('an AI player joins once it has declared itself, and AI networks carry the robot badge', { skip: 'timing-dependent on slow CI machines; to be made deterministic (4.0.0)' }, async () => {
  const p = fedPage({ agent: true });
  const n = p.net.node(URL1);
  n.feed = [{ rec: ann('alice'), rcpt: [] }];
  p.ev('ACT.start({})');
  await assert.rejects(async () => p.ev(`apiFedJoin({url:'${URL1}'})`), /declare the model first/);
  p.ev("apiFedDeclare({model:'example-model-1'})");
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev(`apiFedJoin({url:'${URL1}'})`))), { joined: URL1 });
  assert.equal(p.ev('S.fed.on'), true);
  assert.equal(p.ev("API_PLAYER_OWNS.apiFedJoin"), 1, 'never in the player\'s own tab');
  // Waits for Alice's network itself, not a fixed number of turns: CI machines are slower.
  for (let i = 0; i < 200 && !p.ev('S.fedn&&S.fedn.nets.length'); i++) { p.net.advance(1500); await settle(30); }
  assert.ok(p.ev('S.fedn&&S.fedn.nets.length'), "Alice's network arrived");
  // Alice's stats say she is an AI: her network shows with the robot badge.
  p.ev('S.fedn.nets[0].ai=true;S.fedn.h=fedNetsHash(S.fedn.nets);compute();UI.left=\'nets\';UI.leftOpen=true;renderAll()');
  assert.match(p.ev("$('leftBody').textContent"), /🤖 Ping Floyd/);
  assert.deepEqual(p.errors, []);
});

test('an exchange lists the players on it with a Peer button; peering from there runs, other exchanges say to get a port', async () => {
  const { p } = await game([ann('alice', { name: 'Ping Floyd' }), ann('bob', { name: 'Packet Lunch', ix: ['lon'], auto: { peering: 'review', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' } })]);
  const ka = key('alice').pub;
  const panel = (c) => p.ev(`(()=>{const d=document.createElement('div');d.innerHTML=ixBlock('${c}',false);return d.innerHTML;})()`);
  // Frankfurt: this game has a port, Alice is there and accepts peering at once; Bob is not there.
  let h = panel('fra');
  assert.match(h, /Players at this exchange/);
  assert.match(h, /Ping Floyd/);
  assert.doesNotMatch(h, /Packet Lunch/);
  assert.match(h, /peering requests accepted at once/);
  assert.match(h, new RegExp(`data-act="fpReq"[^>]*${ka.slice(0, 10)}`), 'a Peer button for Alice');
  // London: no port of ours, Bob is there: listed, no Peer button, told to get a port.
  h = panel('lon');
  assert.match(h, /Packet Lunch/);
  assert.match(h, /Get a port here to peer with them/);
  assert.doesNotMatch(h, /data-act="fpReq"/);
  // Peering from the button: running at once (Alice's policy), and the row says so.
  await p.ev(`ACT.fpReq({key:'${ka}',deal:'peering',via:'ix',at:'fra'})`);
  await settle(10);
  const d = json(p, 'S.fed.deals[0]');
  assert.equal(d.st, 'run');
  assert.deepEqual(d.terms.at, ['fra']);
  h = panel('fra');
  assert.match(h, /tag st on">peering</);
  assert.doesNotMatch(h, /data-act="fpReq"/);
  // A save that never joined shows no such section.
  const q = fedPage();
  q.ev("ACT.start({});S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyIx({city:'fra',tier:1,signed:1})");
  assert.doesNotMatch(q.ev(`ixBlock('fra',false)`), /Players at this exchange/);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(q.errors, []);
});

test('a player asking to peer under review is reviewed from the exchange in the review queue', async () => {
  const { p } = await game([ann('alice', { name: 'Ping Floyd' })]);
  const ka = key('alice').pub;
  p.ev(`S.fedp.rq.push({id:'${'Q'.repeat(43)}',rec:{key:'${ka}',kind:'offer',t:${NOW},body:{deal:'peering',to:S.fed.key.pub,terms:{via:'ix',at:['fra']}}}})`);
  const h = p.ev(`ixBlock('fra',false)`);
  assert.match(h, /data-act="fpQueue"/, 'Review opens the review queue, where requests are accepted');
  assert.deepEqual(p.errors, []);
});
