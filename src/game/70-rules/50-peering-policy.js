/* Big networks sometimes refuse to peer in a particular city, for a while. Each (network, city)
   pair gets a stable verdict per window, derived from a hash, so asking again does not reroll it.
   It is part of the market: without one (Change Freeze, puzzles), nobody refuses or drops a session. */
const SNUB_WIN=150,SNUB_P=0.22;
const SNUB_IX=[tr('peering_policy.only_peers_over_pnis_in_this'),tr('peering_policy.their_ix_port_here_is_full'),tr('peering_policy.moved_everything_in_this_city_to'),tr('peering_policy.the_peering_coordinator_for_this'),tr('peering_policy.their_policy_here_says_ix_peering')];
const SNUB_ALL=[tr('peering_policy.not_accepting_new_peers_in_this'),tr('peering_policy.region_frozen_while_they_renegotiate'),tr('peering_policy.their_routers_in_this_city_are'),tr('peering_policy.already_reach_you_through_your'),tr('peering_policy.their_lawyers_are_reviewing_every'),tr('peering_policy.a_new_vp_wants_to_monetise')];
function hstr(t){let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function bigPeer(n){return !!n&&n.pol==='selective'&&n.share>=0.03;}
function snub(id,c){
  const n=NET[id];if(!c||!bigPeer(n)||!S||S.myIx[c]||!rule('market'))return null;
  const off=hstr(id+c)%SNUB_WIN,ep=Math.floor((S.day+off)/SNUB_WIN),h=hstr(S.asn+'|'+id+'|'+c+'|'+ep);
  if(h%1000>=SNUB_P*1000)return null;
  const all=(h>>>10)%5<2,list=all?SNUB_ALL:SNUB_IX;
  return {all,why:list[(h>>>13)%list.length],until:(ep+1)*SNUB_WIN-off};
}
/* Remote peering: offered, but discouraged. A reseller marks up the port, oversubscribes it,
   and many selective networks refuse members who are not physically in the building. */
const REMOTE_FEE=1.5,REMOTE_CAP=0.8;
const REMOTE_WARN=`<p class="note" style="color:var(--bad)">${tr('peering_policy.remote_peering_is_a_last_resort')}</p>`;
const REMOTE_WHY=[tr('peering_policy.policy_no_remote_peers_be_in'),tr('peering_policy.saw_your_session_come_in_over'),tr('peering_policy.only_peers_with_members_they_can'),tr('peering_policy.their_pearingdb_entry_says_remote'),tr('peering_policy.tried_a_remote_peer_once_it')];
function isRemote(c){return S.ixp[c]!==undefined&&!S.pops[ixCity(c)]&&!S.myIx[c];}
function noRemote(id){const n=NET[id];if(!n||n.pol!=='selective')return false;return hstr(id+'|remote')%100<(n.share>=0.03?60:30);}
/* Europe's peering market is crowded and competitive: ports are cheaper, and incumbents cut prices
   when a challenger in the same metro gets too popular. DE-KICKS harmonises instead. */
const IX_REG={EU:0.8};
function ixMul(x){const X=XIXM[x],c=ixCity(x);return (X?X.cheap:(CITY[c].ixCheap||1))*(IX_REG[CITY[c].reg]||1)*(CITY[c].au?AU_IX:1)*((S&&S.ixCut&&S.ixCut[x])||1);}
function ixPortMo(c,tier){const X=XIXM[c];if(X&&tier<=(X.freeTo??-1))return 0;return Math.round(PORT[tier].ix*(S.pops[ixCity(c)]?1:REMOTE_FEE)*dkMult(c)*ixMul(c));}
function ixPriceWar(d){if(!S.ixp||Math.random()>=1/120)return;
  const mine=Object.keys(S.ixp).filter(x=>{const c=ixCity(x);return CITY[c].reg==='EU'&&ixStatic(c).length>1;});if(!mine.length)return;
  const x=pick(mine),c=ixCity(x),rival=pick(ixStatic(c).filter(y=>y!==x));
  if(isDk(x)){toast(tr('peering_policy.rival_is_poaching_de_kicks_members',{rival:esc(ixName(rival)),city:esc(CITY[c].name)}),'bad');return;}
  S.ixCut=S.ixCut||{};const cur=S.ixCut[x]||1;if(cur<=0.62)return;S.ixCut[x]=+Math.max(0.6,cur*0.9).toFixed(3);
  toast(tr('peering_policy.price_war_in_city_ix_cut',{city:esc(CITY[c].name),ix:esc(ixName(x)),rival:esc(ixName(rival))}),'good');}
