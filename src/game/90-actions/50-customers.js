Object.assign(ACT,{
 // List spare capacity with a capacity broker (#203): w waves and p spare pairs, sold as the route's market wants.
 listFiber:({id,w,p})=>{const l=S.links.find(x=>x.id===id);if(!l||l.kind!=='df'||l.ready>S.day)return;w=Math.max(0,Math.min(freeCh(l)-((l.list&&l.list.w)||0),w|0));p=l.own?Math.max(0,Math.min((pairFree(l)?1:0)-((l.list&&l.list.p)||0),p|0)):0;
   if(!w&&!p){toast(tr('customers.nothing_spare_to_sell_on_this'),'bad');sfx('err');return;}const L=l.list||(l.list={w:0,p:0});L.w+=w;L.p+=p;
   toast(tr('broker.listed',{a:CITY[l.a].name,b:CITY[l.b].name}),'good');sfx('click');after();},
 unlistFiber:({id})=>{const l=S.links.find(x=>x.id===id);if(!l||!l.list)return;delete l.list;sfx('click');after();},
 accept:({id,auto=false})=>{const o=S.offers.find(x=>x.id===id);if(!o)return;const customer=auto?autoOffer(o):offerCustomer(o);if(!customer)return;if(!bHas(o)){toast(tr('customers.you_need_a_pop_in_every'),'bad');return;}
   if(o.type==='wwave'){const l=S.links.find(x=>x.id===o.link);if(!l||chMax(l)-(l.ch||[]).length-soldSlots(l)<o.slots){toast(tr('customers.not_enough_free_channels_on_that'),'bad');return;}}
   if(BIZ_T[o.type].event&&S.day>=o.start){toast(tr('customers.too_late_the_event_has_already'),'bad');return;}
   // A carrier renting more alien waves on a fiber it already rents grows its contract, like a real order for extra waves,
   // instead of a new customer for every few waves (a big fiber business otherwise fills the save with tiny contracts).
   const more=o.type==='wwave'&&S.biz.find(b=>b.type==='wwave'&&b.link===o.link&&b.name===o.name);
   if(more){const l=S.links.find(x=>x.id===o.link);S.offers=S.offers.filter(x=>x!==o);more.slots=(more.slots||0)+(o.slots||0);more.rate+=o.rate;if(l)more.what=wwWhat(l,more.slots);
     floater(CITY[o.city].x,CITY[o.city].y-30,tr('common.signed'),'#16A866');sfx('coin');after();return;}
   S.offers=S.offers.filter(x=>x!==o);S.biz.push(customer);
   floater(CITY[o.city].x,CITY[o.city].y-30,tr('common.signed'),'#16A866');sfx('coin');after();},
 decline:({id})=>{S.offers=S.offers.filter(x=>x.id!==id);after();},
 dropBiz:({id})=>{const b0=S.biz.find(x=>x.id===id);if(!b0)return;if(BIZ_T[b0.type].event&&S.day>=b0.start){toast(tr('customers.the_event_is_already_running_the'),'bad');sfx('err');return;}if(UI.confirm!==id){UI.confirm=id;renderPanel();return;}S.biz=S.biz.filter(b=>b.id!==id);UI.confirm=null;after();},
});
