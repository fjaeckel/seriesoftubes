Object.assign(ACT,{
 // Buy what the offer asks for, then sign (#241). cost: the price the button showed; a changed quote buys nothing.
 acceptFix:({id,cost})=>{const o=S.offers.find(x=>x.id===id),q=reqFix(o);if(!o||!q||!reqFixCanSign(o))return;
   if(q.cost!==+cost){toast(tr('utilities.quote_changed'),'bad');sfx('err');after();return;}
   if(S.cash<q.cost){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return;}
   // The Infra tab's own buttons, quietly, then the ordinary signing with its toast and redraw.
   opsQuiet(()=>{for(const x of q.items){if(x.k==='gen')ACT.addGen({city:x.city});else if(x.k==='metro')ACT.addSite({city:x.city});else ACT.addRouter({city:x.city});}});
   toast(esc(tr('req_fix.bought',{list:q.items.map(x=>tr(REQ_FIX_L[x.k],{city:CITY[x.city].name})).join(', '),cost:fmt$(q.cost)})),'good');
   ACT.accept({id});},
});
