// A customer who wants two paths that share no trench says why it fails, under the red ✗: what every path runs
// through, and which down link (a cut, a closed border) would pass it again.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const pop = c => `if(!S.pops.${c})S.pops.${c}={day:0,bb:null,boost:0,down:0,routers:2,gen:false,rgen:3};`;
const wave = (id, a, z, trench, extra = '') => `S.links.push({id:'${id}',a:'${a}',b:'${z}',kind:'wave',tier:0,km:300,sub:false,cable:null,mo:1,trench:'${trench}',cut:0,day:0${extra}});`;
const start = "ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;UI.speed=0;for(const g of GOALS)S.done[g.id]=0;S.links=[];";
const circuit = (a, z) => `S.biz.push({id:'k',type:'l2vpn',name:'Twin Brains',city:'${a}',city2:'${z}',bw:1,rate:10,reqs:['diverse'],mood:80,since:0,day:0,route:'normal'});`;
const reqs = ev => ev("(()=>{const d=document.createElement('div');d.innerHTML=reqList(S.biz.find(b=>b.id==='k'));return d.textContent})()");
function game(t, setup) { const h = load({ seed: 4242 }); t.after(() => h.dom.window.close()); h.ev(start + setup + 'compute();'); return h; }

test('the span every path runs through is named, and a cut link that would fix it says when it is back', (t) => {
  // New York to Ashburn through Boston: one trench into Boston, two diverse ones on to Ashburn.
  const { ev, errors } = game(t, ['nyc', 'bos', 'ash'].map(pop).join('') + wave('a', 'nyc', 'bos', 'tA') + wave('b', 'bos', 'ash', 'tB') + wave('c', 'bos', 'ash', 'tC') + circuit('nyc', 'ash'));
  let txt = reqs(ev);
  assert.match(txt, /✗ Two paths that share no trench/);
  assert.match(txt, /Every path between New York and Ashburn runs through New York – Boston/);
  assert.doesNotMatch(txt, /Passes again/, 'nothing down, nothing to wait for');
  // A direct link, cut for ten days: waiting for it would fix it.
  ev(wave('d', 'nyc', 'ash', 'tD', ',cut:S.day+10') + 'compute()');
  txt = reqs(ev);
  assert.match(txt, /Passes again once this is back: New York – Ashburn \(cut, repaired in 10 days\)/);
  // Repaired: the ✓, and no explanation.
  ev("S.links.find(l=>l.id==='d').cut=0;compute()");
  txt = reqs(ev);
  assert.match(txt, /✓ Two paths/);
  assert.doesNotMatch(txt, /Every path|Passes again/);
  // The customer's own panel shows it too.
  ev("S.links.find(l=>l.id==='d').cut=S.day+10;compute();UI.sel={type:'city',id:'nyc'};UI.tab='cust';renderPanel()");
  assert.match(ev("document.getElementById('panel').textContent"), /runs through New York – Boston/);
  assert.deepEqual(errors, []);
});

test('in the Gulf spat, the closed border is the reason, with the days left', (t) => {
  // Doha has a way out through Riyadh and another to Ankara; Riyadh and Ankara are joined too.
  const { ev, errors } = game(t, ['doh', 'ruh', 'esb'].map(pop).join('') + wave('r', 'doh', 'ruh', 'tR') + wave('k1', 'doh', 'esb', 'tK') + wave('s', 'ruh', 'esb', 'tS') + circuit('doh', 'esb'));
  assert.match(reqs(ev), /✓ Two paths/, 'diverse before the spat');
  ev('S.ev.gulf=S.day+40;compute()');
  const txt = reqs(ev);
  assert.match(txt, /✗ Two paths/);
  assert.match(txt, /runs through Doha – Ankara/);
  assert.match(txt, /Doha – Riyadh \(border closed, 40 days left\)/);
  assert.deepEqual(errors, []);
});
