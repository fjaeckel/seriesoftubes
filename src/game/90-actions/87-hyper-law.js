/* ---------- Regulators: actions (38-hyper-regulation.js) ---------- */
Object.assign(ACT,{
 // Answer the egress investigation: v 'cut' (Hotel California checks out: HS_EGR_CUT off what egress tenants pay for a
 // year, and they like you for it) or 'pay' (the fine now, fees stay).
 hsEgress:({v})=>{const L=hyper()&&hsLaw(),E=L&&L.egr;if(!E||E.st!=='open'||(v!=='cut'&&v!=='pay'))return;const min=hsMin('egr',E.m);
   if(v==='pay'){if(!spend(E.fee))return;E.st='paid';toast(`🏨 ${tr('hyper_reg.egr_paid',{min,fee:fmt$(E.fee)})}`,'');after();return;}
   E.st='cut';E.u=S.day+HS_EGR_DAYS;for(const b of hsEgrTen())b.mood=Math.min(100,(b.mood||0)+10);
   toast(`🏨 ${tr('hyper_reg.egr_cut',{min,p:pct(HS_EGR_CUT),date:dateStr(E.u)})}`,'good');sfx('coin');after();},
});
// A moratorium: no new grid connection in that metro. The utility takes no request and no zone is built (M14); a new
// region, an upgrade or a move out of a cage only on megawatts your own running generation adds (#474). Building that
// generation is still allowed, and so is a leased cage: the provider's building is connected already.
{const say=(c,k)=>{const x=hsMorAt(c),v={city:esc(CITY[c].name),min:hsMin('mor',x.m),until:dateStr(x.u)},g=k!=='hsZone'&&k!=='hsUtil'?hsMorFree(c):0;
    toast(`🔌 ${k==='hsZone'?tr('hyper_reg.mor_no_zone',v):g>0?tr('hyper_reg.mor_own_short',{...v,free:Math.floor(g),need:Math.ceil(hsRgNeed(c))}):tr('hyper_reg.mor_refused',v)}`,'bad');sfx('err');};
  for(const k of ['hsRegion','hsUtil','hsZone','hsColoOut']){const f=ACT[k];ACT[k]=a=>{const c=a&&a.city;
    if(hyper()&&S.hs&&isCity(c)&&hsMorAt(c)&&(k==='hsUtil'||k==='hsZone'||hsRgNeed(c)>hsMorFree(c)+1e-9)){say(c,k);return;}return f(a);};}}
