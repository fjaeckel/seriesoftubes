// Anchors Away (Baltic): a link on an anchor-prone cable, or on a pair one serves (the map calls those overland).
const anchorProne=l=>!!(l.cable&&CAB[l.cable]&&CAB[l.cable].anchor)||anchorPair(l);
function fireFailure(only){
  const opts=[];
  const live=S.links.filter(l=>l.kind!=='vxc'&&!linkDown(l));const fabsUsed=[...new Set(S.links.filter(l=>l.kind==='vxc').map(l=>l.prov))];
  if(live.length){opts.push(['cut',2+Math.min(6,live.length/2)]);}
  if(Object.keys(S.pops).length)opts.push(['crash',3],['power',2]);
  if(Object.values(S.pops).some(p=>p.site2))opts.push(['ring',1.2]);
  if(S.transit.some(t=>!(t.down>S.day)))opts.push(['transit',3]);
  if(Object.keys(S.ixp).length)opts.push(['ixloop',2]);
  if(S.transit.length&&S.day>60)opts.push(['leak',2]);
  // Flood Season brings its own; Change Freeze (calm) has none. Gaming customers put DDoS on its own, busier schedule
  // (ddosTick) instead of this one, so it is never counted twice. Spicy failures already come 1.8x as often; a slightly
  // heavier weight makes that twice On-call's DDoS, as BGP at 3 a.m. promises.
  if(S.day>40&&!scnRule('ddos')&&!ddosOff()&&!gamingCount())opts.push(['ddos',rule('chaos')==='spicy'?2.25:2]);
  if(fabsUsed.length)opts.push(['fabric',1.5]);
  const lit=S.links.filter(l=>l.kind==='df'&&dfCap(l)>0&&!linkDown(l));if(lit.length)opts.push(['amp',1.5+lit.length*0.3],['optic',1.5+lit.length*0.3]);
  // Two vendors' idea of the same protocol: the higher the backbone runs, the more often they disagree.
  const iop=coreIopRisk()?coreIopLinks(live):[];if(iop.length)opts.push(['interop',3*coreIopRisk()]);
  opts.push(['funny',4]);
  if(!opts.length)return;
  let tot=opts.reduce((a,o)=>a+o[1],0),r=Math.random()*tot,type=opts[0][0];
  for(const o of opts){r-=o[1];if(r<=0){type=o[0];break;}}
  if(only)type=only;
  if(type==='funny'){const f=['oops','cleaner','harmless','harmless','harmless','ac'];if(live.length)f.push('fatwave','fatwave','mtu','label','loss','loss');if(lagsN().length)f.push('lacp','lacp');if(R.demand>1)f.push('pmtud');if(S.transit.length)f.push('prepend');if(S.day>30)f.push('rpki');if(lit.length)f.push('roadmff');type=pick(f);}
  const before=R.served;
  if(type==='harmless'){const m=pick(HARMLESS);S.stats.incidents++;S.stats.survived++;toast(`<b>${m[0]}</b><br>${m[1]}`,'goal');sfx('alert');return;}
  if(type==='ring'){const cs=Object.keys(S.pops).filter(c=>S.pops[c].site2),c=pick(cs),pp=S.pops[c],dur=2+Math.floor(Math.random()*3);pp.ringcut=S.day+dur;
    addInc({type,ref:c,until:pp.ringcut,msg:pick([tr('failures.a_backhoe_cut_the_metro_ring',{city:CITY[c].name}),tr('failures.someone_pulled_the_wrong_cross',{city:CITY[c].name,siteB:siteName(c,'b'),siteA:siteName(c,'a')}),tr('failures.a_tram_line_construction_project_in',{city:CITY[c].name})]),cost:3000,fix:tr('failures.splice_it_tonight')});}
  else if(type==='ac'){const c=pick(Object.keys(S.pops)),pp=S.pops[c];pp.hot=S.day+2;
    addInc({type,ref:c,until:pp.hot,msg:CITY[c].lux&&Math.random()<0.7?tr('failures.a_forestry_strike_stopped_the_waste',{dc:siteName(c,'a'),city:CITY[c].name}):pick([tr('failures.the_a_c_at_dc_died',{dc:siteName(c,'a'),city:CITY[c].name}),tr('failures.someone_set_the_data_center',{city:CITY[c].name}),tr('failures.the_cooling_contractor_in_city',{city:CITY[c].name})]),cost:2000,fix:tr('failures.buy_40_desk_fans')});
  }else if(type==='interop'){
    const ls=coreIopLinks(live);if(!ls.length)return;const l=pick(ls),dur=1+Math.floor(Math.random()*2),A=CITY[l.a].name,B=CITY[l.b].name,va=RG_V[RG[S.pops[l.a].rgen||0].v],vb=RG_V[RG[S.pops[l.b].rgen||0].v],L=tr(CORE_LV[S.core.run]);l.cut=Math.max(l.cut||0,S.day+dur);
    addInc({type,ref:l.id,until:l.cut,msg:pick([tr('core.va_and_vb_disagree_about',{va,vb,lv:L,a:A,b:B}),tr('core.a_firmware_update_on_the_va',{va,vb,lv:L,a:A,b:B}),tr('core.both_tacs_say_it_is',{va,vb,a:A,b:B})]),cost:2500,fix:tr('core.open_a_ticket_with_both')});
  }else if(type==='fatwave'||type==='label'){
    const l=pick(live),dur=1+Math.floor(Math.random()*2),A=CITY[l.a].name,B=CITY[l.b].name,W=pick(WAVECO);l.cut=Math.max(l.cut||0,S.day+dur);
    const msg=type==='label'?pick([tr('failures.someone_in_dc_labeled_every_patch',{dc:siteName(l.a,'a'),a:A,b:B}),tr('failures.a_remote_hands_tech_in_a',{a:A,b:B}),tr('failures.a_new_tech_in_a_tidied',{a:A,b:B})])
      :l.kind==='df'?pick([tr('failures.the_landlord_in_a_re_routed',{a:A,b:B}),tr('failures.a_splicer_fusing_someone_else_s',{b:B})])
      :pick([tr('failures.co_fat_fingered_a_cross_connect',{co:W,a:A,b:B}),tr('failures.co_did_quick_maintenance_on_the',{co:W,a:A,b:B}),tr('failures.co_scheduled_maintenance_in_utc_your',{co:W,a:A,b:B}),tr('failures.an_engineer_at_co_swapped_tx',{co:W,a:A,b:B}),tr('failures.co_decommissioned_your_a_b_wave',{co:W,a:A,b:B})]);
    addInc({type,ref:l.id,until:l.cut,msg,cost:1500,fix:tr('failures.bribe_their_noc_with_donuts')});
  }else if(type==='lacp'){
    const g=pick(lagsN()),n=g.n,dur=1+Math.floor(Math.random()*3),v=Math.floor(Math.random()*4);
    const f=v===0?Math.max(0.3,1.4/n):v===3?0:(n-1)/n,until=S.day+(v===3?1:dur),lab=g.lab;
    if(g.k==='ix'){S.ev.ixlacp=S.ev.ixlacp||{};S.ev.ixlacp[g.id]={until,f};}else g.o.lacp={until,f};
    const msg=[N_('failures.hash_polarisation_on_your_lab_nearly'),
      N_('failures.lacp_fast_slow_timer_mismatch_on'),
      N_('failures.one_member_of_your_lab_was'),
      N_('failures.someone_set_min_links_on_your')][v];
    addInc({type,ref:g.k+':'+g.id,until,msg:tr(msg,{lab}),cost:600,fix:tr('failures.fix_the_lacp_config')},msg);
  }else if(type==='loss'){
    const deep=l=>[l.a,l.b].every(c=>S.pops[c]&&/deep-buffer/.test(RG[S.pops[c].rgen||0].chip));
    const l=pick(live),v=Math.floor(Math.random()*3);
    if(v===1&&deep(l)){S.stats.incidents++;S.stats.survived++;toast(tr('failures.microbursts_on_a_b_your_deep',{a:CITY[l.a].name,b:CITY[l.b].name}),'goal');return;}
    const f=[0.6,0.8,0.7][v],dur=2+Math.floor(Math.random()*3);l.loss={until:S.day+dur,f};
    const msg=[N_('failures.a_dirty_connector_on_a_b'),
      N_('failures.microbursts_on_a_b_overflow_shallow'),
      N_('failures.crc_errors_on_a_b_a')][v];
    addInc({type,ref:l.id,until:l.loss.until,msg:tr(msg,{a:CITY[l.a].name,b:CITY[l.b].name}),cost:900,fix:[tr('failures.clean_the_connector'),tr('failures.rate_limit_the_bursts'),tr('failures.swap_the_optic')][v]},msg);
  }else if(type==='pmtud'){
    const top=NETS.filter(n=>(R.demTo[n.id]||0)>0.5).sort((a,b)=>(R.demTo[b.id]||0)-(R.demTo[a.id]||0)).slice(0,8),n=pick(top.length?top:NETS),dur=2+Math.floor(Math.random()*3);
    S.ev.pmtud={net:n.id,until:S.day+dur,f:0.6};
    const msg=hasScrub()&&Math.random()<0.5?N_('failures.your_scrubbing_center_returns_clean')
      :pick([N_('failures.someone_filtered_all_icmp_on_your'),
        N_('failures.a_pppoe_hop_shaved_8_bytes')]);
    addInc({type,ref:n.id,until:S.ev.pmtud.until,msg:tr(msg,{net:n.name}),cost:500,fix:tr('failures.clamp_the_mss_to_1360')},msg);
  }else if(type==='mtu'){
    const l=pick(live);l.deg=S.day+3;addInc({type,ref:l.id,until:l.deg,msg:tr('failures.mtu_mismatch_on_a_b_jumbo',{a:CITY[l.a].name,b:CITY[l.b].name}),cost:800,fix:tr('failures.set_mtu_9216_everywhere')});
  }else if(type==='oops'||type==='cleaner'){
    const c=pick(Object.keys(S.pops)),pp=S.pops[c],C=CITY[c].name;
    if(type==='cleaner'&&pp.site2&&(pp.routers||1)<2){S.stats.survived++;addInc({type:'site',ref:c,site:'a',until:S.day+1,msg:tr('failures.the_cleaner_unplugged_everything_at',{siteA:siteName(c,'a')}),cost:0});toast(tr('failures.vacuum_incident_in_city_the_cleaner',{city:C,siteA:esc(siteName(c,'a')),siteB:esc(siteName(c,'b'))}),'good');sfx('alert');return;}
    if(type==='cleaner'&&(pp.routers||1)>=2){S.stats.incidents++;S.stats.survived++;toast(tr('failures.vacuum_incident_in_city_the_cleaner_47e0',{city:C,dc:siteName(c,'a')}),'good');sfx('alert');return;}
    pp.down=Math.max(pp.down||0,S.day+1);
    const msg=type==='cleaner'?tr('failures.the_cleaner_at_dc_unplugged_your',{dc:siteName(c,'a')}):pick([tr('failures.your_on_call_engineer_typed_clear',{city:C}),tr('failures.an_intern_pushed_an_acl_in',{city:C}),tr('failures.someone_ran_reload_on_the_city',{city:C}),tr('failures.a_config_template_rendered_router_id',{city:C}),tr('failures.someone_committed_a_config_in_city',{city:C}),tr('failures.someone_deployed_to_city_on_a',{city:C}),tr('failures.a_cosmic_ray_flipped_a_bit',{city:C}),tr('failures.an_automation_script_in_city_ran',{city:C})]);
    addInc({type,ref:c,until:pp.down,msg:msg+(type==='oops'&&(pp.routers||1)>=2?' '+tr('failures.automation_pushed_it_to_every_router'):''),cost:1500,fix:type==='oops'?tr('failures.roll_back_the_config'):tr('failures.hide_the_vacuum')});
  }else if(type==='prepend'){
    const t=pick(S.transit);t.down=Math.max(t.down||0,S.day+2);addInc({type,ref:t.id,until:t.down,msg:tr('failures.net_fat_fingered_a_route_map',{net:NET[t.net].name,n:30+Math.floor(Math.random()*60),city:CITY[t.city].name}),cost:0});
  }else if(type==='rpki'){
    S.ev.rpki={until:S.day+3,nets:NETS.map(n=>n.id).filter(()=>Math.random()<0.5)};addInc({type,ref:'rpki',until:S.day+3,msg:tr('failures.your_roa_expired_over_the_weekend'),cost:1000,fix:tr('failures.renew_the_roa')});
  }else if(type==='amp'||type==='roadmff'){
    const l=pick(lit),A=CITY[l.a].name,B=CITY[l.b].name,dur=type==='roadmff'?1:(l.spares?1:2+Math.floor(Math.random()*3));l.eqDown=S.day+dur;
    const msg=type==='roadmff'?tr('failures.you_fat_fingered_the_channel_plan',{a:A,b:B}):pick([tr('failures.an_in_line_amplifier_hut_between',{a:A,b:B}),tr('failures.someone_stole_the_copper_grounding',{a:A,b:B}),tr('failures.a_firmware_bug_in_the_sys',{sys:DF_SYS[l.sys].n,a:A}),tr('failures.lightning_hit_an_amp_site_on',{a:A,b:B})]);
    addInc({type,ref:l.id,until:l.eqDown,msg:msg+(type==='amp'&&l.spares?' '+tr('failures.your_spares_kit_gets_it_back'):''),cost:type==='amp'&&!l.spares?AMP_COST:0,fix:tr('failures.truck_a_spare_amp_out')});
  }else if(type==='optic'){
    const l=pick(lit),A=CITY[l.a].name,B=CITY[l.b].name,o=pick(l.ch),dur=l.spares?1:4;l.chFail={n:1,o,until:S.day+dur};
    addInc({type,ref:l.id,until:S.day+dur,msg:pick([tr('failures.a_optic_on_a_b_overheated',{optic:OPT[o].n,a:A,b:B}),tr('failures.the_laser_in_a_optic_on',{optic:OPT[o].n,a:A,b:B}),tr('failures.a_optic_on_a_b_started',{optic:OPT[o].n,a:A,b:B})])+(l.spares?' '+tr('failures.swapped_from_your_spares_kit_by'):''),cost:l.spares?0:OPT[o].cost,fix:tr('failures.buy_a_replacement')});
  }else if(type==='cut'){
    const mon=Math.floor((S.day%365)/30.42),monsoon=mon>=5&&mon<=8,tw=x=>(x.sub&&(x.a==='tpe'||x.b==='tpe'||(x.cable&&CAB[x.cable].anchor)))||(scnRule('anchors')&&anchorProne(x)),vn=x=>x.sub&&(x.a==='sgn'||x.b==='sgn'),inl=x=>!x.sub&&(CITY[x.a].india||CITY[x.b].india);
    const pool=only&&scnRule('anchors')?live.filter(anchorProne):live;if(!pool.length)return;const l=pick(pool.flatMap(x=>{const w=(x.cable&&CAB[x.cable].age==='old'?3:1)*(x.cable&&CAB[x.cable].fragile?3:1)*(tw(x)?4*(scnRule('anchors')?3:1):1)*(scnRule('sharks')&&x.sub?2:1)*(vn(x)?3:1)*(!x.sub&&andesPair(x.a,x.b)?4:1)*(monsoon&&inl(x)?3:1)*(x.sub&&(x.a==='oos'||x.b==='oos')?3:1);return Array(w).fill(x);})),dur=10+Math.floor(Math.random()*8),trc=l.trench||l.id,hit=S.links.filter(x=>(x.trench||x.id)===trc);hit.forEach(x=>x.cut=Math.max(x.cut||0,S.day+dur));
    const A=CITY[l.a].name,B=CITY[l.b].name,au=CITY[l.a].au&&CITY[l.b].au,auSummer=mon>=11||mon<=1;
    const en=l.sub&&(CITY[l.a].au||CITY[l.b].au)&&!(l.cable&&CAB[l.cable].fragile)&&Math.random()<0.35?pick([N_('failures.box_jellyfish_season_at_the_a'),N_('failures.a_great_white_took_an_interest')]):l.cable&&CAB[l.cable].fragile&&Math.random()<0.8?pick([N_('failures.your_a_b_cable_is_cut'),N_('failures.a_b_is_down_same_cable')]):!l.sub&&CITY[l.a].land==='nzs'&&CITY[l.b].land==='nzs'&&Math.random()<0.75?pick([N_('failures.a_kea_pulled_the_rubber_seals'),N_('failures.the_sandflies_drove_your_splicing'),N_('failures.a_farmer_s_post_hole_digger')]):l.cable==='cook'&&Math.random()<0.6?N_('failures.a_ferry_dropped_anchor_in_cook'):!l.sub&&au&&Math.random()<0.75?pick([N_('failures.a_sulphur_crested_cockatoo_chewed'),N_('failures.a_kangaroo_hit_the_fiber_hut'),N_('failures.thieves_dug_up_your_a_b'),N_('failures.a_kilometre_of_copper_went_missing'),N_('failures.a_backhoe_putting_in_a_new'),N_('failures.the_emus_won_again_a_mob'),N_('failures.a_kangaroo_boxed_your_field_tech'),N_('failures.a_drop_bear_fell_on_the'),N_('failures.an_eastern_brown_snake_moved_into'),...((S.day%365)/30.42>=8&&(S.day%365)/30.42<11?[N_('failures.magpie_swooping_season_the_field')]:[]),...(auSummer?[N_('failures.bushfire_season_the_fiber_along_a')]:[]),...(nullPair(l.a,l.b)?[N_('failures.your_a_b_fiber_broke_somewhere')]:[])]):l.sub&&(l.a==='bda'||l.b==='bda')&&Math.random()<0.7?pick([N_('failures.your_a_b_cable_went_quiet'),N_('failures.the_repair_ship_s_compass_spun')]):l.sub&&(l.a==='tbu'||l.b==='tbu')&&Math.random()<0.7?pick([N_('failures.an_undersea_volcano_erupted_next_to'),N_('failures.the_seabed_off_tonga_slid_down')]):vn(l)&&Math.random()<0.8?pick([N_('failures.another_of_vietnam_s_subsea_cables'),N_('failures.your_a_b_cable_broke_in')]):!l.sub&&(l.a==='drw'||l.b==='drw')&&Math.random()<0.7?pick([N_('failures.a_crocodile_took_a_bite_out'),N_('failures.termites_ate_the_duct_on_a')]):tw(l)&&Math.random()<0.8?pick([N_('failures.a_cargo_ship_forgot_to_raise'),N_('failures.another_anchor_another_cut_your_a'),N_('failures.a_fishing_boat_with_an_unusually')]):l.sub&&(l.a==='oos'||l.b==='oos')&&Math.random()<0.8?pick([N_('failures.a_trawler_off_ostend_dragged_its'),N_('failures.a_wind_farm_service_vessel_dropped')]):!l.sub&&(CITY[l.a].ca||CITY[l.b].ca)&&Math.random()<0.4?pick([N_('failures.a_beaver_chewed_through_your_a'),N_('failures.your_a_b_fiber_is_down'),N_('failures.frost_heave_cracked_the_duct_on')]):!l.sub&&andesPair(l.a,l.b)?pick([N_('failures.a_landslide_in_the_andes_buried'),N_('failures.snow_closed_the_mountain_pass_and'),N_('failures.an_earthquake_shook_your_a_b'),N_('failures.a_llama_herd_trampled_the_fiber')]):!l.sub&&(CITY[l.a].india||CITY[l.b].india)?pick([N_('failures.road_widening_near_a_cut_your'),N_('failures.the_monsoon_flooded_a_manhole_on'),N_('failures.a_digger_found_your_a_b')]):l.sub?pick([N_('failures.a_curious_shark_bit_your_subsea'),N_('failures.a_ship_dragged_its_anchor_across'),N_('failures.an_undersea_landslide_snapped_a_b')]):pick([N_('failures.a_backhoe_found_your_fiber_between'),N_('failures.squirrels_chewed_through_a_b_they'),N_('failures.road_works_cut_a_b_nobody')]);
    addInc({type,ref:trc,until:S.day+dur,msg:tr(en,{a:A,b:B})+(hit.length>1?' '+tr('failures.all_n_links_in_that_trench',{n:hit.length}):''),cost:Math.max(4000,Math.round(hit.reduce((a,x)=>a+x.mo,0)*0.5))},en);
  }else if(type==='crash'||type==='power'){
    const c=pick(Object.keys(S.pops).flatMap(x=>type==='power'&&(CITY[x].za||CITY[x].blackout)?[x,x,x]:type==='crash'&&RG[S.pops[x].rgen||0].flaky?[x,x,x]:[x])),pp=S.pops[c],slow=slowBoot(c),dur=(type==='crash'?2+Math.floor(Math.random()*2):3+Math.floor(Math.random()*3))*(type==='crash'&&S.ev.sanction>S.day?2:1)+(slow?2+Math.floor(Math.random()*3):0);
    if(type==='crash'&&(pp.routers||1)>=2){pp.rdown=S.day+dur;S.stats.incidents++;S.stats.survived++;toast(tr('failures.router_crash_in_city_one_router',{city:CITY[c].name,slow:slow?' '+tr('failures.the_crashed_one_what',{what:esc(pick(SLOW_BOOT))}):'',d:dur}),'good');sfx('alert');return;}
    if(type==='power'&&!pp.gen&&pp.site2){const sd=Math.random()<0.5?'a':'b';addInc({type:'site',ref:c,site:sd,until:S.day+dur,msg:(CITY[c].za?tr('failures.load_shedding_took_out_site_in',{site:siteName(c,sd),city:CITY[c].name,other:siteName(c,sd==='a'?'b':'a')}):tr('failures.a_power_cut_took_out_site',{site:siteName(c,sd),city:CITY[c].name,other:siteName(c,sd==='a'?'b':'a')})),cost:5000,fix:tr('incidents.rent_a_generator')});S.stats.survived++;return;}
    if(type==='power'&&pp.gen&&CITY[c].blackout){S.stats.incidents++;S.stats.survived++;S.stats.shed=(S.stats.shed||0)+1;toast(tr('failures.blackout_in_city_the_grid_went',{city:CITY[c].name}),'good');sfx('alert');return;}
    if(type==='power'&&pp.gen){S.stats.incidents++;S.stats.survived++;if(CITY[c].za)S.stats.shed=(S.stats.shed||0)+1;toast(CITY[c].za?tr('failures.load_shedding_in_city_stage_n',{city:CITY[c].name,n:2+Math.floor(Math.random()*5)}):tr('failures.power_cut_in_city_your_backup',{city:CITY[c].name}),'good');sfx('alert');return;}
    pp.down=Math.max(pp.down||0,S.day+dur);
    const auc=CITY[c].au&&Math.random()<0.5,msg=type==='power'&&c==='ivc'&&Math.random()<0.6?tr('failures.the_smelter_at_tiwai_point_pulled',{city:CITY[c].name}):type==='crash'&&auc&&!slow?pick([tr('failures.a_routine_overnight_upgrade_took',{city:CITY[c].name}),tr('failures.a_huntsman_spider_the_size_of',{city:CITY[c].name}),tr('failures.a_new_tech_in_city_used',{city:CITY[c].name}),tr('failures.a_visiting_engineer_from_london',{city:CITY[c].name})]):type==='power'&&auc&&!CITY[c].blackout?((S.day%365)/30.42>=11||(S.day%365)/30.42<2?tr('failures.a_45_c_heatwave_in_city',{city:CITY[c].name,dc:siteName(c,'a')}):(c==='bne'&&Math.random()<0.6?tr('failures.the_four_o_clock_storm_rolled',{dc:siteName(c,'a')}):tr('failures.a_possum_got_into_the_substation',{city:CITY[c].name,dc:siteName(c,'a')}))):type==='crash'?(slow?tr('failures.your_router_in_city_crashed_and',{city:CITY[c].name,what:pick(SLOW_BOOT),min:bootMin(c),n:2+Math.floor(Math.random()*5)}):pick([tr('failures.your_router_in_city_crashed_kernel',{city:CITY[c].name}),tr('failures.a_firmware_update_bricked_your',{city:CITY[c].name})])):CITY[c].blackout?tr('failures.a_blackout_hit_city_and_your',{city:CITY[c].name}):CITY[c].za?tr('failures.load_shedding_stage_n_in_city',{n:3+Math.floor(Math.random()*4),city:CITY[c].name}):tr('failures.power_outage_at_dc_in_city',{dc:siteName(c,'a'),city:CITY[c].name});
    addInc({type,ref:c,until:S.pops[c].down,msg,slow:type==='crash'&&slow,cost:type==='crash'?2500:7000,fix:type==='crash'?(slow?tr('failures.turn_it_off_and_on_again'):tr('failures.turn_it_off_and_on_again_0872')):tr('incidents.rent_a_generator')});
  }else if(type==='transit'){
    const t=pick(S.transit.filter(t=>!(t.down>S.day)));t.down=S.day+3+Math.floor(Math.random()*3);
    addInc({type,ref:t.id,until:t.down,msg:tr('failures.net_is_having_an_outage_in',{net:NET[t.net].name,city:CITY[t.city].name}),cost:0});
  }else if(type==='ixloop'){
    const c=pick(Object.keys(S.ixp));S.ev.ixdown=S.ev.ixdown||{};S.ev.ixdown[c]=Math.max(S.ev.ixdown[c]||0,S.day+2+Math.floor(Math.random()*2));
    addInc({type,ref:c,until:S.ev.ixdown[c],msg:tr('failures.someone_plugged_a_loop_into_the',{ix:ixName(c)}),cost:0});
  }else if(type==='leak'){
    const n=pick(['nfx','ggl','fbk','amz','msf']);S.ev.leak={net:n,until:S.day+4};
    addInc({type,ref:n,until:S.day+4,msg:tr('failures.bgp_route_leak_a_small_isp',{net:NET[n].name}),cost:0});
  }else if(type==='fabric'){
    const f=pick(fabsUsed);S.ev.fab=S.ev.fab||{};S.ev.fab[f]=S.day+2+Math.floor(Math.random()*3);
    addInc({type,ref:f,until:S.ev.fab[f],msg:tr('failures.fabric_is_having_a_bad_day',{fabric:FAB[f].name}),cost:0});
  }else if(type==='ddos'){ddosAttack();return;
  }
  compute();
  const last=S.inc[S.inc.length-1];
  last.impact=Math.max(0,before-R.served);
  if(before>1&&last.impact<before*0.03&&type!=='ddos'){S.stats.survived++;toast(`<b>${incTitle(type)}</b><br>${esc(last.msg)} ${tr('failures.traffic_rerouted_customers_barely')}`,'good',[],incOpen(last));}
  else{const paused=pref('pauseIncident')&&autoPause();toast(`<b>${incTitle(type)}</b><br>${esc(last.msg)}${paused?`<br><b>${tr('common.game_paused')}</b>`:''}`,'bad',(last.cost?[{l:`${last.fix||tr('common.rush_repair')} ${fmt$(last.cost)}`,act:'fixInc',args:{id:last.id}}]:[]).concat(paused?[resumeAct()]:[]),incOpen(last));}
  sfx('alert');
}
const gamingCount=()=>S.biz.reduce((n,b)=>n+(BIZ_T[b.type]?.gaming?1:0),0);
const ddosVectors=()=>Object.keys(DDOS_VEC).filter(k=>!DDOS_VEC[k].gaming||gamingCount()>0);
// Expected starts per week in normal play; the rolling 14-start limit is a separate ceiling.
// Spread gaming exposure over dozens of customers, including the first, rather than switching baselines.
const ddosRate=()=>0.5+6.5*(1-Math.exp(-gamingCount()/50*(1+Math.max(1,S.lvl||1)/LEVELS.length)));
const ddosPressure=()=>1-Math.exp(-(.01+Math.max(0,(S.lvl||1)-1)/12+gamingCount()/10+(scnRule('ddos')?.2+S.day/365:0)));
// Normalize the vector mix so smaller gaming-only floods do not lower the advertised overall mean (Flood Season sizes its own).
function ddosSizeMean(){const stage=Math.max(1,S.lvl||1)/LEVELS.length,games=gamingCount();
  const base=Math.max(10,(R.demand||0)*4/3*stage);
  // Relative to no gaming: 3x at one customer, 8x at 50, approaching the existing 12x balance.
  const mean=base*(games?1.2-0.9*Math.pow(4/9,(games-1)/49):0.1),vectors=ddosVectors(),weight=vectors.reduce((n,k)=>n+(DDOS_VEC[k].gaming?1/3:1),0)/vectors.length;
  return mean/weight;}
