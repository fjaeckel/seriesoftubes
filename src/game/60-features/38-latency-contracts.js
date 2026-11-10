/* ---------- Strict latency contracts (#137) ----------
   Late in the game, carriers and market-data networks buy 1.6 or 3.2T on one route with a latency SLA, the way real
   low-latency wholesale is sold: a premium per Gbps for guaranteed milliseconds, and a service credit for every day the
   circuit runs over them. They are an ordinary customer type (BIZ_T.lowlat) with the latency requirement every trading
   link has (REQS.lat on R.l2lat, the one-way path latency compute() measures), offered from customer level LC_LV, and
   never bigger than BIZ_T.lowlat.max: one contract cannot carry a level on its own. */
const LC_LV=BIZ_T.lowlat.lv,LC_MOOD=3,LC_GRACE=15;
// Once a day for each customer, from the mood check: a latency customer over its SLA after the provisioning grace is
// credited that day's fee and loses patience faster than for a bandwidth problem alone. Returns that extra mood lost.
function lcBreach(b,d){const T=BIZ_T[b.type];if(!T||!T.sla)return 0;
  if(d-(b.since||0)<LC_GRACE||!(b.latMax>0)||REQS.lat.ok(b)){delete b.lcB;return 0;}
  const cr=Math.round(bizMo(b)/monLen(d));S.cash-=cr;b.lcCr=(b.lcCr||0)+cr;
  if(!b.lcB){b.lcB=1;const v=R.l2lat[b.id];
    toast(tr('latency_contracts.over_sla',{name:esc(b.name),a:CITY[b.city].name,b:CITY[b.city2].name,ms:isFinite(v)?v.toFixed(1):'∞',max:b.latMax,price:fmt$(cr)}),'bad',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);}
  return LC_MOOD;}
// The contract, on its offer and customer rows (bRisk()).
function lcNote(b){const T=BIZ_T[b.type];if(!T||!T.sla)return '';
  return `<div class="meta">⏱️ ${tr('latency_contracts.sla_terms',{ms:b.latMax,max:fmtG(T.max)})}${b.lcCr>0?' · '+tr('latency_contracts.credits_paid',{price:fmt$(b.lcCr)}):''}</div>`;}
// Saves: credits paid and the breach flag are numbers and a flag; a contract is never bigger than its type allows.
function lcSanitize(s){for(const b of [...s.biz,...s.offers]){const T=BIZ_T[b.type];
  if(b.lcCr!==undefined){const v=Math.round(+b.lcCr);if(Number.isFinite(v)&&v>0)b.lcCr=v;else delete b.lcCr;}
  if(b.lcB!==undefined){if(b.lcB)b.lcB=1;else delete b.lcB;}
  if(T&&T.max)b.bw=Math.min(T.max,Math.max(T.opts[0],b.bw));
  if(T&&T.sla&&Array.isArray(b.reqs)&&!b.reqs.includes('lat'))b.reqs.unshift('lat');
  if(T&&T.sla&&!(b.latMax>0)&&isCity(b.city)&&b.city2&&isCity(b.city2))b.latMax=latMaxOf(b.city,b.city2);}}
