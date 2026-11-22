// Leaving multiplayer takes the other players' networks with it (#450): a save that left (or never could stay joined)
// does not keep asking for traffic to players it can no longer reach, so 100% reach and happy customers come back.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const { fedPage, joinGame, settle, until, URL1, NOW, rec, key, asn, box } = require('./helpers/fed');

const KEYS = 'abcdefgh'.split('').map(c => c + 'bcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ');
const net = (k, i) => `{k:${JSON.stringify(k)},name:'Player ${i}',asn:${64512 + i},home:'FR',pops:['par'],ix:[],mix:[300,300,400],tr:5e6,cust:3,pol:'open',q:1000,st:'active',ai:false,t1:true,bid:'',at:1}`;

// A transit-free Tier 1 in Frankfurt reaching every computer-run network, joined to a server, next to eight player
// Tier 1s no cone carries (so they are unreachable and cost the customer service).
function setup() {
  const p = load();
  const { ev } = p;
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;for(const g of GOALS)S.done[g.id]=0;delete S.done.t1;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=20");
  ev("S.transit=[];S.ixp={};S.peers={};S.pni=[];S.grace=null;for(const n of t1Need())S.pni.push({id:'p'+n.id,net:n.id,city:'fra',tier:2});compute()");
  ev("for(const n of NETS)if(!R.reachable[n.id])S.pni.push({id:'i'+n.id,net:n.id,city:'fra',tier:2});compute()");
  ev(`S.fed=fedNewState();S.fed.on=true;S.fed.servers=['wss://fed.example.org/fed'];S.fedn=fednClean({nets:[${KEYS.map(net).join(',')}]});S.fedLw=true;compute()`);
  ev("S.biz.push({id:'h',name:'Host',type:'host',city:'fra',bw:1,rate:100,reqs:[],mood:80,day:0,since:-100});compute()");
  assert.ok(ev('fedLost()') > 0.05, 'joined: the players are out of reach');
  assert.ok(ev("bizSf(S.biz.find(b=>b.id==='h'))") < 0.95, 'joined: the customer is short');
  return p;
}
const solo = (ev) => {
  assert.equal(ev('S.fedn'), null, 'the players\' networks are gone');
  assert.equal(ev('S.fedLw'), false, 'the NOC warning is cleared');
  assert.equal(ev('NETS.filter(n=>n.fed).length'), 0);
  assert.equal(ev('fedLost()'), 0);
  assert.ok(ev("bizSf(S.biz.find(b=>b.id==='h'))") > 0.999, 'the customer is served in full again');
  assert.ok(ev('R.reach') > 0.999, '100% reach');
};

test('leaving the last server drops the players\' networks; leaving one of two keeps them', () => {
  const { ev, errors } = setup();
  ev("S.fed.servers.push('wss://two.example.org/fed');ACT.fedLeave({url:'wss://two.example.org/fed'});compute()");
  assert.equal(ev('S.fed.on'), true, 'still joined to one server');
  assert.equal(ev('S.fedn.nets.length'), 8, 'still playing with the others');
  ev('ACT.fedLeave({});compute()');
  assert.equal(ev('S.fed.on'), false);
  solo(ev);
  for (let d = 0; d < 3; d++) ev('dayTick()');
  solo(ev);
  assert.deepEqual(errors, []);
});

test('a save that left before this fix (multiplayer off, networks kept) loads repaired', () => {
  const { ev, errors } = setup();
  ev('S.fed.on=false;S.fed.servers=[];save(true)');
  const txt = ev('JSON.stringify(packSave(S))');
  // The warning flag goes with the next day's look (fedLostDay), as for any save with no players left out.
  ev(`S=migrate(JSON.parse(${JSON.stringify(txt)}));compute();fedLostDay()`);
  solo(ev);
  // A joined save keeps its neighbours (offline, it routes the same): only "off" drops them.
  const p = setup();
  p.ev('S.fed.key=null;S.fed.on=true');
  const kept = p.ev(`(()=>{const s=JSON.parse(JSON.stringify(packSave(S)));s.fed.on=true;fedpSanitize(s);return s.fedn&&s.fedn.nets.length;})()`);
  assert.equal(kept, 8);
  assert.deepEqual(errors, []);
  assert.deepEqual(p.errors, []);
});

test('after leaving, a late look at the server does not bring the players back; joining again does', async () => {
  const p = fedPage(), n = p.net.node(URL1), k = key('bob');
  n.feed = [{ rec: rec('bob', 'announce', NOW - 60, { name: 'Bob Net', asn: asn(k.pub), box: box('bob'), home: 'DE', day: 10, founded: 20454, pops: ['fra'], ix: ['fra'], cust: 1,
    mix: { content: 0, eyeball: 1000, enterprise: 0 }, traffic: { in: 1, out: 1 }, policy: 'open', rates: {}, auto: { peering: 'auto', transit: 'decline', pni: 'decline', swap: 'decline', consortium: 'decline', port: 'decline' } }), rcpt: [] }];
  assert.equal(await joinGame(p), null);
  const has = () => p.ev('!!(S.fedn&&S.fedn.nets.length===1)');
  assert.ok(await until(async () => (p.net.advance(1500), await settle(5), has())), 'Bob arrived');
  p.ev('fedPlaySoon(0)');
  await p.ev('ACT.fedLeave({})');
  p.net.advance(5000); await settle(10);
  assert.equal(p.ev('S.fed.on'), false);
  assert.equal(p.ev('S.fedn'), null, 'a refresh queued before leaving does not rebuild them');
  assert.equal(p.ev('NETS.filter(x=>x.fed).length'), 0);
  assert.equal(await p.ev(`ACT.fedJoin({url:${JSON.stringify(URL1)}})`), null);
  assert.ok(await until(async () => (p.net.advance(1500), await settle(5), has())), 'Bob is back after joining again');
  assert.deepEqual(p.errors, []);
});