// Normal rolls: 98% uniform 0.2–2, 2% uniform 8–12. Their mean is 1.278, so spikes do not inflate the balance.
const ddosSizeMax=()=>ddosSizeMean()*12/1.278;
/* Flood Season (as in 1.36): a third are terabit monsters, the rest ordinary floods sized to the city; all of it grows
   through the year, and on after it. One draw picks both, so fixed draws give fixed sizes. */
function ddosSize(vec,c){const fl=scnRule('ddos'),r=Math.random();
  if(fl){const games=gamingCount(),grow=(1+S.day/365)*(1+0.2*games/(games+10))*(DDOS_VEC[vec].gaming?1/3:1);
    const raw=r<1/3?800+2600*r*3:2+(r-1/3)*1.5*Math.max(18,((R.cityDem||{})[c]||0)*0.9);return Math.max(2,Math.floor(raw*grow));}
  const roll=(r<.98?.2+1.8*r/.98:8+4*(r-.98)/.02)/12,raw=ddosSizeMax()*(DDOS_VEC[vec].gaming?1/3:1)*roll;
  return Math.max(0.001,Math.floor(raw*1000)/1000);}
// Calm (Change Freeze) and no chaos at all mean no attacks, gamers or not.
const ddosOff=()=>{const c=rule('chaos');return c==='calm'||c==='none';};
// More frequent attacks are opt-in: the spicy chaos setting, or hosting gamers (who attract them in real life).
// Outside Flood Season, only gamers move attacks onto ddosTick's daily schedule; spicy alone doubles the usual one.
const ddosSpicy=()=>!ddosOff()&&(rule('chaos')==='spicy'||gamingCount()>0);
function ddosTick(){if(ddosOff()&&!scnRule('ddos'))return;if(scnRule('ddos')){let next=+S.scn.nextDdos||3,n=0;
    // Unless spicy, floods take turns as they always did: the next one waits until the last is over.
    if(!ddosSpicy()&&ddosAll().length)return;
    while(S.day>=next&&n++<2){ddosAttack(false);next+=floodGap();}S.scn.nextDdos=next<S.day?S.day+floodGap():next;}
  else if(!ddosOff()&&gamingCount())for(let i=0;i<2;i++)if(Math.random()<ddosRate()/14)ddosAttack(false);}
