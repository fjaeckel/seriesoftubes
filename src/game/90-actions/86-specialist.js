Object.assign(ACT,{
 demoAsk:({k,id})=>{const it=demoItem(k,id);if(!it||!demoCan(it.lvl)||demoAt(k,id)!==null)return;S.demo=S.demo||{};const at=S.day+leadDays(DEMO_DAYS);S.demo[k+':'+id]=at;
   toast(tr('specialist.the_vendor_ships_a_demo_name',{name:esc(it.n),n:at-S.day,p:Math.round((DEMO_MUL-1)*100)}),'good');after();},
 seatBuy:({n})=>{const o=S.seatOff;n=+n;if(!o||o.exp<=S.day||!SEAT_N.includes(n))return;const miss=[o.a,o.b].filter(c=>!S.pops[c]),cost=seatCost(o.km,n)+miss.reduce((x,c)=>x+popCost(c),0);if(!spend(cost))return;
   for(const c of miss)S.pops[c]={day:S.day,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};
   const id=uid(),days=seatDays(o.km);S.links.push({id,a:o.a,b:o.b,kind:'df',own:true,sub:true,seat:true,seaDesign:'standard',sys:'roadm',ch:[],km:o.km,cable:null,cname:o.name,mo:seatMo(o.km,n),trench:'seat:'+id,cut:0,day:S.day,ready:S.day+days,spares:false,pairs:n,paid:seatCost(o.km,n)});
   S.seatOff=null;S.stats.seats=(S.stats.seats||0)+1;UI.sel={type:'link',id};
   toast(tr('specialist.you_own_n_fiber_pairs_on',{n,name:esc(o.name),a:CITY[o.a].name,b:CITY[o.b].name,d:days}),'goal');sfx('build');after();},
 seatNo:()=>{S.seatOff=null;after();},
 charter:({k})=>{if(!own(CHARTERS,k)||S.chartSet||S.scn||S.mode!=='normal')return;S.charter=k;S.chartSet=true;toast(tr('specialist.charter_signed_name',{name:tr(CHARTERS[k].n)}),'good');after();},
});
