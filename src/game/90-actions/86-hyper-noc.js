/* ---------- The Cloud tab of the NOC dashboard (94-dashboard/62-hyper-noc.js): view only ---------- */
Object.assign(ACT,{
 // A row: close the dashboard and open that city at its Cloud tab.
 hsNocGo:({city})=>{if(!hyper()||!S.hs||!isCity(city))return;$('dash').hidden=true;ACT.focusCity({city});UI.tab='cust';renderPanel();},
 // The country list's order: a second tap on the same key turns it round.
 hsNocSort:({k})=>{if(!own(HNOC_SORT,k))return;listReset('hscc');const o=hnocSortOf();UI.hnocSort={k,d:o.k===k?-o.d:HNOC_SORT[k]};renderDash();},
 hsNocMore:({k})=>{if(!['hscc','hsrg','hshl','hspr'].includes(k))return;UI.listN=UI.listN||{};UI.listN[k]=listN(k)+listPg(k);renderDash();},
});