// Size, duration and starts are randomized independently; overlapping floods never replace each other.
function ddosAttack(recompute=true){const type='ddos',fl=scnRule('ddos');ddosExpire();
    S.ddosStarts=(S.ddosStarts||[]).filter(d=>d>S.day-7&&d<=S.day);if(S.ddosStarts.length>=14||!Object.keys(S.pops).length)return;S.ddosStarts.push(S.day);
    // Flood Season goes for the POPs that serve someone, so empty ones cannot soak up floods for a free win.
    const all=Object.keys(S.pops),served=fl?all.filter(x=>(R.cityDem||{})[x]>1e-6):[];
    const c=pick(served.length?served:all),vec=pick(ddosVectors()),V=DDOS_VEC[vec];
    const gbps=ddosSize(vec,c);
    const dur=1+Math.floor(Math.random()*(1+6*ddosPressure())),entry=ddosEntry(c);
    const a={id:uid(),city:c,vec,gbps,until:S.day+dur,entry,bh:false,start:S.day};
    if(!S.ev.ddos)S.ev.ddos=a;else(S.ev.ddosMore||(S.ev.ddosMore=[])).push(a);
    const soaked=(V.fs&&fsAt(c))||hasScrub();
    const how=entry&&entry.lab?tr('failures.in_via_e',{e:entry.lab}):'';
    const msg=tr('failures.a_size_vec_attack_is_hitting',{size:fmtG(gbps),vec:V.n,city:CITY[c].name,how})+' '+(soaked?tr('failures.your_mitigation_is_eating_most_of'):tr('failures.junk_traffic_is_eating_your_capacity'));
    if(fl)a.who=pick(FLOOD_WHO);
    addInc({type,ref:c,atk:a.id,until:S.day+dur,msg:fl?msg+' '+tr('failures.attacker_who',{who:tr(a.who)}):msg,cost:0});
    if(soaked){S.stats.survived++;S.stats.ddosHeld=(S.stats.ddosHeld||0)+1;if(gbps>=1000)S.stats.ddosMonster=(S.stats.ddosMonster||0)+1;}
    if(recompute){compute();a.worst=ddosSf(a);}
    toast(`<b>${incTitle('ddos')}: ${esc(CITY[c].name)}</b><br>${esc(msg)}${fl?`<br><i>${esc(tr('failures.attacker_who',{who:tr(a.who)}))}</i>`:''}`,soaked?'goal':'bad',[{l:tr('common.open_noc'),act:'leftTab',args:{t:'noc'}}],{a:'city',v:c});
    sfx('alert');}
