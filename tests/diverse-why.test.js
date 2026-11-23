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

// On the big network with a third of the links cut: a down link is named as the fix exactly when bringing it back
// makes diversePaths() pass, so the line never promises what the ✗ will not do (ties broken in list order).
test('a link named as the fix is one that really passes the requirement once back', t => {
  const fs = require('node:fs');
  const h = load();
  t.after(() => h.dom.window.close());
  h.ev(`S=migrate(${fs.readFileSync(require.resolve('./fixtures/big-network.json'), 'utf8')});S.links.forEach((l,i)=>{if(i%3===1)l.cut=S.day+30;});compute();DIVWHY=null`);
  const bad = h.ev(`(()=>{const ps=Object.keys(S.pops),bad=[];let checked=0;
    for(let i=0;i<60;i++){const a=ps[(i*7)%ps.length],b=ps[(i*13+5)%ps.length];if(a===b||diversePaths(a,b))continue;
      const w=divWhyOf(a,b),down=S.links.filter(l=>linkDown(l));
      for(const l of down){const r=l.cut;l.cut=0;const pass=diversePaths(a,b);l.cut=r;checked++;
        const named=w.back.includes(divDownTxt(l));
        if(named&&!pass)bad.push(a+'-'+b+': names '+l.id+' but it does not pass');
        if(!named&&pass&&w.back.length<DIVWHY_MAX)bad.push(a+'-'+b+': '+l.id+' passes but is not named');}}
    return {bad:bad.slice(0,5).join('; '),checked};})()`);
  assert.ok(bad.checked > 100, `enough cases (${bad.checked})`);
  assert.equal(bad.bad, '');
  assert.deepEqual(h.errors, []);
});
