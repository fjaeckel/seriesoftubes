/* ---------- The Hyperscaler's zones and cages: actions (38-hyper-zones.js) ---------- */
Object.assign(ACT,{
 // Another availability zone for the region here: a building on its own grid feed a few km away, a fifth of the tier's
 // price, its megawatts from the same metro grid.
 hsZone:({city})=>{if(!hyper()||!S.hs||!isCity(city))return;const w=hsAzWhy(city);if(w){toast(w,'bad');sfx('err');return;}
   const need=hsAzMw1(city),free=hsMwFree(city);if(need>free+1e-9){const P=hsPw(city);toast(tr('hyper_power.no_power',{name:tr('hyper_az.a_zone'),city:esc(CITY[city].name),need:Math.ceil(need),free:Math.max(0,Math.floor(free)),util:tr(hsUtil(city))}),'bad',
     P.q?[]:[{l:tr('hyper_power.ask_util',{mw:HS_Q_MW,cost:fmt$(HS_Q_FEE)}),act:'hsUtil',args:{city}}]);sfx('err');return;}
   if(!spend(hsAzCost(city)))return;const H=S.hs,L=H.az[city]||(H.az[city]=[]),used=L.map(z=>z.n);let n=hstr(S.asn+'|azn|'+city+'|'+L.length)%HS_AZ_NAMES.length;while(used.includes(n))n=(n+1)%HS_AZ_NAMES.length;
   L.push({r:S.day+leadDays(hsAzDays(city)),n});toast(tr('hyper_az.started',{zone:hsAzName(city,L.length-1),city:esc(CITY[city].name),date:dateStr(L[L.length-1].r)}),'good',[],{a:'city',v:city});sfx('build');after();},
 // Lease a cage at a wholesale colo provider: a region in about two weeks, a setup fee, a big monthly lease.
 hsColo:({city})=>{if(!hyper()||!S.hs||!isCity(city))return;const w=hsColoWhy(city);if(w){toast(w,'bad');sfx('err');return;}const T=HS_T[HS_CAGE];if(!spend(T.cost))return;
   S.hs.rg[city]={t:HS_CAGE,ready:S.day+leadDays(T.days),mw:0};hsPwMk(city);
   toast(tr('hyper_colo.started',{prov:tr(hsColoP(city)),city:esc(CITY[city].name),date:dateStr(S.hs.rg[city].ready),mo:fmt$(T.mo)}),'good',[],{a:'city',v:city});sfx('build');after();},
 // Move out of the cage into your own Server Barn in the same metro: built while the cage serves; the lease ends the
 // day the Barn opens, and users and tenants stay where they are.
 hsColoOut:({city})=>{if(!hyper()||!S.hs||!isCity(city))return;const w=hsColoOutWhy(city);if(w){toast(w,'bad');sfx('err');return;}const N=HS_T[1],d=S.hs.rg[city];
   if(N.lv>lvl()){toast(tr('hyper.tier_needs_level',{name:tr(N.n),lv:N.lv}),'bad');sfx('err');return;}if(!hsPwGate(city,1)||!spend(N.cost))return;
   d.up={t:1,ready:S.day+leadDays(N.days)};toast(tr('hyper_colo.moving',{name:tr(N.n),city:esc(CITY[city].name),date:dateStr(d.up.ready),prov:tr(hsColoP(city))}),'good',[],{a:'city',v:city});hsProtRoll(city,'rg');sfx('build');after();},
});
FREEZE_ACTS.push('hsZone','hsColo','hsColoOut');
