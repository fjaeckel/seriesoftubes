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
    ev("S.day=60;ddosAttack();Object.assign(S.ev.ddos,{city:'fra',tgt:'bb:fra',vec:'http',gbps:300});compute()");
    assert.equal(ev('R.load.L'), 100, 'the junk fills the wave between the transit and the victim');
    assert.ok(ev('R.nodeLoad.fra') >= 100, "and the victim's router");
    assert.ok(ev("sfOf(R,'fra')") < 0.05, 'the victim goes dark');
    assert.equal(ev("sfOf(R,'ams')"), 1);
    out.push(ev("JSON.stringify([R.load.L,Object.values(R.useT)[0],sfOf(R,'fra'),R.ddos.length])"));
    assert.deepEqual(errors, []);
  }
  assert.equal(out[0], out[1], 'POP build order does not change the outcome');
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

test('fourteen attacks on a big network keep the save small, and 2.0 saves with entry ports still load', () => {
  const fs = require('node:fs'), path = require('node:path');
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8'));
  const { ev, errors } = load({ seed: 3 });
  ev(`S=migrate(JSON.parse(${JSON.stringify(JSON.stringify(fx.S || fx))}));UI.started=true;compute()`);
  const before = ev('JSON.stringify(S).length');
  ev("S.day=Math.max(S.day,50);for(let i=0;i<14;i++){S.ddosStarts=[];ddosAttack(false);}compute()");
  assert.equal(ev('ddosAll().length'), 14);
  assert.ok(ev('JSON.stringify(S).length') - before < 10000, 'a few hundred bytes per attack');
  // Saves from 2.0 and 2.1 brought each attack in on one port: that is dropped, and the attack spreads (#242).
  ev("S.ev.ddos.entries=Array.from({length:300},(_,i)=>({k:'p',id:'x'+i,city:S.ev.ddos.city,lab:'',share:1}));S.ev.ddos.entry={k:'t',lab:'Distributed ingress'};S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(ev('S.ev.ddos.entries'), undefined);
  assert.equal(ev('S.ev.ddos.entry'), undefined);
  assert.equal(ev('ddosAll().length'), 14);
  assert.match(ev('ddosPanel()'), /🚨/);
  assert.deepEqual(errors, []);
});

test('spicy chaos stretches exactly the attack (or outage) an incident is about, and saves keep it', () => {
  const { ev, errors } = load({ seed: 99 });
  ev("beginGame('R','fra',{mode:'normal',preset:'bgp'});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});S.links.push({id:'L',a:'fra',b:'ams',kind:'wave',tier:1,km:400,mo:1,cut:0});S.day=50");
  // A link that happens to be cut until the same day as the next attacks must stay as it is.
  ev("S.links[0].cut=S.day+2");
  // The third draw of an attack is its length: 0 makes it one day.
  for (let k = 0; k < 4; k++) ev("const old=Math.random;let n=0;Math.random=()=>n++===2?0:old();ddosAttack();Math.random=old");
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

test('Flood Season escalates from ordinary floods to monsters, and goes for the people you serve', () => {
  const { ev, errors } = load({ seed: 5 });
  ev("ACT.startScn({id:'flood',sure:1});S.cash=1e9;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'ams'});ACT.buyTransit({city:'ams',net:NETS.find(n=>sellsAt(n,'ams')).id,tier:1});compute()");
  const sizes = JSON.parse(ev("const o=[];for(let i=0;i<60;i++){dayTick();for(const a of ddosAll())if(a.start===S.day)o.push(a.gbps);}JSON.stringify(o)"));
  assert.ok(sizes.length >= 8 && sizes.some(g => g < 100), `a flood every few days, ordinary ones among them (${sizes.join(' ')})`);
  // A third are monsters, and they grow through the year.
  const mix = (day) => JSON.parse(ev(`S.day=${day};__reseed(77);JSON.stringify(Array.from({length:300},()=>ddosSize({tgt:'bb:ams'})))`));
  const early = mix(60), late = mix(360), big = (xs) => xs.filter((g) => g >= 800);
  assert.ok(big(early).length > 70 && big(early).length < 130, `${big(early).length} of 300 are monsters`);
  const med = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
  assert.ok(med(big(late)) > med(big(early)) * 1.4, 'and they grow');
  // Ten empty POPs: floods still go for Amsterdam, where the subscribers are.
  ev("for(const c of ['lon','par','fra','mad','mil','vie','waw','sto','osl','hel'])ACT.buildPop({city:c});compute();S.ev.ddos=null;S.ev.ddosMore=[];S.ddosStarts=[]");
  ev("for(let i=0;i<10;i++){S.ddosStarts=[];ddosAttack(false);}");
  assert.deepEqual(JSON.parse(ev('JSON.stringify([...new Set(ddosAll().map(a=>a.city))])')), ['ams']);
  // A terabit flood on Amsterdam's subscribers: lost without scrubbing, held with a 10T center.
  ev("S.ev.ddosMore=[];S.ev.ddos={id:'e',city:'ams',tgt:'bb:ams',vec:'http',gbps:1500,start:S.day,until:S.day+2};compute()");
  assert.ok(ev('ddosSf(S.ev.ddos)') < 0.97, 'unmitigated: not held');
  ev("S.scrubs=[{city:'ams',tier:2}];S.scrubMode='always';compute()");
  assert.ok(ev('ddosSf(S.ev.ddos)') >= 0.97, 'scrubbed: held');
  assert.ok(ev('ddosCol(S.ev.ddos)') < 0.01);
  assert.deepEqual(errors, []);
});

