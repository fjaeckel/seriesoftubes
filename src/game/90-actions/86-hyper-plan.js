/* ---------- The Hyperscaler's plan (93-ui/58-hyper-plan.js): view only ---------- */
Object.assign(ACT,{
 // A plan row's button: close the dashboard and open the city at the tab where the fix is (Cloud, Transit, Infra).
 hsPlanGo:({city,k})=>{if(!hyper()||!S.hs||!isCity(city)||!cityOn(city)||!['cust','up','peer','links'].includes(k))return;$('dash').hidden=true;ACT.focusCity({city});if(S.pops[city])UI.tab=k;renderPanel();},
});
