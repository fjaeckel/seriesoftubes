const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// The intern's "Keep peering headroom" order: PNI and IX ports above a multiple of today's traffic. One port at a POP with
// several routers gets a second in a LAG; anything else moves up a port size. Same setup as the other standing-order tests:
// a small network, a hired intern, no cash floor, no fat fingers (Change Freeze).
const BASE = "ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;S.lvl=3;S.nextFail=S.nextEvent=1e9;UI.speed=0;S.rules=makeRules('freeze');" +
  "ACT.launchBB({city:'fra'});S.pops.fra.bb.d=300;S.pops.fra.rgen=1;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()";
function game(t, extra = '') {
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(BASE);
  if (extra) h.ev(extra);
  return h;
}
const hire = ev => ev("ACT.opsHire({id:'kevin'});S.ops.floor=0;closeModal()");
// Hiring recomputes, which would wipe the traffic a case stages: hire first, then stage.
function hired(t, extra) { const h = game(t); hire(h.ev); h.ev(extra); return h; }
const on = (ev, p = { x: 1.5 }, cap) => ev(`S.ops.on.ports=true;S.ops.p.ports=${JSON.stringify(p)};${cap === undefined ? '' : `S.ops.cap.ports=${cap};`}`);
const shift = ev => ev('opsDay(S.day)');
const cash = ev => ev('S.cash');
// A 10G PNI with a small network at Frankfurt, carrying `use` Gbps today. PNIs are up the moment they are ordered, so the
// outcome does not wait on a lead time.
const pni = (tier, use, n = 1) => `S.rules.pnis='instant';S.pni.push({id:'p1',city:'fra',net:'drz',tier:${tier},n:${n},ready:0});compute();R.usePni.p1=${use}`;
const ix = (tier, use) => `S.rules.pnis='instant';ACT.buyIx({city:'fra',tier:${tier},signed:true});compute();R.useIx.fra=${use}`;
const PNIS = "JSON.stringify(S.pni.map(p=>[p.net,p.tier,p.n||1,!!p.up]))";
const IXP = "JSON.stringify([S.ixp.fra,(S.ixn||{}).fra||1])";
// The same game twice: the intern's shift in one, the player's own clicks in the other. Both must cost the same and end the same.
function twins(t, extra, manual, pick, x = 1.5) {
  const A = game(t), B = game(t);
  hire(A.ev); hire(B.ev);
  A.ev(extra); B.ev(extra);
  on(A.ev, { x });
  const a0 = cash(A.ev); shift(A.ev); const a1 = cash(A.ev);
  const b0 = cash(B.ev); B.ev(manual); const b1 = cash(B.ev);
  assert.ok(a0 - a1 > 0, 'the order did some paid work');
  assert.equal(a0 - a1, b0 - b1, 'the shift cost exactly what the clicks cost');
  assert.equal(A.ev(pick), B.ev(pick), 'and left the network the same');
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
  return A;
}

test('a hot PNI at a one-router POP moves up a port size, exactly as the click would', t => {
  const A = twins(t, pni(0, 9), "ACT.pni({city:'fra',net:'drz',tier:1})", PNIS);
  assert.equal(A.ev('S.pni[0].tier'), 1);
  assert.equal(A.ev('S.pni[0].n||1'), 1, 'one port, not a LAG');
  assert.match(A.ev('opsEntry(S.ops.log[0])'), /Kevin topped up a peering port in Frankfurt 10G→100G/);
});

test('a single PNI port at a POP with several routers gets a second port in a LAG', t => {
  const A = twins(t, pni(0, 9) + ";S.pops.fra.routers=2;compute();R.usePni.p1=9", "ACT.lagP({id:'p1',d:1})", PNIS);
  assert.equal(A.ev('S.pni[0].tier'), 0, 'same size');
  assert.equal(A.ev('S.pni[0].n'), 2);
  assert.match(A.ev('opsEntry(S.ops.log[0])'), /Kevin topped up a peering port in Frankfurt \+1×10G/);
});

test('a PNI that is already a LAG moves up a port size, whatever the routers', t => {
  const A = twins(t, pni(0, 15, 2) + ";S.pops.fra.routers=2;compute();R.usePni.p1=15", "ACT.pni({city:'fra',net:'drz',tier:1})", PNIS);
  assert.equal(A.ev('S.pni[0].tier'), 1);
  assert.equal(A.ev('S.pni[0].n'), 2, 'the LAG keeps its members');
});

test('the same two rules for an IX port', t => {
  const up = twins(t, ix(0, 9), "ACT.buyIx({city:'fra',tier:1})", IXP);
  assert.equal(up.ev(IXP), '[1,1]', 'one router: a bigger port');
  assert.match(up.ev('opsEntry(S.ops.log[0])'), /topped up a peering port in Frankfurt 10G→100G/);
  const lag = twins(t, ix(0, 9) + ";S.pops.fra.routers=2;compute();R.useIx.fra=9", "ACT.lagIx({city:'fra',d:1})", IXP);
  assert.equal(lag.ev(IXP), '[0,2]', 'several routers: a second port in a LAG');
  const big = twins(t, ix(0, 15) + ";S.ixn={fra:2};S.pops.fra.routers=2;compute();R.useIx.fra=15", "ACT.buyIx({city:'fra',tier:1})", IXP);
  assert.equal(big.ev(IXP), '[1,2]', 'a LAG moves up as a whole');
});

