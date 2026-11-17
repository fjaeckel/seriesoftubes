// Players you cannot reach cost your cities service (it is what peering with them is for), and the game says so:
// customers name it, the HUD and the AS panel show reach with players included, and the NOC warns.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const KEYS = 'abcdefgh'.split('').map(c => c + 'bcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ');
const net = (k, i) => `{k:${JSON.stringify(k)},name:'Player ${i}',asn:${64512 + i},home:'FR',pops:['par'],ix:[],mix:[300,300,400],tr:5e6,cust:3,pol:'open',q:1000,st:'active',ai:false,t1:true,bid:'',at:1}`;

// A transit-free Tier 1 in Frankfurt that reaches every computer-run network, next to eight player Tier 1s no cone carries.
function setup() {
  const p = load();
  const { ev } = p;
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;delete S.done.t1;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=20");
  ev("S.transit=[];S.ixp={};S.peers={};S.pni=[];S.grace=null;for(const n of t1Need())S.pni.push({id:'p'+n.id,net:n.id,city:'fra',tier:2});compute()");
  ev("for(const n of NETS)if(!R.reachable[n.id])S.pni.push({id:'i'+n.id,net:n.id,city:'fra',tier:2});compute()");
  ev(`S.fed=fedNewState();S.fedn=fednClean({nets:[${KEYS.map(net).join(',')}]});compute()`);
  ev("S.biz.push({id:'h',name:'Host',type:'host',city:'fra',bw:1,rate:100,reqs:[],mood:80,day:0,since:-100});compute()");
  assert.ok(ev("R.served") > 0, 'the network carries traffic');
  return p;
}
const host = "S.biz.find(b=>b.id==='h')";

test('players you cannot reach still cost service, and customers say why', () => {
  const { ev, errors } = setup();
  const lost = ev('fedLost()');
  // Only the players are missing: the same network solo serves Frankfurt in full.
  const sf = ev(`bizSf(${host})`);
  ev('globalThis.__fedn=S.fedn;S.fedn=null;compute()');
  assert.ok(ev(`bizSf(${host})`) > 0.999, 'solo, the customer is served in full');
  ev('S.fedn=__fedn;compute()');
  assert.ok(Math.abs(ev(`bizSf(${host})`) - sf) < 1e-9);
  assert.ok(lost > 0.05, `the players take ${lost} of the traffic`);
  assert.ok(ev('reachSolo()') > 0.999, 'every other network is reached');
  assert.ok(ev(`bizSf(${host})`) < 0.95, 'the customer is short');
  assert.match(ev(`bizWhy(${host}).join(' ')`), /of your traffic goes to players you have not peered with/);
  assert.doesNotMatch(ev(`bizWhy(${host}).join(' ')`), /whole internet/, 'no reach complaint: the rest of the internet is reached');
  // The customer list offers a way to the players.
  ev("UI.dtab='cust';ACT.dash()");
  assert.match(ev("document.getElementById('dash').innerHTML"), /data-act="fpLost"/);
  ev('ACT.fpLost()');
  assert.equal(ev("UI.left"), 'nets');
  assert.equal(ev("document.getElementById('dash').hidden"), true);
  assert.deepEqual(errors, []);
});

test('the HUD and the AS panel show reach with players included', () => {
  const { ev, errors } = setup();
  ev('renderAll()');
  assert.equal(ev("document.getElementById('hReach').textContent"), '100%', 'the big number leaves players out');
  assert.equal(ev("document.getElementById('hReachX').hidden"), false);
  assert.equal(ev("document.getElementById('hReachX').textContent"), ev("'👥 '+reachPct(R.reach)"));
  assert.match(ev("document.getElementById('hReach').parentNode.title"), /With other players/);
  assert.match(ev('asBox()'), /Reach with other players/);
  // Solo, none of it shows.
  ev('S.fedn=null;compute();renderAll()');
  assert.equal(ev("document.getElementById('hReachX').hidden"), true);
  assert.equal(ev("document.getElementById('hReach').parentNode.title"), '');
  assert.doesNotMatch(ev('asBox()'), /Reach with other players/);
  assert.deepEqual(errors, []);
});

