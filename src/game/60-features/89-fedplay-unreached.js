/* ================= MULTIPLAYER GAMEPLAY: players you cannot reach =================
   Your customers ask for traffic to every player's network, so one you reach neither directly nor through a cone or
   transit costs your cities that share of their service. The cost stays (it is what makes peering with players worth it);
   this makes it visible: customers name it (bizWhy), the HUD and the AS panel show reach with players included, and the
   NOC warns once it costs more than FEDL_WARN, before customers (unhappy under 95%) start to leave. */
const FEDL_SHOW=0.005,FEDL_WARN=0.03,FEDL_REARM=0.015;
// The share of all traffic that goes to players you cannot reach.
const fedLost=()=>{if(!R||!R.reachable)return 0;let r=0;for(const id of FEDN.ids)if(!R.reachable[id])r+=NSH[id]||0;return r;};
const fedLostOn=()=>!scnRule('local')&&fedLost()>=FEDL_SHOW;
// A short customer (service share sf) blames the players only when they explain a real part of what it misses:
// one at 70% because of congestion is not sent to peer over 1% of traffic. IP customers only, like the cost itself.
const fedBlame=(b,sf)=>sf<0.95&&!(BIZ_T[b.type].l2||BIZ_T[b.type].fiber)&&fedLostOn()&&fedLost()>=(1-sf)/3;
// Once a day: a NOC note when the share crosses FEDL_WARN, again only after it fell back under FEDL_REARM.
function fedLostDay(){if(!FEDN.ids.length||scnRule('local')){S.fedLw=false;return;}const l=fedLost();
  if(l<FEDL_REARM){S.fedLw=false;return;}if(l<FEDL_WARN||S.fedLw)return;S.fedLw=true;
  toast(tr('fedplay.lost_warn',{p:pct(l)}),'bad',S.fed?[{l:tr('fedplay.peer_with_players'),act:'fpLost',args:{}}]:[]);}
