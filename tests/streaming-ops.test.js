const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A level-5 Streaming service in Frankfurt, live in Germany (two paid eyeball ISPs, half the homes each), with Kevin
// hired, no cash floor and calm rules (no fat fingers, no disputes).
const BASE = "ACT.start({});ACT.charter({k:'content'});S.cash=1e9;S.lvl=5;S.nextFail=S.nextEvent=1e9;S.rules=makeRules('freeze');" +
  "ACT.cntLaunch({cc:'DE'});ACT.buyTransit({city:S.home,net:'cog',tier:1});S.cnt.cc.DE.d=60;S.ops.intern='kevin';S.ops.hired=S.day-30;S.ops.floor=0;compute()";
const start = (t) => { const h = load(); t.after(() => h.dom.window.close()); h.ev(BASE); return h; };
const keys = (h) => { h.ev('opsModal()'); return [...h.dom.window.document.querySelectorAll('#modalCard [data-act="opsToggle"]')].map(b => JSON.parse(b.dataset.args).k); };
const popKeys = (h) => [...h.dom.window.document.querySelectorAll('#modalCard [data-act="opsPop"]')].map(b => JSON.parse(b.dataset.args).k);
const tplKeys = (h) => [...h.dom.window.document.querySelectorAll('#modalCard [data-act="opsTpl"]')].map(b => JSON.parse(b.dataset.args).k);

test('a Streaming service sees its own orders and not the carrier ones that make no sense; carriers see nothing new', t => {
  const h = start(t);
  const k = keys(h);
  for (const x of ['boxes', 'prefill', 'origin', 'transit', 'ports', 'pni', 'ix']) assert.ok(k.includes(x), x);
  assert.ok(!k.includes('caches'), 'no free caches for eyeballs a streaming service does not have');
  assert.ok(popKeys(h).includes('boxes') && !popKeys(h).includes('caches'));
  assert.ok(!tplKeys(h).includes('bb'), 'no broadband in the new-POP template');
  assert.equal(h.ev("(()=>{S.ops.tpl.bb=true;const a=opsTplQuote('ams').cost;S.ops.tpl.bb=false;return a-opsTplQuote('ams').cost;})()"), 0, 'no broadband in its price either');
  // A carrier: every classic order as it was, none of the streaming ones, and they never run there.
  const c = load(); t.after(() => c.dom.window.close());
  c.ev("ACT.start({});S.cash=1e8;S.lvl=5;S.rules=makeRules('freeze');S.ops.intern='kevin';S.ops.floor=0;compute()");
  const ck = keys(c);
  assert.ok(ck.includes('caches') && !ck.includes('boxes') && !ck.includes('prefill') && !ck.includes('origin'));
  assert.ok(popKeys(c).includes('caches') && !popKeys(c).includes('boxes'));
  assert.ok(tplKeys(c).includes('bb'));
  c.ev("S.ops.on.boxes=S.ops.on.prefill=S.ops.on.origin=true;opsDay(S.day)");
  assert.equal(c.ev("S.ops.log.some(e=>e.r.some(x=>['boxes','prefill','origin','dcfull','freeze'].includes(x[0])))"), false);
  assert.deepEqual(h.errors, []); assert.deepEqual(c.errors, []);
});

