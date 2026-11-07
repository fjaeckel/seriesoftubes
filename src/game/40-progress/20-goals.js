/* ================= GOALS ================= */
const GOALS=[
 {id:'bb',t:tr('goals.light_up_your_first_customers'),d:tr('goals.open_your_home_city_and_press'),r:5000,ok:()=>Object.values(S.pops).some(p=>p.bb)},
 {id:'tr',t:tr('goals.reach_the_whole_internet'),d:tr('goals.your_eyeballs_want_everything_buy_ip'),r:5000,ok:()=>S.transit.length>0},
 {id:'ix',t:tr('goals.join_an_internet_exchange'),d:tr('goals.get_a_port_at_an_ix'),r:7500,ok:()=>Object.keys(S.ixp).length>0},
 {id:'p5',t:tr('goals.make_5_peering_friends'),d:tr('goals.on_the_peering_tab_request_sessions'),r:10000,ok:()=>R.sessions>=5},
 {id:'ln',t:tr('goals.lay_your_first_fiber'),d:tr('goals.drag_from_your_pink_router_to'),r:10000,ok:()=>S.links.length>0},
 {id:'bz',t:tr('goals.sign_a_business_customer'),d:tr('goals.businesses_show_up_with_a_bubble'),r:12500,ok:()=>S.biz.some(b=>!b.scripted)},
 {id:'rd',t:tr('goals.survive_a_failure'),d:tr('goals.things_break_all_the_time_build'),r:12500,ok:()=>S.stats.survived>0},
 {id:'ca',t:tr('goals.host_an_embedded_cache'),d:tr('goals.big_cdns_give_you_free_cache'),r:12500,ok:()=>S.caches.length>0},
 {id:'pn',t:tr('goals.set_up_a_pni'),d:tr('goals.a_private_cross_connect_to_one'),r:15000,ok:()=>S.pni.some(pniOn)},
 {id:'scrub',t:tr('goals.stand_up_ddos_defences'),d:tr('goals.build_a_scrubbing_center_from_a'),r:20000,ok:()=>hasScrub()},
 {id:'c3',t:tr('common.go_global'),d:tr('goals.have_pops_on_3_continents_subsea'),r:50000,ok:()=>regionsCount()>=3},
 {id:'t2',t:tr('goals.become_a_tier_2'),d:tr('goals.5_pops_ports_on_3_ixs'),r:50000,ok:()=>isTier2()},
 {id:'tb',t:tr('goals.serve_1_tbps'),d:tr('goals.a_terabit_per_second_of_happy'),r:75000,ok:()=>R.served>=1000},
 {id:'df',t:tr('goals.light_your_own_dark_fiber'),d:tr('goals.lease_or_dig_dark_fiber_put'),r:40000,ok:()=>S.links.some(l=>l.kind==='df'&&dfCap(l)>0)},
 {id:'m2',t:tr('goals.be_in_two_buildings_at_once'),d:tr('goals.add_a_second_site_in_a'),r:30000,ok:()=>Object.values(S.pops).some(p=>p.site2)},
 {id:'c5',t:tr('common.five_continents'),d:tr('goals.pops_in_five_of_the_six'),r:100000,ok:()=>regionsCount()>=5},
 {id:'gi',t:tr('goals.sign_a_giant'),d:tr('goals.land_an_ai_wan_a_multi'),r:150000,ok:()=>S.biz.some(b=>BIZ_T[b.type]&&BIZ_T[b.type].mega&&!BIZ_T[b.type].event)},
 {id:'t10',t:tr('goals.serve_10_tbps'),d:tr('goals.ten_terabits_per_second_of_happy'),r:250000,ok:()=>R.served>=10000},
 {id:'t1',t:tr('common.go_transit_free_tier_1'),d:tr('goals.peer_with_every_tier_1_their_customers'),r:0,win:true,ok:()=>isTier1()},
];
// The Cable broker's goals (#300): light glass, sell it, lay cables across the oceans, and end as a Glass Baron
// (37-cable-broker.js). Ids of their own, so a save keeps the ladder it ran. Rewards are larger: glass costs more.
const BROKER_GOALS=[
 {id:'bk_df',t:tr('goals.light_your_own_dark_fiber'),d:tr('broker.goal_df_d'),r:25000,ok:()=>S.links.some(l=>l.kind==='df'&&dfCap(l)>0)},
 {id:'bk_wave',t:tr('broker.goal_wave'),d:tr('broker.goal_wave_d'),r:40000,ok:()=>S.biz.some(b=>b.type==='wwave'||b.type==='mwave'||b.type==='capw'&&!capPend(b))},
 {id:'bk_pair',t:tr('broker.goal_pair'),d:tr('broker.goal_pair_d'),r:50000,ok:()=>S.biz.some(b=>(b.type==='dfpair'||b.type==='pairs'||b.type==='capfib')&&!capPend(b))},
 {id:'bk_sea',t:tr('broker.goal_sea'),d:tr('broker.goal_sea_d'),r:150000,ok:()=>S.links.some(l=>ownGlassL(l)&&l.sub)},
 {id:'bk_deal',t:tr('broker.goal_deal'),d:tr('broker.goal_deal_d'),r:100000,ok:()=>(S.stats.capDone||0)>0},
 {id:'bk_10k',t:tr('broker.goal_10k'),d:tr('broker.goal_10k_d'),r:200000,ok:()=>glassKm()>=10000},
 {id:'bk_16t',t:tr('broker.goal_16t'),d:tr('broker.goal_16t_d'),r:250000,ok:()=>glassChain(1600)},
 {id:'bk_c4',t:tr('broker.goal_c4'),d:tr('broker.goal_c4_d'),r:400000,ok:()=>cableConts()>=4},
 {id:'bk_10t',t:tr('broker.goal_10t'),d:tr('broker.goal_10t_d'),r:600000,ok:()=>capSoldG()>=10000},
 {id:'bk_win',t:tr('broker.glass_baron'),d:tr('broker.goal_win_d'),r:0,win:true,baron:true,ok:()=>baronOk()},
];
// The ladder this network runs: the broker's, or the classic one every other charter and mode plays.
const goals=()=>broker()?BROKER_GOALS:GOALS;
