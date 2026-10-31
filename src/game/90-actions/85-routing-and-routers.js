Object.assign(ACT,{
 // Backbone technology: buy the next level (one step at a time), or run any level already paid for.
 coreUp:()=>{if(!S.core||S.mode==='puzzle'||S.pz||S.ar||S.scn)return;const n=S.core.lv+1;if(n>4)return;
   if(lvl()<CORE_REQ[n]){toast(tr('core.needs_customer_level_n',{n:CORE_REQ[n]}),'bad');sfx('err');return;}if(!spend(CORE_COST[n]))return;
   S.core.lv=n;S.core.run=n;delete S.core.legacy;const out=coreOut().length;
   toast(tr('core.your_backbone_now_runs_lv',{lv:tr(CORE_LV[n])})+(out?' '+trn('core.n_pops_stay_outside',out):''),'good');sfx('build');after();},
 coreLab:()=>{if(!coreOn()||S.core.lab||S.core.lv<1)return;if(!spend(CORE_LAB))return;
   S.core.lab=true;toast(tr('core.interop_lab_open_vendors_now'),'good');sfx('coin');after();},
 coreSet:({v})=>{if(!S.core)return;v=+v;if(!(v>=0&&v<=S.core.lv)||(v===S.core.run&&!S.core.legacy))return;S.core.run=v;delete S.core.legacy;sfx('click');after();},
 via:({v})=>{UI.via=v;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
 setRoute:({id,m})=>{if(!own(RT,m))return;const b=S.biz.find(x=>x.id===id);if(b){b.route=m;sfx('click');after();}},
 route:({r})=>{UI.route=r;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
 addParallel:({id})=>{const l=S.links.find(x=>x.id===id);if(l)openLinkModal(l.a,l.b);},
 addRouter:({city})=>{const p=S.pops[city];if(!p||(p.routers||1)>=RMAX)return;if(!spend(routerCost(p.rgen||0,p.routers||1)))return;p.routers=(p.routers||1)+1;floater(CITY[city].x,CITY[city].y-30,tr('common.router_added'),'#FF4F9A');after();},
 models:()=>{UI.models=!UI.models;renderPanel();},
 rmRouter:({city})=>{const p=S.pops[city];if(!p||(p.routers||1)<=1)return;if(portsUsed(city)>portsMax(city,undefined,p.routers-1)){toast(tr('routing_and_routers.unplug_something_first_used_ports',{used:fmtPorts(portsUsed(city)),max:portsMax(city,undefined,p.routers-1)}),'bad');sfx('err');return;}p.routers--;{const back=tradeIn(p.rgen||0,1);if(back>0){S.cash+=back;toast(tr('routing_and_routers.sold_a_model_on_ebuy_price',{model:esc(RG[p.rgen||0].n),price:fmt$(back)}),'good');}}after();},
 upRouter:({city,g})=>{const p=S.pops[city];if(!p)return;g=g===undefined?mainRG(RG[p.rgen||0].cls+1):+g;if(!RG[g]||g===(p.rgen||0))return;{const why=modelFits(city,g);if(why){toast(tr('routing_and_routers.the_model_won_t_fit_why',{model:esc(RG[g].n),why:esc(why)}),'bad');sfx('err');return;}}if(!techOk('rg',g,RG[g].lvl)){toast(tr('routing_and_routers.model_unlocks_at_customer_level_lv',{model:esc(RG[g].n),lv:RG[g].lvl}),'bad');sfx('err');return;}
   const rt=p.routers||1,old=p.rgen||0;if(p.rupDay===S.day){toast(tr('routing_and_routers.the_new_routers_in_city_are',{city:CITY[city].name}),'bad');sfx('err');return;}const back=tradeIn(old,rt);if(!spend(swapCost(city,g)))return;p.rgen=g;p.rupDay=S.day;if(back>0)toast(tr('routing_and_routers.sold_the_old_model_on_ebuy',{model:esc(RG[old].n),price:fmt$(back)}),'good');
   if(rt===1&&popIdle(city))toast(tr('routing_and_routers.new_router_in_city_swapped_before',{city:CITY[city].name}),'good');
   else if(rt===1){const sl=slowBoot(city),dd=sl?3:1;p.down=Math.max(p.down||0,S.day+dd);addInc({type:'maint',ref:city,until:S.day+dd,msg:sl?tr('routing_and_routers.swapping_the_only_router_in_city',{city:CITY[city].name,model:RG[g].n,how:pick(SLOW_BOOT),n:dd}):tr('routing_and_routers.swapping_the_only_router_in_city_d5b5',{city:CITY[city].name,model:RG[g].n}),cost:0});toast(`<b>${tr('routing_and_routers.maintenance_window_in_city',{city:CITY[city].name})}</b><br>${sl?tr('routing_and_routers.one_router_and_this_one_takes',{n:dd}):tr('routing_and_routers.one_router_means_downtime_during_the')}`,'bad');}
   else toast(tr('routing_and_routers.rolling_upgrade_in_city_n_model',{city:CITY[city].name,n:rt,model:esc(RG[g].n)}),'good');
   floater(CITY[city].x,CITY[city].y-30,RG[g].n+'!','#FF4F9A');after();},
});
