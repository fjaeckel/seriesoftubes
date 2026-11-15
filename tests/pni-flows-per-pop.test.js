// The PNI list of an open city panel (#210): re-rendered after every day's routing, it adds up the flows of its own POP
// only, not of every POP in the network, and the sums are the same ones the every-POP pass gave.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

const BIG = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
const big = (t) => { const h = load({ seed: 777 }); t.after(() => h.dom.window.close());
  h.ev(`S=migrate(JSON.parse(${lit(BIG)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();autoPause=()=>false;compute();renderAll();`); return h; };
// The POPs whose flows have been added up for the current routing result.
const SUMMED = 'JSON.stringify(PNIX&&PNIX.R===R?Object.keys(PNIX.fl):[])';

test('a city panel on the PNI tab adds up its own POP only, day after day', (t) => {
  const { ev, errors } = big(t);
  assert.ok(ev('Object.keys(S.pops).length') > 50, 'a big network');
  ev("UI.sel={type:'city',id:'fra'};UI.tab='peer';renderPanel()");
  assert.ok(ev("$('panelBody').innerHTML.includes('pchip')"), 'the PNI list is shown');
  assert.deepEqual(JSON.parse(ev(SUMMED)), ['fra']);
  for (let d = 0; d < 3; d++) {
    ev('S.nextFail=S.nextEvent=S.day+99;dayTick();renderPanel()');
    assert.deepEqual(JSON.parse(ev(SUMMED)), ['fra'], `day ${d + 1}`);
  }
  assert.deepEqual(errors, []);
});

test("each POP's flows are the sums the every-POP pass gave, in the same order", (t) => {
  const { ev, errors } = big(t);
  // The every-POP pass the PNI list used before: every flow, added up by POP and network, in routing's order.
  ev(`window.allFlows=()=>{const F={},C=R.flc,{NF,FREM,FCI,FNJ,FGT,FGI,FGP,FGH,FTI,FII,E}=C;
    for(let i=0;i<NF;i++){const c=CITIES[FCI[i]].id,n=NET_IDS[FNJ[i]],m=F[c]||(F[c]={});let o=m[n];if(!o)o=m[n]={t:0,ix:0,p:0,h:0,u:0,T:{},I:{}};
      const ti=FTI[i]<0?null:E[FTI[i]].id,ii=FII[i]<0?null:E[FII[i]].id;
      o.u+=FREM[i];o.t+=FGT[i];o.ix+=FGI[i];o.p+=FGP[i];o.h+=FGH[i];if(FGT[i])o.T[ti]=(o.T[ti]||0)+FGT[i];if(FGI[i])o.I[ii]=(o.I[ii]||0)+FGI[i];}
    return F;};`);
  const same = JSON.parse(ev(`(()=>{const F=allFlows(),bad=[];let n=0;for(const c in S.pops){const a=JSON.stringify(pniFlows(c)),b=JSON.stringify(F[c]||{});
    if(a!==b)bad.push(c);n+=Object.keys(F[c]||{}).length;}return JSON.stringify({bad,n});})()`));
  assert.deepEqual(same.bad, []);
  assert.ok(same.n > 200, `flows by POP and network: ${same.n}`);
  assert.equal(ev("JSON.stringify(pniFlows('nowhere'))"), '{}');
  assert.deepEqual(errors, []);
});
