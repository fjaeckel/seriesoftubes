const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../server/teams');

const net = (asn, o = {}) => ({ asn, name: 'Net' + asn, policy: o.policy, peers: o.peers || [], ix: { ports: o.ports || ['fra'], rs: o.rs || ['fra'], names: { fra: 'DE-CIX Frankfurt', ams: 'AMS-IX' }, served: o.served ?? 10 } });

test('open and open meet on a shared route server, for free', () => {
  const m = T.computePeers([net(1), net(2)]);
  assert.deepEqual(m.get(1).map((p) => [p.asn, p.via, p.fee, p.kind]), [[2, 'DE-CIX Frankfurt', 0, 'ix']]);
  assert.equal(m.get(2)[0].asn, 1);
});

test('no route server session on either side, no session', () => {
  const m = T.computePeers([net(1), net(2, { rs: [] })]);
  assert.equal(m.get(1).length, 0);
  const v = T.exchangeView([net(1), net(2, { rs: [] })], net(1));
  assert.equal(v[0].members[0].up, false);
  assert.match(v[0].members[0].why, /route server/);
});

test('different exchanges never peer over a route server', () => {
  const m = T.computePeers([net(1), net(2, { ports: ['ams'], rs: ['ams'] })]);
  assert.equal(m.get(1).length, 0);
  assert.equal(T.exchangeView([net(1), net(2, { ports: ["ams"], rs: ["ams"] })], net(1))[0].members.length, 0);
});

test('selective wants traffic first, restrictive never does it over the route server, bilateral overrides both', () => {
  assert.equal(T.computePeers([net(1, { policy: { pol: 'selective', min: 50 } }), net(2, { served: 10 })]).get(1).length, 0);
  assert.equal(T.computePeers([net(1, { policy: { pol: 'selective', min: 50 } }), net(2, { served: 80 })]).get(1).length, 1);
  assert.equal(T.computePeers([net(1, { policy: { pol: 'restrictive' } }), net(2)]).get(2).length, 0);
  const b = T.computePeers([net(1, { policy: { pol: 'restrictive' }, peers: [2] }), net(2, { peers: [1] })]);
  assert.equal(b.get(1)[0].kind, 'bilateral');
});

test('paid peering: small networks pay the fee every month, big ones peer for free', () => {
  const small = T.computePeers([net(1, { policy: { pol: 'paid', min: 50, fee: 8000 } }), net(2, { served: 5 })]);
  assert.equal(small.get(1)[0].fee, 8000, 'the paid network receives');
  assert.equal(small.get(2)[0].fee, -8000, 'the small one pays');
  const big = T.computePeers([net(1, { policy: { pol: 'paid', min: 50, fee: 8000 } }), net(2, { served: 500 })]);
  assert.equal(big.get(1)[0].fee, 0);
  const both = T.computePeers([net(1, { policy: { pol: 'paid', min: 50, fee: 8000 } }), net(2, { served: 5, policy: { pol: 'paid', min: 50, fee: 3000 } })]);
  assert.equal(both.get(1)[0].fee, 8000 - 3000, 'both are small for each other, so both charge: the difference settles');
});
