// DDoS, as networks see it (#242): sizes come from the world, a flood enters on every port the internet reaches you
// on, a full port slows everyone on it, RTBH saves everyone but the target, Flowspec cleans inside within each router's
// rule budget, and an engaged scrubbing center pulls the flood onto its own ingress.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

// Frankfurt with 200 G of subscribers, one 100G Cogentle transit, a game server (the target) and a DIA customer.
function fra(ev, rg = 'Arrrhipster 7280R') {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev(`S.pops.fra.rgen=RG.findIndex(r=>r.n===${JSON.stringify(rg)})`);
  ev("S.biz.push({id:'g',type:'game',name:'Lag Lords',city:'fra',bw:10,rate:100,mood:80,since:0,reqs:[]},{id:'d',type:'dia',name:'Bystander',city:'fra',bw:5,rate:100,mood:80,since:0,reqs:[]});compute()");
}
const flood = (ev, o) => ev(`(()=>{const a=Object.assign({id:'a'+Math.random().toString(36).slice(2,7),city:'fra',tgt:'g',vec:'dns',gbps:200,start:S.day,until:S.day+2,bh:false},${JSON.stringify(o || {})});if(!S.ev.ddos)S.ev.ddos=a;else S.ev.ddosMore.push(a);compute();return a.id})()`);
const rep = (ev, id, expr) => ev(`(()=>{const m=ddosReport(ddosAll().find(a=>a.id==='${id}'));return ${expr};})()`);
const sfB = (ev, id) => ev(`bizSf(S.biz.find(b=>b.id==='${id}'),linkIds())`);

test('sizes come from the world: the same draws give the same floods however big you are', () => {
  const { ev, errors } = load({ seed: 3 });
  const SAVE = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  ev(`S=migrate(JSON.parse(${JSON.stringify(SAVE)}));S.day=400;compute()`);
  const draw = () => JSON.parse(ev("__reseed(42);JSON.stringify(Array.from({length:2000},()=>ddosSize({tgt:ddosPickTgt()[0]})))"));
  const xs = draw().sort((a, b) => a - b);
  assert.ok(xs[1000] < 60, `median ${xs[1000]} G on a network carrying ${Math.round(ev('R.demand'))} G`);
  assert.ok(xs[1999] <= ev('DD_REC'), 'never past the record');
  assert.ok(xs[1980] > 300, 'but the tail is real');
  ev("for(const c in S.pops)if(S.pops[c].bb)S.pops[c].bb.d*=10;compute()");
  assert.deepEqual(draw().sort((a, b) => a - b), xs, 'ten times the subscribers, the same attacks');
  assert.deepEqual(errors, []);
});

test('a flood bigger than its port fills it and slows everyone on it; Flowspec behind the port cannot help', () => {
  const { ev, errors } = load();
  fra(ev);
  const id = flood(ev, { gbps: 200 });
  assert.equal(rep(ev, id, 'm.full'), 1, 'the 100G transit is full');
  assert.ok(rep(ev, id, 'm.fs') > 50, 'Flowspec drops what got in');
  assert.ok(sfB(ev, 'd') < 0.9, `the bystander is slowed: ${sfB(ev, 'd')}`);
  assert.ok(ev(`ddosCol(ddosAll()[0])`) >= 0.01, 'and it counts as collateral');
  assert.ok(ev("R.ddosHot.fra") === 1, 'the map marks the full port');
  assert.match(ev("ddosOne(ddosAll()[0])"), /RTBH the target/, 'the NOC suggests RTBH');
  assert.deepEqual(errors, []);
});

test('RTBH saves everyone else and sends only the target dark', () => {
  const { ev, errors } = load();
  fra(ev);
  const id = flood(ev, { gbps: 200 });
  const mood = ev("S.biz.find(b=>b.id==='g').mood");
  ev(`ACT.rtbh({id:'${id}'})`);
  assert.equal(rep(ev, id, 'm.full'), 0, 'the port is clear: transit dropped it upstream');
  assert.equal(sfB(ev, 'g'), 0, 'the target is dark');
  assert.ok(sfB(ev, 'd') >= 0.97, 'the bystander is fine');
  assert.equal(ev("S.biz.find(b=>b.id==='g').mood"), mood - 25, 'the target remembers');
  // While it lasts the target's mood does not bleed every day, and it is not counted as held.
  ev('dayTick()');
  assert.equal(ev("S.biz.find(b=>b.id==='g').mood"), mood - 25);
  ev(`ddosAll()[0].until=S.day;dayTick()`);
  assert.equal(ev('S.stats.ddosSac'), 1);
  assert.equal(ev('S.stats.ddosOk||0'), 0);
  assert.deepEqual(errors, []);
});

