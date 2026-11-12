// The federation worker (88-fed-worker.js): records from nodes, ranking spot checks and registry entries are checked
// in a worker of their own, in one batch per page or answer, and what is kept is kept on the page as before. jsdom has
// no Worker, so a fake one stands in (FW.make): it runs the same batch functions, after a copy of the message, in a
// later task, like a real one. Without it (every other test) the same functions run on the page.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, SERVERS_JSON, PL, rec, rid, key, asn, box, canon, signText, sealRec } = require('./helpers/fed');

const slotOf = (t) => t - (t % 300);
const ann = (name, t = NOW - 60) => rec(name, 'announce', t, { name: 'Ping Floyd', asn: asn(key(name).pub), box: box(name), home: 'DE', day: 400, founded: 20000, pops: ['fra', 'ams'], ix: ['fra'], cust: 30,
  mix: { content: 600, eyeball: 300, enterprise: 100 }, traffic: { in: 40000, out: 90000 }, policy: 'open', rates: {},
  auto: { peering: 'auto', transit: 'auto', pni: 'review', swap: 'review', consortium: 'review', port: 'auto' } });
const stats = (name, t, pops) => rec(name, 'stats', t, { mode: 'normal', pops, traffic: [], tier1: false, shareCountry: false });
function rcpt(r, t) {
  const x = { v: 1, kind: 'receipt', key: key('node1').pub, t: slotOf(t), body: { rec: rid(r), server: PL.id } };
  x.sig = signText(key('node1'), canon(x));
  return x;
}
// The fake worker: every message copied (as postMessage would), answered in a later task by the batch functions.
// fail: 'crash' (the worker reports an error instead of answering) or 'post' (posting throws).
const FAKE = `FW.force=true;window.__fw={batches:[],fail:null,made:0};
FW.make=()=>{__fw.made++;const w={postMessage(m){const c=JSON.parse(JSON.stringify(m));__fw.batches.push(c.op+':'+(c.a.items||c.a.entries).length);
  if(__fw.fail==='post')throw new Error('gone');
  setTimeout(()=>{if(__fw.fail==='crash'){w.onerror({message:'crash'});return;}
    Promise.resolve().then(()=>FW_OPS[c.op](c.a)).then(r=>w.onmessage({data:JSON.parse(JSON.stringify({fw:c.fw,r}))}),e=>w.onmessage({data:{fw:c.fw,err:String(e)}}));},0);},
  terminate(){w.gone=true;}};return w;};`;
const json = (p, x) => JSON.parse(p.ev(`JSON.stringify(${x})`));
const tampered = () => { const r = ann('dave'); r.body.cust = 31; return r; };

async function joined(feed, fail = null) {
  const p = fedPage({ registry: SERVERS_JSON }), n = p.net.node(URL1);
  n.feed = feed;
  p.ev(FAKE);
  if (fail) p.ev(`__fw.fail=${JSON.stringify(fail)}`);
  assert.equal(await joinGame(p), null);
  assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')), 'connected');
  return { p, n };
}
const known = (p) => p.ev('fedNetworks().then(l=>JSON.stringify(l.map(n=>n.key).sort()))').then(JSON.parse);

test('records from a sub are checked in the worker, one batch per page, and kept on the page in order', async () => {
  const feed = [ann('alice'), stats('alice', NOW - 600, { fra: 2 }), tampered(), ann('bob'), 'not an item'].map((r) => (typeof r === 'string' ? r : { rec: r, rcpt: [rcpt(r, r.t)] }));
  const { p } = await joined(feed);
  assert.ok(await until(async () => (await settle(5), (await known(p)).length === 2)), 'alice and bob kept');
  assert.deepEqual(await known(p), [key('alice').pub, key('bob').pub].sort(), 'the tampered record is dropped');
  const fw = json(p, '__fw'), st = json(p, 'FW.stat');
  assert.equal(fw.made, 1, 'one worker for the session');
  assert.ok(fw.batches.includes('items:5'), `the page went over as one batch: ${fw.batches}`);
  assert.ok(fw.batches.some((b) => b.startsWith('reg:')), 'the registry was checked there too');
  assert.equal(st.local, 0, 'nothing checked on the page');
  // The board slot comes from the receipt, worked out in the worker.
  const heard = await p.ev(`fedGet('ann',${JSON.stringify(key('alice').pub)}).then(o=>o.heard)`);
  assert.equal(heard, slotOf(NOW - 60));
  assert.equal(p.ev('FED.live.fed.servers.length'), 1);
  assert.ok(await p.ev(`fedGet('kv','cursor:'+${JSON.stringify(URL1)}+'#'+S.fed.key.pub)`), 'the page cursor is kept once its records are');
});

