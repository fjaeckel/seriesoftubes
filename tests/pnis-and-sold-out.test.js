const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});for(const c in S.pops)S.pops[c].rgen=3;compute()");
}

test('PNIs with the big networks take a month, now and then 6 to 12, and start at 100G; small ones take weeks', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("R.demTo.nfx=1e4;ACT.pni({city:'fra',net:'nfx',tier:0})");
  assert.equal(ev('S.pni.length'), 0, 'no 10G PNI with NetChill');
  assert.match(ev("document.getElementById('toasts').textContent"), /does not do 10G/);
  // one order in seven gets lost in provisioning for months
  ev("Math.random=()=>0.1;R.demTo.nfx=1e4;ACT.pni({city:'fra',net:'nfx',tier:1})");
  const p = JSON.parse(ev('JSON.stringify(S.pni[0])'));
  assert.ok(p.ready - ev('S.day') >= 180 && p.ready - ev('S.day') <= 365, `six to twelve months (${p.ready - ev('S.day')} days)`);
  ev('compute()');
  assert.equal(ev('R.usePni[S.pni[0].id]||0'), 0, 'nothing flows before delivery');
  assert.equal(ev('R.cost.pni'), 0, 'and nothing is billed');
  ev('S.nextFail=S.nextEvent=1e9;S.pni[0].ready=S.day+1;dayTick();compute()');
  assert.ok(ev('R.usePni[S.pni[0].id]') > 0, 'delivered on the day');
  // an upgrade is an augment on order: the old port keeps working meanwhile
  ev("R.demTo.nfx=1e4;ACT.pni({city:'fra',net:'nfx',tier:2})");
  assert.equal(ev('S.pni[0].tier'), 1);
  assert.equal(ev('S.pni[0].up.tier'), 2);
  ev('ACT.lagP({id:S.pni[0].id,d:1})');
  assert.equal(ev('S.pni[0].up.n'), 1, 'one augment at a time');
  ev('S.day=S.pni[0].up.ready-1;dayTick()');
  assert.equal(ev('S.pni[0].tier'), 2);
  assert.equal(ev('S.pni[0].up'), undefined);
  // chasing it does nothing, mostly
  ev("Math.random=()=>0.5;R.demTo.nfx=1e4;ACT.pni({city:'fra',net:'nfx',tier:3});const r0=S.pni[0].up.ready;ACT.pniChase({id:S.pni[0].id});window.__r=[r0,S.pni[0].up.ready]");
  const [r0, r1] = JSON.parse(ev('JSON.stringify(__r)'));
  assert.equal(r0, r1);
  // most orders arrive in about a month
  ev("Math.random=()=>0.5;S.pni=[];R.demTo.ggl=1e4;ACT.pni({city:'fra',net:'ggl',tier:1})");
  assert.equal(ev("S.pni.find(p=>p.net==='ggl').ready-S.day"), 30);
  ev("S.pni=S.pni.filter(p=>p.net!=='ggl')");
  // a beer at a conference halves the wait
  ev("Math.random=()=>0.99;S.conf={until:S.day+10,reg:'EU',name:'RIPE'}");
  assert.equal(ev("pniLead('ggl')"), 15, 'the usual month, halved');
  ev('Math.random=()=>0.1');
  assert.equal(ev("pniLead('ggl')"), Math.round((180 + Math.floor(0.1 * 186)) / 2), 'a slow one, halved');
  ev('Math.random=()=>0.99');
  ev('S.conf=null');
  // a small network: a few weeks
  const small = ev("NETS.find(n=>n.pops.includes('fra')&&!pniBig(n.id)&&n.pol==='open'&&n.type!=='cdn').id");
  ev(`Math.random=()=>0.99;ACT.pni({city:'fra',net:'${small}',tier:0})`);
  const lead = ev(`S.pni.find(p=>p.net==='${small}').ready-S.day`);
  assert.ok(lead >= 14 && lead <= 42, `weeks, not months (${lead})`);
  assert.deepEqual(errors, []);
});

test('Doitsche Telekomm sells 1G PNIs; nobody else does', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("S.lvl=10;ACT.pni({city:'fra',net:'nfx',tier:-1})");
  assert.equal(ev('S.pni.length'), 0);
  assert.equal(ev("peerOk('dtk','pni','fra').ok"), true);
  ev("ACT.pni({city:'fra',net:'dtk',tier:-1})");
  assert.equal(ev('S.pni[0].g1'), true);
  ev('S.pni[0].ready=S.day;compute()');
  assert.equal(ev('pniG(S.pni[0])'), 1);
  assert.equal(ev("liveCap(pniG(S.pni[0]),'fra','a',1)"), 1);
  assert.equal(ev('pniPN(S.pni[0])'), '1G');
  // and 1G grows into 10G
  ev("ACT.pni({city:'fra',net:'dtk',tier:0})");
  assert.equal(ev('S.pni[0].up.tier'), 0);
  ev('S.day=S.pni[0].up.ready-1;dayTick()');
  assert.equal(ev('S.pni[0].g1'), undefined);
  assert.equal(ev('pniG(S.pni[0])'), 10);
  ev("selectCity('fra');ACT.tab({t:'peer'})");
  assert.deepEqual(errors, []);
});

