// Tier 1 by customer cone (#85): peering with every Tier 1 reaches their customers and their customers' customers,
// so the long tail stops mattering for the win; networks in nobody's cone still need peering of their own.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// A transit-free network in Frankfurt with a PNI to every Tier 1 it needs.
const t1Club = (ev) => {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;delete S.done.t1;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=500;S.pops.fra.routers=3");
  ev("S.transit=[];S.ixp={};S.peers={};S.pni=[];S.grace=null;for(const n of [...t1Need(),NET.cog])S.pni.push({id:'p'+n.id,net:n.id,city:'fra',tier:2});compute()");
};

test('cones are built once at load and hold customers of customers', () => {
  const { ev, errors } = load();
  assert.equal(ev("CONE.voc.includes('ddo')&&CONE.voc.includes('spn')"), true, 'Hocus Pocus brings its own customers');
  // Doodoo buys from Hocus Pocus, which buys from Not That Telecom: two levels down
  assert.equal(ev("NET.ddo.up.includes('voc')&&NET.voc.up.includes('ntt')"), true);
  assert.equal(ev("CONE_S.ntt.has('ddo')"), true, 'the Tier 1 cone is transitive');
  assert.equal(ev("CONE.ntt[0]"), 'ntt', 'a network is first in its own cone');
  assert.equal(ev("PNI_NETS===CONE"), true);
  assert.equal(ev("ANC.ddo[0]"), 'voc', 'nearest upstream first');
  assert.equal(ev("NETS.filter(n=>n.tail).every(n=>n.up&&n.up.length&&n.up.every(u=>NET[u]))"), true, 'the long tail buys transit');
  assert.equal(ev("NETS.filter(n=>n.tail).every(n=>ANC[n.id].some(u=>NET[u].type==='t1'||u==='cog'))"), true, 'from a transit-free carrier, directly or through an upstream');
  assert.ok(ev("NET.tail45.up.every(u=>NET[u].pops.includes('akl'))"), 'Auckland upstreams have a local PoP');
  assert.equal(ev("NETS.filter(n=>n.tail).map(n=>n.up.join('+')).join()"), ev("NETS.filter(n=>n.tail).map(n=>tailUp(n.name,n.pops).join('+')).join()"), 'stable: picked by name');
  // Australian sales policy and global customer cones answer different questions.
  assert.equal(ev("['tpr','abb','npt','lpt','lnt','pnt','blg','inp'].every(id=>t1Need().some(t=>CONE_S[t.id].has(id)))"), true);
  assert.equal(ev("NETS.filter(n=>sellsAt(n,'syd')).every(n=>AU_SELLERS.includes(n.id))"), true);
  assert.deepEqual(errors, []);
});

test('a transit-free network with PNIs to every Tier 1 reaches the long tail through their cones', () => {
  const { ev, errors } = load();
  t1Club(ev);
  const tail = ev("NETS.find(n=>n.tail&&n.pops.includes('akl')).id");
  for (const id of ['tail0', 'tail38', tail, 'sky', 'kys', 'tim']) {
    assert.equal(ev(`!!R.reachable.${id}`), true, `${id} is reachable`);
    assert.equal(ev(`!!R.nt.${id}`), true, `${id} without transit`);
    assert.equal(ev(`!!R.cone.${id}`), true, `${id} through a peer's cone`);
  }
  // the traffic really goes over the PNI with the upstream, not some made-up exit
  const up = ev("NET.tail0.up[0]");
  assert.ok(ev("(R.netEg.tail0||{}).p") > 0, 'over a PNI');
  assert.ok(ev(`R.usePni['p${up}']`) > 0, 'the PNI with its upstream carries it');
  // the traceroute shows the hand-off to the customer and an AS path one hop longer
  const tr = JSON.parse(ev("JSON.stringify(traceroute('fra',{net:'tail0'}))"));
  assert.match(tr.text, /hands it to its customer/);
  assert.equal(tr.asPath.length, 3, 'you, the Tier 1, the customer');
  assert.equal(tr.asPath[1], ev(`NET.${up}.asn`), 'through the upstream it buys transit from');
  assert.match(tr.why, /customers come after direct peers/);
  assert.deepEqual(errors, []);
});

test('a network in nobody\'s cone still needs reaching directly', () => {
  const { ev, errors } = load();
  t1Club(ev);
  // Jio-graphy buys from no one: no Tier 1 PNI reaches it
  assert.equal(ev("(NET.jio.up||[]).length"), 0);
  assert.equal(ev("R.reachable.jio"), false);
  assert.equal(ev("isTier1()"), false);
  assert.match(ev('t1Why()'), /nobody you peer with sells transit to/);
  // peer with every island directly and the win comes
  ev("for(const n of NETS)if(!R.reachable[n.id])S.pni.push({id:'i'+n.id,net:n.id,city:n.pops[0],tier:0});for(const n of NETS)if(n.pops.length&&!S.pops[n.pops[0]])S.pops[n.pops[0]]={day:0,bb:null,boost:0,down:0,routers:1,gen:false};compute()");
  assert.ok(ev("R.reach") > 0.999, `reach ${ev('R.reach')}`);
  assert.equal(ev("isTier1()"), true);
  assert.deepEqual(errors, []);
});

