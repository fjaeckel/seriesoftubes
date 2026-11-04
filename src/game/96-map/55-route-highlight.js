/* "Show on map" for an L2VPN or SD-WAN circuit: the links it really crosses stay bright while the rest of the map goes dark. View state only (UI.hlBiz). */
let HLC=null;
// The city pairs carrying this circuit, from the per-edge flow groups compute() already keeps (R.efg); rebuilt once per routing pass.
function l2Hl(){const id=UI.hlBiz;if(!id||!S||!R)return null;if(HLC&&HLC.r===R&&HLC.id===id)return HLC.set;
  const ek='l2:'+id,set=new Set(),cities=new Set(),b=S.biz.find(x=>x.id===id);for(const k in R.efg)if((R.efg[k].get(ek)||0)>0){set.add(k);for(const c of k.split('|'))cities.add(c);}
  if(b)for(const c of b.sites||[b.city,b.city2])if(c)cities.add(c);HLC={r:R,id,set,cities};return set;}
// Is this city on the lit route, or one of its ends? Only meaningful while l2Hl() is not null.
const l2HlOn=c=>!!HLC&&HLC.cities.has(c);
// A click at x,y that lands on neither a lit link nor a lit city (empty map included): time to put the map back.
function l2HlMiss(x,y){const h=pickCity(x,y);if(h)return !l2HlOn(h.id);const id=hitLink(x,y),l=id&&S.links.find(k=>k.id===id);return !(l&&HLC&&HLC.set.has(edgeKey(l)));}
Object.assign(ACT,{
  hlRoute:({id})=>{if(!S.biz.some(b=>b.id===id))return;UI.hlBiz=UI.hlBiz===id?null:id;sfx('click');renderAll();},
});
