// Where a flood goes and who pays for it: junk enters at its ingress ports and rides your backbone to the victim.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt has the eyeballs and no transit; all transit is in Amsterdam, 100G of wave away.
const remoteTransit = (ev, flip) => {
  ev("ACT.start({});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;ACT.buildPop({city:'ams'});ACT.launchBB({city:'fra'});S.links.push({id:'L',a:'fra',b:'ams',kind:'wave',tier:1,km:400,mo:1,cut:0});ACT.buyTransit({city:'ams',net:NETS.find(n=>sellsAt(n,'ams')).id,tier:1})");
  if (flip) ev("const p=S.pops;S.pops={ams:p.ams,fra:p.fra}");
  ev("compute()");
};

test('a flood loads the backbone and the victim as on main, whatever order the POPs were built in', () => {
  const out = [];
  for (const flip of [false, true]) {
    const { ev, errors } = load({ seed: 5 });
    remoteTransit(ev, flip);
    assert.ok(ev("sfOf(R,'fra')") > 0.95, 'fine before the attack');
    ev("S.day=60;ddosAttack();Object.assign(S.ev.ddos,{city:'fra',vec:'http',gbps:300});compute()");
    assert.equal(ev('S.ev.ddos.entries'), undefined, 'no per-port shares');
    assert.equal(ev('R.load.L'), 100, 'the junk fills the wave between the transit and the victim');
    assert.ok(ev('R.nodeLoad.fra') >= 100, "and the victim's router");
    assert.ok(ev("sfOf(R,'fra')") < 0.05, 'the victim goes dark');
    assert.equal(ev("sfOf(R,'ams')"), 1);
    out.push(ev("JSON.stringify([R.load.L,Object.values(R.useT)[0],sfOf(R,'fra'),R.ddos.length])"));
    assert.deepEqual(errors, []);
  }
  assert.equal(out[0], out[1], 'POP build order does not change the outcome');
});

test('the same flood lands exactly as it does on main (one entry port, the victim\'s router filters it)', () => {
  const { ev, errors } = load({ seed: 5 });
  remoteTransit(ev, false);
  ev("S.pops.fra.rgen=RG.findIndex(r=>r.fs===2);S.day=60;S.ev.ddos={id:'a',city:'fra',vec:'dns',gbps:200,start:S.day,until:S.day+3,entry:{k:'t',id:S.transit[0].id,lab:''},bh:false};compute()");
  // Full Flowspec leaves 15%: 30G of junk on the 100G wave, next to Frankfurt's own traffic.
  assert.ok(Math.abs(ev('R.ddos[0].leak') - 30) < 1e-9);
  assert.ok(Math.abs(ev("R.ef[edgeKey(S.links[0])].net.junk") - 30) < 1e-6);
  assert.deepEqual(errors, []);
});

test('an attack is held or lost at its victim; other POPs and their DDoS-protected customers are not charged', () => {
  const { ev, errors } = load({ seed: 5 });
  ev("ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=1e9;S.nextEvent=1e9;ACT.buildPop({city:'nyc'});for(const c of ['fra','nyc']){S.pops[c].bb={d:50};S.pops[c].rgen=3}");
  ev("S.transit=[{id:'tf',city:'fra',net:'cog',tier:2},{id:'tn',city:'nyc',net:'cog',tier:0}];S.scrubs=[{city:'fra',tier:1}];S.scrubMode='always'");
  // New York is struggling on its own (a 10G port for 200G of eyeballs), and has a DDoS-protected customer.
  ev("S.pops.nyc.bb.d=200;S.biz.push({id:'sc',type:'scrub',name:'Shield',city:'nyc',bw:1,rate:1000,mood:80,since:0})");
  ev("S.day=60;S.ev.ddos={id:'a',city:'fra',vec:'http',gbps:20,start:S.day,until:S.day+3,entry:{k:'t',id:'tf',lab:''}};compute()");
  assert.ok(ev("sfOf(R,'nyc')") < 0.85, 'New York is under water anyway');
  assert.ok(ev("sfOf(R,'fra')") >= 0.97, 'the victim is fine');
  assert.equal(ev('ddosSf(S.ev.ddos)'), ev("sfOf(R,'fra')"));
  ev('dayTick()');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ev.ddos.sla||[])')), [], 'no SLA payout for a customer in another city');
  assert.equal(ev('S.stats.sla||0'), 0);
  ev('S.day=S.ev.ddos.until;ddosExpire()');
  assert.equal(ev('S.stats.ddosOk||0'), 1, 'held at the victim');
  assert.equal(ev('S.stats.ddosLost||0'), 0);
  assert.deepEqual(errors, []);
});