test('it picks the smallest port that gives the headroom, and the biggest the router takes when none does', t => {
  // 99G of traffic at 1.5× needs about 149G: 100G is too small, 400G fits.
  const A = twins(t, pni(1, 99) + ";R.usePni.p1=99", "ACT.pni({city:'fra',net:'drz',tier:2})", PNIS);
  assert.equal(A.ev('S.pni[0].tier'), 2);
  // A router that tops out at 100G cannot take a bigger port: another member of the LAG instead.
  const B = twins(t, "S.pops.fra.rgen=0;" + pni(1, 95), "ACT.lagP({id:'p1',d:1})", PNIS);
  assert.equal(B.ev('S.pni[0].tier'), 1);
  assert.equal(B.ev('S.pni[0].n'), 2);
  // 380G of traffic at 3× needs 1140G: the next size up (800G) is still too small, so it skips to 1.6T in one order.
  const C = twins(t, "S.pops.fra.rgen=3;" + pni(2, 380), "ACT.pni({city:'fra',net:'drz',tier:4})", PNIS, 3);
  assert.equal(C.ev('S.pni[0].tier'), 4);
});

test('it leaves ports with their headroom alone, and does nothing when switched off', t => {
  const { ev, errors } = hired(t, pni(1, 20) + ";" + ix(0, 5));
  on(ev);
  const s0 = ev(`${PNIS}+${IXP}`), c0 = cash(ev);
  shift(ev);
  assert.equal(ev(`${PNIS}+${IXP}`), s0);
  assert.equal(cash(ev), c0);
  assert.equal(ev('S.ops.log[0].r.length'), 0, 'a quiet shift');
  ev('R.usePni.p1=95;R.useIx.fra=9;S.ops.on.ports=false');
  shift(ev);
  assert.equal(cash(ev), c0, 'off: hot ports stay as they are');
  assert.deepEqual(errors, []);
});

test('a PNI augment on order is waited for, not ordered twice', t => {
  const { ev, errors } = hired(t, "S.rules.pnis='wait';S.pni.push({id:'p1',city:'fra',net:'drz',tier:0,ready:0});compute();R.usePni.p1=9");
  on(ev);
  shift(ev);
  assert.equal(ev('S.pni[0].up&&S.pni[0].up.tier'), 1, 'the augment is ordered');
  assert.equal(ev('S.pni[0].tier'), 0, 'and lands later');
  const c1 = cash(ev), up = ev('JSON.stringify(S.pni[0].up)');
  ev('R.usePni.p1=9'); shift(ev);
  assert.equal(cash(ev), c1, 'a second shift buys nothing');
  assert.equal(ev('JSON.stringify(S.pni[0].up)'), up);
  assert.deepEqual(errors, []);
});

test('the router ports an augment on order will take are not promised twice', t => {
  // A hot 100G PNI, a hot 10G PNI and a hot IX port, two routers, one free port: the hottest gets its second member and nobody else can have a port.
  const { ev, errors } = hired(t, "S.rules.pnis='wait';S.pops.fra.routers=2;S.transit.push({id:'fill',city:'fra',net:'ntt',tier:1,n:43,down:0},{id:'fill2',city:'fra',net:'ntt',tier:0,n:6,down:0});ACT.buyIx({city:'fra',tier:0,signed:true});" +
    "S.pni.push({id:'p1',city:'fra',net:'drz',tier:1,ready:0},{id:'p2',city:'fra',net:'vdp',tier:0,ready:0});compute();R.usePni.p1=95;R.usePni.p2=9;R.useIx.fra=9");
  on(ev);
  assert.equal(ev("portsMax('fra')-portsUsed('fra')"), 1);
  shift(ev);
  assert.equal(ev('S.pni[0].up&&S.pni[0].up.n'), 2, 'the hotter PNI is the one that gets the port');
  assert.ok(!ev('S.pni[1].up'), 'the 10G one gets neither a member nor a bigger port');
  assert.equal(ev(IXP), '[0,1]', 'and neither does the exchange port');
  assert.ok(ev("portsUsed('fra')+S.pni.reduce((a,p)=>a+(p.up?Math.max(0,PORT_SLOT(p.up.tier)*(p.up.n||1)-PORT_SLOT(p.tier)*(p.n||1)):0),0)") <= ev("portsMax('fra')"), 'and the POP is not over-booked');
  assert.deepEqual(errors, []);
});

