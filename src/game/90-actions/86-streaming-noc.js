/* ---------- The Streaming tab of the NOC dashboard (94-dashboard/61-streaming-noc.js): view only ---------- */
Object.assign(ACT,{
 // A row: close the dashboard and open that city at its Streaming tab.
 cntNocGo:({city})=>{if(!content()||!isCity(city))return;$('dash').hidden=true;ACT.focusCity({city});UI.tab='cust';renderPanel();},
 // The country list's order: a second tap on the same key turns it round.
 cntNocSort:({k})=>{if(!own(CNOC_SORT,k))return;listReset('cntcc');const o=cnocSortOf();UI.cnocSort={k,d:o.k===k?-o.d:CNOC_SORT[k]};renderDash();},
 cntNocMore:({k})=>{if(k!=='cntcc'&&k!=='cntbox')return;UI.listN=UI.listN||{};UI.listN[k]=listN(k)+listPg(k);renderDash();},
});