test('Microsnoft has no capacity on the US east coast, at any price', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("for(const c of ['ash','nyc','hou'])ACT.buildPop({city:c});R.demTo.msf=1e5");
  for (const c of ['ash', 'nyc', 'bos', 'atn', 'mia']) {
    assert.equal(ev(`peerOk('msf','pni','${c}').ok`), false, c);
    assert.equal(ev(`peerOk('msf','ix','${c}').ok`), false, c);
  }
  assert.match(ev("peerOk('msf','pni','ash').why"), /capacity|sold out|coming online/i);
  assert.equal(ev("peerOk('msf','pni','hou').ok"), true, 'Houston is fine');
  ev("ACT.pni({city:'ash',net:'msf',tier:1})");
  assert.equal(ev("S.pni.filter(p=>p.city==='ash').length"), 0);
  assert.equal(ev("peerOk('ggl','pni','ash').ok"), ev("R.demTo.ggl>=Math.round(NET.ggl.minPni)"), 'other networks are not affected');
  assert.deepEqual(errors, []);
});

test('saves: PNIs on order survive, and garbage is repaired', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("S.pni.push({id:'x',city:'fra',net:'dtk',tier:0,g1:true,ready:S.day+30,up:{tier:'9',n:99,ready:'x'}},{id:'y',city:'fra',net:'nfx',tier:1,g1:true})");
  ev('const o=JSON.parse(JSON.stringify(S));sanitize(o);window.__o=o');
  assert.equal(ev("__o.pni.find(p=>p.id==='x').up.n"), ev('LAG_MAX'));
  assert.equal(ev("__o.pni.find(p=>p.id==='x').g1"), true);
  assert.equal(ev("__o.pni.find(p=>p.id==='y').g1"), undefined, 'only Doitsche Telekomm does 1G');
  assert.deepEqual(errors, []);
});

test('now and then a route is sold out of a wave size, for a while, and asking again does not reroll it', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3");
  assert.equal(ev("S.day=10;!!soldOut('fra','ams',3,null)||!!soldOut('fra','ams',1,null)"), false, 'never in the first 90 days');
  // find a day when 400G is sold out between Frankfurt and Amsterdam
  const day = ev("(()=>{for(let d=90;d<20000;d++){S.day=d;if(soldOut('fra','ams',2,null))return d;}return -1;})()");
  assert.ok(day > 0, 'it happens');
  ev(`S.day=${day}`);
  const so = JSON.parse(ev("JSON.stringify(soldOut('fra','ams',2,null))"));
  assert.ok(so.until > day && so.until - day <= 90);
  assert.equal(ev(`S.day=${so.until - 1};!!soldOut('fra','ams',2,null)`), true, 'the same verdict for the whole window');
  ev(`S.day=${day}`);
  const share = ev("(()=>{let n=0;for(let d=90;d<20090;d++){S.day=d;if(soldOut('ams','fra',5,null))n++;}return n/20000;})()");
  assert.ok(share > 0.02 && share < 0.2, `rare, a bit more for big waves (${share})`);
  ev(`S.day=${day};UI.via=null;openLinkModal('fra','ams')`);
  assert.match(ev("document.getElementById('modalCard').textContent"), /sold out for \d+ days/);
  const n = ev('S.links.length');
  ev('ACT.buildLink({tier:2})');
  assert.equal(ev('S.links.length'), n, 'no 400G today');
  assert.match(ev("document.getElementById('toasts').textContent"), /No 400G capacity on this route/);
  assert.deepEqual(errors, []);
});

test('#201 a sold-out wave size cannot be reached by upgrading a smaller wave on the route', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;S.cash=1e9");
  const day = ev("(()=>{for(let d=90;d<20000;d++){S.day=d;if(soldOut('fra','ams',2,null)&&!soldOut('fra','ams',1,null))return d;}return -1;})()");
  assert.ok(day > 0, 'it happens');
  ev(`S.day=${day};S.links.push({id:'upw',a:'fra',b:'ams',kind:'wave',tier:1,km:400,sub:false,cable:null,mo:1,mult:1,trench:'upw',cut:0,day:0})`);
  const cash = ev('S.cash');
  ev("ACT.upLink({id:'upw',tier:2})");
  assert.equal(ev("S.links.find(l=>l.id==='upw').tier"), 1, 'still the old size');
  assert.equal(ev('S.cash'), cash, 'nothing charged');
  assert.match(ev("document.getElementById('toasts').textContent"), /No 400G capacity on this route/);
  // the link panel's button for that size is disabled and says why
  ev("UI.sel={type:'link',id:'upw'};renderPanel()");
  const b = ev(`(()=>{const b=[...document.querySelectorAll('[data-act=upLink]')].find(x=>JSON.parse(x.dataset.args).tier===2);return b?b.disabled+':'+b.textContent:''})()`);
  assert.match(b, /^true:.*sold out/i);
  assert.deepEqual(errors, []);
});
