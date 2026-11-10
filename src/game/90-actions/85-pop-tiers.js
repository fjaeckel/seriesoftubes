// POP standards (#315): save one, bring a POP up to one, bring every POP of a kind up to it.
Object.assign(ACT,{
 ptSave:({city,k})=>{const p=S.pops[city];if(!ptOn()||!p||!POP_TIERS.includes(k))return;const T=ptO();T.def[k]={g:p.rgen||0,rt:p.routers||1};T.at[city]=k;
   toast(esc(tr('pop_tiers.saved',{kind:ptName(k),desc:`${T.def[k].rt} × ${RG[T.def[k].g].n}`})),'good');sfx('click');after();},
 // cost: the price on the button; a plan that changed under it buys nothing. A POP that already meets it is only marked.
 ptApply:({city,k,cost})=>{if(!ptOn()||!S.pops[city]||!POP_TIERS.includes(k)||!ptO().def[k])return;const q=ptPlan(city,k);
   if((q?q.cost:0)!==+cost){toast(tr('utilities.quote_changed'),'bad');sfx('err');after();return;}
   if(q&&q.why){toast(esc(q.why),'bad');sfx('err');return;}if(q&&S.cash<q.cost){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return;}
   S.popTiers.at[city]=k;const ok=!q||ptRun(city,q);
   toast(esc(ok?tr('pop_tiers.city_is_kind',{city:CITY[city].name,kind:ptName(k)}):tr('pop_tiers.not_all',{city:CITY[city].name})),ok?'good':'bad');sfx(q?'build':'click');after();},
 ptAll:({k,cost,city})=>{if(!ptOn()||!POP_TIERS.includes(k))return;const A=ptAll(k);if(!A.todo.length)return;
   if(A.cost!==+cost){utilitiesModal(city,tr('utilities.quote_changed'));return;}
   if(S.cash<A.cost){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return;}
   let n=0;for(const {c,q} of A.todo)if(ptRun(c,q))n++;
   sfx('build');after();utilitiesModal(city,trn('pop_tiers.bulk_done',n,{kind:ptName(k)}));},
});
