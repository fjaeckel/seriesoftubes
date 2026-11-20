/* ---------- The Hyperscaler's power actions (38-hyper-power.js) ---------- */
const hsPwAt=c=>hyper()&&!!S.hs&&isCity(c)&&!!S.pops[c]&&hsSite(c);
Object.assign(ACT,{
 // Ask the metro's utility for HS_Q_MW more: the study fee now, an answer in 90 to 270 days, and no promise.
 hsUtil:({city})=>{if(!hsPwAt(city))return;const P=hsPwMk(city);if(P.q)return;if(!spend(HS_Q_FEE))return;
   P.q={mw:HS_Q_MW,ready:S.day+leadDays(90+hstr(S.asn+'|'+S.day+'|'+city+'|q')%91+hstr(S.asn+'|'+city+'|'+S.day+'|q2')%91),late:0};
   toast(tr('hyper_power.util_asked',{util:tr(hsUtil(city)),mw:HS_Q_MW,city:esc(CITY[city].name),date:dateStr(P.q.ready)}),'good');after();},
 // A community fund: a new playground, a scholarship, a mural of a server rack. Goodwill, and a protest may be won.
 hsFund:({city})=>{if(!hsPwAt(city))return;const P=hsPwMk(city);if(P.gw>=100)return;if(!spend(HS_FUND))return;P.gw=Math.min(100,P.gw+HS_FUND_GW);
   toast(tr('hyper_power.fund_done',{city:esc(CITY[city].name),gw:P.gw}),'good');hsProtWin(city);after();},
 // Heat reuse: pipe the region's waste heat to the town pool. Once per metro, with a live region to make the heat.
 hsHeat:({city})=>{if(!hsPwAt(city)||!hsLive(city))return;const P=hsPwMk(city);if(P.heat)return;if(!spend(HS_HEAT))return;P.heat=hsHeatMo(city);P.gw=Math.min(100,P.gw+HS_HEAT_GW);
   const v={city:esc(CITY[city].name),mo:fmt$(Math.abs(P.heat))};toast(P.heat<0?tr('hyper_power.heat_pays',v):tr('hyper_power.heat_costs',v),'good');hsProtWin(city);after();},
 // A smaller build: the region the protest holds up goes one tier down (or the upgrade is called off); 80% of the
 // difference comes back, and the protesters declare victory.
 hsShrink:({city})=>{if(!hsPwAt(city))return;const p=hsProt(city),d=S.hs.rg[city];if(!p||p.on!=='rg'||!hsProtHeld(city)||!d)return;
   if(d.up){const t=d.up.t-1;S.cash+=Math.round((HS_T[d.up.t].cost-(t>d.t?HS_T[t].cost:0))*0.8);if(t>d.t){d.up.t=t;d.up.ready=Math.min(d.up.ready,S.day+leadDays(HS_T[t].days));}else delete d.up;}
   else{const t=d.t-1;S.cash+=Math.round((HS_T[d.t].cost-HS_T[t].cost)*0.8);d.t=t;d.mw=HS_T[t].mw;d.ready=Math.min(d.ready,S.day+Math.max(1,leadDays(HS_T[t].days)));}
   delete S.hs.prot[city];toast(tr('hyper_power.shrunk',{grp:tr(HS_GRP[p.g]),city:esc(CITY[city].name)}),'good');after();},
 // Another metro: call off what the protest holds up here, 90% back, and build somewhere that wants you.
 hsMove:({city})=>{if(!hsPwAt(city))return;const p=hsProt(city),H=S.hs,d=H.rg[city];if(!p||!hsProtHeld(city))return;
   if(p.on==='smr'){const P=hsPw(city),i=P.own.findIndex(x=>x.k==='smr'&&x.ready>S.day);if(i<0)return;P.own.splice(i,1);S.cash+=Math.round(HS_GEN.smr.cost*0.9);}
   else if(d.up){S.cash+=Math.round(HS_T[d.up.t].cost*0.9);delete d.up;}
   else{S.cash+=Math.round(HS_T[d.t].cost*0.9);delete H.rg[city];}
   delete H.prot[city];hsPwMk(city).gw=Math.min(100,hsPw(city).gw+10);toast(tr('hyper_power.moved',{grp:tr(HS_GRP[p.g]),city:esc(CITY[city].name)}),'good');after();},
 // Own generation next to a region: solar with batteries, a substation of your own, a small modular reactor.
 hsGen:({city,k})=>{if(!hsPwAt(city)||!own(HS_GEN,k)||!S.hs.rg[city])return;const G=HS_GEN[k],P=hsPwMk(city);
   if(G.lv>lvl()){toast(tr('hyper_power.gen_needs_level',{name:tr(G.n),lv:G.lv}),'bad');sfx('err');return;}
   if(P.own.filter(x=>x.k===k).length>=G.max)return;if(!spend(G.cost))return;P.own.push({k,ready:S.day+leadDays(G.days)});
   toast(tr('hyper_power.gen_started',{name:tr(G.n),city:esc(CITY[city].name),date:dateStr(P.own[P.own.length-1].ready)}),'good');
   if(k==='smr')hsProtRoll(city,'smr');after();},
});
FREEZE_ACTS.push('hsGen');
// A tenant draws HS_MW_SLOT in its region: no megawatts there, no signature.
{const f=ACT.accept;ACT.accept=a=>{const o=hyper()&&S.hs&&a&&S.offers.find(x=>x.id===a.id);
  if(o&&o.type==='cloud'){const r=hsRgFor(o.city);if(r&&hsMwFree(r)<HS_MW_SLOT){toast(tr('hyper_power.tenant_no_power',{city:esc(CITY[r].name),util:tr(hsUtil(r))}),'bad',[{l:tr('common.open'),act:'popGo',args:{city:r}}]);sfx('err');return;}}
  f(a);};}
