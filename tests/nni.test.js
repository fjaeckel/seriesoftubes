// Fabric ports (NNI) are ports like any other (#140): 10G, 100G or 400G as far as the router takes it, bundled into a
// LAG up to LAG_MAX, a router port per member. A customer coming in over the fabric is only accepted, by hand or automatically, when its
// own bandwidth fits on the port as well as what is booked there already (#307).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt, with a POP, money, and a fabric that is there; the router as given (Rusty Router: 100G at most).
function open(rg) {
  const h = load({ seed: 140 });
  h.ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;window.FB=FABS.find(f=>f.cities.includes('fra')).id;S.pops.fra.rgen=0;S.pops.fra.routers=1");
  if (rg !== undefined) h.ev(`S.pops.fra.rgen=${rg}`);
  return h;
}
const fast = (maxP) => `RG.findIndex(r=>r.maxP>=${maxP}&&r.ports>=40)`;
const port = (ev) => JSON.parse(ev("JSON.stringify(nniPort('fra',FB)||null)"));
const live = (id, bw) => `S.biz.push({id:'${id}',type:'fabip',city:'fra',prov:FB,bw:${bw},rate:110,reqs:['nni'],mood:100,since:S.day,name:'Fab ${id}'});compute()`;
const offer = (id, bw) => `S.offers.push({id:'${id}',type:'fabip',city:'fra',prov:FB,bw:${bw},rate:110,reqs:['nni'],exp:S.day+30,name:'Offer ${id}',start:S.day,dur:365})`;

test('10G, 100G and 400G, priced so a faster port costs less per Gbps; 10G and 100G keep their prices', () => {
  const { ev } = open();
  const t = JSON.parse(ev('JSON.stringify({nni:NNI,port:PORT.map(p=>[p.n,p.g])})'));
  assert.deepEqual(t.nni.map((x) => [x.n, x.g]), t.port.slice(0, 3), 'the port speeds up to 400G, and no faster');
  assert.deepEqual(t.nni.slice(0, 2).map((x) => x.mo), [500, 1200], 'the sizes saves already have cost what they did');
  for (let i = 1; i < t.nni.length; i++) {
    assert.ok(t.nni[i].mo > t.nni[i - 1].mo, `${t.nni[i].n} costs more`);
    assert.ok(t.nni[i].mo / t.nni[i].g < t.nni[i - 1].mo / t.nni[i - 1].g, `but less per Gbps than ${t.nni[i - 1].n}`);
  }
});

test('a fabric port is as fast as the router takes, up to 400G', () => {
  const { ev, errors } = open();
  ev('ACT.buyNni({city:"fra",prov:FB,tier:2})');
  assert.equal(port(ev), null, 'a 100G router cannot take a 400G fabric port');
  ev('ACT.buyNni({city:"fra",prov:FB,tier:1})');
  assert.equal(port(ev).tier, 1);
  ev(`S.pops.fra.rgen=${fast(5)};ACT.buyNni({city:"fra",prov:FB,tier:5});ACT.buyNni({city:"fra",prov:FB,tier:3})`);
  assert.equal(port(ev).tier, 1, 'even a 3.2T router gets no fabric port faster than 400G');
  ev('ACT.buyNni({city:"fra",prov:FB,tier:2})');
  assert.equal(port(ev).tier, 2);
  assert.equal(ev('nniCap(nniPort("fra",FB))'), 400);
  // A router that cannot take 400G would strand it, so the model change is refused.
  assert.match(ev("modelFits('fra',RG.findIndex(r=>r.maxP===1))"), /bigger than/);
  assert.deepEqual(errors, []);
});

test('a fabric port bundles into a LAG: same speed, a router port each, 95% of the sum, every member billed', () => {
  const { ev, errors } = open(undefined);
  ev(`S.pops.fra.rgen=${fast(2)};ACT.buyNni({city:"fra",prov:FB,tier:2})`);
  const before = JSON.parse(ev("JSON.stringify({u:portsUsed('fra'),c:R.cost.nni})"));
  for (let i = 0; i < 3; i++) ev('ACT.lagNni({city:"fra",prov:FB,d:1})');
  ev('compute()');
  assert.equal(port(ev).n, 4);
  assert.equal(ev('nniCap(nniPort("fra",FB))'), 400 * 4 * 0.95);
  assert.equal(ev("portsUsed('fra')"), before.u + 3, 'a router port per member');
  assert.equal(ev('R.cost.nni'), 4 * 3000, 'four members, four monthly prices');
  for (let i = 0; i < 10; i++) ev('ACT.lagNni({city:"fra",prov:FB,d:1})');
  assert.equal(port(ev).n, ev('LAG_MAX'), 'up to LAG_MAX, like every LAG');
  assert.equal(ev('nniCap(nniPort("fra",FB))'), 400 * ev('LAG_MAX') * 0.95, 'more than 400G is more members');
  assert.deepEqual(errors, []);
});

test('upgrading a LAG moves and pays for every member', () => {
  const { ev, errors } = open();
  ev('ACT.buyNni({city:"fra",prov:FB,tier:1});ACT.lagNni({city:"fra",prov:FB,d:1});ACT.lagNni({city:"fra",prov:FB,d:1})');
  ev(`S.pops.fra.rgen=${fast(2)};S.cash=1e9;ACT.buyNni({city:"fra",prov:FB,tier:2})`);
  assert.equal(ev('S.cash'), 1e9 - 3 * ev('NNI[2].mo'));
  assert.deepEqual([port(ev).tier, port(ev).n], [2, 3]);
  assert.deepEqual(errors, []);
});