test('the intern racks Binge Boxes where they pay off, at the price of the click, and books the rent', t => {
  const h = start(t), { ev } = h;
  ev("S.ops.on.boxes=true;S.ops.p.boxes={pay:3};S.ops.cap.boxes=0");
  // Germany is next door to the origin, which has room: a box only saves cheap transit. Not worth it in 3 months.
  ev('opsDay(S.day)');
  assert.equal(ev('S.cnt.box.length'), 0, 'no payback, no box');
  // The origin runs out of room: viewers go unserved, and a box in each ISP pays for itself quickly.
  ev("S.cnt.cc.DE.d=1000;compute()");
  assert.ok(ev('R.cnt.short') > 0);
  const c0 = ev('S.cash');
  ev('opsDay(S.day)');
  assert.equal(ev("S.cnt.box.map(b=>b.net).sort().join()"), 'dtk,vdp');
  assert.equal(c0 - ev('S.cash'), 2 * ev('BOX_COST'));
  assert.equal(ev('S.ops.spent.boxes'), 2 * ev('BOX_COST'));
  assert.equal(ev('S.ops.addMo.boxes'), ev("S.cnt.box.reduce((a,b)=>a+BOX_MO+boxHost(NET[b.net]),0)"));
  assert.match(ev('opsLine(S.ops.log[0])'), /racked 2 Binge Boxes \(Frankfurt/);
  // Running full: another next to them. Not full: nothing more.
  ev("compute();for(const b of S.cnt.box)R.useCache[b.id]=b.net==='dtk'?BOX_G:1;opsDay(S.day)");
  assert.equal(ev("S.cnt.box.filter(b=>b.net==='dtk').length"), 2);
  assert.equal(ev("S.cnt.box.filter(b=>b.net==='vdp').length"), 1);
  assert.match(ev('opsLine(S.ops.log[0])'), /squeezed a box in next to full ones in Frankfurt/);
  // A POP switched off for the order is left alone.
  ev("S.ops.skip[S.home]=['boxes'];compute();for(const b of S.cnt.box)R.useCache[b.id]=BOX_G;opsDay(S.day)");
  assert.equal(ev('S.cnt.box.length'), 3);
  assert.deepEqual(h.errors, []);
});

test('the box budget and the hosted-free setting hold', t => {
  const h = start(t), { ev } = h;
  ev("S.cnt.cc.DE.d=1000;compute();S.ops.on.boxes=true;S.ops.p.boxes={pay:0};S.ops.cap.boxes=50000;opsDay(S.day)");
  assert.equal(ev('S.cnt.box.length'), 1, 'one box fits under 50k');
  assert.equal(ev("JSON.stringify(S.ops.log[0].r.find(x=>x[0]==='broke')[2])"), '["boxes"]');
  // Both German ISPs charge to host: "only where hosted free" racks none.
  const B = start(t);
  B.ev("S.cnt.cc.DE.d=1000;compute();S.ops.on.boxes=true;S.ops.p.boxes={pay:0,free:true};S.ops.cap.boxes=0;opsDay(S.day)");
  assert.equal(B.ev('S.cnt.box.length'), 0);
  assert.equal(B.ev("NETS.filter(n=>['dtk','vdp'].includes(n.id)).every(n=>!boxFree(n))"), true);
  assert.deepEqual(h.errors, []); assert.deepEqual(B.errors, []);
});

test('the intern pre-fills the boxes for an announced premiere, close enough and within budget, never for a live show', t => {
  const h = start(t), { ev } = h;
  ev("S.cnt.box.push({id:'b1',city:S.home,net:'dtk',day:S.day,f:0.3},{id:'b2',city:S.home,net:'vdp',day:S.day,f:0.3});S.cnt.prem={day:S.day+10,reg:'EU',n:0,pf:0,w:1,live:0};S.ops.on.prefill=true");
  ev('opsDay(S.day)');
  assert.equal(ev('S.cnt.prem.pf'), 0, 'ten days out: too early for the default three');
  const cost = ev('prefillCost()'), c0 = ev('S.cash');
  ev('S.cnt.prem.day=S.day+3;opsDay(S.day)');
  assert.equal(ev('S.cnt.prem.pf'), 1);
  assert.equal(ev('S.cnt.box.every(b=>b.f===1)'), true);
  assert.equal(c0 - ev('S.cash'), cost);
  assert.equal(ev('S.ops.spent.prefill'), cost);
  assert.match(ev('opsLine(S.ops.log[0])'), /pre-filled every Binge Box for the premiere/);
  // A live show has nothing to pre-fill; a tiny budget stops it.
  const B = start(t);
  B.ev("S.cnt.box.push({id:'b1',city:S.home,net:'dtk',day:S.day,f:0.3});S.cnt.prem={day:S.day+2,reg:'EU',n:0,pf:0,w:1,live:1};S.ops.on.prefill=true;opsDay(S.day)");
  assert.equal(B.ev('S.cnt.prem.pf'), 0);
  B.ev("S.cnt.prem.live=0;S.ops.cap.prefill=0;S.ops.spent.prefill=0;S.ops.cap.prefill=10000;S.ops.spent.prefill=9000;opsDay(S.day)");
  assert.equal(B.ev('S.cnt.prem.pf'), 0);
  assert.equal(B.ev("JSON.stringify(S.ops.log[0].r.find(x=>x[0]==='broke')[2])"), '["prefill"]');
  assert.deepEqual(h.errors, []); assert.deepEqual(B.errors, []);
});

test('a full origin gets a sticky note once a week, and a bigger build only when told to, under a capped budget', t => {
  const h = start(t), { ev } = h;
  ev("S.cnt.cc.DE.d=1000;compute();S.ops.on.origin=true");
  assert.equal(ev('opsCaps("origin").includes(0)'), false, 'no unlimited budget for multi-million builds');
  const c0 = ev('S.cash');
  ev('opsDay(S.day)');
  assert.equal(ev('S.cash'), c0, 'warning only by default');
  assert.equal(ev('S.cnt.dc[S.home].up'), undefined);
  assert.match(ev('opsLine(S.ops.log[0])'), /found the origin in Frankfurt running full/);
  const n0 = ev('S.ops.log.length');
  ev('opsDay(S.day)');
  assert.equal(ev('S.ops.log.length'), n0, 'the same week: no second note');
  // Told to build: the next size, within the budget, booked as up front and monthly.
  ev("S.ops.p.origin={grow:true};opsDay(S.day)");
  assert.equal(ev('S.cnt.dc[S.home].up.t'), 1);
  assert.equal(c0 - ev('S.cash'), ev('DC_T[1].cost'));
  assert.equal(ev('S.ops.spent.origin'), ev('DC_T[1].cost'));
  assert.equal(ev('S.ops.addMo.origin'), ev('DC_T[1].mo-DC_T[0].mo'));
  assert.match(ev('opsLine(S.ops.log[0])'), /started a bigger origin in Frankfurt/);
  // A campus (2.5M) does not fit the default 1M budget.
  const B = start(t);
  B.ev("S.cnt.dc[S.home].t=1;S.cnt.cc.DE.d=5000;compute();S.ops.on.origin=true;S.ops.p.origin={grow:true};opsDay(S.day)");
  assert.equal(B.ev('S.cnt.dc[S.home].up'), undefined);
  assert.ok(B.ev("S.ops.log[0].r.some(x=>x[0]==='broke')"));
  B.ev("S.ops.cap.origin=3e6;opsDay(S.day)");
  assert.equal(B.ev('S.cnt.dc[S.home].up.t'), 2);
  assert.deepEqual(h.errors, []); assert.deepEqual(B.errors, []);
});

test('during a change freeze the intern touches nothing, and the week report says so once', t => {
  const h = start(t), { ev } = h;
  ev("S.cnt.cc.DE.d=1000;compute();for(const k of ['boxes','prefill','origin','transit','ports','pni','ix','repair'])S.ops.on[k]=true;S.ops.p.boxes={pay:0};S.ops.p.origin={grow:true};S.ops.cap.boxes=0");
  ev("S.day=70;S.ops.wk=null;S.cnt.evs=[{id:'e',n:1,reg:'EU',mul:3,gain:0.2,fee:1,day:S.day+1,w:1}]");
  assert.ok(ev('cntFrozen()'));
  assert.match(ev('opsMood()'), /Change freeze for .* sitting on their hands/);
  const c0 = ev('S.cash'), snap = ev("JSON.stringify([S.cnt.box,S.cnt.dc,S.transit,S.pni,S.ixp,S.peers])");
  for (let i = 0; i < 3; i++) ev('opsDay(S.day);S.day++');
  assert.equal(ev('S.cash'), c0);
  assert.equal(ev("JSON.stringify([S.cnt.box,S.cnt.dc,S.transit,S.pni,S.ixp,S.peers])"), snap);
  assert.match(ev('opsLine(S.ops.log[0])'), /kept both hands off the network for a live event/);
  assert.equal(ev('S.ops.wk.n.freeze'), 3);
  // The week turns: one NOC note, with the freeze in it once.
  ev("S.cnt.evs=[];S.day=77;opsDay(S.day)");
  const note = ev("S.log.find(l=>/week/.test(l.t)).t");
  assert.match(note, /kept both hands off the network for 3 days of live events/);
  assert.equal(note.split('kept both hands').length, 2);
  // Thawed: back to work.
  assert.ok(ev('S.cnt.box.length') > 0);
  assert.deepEqual(h.errors, []);
});

test('old saves load: the new orders start off, odd settings are repaired, and the log survives a round trip', t => {
  const h = start(t), { ev } = h;
  ev("S.ops.on.boxes=true;S.ops.p.boxes={pay:6,at:'lots'};S.ops.cap.origin=0;S.ops.log.unshift({d:S.day,i:'kevin',r:[['freeze',1,[]],['boxes',2,[S.home+' dtk','<b>']]]});S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ops.on.boxes'), true);
  assert.equal(ev("opsP('boxes','pay')"), 6);
  assert.equal(ev("opsP('boxes','at')"), 80);
  assert.equal(ev("opsCap('origin')"), 1e6, 'no sneaking in an unlimited origin budget');
  assert.equal(ev("JSON.stringify(S.ops.log[0].r)"), JSON.stringify([['freeze', 1, []], ['boxes', 2, ['fra dtk']]]));
  ev("delete S.ops.on.boxes;delete S.ops.on.origin;delete S.ops.spent.prefill;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ops.on.boxes'), false);
  assert.equal(ev('S.ops.on.origin'), false);
  assert.equal(ev('S.ops.spent.prefill'), 0);
  assert.deepEqual(h.errors, []);
});
