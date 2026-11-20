/* How to play: the controls, then a glossary of every term as an index of closed topics (two columns of headings; a tap
   opens one) with a search box on top that filters them as you type. One topic per line: [heading, text]. */
const HELP_G=()=>[
 [tr('common.eyeballs'),tr('help.home_broadband_users_they_mostly')],
 ['POP',tr('help.point_of_presence_your_router_in')],
 [tr('common.ip_transit'),tr('help.you_pay_a_bigger_network_per')],
 ['Tier 1 / Tier 2',tr('help.tier_1s_reach_the_whole_internet_cones')],
 ['CDN',tr('help.content_networks_like_netchill_and')],
 [tr('help.ix_internet_exchange'),tr('help.a_shared_switch_in_a_city')],
 ['PNI',tr('help.private_network_interconnect_a_cable')],
 [tr('help.pni_lead_times'),tr('help.a_cross_connect_with_a_small')],
 [tr('common.supply_chain'),tr('help.routers_optics_and_new_builds_get')],
 [tr('common.backhaul_latency'),tr('help.users_feel_the_round_trip_to')],
 [tr('common.peering_policy'),tr('help.every_ix_port_brings_requests')],
 [tr('common.embedded_cache'),tr('help.a_cdn_s_server_in_your')],
 ['DE-KICKS',tr('help.the_group_behind_several_big')],
 [tr('common.remote_peering'),tr('help.reach_an_ix_over_a_fabric')],
 [tr('help.how_other_networks_peer'),tr('help.open_peers_with_anyone_selective')],
 [tr('common.waves'),tr('help.your_fiber_links_are_leased_waves')],
 [tr('common.95th_percentile'),tr('help.transit_bills_sample_your_usage')],
 [tr('common.routers'),tr('help.each_pop_s_router_model_caps')],
 [tr('common.dark_fiber'),tr('help.lease_an_iru_or_build_your')],
 [tr('common.subsea_cables'),tr('help.subsea_waves_can_only_follow_cable')],
 [tr('common.latency'),tr('help.every_link_has_latency_high')],
 [tr('common.noc_dashboard'),tr('help.the_chart_button_or_open_noc_dashboard')],
 [tr('common.asia'),tr('help.a_weird_underserved_market_transit')],
 [tr('common.russia'),tr('help.moscow_needs_a_mandatory_government')],
 [tr('help.events_chains_and_wholesale'),tr('help.event_networks_a_final_a_festival')],
 [tr('common.bank'),tr('help.tap_your_cash_to_open_the')],
 [tr('common.lags'),tr('help.out_of_port_speed_bundle_up')],
 [tr('common.traffic_engineering'),tr('help.tap_a_link_to_see_which')],
 [tr('common.china'),tr('help.mainland_china_needs_a_license_and')],
 [tr('common.weird_requirements'),tr('help.some_customers_come_with_conditions')],
 [tr('common.customer_levels'),tr('help.as_your_peak_traffic_and_footprint')],
 [tr('help.l2vpn_ddos_protection'),tr('help.businesses_may_want_a_private')],
 [tr('common.ddos_attack'),tr('help.ddos_a_flood_comes_from')],
 [tr('common.scrubbing_centers'),tr('help.scrubbing_a_center_pulls_floods')],
 [tr('common.nni_fabrics'),tr('help.megapork_pocketfabric_and')],
 [tr('common.conferences'),tr('help.nanog_ripe_denog_and_friends_come')],
 [tr('common.modes'),tr('help.one_game_four_doors_and_the')],
 [tr('hyper.hyperscaler'),tr('hyper_story.help',{p:pct(HS_EDGE),ct:HS_C9_CT,g:fmtG(HS_C9_BTW)})],
 [tr('common.traceroute'),tr('help.tap_traceroute_on_any_of_your')],
 [tr('common.badges'),tr('help.below_your_goals_sits_a_wall')],
 [tr('common.the_giants'),tr('help.at_customer_level_3_and_4')],
 ['RouteScript',tr('help.rules_for_your_auto_te_controller')+' '+tr('help.once_auto_te_is_installed_you')],
 ['Auto-TE',tr('help.traffic_follows_the_shortest_path_by')],
 [tr('common.metro_diversity'),tr('help.a_pop_is_one_building_until')],
 [tr('common.wave_markets'),tr('help.what_a_wave_costs_depends_on')],
 [tr('common.regional_quirks'),tr('help.in_the_gulf_saudi_pops_need')],
 [tr('common.boot_times'),tr('help.some_routers_take_forever_to_boot')],
 [tr('common.failures'),tr('help.things_break_all_the_time_fiber')],
];
function showHelp(){
  openModal(`<div class="mhead"><div style="display:flex;align-items:center"><h2 class="helph">${tr('help.how_the_internet_works_here')}</h2><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  <input class="t helpq" id="helpQ" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="🔍 ${esc(tr('help.search_transit_ix_lag'))}" aria-label="${esc(tr('help.search_transit_ix_lag'))}" aria-controls="helpGl"></div>
  <p class="tagline" style="margin:6px 0 4px">${tr('help.controls_drag_the_map_or_link')}</p>
  <div class="gl" id="helpGl">${HELP_G().map(([h,t])=>`<details class="gt"><summary>${h}</summary><p>${t}</p></details>`).join('')}</div><p class="meta" id="helpNone" role="status" hidden></p>
<h3 style="margin:16px 0 0">${tr('help.want_to_know_how_it_really')}</h3><div class="menu-plugs three">${[['🌍',HTIW,tr('modal_and_names.how_the_internet_works'),tr('modal_and_names.the_real_thing_follow_a_packet')],['💬',SIGNAL,tr('modal_and_names.join_the_noc_chat'),tr('modal_and_names.our_signal_group_screenshots_chat')],['🐛',ISSUES,tr('modal_and_names.found_a_bug_or_have_an'),tr('modal_and_names.tell_us_on_github_a_short')]].map(([i,u,l,t])=>`<a class="mplug" href="${u}" target="_blank" rel="noopener" title="${esc(t)}"><i aria-hidden="true">${i}</i><span>${l} →</span></a>`).join('')}</div><div class="btns" style="margin-top:14px">${btn(UI.started?tr('common.back_to_the_map'):tr('common.got_it'),'helpClose',{},'big')}${RELEASE_NOTES.length?btn(tr('common.what_s_new_in_v',{v:esc(APP_VERSION)}),'whatsNewShow',{},'ghost'):''}${UI.started&&S&&!S.lost?btn(tr('common.start_a_new_network'),'resetAsk',{},'ghost sm'):''}</div><div class="btns" style="margin-top:6px">${UI.started&&S&&!S.lost?btn(tr('common.export_save'),'exportSave',{},'ghost sm'):''}${btn(tr('common.import_a_save'),'importPick',{},'ghost sm')}${btn(tr('transfer.from_another_device'),'xferRecv',{},'ghost sm')}${btn(tr('common.settings'),'settings',{},'ghost sm')}${fuCan()?btn(tr('mphelp.how_multiplayer_works'),'helpMp',{from:'help'},'ghost sm'):''}${btn(tr('fedui.privacy'),'privacy',{from:'help'},'ghost sm')}${isPhone()?'':btn(tr('keys.keyboard_shortcuts'),'keys',{},'ghost sm')}</div>`);
}
// The search box: hide the topics that match neither in the heading nor in the text; a short list of hits opens itself.
function helpFilter(q){const G=$('helpGl');if(!G)return;q=fold(q);let n=0;const hit=[];
  for(const d of G.children){const ok=!q||fold(d.textContent).includes(q);d.hidden=!ok;if(ok){n++;hit.push(d);}}
  for(const d of hit){if(q&&n<=3){if(!d.open){d.open=true;d.dataset.auto='1';}}else if(d.dataset.auto){d.open=false;delete d.dataset.auto;}}
  const N=$('helpNone');if(N){N.hidden=!!n;N.textContent=n?'':tr('help.no_topic_matches_q',{q:$('helpQ').value.trim()});}}
