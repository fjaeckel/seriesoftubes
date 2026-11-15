// The Dishes tab's planner (93-ui/87-pie-plan.js): open it, carry out one suggestion, or all of them in order.
Object.assign(ACT,{
 piePlanOpen:()=>{UI.piePlan=!UI.piePlan;sfx('click');pieModal();},
 piePlanDo:({k,c,from,to,ant})=>{const P=pieGet();if(!P||!P.co||!['ant','band','add','move','drop'].includes(k))return;const s=v=>typeof v==='string'&&isCity(v)?v:undefined;
   const it={k,c:s(c),from:s(from),to:s(to),ant};if((k==='ant'||k==='band')&&!it.c||(k==='add'||k==='move')&&!it.to||(k==='move'||k==='drop')&&!it.from)return;
   const r=piePlanApply(it);if(r===null)return pieRe();if(!r)return pieNo(pieOff(0)||tr('pie_plan.t_stale'));toast(tr('pie_plan.t_done'),'good');pieRe();},
 piePlanAll:()=>{const P=pieGet(),Q=R&&R.pie;if(!P||!P.co||!Q||!Q.dish)return;let n=0,paid=true;for(const it of piePlan(Q).items){const r=piePlanApply(it);if(r)n++;else if(r===null){paid=false;break;}}
   if(!n)return paid?pieNo(pieOff(0)||tr('pie_plan.t_stale')):pieRe();toast(trn('pie_plan.t_all',n),'good');pieRe();},
});