test('sealed deals for this player are opened on the page, never in the worker', async () => {
  const p0 = fedPage(), n0 = p0.net.node(URL1);
  p0.ev(FAKE);
  assert.equal(await joinGame(p0), null);
  assert.ok(await until(async () => (await settle(5), p0.ev('fedStatus().state') === 'connected')));
  const mine = p0.ev('S.fed.key.pub'), myBox = await p0.ev('fedBoxPub(S.fed.key.priv)');
  const offer = sealRec('alice', 'offer', NOW - 30, { to: mine, deal: 'peering', basis: rid(ann('alice')), terms: { at: ['fra'], via: 'ix' } }, mine, myBox);
  p0.ev('window.__deals=[];fedOn("deal",e=>__deals.push(e.rec.body.deal))');
  n0.feed = [ann('alice'), offer].map((r) => ({ rec: r, rcpt: [rcpt(r, r.t)] }));
  for (const ws of n0.socks) ws.drop();
  await settle(10);
  p0.net.advance(5000);
  assert.ok(await until(async () => (await settle(5), p0.ev('__deals.length') === 1)), 'the offer was opened');
  assert.deepEqual(json(p0, '__deals'), ['peering']);
  // What the worker saw: records and receipts only, never this network's seed.
  const sent = p0.ev('JSON.stringify(__fw.batches)');
  assert.ok(!sent.includes(p0.ev('S.fed.key.priv')), 'no seed in any batch');
});

test('a worker that fails: its batch and every one after are checked on the page instead', async () => {
  for (const fail of ['crash', 'post']) {
    const feed = [ann('alice'), ann('bob')].map((r) => ({ rec: r, rcpt: [rcpt(r, r.t)] }));
    const { p } = await joined(feed, fail);
    assert.ok(await until(async () => (await settle(5), (await known(p)).length === 2)), `${fail}: both kept`);
    assert.equal(p.ev('FW.dead'), true, `${fail}: given up`);
    assert.ok(p.ev('FW.stat.local') >= 1, `${fail}: done on the page`);
    assert.equal(p.ev('FW.w'), null);
  }
});

test('a ranking spot check works its row out in the worker, with the same verdict', async () => {
  const t0 = NOW - 3600, A = key('alice').pub, recs = { [A]: stats('alice', t0, { fra: 2 }) };
  const row = (k, value, rank) => ({ rank, key: k, value, asn: 4200000001, ai: false });
  const check = (p) => p.ev(`(async()=>{const c=FED.live.conns.get(${JSON.stringify(URL1)}),req=fedRankReq({board:'pops'},[]);
    return fedRankCheck(c,req,fedRanksOk(await fedAskRetry(c,req)));})()`);
  for (const [value, want] of [[2, true], [9, false]]) {
    const p = fedPage({ registry: SERVERS_JSON }), n = p.net.node(URL1);
    p.ev(FAKE);
    n.ranks = { slot: slotOf(NOW), n: 1, rows: [row(A, value, 1)], me: null };
    n.why = (f) => ({ slot: slotOf(NOW), items: recs[f.key] ? [{ rec: recs[f.key], rcpt: [rcpt(recs[f.key], t0)] }] : [] });
    assert.equal(await joinGame(p), null);
    assert.ok(await until(async () => (await settle(5), p.ev('fedStatus().state') === 'connected')));
    assert.equal(await check(p), want, `value ${value}`);
    assert.ok(json(p, '__fw.batches').includes('why:1'), 'the row was worked out in the worker');
    assert.equal(p.ev('FW.stat.local'), 0);
  }
});

test('a save that never joins never makes the worker; tests without Worker check on the page', async () => {
  const p = fedPage();
  p.ev(FAKE);
  p.ev('ACT.start({})');
  await settle(10);
  assert.equal(p.ev('__fw.made'), 0, 'no worker for a solo game');
  const q = fedPage({ registry: SERVERS_JSON }), n = q.net.node(URL1);
  n.feed = [ann('alice')].map((r) => ({ rec: r, rcpt: [rcpt(r, r.t)] }));
  assert.equal(await joinGame(q), null);
  assert.ok(await until(async () => (await settle(5), (await known(q)).length === 1)));
  assert.equal(q.ev('FW.w'), null, 'no Worker in jsdom: none made');
  assert.ok(q.ev('FW.stat.local') >= 2, 'the registry and the page checked here');
});