// When an attack is over: was it held? Held means the city under attack got at least 97% of its traffic every day.
function ddosDone(a){if(!a||a.done)return;a.done=1;if(a.worst===undefined&&S.pops[a.city])a.worst=ddosSf(a);const ok=(a.worst===undefined?1:a.worst)>=0.97;
  // In Flood Season a terabit flood counts only when scrubbing or Flowspec took it: spare exits held some by luck (playtest).
  if(ok){S.stats.ddosOk=(S.stats.ddosOk||0)+1;if(a.gbps>=1000&&(!scnRule('ddos')||hasScrub()||(DDOS_VEC[a.vec]&&DDOS_VEC[a.vec].fs&&fsAt(a.city))))S.stats.ddosOkBig=(S.stats.ddosOkBig||0)+1;}else S.stats.ddosLost=(S.stats.ddosLost||0)+1;
  if(scnRule('ddos')){const w=tr(FLOOD_WHO.includes(a.who)?a.who:FLOOD_WHO[0]),who=esc(w.charAt(0).toUpperCase()+w.slice(1));toast(ok?tr('failures.flood_held_g_who_gave_up',{g:fmtG(a.gbps),who}):tr('failures.that_one_got_through_g_city',{g:fmtG(a.gbps),city:esc(CITY[a.city]?CITY[a.city].name:tr('common.your_network')),p:pct(a.worst||0),who:esc(w)}),ok?'goal':'bad');}}
