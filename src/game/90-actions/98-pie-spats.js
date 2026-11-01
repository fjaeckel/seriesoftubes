// Pie in the Sky: answering a geopolitical spat (85-incidents/65-pie-spats.js). Answers work while Tier 1 is lost too:
// diplomacy is not building.
Object.assign(ACT,{
 pieSpatOpen:({id})=>{if(!S||!S.pie||typeof id!=='string'||!own(PIE_SPAT_DEF,id)||!S.pie.spat[id])return;pieSpatSheet(id);},
 pieSpatPick:({id,c})=>{const P=S&&S.pie;c=+c;if(!P||typeof id!=='string'||!own(PIE_SPAT_DEF,id)||!(c===0||c===1))return;
   if(!pieSpatChoose(id,c,false)){if(P.spat[id])pieSpatSheet(id);return;}closeModal();after();},
});
