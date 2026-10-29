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
  assert.equal(ev("peerOk('ggl','pni','ash').ok"), ev("R.demTo.ggl>=Math.round(NET.ggl.minPni*repMul())"), 'other networks are not affected');
  assert.deepEqual(errors, []);
});

test('the peering inbox fills up, wants answers, and max-prefix alerts are growth or a leak', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;ACT.buyIx({city:'ams',tier:1});S.inbox.pol='selective';compute()");
  ev('for(let i=0;i<60;i++)dayTick()');
  assert.ok(ev('S.inbox.items.length') >= 2, 'mail arrives with an exchange port');
  assert.ok(ev('S.inbox.rep') < 0, 'and ignoring it has a price');
  // accept a real network's request: a bilateral session
  const net = ev("ixMembers('ams').find(id=>{const n=NET[id];return n.type!=='cdn'&&n.type!=='t1'&&n.pol!=='paid'&&n.share<=0.006&&!ixSessions('ams').has(id);})");
  assert.ok(net);
  ev(`S.inbox.items=[{id:901,k:'req',ix:'ams',net:'${net}',day:S.day,stale:false,yrs:1,say:0},{id:902,k:'req',ix:'ams',nm:'Bob’s Bits',asn:212345,day:S.day,stale:true,yrs:7,say:3}];ACT.inbox()`);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Bob’s Bits/);
  ev("ACT.inboxAct({id:901,a:'accept'});ACT.inboxAct({id:902,a:'accept'})");
  assert.equal(ev(`!!S.peers['${net}@ams']`), true);
  assert.equal(ev('S.inbox.tiny[212345].nm'), 'Bob’s Bits');
  ev('compute()');
  assert.equal(ev(`ixSessions('ams').has('${net}')`), true);
  // growth: raising the limit brings the session back
  ev(`S.inbox.items.push({id:903,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:100,got:180,leak:false,yrs:4});S.inbox.down['${net}@ams']=1e9`);
  assert.equal(ev(`ixSessions('ams').has('${net}')`), false, 'down on max-prefix');
  ev("ACT.inboxAct({id:903,a:'raise'})");
  assert.equal(ev(`ixSessions('ams').has('${net}')`), true);
  // a leak: raising the limit is a route leak, keeping it down is right
  ev(`S.inbox.items.push({id:904,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:100,got:987654,leak:true,yrs:4});S.inbox.down['${net}@ams']=1e9;ACT.inboxAct({id:904,a:'raise'})`);
  assert.ok(ev('S.ev.leak&&S.ev.leak.until>S.day'), 'a route leak');
  assert.ok(ev("S.inc.some(i=>i.type==='leak')"));
  ev(`S.inbox.items.push({id:905,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:100,got:987654,leak:true,yrs:4});S.inbox.down['${net}@ams']=1e9;ACT.inboxAct({id:905,a:'keep'})`);
  const back = ev(`S.inbox.down['${net}@ams']`);
  assert.ok(back > ev('S.day') && back < ev('S.day') + 12, 'back on its own in a few days');
  // unanswered requests expire, and the reputation makes selective networks pickier
  ev("S.inbox.items=[{id:906,k:'req',ix:'ams',net:'" + net + "',day:S.day-31,stale:false,yrs:1,say:0}];S.inbox.rep=0;inboxDay(S.day)");
  assert.equal(ev('S.inbox.items.some(x=>x.id===906)'), false);
  assert.ok(ev('S.inbox.rep') < 0);
  ev('S.inbox.rep=-10');
  assert.ok(ev('repMul()') > 1.05 && ev('repMul()') <= 1.1, 'pickier, but never a wall');
  // an alert nobody answers clears itself once the other side notices
  ev(`S.inbox.items=[{id:910,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:100,got:180,leak:false,yrs:4}];S.inbox.down['${net}@ams']=S.day+1;inboxDay(S.day+1)`);
  assert.equal(ev('S.inbox.items.some(x=>x.id===910)'), false);
  // bulk answers
  ev("S.inbox.items=[{id:907,k:'req',ix:'ams',nm:'A',asn:1,day:S.day,say:0,yrs:1},{id:908,k:'req',ix:'ams',nm:'B',asn:2,day:S.day,say:0,yrs:1}];ACT.inboxAll({a:'decline'})");
  assert.equal(ev('S.inbox.items.length'), 0);
  // the Networks tab says how much mail is waiting
  ev("S.inbox.items=[{id:909,k:'req',ix:'ams',nm:'C',asn:3,day:S.day,say:1,yrs:1}];closeModal();UI.left='nets';UI.leftOpen=true;renderLeft()");
  assert.match(ev("document.getElementById('left').textContent"), /Peering inbox/);
  assert.deepEqual(errors, []);
});