test('a member only comes off when what the port carries still fits', () => {
  const { ev, errors } = open();
  ev('ACT.buyNni({city:"fra",prov:FB,tier:1});ACT.lagNni({city:"fra",prov:FB,d:1})');
  ev(live('b1', 150));
  ev('ACT.lagNni({city:"fra",prov:FB,d:-1})');
  assert.equal(port(ev).n, 2, '150G does not fit on one 100G member');
  ev('S.biz=S.biz.filter(b=>b.id!=="b1");ACT.lagNni({city:"fra",prov:FB,d:-1})');
  assert.equal(port(ev).n, undefined, 'back to a single port');
  assert.deepEqual(errors, []);
});

test('a fabric customer is only accepted when its own bandwidth fits on the port too (#307)', () => {
  const { ev, errors } = open();
  ev('ACT.buyNni({city:"fra",prov:FB,tier:1})');
  ev(live('b1', 80));
  ev(offer('o1', 30));
  assert.equal(ev("reqOk(S.offers.find(o=>o.id==='o1'))"), false, '80G booked + 30G asked > 100G');
  assert.equal(ev("autoOffer(S.offers.find(o=>o.id==='o1'))"), null, 'so it is not auto-accepted');
  ev(offer('o2', 20));
  assert.equal(ev("reqOk(S.offers.find(o=>o.id==='o2'))"), true, '80G + 20G fits');
  // Once accepted, a customer counts once, not twice.
  ev("ACT.accept({id:'o2'});compute()");
  assert.equal(ev("reqOk(S.biz.find(b=>b.id==='o2'))"), true);
  assert.equal(ev("nniUsed('fra',FB)"), 100);
  // A LAG member makes room for the one that did not fit.
  ev('ACT.lagNni({city:"fra",prov:FB,d:1})');
  assert.equal(ev("reqOk(S.offers.find(o=>o.id==='o1'))"), true);
  assert.deepEqual(errors, []);
});

test('the city panel offers the speeds the router takes, up to 400G, and LAG members', () => {
  const { ev, dom, errors } = open(undefined);
  ev(`S.pops.fra.rgen=${fast(2)};selectCity('fra');UI.tab='links';renderPanel()`);
  const buy = () => [...dom.window.document.querySelectorAll('#panelBody [data-act="buyNni"]')].filter((b) => JSON.parse(b.dataset.args).prov === ev('FB'));
  const tiers = buy().map((b) => [JSON.parse(b.dataset.args).tier, b.disabled]);
  assert.ok(tiers.length >= 3, 'more than the old two sizes');
  assert.deepEqual(tiers.map(([t]) => t), [0, 1, 2], '10G, 100G and 400G: nothing faster');
  assert.ok(tiers.every(([, d]) => !d), 'this router takes all three');
  ev('S.pops.fra.rgen=RG.findIndex(r=>r.maxP===1);renderPanel()');
  assert.deepEqual(buy().map((b) => [JSON.parse(b.dataset.args).tier, b.disabled]), [[0, false], [1, false], [2, true]], 'a 100G router shows 400G, but not for sale');
  ev(`S.pops.fra.rgen=${fast(2)}`);
  ev('ACT.buyNni({city:"fra",prov:FB,tier:2});renderPanel()');
  assert.ok(dom.window.document.querySelector('#panelBody [data-act="lagNni"]'), 'a LAG member');
  assert.match(dom.window.document.querySelector('#panelBody').textContent, /400G port/);
  ev('ACT.lagNni({city:"fra",prov:FB,d:1});renderPanel()');
  assert.match(dom.window.document.querySelector('#panelBody').textContent, /2×400G LAG/);
  assert.deepEqual(errors, []);
});

test('saves: fabric ports that make no sense are dropped, LAGs are kept in bounds, old ports are unchanged', () => {
  const { ev, errors } = open();
  ev('ACT.buyNni({city:"fra",prov:FB,tier:1})');
  const s = JSON.parse(ev('JSON.stringify(S)'));
  s.nni.push({ id: 'x1', city: 'fra', prov: 'nope', tier: 0 }, { id: 'x2', city: 'zzz', prov: s.nni[0].prov, tier: 0 },
    { id: 'x3', city: 'fra', prov: s.nni[0].prov, tier: 99 }, { id: 'x4', city: 'fra', prov: s.nni[0].prov, tier: '1' }, null);
  s.nni[0].n = 50;
  ev(`S=migrate(${JSON.stringify(s)});compute()`);
  const n = JSON.parse(ev('JSON.stringify(S.nni)'));
  assert.equal(n.length, 1, 'only the real port is left');
  assert.equal(n[0].tier, 1);
  assert.equal(n[0].n, ev('LAG_MAX'));
  s.nni = [{ id: 'old', city: 'fra', prov: s.nni[0].prov, tier: 0 }];
  ev(`S=migrate(${JSON.stringify(s)});compute()`);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.nni)')), [{ id: 'old', city: 'fra', prov: s.nni[0].prov, tier: 0 }]);
  assert.equal(ev('R.cost.nni'), 500, 'a 10G port from before costs what it did');
  assert.deepEqual(errors, []);
});
