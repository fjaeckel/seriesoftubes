/* Badges: achievements with rarities. Earned per game, and also remembered across games on this
   device in a hall of fame, so there is always something grand to work towards. */
const RARITY={c:{n:tr('common.common'),col:'#16A866'},r:{n:tr('common.rare'),col:'#3A7BEA'},e:{n:tr('common.epic'),col:'#9D4EDD'},l:{n:tr('common.legendary'),col:'#FF8A3D'}};
const st=()=>S.stats||{};
const BADGES=[
 {id:'hello',i:'👋',t:tr('common.hello_neighbour'),d:tr('badges.bring_up_your_first_peering_session'),r:'c',ok:()=>R.sessions>=1},
 // Keeps its old id so badges already earned (in saves and the hall of fame) carry over.
 {id:'backhoe',i:'🐒',t:tr('badges.met_the_chaos_monkey'),d:tr('badges.get_a_visit_from_the_chaos_monkey'),r:'c',ok:()=>(st().mkMet||0)>=1},
 {id:'debt',i:'🏦',t:tr('badges.in_debt_we_trust'),d:tr('badges.take_out_a_loan'),r:'c',ok:()=>(st().loans||0)>=1||(S.loans||[]).length>0},
 {id:'twins',i:'👯',t:tr('common.twins'),d:tr('badges.run_two_routers_in_one_pop'),r:'c',ok:()=>Object.values(S.pops).some(p=>(p.routers||1)>=2)},
 {id:'shark',i:'🦈',t:tr('common.shark_week'),d:tr('badges.get_a_subsea_cable_bitten_by'),r:'r',ok:()=>(st().sharks||0)>=1},
 {id:'ixc',i:'🔀',t:tr('common.ix_collector'),d:tr('badges.have_ports_on_10_internet_exchanges'),r:'r',ok:()=>Object.keys(S.ixp).length>=10},
 {id:'haggle',i:'🤝',t:tr('badges.never_paid_list_price'),d:tr('badges.haggle_a_de_kicks_quote_down'),r:'r',ok:()=>!!st().haggleWin},
 {id:'unsub',i:'📭',t:tr('common.unsubscribed'),d:tr('badges.opt_out_of_3_auto_enrolled'),r:'r',ok:()=>(st().optouts||0)>=3},
 {id:'read',i:'💔',t:tr('badges.left_on_read'),d:tr('badges.get_de_peered_by_a_big'),r:'r',ok:()=>(st().depeered||0)>=1},
 {id:'couch',i:'🛋️',t:tr('badges.peering_from_the_couch'),d:tr('badges.peer_at_an_ix_remotely'),r:'r',ok:()=>Object.keys(S.ixp).some(c=>isRemote(c)&&ixSessions(c).size>0)},
 {id:'sender',i:'🇰🇷',t:tr('common.sender_pays'),d:tr('badges.paid_pnis_with_all_three_korean'),r:'e',ok:()=>['ktt','skb','lgu'].every(n=>S.pni.some(p=>p.net===n&&pniOn(p)))},
 {id:'oink',i:'🐖',t:tr('common.pig_whisperer'),d:tr('badges.run_a_slow_booting_packetoinker'),r:'r',ok:()=>Object.keys(S.pops).some(c=>/Oinker/.test(RG[S.pops[c].rgen||0].chip)&&slowBoot(c))},
 {id:'gap',i:'🌴',t:tr('common.mind_the_gap'),d:tr('badges.link_panama_city_and_bogota'),r:'r',ok:()=>S.links.some(l=>[l.a,l.b].includes('pan')&&[l.a,l.b].includes('bog'))},
 {id:'andes',i:'🏔️',t:tr('badges.over_the_mountains'),d:tr('badges.build_fiber_across_the_andes'),r:'r',ok:()=>S.links.some(l=>!l.sub&&andesPair(l.a,l.b))},
 {id:'duo',i:'🏜️',t:tr('common.duopoly_customer'),d:tr('badges.buy_a_wave_inside_the_uae'),r:'r',ok:()=>S.links.some(l=>uaePair(l.a,l.b))},
 {id:'shed',i:'🔌',t:tr('common.stage_six'),d:tr('badges.ride_out_load_shedding_on_your'),r:'r',ok:()=>(st().shed||0)>=1},
 {id:'metro3',i:'🏢',t:tr('badges.two_buildings_three_cities'),d:tr('badges.have_a_second_site_in_3'),r:'r',ok:()=>Object.values(S.pops).filter(p=>p.site2).length>=3},
 {id:'penguin',i:'🐧',t:tr('common.lonely_penguin'),d:tr('badges.light_a_wave_on_the_humboldt'),r:'e',ok:()=>S.links.some(l=>l.cable==='humb')},
 {id:'horn',i:'⛵',t:tr('badges.the_long_way_round'),d:tr('badges.run_a_link_round_cape_horn'),r:'e',ok:()=>S.links.some(l=>l.cable==='sam1'&&[l.a,l.b].includes('bue')&&[l.a,l.b].includes('scl'))},
 {id:'six',i:'🌍',t:tr('common.six_continents'),d:tr('badges.pops_in_every_region_on_the'),r:'e',ok:()=>regionsCount()>=6},
 {id:'giants',i:'🏭',t:tr('badges.friend_of_giants'),d:tr('badges.hold_deals_at_3_different_ai'),r:'e',ok:()=>new Set(S.biz.filter(b=>BIZ_T[b.type]&&BIZ_T[b.type].mega).flatMap(b=>bCities(b))).size>=3},
 {id:'landlord',i:'🧵',t:tr('common.trench_landlord'),d:tr('badges.lease_hundreds_of_fiber_pairs_to'),r:'e',ok:()=>S.biz.some(b=>b.type==='pairs')},
 {id:'t1',i:'👑',t:tr('common.tier_1'),d:tr('badges.go_transit_free'),r:'e',ok:()=>!!S.won},
 {id:'sol',i:'⚡',t:tr('specialist.speed_of_light'),d:tr('specialist.win_as_a_low_latency_boutique'),r:'e',ok:()=>!!S.solWon},
 {id:'seat',i:'🚢',t:tr('specialist.part_owner_of_the_sea'),d:tr('specialist.take_a_seat_on_a_consortium'),r:'r',ok:()=>S.links.some(l=>l.seat)},
 {id:'bait',i:'🎣',t:tr('common.shark_bait'),d:tr('badges.get_bitten_by_sharks_3_times'),r:'l',ok:()=>(st().sharks||0)>=3},
 {id:'nines',i:'💎',t:tr('common.five_nines'),d:tr('badges.serve_99_5_of_demand_every'),r:'l',ok:()=>(st().clean||0)>=365},
 {id:'fifty',i:'🗺️',t:tr('badges.everywhere_at_once'),d:tr('badges.have_pops_in_50_cities'),r:'l',ok:()=>Object.keys(S.pops).length>=50},
 {id:'unicorn',i:'🦄',t:tr('common.unicorn'),d:tr('badges.hold_a_billion_dollars_in_cash'),r:'l',ok:()=>S.cash>=1e9},
 {id:'clean',i:'🧼',t:tr('badges.debt_free_tier_1'),d:tr('badges.win_without_ever_taking_a_loan'),r:'l',ok:()=>!!S.won&&!(st().loans||0)&&!(S.loans||[]).length},
 {id:'speed',i:'⚡',t:tr('common.speedrun'),d:tr('badges.reach_tier_1_within_three_years'),r:'l',ok:()=>!!S.won&&S.day<=1095},
 {id:'te',i:'🧭',t:tr('common.traffic_whisperer'),d:tr('badges.have_auto_te_move_100_gbps'),r:'r',ok:()=>(st().teMax||0)>=100},
 {id:'street',i:'🚧',t:tr('common.same_street'),d:tr('badges.lose_a_metro_ring_to_one'),r:'r',ok:()=>(st().by||{}).ring>=1},
 {id:'anchor',i:'⚓',t:tr('common.anchors_aweigh'),d:tr('badges.have_a_cable_cut_by_a'),r:'r',ok:()=>!!(st().f||{}).anchor},
 {id:'retained',i:'🎁',t:tr('badges.customer_success_story'),d:tr('badges.take_a_de_kicks_retention_offer'),r:'r',ok:()=>!!st().retained},
 {id:'brrr',i:'🇧🇷',t:tr('common.samba_peering'),d:tr('badges.ports_on_ix_brrr_in_sao'),r:'e',ok:()=>['sao','rio','for'].every(c=>S.ixp[c]!==undefined)},
 {id:'bingo',i:'🎰',t:tr('badges.de_kicks_bingo'),d:tr('badges.ports_at_all_six_de_kicks'),r:'e',ok:()=>DK_CITIES.filter(c=>CITY[c]&&CITY[c].ix).every(c=>S.ixp[c]!==undefined)},
 {id:'fire',i:'🌋',t:tr('badges.ring_of_fire'),d:tr('badges.pops_all_the_way_round_the'),r:'e',ok:()=>['lax','tok','tpe','mnl','jkt','syd','akl','scl'].every(c=>S.pops[c])},
 {id:'curtain',i:'🎭',t:tr('badges.iron_curtain_call'),d:tr('badges.pops_in_warsaw_prague_vienna'),r:'e',ok:()=>['waw','prg','vie','bud','buh','sof','beg','tll'].every(c=>S.pops[c])},
 {id:'islands',i:'🏝️',t:tr('common.island_hopper'),d:tr('badges.pops_in_reykjavik_dublin_london'),r:'e',ok:()=>['rek','dub','lon','cbo','tpe','mnl','tok','akl'].every(c=>S.pops[c])},
 {id:'wall',i:'🧱',t:tr('badges.through_the_wall'),d:tr('badges.run_a_licensed_pop_in_mainland'),r:'e',ok:()=>cnOk()&&Object.keys(S.pops).some(cnCity)},
 {id:'beaver',i:'🦫',t:tr('common.dam_it'),d:tr('badges.have_your_fiber_chewed_through_by'),r:'e',ok:()=>!!(st().f||{}).beaver},
 {id:'croc',i:'🐊',t:tr('common.darwin_award'),d:tr('badges.have_your_fiber_bitten_by_a'),r:'l',ok:()=>!!(st().f||{}).croc},
 {id:'unbreak',i:'🛡️',t:tr('common.unbreakable'),d:tr('badges.survive_100_incidents_without'),r:'l',ok:()=>(st().survived||0)>=100},
 {id:'lv13',i:'🌐',t:tr('badges.is_this_the_internet'),d:tr('badges.reach_customer_level_13'),r:'l',ok:()=>(S.lvl||1)>=13},
 {id:'gigawatt',i:'⚛️',t:tr('common.gigawatt_landlord'),d:tr('badges.hold_an_ai_wan_a_training'),r:'l',ok:()=>['aiwan','mtrain','ingest','pairs'].every(t=>S.biz.some(b=>b.type===t))},
 {id:'blitz',i:'🚀',t:tr('common.blitz'),d:tr('badges.reach_tier_1_within_two_years'),r:'l',ok:()=>!!S.won&&S.day<=730},
 {id:'peta',i:'🌌',t:tr('common.hundred_terabits'),d:tr('badges.serve_100_tbps'),r:'l',ok:()=>R.served>=100000},
 {id:'petabit',i:'🪐',t:tr('badges.a_petabit_a_second'),d:tr('badges.serve_1_pbps_a_thousand_terabits'),r:'l',ok:()=>R.served>=1e6},
 {id:'llama',i:'🦙',t:tr('common.llama_drama'),d:tr('badges.lose_fiber_to_a_llama_herd'),r:'l',secret:true,ok:()=>!!(st().f||{}).llama},
 {id:'hallway',i:'🎤',t:tr('common.hallway_track'),d:tr('badges.attend_a_conference'),r:'r',ok:()=>(st().confs||0)>=1},
 {id:'beer',i:'🍺',t:tr('badges.peering_over_beer'),d:tr('badges.set_up_a_pni_while_the'),r:'e',ok:()=>!!st().beerPni},
 {id:'circuit',i:'✈️',t:tr('common.conference_circuit'),d:tr('badges.attend_six_conferences_in_one_game'),r:'l',ok:()=>(st().confs||0)>=6},
 {id:'kiddie',i:'💻',t:tr('common.script_kiddie'),d:tr('badges.deploy_a_routescript_that_cuts_your'),r:'r',ok:()=>!!st().kiddie},
 {id:'fat',i:'🫠',t:tr('common.fat_finger'),d:tr('badges.deploy_a_routescript_that_takes_down'),r:'r',ok:()=>!!st().fat},
 {id:'scen1',i:'🎯',t:tr('common.scenario_solver'),d:tr('badges.complete_any_scenario'),r:'r',ok:()=>!!(S.scn&&S.scn.done&&S.scn.id!=='weekly')},
 {id:'weekly',i:'📅',t:tr('common.weekly_regular'),d:tr('badges.finish_a_weekly_challenge'),r:'r',ok:()=>!!(S.scn&&S.scn.done&&S.scn.id==='weekly')},
 {id:'scen3',i:'🏅',t:tr('common.scenario_specialist'),d:tr('badges.complete_three_different_scenarios'),r:'e',ok:()=>!!(S.scn&&S.scn.done&&S.scn.id!=='weekly')&&Object.keys(scnHof()).filter(k=>k!=='weekly').length>=3},
 {id:'scenall',i:'🏆',t:tr('common.scenario_grandmaster'),d:tr('badges.complete_every_scenario'),r:'l',ok:()=>!!(S.scn&&S.scn.done&&S.scn.id!=='weekly')&&SCN.every(x=>scnHof()[x.id])},
 {id:'elephant',i:'🐘',t:tr('badges.i_survived_the_elephant'),d:tr('badges.live_through_the_day_half_the'),r:'l',secret:true,ok:()=>!!S.phpDone&&!(S.ev.php>S.day)},
 {id:'vigil',i:'⚖️',t:tr('common.vigilante'),d:tr('badges.fire_the_hackback_3000tm_and_flatten'),r:'e',secret:true,ok:()=>(st().vigilante||0)>=1},
 {id:'nullroute',i:'💥',t:tr('common.collateral_damage'),d:tr('badges.blackhole_one_of_your_own_cities'),r:'r',ok:()=>(st().rtbh||0)>=1},
 {id:'toaster',i:'🍞',t:tr('common.toaster_wrangler'),d:tr('badges.weather_a_ddos_with_your_defences'),r:'c',ok:()=>(st().ddosHeld||0)>=1},
 {id:'cleanpipe',i:'🚿',t:tr('common.clean_pipes'),d:tr('badges.turn_on_a_transit_clean_pipe'),r:'r',ok:()=>S.transit.some(t=>t.clean)},
 {id:'lamb',i:'🐐',t:tr('common.sacrificial_lamb'),d:tr('badges.run_a_sacrificial_pni_choke_point'),r:'r',ok:()=>S.pni.some(p=>p.sacrif)},
 {id:'monkey',i:'🛡️',t:tr('badges.monkey_proof'),d:tr('badges.outlast_a_chaos_monkey_visit'),r:'e',ok:()=>(st().mkSurv||0)>=1},
 {id:'flood',i:'🌊',t:tr('badges.held_the_flood'),d:tr('badges.weather_a_multi_terabit_ddos'),r:'e',ok:()=>(st().ddosMonster||0)>=1},
 {id:'skynot',i:'🤖',t:tr('common.skynot_smiles'),d:tr('badges.land_a_hackback_3000tm_that_actually'),r:'e',secret:true,ok:()=>(st().hackWin||0)>=1},
 {id:'label',i:'🏷️',t:tr('core.label_switcher'),d:tr('core.run_an_mpls_backbone'),r:'c',ok:()=>coreOn()&&S.core.run>=1},
 {id:'bleed',i:'🩸',t:tr('core.bleeding_edge'),d:tr('core.run_an_srv6_backbone'),r:'r',ok:()=>coreOn()&&S.core.run>=4},
 {id:'mono',i:'🏪',t:tr('core.single_vendor_shop'),d:tr('core.run_sr_mpls_or_srv6_on'),r:'e',ok:()=>coreOn()&&S.core.run>=3&&Object.keys(S.pops).length>=8&&!coreOut().length&&coreVendors().size===1},
 {id:'zoo',i:'🦓',t:tr('core.vendor_zoo'),d:tr('core.run_an_mpls_backbone_with_4'),r:'r',ok:()=>coreOn()&&S.core.run>=1&&coreVendors().size>=4},
 {id:'zero',i:'🕳️',t:tr('badges.zero_peers_given'),d:tr('badges.reach_tier_2_with_every_single'),r:'l',secret:true,ok:()=>isTier2()&&!Object.keys(S.peers).length&&!S.pni.length},
];
/* Badge variants by ruleset (2.0): On-call earns the standard badge, Change Freeze a frosted one and BGP at 3 a.m. a
   fiery one; Sandbox and the puzzles earn none (puzzles have stars). Earning a badge again under a harder preset
   upgrades its look, here and in the hall of fame. S.ach[id] stays the day it was earned; S.achP[id] is its variant. */
