/* ---------- Pie in the Sky: customers in orbit (docs/plans/pie-in-the-sky.md) ----------
   Terminal customers (BIZ_T[].orbit: pizza homes and boats, flywifi airlines, boat cruise ships, marsorb the Mars mission
   over your pies) are offered only once the network can serve them (rule F3's spirit): a baked crust over the city and a
   pie dish that can land it (pieServe(), from the last compute). The market is the shell, not your ambition: what all
   your crusts can sell (PIE_SELL of their capacity, the rest flies over ocean and empty land) caps what is signed and
   on offer, so orbit income cannot outgrow the sky (like F5). Remote towns (no POP of yours, few people) are the first
   to call: Pitcairn, the Arctic, the outer islands. */
const PIE_SELL=0.4,PIE_REMOTE=0.6,PIE_OFFER_RATE=1/3,PIE_OFFERS=2;
// Orbit customers know the sky has bad weeks: without service they lose at most PIE_PATIENCE happiness a day (the day tick),
// so they grumble, then fume, and cancel only after about a month of nothing, not in three days like a fiber customer.
const PIE_PATIENCE=4;
// Gbps the sky can sell: what each crust carries (pieCap(): a half-baked one, a share of it).
function pieMarket(){if(!S.pie)return 0;let g=0;for(const id of pieHubs())g+=pieCap(id)*PIE_SELL;return g;}
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
// Whoever runs sales has a say (99-pie-sales.js): the room they will sell, the size they ask for, how they dress it up.
function pieSpawn(t){const T=BIZ_T[t],min=T.opts[0],ok=pieCands(t).filter(c=>{if(c.cn)return false;const L=pieServe(c.id,t);return !!L&&pieSlRoom(L)>=min;});if(!ok.length)return;
  const far=ok.filter(c=>!S.pops[c.id]&&c.P<=60),city=(far.length&&Math.random()<PIE_REMOTE?pick(far):pick(ok)).id;
  const left=Math.min(pieRoom(t),pieSlRoom(pieServe(city,t))-S.offers.reduce((a,o)=>a+(BIZ_T[o.type].orbit?o.bw:0),0)),opts=T.opts.filter(g=>g<=left),bw=opts.length?pieSlSize(opts):0;if(!bw)return;
  const list=T.names.filter(n=>!S.usedNames.includes(n)),name=list.length?pick(list):pick(T.names);useName(name);
  const o={id:uid(),city,city2:null,name,type:t,bw,rate:T.rate,reqs:[],exp:S.day+40};pieSlShape(o);S.offers.push(o);}
// Grand opening: the first PIE_OPEN_DAYS after a crust starts carrying traffic (crust.open, the day it first did), the phone
// rings every day and up to PIE_OPEN_OFFERS wait, so regular customers sign while the patchy-sky income fades (99-pie-patchy.js).
const PIE_OPEN_DAYS=30,PIE_OPEN_OFFERS=4;
function pieOpening(){const P=S.pie;let on=false;for(const id of pieHubs()){const c=P.crusts[id];if(!c)continue;if(c.open===undefined&&pieCap(id)>0)c.open=S.day;if(c.open!==undefined&&S.day-c.open<PIE_OPEN_DAYS)on=true;}return on;}
// Orbit offers come on top of the ground's, so the ground's offers keep their odds: about one call every three days, two on the table at most.
PIE_ON.day.push(()=>{const op=pieOpening();if(S.offers.filter(o=>BIZ_T[o.type].orbit).length>=(op?PIE_OPEN_OFFERS:PIE_OFFERS))return;const t=pieOfferTypes();if(t.length&&(op||Math.random()<PIE_OFFER_RATE*pieOfferMul()))pieSpawn(pick(pieSlTypes(t)));});
