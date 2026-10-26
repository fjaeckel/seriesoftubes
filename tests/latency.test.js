const test = require('node:test');
const assert = require('node:assert/strict');
const { load, seed } = require('./harness');

function setup(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.buildPop({city:'ams'});ACT.buildPop({city:'lon'});ACT.buildPop({city:'par'})");
  ev("UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.pending={a:'ams',b:'lon'};ACT.buildLink({tier:1});UI.pending={a:'fra',b:'par'};ACT.buildLink({tier:1})");
}

test('latency follows the fibre: about 4.9 µs per km, never faster than light, with a stable detour per link', () => {
  const { ev } = load();
  setup(ev);
  for (const l of JSON.parse(ev("JSON.stringify(S.links.map(l=>({id:l.id,km:l.km,lat:linkLat(l),infl:routeInflation(l)})))"))) {
    assert.ok(l.lat > l.km / 204, `${l.km} km can't beat the speed of light in glass (${l.lat} ms)`);
    assert.ok(l.infl >= 0.9 && l.infl <= 1.7, `route inflation ${l.infl} is plausible`);
    assert.ok(l.lat < l.km / 204 * 2.5 + 1, 'and not absurd');
  }
});

test('route inflation is per link, stable, and differs between links and worlds', () => {
  const { ev } = load();
  setup(ev);
  const infl = () => JSON.parse(ev("JSON.stringify(S.links.map(l=>routeInflation(l)))"));
  const a = infl();
  assert.deepEqual(infl(), a, 'stable');
  assert.ok(new Set(a).size > 1, 'links differ');
  ev("S.asn=S.asn+1");
  assert.notDeepEqual(infl(), a, 'another AS number is another world');
});

test('days differ: carriers reroute now and then, deterministically', () => {
  const { ev } = load();
  setup(ev);
  const seen = new Set(); let rerouted = 0;
  for (let d = 0; d < 720; d += 6) {
    ev(`S.day=${d}`);
    for (const f of JSON.parse(ev("JSON.stringify(S.links.map(l=>detourFactor(l)))"))) { seen.add(f); if (f > 1) rerouted++; }
  }
  assert.ok(rerouted > 0 && rerouted < 40, `some but not many windows are rerouted (${rerouted} of 360)`);
  ev('S.day=100'); const x = ev("S.links.map(l=>linkLat(l)).join()"); ev('S.day=100');
  assert.equal(ev("S.links.map(l=>linkLat(l)).join()"), x, 'same day, same latency');
  for (const f of seen) assert.ok(f === 1 || (f >= 1.1 && f <= 1.6));
});

test('load makes packets queue, and jitter grows with distance', () => {
  const { ev } = load();
  setup(ev);
  const q = (u) => ev(`queueMs(${u})`);
  assert.ok(q(0) < 0.01 && q(0.5) < q(0.9) && q(0.9) < q(1.0) && q(1.2) > q(1.0));
  assert.ok(q(5) <= 25.001, 'buffers are finite');
  const [short, long] = JSON.parse(ev("JSON.stringify([{id:'a',km:100,kind:'wave',tier:1},{id:'b',km:6000,kind:'wave',tier:1,cable:'marea'}].map(l=>linkJit(l)))"));
  assert.ok(long > short * 5);
});

test('traceroute prints three probes per hop that differ run to run, around the same value', () => {
  const { ev } = load({ seed: false });
  setup(ev);
  ev("compute()");
  const probes = () => ev("traceroute('fra',{city:'lon'}).text").split('\n').filter((l) => / ms  .* ms  .* ms/.test(l)).map((l) => l.match(/([\d.]+) ms/g).map((x) => parseFloat(x)));
  const a = probes(), b = probes();
  assert.ok(a.length >= 2);
  for (const row of a) assert.equal(row.length, 3);
  assert.notDeepEqual(a, b, 'probes are random');
  const last = a[a.length - 1], mean = last.reduce((x, y) => x + y) / 3;
  assert.ok(last.every((v) => Math.abs(v - mean) < Math.max(3, mean * 0.25)), 'but they stay close');
});

test('latency contracts can be met by a sane direct route', () => {
  const { ev } = load();
  setup(ev);
  seed(ev, 11);
  const km = ev("kmBetween('fra','ams')");
  const max = +(km / 204 * 1.55 + 0.4).toFixed(1);
  assert.ok(ev("bestLat('fra','ams')") < max, 'a direct link beats the contract ceiling');
});

test('traceroute crosses oceans in many hops with the provider\'s own rDNS and only documentation addresses', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'ntt',tier:1});compute()");
  const t = ev("traceroute('fra',{net:'cmc'}).text");
  const hops = t.split('\n').filter((l) => /^\s*\d+ /.test(l));
  assert.ok(hops.length >= 10, 'a transatlantic path has many hops');
  assert.match(t, /\.not-that-telecom\.net/, 'carriers get a name of their own');
  assert.match(t, /\.comecast\.net/);
  assert.ok(!/\.-\d/.test(t), 'no negative octets');
  assert.ok(!/\(\d+\.\d+\.\d+\.\d+\)/.test(t.replace(/\((?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])|192\.0\.2|198\.51\.100|203\.0\.113|185\.1)\.[\d.]+\)/g, '')), 'reserved ranges only');
  assert.deepEqual(errors, []);
});

test('a thrown error in the day tick does not stop the frame loop', () => {
  const { ev } = load();
  ev("ACT.start({});window.__orig=dayTick;dayTick=()=>{throw new Error('boom')};");
  ev("try{frame(performance.now()+1000)}catch(e){window.__escaped=e}");
  assert.equal(ev("window.__escaped===undefined"), true);
});