test('the AI agent answers everything, costs $20M a year and gets it wrong a lot', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;ACT.buyIx({city:'ams',tier:1});compute()");
  const net = ev("ixMembers('ams').find(id=>{const n=NET[id];return n.type!=='cdn'&&n.type!=='t1'&&n.pol!=='paid'&&n.share<=0.006;})");
  const cash = ev('S.cash');
  ev("ACT.inboxBot({on:1});compute()");
  assert.equal(ev('S.inbox.bot'), true);
  assert.ok(cash - ev('S.cash') >= ev('AI_MO'));
  assert.ok(ev('R.cost.extras') >= ev('AI_MO'), 'billed every month');
  assert.ok(Math.abs(ev('AI_MO*12') - 20e6) < 12);
  // it always gets a leak wrong when the dice say so
  ev(`S.peers['${net}@ams']=true;S.inbox.items=[{id:1,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:50,got:999999,leak:true,yrs:3},{id:2,k:'req',ix:'ams',nm:'D',asn:4,day:S.day,say:0,yrs:1}];S.inbox.down['${net}@ams']=1e9`);
  ev('Math.random=()=>0.1;inboxBot()');
  assert.equal(ev('S.inbox.items.length'), 0, 'inbox zero');
  assert.ok(ev('S.ev.leak&&S.ev.leak.until>S.day'), 'and a route leak');
  assert.ok(ev("S.inbox.log.some(e=>/They seemed nice/.test(tr(e.m,e.a)))"), 'the log keeps a label, read in the language of the player');
  ev('ACT.inbox()');
  assert.match(ev("document.getElementById('modalCard').textContent"), /They seemed nice/);
  // and sometimes it gets it right
  ev(`S.inbox.items=[{id:3,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:50,got:999999,leak:true,yrs:3}];S.ev.leak=null;Math.random=()=>0.9;inboxBot()`);
  assert.ok(!ev('S.ev.leak'));
  ev('ACT.inboxBot({on:0});compute()');
  assert.equal(ev('S.inbox.bot'), false);
  assert.ok(ev('R.cost.extras') < ev('AI_MO'));
  assert.deepEqual(errors, []);
});

test('saves: the inbox and PNIs on order survive, and garbage is repaired', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("S.pni.push({id:'x',city:'fra',net:'dtk',tier:0,g1:true,ready:S.day+30,up:{tier:'9',n:99,ready:'x'}},{id:'y',city:'fra',net:'nfx',tier:1,g1:true})");
  ev("S.inbox={items:[{id:1,k:'req',ix:'ams',nm:'Ok',asn:5,day:1,say:99},{k:'evil',ix:'ams'},{id:2,k:'mp',ix:'nowhere',key:'a'},'x'],down:{'a@b':'7'},tiny:{'12':{nm:'T',ix:'ams'},'no':{ix:'ams'}},rep:99,bot:'yes',log:[{d:1,m:'hi',a:{who:{x:1}}},5],seq:'z'}");
  ev('const o=JSON.parse(JSON.stringify(S));sanitize(o);window.__o=o');
  assert.equal(ev('__o.inbox.items.length'), 1);
  assert.equal(ev('__o.inbox.items[0].say'), ev('REQ_SAY.length-1'));
  assert.equal(ev('__o.inbox.rep'), 5);
  assert.equal(ev('__o.inbox.bot'), true);
  assert.equal(ev("__o.inbox.down['a@b']"), 7);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(Object.keys(__o.inbox.tiny))')), ['12']);
  assert.equal(ev('typeof __o.inbox.log[0].a.who'), 'string');
  assert.equal(ev('__o.inbox.seq'), 1);
  assert.equal(ev("__o.pni.find(p=>p.id==='x').up.n"), ev('LAG_MAX'));
  assert.equal(ev("__o.pni.find(p=>p.id==='x').g1"), true);
  assert.equal(ev("__o.pni.find(p=>p.id==='y').g1"), undefined, 'only Doitsche Telekomm does 1G');
  // an old save without an inbox loads with an empty one
  ev('const p=JSON.parse(JSON.stringify(S));delete p.inbox;sanitize(p);window.__p=p');
  assert.equal(ev('__p.inbox.items.length'), 0);
  assert.equal(ev('__p.inbox.bot'), false);
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

test('#201 upgrading an existing wave respects sold-out route capacity', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=3");
  const day = ev("(()=>{for(let d=90;d<20000;d++){S.day=d;if(soldOut('fra','ams',2,null))return d;}return -1;})()");
  assert.ok(day > 0);
  ev(`S.day=${day}`);
  const so = JSON.parse(ev("JSON.stringify(soldOut('fra','ams',2,null))"));
  ev("UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1})");
  assert.equal(ev('S.links.length'), 1);
  assert.equal(ev('S.links[0].tier'), 1);
  const linkId = ev('S.links[0].id');
  ev(`UI.sel={type:'link',id:'${linkId}'};renderPanel()`);
  assert.match(ev("document.getElementById('panelBody').textContent"), /sold out for \d+ days/);
  ev(`ACT.upLink({id:'${linkId}',tier:2})`);
  assert.equal(ev('S.links[0].tier'), 1, 'wave was not upgraded');
  assert.match(ev("document.getElementById('toasts').textContent"), /No 400G capacity on this route/);
  ev(`S.day=${so.until};renderPanel()`);
  assert.doesNotMatch(ev("document.getElementById('panelBody').textContent"), /sold out for \d+ days/);
  ev(`ACT.upLink({id:'${linkId}',tier:2})`);
  assert.equal(ev('S.links[0].tier'), 2, 'wave upgraded when capacity becomes available');
  assert.deepEqual(errors, []);
});