test('the long tail no longer stands between you and Tier 1', () => {
  const { ev, errors } = load();
  t1Club(ev);
  // peer directly only with the networks in nobody's cone, never with the long tail itself
  ev("for(const n of NETS)if(!R.reachable[n.id]){if(!S.pops[n.pops[0]])S.pops[n.pops[0]]={day:0,bb:null,boost:0,down:0,routers:1,gen:false};S.pni.push({id:'i'+n.id,net:n.id,city:n.pops[0],tier:0});}compute()");
  assert.equal(ev("S.pni.some(p=>NET[p.net].tail)"), false, 'no session with any long-tail network');
  assert.equal(ev("NETS.filter(n=>n.tail).every(n=>R.reachable[n.id])"), true);
  assert.equal(ev("isTier1()"), true);
  // the peers you need directly are all real networks of some size, and fewer than before
  const islands = ev("S.pni.filter(p=>p.id[0]==='i').length");
  assert.ok(islands < 70, `${islands} networks to peer with directly`);
  assert.deepEqual(errors, []);
});

test('a peer\'s cone comes after direct peering and before transit, so peering widely still pays', () => {
  const { ev, errors } = load();
  t1Club(ev);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});S.pni=S.pni.filter(p=>p.net!=='cog');compute()");
  // a Cogentle customer is reached through another Tier 1's cone only if it buys from one; transit is the fallback
  const id = ev("NETS.find(n=>n.tail&&n.up.length===1&&n.up[0]==='tly').id");
  assert.ok(ev(`(R.netEg.${id}||{}).p`) > 0, 'over the PNI with its upstream, not over transit');
  assert.equal(ev(`(R.netEg.${id}||{}).t||0`), 0);
  // a direct session beats the cone: peer with it at the exchange and its traffic moves there
  // eight Tier 1 PNIs and the transit port fill the router (#194): a second one makes room for the exchange port
  ev(`S.pops.fra.bb.d=500;S.pops.fra.routers=2;ACT.buyIx({city:'fra',tier:1,signed:true});ACT.rs({city:'fra'});compute()`);
  if (ev(`ixSessions('fra').has('${id}')`)) {
    assert.ok(ev(`(R.netEg.${id}||{}).ix`) > 0, 'direct peering wins over the cone');
    assert.equal(ev(`(R.netEg.${id}||{}).p||0`), 0);
  }
  // an IX session also brings the member's customers along
  assert.equal(ev("ixSessions('fra').has('gsl')"), true);
  const down = ev("DOWN.gsl.find(id=>!t1Need().some(t=>CONE_S[t.id].has(id))&&!ixSessions('fra').has(id))||''");
  if (down) assert.equal(ev(`R.reachable.${down}`), true, `${down} comes along with Glowball Sakura Lager's session`);
  assert.deepEqual(errors, []);
});

test('old saves keep their win: cones only ever add reach', () => {
  const { ev, errors } = load();
  t1Club(ev);
  ev("for(const n of NETS)if(!R.reachable[n.id]){if(!S.pops[n.pops[0]])S.pops[n.pops[0]]={day:0,bb:null,boost:0,down:0,routers:1,gen:false};S.pni.push({id:'i'+n.id,net:n.id,city:n.pops[0],tier:0});}compute()");
  ev("S.won=true;S.done.t1=S.day;S.t1Now=true");
  // a save from before 2.0, with an older Tier 1 set and no record of cones, loads and is still Tier 1
  ev("const o=JSON.parse(JSON.stringify(S));o.t1v=2;S=migrate(o);compute()");
  assert.equal(ev("S.won"), true);
  assert.equal(ev("isTier1()"), true);
  assert.equal(ev("tierLabel()"), 'Tier 1');
  // and reach with cones is never lower than reach without: every exit still reaches what it did
  const before = ev("R.reach");
  ev("for(const id of NET_IDS){CONE_S[id]=new Set([id]);DOWN[id]=[];}compute()");
  assert.ok(ev("R.reach") <= before + 1e-9, 'switching cones off can only lose reach');
  assert.deepEqual(errors, []);
});

test('the Road to Tier 1 card and the network list explain the cone, on a phone too', () => {
  for (const w of [1280, 360]) {
    const { ev, dom, errors } = load();
    ev(`window.innerWidth=${w}`);
    t1Club(ev);
    ev("UI.left='goals';UI.leftOpen=true;UI.sel=null;renderLeft()");
    const txt = dom.window.document.getElementById('leftBody').textContent;
    assert.match(txt, /Road to Tier 1/);
    assert.match(txt, /their customers come along for free/);
    assert.match(txt, /\d+ networks already come along with a peer/);
    ev("ACT.netFocus({id:'tail0'})");
    assert.match(dom.window.document.getElementById('leftBody').textContent, /Reached through the customer cone of/);
    ev("S.pni=[];compute();ACT.netFocus({id:'tail0'})");
    assert.match(dom.window.document.getElementById('leftBody').textContent, /Buys transit from .*Peer with/);
    assert.match(ev("GOALS.find(g=>g.id==='t1').d"), /customers come along for free/);
    assert.deepEqual(errors, [], `${w}px`);
  }
});

