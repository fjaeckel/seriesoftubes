Object.assign(ACT,{
 applyCn:()=>{if(S.cnLic.state!=='none')return;if(!spend(CN_LIC))return;S.cnLic={state:'pending',ready:S.day+leadDays(45)};toast(tr('security_and_china.application_filed_your_local_partner'),'goal');after();},
 togglePrem:({id})=>{const t=S.transit.find(x=>x.id===id);if(!t||!premCity(NET[t.net],t.city)||premOnlyAt(NET[t.net],t.city))return;t.premium=!t.premium;sfx('click');after();},
 buildScrub:({city,tier})=>{if(!S.pops[city]||S.scrubs.some(x=>x.city===city))return;const T=SCRUB_TIERS[tier||0];if(!T)return;if((lvl()||1)<T.lvl){toast(tr('security_and_china.tier_scrubbing_unlocks_at_customer',{tier:T.n,lv:T.lvl}),'bad');sfx('err');return;}if(!spend(T.cost))return;if(!hasScrub())S.scrubMode='always';S.scrubs.push({city,tier:tier||0});toast(tr('security_and_china.tier_scrubbing_center_online_in_city',{tier:T.n,city:CITY[city].name,g:fmtG(T.g)}),'good');after();},
 scrubUp:({city,tier})=>{const x=S.scrubs.find(q=>q.city===city);tier=+tier;if(!x||!SCRUB_TIERS[tier]||tier<=(x.tier||0))return;const T=SCRUB_TIERS[tier];if((lvl()||1)<T.lvl){toast(tr('security_and_china.tier_scrubbing_unlocks_at_customer',{tier:T.n,lv:T.lvl}),'bad');sfx('err');return;}if(!spend(Math.round(T.cost*0.6)))return;x.tier=tier;toast(tr('security_and_china.scrubbing_upgraded_to_tier',{tier:T.n}),'good');after();},
 scrubMode:()=>{if(!hasScrub())return;S.scrubMode=S.scrubMode==='ondemand'?'always':'ondemand';sfx('click');after();},
 rmScrub:({city})=>{if(!S.scrubs.some(x=>x.city===city))return;if(UI.confirm!=='scrub:'+city){UI.confirm='scrub:'+city;renderAll();return;}S.scrubs=S.scrubs.filter(x=>x.city!==city);if(!hasScrub())S.scrubMode='always';UI.confirm=null;after();},
 cleanPipe:({id})=>{const t=S.transit.find(x=>x.id===id);if(!t)return;t.clean=!t.clean;toast(t.clean?tr('security_and_china.clean_pipe_add_on_enabled_on',{net:NET[t.net].name,mo:fmt$(cleanMo(t))}):tr('security_and_china.clean_pipe_add_on_removed_from',{net:NET[t.net].name}),t.clean?'good':'');after();},
 sacrif:({id})=>{const p=S.pni.find(x=>x.id===id);if(!p)return;p.sacrif=!p.sacrif;toast(p.sacrif?tr('security_and_china.net_pni_is_now_a_sacrificial',{net:NET[p.net].name}):tr('security_and_china.net_pni_is_back_to_normal',{net:NET[p.net].name}),p.sacrif?'good':'');after();},
 // RTBH blackholes the target upstream: your ports and everyone else are saved, the target is dark until you withdraw it.
 rtbh:({id}={})=>{const a=ddosFind(id);if(!a){toast(tr('security_and_china.no_attack_to_blackhole_right_now'),'');return;}if(a.bh)return;a.bh=true;a.sac=1;S.stats.rtbh=(S.stats.rtbh||0)+1;ddosRtbhMood(a);
   const T=S.stats.ddT||(S.stats.ddT={}),first=!T.rtbh;T.rtbh=1;toast(tr('ddos.rtbh_on',{who:esc(ddosWho(a))})+(first?'<br><i>'+tr('ddos.learn_rtbh')+'</i>':''),'bad');sfx('alert');after();},
 unrtbh:({id}={})=>{const a=ddosFind(id);if(!a||!a.bh)return;a.bh=false;toast(tr('ddos.rtbh_off',{who:esc(ddosWho(a))}),'');after();},
 // On-demand scrubbing, when it does not engage by itself: start the diversion now.
 ddosEngage:({id}={})=>{const a=ddosFind(id);if(!a||!hasScrub()||a.eng!==undefined)return;a.eng=S.day;toast(tr('ddos.engaged'),'good');sfx('click');after();},
 ddosAuto:({k}={})=>{if(!['rtbh','scrub'].includes(k))return;const A=S.ddosAuto||(S.ddosAuto={rtbh:false,scrub:true});A[k]=k==='scrub'?A.scrub===false:!A.rtbh;sfx('click');after();},
 // Sandbox only: try the tools on a flood of your own.
 ddosTest:()=>{if(S.mode!=='sandbox'||!Object.keys(S.pops).length)return;ddosAttack(true);after();},
 hackback:({id}={})=>{const a=ddosFind(id);if(!a||a.until<=S.day){toast(tr('security_and_china.nothing_to_hack_back_right_now'),'');return;}if(!spend(20000))return;S.stats.hackback=(S.stats.hackback||0)+1;
   if(Math.random()<0.35){a.until=S.day;a.bh=false;S.stats.hackWin=(S.stats.hackWin||0)+1;toast(tr('security_and_china.hackback_3000tm_strikes_back_skynot',{city:CITY[a.city].name}),'goal');sfx('coin');}
   else{const fine=15000+Math.floor(Math.random()*35000);S.cash-=fine;S.stats.vigilante=(S.stats.vigilante||0)+1;
     toast(tr('security_and_china.hackback_3000tm_hit_the_wrong_target',{who:pick([tr('security_and_china.skynot_ai_flattened_a_grandma_s'),tr('security_and_china.you_counter_flooded_a_hospital_in'),tr('security_and_china.the_botnet_was_already_someone_else')]),fine:fmt$(fine)}),'bad');sfx('err');}
   after();},
 cnPrem:({v})=>{UI.cnPrem=!!+v;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
});
