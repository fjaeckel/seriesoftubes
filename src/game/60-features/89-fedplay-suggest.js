/* ================= MULTIPLAYER GAMEPLAY: who is worth peering with, and on-net growth =================
   Two nudges towards working with other players.
   Worth peering with: the players this network reaches over transit today, with what peering would save on the transit
   bill (the real 95th-percentile billing, as "Is a PNI worth it?" prices it) and where the two can meet (an exchange
   both are on, a city both have a POP in). Information only, worked out when the Multimode sheet or the dashboard draws
   it, once per routing result; never in the day loop.
   On-net growth: while a direct peering or PNI with a player runs, your customers send that network more traffic, up to
   twice as much after FEDO_DAYS days, as eyeballs and content do once they meet on-net. The other player's game applies
   the same rule, so it is mutual. The boost is set by the hourly look (fedPlayRun) into the snapshot (S.fedn.nets[].b,
   per mille), so routing stays a function of the save; shares still come out of every other network's (89-fedplay-nets.js). */
const FEDS_N=3,FEDS_MIN_G=0.05,FEDO_DAYS=30,FEDO_MAX=1000,FEDO_STEP=50;
let FEDS=null;
// A direct deal with key that runs or waits to start: peering (exchange or PNI) or a PNI.
const fedDirect=(s,k)=>s.fed.deals.some(d=>d.key===k&&d.st!=='over'&&(d.deal==='peering'||d.deal==='pni'));
/* The monthly transit bill saved if g Gbps less left over transit: each transit port gives up its share of g by its
   95th percentile, and is billed again with the real billing (commits and minimums included). */
function fedTransitSaved(g){let tot=0;for(const t of S.transit)tot+=R.p95[t.id]||0;if(!(tot>0)||!(g>0))return 0;let v=0;
  for(const t of S.transit){const q=R.p95[t.id]||0;if(q>0)v+=transitMo(t,q)-transitMo(t,Math.max(0,q-g*q/tot));}
  return Math.max(0,v);}
/* The players worth peering with, best saving first, at most FEDS_N: [{k, id, g (Gbps over transit), saved ($/month),
   ix (exchanges both are on), pops (cities both have a POP in)}]. Players already peered with, dark, excluded or with no
   place to meet are left out. */
function fedSuggest(){if(!S||!S.fed||!S.fedn||!R||!R.netEg)return [];if(FEDS&&FEDS.R===R&&FEDS.s===S&&FEDS.h===S.fedn.h)return FEDS.l;
  const out=[];
  for(const s of S.fedn.nets){if(s.st==='dark'||fedDirect(S,s.k)||fedExcl1(s.k))continue;const n=fedNetOf(s.k);if(!n)continue;
    const g=(R.netEg[n.id]||{}).t||0;if(g<FEDS_MIN_G)continue;const p=fedPair(n);if(!p.ix.length&&!p.pops.length)continue;
    out.push({k:s.k,id:n.id,g,saved:fedTransitSaved(g),ix:p.ix,pops:p.pops});}
  out.sort((a,b)=>b.saved-a.saved||b.g-a.g||fedByStr(a.k,b.k));
  const l=out.slice(0,FEDS_N);FEDS={R,s:S,h:S.fedn.h,l};return l;}
/* A port on an exchange a player runs (89-fedplay-ix.js), where it would reach two or more players this network reaches
   over transit today: [{k (the founder), at, ids (those players), g, saved}], best saving first, at most FEDS_IX. A port
   reaches the founder and the open players there, as its exit does (fedDealExits). Only in cities with your POP, never
   on an exchange you already have a port on or that declines ports. */