test('it keeps to the monthly budget, the cash floor and the per-POP switch', t => {
  const { ev, errors } = hired(t, pni(0, 9));
  on(ev, { x: 1.5 }, 10000);
  ev('S.ops.spent.ports=9000');
  shift(ev);
  assert.equal(ev('S.pni[0].tier'), 0, 'over the budget: left alone');
  assert.match(ev('opsEntry(S.ops.log[0])'), /stopped at the budget for Keep peering headroom/);
  ev('S.ops.spent.ports=0;S.ops.floor=1e8');
  ev('R.usePni.p1=9'); shift(ev);
  assert.equal(ev('S.pni[0].tier'), 0, 'under the cash floor: left alone');
  ev("S.ops.floor=0;ACT.opsPop({k:'ports',city:'fra'});closeModal();R.usePni.p1=9");
  shift(ev);
  assert.equal(ev('S.pni[0].tier'), 0, 'switched off at this POP');
  ev("ACT.opsPop({k:'ports',city:'fra'});closeModal();R.usePni.p1=9");
  shift(ev);
  assert.equal(ev('S.pni[0].tier'), 1, 'and on again');
  assert.deepEqual(errors, []);
});

test('it waits out a flood instead of buying ports for it', t => {
  const { ev, errors } = hired(t, pni(0, 9));
  on(ev);
  ev("S.ev.ddos={id:'a',city:'fra',tgt:'bb:fra',vec:'http',gbps:20,start:S.day,until:S.day+3};compute();R.usePni.p1=9");
  const c0 = cash(ev);
  shift(ev);
  assert.equal(cash(ev), c0);
  assert.equal(ev('S.pni[0].tier'), 0);
  ev("S.ev.ddos=null;compute();R.usePni.p1=9"); shift(ev);
  assert.equal(ev('S.pni[0].tier'), 1, 'the day after, it gets on with it');
  assert.deepEqual(errors, []);
});

test('the monthly bill the intern reports includes IX ports', t => {
  const { ev, errors } = hired(t, ix(0, 9));
  on(ev);
  const m0 = ev('opsMoNow()');
  shift(ev);
  assert.equal(ev('S.ixp.fra'), 1);
  assert.equal(ev('opsMoNow()') - m0, ev('ixPortMo("fra",1)-ixPortMo("fra",0)'));
  assert.equal(ev('S.ops.log[0].mo'), ev('opsMoNow()') - m0, 'and the log says so');
  assert.deepEqual(errors, []);
});

test('an old save has the order off, and a new save keeps its dials', t => {
  const { ev, errors } = game(t);
  hire(ev); on(ev, { x: 2 }, 250000);
  ev("S.ops.skip.fra=['ports'];save();S=migrate(JSON.parse(slotRaw(UI.slot)))");
  assert.equal(ev("S.ops.on.ports&&S.ops.p.ports.x===2&&S.ops.cap.ports===250000&&S.ops.skip.fra[0]==='ports'"), true);
  ev("delete S.ops.on.ports;delete S.ops.p.ports;delete S.ops.cap.ports;delete S.ops.spent.ports;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ops.on.ports'), false, 'an intern hired before the order existed does not start doing it');
  assert.equal(ev('opsP("ports","x")'), 1.5);
  assert.equal(ev('S.ops.spent.ports'), 0);
  assert.deepEqual(errors, []);
});

test('a LACP fault or a building down does not buy a bigger IX port: the order counts what the port is', t => {
  const { ev, errors } = hired(t, ix(1, 70) + ";S.ixn={fra:2};S.pops.fra.routers=2;S.ev.ixlacp={fra:{until:S.day+2,f:0.5}};compute();R.useIx.fra=70");
  assert.ok(ev("ixCap('fra')") < 1.5 * 70, 'the fault leaves less than the headroom for a day or two');
  on(ev);
  const c0 = cash(ev);
  shift(ev);
  assert.equal(ev(IXP), '[1,2]', 'the 2×100G LAG stays as it is');
  assert.equal(cash(ev), c0);
  assert.deepEqual(errors, []);
});

test('a remote IX port moves up to 100G at most, and the log names the exchange', t => {
  const { ev, errors } = hired(t, "S.rules.pnis='instant';S.links.push({id:'remote',a:'fra',b:'ams',kind:'vxc',prov:FABS.find(f=>f.cities.includes('fra')&&f.cities.includes('ams')).id,vt:1,km:kmBetween('fra','ams'),sub:false,mo:0,cut:0,day:0});" +
    "ACT.buyIx({city:'ams',tier:0,signed:true});compute();R.useIx.ams=9");
  assert.equal(ev("isRemote('ams')"), true, 'no POP in Amsterdam: a remote port');
  on(ev);
  shift(ev);
  assert.equal(ev('S.ixp.ams'), 1, '10G → 100G');
  assert.match(ev('opsEntry(S.ops.log[0])'), new RegExp(ev("ixName('ams')") + '|Amsterdam'));
  ev('compute();R.useIx.ams=70');
  const c0 = cash(ev);
  shift(ev);
  assert.equal(ev('S.ixp.ams'), 1, 'a remote port stops at 100G, and there is no LAG without a POP');
  assert.equal(cash(ev), c0);
  assert.deepEqual(errors, []);
});