test('the NOC warns once, before customers leave, and again only after it went away', () => {
  const { ev, errors } = setup();
  const warns = () => ev("S.log.filter(e=>/players you cannot reach/.test(e.t)).length");
  ev('fedLostDay()');
  assert.equal(warns(), 1);
  assert.equal(ev('S.fedLw'), true);
  ev('fedLostDay()');
  assert.equal(warns(), 1, 'not every day');
  assert.ok(ev("nwAlarms().some(a=>/players you cannot reach/.test(a.t))"), 'the NOC wall shows it');
  ev('S.fedn=null;compute();fedLostDay()');
  assert.equal(ev('S.fedLw'), false, 'gone: the warning can come again');
  // Saves keep the flag, and repair it.
  ev("S.fedLw='yes';sanitize(S)");
  assert.equal(ev('S.fedLw'), true);
  assert.deepEqual(errors, []);
});

test('peering with the players brings the service back', () => {
  const { ev, errors } = setup();
  const before = ev(`bizSf(${host})`);
  ev(`S.fed.deals=${JSON.stringify(KEYS)}.map((k,i)=>({id:'d'+i,deal:'peering',key:k,name:'P',asn:1,start:0,end:null,terms:{at:['fra'],via:'pni'},role:'buy',st:'run',on:true,rep:0,why:'',ai:false,renews:null}));compute()`);
  assert.ok(ev('fedLost()') < 0.005, 'every player is reached');
  const after = ev(`bizSf(${host})`);
  assert.ok(after > before + 0.03, `service ${before} -> ${after}`);
  assert.ok(after >= 0.95, 'the customer is served in full');
  assert.doesNotMatch(ev(`bizWhy(${host}).join(' ')`), /players you have not peered with/);
  assert.deepEqual(errors, []);
});

test('the players card puts the players you cannot reach first, marked, and the HUD line turns red', () => {
  const { ev, errors } = setup();
  // Peer with the first four: the last four stay out of reach, and would sit behind "Show all" in list order.
  ev(`S.fed.deals=${JSON.stringify(KEYS.slice(0, 4))}.map((k,i)=>({id:'d'+i,deal:'peering',key:k,name:'P',asn:1,start:0,end:null,terms:{at:['fra'],via:'pni'},role:'buy',st:'run',on:true,rep:0,why:'',ai:false,renews:null}));compute()`);
  assert.ok(ev('fedLost()') >= ev('FEDL_WARN'), 'still enough to warn about');
  ev('ACT.fpLost()');
  const card = ev("(document.querySelector('#leftBody .fp-card')||{}).innerHTML||''");
  const rows = card.split('class="row fp-').slice(1);
  assert.ok(rows.length >= 5, `a first page of players (${rows.length})`);
  const tagged = rows.map((r) => /Not reached/.test(r));
  assert.deepEqual(tagged.slice(0, 4), [true, true, true, true], 'the four you cannot reach come first');
  assert.ok(tagged.slice(4).every((x) => !x), 'and only they are marked');
  ev('renderAll()');
  assert.equal(ev("document.getElementById('hReachX').style.color"), 'var(--bad)', 'red once it costs enough to warn');
  assert.deepEqual(errors, []);
});

test('a customer short for another reason does not blame the players', () => {
  const { ev, errors } = setup();
  const lost = ev('fedLost()');
  assert.equal(ev(`fedBlame(${host},bizSf(${host}))`), true, 'short by about what the players take: they are the reason');
  assert.equal(ev(`fedBlame(${host},${Math.max(0, 1 - lost * 3 - 0.2)})`), false, 'far shorter than the players explain: no');
  assert.equal(ev(`fedBlame(${host},0.99)`), false, 'not short at all');
  assert.deepEqual(errors, []);
});
