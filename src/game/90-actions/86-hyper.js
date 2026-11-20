/* ---------- The Hyperscaler's actions (37-hyper.js) ---------- */
Object.assign(ACT,{
 // Launch in a country: a marketing push and a privacy policy nobody reads; the first users sign up at once.
 hsLaunch:({cc})=>{if(!hyper()||!S.hs||typeof cc!=='string'||!ccInfo(cc)||S.hs.cc[cc])return;const w=hsWhy(cc);if(w){toast(w,'bad');sfx('err');return;}
   if(!spend(hsLic(cc)))return;S.hs.cc[cc]={d:Math.max(1,hsPot(cc)*HS_START),since:S.day};
   toast(tr('hyper.launched',{country:esc(ccName(cc))})+(Object.keys(S.pops).some(hsDoor)?'':`<br>${tr('hyper.launched_no_door')}`),'good');sfx('build');after();},
 // Build a region where none is (a Server Barn), or take the one here a size up. Either way it takes months, and the old
 // one serves all along. Power (38-hyper-power.js): hsPwGate wants the megawatts free; hsProtRoll may start a protest.
 hsRegion:({city})=>{if(!hyper()||!S.hs||!isCity(city)||!S.pops[city])return;const H=S.hs,d=H.rg[city];
   if(d){if(d.t===HS_CAGE){toast(tr('hyper_colo.no_grow',{city:esc(CITY[city].name)}),'bad');sfx('err');return;}const N=hsTNext(d);if(!N||d.ready>S.day||d.up)return;if(N.lv>lvl()){toast(tr('hyper.tier_needs_level',{name:tr(N.n),lv:N.lv}),'bad');sfx('err');return;}if(!hsPwGate(city,d.t+1))return;if(!spend(N.cost))return;
     d.up={t:d.t+1,ready:S.day+leadDays(N.days)};toast(tr('hyper.region_upgrade_started',{name:tr(N.n),city:CITY[city].name,date:dateStr(d.up.ready)}),'good');hsProtRoll(city,'rg');sfx('build');after();return;}
   if(!hsSite(city)){toast(tr('hyper.not_a_region_metro'),'bad');sfx('err');return;}
   if(hsRgN()>=hsRgMax()){toast(tr('hyper.your_level_allows_n_regions',{n:hsRgMax()}),'bad');sfx('err');return;}const N=HS_T[1];if(!hsPwGate(city,1)||!spend(N.cost))return;
   H.rg[city]={t:1,ready:S.day+leadDays(N.days),mw:N.mw};hsPwMk(city);toast(tr('hyper.region_build_started',{name:tr(N.n),city:CITY[city].name,date:dateStr(H.rg[city].ready)}),'good');hsProtRoll(city,'rg');sfx('build');after();},
 // Close a region and keep the POP: tap twice. Its users find another region, its tenants move where there is room (or
 // sulk), the kit is sold for a quarter of what the tier cost, and the level's region count gets a place back.
 hsRgClose:({city})=>{if(!hyper()||!S.hs||!isCity(city)||!S.hs.rg[city])return;const H=S.hs,d=H.rg[city];
   if(hsRgN()<2){toast(tr('hyper.close_last_region'),'bad');sfx('err');return;}
   if(UI.confirm!=='hsrg'+city){UI.confirm='hsrg'+city;sfx('click');renderPanel();return;}UI.confirm=null;
   const back=d.t===HS_CAGE?0:Math.round(HS_T[d.t].cost*0.25);delete H.rg[city];hsSanitize(S);S.cash+=back;
   for(const b of S.biz)if(b.type==='cloud'&&b.rg===undefined){const r=hsRgFor(b.city,null,b.p);if(r)b.rg=r;else b.mood=Math.max(0,(b.mood||0)-30);}
   toast(tr('hyper.region_closed',{city:CITY[city].name,cash:fmt$(back)}),'good');sfx('build');after();},
 // The edge stack at a front door: TLS ends here, and the static quarter never leaves the building.
 hsEdge:({city})=>{if(!hyper()||!S.hs||!isCity(city)||!S.pops[city]||S.hs.edge[city])return;if(!hsDoor(city)){toast(tr('hyper.edge_needs_a_door'),'bad');sfx('err');return;}
   if(!spend(HS_EDGE_COST))return;S.hs.edge[city]=1;toast(tr('hyper.edge_live',{city:CITY[city].name}),'good');sfx('build');after();},
});
FREEZE_ACTS.push('hsRegion','hsEdge','hsRgClose');
// A tenant needs a compute slot in a live region: no slot, no signature (the offer waits until one frees up).
{const f=ACT.accept;ACT.accept=a=>{const o=hyper()&&a&&S.offers.find(x=>x.id===a.id);if(o&&o.type==='cloud'&&!hsSlotFree()){toast(tr('hyper.no_slots'),'bad');sfx('err');return;}
  const n=S.biz.length;f(a);if(o&&S.biz.length>n){const b=S.biz[S.biz.length-1];if(b.type==='cloud'){b.rg=hsRgFor(b.city,null,b.p);if(b.rg)toast(tr('hyper.tenant_signed',{name:esc(b.name),city:CITY[b.rg].name}),'good');}}};}
