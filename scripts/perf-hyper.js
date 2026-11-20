#!/usr/bin/env node
/* A big Hyperscaler, timed against the classic big-network fixture: about a hundred POPs on a backbone like the
   fixture's, 8 regions on 5 continents, 60 countries of users, a hundred cloud tenants, 4 AI labs' training runs and a
   model of your own. Prints compute()'s median and mean in ms for the classic fixture, for the Hyperscaler with its
   bulk classes (replication and training, CX_BULK), and for the same save without them.
     node scripts/perf-hyper.js [--runs 40] [--save FILE]   (--save writes the Hyperscaler save it built) */
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../tests/harness');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('--runs', 40);
const stats = (ms) => { const s = ms.slice().sort((a, b) => a - b); return { median: s[s.length >> 1], mean: ms.reduce((a, x) => a + x, 0) / ms.length }; };
const time = (ev, setup = '') => JSON.parse(ev(`(()=>{${setup}for(let i=0;i<5;i++)compute();const ms=[];for(let i=0;i<${RUNS};i++){const t=performance.now();compute();ms.push(performance.now()-t);}return JSON.stringify(ms)})()`));

// The classic fixture.
const fixture = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'big-network.json'), 'utf8');
const c = load({ seed: 4242 });
c.ev(`S=migrate(${JSON.stringify(JSON.parse(fixture))});UI.speed=0;compute()`);
const classic = stats(time(c.ev));

// The Hyperscaler, built like the fixture's network.
const h = load({ seed: 4242 });
h.ev(`(()=>{UI.pitched=true;beginGame('Cloud','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});
  S.cash=1e13;S.lvl=LEVELS.length;S.nextFail=S.nextEvent=1e9;S.tut=null;const top=RG.findIndex(r=>r.lvl===LEVELS.length&&r.maxP===PORT.length-1);
  const cs=ALLC.filter(c=>!CITY[c].ixOnly&&!CITY[c].cn).filter((c,i)=>i%2===0||CITY[c].P>=600);
  for(const c of cs){if(!S.pops[c])ACT.buildPop({city:c});const p=S.pops[c];if(!p)continue;p.rgen=top>=0?top:RG.length-1;p.routers=RMAX;}
  const pops=Object.keys(S.pops);
  const L=(a,b,t)=>{if(a===b)return;UI.pending=null;UI.via=null;UI.lmode='wave';UI.route='diverse';try{openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();}catch(e){closeModal();}};
  for(const a of pops){const near=pops.filter(b=>b!==a).sort((x,y)=>kmBetween(a,x)-kmBetween(a,y)).slice(0,2);for(const b of near)if(!pairLinks(a,b).length)L(a,b,4);}
  for(let i=0;i<60;i++){const a=pops[Math.floor(Math.random()*pops.length)],b=pops[Math.floor(Math.random()*pops.length)];L(a,b,5);}
  for(const l of S.links)l.ready=0;
  for(const c of pops.slice(0,40)){const ts=NETS.filter(n=>n.price&&n.pops.includes(c)&&(n.type==='t1'||n.type==='t2')).slice(0,2);for(const t of ts)ACT.buyTransit({city:c,net:t.id,tier:3});}
  for(const c of pops)for(const x of ixIdsIn(c)){try{ACT.buyIx({city:x,tier:3});}catch(e){}if(S.dk&&S.dk.q){S.dk.q=null;}closeModal();}
  for(const n of NETS)for(const c of pops)if(S.pni.length<400&&n.pops.includes(c)&&!n.tail)S.pni.push({id:'p'+n.id+'_'+c,net:n.id,city:c,tier:3,n:1,site:'a'});
  // 8 regions on 5 continents.
  const big=pops.filter(c=>c!==S.home&&hsSite(c)).sort((a,b)=>CITY[b].P-CITY[a].P||(a<b?-1:1)),want=[];
  for(const r of ['EU','AM','AS','SA','OC','AF']){const c=big.find(x=>CITY[x].reg===r);if(c)want.push(c);}for(const c of big)if(want.length<7&&!want.includes(c))want.push(c);
  for(const c of want)S.hs.rg[c]={t:3,ready:0,mw:200};
  // 60 countries of users, a hundred tenants.
  for(const cc of ccAll().filter(k=>!hsWhy(k)).slice(0,60))S.hs.cc[cc]={d:Math.max(1,hsPot(cc)*0.25),since:0};
  for(let i=0;i<400&&hsTen().length<100;i++){const k=pick(Object.keys(CLOUD_TENANTS)),o=hsOffer(k,pick(pops),pick(CLOUD_TENANTS[k].opts));S.offers=[o];ACT.accept({id:o.id});}
  S.offers=[];compute();
  // 4 AI labs' runs and a model of your own, between the regions.
  const R8=hsRgs();[[0,3],[1,5],[2,6],[4,7]].forEach(([i,k],n)=>S.hs.jobs.push({id:'job'+n,n:CLOUD_TENANTS.lab.names[n],a:R8[i],b:R8[k],g:HS_JOB_G[n],tb:HS_JOB_G[n]*TB_DAY*42,done:0,due:S.day+52,fee:1e7,start:S.day}));
  S.hs.own.push({id:'own0',n:0,k:1,a:R8[0],b:R8[1],g:3200,tb:3200*TB_DAY*35,done:0,mw:8,start:S.day,due:S.day+44});
  S.hs.pp[hsPk(R8[0],R8[3])]='diverse';S.hs.pp[hsPk(R8[1],R8[5])]='scenic';
  for(let d=0;d<5;d++)dayTick();
})()`);
if (h.errors.length) { console.error(h.errors); process.exit(1); }
const shape = JSON.parse(h.ev("JSON.stringify({pops:Object.keys(S.pops).length,links:S.links.length,regions:hsRgs().length,continents:hsCont(),countries:Object.keys(S.hs.cc).length,tenants:hsTen().length,jobs:S.hs.jobs.length,own:S.hs.own.length,users:Math.round(hsUsers()),bulkGot:Math.round(R.hs.btw),repPairs:Object.keys(R.hs.rep).length})"));
if (arg('--save')) fs.writeFileSync(arg('--save'), h.ev('JSON.stringify(S)') + '\n');
const hyper = stats(time(h.ev));
const noBulk = stats(time(h.ev, 'CX_BULK.length=0;'));
const f = (x) => x.toFixed(2);
console.log('Hyperscaler save:', shape);
console.log(`compute() over ${RUNS} runs (ms)        median    mean`);
console.log(`classic big-network fixture      ${f(classic.median).padStart(8)} ${f(classic.mean).padStart(7)}`);
console.log(`Hyperscaler, with bulk classes   ${f(hyper.median).padStart(8)} ${f(hyper.mean).padStart(7)}`);
console.log(`Hyperscaler, without bulk        ${f(noBulk.median).padStart(8)} ${f(noBulk.mean).padStart(7)}`);
console.log(`bulk classes cost                ${f(hyper.median - noBulk.median).padStart(8)} ms a compute()`);
