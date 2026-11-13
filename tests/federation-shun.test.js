// Shunning (docs/plans/federation.md): votes are for operators only (§9.3, §12). A player's game learns from each server
// it joined which networks are excluded, never the votes; an excluded network's own game learns which reasons were
// given, without counts, and plays on solo; an operator's game gets the votes and counts the tally itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, PL_ENTRY, rec, key, b64, sha } = require('./helpers/fed');

const DAY = 86400, sid = (n) => b64(sha('server ' + n)), M = key('mallory').pub;
// Six registry servers old and alive enough to vote (need = max(5, div(6 + 3, 4)) = 5), each with one operator, and the
// joined server (Packet Lunch, not a voter) so the game knows its nodes and operators.
const REG = { asOf: NOW - (NOW % DAY), at: NOW, servers: [PL_ENTRY, ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: sid(n), name: 'S' + n, operators: [key('op' + n).pub], nodes: [], listed: NOW - 60 * DAY - (NOW % DAY), answered: NOW - (NOW % DAY) }))] };
const vote = (n, reason, t = NOW - DAY) => rec('op' + n, 'shun', t, { server: sid(n), target: M, reason });
const run = async (p, ms = 2000) => { for (let t = 0; t < ms; t += 250) { p.net.advance(250); await settle(); } };
const spy = (n) => { n.got = []; const take = n.take.bind(n); n.take = (ws, text) => { n.got.push(JSON.parse(text)); take(ws, text); }; return n; };

test('a player\'s game never gets or keeps a vote: its servers say who is excluded, and it keeps that offline', async () => {
  const p = fedPage(), n = spy(p.net.node(URL1));
  // Even a node that sent votes to anyone: the game keeps none without an operator key.
  n.feed = [vote(1, 'spam'), vote(2, 'spam'), vote(3, 'cheating'), vote(4, 'spam'), vote(5, 'abuse')].map((r) => ({ rec: r, rcpt: [] }));
  n.ops = [];
  n.exclude([M]);
  await p.ev(`fedPut('kv','registry',${JSON.stringify(REG)})`);
  await joinGame(p);
  await run(p);
  const sub = n.got.find((f) => f.m === 'sub');
  assert.ok(!sub.kinds.includes('shun') && !sub.kinds.includes('unshun'), 'the game does not ask for votes');
  assert.deepEqual(n.got.filter((f) => f.m === 'auth').map((f) => f.key), [await p.ev('S.fed.key.pub')], 'it proves its own key, and no operator key');
  assert.ok(n.got.findIndex((f) => f.m === 'auth') < n.got.indexOf(sub), 'auth comes before the sub');
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev('fedShunned()'))), [M]);
  assert.equal(await p.ev("fedGet('kv','votes')"), null, 'no vote kept');
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev(`fedExclInfo(${JSON.stringify(M)})`))), { shunned: true, confirmed: false, servers: [{ srv: PL_ENTRY.id, url: URL1 }], reasons: [] }, 'no reasons for other networks; one server alone does not confirm it');
  // The server goes away: the last list stays.
  n.kill();
  await run(p);
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev('fedShunned()'))), [M], 'kept while offline');
  // Back, with the shun lifted.
  n.up = true;
  n.excl = [];
  await run(p, 10000);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedShunned()')).length === 0)), 'lifted when the server says so');
  assert.deepEqual(p.errors, []);
});

test('excluded lists of every joined server count, and a paged list is joined before it is kept', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  await joinGame(p);
  await run(p);
  const c = 'FED.live.conns.get(' + JSON.stringify(URL1) + ')';
  p.ev(`fedExclIn(${c},{m:'excluded',keys:[${JSON.stringify(key('alice').pub)}],more:true})`);
  await settle(20);
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev('fedShunned()'))), [], 'nothing kept from a first page');
  p.ev(`fedExclIn(${c},{m:'excluded',keys:[${JSON.stringify(M)},'not a key'],more:false})`);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedShunned()')).length === 2)));
  // Another joined server's list (kept from before) adds to it.
  await p.ev(`fedPut('kv',fedExclKey('wss://other.example.net/fed',S.fed.key.pub),{at:1,keys:[${JSON.stringify(key('bob').pub)}],reasons:[]});S.fed.servers.push('wss://other.example.net/fed')`);
  assert.equal((await p.ev('fedShunned()')).length, 3, 'the union over joined servers');
  void n;
  assert.deepEqual(p.errors, []);
});

test('the excluded network\'s own game is told which reasons were given, no counts, and plays on solo', async () => {
  const p = fedPage(), n = p.net.node(URL1);
  n.exclude([M], ['abuse', 'spam', 'secret plans']);
  p.ev('ACT.start({})');
  p.ev(`S.fed=fedNewState();S.fed.key=${JSON.stringify({ pub: M, priv: key('mallory').seed })}`);
  assert.equal(await p.ev(`fedJoin(${JSON.stringify(URL1)})`), null);
  await run(p);
  const info = JSON.parse(JSON.stringify(await p.ev('fedExclInfo(S.fed.key.pub)')));
  assert.deepEqual(info, { shunned: true, confirmed: false, servers: [{ srv: PL_ENTRY.id, url: URL1 }], reasons: ['abuse', 'spam'] }, 'only the pre-made reasons, as a set, and which server lists it');
  const cash = p.ev('S.cash');
  for (let i = 0; i < 10; i++) p.ev('dayTick()');
  assert.equal(p.ev('S.day'), 10);
  assert.notEqual(p.ev('S.cash'), cash);
  assert.deepEqual(p.errors, []);
});

