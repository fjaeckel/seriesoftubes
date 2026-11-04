/* Pitcairn (#124): no cable lands there yet, but you may land your own, and the UK pays a monthly grant while the
   islanders are online through you: a POP with broadband, up and nearly fully served. */
const GRANT_MO=300000;
const grantOn=r=>!!(S&&S.pops.pcn&&S.pops.pcn.bb&&!(S.pops.pcn.down>S.day)&&sfOf(r,'pcn')>=0.9);
/* Satellite tier: Pitcairn online through your pies (its POP on backhaul, or home terminals there) is good enough for the
   UK at a lower bar, orbit's latency forgiven (sfOf() counts it, so the fiber grant never comes), for less money. */
const GRANT_SKY_MO=120000,GRANT_SKY_Q=0.9;
function grantSky(r){if(!S||!S.pie||!r||!r.pie||grantOn(r))return false;const p=S.pops.pcn;
  if(p&&p.bb&&!(p.down>S.day)&&r.pie.bh.some(b=>b.city==='pcn'&&b.g>0)){const d=r.cityDem.pcn||0;if(d>1e-6&&(r.citySrv.pcn||0)/d>=GRANT_SKY_Q)return true;}
  return S.biz.some(b=>b.city==='pcn'&&b.type==='pizza'&&(r.pie.sf[b.id]||0)>=GRANT_SKY_Q);}
function grantFact(c){if(c!=='pcn')return '';const on=grantOn(R),sky=!on&&grantSky(R);
  return `<span class="fact${on||sky?' mine':''}">${on?tr('pitcairn.uk_grant_mo',{mo:fmt$(GRANT_MO)}):sky?tr('pitcairn.uk_sky_grant_mo',{mo:fmt$(GRANT_SKY_MO),full:fmt$(GRANT_MO)}):tr('pitcairn.uk_grant_mo_once_islanders',{mo:fmt$(GRANT_MO)})}</span>`;}
