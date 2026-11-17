Object.assign(ACT,{
 pathOpen:({id})=>{const b=S.biz.find(x=>x.id===id);if(b&&pathKind(b))pathModal(b);},
 pathMove:({id,link})=>{const b=S.biz.find(x=>x.id===id),l=b&&pathKind(b)==='fiber'&&fiberTargets(b).find(t=>t.l.id===link&&!t.no);if(!l)return;
   // A carrier already renting waves of that kind (and size) on that fiber: one contract, as when it orders more there.
   const wv=b.type==='wwave'||b.type==='mwave',what=(x,n)=>b.type==='wwave'?wwWhat(l.l,n):cmWhat(l.l,cmWP(x.g),n);
   const more=wv&&S.biz.find(x=>x!==b&&x.type===b.type&&x.link===link&&x.name===b.name&&x.g===b.g);
   if(more){more.slots=(more.slots||0)+(b.slots||0);more.rate+=b.rate;more.since=Math.min(more.since??0,b.since??0);more.mood=Math.min(more.mood??100,b.mood??100);more.what=what(more,more.slots);S.biz=S.biz.filter(x=>x!==b);}
   else{b.link=link;if(wv)b.what=what(b,b.slots||1);}
   CM_V++;   // managed waves come off their fiber's capacity (mwG()), which caches by fiber
   closeModal();toast(tr('customer_paths.name_moved_to_fiber',{name:esc(b.name),fiber:fibLab(l.l)}),'good');sfx('build');after();},
 pathPin:({id,via})=>{const b=S.biz.find(x=>x.id===id);if(!b||pathKind(b)!=='circuit'||typeof via!=='string')return;const p=via.split(',');
   if(p.length<2||p[0]!==b.city||p[p.length-1]!==b.city2||new Set(p).size!==p.length||!pathHops(pathEdges(),p))return;
   b.pin=p;closeModal();toast(tr('customer_paths.name_now_rides_path',{name:esc(b.name),path:esc(pathStr(p))}),'good');sfx('build');after();},
 // From a bottleneck in the window: close it and open the span's link, or the POP whose routers are full, on the map.
 pathShow:({link,city})=>{if(link&&S.links.some(l=>l.id===link)){closeModal();$('dash').hidden=true;selectLink(link);focusLink(link);}else if(isCity(city)&&S.pops[city]){closeModal();$('dash').hidden=true;ACT.focusCity({city});}},
 pathAuto:({id})=>{const b=S.biz.find(x=>x.id===id);if(!b||!b.pin)return;delete b.pin;closeModal();toast(tr('customer_paths.name_follows_routing_again',{name:esc(b.name)}),'good');sfx('click');after();},
});
