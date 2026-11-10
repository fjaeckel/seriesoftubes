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
 // Every POP's kit in one go (#317), all or nothing on the quoted price, one redraw at the end.
 utilityKitAll:({cost,city})=>{const q=utilityKitAll();if(!q||!q.cities.length)return;
   if(q.cost!==+cost){utilitiesModal(city,tr('utilities.quote_changed'));return;}
   if(S.cash<q.cost){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return;}
   let n=0;opsQuiet(()=>{for(const c of q.cities){const k=utilityKit(c);if(!k||S.cash<k.cost)continue;const c0=S.cash;ACT.utilityKit({city:c,cost:k.cost});if(S.cash<c0||!k.cost)n++;}});
   sfx('build');after();utilitiesModal(city,trn('utilities.kit_all_applied',n));},
 // The intern's new-POP template with or without the kit, from the Utilities sheet: the same switch as in Ops.
 utilityKitNew:({city})=>{if(!opsHired())return;S.ops.tpl.kit=!S.ops.tpl.kit;sfx('click');after();utilitiesModal(city);},
 utilityCaches:({city,quote,modal})=>{const q=utilityCaches(city);if(!q||!q.add.length)return;
   if(q.key!==quote){if(modal)utilitiesModal(city,tr('utilities.quote_changed'));else{renderPanel();toast(tr('utilities.quote_changed'));}return;}
   if(!portGate(city,q.ports))return;
   for(const c of q.add)S.caches.push({id:uid(),city,net:c.net,site:c.site,...(c.g?{g:c.g}:{})});
   sfx('build');after();const msg=tr('utilities.caches_requested',{n:q.add.length,city:CITY[city].name});if(modal)utilitiesModal(city,msg);else toast(esc(msg),'good');},
 utilityPeers:({city}={})=>{if(!S)return;const rows=utilityPeers();let n=0;
   for(const row of rows)for(const id of row.requests){S.peers[id+'@'+row.ix]=true;n++;}
   if(n){sfx('build');after();}utilitiesModal(city,tr('utilities.peers_requested',{n}));},
});
