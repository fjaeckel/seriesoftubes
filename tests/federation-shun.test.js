// Shunning (docs/plans/federation.md): votes arrive like any record, every game counts them itself against the
// registry, a shunned network leaves the boards and lists, and its own game plays on solo and is told why.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, key, b64, sha } = require('./helpers/fed');

const DAY = 86400, sid = (n) => b64(sha('server ' + n));
// Six registry servers old and alive enough to vote (need = max(5, div(6 + 3, 4)) = 5), each with one operator.
const REG = { asOf: NOW - (NOW % DAY), at: NOW, servers: [1, 2, 3, 4, 5, 6].map((n) => ({ id: sid(n), name: 'S' + n, operators: [key('op' + n).pub], nodes: [], listed: NOW - 60 * DAY - (NOW % DAY), answered: NOW - (NOW % DAY) })) };
const vote = (n, reason, t = NOW - DAY) => rec('op' + n, 'shun', t, { server: sid(n), target: key('mallory').pub, reason });

test('five registered servers vote: the network is shunned in this game, off every board and list', async () => {
  const p = fedPage();
  const n = p.net.node(URL1);
  n.feed = [vote(1, 'spam'), vote(2, 'spam'), vote(3, 'cheating'), vote(4, 'spam'), rec('op9', 'shun', NOW - DAY, { server: sid(9), target: key('mallory').pub, reason: 'spam' })].map((r) => ({ rec: r, rcpt: [] }));
  await p.ev(`fedPut('kv','registry',${JSON.stringify(REG)})`);
  await joinGame(p);
  assert.ok(await until(async () => (await settle(5), ((await p.ev("fedGet('kv','votes')")) || []).length === 4)), 'the vote from an unknown server is not even kept');
  assert.deepEqual(JSON.parse(JSON.stringify(await p.ev('fedShunned()'))), [], 'four registered votes are not enough');
  // The fifth vote arrives with the next sync.
  n.feed = [{ rec: vote(5, 'abuse'), rcpt: [] }];
  for (const ws of n.socks) ws.drop();
  await settle();
  p.net.advance(5000);
  assert.ok(await until(async () => (await settle(5), (await p.ev('fedShunned()')).length === 1)));
  const d = JSON.parse(await p.ev('fedBoardData().then(d=>JSON.stringify(d.exclude))'));
  assert.ok(d.includes(key('mallory').pub), 'excluded from every board');
  const info = JSON.parse(JSON.stringify(await p.ev(`fedShunInfo('${key('mallory').pub}')`)));
  assert.deepEqual(info, { voters: 6, need: 5, votes: 5, shunned: true, reasons: { abuse: 1, cheating: 1, spam: 3 } });
  // Withdrawn below the threshold, it lifts only after 7 days.
  await p.ev(`fedVotesAdd([{id:'u',rec:${JSON.stringify(rec('op5', 'unshun', NOW, { server: sid(5), target: key('mallory').pub }))}}])`);
  p.ev(`FED.now=()=>${NOW + 6 * DAY}`);
  assert.equal((await p.ev('fedShunned()')).length, 1, 'still shunned 6 days later');
  p.ev(`FED.now=()=>${NOW + 7 * DAY}`);
  assert.equal((await p.ev('fedShunned()')).length, 0, 'lifted after 7 days below');
  assert.deepEqual(p.errors, []);
});

test('the shunned network\'s own game plays on solo and can say why, with how many servers chose each reason', async () => {
  const p = fedPage();
  p.net.node(URL1).up = false;
  await joinGame(p);
  // This save is mallory's network.
  p.ev(`S.fed.key=${JSON.stringify({ pub: key('mallory').pub, priv: key('mallory').seed })}`);
  await p.ev(`fedPut('kv','registry',${JSON.stringify(REG)})`);
  await p.ev(`fedVotesAdd(${JSON.stringify([vote(1, 'spam'), vote(2, 'spam'), vote(3, 'abuse'), vote(4, 'spam'), vote(5, 'offensive_name')].map((r, i) => ({ id: 'v' + i, rec: r })))})`);
  const info = JSON.parse(JSON.stringify(await p.ev('fedShunInfo(S.fed.key.pub)')));
  assert.equal(info.shunned, true);
  assert.deepEqual(info.reasons, { abuse: 1, offensive_name: 1, spam: 3 });
  const cash = p.ev('S.cash');
  for (let i = 0; i < 10; i++) p.ev('dayTick()');
  assert.equal(p.ev('S.day'), 10);
  assert.notEqual(p.ev('S.cash'), cash);
  assert.deepEqual(p.errors, []);
});
