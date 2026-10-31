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

test('a DDoS-protection customer under attack who goes down, or is blackholed, is paid out once per attack', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("S.biz.push({id:'p',type:'scrub',name:'Shield',city:'fra',bw:5,rate:900,mood:80,since:0,reqs:[]});compute()");
  flood(ev, { tgt: 'p', vec: 'http', gbps: 60, until: ev('S.day') + 3 });
  ev('dayTick();dayTick()');
  assert.equal(ev('S.stats.sla'), 1, 'once, not every day');
  assert.ok(ev("S.biz.find(b=>b.id==='p').mood") < 80, 'and it remembers');
  // A second attack on the same customer bills again; one on someone else does not bill it.
  flood(ev, { tgt: 'p', vec: 'http', gbps: 60, until: ev('S.day') + 2 });
  flood(ev, { tgt: 'g', vec: 'http', gbps: 1, until: ev('S.day') + 2 });
  ev('dayTick()');
  assert.equal(ev('S.stats.sla'), 2);
  assert.deepEqual(errors, []);
});

test('overlapping attacks have their own cards and buttons and end on their own', () => {
  const { ev, errors } = load();
  fra(ev);
  const a = flood(ev, { gbps: 3, until: ev('S.day') + 1 }), b = flood(ev, { tgt: 'd', gbps: 300, until: ev('S.day') + 3 });
  ev("UI.left='noc';renderLeft()");
  assert.equal(ev("document.querySelectorAll('#left .inc.ddos').length"), 2);
  ev(`ACT.rtbh({id:'${b}'})`);
  assert.equal(ev(`ddosAll().find(x=>x.id==='${a}').bh`), false, 'blackholing one leaves the other alone');
  ev('dayTick()');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(ddosAll().map(x=>x.id))')), [b]);
  assert.deepEqual(errors, []);
});

test('Hackback 3000 is still a gamble', () => {
  const { ev, errors } = load();
  fra(ev);
  const id = flood(ev, { gbps: 3 });
  ev(`const r=Math.random;Math.random=()=>0.1;ACT.hackback({id:'${id}'});Math.random=r`);
  assert.equal(ev('ddosAll().length'), 0, 'a lucky strike ends it');
  assert.equal(ev('S.stats.hackback'), 1, 'paid for');
  const id2 = flood(ev, { gbps: 3 });
  ev(`const r=Math.random;Math.random=()=>0.9;ACT.hackback({id:'${id2}'});Math.random=r`);
  assert.equal(ev('ddosAll().length'), 1, 'an unlucky one hits someone else');
  assert.ok(ev('S.stats.vigilante') >= 1);
  assert.deepEqual(errors, []);
});

test('a sacrificial PNI takes all of its peer\'s junk, and a clean pipe scrubs a transit upstream', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("ACT.buyTransit({city:'fra',net:'lvl',tier:1});S.transit[0].clean=true;compute()");
  const id = flood(ev, { gbps: 150 });
  const ports = JSON.parse(rep(ev, id, 'JSON.stringify(m.portList.map(p=>[p.lab,Math.round(p.off)]))'));
  assert.equal(ports.length, 2);
  assert.ok(ports.find((p) => /Cogentle/.test(p[0]))[1] < ports.find((p) => !/Cogentle/.test(p[0]))[1] / 5, `the clean pipe took most of its share: ${JSON.stringify(ports)}`);
  // A PNI with a network that also comes in over transit: once sacrificial, that network's junk goes only there.
  ev("S.pni.push({id:'px',city:'fra',net:'ggl',tier:1,ready:0,sacrif:true});S.ev.ddos=null;S.ev.ddosMore=[];compute()");
  const id2 = flood(ev, { gbps: 150 });
  assert.ok(rep(ev, id2, "m.portList.some(p=>p.k==='p')"), 'junk arrives on the sacrificial PNI');
  assert.deepEqual(errors, []);
});

test('several scrubbing centers share a flood by size, and a far one costs the target latency', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("for(const c of ['ams','nyc'])ACT.buildPop({city:c});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.pending={a:'ams',b:'nyc'};ACT.buildLink({tier:1});closeModal();S.scrubs=[{city:'ams',tier:1},{city:'nyc',tier:0}];S.scrubMode='always';compute()");
  const id = flood(ev, { gbps: 550 });
  const parts = JSON.parse(rep(ev, id, 'JSON.stringify(m.parts.map(p=>[p.city,Math.round(p.a)]))'));
  assert.deepEqual(parts, [['ams', 500], ['nyc', 50]]);
  assert.ok(ev("R.haul.find(q=>q.to==='nyc').ms") > ev("R.haul.find(q=>q.to==='ams').ms"), 'across the Atlantic and back');
  assert.match(ev("ddosOne(ddosAll()[0])"), /detour via New York/);
  assert.deepEqual(errors, []);
});

test('RackNet and TeamSpooked need gaming customers and slip past Flowspec; amplification floods do not', () => {
  const { ev, errors } = load();
  fra(ev);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(ddosVectors(false).filter(v=>DDOS_VEC[v].gaming))")), []);
  assert.ok(ev("ddosVectors(true).includes('racknet')&&ddosVectors(true).includes('teamspooked')"));
  assert.equal(ev("DDOS_VEC.racknet.fs||DDOS_VEC.teamspooked.fs||DDOS_VEC.ack.fs"), false);
  assert.ok(ev("DDOS_VEC.memcached.fs&&DDOS_VEC.dns.fs"));
  // A gaming target draws gaming vectors; a DIA customer never does.
  const vecs = JSON.parse(ev("__reseed(4);ddosPickTgt=()=>['d','fra'];const o=[];for(let i=0;i<60;i++){S.ddosStarts=[];const a=ddosAttack(false);if(a)o.push(a.vec);}JSON.stringify(o)"));
  assert.ok(vecs.every((v) => !['racknet', 'teamspooked'].includes(v)));
  assert.deepEqual(errors, []);
});

test('an attack started during the day is announced and scored after the day\'s routing', () => {
  const { ev, errors } = load();
  fra(ev);
  ev("S.day=60;window.__t=[];const t=toast;toast=(m,k)=>{window.__t.push(m);return t(m,k)};const a=ddosAttack(false);a.until=S.inc.at(-1).until=S.day+3;dayTick()");
  assert.equal(ev('ddosAll().length'), 1);
  assert.ok(ev('ddosAll()[0].worst') !== undefined, 'scored on its first day');
  assert.equal(ev('ddosAll()[0].fresh'), undefined, 'and announced');
  assert.ok(ev("window.__t.some(m=>/attack is hitting/.test(m))"));
  assert.deepEqual(errors, []);
});