const BVAR={freeze:{k:'freeze',lv:1,i:'🧊',n:N_('badges.variant_freeze_dried'),col:'#5BC0EB'},oncall:{k:'oncall',lv:2,i:'⭐',n:N_('badges.variant_on_call'),col:'#FFD23F'},bgp:{k:'bgp',lv:3,i:'🔥',n:N_('badges.variant_forged_at_3_a_m'),col:'#FF5A1F'}};
const BVAR_IDS=['freeze','oncall','bgp'],bvar=k=>own(BVAR,k)?BVAR[k]:BVAR.oncall;
// The preset this save plays under ('oncall' for every save from before rulesets), and the variant it earns (null: none).
const rulePre=()=>(typeof rulePreset==='function'?rulePreset():(S&&S.rules&&S.rules.preset))||'oncall';
function badgeVar(){if(!S||S.mode==='sandbox')return null;const p=rulePre();return p==='sandbox'||p==='puzzle'?null:own(BVAR,p)?p:'oncall';}
// The hall of fame is this device's localStorage, so it is checked like a save: unknown variants count as standard.
function hof(){let h;try{h=JSON.parse(localStorage.getItem('sot-badges')||'{}');}catch(e){h=null;}if(!h||typeof h!=='object'||Array.isArray(h))return {};
  for(const k of Object.keys(h)){const x=h[k];if(!x||typeof x!=='object'){delete h[k];continue;}const vs=x.vs&&typeof x.vs==='object'&&!Array.isArray(x.vs)?x.vs:{};
    x.vs={};for(const v of BVAR_IDS)if(typeof vs[v]==='string')x.vs[v]=vs[v];if(!Object.keys(x.vs).length)x.vs.oncall=typeof x.d==='string'?x.d:'';
    x.v=BVAR_IDS.filter(v=>x.vs[v]!==undefined).pop();}
  return h;}