document.addEventListener('input',e=>{if(e.target.id==='helpQ')helpFilter(e.target.value);});
function showWin(){setTimeout(()=>{const m=$('modalCard');if(m&&!m.querySelector('[data-act=share]'))m.insertAdjacentHTML('beforeend',`<div class="btns" style="margin-top:8px">${btn(tr('help.share_my_network'),'share',{},'pink')}</div><p class="meta" style="margin:12px 0 0">${tr('help.you_built_a_cartoon_internet_now')}</p>${plugHtml(true)}`);},0);openModal(`<h1 style="font-family:var(--display);font-size:44px;margin:0">${tr('help.you_re_a_tier_1')}</h1><p class="tagline">${tr('help.name_as_asn_is_transit_free',{name:esc(S.name),asn:S.asn,days:S.day,n:S.stats.incidents})}</p>${btn(tr('common.keep_building'),'keepPlaying',{},'pink big')}`);sfx('coin');}
function showLose(){openModal(`<h1 style="font-family:var(--display);font-size:40px;margin:0">${tr('common.bankrupt')}</h1><p class="tagline">${tr('help.the_bank_repossessed_your_routers',{name:esc(S.name),days:S.day,peak:fmtG(S.stats.peak)})}</p>${btn(tr('common.try_again'),'newgame',{},'pink big')}`);if(UI.slot){const id=UI.slot;slotDrop(id);slotFree(id);}}
