const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});S.pops.ams.rgen=3;ACT.buyIx({city:'ams',tier:1});compute()");
}
// Math.random returns these, then 0.5: [ask?, which IX, a real network?, (which one), fresh PeeringDB?]
const seq = (ev, a) => ev(`(()=>{const q=${JSON.stringify(a)};Math.random=()=>q.length?q.shift():0.5;})()`);
const REAL = [0.01, 0.01, 0.01, 0.01, 0.01], STALE = [0.01, 0.01, 0.9, 0.1], FRESH = [0.01, 0.01, 0.9, 0.9];

test('peering requests are answered by policy: Open accepts all, Selective the worthwhile ones, Closed none', () => {
  const { ev, errors } = load();
  setup(ev);
  assert.equal(ev('ppol()'), 'open', 'open by default, as before');
  const day = () => ev('peeringDeskDay(S.day)');
  const peers = () => ev("Object.keys(S.peers).filter(k=>k.endsWith('@ams')).length");
  let n = peers();
  seq(ev, REAL); day();
  assert.equal(peers(), n + 1, 'Open: a real network on the exchange gets its session at once');
  assert.ok(ev("ixSessions('ams').size") > 0);
  seq(ev, STALE); day();
  assert.deepEqual(JSON.parse(ev('JSON.stringify([S.pdesk.a,S.pdesk.d])')), [2, 0], 'Open even takes the stale newcomer');
  ev("ACT.peerPol({p:'selective'})");
  assert.equal(ev('ppol()'), 'selective');
  n = peers(); seq(ev, REAL); day();
  assert.equal(peers(), n + 1, 'Selective: a real small network is worth it');
  seq(ev, STALE); day();
  seq(ev, FRESH); day();
  assert.deepEqual(JSON.parse(ev('JSON.stringify([S.pdesk.a,S.pdesk.d])')), [4, 1], 'stale PeeringDB declined, up-to-date one accepted');
  ev("ACT.peerPol({p:'closed'})");
  n = peers(); seq(ev, REAL); day(); seq(ev, FRESH); day();
  assert.equal(peers(), n, 'Closed: nobody gets a session');
  assert.equal(ev('S.pdesk.d'), 3);
  ev("ACT.peerPol({p:'nope'})");
  assert.equal(ev('ppol()'), 'closed', 'junk is ignored');
  assert.deepEqual(errors, []);
});

test('once a week the NOC log gets one folded peering desk line', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buyIx({city:'fra',tier:1,signed:true});ACT.peerPol({p:'selective'})");
  seq(ev, [0.99]); ev('S.day=Math.ceil(S.day/7)*7+7;S.pdesk=null;peeringDeskDay(S.day)');
  const w = ev('Math.floor(S.day/7)');
  for (let i = 0; i < 6; i++) { seq(ev, i % 3 === 2 ? STALE : [0.01, i % 2 ? 0.01 : 0.99, 0.9, 0.9]); ev(`peeringDeskDay(S.day+${i})`); }
  assert.equal(ev('S.pdesk.w'), w);
  const logs = ev('S.log.length');
  seq(ev, [0.99]); ev('peeringDeskDay(S.day+7)');
  assert.equal(ev('S.log.length'), logs + 1, 'one line for the week');
  const line = ev('S.log[0].t');
  assert.match(line, /^Peering desk: 4 new sessions at .+ and .+, 2 declined \(Selective\)\.$/);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.log[0].o)')), { a: 'tab', v: 'nets' });
  assert.equal(ev('S.pdesk.w'), w + 1);
  // a quiet week says nothing
  ev('peeringDeskDay(S.day+14)');
  assert.equal(ev('S.log.length'), logs + 1);
  // the Networks tab has the policy picker, what it does, and last week's line; it fits a phone
  ev("window.innerWidth=360;UI.left='nets';UI.leftOpen=true;S.pdeskRep.w=Math.floor(S.day/7)-1;renderLeft()");
  const left = ev("document.getElementById('left').textContent");
  assert.match(left, /Peering policy: Selective/);
  assert.match(left, /newcomers with an up-to-date PeeringDB/);
  assert.match(left, /Peering desk: 4 new sessions/);
  assert.doesNotMatch(left, /inbox/i);
  ev("document.querySelector('#left [data-act=peerPol][data-args*=closed]').click()");
  assert.equal(ev('ppol()'), 'closed');
  assert.match(ev("document.getElementById('left').textContent"), /Every peering request is declined/);
  // more than four exchanges fold into "and N more"
  ev("S.pdeskRep={w:0,a:9,d:0,p:'open',ix:['ams','fra','lon','par','nyc']}");
  assert.match(ev('pdeskLine(S.pdeskRep)'), /9 new sessions at .+, .+, .+ and 2 more exchanges \(Open to all\)/);
  assert.match(ev("pdeskLine({a:0,d:1,p:'closed',ix:[]})"), /^Peering desk: 1 request declined \(Closed\)\.$/);
  assert.deepEqual(errors, []);
});