function checkBadges(){S.ach=S.ach||{};S.achP=S.achP||{};const v=badgeVar();if(!v)return;let h=null;const V=BVAR[v];
  for(const b of BADGES){const had=S.ach[b.id]!==undefined;if(had&&bvar(S.achP[b.id]).lv>=V.lv)continue;let ok=false;try{ok=b.ok();}catch(e){}
    if(!ok)continue;if(!had)S.ach[b.id]=S.day;S.achP[b.id]=v;const R0=RARITY[b.r];
    // "Upgraded" is about this device's collection: the hall of fame already held the badge, only in a lower variant.
    if(!h)h=hof();const today=new Date().toISOString().slice(0,10),up=!!h[b.id]&&bvar(h[b.id].v).lv<V.lv,x=h[b.id]||(h[b.id]={d:today,n:S.name,vs:{}});if(x.vs[v]===undefined)x.vs[v]=today;if(bvar(x.v).lv<V.lv||!x.v)x.v=v;
    toast(`<b>${b.i} ${up?tr('badges.badge_upgraded_name',{name:esc(b.t)}):tr('badges.badge_unlocked_name',{name:esc(b.t)})}</b><br><span style="color:${R0.col};font-weight:900">${R0.n}</span>${v==='oncall'?'':` · <span class="bvt v-${v}">${V.i} ${tr(V.n)}</span>`} · ${esc(b.d)}`,'goal',[],{a:'tab',v:'goals'});sfx('coin');track('badge_'+b.id+(v==='oncall'?'':'_'+v));}
  if(h)try{localStorage.setItem('sot-badges',JSON.stringify(h));}catch(e){}}
