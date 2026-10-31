Object.assign(ACT,{
 dfMode:({m})=>{UI.lmode=m;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
 seaPackage:({k})=>{const p=UI.pending;if(!own(SUB_UPGRADES,k)||!p)return;const km=seaQuote(p.a,p.b,own(SEA_DESIGNS,UI.seaDesign)?UI.seaDesign:'standard').km,up=seaUps(km);
   if(!up[k]&&!subHelps(km,k,up[subOther(k)]))return;UI.seaterminal=up.terminal;UI.seaengineering=up.engineering;UI['sea'+k]=!up[k];openLinkModal(p.a,p.b);},
 subUpgrade:({id,k})=>{const l=S.links.find(l=>l.id===id);if(!l||l.kind!=='df'||!l.own||!l.sub||l.seat||!own(SUB_UPGRADES,k)||lvl()<4||l['sub'+k]!==undefined||!subHelps(l.km,k,l['sub'+subOther(k)]!==undefined))return;if(!spend(subUpgradeCost(l,k)))return;l.paid=(l.paid>0?l.paid:ownCabCost(l.km))+subUpgradeCost(l,k);l['sub'+k]=Math.max(S.day,l.ready||0)+leadDays(SUB_UPGRADES[k].days);after();},
 seaDesign:({v})=>{if(!own(SEA_DESIGNS,v))return;UI.seaDesign=v;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
 ownCab:()=>{UI.lmode='df';UI.dfSrc='cable';UI.seaDesign='standard';UI.seaterminal=UI.seaengineering=false;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
 dfSrc:({v})=>{UI.dfSrc=v;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
 dfSys:({v})=>{UI.dfSys=v;if(UI.pending)openLinkModal(UI.pending.a,UI.pending.b);},
 orderCable:()=>{const p=UI.pending;if(!p)return;const {a,b}=p;if(ownCabWhy(a,b))return;const design=own(SEA_DESIGNS,UI.seaDesign)?UI.seaDesign:'standard',up=seaUps(seaQuote(a,b,design).km),q=seaQuote(a,b,design,up),km=q.km,cost=q.cost+(S.pops[b]?0:popCost(b));if(seaLack(km,up).length||!spend(cost))return;
   if(!S.pops[b])S.pops[b]={day:S.day,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};
   const used=new Set(S.links.map(l=>l.cname).filter(Boolean)),cname=OWNCAB_NAMES.find(n=>!used.has(n))||`${pick(OWNCAB_NAMES)} ${used.size+1}`,ship=pick(OWNCAB_SHIPS),id=uid(),days=q.days;
   S.links.push({id,a,b,kind:'df',own:true,sub:true,seaDesign:design,seaPath:q.pts.map(p=>p.slice()),sys:'roadm',ch:[],km,cable:null,cname,mo:Math.round(km*OWNCAB_OM),trench:'own:'+id,cut:0,day:S.day,ready:S.day+days,spares:false,pairs:1});
   const laid=S.links[S.links.length-1];laid.paid=q.cost;for(const k of Object.keys(SUB_UPGRADES))if(up[k])laid['sub'+k]=laid.ready;UI.seaDesign='standard';UI.seaterminal=UI.seaengineering=false;
   S.stats.ownCab=(S.stats.ownCab||0)+1;UI.dfSrc='lease';closeModal();UI.sel={type:'link',id};
   toast(tr('fiber_and_hardware.the_ship_sets_sail_name_your',{ship,name:cname,km:km.toLocaleString(),a:CITY[a].name,b:CITY[b].name,n:days}),'goal');sfx('build');after();},
 orderDf:()=>{const p=UI.pending;if(!p)return;const {a,b}=p;if(!dfAllowed(a,b))return;const sc=isSub(a,b)?subDfCable(a,b):null,km=sc?sc.km:kmBetween(a,b);
   const own=UI.dfSrc==='build'&&!sc,sys=DF_SYS[UI.dfSys]&&techOk('sys',UI.dfSys,DF_SYS[UI.dfSys].lvl)?UI.dfSys:'lite';if(lvl()<2)return;
   const up=(own?digCost(km):0)+sysCost(sys)+ampCount(km)*AMP_COST+(S.pops[b]?0:popCost(b));if(!spend(up))return;
   if(!S.pops[b])S.pops[b]={day:S.day,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};
   const sib=pairLinks(a,b).filter(l=>l.kind!=='vxc'),id=uid();
   const l={id,a,b,kind:'df',own,sys,ch:[],km,sub:!!sc,cable:sc?sc.cid:null,mo:own?Math.round(km*0.15):dfLeaseMo(km),trench:sc?'cab:'+sc.cid:id,cut:0,day:S.day,ready:S.day+(own?dfBuildDays(km):leadDays(IRU_DAYS)),spares:false};
   S.links.push(l);closeModal();UI.sel={type:'link',id};
   toast(own?tr('fiber_and_hardware.groundbreaking_your_own_fiber_from_a',{a:CITY[a].name,b:CITY[b].name,n:dfBuildDays(km)}):tr('fiber_and_hardware.dark_fiber_iru_signed_a_b',{a:CITY[a].name,b:CITY[b].name}),'goal');after();},
 regen:({id,d})=>{d=+d;const l=S.links.find(x=>x.id===id);if(!l||l.kind!=='df'||(l.sub&&!l.seat)||(d!==1&&d!==-1))return;const n=(l.regen|0)+d;if(n<0||n>REGEN_MAX)return;
   if(d<0&&(l.ch||[]).some(o=>!optMode(o,Object.assign({},l,{regen:n})))){toast(tr('fiber_and_hardware.those_optics_need_the_regen_site'),'bad');sfx('err');return;}
   if(d>0&&!spend(REGEN_COST+Math.round((l.ch||[]).reduce((a,c)=>a+optCost(c),0)*REGEN_CH)))return;l.regen=n;toast(d>0?tr('fiber_and_hardware.regen_site_n_is_up_optical',{n,a:CITY[l.a].name,b:CITY[l.b].name,km:spanKm(l).toLocaleString()}):tr('fiber_and_hardware.regen_site_removed'),'good');sfx('build');after();},
 addCh:({id,o})=>{const l=S.links.find(x=>x.id===id),O=OPT[o];if(!l||!O||l.kind!=='df')return;const why=chWhy(l,o);if(why){toast(tr('fiber_and_hardware.can_t_add_optic_why',{optic:O.n,why:esc(why)}),'bad');sfx('err');return;}if(!portGate(l.a,1)||!portGate(l.b,1))return;const sp=spareN(o)>0;if(!spend(chCost(l,o)))return;if(sp)S.spares[o]--;(l.ch=l.ch||[]).push(o);floater((CITY[l.a].x+CITY[l.b].x)/2,(CITY[l.a].y+CITY[l.b].y)/2-20,`+${O.n}`,'#FF4F9A');after();},
 rmCh:({id,o})=>{const l=S.links.find(x=>x.id===id);if(!l||!OPT[o])return;const i=(l.ch||[]).lastIndexOf(o);if(i<0)return;l.ch.splice(i,1);S.spares=S.spares||{};S.spares[o]=(S.spares[o]||0)+1;floater((CITY[l.a].x+CITY[l.b].x)/2,(CITY[l.a].y+CITY[l.b].y)/2-20,tr('fiber_and_hardware.optic_to_spares',{optic:OPT[o].n}),'#7B61FF');after();},
 hwLock:()=>{if(hwLock())return;const c=hwLockCost();if(!spend(c))return;S.hw=S.hw||{};S.hw.lock={until:S.day+HW_LOCK_DAYS,mul:hwTrend(S.day)};toast(tr('fiber_and_hardware.prices_locked_until_date_your_vendor',{date:dateStr(S.hw.lock.until)}),'good');after();},
 buySpare:({o})=>{if(!OPT[o]||!techOk('opt',o,OPT[o].lvl)||spareN(o)>=64)return;if(!spend(optCost(o)))return;S.spares=S.spares||{};S.spares[o]=(S.spares[o]||0)+1;sfx('build');after();},
 sellSpare:({o})=>{if(!OPT[o]||spareN(o)<1)return;S.spares[o]--;const v=spareValue(o);S.cash+=v;toast(tr('fiber_and_hardware.sold_a_spare_optic_on_ebuy',{optic:OPT[o].n,price:fmt$(v),p:pct(SPARE_RESALE)}),'good');sfx('coin');after();},
 addPair:({id})=>{const l=S.links.find(x=>x.id===id);if(!l||l.kind!=='df'||!l.own||!isRdm(l.sys)||l.ready>S.day)return;const n=Math.max(1,l.pairs|0);if(n>=pairsMax(l))return;if((l.ch||[]).length+soldSlots(l)<chMax(l)){toast(tr('fiber_and_hardware.fill_this_pair_first_light_all',{max:chMax(l)}),'bad');sfx('err');return;}if(!spend(pairCost(l)))return;l.pairs=n+1;toast(tr('fiber_and_hardware.fiber_pair_n_is_lit_a',{n:n+1,a:CITY[l.a].name,b:CITY[l.b].name,m:DF_SYS[l.sys].max}),'good');sfx('build');after();},
 upSys:({id})=>{const l=S.links.find(x=>x.id===id),to=l&&sysNext(l);if(!to||!techOk('sys',to,DF_SYS[to].lvl))return;if(!spend(sysUpCost(l)))return;l.sys=to;if(l.ready<=S.day){l.eqDown=S.day+1;toast(tr('fiber_and_hardware.line_system_swap_all_channels_are'),'bad');}after();},
 spares:({id})=>{const l=S.links.find(x=>x.id===id);if(!l)return;l.spares=!l.spares;sfx('click');after();},
 crews:({id,all})=>{const l=S.links.find(x=>x.id===id);if(!l||l.kind!=='df'||!l.own||l.ready<=S.day+1)return;const n=all?crewSteps(l):1,c=n*crewCost(l);if(!spend(c))return;const ready=Math.max(S.day+1,l.ready-30*n),saved=l.ready-ready;setCableReady(l,ready);toast(trn('fiber_and_hardware.more_crews_on_site_construction_is',saved,{n:saved}),'good');after();},
 addGen:({city})=>{const p=S.pops[city];if(!p||p.gen)return;if(!spend(GEN_COST))return;p.gen=true;floater(CITY[city].x,CITY[city].y-30,tr('common.generator'),'#FF8A3D');after();},
});
