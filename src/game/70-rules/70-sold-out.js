/* Sold out: now and then a carrier has no spare capacity of a size on a route. Each route, size and 90-day window
   gets a stable verdict from a hash, so asking again does not reroll it, and bigger waves sell out more often. */
const SOLD_WIN=90,SOLD_WHY=[N_('sold_out.a_hyperscaler_bought_every_wave_of'),N_('sold_out.the_carrier_is_out_of_spectrum'),N_('sold_out.the_transponders_for_this_route_are'),N_('sold_out.the_capacity_is_available_in_the'),N_('sold_out.their_capacity_planner_is_on_holiday'),N_('sold_out.the_upgrade_is_planned_for_q3')];
const soldP=tier=>Math.min(0.1,0.02+0.012*tier);
// Never in the first 90 days: a new network has enough on its plate. Never in the tutorial or a scenario's first quarter either.
function soldOut(a,b,tier,via){if(!S||S.day<SOLD_WIN||S.tut||!rule('market'))return null;const k=(a<b?a+b:b+a)+'|'+(via||'')+'|'+tier,off=hstr(k)%SOLD_WIN,ep=Math.floor((S.day+off)/SOLD_WIN),h=hstr(S.asn+'|'+k+'|'+ep);
  if(h%1000>=soldP(tier)*1000)return null;return {why:SOLD_WHY[(h>>>10)%SOLD_WHY.length],until:(ep+1)*SOLD_WIN-off};}
function snubWhy(sn){const d=Math.max(1,sn.until-S.day);return sn.why+' '+trn('sold_out.they_will_reconsider_in_n_day',d);}
// Paid-peering giants drop the fee for networks too big to ignore (freeLv: the customer level that does it).
const paidFree=n=>!!(n&&n.freeLv&&lvl()>=n.freeLv);
function peerOk(id,via,city){
  const n=NET[id],dem=R.demTo[id]||0;
  if(merged(id)){const m=MERGERS.find(x=>x.id===id);return {ok:false,why:tr('mergers.now_part_of_net',{net:esc(NET[m.into].name)})};}
  const sn=snub(id,city);if(sn&&(via==='ix'||sn.all))return {ok:false,snub:true,why:snubWhy(sn)};
  if(msfNope(id,city))return {ok:false,why:tr(MSF_NOPE[hstr(ixCity(city)+S.day)%MSF_NOPE.length])};
  if(via==='ix'&&city&&isRemote(city)&&noRemote(id))return {ok:false,remote:true,why:REMOTE_WHY[hstr(id)%REMOTE_WHY.length]};
  if(n.pol==='open')return {ok:true};
  // In the Cogentle Spat, Goggle's peering desk wants eight times the usual traffic first, so cheap Cogentle-only transit really costs you Goggle (playtest).
  if(n.pol==='selective'){const need=Math.round((via==='pni'?n.minPni:n.minIx)*confBoost(id)*(id==='ggl'&&scnRule('spat')?8:1));return dem>=need?{ok:true}:{ok:false,why:tr('sold_out.wants_need_gbps_of_traffic_from',{need,dem:dem.toFixed(1)})};}
  if(n.pol==='paid'&&paidFree(n))return via==='pni'?{ok:true,free:true}:{ok:false,why:tr('sold_out.peers_with_you_for_free_now')};
  if(n.pol==='paid')return via==='pni'?{ok:true,fee:n.paidFee}:{ok:false,why:n.perG?tr('sold_out.sender_pays_a_paid_pni_only',{fee:fmt$(n.paidFee),g:fmt$(n.perG)}):tr('sold_out.paid_peering_only_over_a_pni')};
  if(n.type!=='t1'){if(via!=='pni')return {ok:false,why:tr('sold_out.only_peers_over_pnis_and_only')};const need=Math.round(60*confBoost(id));return dem>=need||isTier2()?{ok:true}:{ok:false,why:tr('sold_out.wants_you_to_be_a_tier',{need,dem:dem.toFixed(1)})};}
  if(via!=='pni')return {ok:false,why:tr('sold_out.tier_1s_never_peer_at_ixs')};
  const c=t1Club();return c.ok?{ok:true}:{ok:false,why:tr('sold_out.not_big_enough_yet_list',{list:c.missing.join(', ')})};
}