test('peering policy: open accepts everyone, selective is quieter but manual, closed scares customers; raise all limits at once', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;ACT.buyIx({city:'ams',tier:1});ACT.rs({city:'ams'});compute()");
  assert.equal(ev("ppol()"), 'open', 'open by default, as before');
  const rsOpen = ev("ixSessions('ams').size");
  assert.ok(rsOpen > 0, 'the route server works');
  // open: requests are accepted as they come in
  ev("Math.random=()=>0.01;inboxDay(S.day+1)");
  assert.equal(ev("S.inbox.items.filter(x=>x.k==='req').length"), 0);
  assert.ok(ev("Object.keys(S.inbox.tiny).length+Object.keys(S.peers).length") > 0, 'and they become sessions');
  // selective: the route server stops counting, you ask yourself, and requests wait for you
  ev("ACT.inboxPol({p:'selective'});compute()");
  assert.ok(ev("ixSessions('ams').size") < rsOpen, 'no route server sessions');
  ev("selectCity('ams');ACT.tab({t:'peer'})");
  assert.match(ev("document.getElementById('panelBody').textContent"), /Off while your peering policy is Selective/);
  ev("closeModal();S.inbox.items=[];inboxDay(S.day+1)");
  assert.equal(ev("S.inbox.items.filter(x=>x.k==='req').length"), 1, 'it waits for an answer');
  // closed: no requests, a sinking reputation, fewer customers calling
  ev("ACT.inboxPol({p:'closed'});S.inbox.items=[];S.inbox.rep=0;for(let i=0;i<10;i++)inboxDay(S.day+1)");
  assert.equal(ev("S.inbox.items.filter(x=>x.k==='req').length"), 0);
  assert.ok(ev('S.inbox.rep') < 0);
  // raise all: every alert at once, leaks included
  const net = ev("ixMembers('ams').find(id=>{const n=NET[id];return n.type!=='cdn'&&n.type!=='t1'&&n.pol!=='paid'&&n.share<=0.006;})");
  ev(`S.peers['${net}@ams']=true;S.inbox.items=[{id:71,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:50,got:80,leak:false,yrs:2},{id:72,k:'mp',key:'t9',nm:'X',asn:9,ix:'ams',day:S.day,lim:50,got:990000,leak:true,yrs:2}];S.inbox.down['${net}@ams']=1e9;ACT.inbox()`);
  assert.match(ev("document.getElementById('modalCard').textContent"), /Raise all max-prefix limits/);
  ev('ACT.inboxRaiseAll()');
  assert.equal(ev("S.inbox.items.length"), 0);
  assert.equal(ev(`!!S.inbox.down['${net}@ams']`), false);
  assert.ok(ev('S.ev.leak&&S.ev.leak.until>S.day'), 'one was a leak');
  assert.match(ev("document.getElementById('toasts').textContent"), /One of them was a route leak/);
  // saves keep the policy
  ev("const o=JSON.parse(JSON.stringify(S));o.inbox.pol='weird';sanitize(o);window.__o=o");
  assert.equal(ev('__o.inbox.pol'), 'open');
  assert.deepEqual(errors, []);
});