test('routing with cones costs about what it did: exits are asked once, cones are built at load', () => {
  const { ev, errors } = load();
  t1Club(ev);
  ev("for(const n of NETS.filter(n=>!n.tail&&!n.cn).slice(0,40))for(const c of ['fra','ams','lon']){if(!S.pops[c])S.pops[c]={day:0,bb:{d:400},boost:0,down:0,routers:4,gen:true};S.pni.push({id:n.id+c,net:n.id,city:c,tier:2});}compute()");
  const t = ev("(()=>{for(let i=0;i<3;i++)compute();const a=performance.now();for(let i=0;i<10;i++)compute();return (performance.now()-a)/10;})()");
  const plain = ev(`(()=>{const keep={};for(const id of NET_IDS){keep[id]=[CONE_S[id],DOWN[id]];CONE_S[id]=new Set([id]);DOWN[id]=[];}
    for(let i=0;i<3;i++)compute();const a=performance.now();for(let i=0;i<10;i++)compute();const r=(performance.now()-a)/10;for(const id of NET_IDS){CONE_S[id]=keep[id][0];DOWN[id]=keep[id][1];}return r;})()`);
  assert.ok(t < plain * 2 + 20, `compute() with cones ${t.toFixed(1)} ms vs without ${plain.toFixed(1)} ms`);
  assert.deepEqual(errors, []);
});

test('the panel names the peer that really carries a network, not the first Tier 1 it buys from', () => {
  const { ev, dom, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=50");
  // a long-tail network that buys from Cogentle first and Level Tree second; peer only with Level Tree
  const t = ev("NETS.find(n=>n.tail&&n.up.length===2&&n.up[0]==='cog'&&n.up[1]==='lvl').id");
  ev("S.transit=[];S.ixp={};S.peers={};S.grace=null;S.pni=[{id:'pl',net:'lvl',city:'fra',tier:2}];compute()");
  assert.equal(ev(`R.cone.${t}`), 'lvl');
  ev(`UI.left='goals';UI.leftOpen=true;ACT.netFocus({id:'${t}'})`);
  const txt = dom.window.document.getElementById('leftBody').textContent;
  assert.match(txt, /Reached through the customer cone of Level Tree/);
  assert.doesNotMatch(txt, /customer cone of Cogentle/);
  // over an exchange: the member you have a session with
  ev("S.pni=[];compute()");
  assert.equal(ev(`!!R.cone.${t}`), false);
  assert.match(ev(`(ACT.netFocus({id:'${t}'}),document.getElementById('leftBody').textContent)`), new RegExp('Buys transit from '+ev(`coneVia('${t}').name`)));
  assert.deepEqual(errors, []);
});

test('a traceroute down a two-level cone shows every network on the way', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=50");
  // Doodoo buys from Hocus Pocus, which buys from Not That Telecom; a PNI with Not That Telecom only
  ev("S.transit=[];S.ixp={};S.peers={};S.grace=null;S.pni=[{id:'pn',net:'ntt',city:'fra',tier:2}];compute()");
  const tr = JSON.parse(ev("JSON.stringify(traceroute('fra',{net:'ddo'}))"));
  assert.deepEqual(tr.asPath, [ev('S.asn'), ev('NET.ntt.asn'), ev('NET.voc.asn'), ev('NET.ddo.asn')]);
  assert.match(tr.text, /Not That Telecom hands it to its customer Hocus Pocus/);
  assert.match(tr.text, /Hocus Pocus hands it to its customer Doodoo/);
  assert.equal(ev("coneChain('ntt','ddo').join()"), 'ntt,voc,ddo');
  assert.equal(ev("R.cone.ddo"), 'ntt');
  assert.deepEqual(errors, []);
});

test('#114 a larger customer cone still needs enough exchange capacity', () => {
  const { ev, dom, errors } = load();
  try {
    ev("UI.pitched=true;beginGame('T','stg',{scn:SCN.find(x=>x.id==='stg')});S.cash=1e9;S.lvl=10;S.pops.stg.bb={d:600};S.pops.stg.rgen=3;S.pops.stg.routers=3;S.ixp.stg=0;for(const id of ixMembers('stg'))S.peers[id+'@stg']=1;compute()");
    assert.ok(ev('R.reach>=0.5'), 'observed customer cones can supply the reach');
    assert.ok(ev('R.served<=10+1e-6'), 'a 10G port limits the actual traffic');
    assert.equal(ev("SCN.find(x=>x.id==='stg').ok()"), false);
    ev('S.ixp.stg=2;compute()');
    assert.ok(ev('R.served>=300'), 'a larger exchange port carries the reachable demand');
    assert.equal(ev("SCN.find(x=>x.id==='stg').ok()"), true);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
