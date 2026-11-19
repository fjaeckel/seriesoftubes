/* ---------- Badges and the share card for a Streaming service (60-features/37-streaming.js) ----------
   Earned only by a Streaming service; the outages (85-incidents/70-streaming-incidents.js) and the regulators
   (60-features/38-streaming-regulation.js) count what they need in S.cnt.ic and S.cnt.rg. */
const cntOn=()=>content()&&!!S.cnt;
BADGES.push(
 {id:'cnt_couch',i:'🛋️',t:tr('streaming_badges.couch_t'),d:tr('streaming_badges.couch_d'),r:'r',ok:()=>cntOn()&&Object.keys(S.cnt.cc).some(k=>S.cnt.cc[k].d>=0.95*ccPot(k))},
 {id:'cnt_dark',i:'🕯️',t:tr('streaming_badges.dark_t'),d:tr('streaming_badges.dark_d'),r:'c',ok:()=>cntOn()&&!!S.cnt.ic&&S.cnt.ic.org>=3},
 {id:'cnt_melt',i:'🔥',t:tr('streaming_badges.melt_t'),d:tr('streaming_badges.melt_d'),r:'r',ok:()=>cntOn()&&!!S.cnt.ic&&S.cnt.ic.melt>=1},
 {id:'cnt_fire',i:'🪵',t:tr('streaming_badges.fire_t'),d:tr('streaming_badges.fire_d'),r:'r',secret:true,ok:()=>cntOn()&&!!S.cnt.ic&&S.cnt.ic.push>=1},
 {id:'cnt_dodge',i:'📦',t:tr('streaming_badges.dodge_t'),d:tr('streaming_badges.dodge_d'),r:'e',ok:()=>cntOn()&&!!S.cnt.rg&&Object.keys(S.cnt.rg.spp).some(k=>{const o=R.cnt&&R.cnt.cc[k];return !!o&&o.D>1&&boxUse(R,C=>C.cc===k)>=0.9*o.D;})},
 {id:'cnt_tubes',i:'🧑‍⚖️',t:tr('streaming_badges.tubes_t'),d:tr('streaming_badges.tubes_d'),r:'e',ok:()=>cntOn()&&!!S.cnt.rg&&S.cnt.rg.fsWin>=1},
 {id:'cnt_basket',i:'🧺',t:tr('streaming_badges.basket_t'),d:tr('streaming_badges.basket_d'),r:'e',secret:true,ok:()=>cntOn()&&!!S.cnt.rg&&S.cnt.rg.lob>=1},
 {id:'cnt_mc',i:'📺',t:tr('streaming.must_carry'),d:tr('streaming_badges.mc_d'),r:'e',ok:()=>cntOn()&&!!S.cnt.won},
);
// The share card's rows for a Streaming service, in place of a carrier's.
function cntShareRows(got){const C=S.cnt,rows=[[tr('streaming.subscribers'),tr('streaming.subs_in_n_countries',{subs:fmtSubs(subsAll()),n:Object.keys(C.cc).length})],
  [tr('streaming_badges.share_on_net'),pct(onNet(R))],[tr('streaming_badges.share_origins_boxes'),`${dcN()} · ${C.box.length}`],[tr('common.peak_traffic'),fmtG(S.stats.peak||0)],
  [tr('streaming_badges.share_premieres'),String(C.premOk)],[tr('streaming_badges.share_events'),String(C.evOk)],[tr('common.incidents_survived'),String(S.stats.survived||0)],[tr('common.badges'),`${got.length}/${BADGES.length}`]];
  if(C.won)rows.unshift(['📺 '+tr('streaming.must_carry'),dateStr(C.won)]);return rows;}
