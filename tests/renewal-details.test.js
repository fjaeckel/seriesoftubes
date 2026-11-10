// #292: a renewal haggle in Deals shows what is at stake: traffic booked and served, the price per Gbps now and asked,
// and the path terms the customer signed for, each ticked as it stands today. It fits on a phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = "ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;";
// Frankfurt, Paris and Amsterdam in a triangle, so Frankfurt-Amsterdam has a direct path and one round through Paris.
function net(ev) {
  ev(start + "ACT.launchBB({city:'fra'});ACT.buildPop({city:'par'});ACT.buildPop({city:'ams'});for(const c in S.pops){S.pops[c].rgen=3;S.pops[c].routers=2}");
  for (const [a, b] of [['fra', 'par'], ['par', 'ams'], ['fra', 'ams']]) ev(`UI.via=null;openLinkModal('${a}','${b}');ACT.buildLink({tier:1});closeModal()`);
}
const deals = ev => { ev("UI.left='deals';renderLeft()"); return ev("document.getElementById('left').innerHTML"); };
const row = (ev, name) => ev(`(()=>{const r=[...document.querySelectorAll('#left .row')].find(r=>r.querySelector('.nm')&&r.querySelector('.nm').textContent==='${name}');return r?r.textContent:''})()`);

test('#292 an IP customer\'s renewal shows booked and served traffic and the price per Gbps', () => {
  const { ev, errors } = load();
  net(ev);
  ev("S.biz.push({id:'h1',city:'ams',city2:null,name:'Haggle Hosting',type:'dia',bw:5,rate:600,reqs:[],mood:90,since:S.day-800,te:S.day+20,mk:1,hag:{rate:540,until:S.day+20}});compute()");
  deals(ev);
  const t = row(ev, 'Haggle Hosting');
  assert.match(t, /5\.0 Gbps booked, [\d.]+ Gbps served/);
  assert.ok(t.includes(ev("fmt$(600)") + ' → ' + ev("fmt$(540)") + ' per Gbps'), t);
  assert.match(t, /Pays .* wants .* to renew/, 'the monthly bills are still there');
  assert.deepEqual(errors, []);
});

test('#292 a circuit\'s renewal shows its latency limit and path terms, ticked as they stand today', () => {
  const { ev, errors } = load();
  net(ev);
  ev("S.biz.push({id:'c1',city:'fra',city2:'ams',name:'Tulip Bank',type:'l2vpn',bw:10,rate:300,reqs:['lat','diverse','sharks'],latMax:50,route:'fast',mood:90,since:S.day-800,te:S.day+20,mk:1,hag:{rate:250,until:S.day+20}});compute()");
  deals(ev);
  let t = row(ev, 'Tulip Bank');
  assert.match(t, /10\.0 Gbps booked, 10\.0 Gbps served/);
  assert.match(t, /✓ latency within 50 ms \(now [\d.]+ ms one-way\)/);
  assert.match(t, /✓ two diverse paths/, 'direct and round through Paris');
  assert.match(t, /✓ no subsea cable/);
  // A tight budget the network cannot meet is crossed out, with what it gets today.
  ev("S.biz.find(b=>b.id==='c1').latMax=0.5;compute()");
  deals(ev);
  t = row(ev, 'Tulip Bank');
  assert.match(t, /✗ latency within 0\.5 ms/);
  assert.doesNotMatch(t, /undefined|NaN/);
  assert.deepEqual(errors, []);
});

test('#292 SD-WAN shows its sites, fiber deals show no Gbps, and served traffic below what is booked is red', () => {
  const { ev, errors } = load();
  net(ev);
  ev("S.biz.push({id:'s1',city:'fra',city2:null,sites:['fra','par','ams'],name:'Kebab Kingdom',type:'sdwan',bw:2,rate:400,reqs:[],mood:90,since:S.day-800,te:S.day+20,mk:1,hag:{rate:360,until:S.day+20}});compute()");
  deals(ev);
  assert.match(row(ev, 'Kebab Kingdom'), /3 sites × 2\.0 Gbps booked/);
  assert.doesNotMatch(row(ev, 'Kebab Kingdom'), /✓|✗/, 'no path terms when they asked for none');
  assert.equal(ev("clRenInfo({...S.biz.find(b=>b.id==='s1'),type:'dfpair'})"), '', 'a fiber pair is not sold by the Gbps');
  ev("R.l2['s1']=0.5");
  assert.match(ev("clRenInfo(S.biz.find(b=>b.id==='s1'))"), /color:var\(--bad\)">0\.5 Gbps/);
  assert.deepEqual(errors, []);
});

test('#292 the renewal row fits a 390 px phone', () => {
  const { ev, errors } = load();
  net(ev);
  ev("S.biz.push({id:'c1',city:'fra',city2:'ams',name:'Tulip Bank',type:'l2vpn',bw:10,rate:300,reqs:['lat','diverse'],latMax:50,route:'fast',mood:90,since:S.day-800,te:S.day+20,mk:1,hag:{rate:250,until:S.day+20}});compute()");
  ev("window.innerWidth=390;renderAll()");
  deals(ev);
  assert.match(row(ev, 'Tulip Bank'), /booked, .* served/);
  // Every new line is a wrapping meta line, never one wide nowrap element.
  const info = ev("clRenInfo(S.biz.find(b=>b.id==='c1'))");
  assert.match(info, /^<div class="meta">/);
  assert.doesNotMatch(info, /nowrap|width:\s*\d{3,}px/);
  assert.deepEqual(errors, []);
});
