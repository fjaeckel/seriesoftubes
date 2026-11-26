#!/usr/bin/env node
// Builds tests/fixtures/big-network.json: a deterministic, very large late-game network that the performance
// benchmark (scripts/perf-bench.js) loads into the base and the head of every pull request. Big on purpose: about
// a hundred POPs, a few hundred links and customers, and close to a thousand PNIs and cache boxes, like the saves
// that made the game lag (#89). Regenerate only when the save format changes in a way old saves cannot load:
//   node scripts/perf-fixture.js
// --huge builds tests/fixtures/huge-network.json instead: every city the game has (about 400 POPs today), twice the
// backbone per POP, and four times the PNIs, cache boxes, transit and customers: the very end of a long game, where
// costs that grow faster than the network show (the NOC intern's shift once took most of a day there). It takes
// minutes; perf-bench.js --huge runs on it.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../tests/harness');

const K = process.argv.includes('--huge') ? 4 : 1;
const { ev, errors } = load({ seed: 4242 });
ev(`window.__K=${K}`);
ev(`(()=>{UI.pitched=true;ACT.start({});S.cash=1e13;S.lvl=LEVELS.length;S.won=true;for(const g of GOALS)S.done[g.id]=0;S.tut=null;
  const top=RG.findIndex(r=>r.lvl===LEVELS.length&&r.maxP===PORT.length-1);
  const cs=ALLC.filter(c=>!CITY[c].ixOnly&&!CITY[c].cn);
  for(const c of cs){if(!S.pops[c])ACT.buildPop({city:c});const p=S.pops[c];if(!p)continue;p.rgen=top>=0?top:RG.length-1;p.routers=RMAX;if(!p.bb)ACT.launchBB({city:c});if(p.bb)p.bb.d=CITY[c].P*0.65;if(Math.random()<0.3)ACT.addSite({city:c});}
  const pops=Object.keys(S.pops);
  // A backbone: every POP to its two nearest neighbours, plus long-haul shortcuts.
  const L=(a,b,t)=>{if(a===b)return;UI.pending=null;UI.via=null;UI.lmode='wave';UI.route='diverse';try{openLinkModal(a,b);ACT.buildLink({tier:t});closeModal();}catch(e){closeModal();}};
  for(const a of pops){const near=pops.filter(b=>b!==a).sort((x,y)=>kmBetween(a,x)-kmBetween(a,y)).slice(0,1+__K);for(const b of near)if(!pairLinks(a,b).length)L(a,b,3);}
  for(let i=0;i<60*__K;i++){const a=pops[Math.floor(Math.random()*pops.length)],b=pops[Math.floor(Math.random()*pops.length)];L(a,b,4);}
  // Transit in some cities, IX ports with route servers everywhere.
  for(const c of pops.slice(0,30*__K)){const ts=NETS.filter(n=>n.price&&n.pops.includes(c)&&(n.type==='t1'||n.type==='t2')).slice(0,1+__K);for(const t of ts)ACT.buyTransit({city:c,net:t.id,tier:3});}
  for(const c of pops)for(const x of ixIdsIn(c)){try{ACT.buyIx({city:x,tier:3});}catch(e){}if(S.dk&&S.dk.q){S.dk.q=null;}closeModal();if(S.ixp[x]!==undefined&&!S.rs[x])ACT.rs({city:x});}
  compute();
  // PNIs wherever a network is present, and cache boxes from every CDN.
  for(const n of NETS)for(const c of pops)if(S.pni.length<950*__K&&n.pops.includes(c)&&!n.tail)S.pni.push({id:'p'+n.id+'_'+c,net:n.id,city:c,tier:3,n:1,site:'a'});
  for(const n of NETS.filter(n=>n.cache))for(const c of pops)for(let k=1;k<=2*__K;k++)if(S.caches.length<850*__K)S.caches.push({id:'c'+k+n.id+'_'+c,city:c,net:n.id,site:'a'});
  // Real customers: accept offers until there are a few hundred.
  for(let i=0;i<6000*__K&&S.biz.length<420*__K;i++){S.offers=[];spawnOffer();const o=S.offers[0];if(o&&bHas(o))ACT.accept({id:o.id});}
  S.offers=[];S.nextFail=S.day+30;S.nextEvent=S.day+30;S.inc=[];
  for(let d=0;d<20;d++)dayTick();
})()`);
if (errors.length) { console.error(errors); process.exit(1); }
const save = ev('JSON.stringify(S)');
const n = JSON.parse(ev("JSON.stringify({pops:Object.keys(S.pops).length,links:S.links.length,pni:S.pni.length,caches:S.caches.length,biz:S.biz.length,transit:S.transit.length,ix:Object.keys(S.ixp).length,served:Math.round(R.served)})"));
const out = path.join(__dirname, '..', 'tests', 'fixtures', K > 1 ? 'huge-network.json' : 'big-network.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, save + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(save.length / 1024)} KB):`, n);