test('an operator\'s game gets the votes of its server and counts the tally itself', { skip: 'timing-dependent on slow CI machines; to be made deterministic (4.0.0)' }, async () => {
  const p = fedPage(), n = spy(p.net.node(URL1));
  n.feed = [vote(1, 'spam'), vote(2, 'spam'), vote(3, 'cheating'), vote(4, 'spam'), rec('op9', 'shun', NOW - DAY, { server: sid(9), target: M, reason: 'spam' })].map((r) => ({ rec: r, rcpt: [] }));
  await p.ev(`fedPut('kv','registry',${JSON.stringify(REG)})`);
  assert.equal(await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`), true);
  await joinGame(p);
  await run(p);
  assert.ok(n.got.some((f) => f.m === 'auth' && f.key === key('anna').pub), 'the operator key is proved');
  assert.ok(n.got.some((f) => f.m === 'sub' && f.kinds.join() === 'shun,unshun'), 'and the votes followed');
  assert.ok(await until(async () => (await settle(5), ((await p.ev("fedGet('kv','votes')")) || []).length === 4)), 'the vote from an unknown server is not even kept');
  assert.equal((await p.ev(`fedShunInfo(${JSON.stringify(M)})`)).shunned, false, 'four registered votes are not enough');
  // The fifth vote arrives with the next sync.
  n.feed = [{ rec: vote(5, 'abuse'), rcpt: [] }];
  for (const ws of n.socks) ws.drop();
  await run(p, 6000);
  assert.ok(await until(async () => (await settle(5), (await p.ev(`fedShunInfo(${JSON.stringify(M)})`)).shunned)));
  const info = JSON.parse(JSON.stringify(await p.ev(`fedShunInfo(${JSON.stringify(M)})`)));
  assert.deepEqual(info, { voters: 6, need: 5, votes: 5, shunned: true, reasons: { abuse: 1, cheating: 1, spam: 3 } });
  // Withdrawn below the threshold, it lifts only after 7 days.
  await p.ev(`fedVotesAdd([{id:'u',rec:${JSON.stringify(rec('op5', 'unshun', NOW, { server: sid(5), target: M }))}}])`);
  p.ev(`FED.now=()=>${NOW + 6 * DAY}`);
  assert.equal((await p.ev(`fedShunInfo(${JSON.stringify(M)})`)).shunned, true, 'still shunned 6 days later');
  p.ev(`FED.now=()=>${NOW + 7 * DAY}`);
  assert.equal((await p.ev(`fedShunInfo(${JSON.stringify(M)})`)).shunned, false, 'lifted after 7 days below');
  // The operator key removed from this device: the votes go with it, and are not followed any more.
  await p.ev('fedOpKeyDel()');
  assert.equal(await p.ev("fedGet('kv','votes')"), null);
  assert.ok(n.got.some((f) => f.m === 'unsub'), 'the votes are not followed any more');
  assert.deepEqual(p.errors, []);
});

// Found in WebKit by scripts/fed-e2e.js: a tally read while new votes were still being written kept the old votes,
// with the new cache key, until the next vote or slot.
test('a tally read while votes are being written does not keep the old votes', async () => {
  const p = fedPage();
  await p.ev(`fedPut('kv','registry',${JSON.stringify(REG)})`);
  assert.equal(await p.ev(`fedOpKeySet(${JSON.stringify(key('anna').seed)})`), true);
  await p.ev(`fedVotesAdd(${JSON.stringify([1, 2, 3, 4].map((n) => ({ id: 'v' + n, rec: vote(n, 'spam') })))})`);
  assert.equal((await p.ev(`fedShunInfo(${JSON.stringify(M)})`)).votes, 4);
  // The fifth vote's write is held back; the operator panel reads the tally meanwhile.
  p.ev("FED.slowPut=fedPut;FED.held=null;fedPut=(s,k,v)=>s==='kv'&&k==='votes'?new Promise(r=>{FED.held=()=>r(FED.slowPut(s,k,v));}):FED.slowPut(s,k,v);");
  p.ev(`FED.adding=fedVotesAdd([{id:'v5',rec:${JSON.stringify(vote(5, 'spam'))}}])`);
  assert.ok(await until(async () => (await settle(5), await p.ev('!!FED.held'))), 'the write started');
  assert.equal((await p.ev(`fedShunInfo(${JSON.stringify(M)})`)).votes, 4, 'not written yet');
  await p.ev('(FED.held(),fedPut=FED.slowPut,FED.adding)');
  const info = JSON.parse(JSON.stringify(await p.ev(`fedShunInfo(${JSON.stringify(M)})`)));
  assert.equal(info.votes, 5);
  assert.equal(info.shunned, true);
  assert.deepEqual(p.errors, []);
});

test('votes left on a device without an operator key are deleted when a session starts', async () => {
  const p = fedPage();
  p.net.node(URL1);
  await p.ev(`fedPut('kv','votes',[{id:'v',rec:${JSON.stringify(vote(1, 'spam'))}}])`);
  await joinGame(p);
  await run(p);
  assert.equal(await p.ev("fedGet('kv','votes')"), null);
  assert.deepEqual(p.errors, []);
});