test('the same flood spread over eight POPs fills no port', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("const cs=['ams','lon','par','zrh','mad','mil','vie'];for(const c of cs){ACT.buildPop({city:c});ACT.buyTransit({city:c,net:'cog',tier:1});}let p='fra';for(const c of cs){UI.pending={a:p,b:c};ACT.buildLink({tier:1});p=c;}closeModal();compute()");
  const id = flood(ev, { gbps: 200 });
  assert.equal(rep(ev, id, 'm.portList.length'), 8);
  assert.equal(rep(ev, id, 'm.full'), 0);
  assert.ok(sfB(ev, 'd') >= 0.97);
  assert.deepEqual(errors, []);
});

test('Flowspec rules are finite on each router: the third flood on a two-rule router passes unfiltered', () => {
  const { ev, errors } = load();
  fra(ev, 'Mikrowtik CCR');
  const ids = [flood(ev, { gbps: 5 }), flood(ev, { gbps: 5, start: ev('S.day') + 0.1 }), flood(ev, { gbps: 5, start: ev('S.day') + 0.2 })];
  assert.deepEqual(ids.map((id) => rep(ev, id, 'm.fsAt.length')), [1, 1, 0]);
  assert.deepEqual(JSON.parse(rep(ev, ids[2], 'JSON.stringify(m.fsFull)')), ['fra']);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(R.fsUse.fra)")), { used: 2, cap: 2 });
  // A carpet bomb needs four rules: none fit.
  ev("S.ev.ddos=null;S.ev.ddosMore=[];compute()");
  const c = flood(ev, { gbps: 5, carpet: true });
  assert.equal(rep(ev, c, 'm.fsAt.length'), 0);
  // No signature, no rule: an HTTP flood never matches.
  ev("S.ev.ddos=null;S.ev.ddosMore=[];S.pops.fra.rgen=RG.findIndex(r=>r.fsN===42);compute()");
  const h = flood(ev, { gbps: 5, vec: 'http' });
  assert.equal(rep(ev, h, 'm.fs'), 0);
  ev("selectCity('fra');UI.tab='infra';renderPanel()");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Flowspec rules0 \/ 42 in use/);
  assert.deepEqual(errors, []);
});

test('an engaged scrubbing center pulls the flood off your ports; what it cannot clean hurts only the target', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("S.scrubs=[{city:'fra',tier:1}];S.scrubMode='always';compute()");
  const id = flood(ev, { gbps: 2000, vec: 'http' });
  assert.equal(rep(ev, id, 'm.portList.length'), 0, 'nothing on the ordinary ports');
  assert.equal(rep(ev, id, 'Math.round(m.cleaned)'), 1000, 'the 1T sponge is full');
  assert.ok(sfB(ev, 'd') >= 0.97, 'the bystander never notices');
  const t = sfB(ev, 'g');
  assert.ok(t > 0.3 && t < 0.7, `the target gets what the center lets through: ${t}`);
  // On-demand: half the flood comes to the center on the first day, all of it after; with auto off, it waits for you.
  ev("S.scrubMode='ondemand';compute()");
  assert.equal(rep(ev, id, 'm.eng'), 0.5);
  ev("S.day++;compute()");
  assert.equal(rep(ev, id, 'm.eng'), 1);
  ev("S.ddosAuto.scrub=false;compute()");
  assert.equal(rep(ev, id, 'm.eng'), 0);
  assert.match(ev("ddosOne(ddosAll()[0])"), /Engage scrubbing/);
  ev(`ACT.ddosEngage({id:'${id}'})`);
  assert.equal(rep(ev, id, 'm.eng'), 0.5);
  assert.deepEqual(errors, []);
});