// How many badges this device has ever earned in each variant: the collection.
function badgeShelf(h){const o={freeze:0,oncall:0,bgp:0};for(const b of BADGES){const x=h[b.id];if(x)for(const v of BVAR_IDS)if(x.vs[v]!==undefined)o[v]++;}return o;}
function badgeGrid(){const h=hof(),got=BADGES.filter(b=>S.ach&&S.ach[b.id]!==undefined).length,sh=badgeShelf(h),V=badgeVar();
  return `<h3 style="font-size:15px;margin:14px 0 6px">${tr('common.badges')} <span class="meta">${tr('badges.got_total_this_game_ever_ever',{got,total:BADGES.length,ever:Object.keys(h).filter(k=>BADGES.some(b=>b.id===k)).length})}</span></h3>
  <div class="bshelf">${BVAR_IDS.map(v=>`<span class="bsh v-${v}${V===v?' cur':''}">${BVAR[v].i} ${esc(tr(BVAR[v].n))} <b>${sh[v]}/${BADGES.length}</b></span>`).join('')}</div>${V&&V!=='oncall'?`<p class="meta" style="margin:0 0 6px">${V==='bgp'?tr('badges.this_game_earns_fiery_badges'):tr('badges.this_game_earns_frosted_badges')}</p>`:''}
  <div class="badges">${BADGES.map(b=>{const on=S.ach&&S.ach[b.id]!==undefined,ever=!!h[b.id],R0=RARITY[b.r],hide=b.secret&&!on&&!ever,vk=on?bvar(S.achP&&S.achP[b.id]).k:ever?h[b.id].v:'',vn=vk&&vk!=='oncall'?' · '+BVAR[vk].i+' '+tr(BVAR[vk].n):'';
    return `<div class="bdg ${on?'on':ever?'ever':''}${vk?' v-'+vk:''}" style="--rc:${R0.col}" title="${esc(hide?tr('badges.a_secret_badge'):b.t+': '+b.d+vn)}"><span class="bi">${hide?'❔':b.i}</span><span class="bt">${esc(hide?'???':b.t)}</span><span class="br">${R0.n}${ever&&!on?' · '+tr('common.earned_before'):''}</span>${vk&&vk!=='oncall'?`<span class="bv">${BVAR[vk].i} ${esc(tr(BVAR[vk].n))}</span>`:''}${hide?'':`<span class="bd">${esc(b.d)}</span>`}</div>`;}).join('')}</div>`;}
function checkGoals(){checkBadges();
  for(const g of GOALS){if(S.done[g.id]!==undefined)continue;let ok=false;try{ok=g.ok();}catch(e){}
    if(ok){S.done[g.id]=S.day;if(g.r&&S.mode!=='sandbox'){S.cash+=g.r;}
      toast(`<b>${tr('badges.goal_complete_name',{name:esc(g.t)})}</b>${g.r?`<br>${tr('badges.reward_amt',{amt:fmt$(g.r)})}`:''}`,'goal',[],{a:'tab',v:'goals'});sfx('coin');
      track('goal_'+g.id);if(g.win&&!S.won){S.won=true;track('win_tier1');checkBadges();showWin();}}}
}