const FEDS_IX=2;let FEDSX=null;
function fedSuggestPorts(){if(!S||!S.fed||!S.fedn||!R||!R.netEg)return [];if(FEDSX&&FEDSX.R===R&&FEDSX.s===S&&FEDSX.h===S.fedn.h&&FEDSX.a===FEDN.ann)return FEDSX.l;
  const me=fedMe(),out=[],over=id=>{const n=NET[id],g=(R.netEg[id]||{}).t||0;return n&&n.fed&&n.fst!=='dark'&&g>=FEDS_MIN_G&&!fedDirect(S,n.fed)&&!fedExcl1(n.fed)?g:0;};
  for(const [k,o] of FEDN.ann){const b=o&&o.rec&&o.rec.body,r=b&&b.rates&&b.rates.ix,N=fedNetOf(k);if(!r||k===me||!N||N.fst==='dark'||fedExcl1(k)||!b.auto||b.auto.port==='decline')continue;
    for(const c of r.at){if(!S.pops[c]||S.fed.deals.some(d=>d.key===k&&(d.deal==='port'||d.deal==='cofound')&&d.terms.at===c&&d.st!=='over'))continue;
      const ids=[N.id,...NETS.filter(m=>m.fed&&m.id!==N.id&&m.fpol==='open'&&(m.fix||[]).includes(c)).map(m=>m.id)].filter(over);
      if(ids.length<2)continue;const g=ids.reduce((a,id)=>a+over(id),0);out.push({k,at:c,ids,g,saved:fedTransitSaved(g)});}}
  out.sort((a,b)=>b.saved-a.saved||b.g-a.g||fedByStr(a.k,b.k)||(a.at<b.at?-1:1));
  const l=out.slice(0,FEDS_IX);FEDSX={R,s:S,h:S.fedn.h,a:FEDN.ann,l};return l;}
// The list as rows, for the Multimode sheet and the dashboard; '' when there is nobody to suggest.
function fedSuggestHtml(){const l=fedSuggest(),px=fedSuggestPorts();if(!l.length&&!px.length)return '';
  const cs=a=>a.slice(0,2).map(c=>esc(fpCity(c))).join(', ')+(a.length>2?' …':'');
  return `<div class="fp-sugg"><h3 class="fp-sub">${tr('fedplay.worth_peering')}</h3><p class="meta">${tr('fedplay.worth_peering_note')}</p>`+l.map(x=>{const n=NET[x.id];
    const where=x.ix.length?tr('fedplay.sugg_both_at',{list:cs(x.ix)}):tr('fedplay.sugg_pni_in',{list:cs(x.pops)});
    return `<div class="row"><div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)}</div><div class="meta">${x.saved>=1?tr('fedplay.sugg_saves',{g:fmtG(x.g),cash:fmt$(x.saved)}):tr('fedplay.sugg_transit',{g:fmtG(x.g)})} · ${where}</div></div>${btn(tr('fedplay.d_peering'),'fpNet',{key:x.k},'sm')}</div>`;}).join('')
    +px.map(x=>{const n=fedNetOf(x.k),who=x.ids.map(id=>esc(NET[id].name));
      return `<div class="row"><div class="grow"><div class="nm">🔌 ${tr('fedplay.sugg_port',{net:fedBot(n)+esc(n.name),city:esc(fpCity(x.at))})}</div><div class="meta">${x.saved>=1?tr('fedplay.sugg_saves',{g:fmtG(x.g),cash:fmt$(x.saved)}):tr('fedplay.sugg_transit',{g:fmtG(x.g)})} · ${tr('fedplay.sugg_reaches',{list:who.slice(0,3).join(', ')+(who.length>3?' …':'')})}</div></div>${btn(tr('fedplay.ix_get_port'),'fpNet',{key:x.k,at:x.at,deal:'port'},'sm')}</div>`;}).join('')+'</div>';}

/* On-net growth per player network (key -> per mille more demand), from the direct deals running at now: a step every
   FEDO_STEP, so the snapshot (and routing) changes a few times a month, not every hour. */
function fedOnNet(s,now){const out=new Map();if(!s.fed)return out;
  for(const d of s.fed.deals){if(d.st!=='run'||(d.deal!=='peering'&&d.deal!=='pni')||!(d.start<=now))continue;
    const r=Math.min(1,(now-d.start)/(FEDO_DAYS*FED_DAY)),b=Math.min(FEDO_MAX,Math.floor(r*FEDO_MAX/FEDO_STEP)*FEDO_STEP);
    if(b>(out.get(d.key)||0))out.set(d.key,b);}
  return out;}
// Days a direct deal with key has run (for the sheet's line), or -1 when none runs.
function fedOnNetDays(s,key,now){let best=-1;for(const d of s.fed.deals)if(d.key===key&&d.st==='run'&&(d.deal==='peering'||d.deal==='pni')&&d.start<=now)best=Math.max(best,Math.floor((now-d.start)/FED_DAY));return best;}