test('fourteen attacks on a big network keep the save small, and 2.0 beta saves with per-port shares still load', () => {
  const fs = require('node:fs'), path = require('node:path');
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8'));
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${JSON.stringify(JSON.stringify(fx.S || fx))}));UI.started=true;compute()`);
  const before = ev('JSON.stringify(S).length');
  ev("S.day=Math.max(S.day,50);for(let i=0;i<14;i++){S.ddosStarts=[];ddosAttack(false);}compute()");
  assert.equal(ev('ddosAll().length'), 14);
  assert.ok(ev('JSON.stringify(S).length') - before < 10000, 'a few hundred bytes per attack');
  // A beta save spread each attack over every port: the shares are dropped and the attack carries on.
  ev("S.ev.ddos.entries=Array.from({length:300},(_,i)=>({k:'p',id:'x'+i,city:S.ev.ddos.city,lab:'',share:1}));S.ev.ddos.entry={k:'distributed',lab:'Distributed ingress'};S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(ev('S.ev.ddos.entries'), undefined);
  assert.equal(ev('S.ev.ddos.entry.k'), 'edge');
  assert.equal(ev('ddosAll().length'), 14);
  assert.match(ev('ddosPanel()'), /Live attack/);
  assert.deepEqual(errors, []);
});

test('spicy chaos stretches exactly the attack (or outage) an incident is about, and saves keep it', () => {
  const { ev, errors } = load({ seed: 99 });
  ev("beginGame('R','fra',{mode:'normal',preset:'bgp'});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});S.links.push({id:'L',a:'fra',b:'ams',kind:'wave',tier:1,km:400,mo:1,cut:0});S.day=50");
  // A link that happens to be cut until the same day as the next attacks must stay as it is.
  ev("S.links[0].cut=S.day+2");
  for (let k = 0; k < 4; k++) ev("const old=Math.random;let n=0;Math.random=()=>n++===3?0:old();ddosAttack();Math.random=old");
  const rows = JSON.parse(ev("JSON.stringify(S.inc.filter(i=>i.type==='ddos').map(i=>[i.until,ddosAll(S,false).find(a=>a.id===i.atk).until]))"));
  assert.equal(rows.length, 4);
  for (const [inc, atk] of rows) { assert.equal(atk, inc, 'the attack lasts as long as its incident'); assert.equal(inc, 52, 'one day, stretched by half'); }
  assert.equal(ev('S.links[0].cut'), 52, 'an unrelated cut ending the same day is not stretched');
  // The longest spicy attack (7 days, stretched to 11) survives a reload.
  ev("S.ev.ddos.until=S.day+11;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ev.ddos.until-S.day'), 11);
  ev("S.ev.ddos.until=S.day+40;S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ev.ddos.until-S.ev.ddos.start'), 11, 'but not longer');
  // Outages are found by their ref: a fiber cut stretches its own link only.
  ev("S.links.push({id:'M',a:'fra',b:'ams',kind:'wave',tier:1,km:400,mo:1,cut:S.day+4});S.links[0].cut=S.day+4;S.links[0].trench='T';addInc({type:'cut',ref:'T',until:S.day+4,msg:'x'})");
  assert.equal(ev("S.links[0].cut-S.day"), 6);
  assert.equal(ev("S.links.find(l=>l.id==='M').cut-S.day"), 4);
  assert.deepEqual(errors, []);
});

test('BGP at 3 a.m. brings about twice On-call\'s DDoS; gaming customers bring their own, busier schedule', () => {
  const picks = {};
  for (const preset of ['oncall', 'bgp']) {
    const { ev, errors } = load({ seed: 7 });
    ev(`beginGame('R','fra',{mode:'normal',preset:'${preset}'});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});S.day=100;compute()`);
    // No daily attacks without gamers, spicy or not.
    ev("window.__n=0;const real=ddosAttack;ddosAttack=()=>{window.__n++;};for(let i=0;i<300;i++)ddosTick();window.__tick=window.__n;window.__n=0;for(let i=0;i<4000;i++)fireFailure();ddosAttack=real");
    assert.equal(ev('window.__tick'), 0, `${preset}: no daily DDoS schedule without gaming customers`);
    picks[preset] = ev('window.__n') * ev('chaosMul()');
    ev("S.biz.push({id:'g',type:'game',name:'G',city:'fra',bw:1,rate:1,mood:80,since:0});window.__n=0;const real=ddosAttack;ddosAttack=()=>{window.__n++;};for(let i=0;i<300;i++)ddosTick();ddosAttack=real");
    assert.ok(ev('window.__n') > 5, `${preset}: gamers attract attacks on their own schedule`);
    assert.deepEqual(errors, []);
  }
  const ratio = picks.bgp / picks.oncall;
  assert.ok(ratio > 1.7 && ratio < 2.3, `about twice the DDoS (${ratio.toFixed(2)}x)`);
});

test('an imported save cannot put HTML in a Flood Season attacker\'s name', () => {
  const { ev, dom, errors } = load({ seed: 5 });
  ev("ACT.startScn({id:'flood',sure:1});S.day=10;ddosAttack();S.ev.ddos.who='<img src=x id=pwn>';S=migrate(JSON.parse(JSON.stringify(S)))");
  assert.equal(ev('S.ev.ddos.who'), undefined, 'only names from the list survive a load');
  ev('S.ev.ddos.who="<img src=x id=pwn2>";ddosDone(S.ev.ddos)');
  assert.equal(dom.window.document.getElementById('pwn'), null);
  assert.equal(dom.window.document.getElementById('pwn2'), null, 'and the toast escapes it anyway');
  assert.deepEqual(errors, []);
});

test('the China licence arrives in a tenth of the time with quick lead times, and the button says so', () => {
  for (const [preset, days] of [['oncall', 45], ['freeze', 5]]) {
    const { ev, errors } = load();
    ev(`beginGame('C','fra',{mode:'normal',preset:'${preset}'});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9`);
    assert.match(ev("tr('link_panels.apply_for_a_license_price_mo_n_days',{price:'$1',mo:'$1',n:leadDays(45)})"), new RegExp(`~${days} days`));
    ev('ACT.applyCn()');
    assert.equal(ev('S.cnLic.ready-S.day'), days, preset);
    assert.deepEqual(errors, []);
  }
});

test('Flood Season escalates from ordinary floods to monsters, and empty POPs or no customers do not hold floods for free', () => {
  const { ev, errors } = load({ seed: 5 });
  ev("ACT.startScn({id:'flood',sure:1});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'ams'});ACT.buyTransit({city:'ams',net:NETS.find(n=>sellsAt(n,'ams')).id,tier:1});compute()");
  const sizes = JSON.parse(ev("const o=[];for(let i=0;i<60;i++){dayTick();for(const a of ddosAll())if(a.start===S.day)o.push(a.gbps);}JSON.stringify(o)"));
  assert.ok(sizes.some(g => g < 100), `some ordinary floods early on (${sizes.join(' ')})`);
  assert.ok(sizes.some(g => g >= 1000), 'and some terabit monsters');
  // Ten empty POPs: floods still go for Amsterdam, where the customers are.
  ev("for(const c of ['lon','par','fra','mad','mil','vie','waw','sto','osl','hel'])ACT.buildPop({city:c});compute();S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[]");
  ev("for(let i=0;i<10;i++){S.ddosStarts=[];ddosAttack(false);}");
  assert.deepEqual(JSON.parse(ev('JSON.stringify([...new Set(ddosAll().map(a=>a.city))])')), ['ams']);
  // A flood on a city with nobody to serve only holds if the tools soak it up.
  ev("S.ev.ddosMore=[];S.ev.ddos={id:'e',city:'lon',vec:'http',gbps:500,start:S.day,until:S.day+2,entry:{k:'edge',lab:''}};compute()");
  assert.equal(ev("R.cityDem.lon||0"), 0);
  assert.ok(ev('ddosSf(S.ev.ddos)') < 0.97, 'unmitigated: not held');
  ev("S.scrubs=[{city:'lon',tier:1}];S.scrubMode='always';compute()");
  assert.equal(ev('ddosSf(S.ev.ddos)'), 1, 'scrubbed: held');
  assert.deepEqual(errors, []);
});
