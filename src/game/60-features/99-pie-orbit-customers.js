/* ---------- Pie in the Sky: customers in orbit (docs/plans/pie-in-the-sky.md) ----------
   Terminal customers (BIZ_T[].orbit: pizza homes and boats, flywifi airlines, boat cruise ships, marsorb the Mars mission
   over your pies) are offered only once the network can serve them (rule F3's spirit): a baked crust over the city and a
   pie dish that can land it (pieServe(), from the last compute). The market is the shell, not your ambition: what all
   your crusts can sell (PIE_SELL of their capacity, the rest flies over ocean and empty land) caps what is signed and
   on offer, so orbit income cannot outgrow the sky (like F5). Remote towns (no POP of yours, few people) are the first
   to call: Pitcairn, the Arctic, the outer islands. */
const PIE_SELL=0.25,PIE_REMOTE=0.6,PIE_OFFER_RATE=1/6,PIE_OFFERS=2;
// Gbps the sky can sell: each baked crust's capacity at its coverage.
function pieMarket(){if(!S.pie)return 0;let g=0;for(const id of pieHubs())g+=CRUSTS[id].g*pieCov(id)*PIE_SELL;return g;}
// Gbps signed and on offer, of one kind (t) or of all.
const pieSold=t=>{let g=0;for(const b of S.biz)if(BIZ_T[b.type].orbit&&(!t||b.type===t))g+=b.bw;for(const o of S.offers)if(BIZ_T[o.type].orbit&&(!t||o.type===t))g+=o.bw;return g;};
const pieRoom=t=>{const m=pieMarket(),sh=BIZ_T[t].share;return Math.min(m-pieSold(),sh?m*sh-pieSold(t):Infinity);};
// Which kinds can be offered today: only with a crust up, a dish working, and market left.
function pieOfferTypes(){if(!pieOn()||!R||!R.pie||!R.pie.hubs.length||!pieDishes().length||pieSold()>=pieMarket())return [];
  const t=['pizza','pizza','pizza','boat','boat'];if(R.pie.hubs.some(pieLased))t.push('flywifi','flywifi','flywifi');
  // The Mars mission's orbital option exists only in saves of this version (S.pieV), at the top level.
  if(S.pieV>=1&&lvl()>=13)t.push('marsorb');return t.filter(x=>pieRoom(x)>=BIZ_T[x].opts[0]);}
// Cities a terminal could sit in: cruise ships call at the coast, airlines at big airports, homes anywhere.
function pieCands(t){if(t==='boat')return CITIES.filter(c=>c.beach||pieCoast(c.id));if(t==='flywifi')return CITIES.filter(c=>c.P>=250);return CITIES;}
// The size fits the market left and the room on the dish it would land on (offers on the table count as taken).
function pieSpawn(t){const T=BIZ_T[t],min=T.opts[0],ok=pieCands(t).filter(c=>{if(c.cn)return false;const L=pieServe(c.id,t);return !!L&&L.left>=min;});if(!ok.length)return;
  const far=ok.filter(c=>!S.pops[c.id]&&c.P<=60),city=(far.length&&Math.random()<PIE_REMOTE?pick(far):pick(ok)).id;
  const left=Math.min(pieRoom(t),pieServe(city,t).left-S.offers.reduce((a,o)=>a+(BIZ_T[o.type].orbit?o.bw:0),0)),opts=T.opts.filter(g=>g<=left),bw=opts.length?pick(opts):0;if(!bw)return;
  const list=T.names.filter(n=>!S.usedNames.includes(n)),name=list.length?pick(list):pick(T.names);useName(name);
  S.offers.push({id:uid(),city,city2:null,name,type:t,bw,rate:T.rate,reqs:[],exp:S.day+40});}
// Orbit has its own sales desk, so the ground's offers keep their odds: about one call a week, two on the table at most.
PIE_ON.day.push(()=>{if(S.offers.filter(o=>BIZ_T[o.type].orbit).length>=PIE_OFFERS)return;const t=pieOfferTypes();if(t.length&&Math.random()<PIE_OFFER_RATE)pieSpawn(pick(t));});