// Flood Season: 3 to 7 days apart as before, shrinking with age, level and gamers only when attacks are spicy.
const floodGap=()=>!ddosSpicy()?3+Math.floor(Math.random()*5):Math.max(0.05,(3+Math.random()*5)/(Math.sqrt(1+S.day/180)*(1+gamingCount()/10+Math.max(0,(S.lvl||1)-1)/12)));
const FLOOD_WHO=[N_('failures.a_botnet_of_40_000_smart'),N_('failures.every_unpatched_baby_monitor_in'),N_('failures.a_gaming_clan_that_lost_one'),N_('failures.a_fridge_that_achieved_sentience_and'),N_('failures.a_crypto_bro_shorting_your_stock'),N_('failures.a_teenager_with_a_stolen_credit'),N_('failures.a_rival_isp_s_stress_test'),N_('failures.ten_thousand_smart_light_bulbs'),N_('failures.a_printer_just_one_printer_nobody'),N_('failures.a_botnet_run_from_a_cloud'),N_('failures.somebody_who_did_not_like_your'),N_('failures.the_internet_connected_kettles_of_a')];
function incTitle(t){return {ring:tr('failures.metro_ring_cut'),site:tr('common.site_outage'),cut:tr('common.fiber_cut'),crash:tr('common.router_crash'),power:tr('common.power_outage'),transit:tr('common.upstream_outage'),ixloop:tr('common.ix_meltdown'),leak:tr('common.route_leak'),ddos:tr('common.ddos_attack'),fabric:tr('common.fabric_outage'),depeer:tr('common.peering_spat'),fatwave:tr('failures.fat_fingered_wave'),label:tr('failures.patch_panel_mishap'),interop:tr('core.interop_failure'),mtu:tr('common.mtu_mismatch'),krroute:tr('failures.rerouted_via_hong_kong'),ctrlplane:tr('failures.control_plane_meltdown'),lacp:tr('common.lacp_trouble'),loss:tr('common.packet_loss'),pmtud:tr('failures.pmtud_black_hole'),oops:tr('common.oops'),cleaner:tr('common.vacuum_incident'),prepend:tr('common.prepend_ageddon'),rpki:tr('common.rpki_invalid'),amp:tr('common.amplifier_failure'),roadmff:tr('failures.fat_fingered_roadm'),optic:tr('common.dead_optic'),maint:tr('common.maintenance_window_3a92'),ac:tr('common.cooling_failure'),hijack:tr('common.bgp_hijack'),shutdown:tr('common.government_shutdown'),redsea:tr('failures.geopolitical_cable_cut')}[t]||tr('common.incident');}
const LINKCUT_TR=['cut','redsea'],LINKCUT_ID=['fatwave','label','interop'],POPDOWN=['crash','power','oops','cleaner','maint','shutdown'],IXDOWN=['ixloop'],TDOWN=['transit','prepend'],LINKEQ=['mtu','amp','roadmff','optic'];
function remainUntil(pred){let u=0;for(const x of S.inc)if(pred(x))u=Math.max(u,x.until);return u;}
// Remove an incident, then restore each affected thing to whatever other incidents still hold it down.
function clearInc(i){
  S.inc=S.inc.filter(x=>x!==i);const T=i.type;
  if(LINKCUT_TR.includes(T)||LINKCUT_ID.includes(T)){const ls=LINKCUT_TR.includes(T)?S.links.filter(l=>(l.trench||l.id)===i.ref):S.links.filter(l=>l.id===i.ref);
    for(const l of ls)l.cut=remainUntil(x=>(LINKCUT_TR.includes(x.type)&&x.ref===(l.trench||l.id))||(LINKCUT_ID.includes(x.type)&&x.ref===l.id));}
  else if(POPDOWN.includes(T)){if(S.pops[i.ref])S.pops[i.ref].down=remainUntil(x=>POPDOWN.includes(x.type)&&x.ref===i.ref);}
  else if(IXDOWN.includes(T)){if(S.ev.ixdown)S.ev.ixdown[i.ref]=remainUntil(x=>IXDOWN.includes(x.type)&&x.ref===i.ref);}
  else if(TDOWN.includes(T)){const t=S.transit.find(x=>x.id===i.ref);if(t)t.down=remainUntil(x=>TDOWN.includes(x.type)&&x.ref===i.ref);}
  else if(T==='rpki'||T==='hijack'){if(!S.inc.some(x=>x.type==='rpki'||x.type==='hijack'))S.ev.rpki=null;}
  else if(T==='leak'){S.ev.leak=null;}
  else if(T==='ddos'){const a=ddosAll(S,false).find(a=>i.atk?a.id===i.atk:a.city===i.ref&&(a.start===undefined||a.start===i.start));if(a){ddosDone(a);ddosDrop(a);}}
  else if(T==='fabric'){if(S.ev.fab)S.ev.fab[i.ref]=remainUntil(x=>x.type==='fabric'&&x.ref===i.ref);}
  else if(T==='mtu'){const l=S.links.find(x=>x.id===i.ref);if(l)l.deg=remainUntil(x=>x.type==='mtu'&&x.ref===i.ref);}
  else if(T==='loss'){const l=S.links.find(x=>x.id===i.ref);if(l&&!S.inc.some(x=>x.type==='loss'&&x.ref===i.ref))l.loss=null;}
  else if(T==='lacp'){if(!S.inc.some(x=>x.type==='lacp'&&x.ref===i.ref)){const [k,...r]=String(i.ref).split(':'),id=r.join(':');if(k==='ix'){if(S.ev.ixlacp)delete S.ev.ixlacp[id];}else{const o=(k==='t'?S.transit:S.pni).find(x=>x.id===id);if(o)o.lacp=null;}}}
  else if(T==='ctrlplane'){for(const id of Array.isArray(i.links)?i.links:[]){const l=S.links.find(x=>x.id===id);if(l)l.cut=Math.max(remainUntil(x=>(LINKCUT_TR.includes(x.type)&&x.ref===(l.trench||l.id))||(LINKCUT_ID.includes(x.type)&&x.ref===l.id)||(x.type==='ctrlplane'&&Array.isArray(x.links)&&x.links.includes(l.id))),0);}}
  else if(T==='pmtud'){if(!S.inc.some(x=>x.type==='pmtud'))S.ev.pmtud=null;}
  else if(T==='ring'){if(S.pops[i.ref])S.pops[i.ref].ringcut=remainUntil(x=>x.type==='ring'&&x.ref===i.ref);}
  else if(T==='ac'){if(S.pops[i.ref])S.pops[i.ref].hot=remainUntil(x=>x.type==='ac'&&x.ref===i.ref);}
  else if(T==='amp'||T==='roadmff'){const l=S.links.find(x=>x.id===i.ref);if(l)l.eqDown=remainUntil(x=>(x.type==='amp'||x.type==='roadmff')&&x.ref===i.ref);}
  else if(T==='optic'){const l=S.links.find(x=>x.id===i.ref);if(l&&!S.inc.some(x=>x.type==='optic'&&x.ref===i.ref))l.chFail=null;}
}
function purgeInc(){S.inc=S.inc.filter(i=>{const T=i.type;if(LINKCUT_TR.includes(T))return S.links.some(l=>(l.trench||l.id)===i.ref);if(LINKCUT_ID.includes(T)||LINKEQ.includes(T))return S.links.some(l=>l.id===i.ref);if(TDOWN.includes(T))return S.transit.some(t=>t.id===i.ref);if(IXDOWN.includes(T))return S.ixp[i.ref]!==undefined;if(POPDOWN.includes(T)||T==='ac')return !!S.pops[i.ref];return true;});}
