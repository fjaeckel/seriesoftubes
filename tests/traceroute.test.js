const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('traceroute shows an embedded cache hop only when a cache is the exit', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0");
  ev("S.pops.fra.bb={d:20/NSH.cfl};ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  // The hops, without the "traceroute to …" header line.
  const trace = () => { const r = ev("traceroute('fra',{net:'cfl'})"); return { ...r, hops: r.text.split('\n').slice(1).join('\n') }; };
  const before = trace();
  assert.match(before.why, /Cogentle/, 'over transit');
  assert.doesNotMatch(before.hops, /cache-|embedded cache/, 'no cache hop without a cache');
  assert.match(before.hops, /www\.crowdflare\.example/, 'ends at the network itself');
  ev("ACT.cache({city:'fra',net:'cfl'});compute()");
  assert.equal(ev('S.caches.length'), 1);
  const after = trace();
  assert.match(after.hops, /cache-crowdflare\.fra\..*embedded cache in your rack$/, 'the cache is the last hop');
  assert.doesNotMatch(after.hops, /cogentle|www\.crowdflare/, 'nothing leaves the network');
  assert.deepEqual(errors, []);
});
