const test = require('node:test');
const assert = require('node:assert/strict');
const { load, seed } = require('./harness');

function play(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=4;for(const g of GOALS)S.done[g.id]=0");
  ev("ACT.launchBB({city:S.home});ACT.buyTransit({city:S.home,net:'cog',tier:1});ACT.buyIx({city:S.home,tier:1,signed:true});ACT.rs({city:S.home});for(let i=0;i<20;i++)dayTick()");
}

test('route viewer: your AS, upstreams, peers, prefixes and the AS path to everyone', () => {
  const { ev, errors } = load();
  seed(ev, 3);
  play(ev);
  const v = JSON.parse(ev('JSON.stringify(routeView())'));
  assert.equal(v.asn, ev('S.asn'));
  assert.equal(v.upstreams.length, 1);
  assert.equal(v.upstreams[0].asn, 174);
  assert.equal(v.upstreams[0].name, 'Cogent');
  assert.ok(v.peers.length > 3, 'the route server brings peers');
  assert.ok(v.peers.every((p) => p.sessions.length && p.asn > 0));
  assert.ok(v.prefixes.some((p) => p.family === 4 && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+\/22$/.test(p.prefix)), 'IPv4 from CGNAT space, never real addresses');
  assert.ok(v.prefixes.some((p) => p.family === 6 && p.prefix.startsWith('2001:db8:')), 'IPv6 from the documentation range');
  assert.equal(v.rpki, 'valid');
  const g = v.paths.find((p) => p.id === 'ggl');
  assert.ok(g.reachable && g.asPath[0] === v.asn && g.asPath.at(-1) === 15169 && g.rtt > 0);
  const viaTransit = v.paths.find((p) => p.kind === 't');
  assert.deepEqual(viaTransit.asPath.slice(0, 2), [v.asn, 174], 'transit paths go through the upstream first');
  assert.ok(v.paths.every((p, i, a) => !i || a[i - 1].gbps >= p.gbps), 'sorted by traffic');
  assert.deepEqual(errors, []);
});

test('route viewer: an expired ROA shows up as RPKI invalid', () => {
  const { ev } = load();
  play(ev);
  ev("S.ev.rpki={until:S.day+3,nets:['ggl']}");
  assert.equal(ev('routeView().rpki'), 'invalid');
  assert.ok(ev('routeView().prefixes.every(p=>p.rpki==="invalid")'));
});

test('route viewer: every tab renders, search finds networks by AS number and name', () => {
  const { ev, errors, dom } = load();
  play(ev);
  for (const t of ['ov', 'up', 'pe', 'px', 'pa', 'se']) {
    ev(`routesModal('${t}')`);
    assert.ok(ev("document.getElementById('modalCard').textContent.length") > 40, t);
  }
  ev("UI.rv.q='3356';routesModal('se')");
  ev("ACT.rvNet({id:'lvl'})");
  const t = ev("document.getElementById('modalCard').textContent");
  assert.match(t, /AS3356/); assert.match(t, /Lumen/); assert.match(t, /Your path/);
  ev("ACT.routes()");
  dom.window.document.querySelector('[data-act=rvTab][data-args*=se]').click();
  const q = dom.window.document.getElementById('rvQ'); q.value = 'cloudfl';
  dom.window.document.querySelector('[data-act=rvSearch]').click();
  assert.match(ev("document.getElementById('modalCard').textContent"), /AS13335/);
  assert.deepEqual(errors, []);
});

test('the NOC tab links to the route viewer', () => {
  const { ev } = load();
  play(ev);
  ev("ACT.leftTab({t:'noc'})");
  assert.ok(ev("!!document.querySelector('[data-act=routes]')"));
});