test('old saves with inbox, max-prefix and Large Peering Model state load and play', () => {
  const { ev, errors } = load();
  setup(ev);
  const net = ev("ixMembers('ams').find(id=>{const n=NET[id];return n.type!=='cdn'&&n.type!=='t1'&&n.pol!=='paid'&&n.share<=0.006;})");
  ev(`S.peers['${net}@ams']=true;delete S.ppol;delete S.pdesk;delete S.pdeskRep;
    S.inbox={items:[{id:1,k:'mp',key:'${net}@ams',net:'${net}',ix:'ams',day:S.day,lim:50,got:999999,leak:true,yrs:3},{id:2,k:'req',ix:'ams',nm:'D',asn:4,day:S.day,say:0,yrs:1}],
      down:{'${net}@ams':S.day+30},tiny:{'4':{nm:'D',ix:'ams'}},rep:-8,bot:true,pol:'selective',log:[{d:1,m:'peering_inbox.fire_the_ai',a:{}}],seq:2};
    S.rules={...S.rules,inbox:true};S.ev.ixdown={ams:S.day+2};
    S.inc.push({id:'m1',type:'maxpfx',ref:'ams',until:S.day+2,msg:'A member leaked the table.',cost:0,start:S.day});
    S.log.unshift({id:'l1',t:'Peering request',h:'Peering request',k:'',o:{a:'inbox'},ts:Date.now()})`);
  ev('S=migrate(JSON.parse(JSON.stringify(S)));compute()');
  assert.equal(ev('S.inbox'), undefined, 'the inbox is gone');
  assert.equal(ev('ppol()'), 'selective', 'the policy is kept');
  assert.equal(ev("'inbox' in S.rules"), false);
  assert.equal(ev("S.inc.find(i=>i.id==='m1').type"), 'ixloop', 'a max-prefix outage in flight becomes an ordinary IX outage');
  assert.equal(ev("S.inc.some(i=>i.type==='maxpfx')"), false);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.log.find(e=>e.id==='l1').o)")), { a: 'tab', v: 'nets' });
  assert.equal(ev(`ixSessions('ams').has('${net}')`), true, 'no session stays down on an old max-prefix limit');
  const extras = ev('R.cost.extras');
  assert.ok(extras < 20e6 / 12, 'the Large Peering Model no longer bills');
  ev("ACT.logOpen({id:'l1'})");
  assert.equal(ev('UI.left'), 'nets');
  ev('for(let i=0;i<40;i++)dayTick()');
  assert.ok(ev('S.inc.every(i=>i.type!=="maxpfx")'));
  assert.ok(ev('S.pdesk&&S.pdesk.w>=0'));
  // garbage in the new fields is repaired
  ev("const o=JSON.parse(JSON.stringify(S));o.ppol='weird';o.pdesk={w:'x',a:-5,d:1e9,ix:['ams','ams','nowhere',3]};o.pdeskRep=[1];sanitize(o);window.__o=o");
  assert.equal(ev('__o.ppol'), 'open');
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__o.pdesk)')), { w: 0, a: 0, d: 1e5, ix: ['ams'] });
  assert.equal(ev('__o.pdeskRep'), null);
  assert.deepEqual(errors, []);
});

test('max-prefix incidents can no longer fire', () => {
  const { ev, errors } = load();
  setup(ev);
  assert.equal(ev("fireFailure.toString().includes('maxpfx')"), false);
  ev("S.day=100;const src=fireFailure.toString().replace(/^function fireFailure/,'function').replace('let tot=opts.reduce',\"opts.splice(0,opts.length,['funny',1]);let tot=opts.reduce\");window.__ff=eval('('+src+')')");
  ev("__reseed(7);for(let i=0;i<200;i++){__ff();S.inc=S.inc.filter(x=>x.type!=='maxpfx'||(window.__mp=1,0));}");
  assert.equal(ev('!!window.__mp'), false);
  assert.equal(ev("typeof inboxDay+typeof ibx+typeof ACT.inboxRaiseAll+typeof ACT.inboxBot"), 'undefinedundefinedundefinedundefined');
  assert.deepEqual(errors, []);
});
