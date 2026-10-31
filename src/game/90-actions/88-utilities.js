Object.assign(ACT,{
 utilities:({city}={})=>{if(S)utilitiesModal(city);},
 utilityPick:()=>{if(S&&$('utilityCity'))utilitiesModal($('utilityCity').value);},
 utilityRouteServers:({city}={})=>{if(!S)return;const ids=utilityRouteServers();for(const ix of ids)S.rs[ix]=true;
   if(ids.length){sfx('build');after();}utilitiesModal(city,tr('utilities.route_servers_joined',{n:ids.length}));},
 utilityKit:({city,cost,modal})=>{const q=utilityKit(city);if(!q||(!q.cost&&!q.moves.length))return;
   // Prices can change while a modal is open. Refresh the quote before spending more.
   if(q.cost!==+cost){if(modal)utilitiesModal(city,tr('utilities.quote_changed'));else{renderPanel();toast(tr('utilities.quote_changed'));}return;}
   if(q.cost&&!spend(q.cost))return;const p=S.pops[city];
   if(q.gen)p.gen=true;if(q.site){p.site2=true;p.site2Day=S.day;}if(q.router)p.routers=2;
   const moves=new Map(q.moves.map(m=>[m.id,m.site]));for(const c of S.caches)if(moves.has(c.id))c.site=moves.get(c.id);
   after();const msg=tr('utilities.kit_applied',{city:CITY[city].name});if(modal)utilitiesModal(city,msg);else toast(esc(msg),'good');},
 utilityCaches:({city,quote,modal})=>{const q=utilityCaches(city);if(!q||!q.add.length)return;
   if(q.key!==quote){if(modal)utilitiesModal(city,tr('utilities.quote_changed'));else{renderPanel();toast(tr('utilities.quote_changed'));}return;}
   if(!portGate(city,q.add.length))return;
   for(const c of q.add)S.caches.push({id:uid(),city,net:c.net,site:c.site});
   sfx('build');after();const msg=tr('utilities.caches_requested',{n:q.add.length,city:CITY[city].name});if(modal)utilitiesModal(city,msg);else toast(esc(msg),'good');},
 utilityPeers:({city}={})=>{if(!S)return;const rows=utilityPeers();let n=0;
   for(const row of rows)for(const id of row.requests){S.peers[id+'@'+row.ix]=true;n++;}
   if(n){sfx('build');after();}utilitiesModal(city,tr('utilities.peers_requested',{n}));},
});
