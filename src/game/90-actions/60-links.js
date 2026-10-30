Object.assign(ACT,{
 upLink:({id,tier})=>{tier=+tier;const l=S.links.find(x=>x.id===id);if(!l||l.kind!=='wave'||!LT[tier]||tier<=l.tier)return;{const w=subWaveWhy(tier,l.km,l.sub);if(w){toast(tr('links.no_wave_waves_on_this_cable',{wave:LT[tier].n,why:esc(w)}),'bad');sfx('err');return;}}if(!waveOk(l.a,l.b,tier)){toast(tr('links.a_wave_wave_needs_need_at',{wave:LT[tier].n,need:esc(waveNeed(tier))}),'bad');sfx('err');return;}const nm=Math.round(waveMo(l.km,l.sub,tier)*(l.mult||1));if(!spend(nm))return;l.mo=nm;l.tier=tier;after();},
 decomOpen:({city})=>{UI.decom=new Set(city&&S.pops[city]?[city]:[]);decomModal();},
 decomToggle:({city})=>{if(!S.pops[city])return;UI.decom=UI.decom||new Set();if(UI.decom.has(city))UI.decom.delete(city);else UI.decom.add(city);decomModal();},
 decomGo:()=>{const sel=[...(UI.decom||[])].filter(c=>S.pops[c]);if(!sel.length||sel.length>=Object.keys(S.pops).length)return;closeModal();UI.decom=null;UI.sel=null;decommission(sel);sfx('alert');after();},
 redundOpen:({a,b})=>{UI.redund={a,b,sel:new Set(),confirm:false};redundModal();},
 redundToggle:({id})=>{if(!UI.redund)return;const s=UI.redund.sel;if(s.has(id))s.delete(id);else s.add(id);UI.redund.confirm=false;redundModal();},
 redundSelectAll:()=>{if(!UI.redund)return;const {a,b,sel}=UI.redund,pl=pairLinks(a,b);
   UI.redund.confirm=false;
   const isL=l=>S.biz.some(x=>x.link===l.id)||S.offers.some(x=>x.link===l.id);
   const eligible=pl.filter(l=>!isL(l));
   if(eligible.length&&eligible.every(l=>sel.has(l.id))){for(const l of eligible)sel.delete(l.id);}
   else{for(const l of eligible)sel.add(l.id);}
   redundModal();},
 redundSelectIdle:()=>{if(!UI.redund)return;const {a,b,sel}=UI.redund,pl=pairLinks(a,b);
   UI.redund.confirm=false;
   const isL=l=>S.biz.some(x=>x.link===l.id)||S.offers.some(x=>x.link===l.id);
   const idle=pl.filter(l=>!isL(l)&&((R.load[l.id]||0)<1e-3||l.standby));
   const sorted=idle.slice().sort((x,y)=>capOf(y)-capOf(x)||x.mo-y.mo);
   const target=idle.length===pl.length?sorted.slice(1):idle;
   if(target.length&&target.every(l=>sel.has(l.id))){for(const l of target)sel.delete(l.id);}
   else{for(const l of target)sel.add(l.id);}
   redundModal();},
 redundGo:()=>{const RUI=UI.redund;if(!RUI)return;const {a,b,sel}=RUI,pl=pairLinks(a,b);
   const isL=l=>S.biz.some(x=>x.link===l.id)||S.offers.some(x=>x.link===l.id);
   const toRemove=pl.filter(l=>sel.has(l.id)&&!isL(l));
   if(!toRemove.length)return;
   const remLinks=pl.filter(l=>!sel.has(l.id));
   const wouldCutAll=remLinks.length===0;
   if(wouldCutAll&&!RUI.confirm){RUI.confirm=true;redundModal();return;}
   let backTotal=0,moTotal=0;
   for(const l of toRemove){const bk=cabBack(l);if(bk>0)backTotal+=bk;moTotal+=(l.mo||0);}
   if(backTotal>0)S.cash+=backTotal;
   const rIds=new Set(toRemove.map(l=>l.id));
   S.links=S.links.filter(l=>!rIds.has(l.id));
   prunePairMet();
   closeModal();UI.redund=null;UI.sel=null;
   toast(tr('link_panels.n_links_decommissioned_saved_mo',{n:toRemove.length,a:CITY[a].name,b:CITY[b].name,mo:fmt$(moTotal)}),'good');
   sfx('coin');after();},
 rmLink:({id})=>{if(UI.confirm!==id){UI.confirm=id;renderPanel();return;}{const l=S.links.find(x=>x.id===id),back=cabBack(l);if(back>0){S.cash+=back;toast(tr('links.name_is_called_off_the_cable',{name:esc(l.cname||tr('common.your_cable')),price:fmt$(back)}),'good');}}S.links=S.links.filter(l=>l.id!==id);prunePairMet();UI.sel=null;UI.confirm=null;after();},
 fixInc:({id})=>{const i=S.inc.find(x=>x.id===id);if(!i||!(i.cost>0))return;if(i.slow&&i.rushed)return;if(!spend(i.cost))return;
   if(i.slow&&i.until>S.day+1){i.rushed=true;i.cost=0;i.until=S.day+1;const p=S.pops[i.ref];if(p)p.down=Math.min(p.down,S.day+1);toast(tr('links.power_cycled_the_router_in_city',{city:esc(CITY[i.ref].name),chip:esc(RG[(p&&p.rgen)||0].chip)}),'good');after();return;}clearInc(i);toast(tr('links.fixed_what_resolved_early',{what:incTitle(i.type)}),'good');after();},
 myIxUp:({city})=>{const m=S.myIx[city];if(!m)return;const f=(m.fab|0)+1,N=MYIX_FAB[f];if(!N)return;if(N.lvl>lvl()){toast(tr('links.a_fab_fabric_unlocks_at_customer',{fab:N.n,lv:N.lvl}),'bad');sfx('err');return;}if(!spend(N.cost))return;m.fab=f;toast(tr('links.ix_now_runs_a_fab_fabric',{ix:esc(m.name),fab:N.n,max:N.max}),'good');m.next=Math.min(m.next,S.day+3);after();},
 foundIx:({city})=>{if(!S.pops[city]||S.myIx[city]||CITY[city].ix||CITY[city].cn)return;if(!spend(MYIX_COST))return;const nm=(S.name.split(' ')[0]||'My').replace(/[^A-Za-z0-9]/g,'').slice(0,10)+'-IX '+CITY[city].name;
   S.myIx[city]={name:nm,members:[],next:S.day+4};S.ixp[city]=2;toast(tr('links.you_founded_ix_networks_will_join',{ix:esc(nm)}),'goal');after();},
 buildLink:({tier})=>{tier=+tier;const p=UI.pending;if(!p)return;const {a,b}=p;const km=kmBetween(a,b),sub=isSub(a,b),sib=pairLinks(a,b).filter(l=>l.kind!=='vxc'),jn=sib.length?routeJoin(a,b):null,same=!!jn,border=cnCity(a)!==cnCity(b),mult=(sib.length&&!(jn&&jn.k===(landTrenches(a,b)[0]||{}).k)?DIVERSE:1)*(border?3*(UI.cnPrem&&(a==='hkg'||b==='hkg')?1.6:1):1);
   if((cnCity(a)||cnCity(b))&&!cnOk())return;
   if(!waveOk(a,b,tier)){toast(tr('links.a_wave_wave_needs_need_at',{wave:LT[tier].n,need:esc(waveNeed(tier))}),'bad');sfx('err');return;}
   const wr=waveRoute(a,b,mult,border);if(!wr){toast(tr('links.no_cable_available_for_that_route'),'bad');sfx('err');return;}
   {const so=soldOut(a,b,tier,wr.cab);if(so){toast(tr('links.no_wave_capacity_on_this_route',{wave:LT[tier].n,why:tr(so.why),n:Math.max(1,so.until-S.day)}),'bad');sfx('err');return;}}{const w=subWaveWhy(tier,wr.km,wr.sub);if(w){toast(tr('links.no_wave_waves_on_this_cable',{wave:LT[tier].n,why:esc(w)}),'bad');sfx('err');return;}}const base=Math.round(waveMo(wr.km,wr.sub,tier)*wr.wm),cost=base+(S.pops[b]?0:popCost(b));
   if(!portGate(a,1)||!portGate(b,1))return;if(!spend(cost))return;if(!S.pops[b])S.pops[b]={day:S.day,bb:null,boost:0,down:0,routers:1,gen:false};
   const id=uid();const l={id,a,b,kind:'wave',border,premium:border&&!!UI.cnPrem&&(a==='hkg'||b==='hkg'),tier,km:wr.km,sub:wr.sub,cable:wr.cab,mo:base,mult:wr.wm,trench:wr.cab?'cab:'+wr.cab:(jn?jn.k:id),cut:0,day:S.day};S.links.push(l);closeModal();
   if(sib.length){UI.sel={type:'link',id};}else{UI.sel={type:'city',id:b};UI.tab='cust';}
   floater((CITY[a].x+CITY[a].x+wrapDx(CITY[a].x,CITY[b].x))/2,(CITY[a].y+CITY[b].y)/2-20,tr('links.wave_lit',{wave:LT[tier].n}),'#FF4F9A');after();},
 buyNni:({city,prov,tier})=>{tier=+tier;if(!NNI[tier]||!isCity(city)||!own(FAB,prov)||!FAB[prov].cities.includes(city)||!S.pops[city])return;const ex=nniPort(city,prov);if(ex&&tier<=ex.tier)return;if(!ex&&!portGate(city,1))return;if(ex&&nniUsed(city,prov)>NNI[tier].g){toast(tr('links.too_many_circuits_for_a_smaller'),'bad');return;}if(!spend(NNI[tier].mo))return;if(ex)ex.tier=tier;else S.nni.push({id:uid(),city,prov,tier});toast(tr('links.fab_port_is_up_in_city',{fab:esc(FAB[prov].name),city:CITY[city].name}),'good');after();},
 rmNni:({city,prov})=>{if(nniUsed(city,prov)>0){toast(tr('links.cancel_the_circuits_on_this_port'),'bad');sfx('err');return;}S.nni=S.nni.filter(x=>!(x.city===city&&x.prov===prov));after();},
 openVxc:(a)=>openVxcModal(a),
 buyVxc:({a,b,prov,t})=>{t=+t;const g=VXC[t].g,pa=nniPort(a,prov);if(!pa||nniUsed(a,prov)+g>NNI[pa.tier].g){toast(tr('links.not_enough_room_on_your_fabric'),'bad');sfx('err');return;}
   if(S.pops[b]){const pb=nniPort(b,prov);if(!pb||nniUsed(b,prov)+g>NNI[pb.tier].g){toast(tr('links.not_enough_room_on_your_fab',{fab:esc(FAB[prov].name),city:CITY[b].name}),'bad');sfx('err');return;}}
   const km=kmBetween(a,b),sub=isSub(a,b),mo=vxcMo(km,sub,t);if(!spend(mo))return;S.links.push({id:uid(),a,b,kind:'vxc',prov,vt:t,km,sub,mo,cut:0,day:S.day});closeModal();
   toast(tr('links.circuit_up_in_59_seconds_vxc',{vxc:VXC[t].n,fab:esc(FAB[prov].name),a:CITY[a].name,b:CITY[b].name})+(S.pops[b]?'':' '+tr('links.now_grab_an_ix_port_there')),'good');if(!S.pops[b])selectCity(b);after();},
 upVxc:({id,t})=>{t=+t;const l=S.links.find(x=>x.id===id);if(!l||l.kind!=='vxc'||!VXC[t]||t<=l.vt)return;const extra=VXC[t].g-VXC[l.vt].g;for(const c of [l.a,l.b]){const pt=nniPort(c,l.prov);if(pt&&nniUsed(c,l.prov)+extra>NNI[pt.tier].g){toast(tr('links.fabric_port_in_city_is_full',{city:CITY[c].name}),'bad');sfx('err');return;}}const mo=vxcMo(l.km,l.sub,t);if(!spend(mo))return;l.vt=t;l.mo=mo;after();},
 cancelVxc:({id})=>{if(UI.confirm!==id){UI.confirm=id;renderPanel();return;}S.links=S.links.filter(l=>l.id!==id);prunePairMet();const rem=remoteCities();for(const c in S.ixp){if(!S.pops[ixCity(c)]&&!rem.includes(ixCity(c))){delete S.ixp[c];delete S.rs[c];for(const k in S.peers)if(k.endsWith('@'+c))delete S.peers[k];}}UI.sel=null;UI.confirm=null;after();},
 setPref:({kind,id,v})=>{if(!own(PREF,v))return;if(kind!=='t'&&kind!=='p'&&!(isIx(id)&&S.ixp[id]!==undefined))return;if(kind==='t'){const t=S.transit.find(x=>x.id===id);if(t)t.pref=v;}else if(kind==='p'){const x=S.pni.find(y=>y.id===id);if(x)x.pref=v;}else{S.ixPref=S.ixPref||{};S.ixPref[id]=v;}sfx('click');after();},
 setMetric:({id,v})=>{if(!own(MET,v))return;const l=S.links.find(x=>x.id===id);if(!l)return;const m=S.pairMet||(S.pairMet={}),k=edgeKey(l);if(v==='normal')delete m[k];else m[k]=v;sfx('click');after();},
 setStandby:({id,on})=>{const l=S.links.find(x=>x.id===id);if(!l)return;if(on)l.standby=true;else delete l.standby;sfx('click');after();},
 goEgress:({city,k})=>{ACT.focusCity({city});UI.tab=k==='t'?'up':k==='l2'?'cust':k==='nni'?'links':'peer';renderPanel();},
});
