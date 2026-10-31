// Everything that can fill up at a POP: transit ports, IX ports, PNIs, caches and the routers themselves.
const HOT=0.9,HOTL={t:'T',ix:'IX',p:'P',c:'C',r:'R'},HOTC={t:'#7B61FF',ix:'#FFD23F',p:'#2C7A7B',c:'#C8102E',r:'#FF4F9A'};
function hotPorts(){const out=[];if(!R||!S)return out;
  for(const t of S.transit){if(t.down>S.day)continue;const cap=lagCap(PORT[t.tier].g,t.n),u=(R.useT[t.id]||0)/cap;if(u>=HOT)out.push({k:'t',city:t.city,lab:tr('hot_ports_and_rank.net_transit_lag',{net:NET[t.net].name,lag:lagName(t.tier,t.n)}),u,tip:tr('hot_ports_and_rank.add_a_lag_member_upgrade_the')});}
  for(const c in S.ixp){const cap=ixCap(c);if(!cap)continue;const u=(R.useIx[c]||0)/cap;if(u>=HOT)out.push({k:'ix',city:ixCity(c),lab:tr('common.port_port',{port:ixName(c)}),u,tip:tr('hot_ports_and_rank.upgrade_the_ix_port_or_add')});}
  for(const p of S.pni){if(!pniOn(p))continue;const cap=lagCap(pniG(p),p.n),u=(R.usePni[p.id]||0)/cap;if(u>=HOT)out.push({k:'p',city:p.city,lab:tr('common.pni_with_net',{net:NET[p.net].name}),u,tip:tr('hot_ports_and_rank.add_a_lag_member_or_upgrade')});}
  const cc={};for(const x of S.caches){const k=x.city+'|'+x.net;(cc[k]=cc[k]||{city:x.city,net:x.net,used:0,cap:0});cc[k].used+=R.useCache[x.id]||0;cc[k].cap+=CACHE_CAP;}
  for(const k in cc){const x=cc[k],u=x.used/x.cap;if(u>=HOT)out.push({k:'c',city:x.city,lab:x.cap>CACHE_CAP?tr('hot_ports_and_rank.name_caches',{name:NET[x.net].cache.name}):tr('common.name_cache',{name:NET[x.net].cache.name}),u,tip:tr('hot_ports_and_rank.ask_for_another_box_the_overflow')});}
  for(const c in S.pops){const cap=R.nodeCap[c];if(!cap)continue;const u=(R.nodeLoad[c]||0)/cap;if(u>=HOT)out.push({k:'r',city:c,lab:tr('common.routers'),u,tip:tr('hot_ports_and_rank.upgrade_the_router_or_add_a')});}
  return out.sort((a,b)=>b.u-a.u);}
function hotByCity(){const m={};for(const h of hotPorts())(m[h.city]=m[h.city]||{})[h.k]=Math.max((m[h.city]||{})[h.k]||0,h.u);return m;}
function isTier2(){return Object.keys(S.pops).length>=5&&Object.keys(S.ixp).length>=3&&R.sessions>=15;}
// Sparkly Seabone joined the Tier 1s in 1.12. Older saves keep the five they were playing for.
// Tier 1s added later only count for games started after them, so old saves keep their win (#155).
const t1Need=()=>NETS.filter(n=>n.type==='t1'&&(n.id!=='skl'||(S&&S.t1v>=2))&&(n.id!=='att'||(S&&S.t1v>=3)));
/* Reach is counted through customer cones (#85): a PNI with a Tier 1 reaches everyone who buys transit from it, and
   their customers. That only ever adds reach, so the rule is easier for every save, old ones included, and needs no
   version: what was Tier 1 stays Tier 1. Networks in nobody's cone still need peering of their own. */
function isTier1(){return t1Need().every(n=>S.pni.some(p=>p.net===n.id&&pniOn(p)))&&S.transit.length===0&&R.reach>0.999;}
// What you are now, not what you once were (#46): buying transit again or losing reach drops the label.
function tierLabel(){return S.won&&isTier1()?'Tier 1':isTier2()?'Tier 2':'Tier 3';}
function t1Why(){if(S.transit.length)return tr('hot_ports_and_rank.you_buy_transit_again');const miss=t1Need().filter(n=>!S.pni.some(p=>p.net===n.id&&pniOn(p)));if(miss.length)return tr('hot_ports_and_rank.no_pni_with_list',{list:miss.map(n=>n.name).join(', ')});{const lost=NETS.filter(n=>!R.reachable[n.id]).sort((a,b)=>NSH[b.id]-NSH[a.id]);if(lost.length)return tr('hot_ports_and_rank.you_cannot_reach_list_outside_cones',{list:lost.slice(0,3).map(n=>n.name).join(', ')+(lost.length>3?' '+tr('hot_ports_and_rank.and_n_more',{n:lost.length-3}):'')});}return tr('hot_ports_and_rank.your_reach_is_p_not_100',{p:reachPct(R.reach)});}

