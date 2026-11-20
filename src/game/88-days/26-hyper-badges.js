/* ---------- Badges and the share card for a Hyperscaler (60-features/37-hyper.js) ----------
   Earned only by a Hyperscaler. Transit? Never Heard of Her and Cloud Nine are in 20-badges.js. What happens once and
   leaves no trace in S.hs is counted in S.stats: hsProt (protests won, 38-hyper-power.js), hsFlop (models that
   hallucinated in public, 38-hyper-traffic.js), hsWar (price wars matched to the end, 38-hyper-rivals.js) and hsLost
   (data lost in a region failure, 38-hyper-failover.js). */
const hsOn=()=>hyper()&&!!S.hs;
BADGES.push(
 {id:'hs_rg1',i:'🏗️',t:tr('hyper_badges.rg1_t'),d:tr('hyper_badges.rg1_d'),r:'c',ok:()=>hsOn()&&Object.keys(S.hs.rg).some(c=>S.hs.rg[c].t>0&&S.hs.rg[c].ready<=S.day)},
 {id:'hs_drill1',i:'🧯',t:tr('hyper_badges.drill_t'),d:tr('hyper_badges.drill_d'),r:'c',ok:()=>hsOn()&&Object.keys(S.hs.drill||{}).length>0},
 {id:'hs_prot',i:'🪧',t:tr('hyper_badges.prot_t'),d:tr('hyper_badges.prot_d'),r:'r',ok:()=>hsOn()&&(st().hsProt||0)>=1},
 {id:'hs_ontime',i:'⏱️',t:tr('hyper_badges.ontime_t'),d:tr('hyper_badges.ontime_d'),r:'r',ok:()=>hsOn()&&(S.hs.jd|0)>0},
 {id:'hs_ship',i:'🍝',t:tr('hyper_badges.ship_t'),d:tr('hyper_badges.ship_d'),r:'r',ok:()=>hsOn()&&(S.hs.ai|0)>0},
 {id:'hs_flop',i:'🦜',t:tr('hyper_badges.flop_t'),d:tr('hyper_badges.flop_d'),r:'r',secret:true,ok:()=>hsOn()&&(st().hsFlop||0)>=1},
 {id:'hs_spare',i:'🧦',t:tr('hyper_badges.spare_t'),d:tr('hyper_badges.spare_d'),r:'r',ok:()=>hsOn()&&S.biz.some(b=>b.type==='dfpair')},
 {id:'hs_lost',i:'📰',t:tr('hyper_badges.lost_t'),d:tr('hyper_badges.lost_d'),r:'r',secret:true,ok:()=>hsOn()&&(st().hsLost||0)>=1},
 {id:'hs_survive',i:'🌪️',t:tr('hyper_badges.survive_t'),d:tr('hyper_badges.survive_d'),r:'e',ok:()=>hsOn()&&(S.hs.fsv|0)>0},
 {id:'hs_cont',i:'🌍',t:tr('hyper_badges.cont_t'),d:trn('hyper_badges.cont_d',HS_C9_CT),r:'e',ok:()=>hsOn()&&hsC9Cont()>=HS_C9_CT},
 {id:'hs_war',i:'📉',t:tr('hyper_badges.war_t'),d:tr('hyper_badges.war_d'),r:'e',ok:()=>hsOn()&&(st().hsWar||0)>=1},
 {id:'hs_smr',i:'⚛️',t:tr('hyper_badges.smr_t'),d:tr('hyper_badges.smr_d'),r:'l',ok:()=>hsOn()&&Object.values(S.hs.pw||{}).some(p=>(p.own||[]).some(x=>x.k==='smr'&&x.ready<=S.day))},
);
// The share card's rows for a Hyperscaler, in place of a carrier's: regions and continents, users, the peak between
// regions, tenants, drills, and Cloud Nine on top once won.
function hsShareRows(got){const H=S.hs,rs=hsRgBuilt(),ccs=Object.keys(H.cc).length,rows=[
  [tr('hyper.regions'),trn('hyper_badges.share_regions',hsC9Cont(),{r:rs.length})],
  [tr('hyper.users'),trn('hyper_badges.share_users',ccs,{g:fmtG(hsUsers())})],
  [tr('hyper_badges.share_btw'),fmtG(H.bpk||0)],[tr('common.peak_traffic'),fmtG(S.stats.peak||0)],
  [tr('hyper_badges.share_tenants'),String(hsTen().length)],[tr('hyper_badges.share_drills'),String(Object.keys(H.drill||{}).length)],
  [tr('common.incidents_survived'),String(S.stats.survived||0)],[tr('common.badges'),`${got.length}/${BADGES.length}`]];
  rows.unshift(H.won?['☁️ '+tr('hyper_win.cloud_nine'),dateStr(H.won)]:['☁️ '+tr('hyper_win.cloud_nine'),tr('hyper_badges.share_c9',{ct:hsC9Cont(),n:HS_C9_CT})]);return rows;}