test('Auto-RTBH pulls the plug when a flood fills ports and hurts others', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("ACT.ddosAuto({k:'rtbh'});S.day=60");
  ev("__reseed(9);const real=ddosSize;ddosSize=()=>300;const a=ddosAttack(true);ddosSize=real;window.__a=a.id");
  assert.equal(ev('ddosAll()[0].bh'), true);
  assert.equal(ev('ddosCol(ddosAll()[0])') < 0.01, true);
  assert.deepEqual(errors, []);
});

test('held, sacrificed and got through are scored at the end', () => {
  const { ev, errors } = load();
  fra(ev);
  flood(ev, { gbps: 2, until: ev('S.day') + 1 });
  ev('dayTick();dayTick()');
  assert.equal(ev('S.stats.ddosOk'), 1, 'a small flood is held');
  flood(ev, { gbps: 200, until: ev('S.day') + 1 });
  ev('dayTick();dayTick()');
  assert.equal(ev('S.stats.ddosLost'), 1);
  assert.equal(ev('S.stats.ddosCol'), 1, 'it hurt the bystander');
  assert.deepEqual(errors, []);
});

test('how often: never in Change Freeze, Sandbox or puzzles; BGP at 3 a.m. about twice On-call', () => {
  const count = (preset, mode = 'normal') => {
    const { ev } = load({ seed: 11 });
    ev(`beginGame('T','fra',${JSON.stringify({ mode, preset })});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;ACT.launchBB({city:'fra'})`);
    return ev("window.__n=0;const real=ddosAttack;ddosAttack=()=>{window.__n++;};for(let d=41;d<1136;d++){S.day=d;ddosTick();}ddosAttack=real;window.__n");
  };
  const oncall = count('oncall'), bgp = count('bgp');
  assert.ok(oncall >= 15 && oncall <= 45, `On-call: ${oncall} attacks in three years`);
  assert.ok(bgp / oncall > 1.5 && bgp / oncall < 2.6, `BGP ${bgp} vs On-call ${oncall}`);
  assert.equal(count('freeze'), 0);
  assert.equal(count('oncall', 'sandbox'), 0);
});

test('saves before 2.2 load: an attack on a city finds its target, and an IX blackhole is dropped', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("const s=JSON.parse(JSON.stringify(packSave(S)));s.ev={ddos:{id:'old',city:'fra',vec:'dns',gbps:80,until:S.day+2,start:S.day,bh:false,ixbh:true,entry:{k:'t',id:'x',lab:'y'}},ddosMore:[{id:'o2',city:'fra',vec:'ntp',gbps:5,until:S.day+2,start:S.day,tgt:'nobody'}]};S=migrate(s);compute()");
  assert.equal(ev('S.ev.ddos.tgt'), 'g', 'the most attractive customer in the city');
  assert.equal(ev('S.ev.ddos.ixbh'), undefined);
  assert.equal(ev('S.ev.ddos.entry'), undefined);
  assert.equal(ev('S.ev.ddosMore[0].tgt'), 'g');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ddosAuto)')), { rtbh: false, scrub: true });
  ev("const s=JSON.parse(JSON.stringify(packSave(S)));s.ddosAuto='yes';s.stats.ddT='x';S=migrate(s)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ddosAuto)')), { rtbh: false, scrub: true });
  ev('for(let i=0;i<3;i++)dayTick()');
  assert.deepEqual(errors, []);
});

test('the NOC card fits a phone and the sandbox can send a test flood', () => {
  const { ev, errors, dom } = load();
  ev("beginGame('T','fra',{mode:'sandbox',preset:'sandbox'});if(UI.pendGame)ACT.pitchSkip();ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});UI.left='noc';renderLeft()");
  const b = dom.window.document.querySelector('[data-act=ddosTest]');
  assert.ok(b, 'a test flood button in Sandbox');
  b.click();
  assert.equal(ev('ddosAll().length'), 1);
  ev("UI.left='noc';renderLeft()");
  const card = dom.window.document.querySelector('#left .inc.ddos');
  assert.ok(card, 'the card is shown');
  assert.ok(card.querySelectorAll('.btns').length <= 2, 'one suggestion, the rest behind More');
  assert.deepEqual(errors, []);
});
