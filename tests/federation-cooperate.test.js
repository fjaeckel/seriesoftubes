// Nudges towards working with other players (89-fedplay-suggest.js): "Worth peering with" lists the players this
// network reaches over transit, with the transit bill peering would save and where the two can meet; on-net growth
// gives a player you peer with directly more of your customers' demand, ramping to twice as much over 30 days, kept in
// the save so routing reads it. Fake nodes, a virtual clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const { advanceUntil, fedPage, joinGame, settle, until, URL1, NOW, rec, key, asn, box } = require('./helpers/fed');

const DAY = 86400;
function ann(name, over = {}, t = NOW - 60) {
  const k = key(name);
  return rec(name, 'announce', t, { name: over.name || 'Ping Floyd', asn: asn(k.pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams', 'lon'], ix: ['fra', 'ams'], cust: 30,
    mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {},
    auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' }, ...over });
}
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const pid = (name) => 'fp' + key(name).pub.slice(0, 12).replace(/[-_]/g, 'x');
// A joined game at Frankfurt with broadband, transit and a port at the exchange, and a POP in Amsterdam.
async function game(feed) {
  const p = fedPage(), n = p.net.node(URL1);
  n.feed = feed.map((r) => ({ rec: r, rcpt: [] }));
  assert.equal(await joinGame(p), null);
  p.ev('S.fed.joined-=100');
  p.ev("S.cash=1e8;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:1});ACT.buildPop({city:'ams'})");
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')), 'connected');
  const nets = feed.filter((r) => r.kind === 'announce').length;
  assert.ok(await advanceUntil(p, () => p.ev(`!!(S.fedn&&S.fedn.nets.length===${nets}&&S.fedp&&S.fedp.mine.length)`), { step: 1000, max: 60000 }), 'players built');
  await p.ev('fedPlayRefresh()');
  await settle(10);
  p.ev('compute()');
  return { p, n };
}

test('worth peering with: a player reached over transit, what peering saves and where to meet; gone once you peer', async () => {
  const { p } = await game([ann('alice')]);
  const ka = key('alice').pub, id = pid('alice');
  assert.ok(p.ev(`(R.netEg['${id}']||{}).t`) > 0, 'Alice is reached over transit');
  const l = json(p, 'fedSuggest()');
  assert.equal(l.length, 1);
  assert.equal(l[0].k, ka);
  assert.ok(l[0].g > 0, 'the traffic over transit');
  assert.ok(l[0].saved >= 0);
  assert.deepEqual(l[0].ix, ['fra'], 'both are on the Frankfurt exchange');
  assert.ok(l[0].pops.includes('ams'), 'and both have a POP in Amsterdam');
  // The saving is the real transit bill now minus the bill with that much less over transit.
  const want = p.ev(`(()=>{const g=${l[0].g},t=S.transit[0],q=R.p95[t.id];return transitMo(t,q)-transitMo(t,Math.max(0,q-g));})()`);
  assert.ok(Math.abs(l[0].saved - want) < 1e-6, 'priced with the real billing');
  // Shown in the Multimode sheet and the dashboard's players card, a tap opening Alice's sheet.
  p.ev("ACT.fuOpen({v:'home'})");
  const h = p.ev("$('modalCard').innerHTML");
  assert.match(h, /Worth peering with/);
  assert.match(h, /Ping Floyd/);
  assert.match(h, /over transit/);
  assert.match(h, /both at Frankfurt/);
  assert.match(h, new RegExp(`data-act="fpNet"[^>]*${ka.slice(0, 10)}`));
  p.ev('closeModal()');
  assert.match(p.ev('fedPlayCard()'), /Worth peering with/);
  // Peering with her: no longer suggested, and nothing else is.
  await p.ev(`ACT.fpReq({key:'${ka}',deal:'peering',via:'ix',at:'fra'})`);
  await settle(10);
  p.ev('compute()');
  assert.equal(p.ev('S.fed.deals[0].st'), 'run');
  assert.deepEqual(json(p, 'fedSuggest()'), []);
  assert.doesNotMatch(p.ev('fedPlayCard()'), /Worth peering with/);
  assert.deepEqual(p.errors, []);
});

test('a player with no exchange or city in common, or dark, is not suggested', async () => {
  const { p } = await game([ann('alice', { pops: ['syd'], ix: ['syd'] }), ann('bob', { name: 'Packet Lunch' })]);
  const l = json(p, 'fedSuggest()').map((x) => x.k);
  assert.ok(!l.includes(key('alice').pub), 'no place to meet Alice');
  assert.ok(l.includes(key('bob').pub));
  p.ev(`S.fedn.nets.find(n=>n.k==='${key('bob').pub}').st='dark';FEDS=null`);
  assert.deepEqual(json(p, 'fedSuggest()'), []);
  assert.deepEqual(p.errors, []);
});

test('on-net growth: peering directly ramps a player\'s demand up to twice over 30 days, kept in the save, mutual and undone', async () => {
  const { p } = await game([ann('alice')]);
  const ka = key('alice').pub, id = pid('alice');
  const share0 = p.ev(`NSH['${id}']`), dem0 = p.ev(`R.demTo['${id}']`);
  assert.equal(p.ev('S.fedn.nets[0].b'), 0);
  // Alice's sheet says what a direct deal would bring.
  p.ev(`fedNetModal('${ka}')`);
  assert.match(p.ev("$('modalCard').textContent"), /up to twice the traffic within 30 days/);
  p.ev('closeModal()');
  await p.ev(`ACT.fpReq({key:'${ka}',deal:'peering',via:'ix',at:'fra'})`);
  await settle(10);
  // Fifteen days in: half way, +50%.
  p.ev(`S.fed.deals[0].start=fedNow()-15*${DAY}`);
  await p.ev('fedPlayRefresh()');
  await settle(10);
  p.ev('compute()');
  assert.equal(p.ev('S.fedn.nets[0].b'), 500);
  assert.ok(Math.abs(p.ev(`NSH['${id}']`) / share0 - 1.5) < 0.01, 'half again the share');
  assert.ok(p.ev(`R.demTo['${id}']`) > dem0 * 1.3, 'your customers ask for more of her');
  assert.ok(Math.abs(p.ev('Object.values(NSH).reduce((a,b)=>a+b,0)') - 1) < 1e-9, 'out of the others\' shares: shares still sum to 1');
  p.ev(`fedNetModal('${ka}')`);
  assert.match(p.ev("$('modalCard').textContent"), /On-net growth \+50%.*Peering for 15 days/);
  p.ev('closeModal()');
  // Forty days in: capped at twice.
  p.ev(`S.fed.deals[0].start=fedNow()-40*${DAY}`);
  await p.ev('fedPlayRefresh()');
  await settle(10);
  assert.equal(p.ev('S.fedn.nets[0].b'), 1000);
  assert.ok(Math.abs(p.ev(`NSH['${id}']`) / share0 - 2) < 0.01);
  // It is in the save: a reload routes the same.
  assert.equal(p.ev('fednClean(JSON.parse(JSON.stringify(S.fedn))).nets[0].b'), 1000);
  // Depeering: back to the plain share at the next look.
  p.ev('ACT.fpEnd({id:S.fed.deals[0].id})');
  await p.ev('fedPlayRefresh()');
  await settle(10);
  p.ev('compute()');
  assert.equal(p.ev('S.fedn.nets[0].b'), 0);
  assert.ok(Math.abs(p.ev(`NSH['${id}']`) / share0 - 1) < 0.01);
  assert.deepEqual(p.errors, []);
});

test('an old or tampered save: the boost is checked like the rest of the snapshot', () => {
  const p = fedPage();
  const clean = (b) => p.ev(`fednClean({nets:[{k:'${key('alice').pub}',name:'Ping Floyd',asn:4200000001,pops:['fra'],ix:[],mix:[600,300,100]${b === undefined ? '' : ',b:' + JSON.stringify(b)}}]}).nets[0].b`);
  assert.equal(clean(undefined), 0, 'a save from before has none');
  assert.equal(clean(450), 450);
  assert.equal(clean(5000), 0, 'over twice: dropped');
  assert.equal(clean(-50), 0);
  assert.equal(clean('lots'), 0);
  assert.deepEqual(p.errors, []);
});
