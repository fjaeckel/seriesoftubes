// The Dishes tab's planner (93-ui/87-pie-plan.js): open it, or carry out one suggestion; taking a dish down or moving it asks first.
Object.assign(ACT,{
 piePlanOpen:()=>{UI.piePlan=!UI.piePlan;UI.piePlanAsk=null;sfx('click');pieModal();},
 piePlanKeep:()=>{UI.piePlanAsk=null;sfx('click');pieModal();},
 piePlanAll:()=>{UI.piePlanAll=!UI.piePlanAll;sfx('click');pieModal();},
 piePlanDo:({k,c,from,to,ant,ok})=>{const P=pieGet(),Q=R&&R.pie,a={k,c,from,to,ant};if(!P||!P.co||!Q||!Q.dish||!own(PIE_PLAN_ARGS,k))return;
   // Exactly the arguments its kind takes: a drop with a to is not a move.
   const ks=PIE_PLAN_ARGS[a.k];if(['c','from','to','ant'].some(f=>(a[f]!==undefined)!==ks.includes(f)))return;
   const it=piePlan(Q).items.find(x=>piePlanKey(x)===piePlanKey(a));if(!it)return pieNo(tr('pie_plan.t_stale'));
   const why=piePlanCan(it);if(why)return pieNo(why);
   if((k==='move'||k==='drop')&&ok!==true){UI.piePlanAsk=piePlanKey(it);sfx('click');return pieModal();}
   UI.piePlanAsk=null;const r=piePlanApply(it);if(r===true)toast(tr('pie_plan.t_done'),'good');else if(r)return pieNo(r);pieRe();},
});
