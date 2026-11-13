/* ================= HELP: MULTIPLAYER AND PRIVACY =================
   Two short sheets: how multiplayer works (from How to play and the multiplayer sheet) and what the game keeps and
   sends (from Settings, How to play and the multiplayer sheet). Plain text by label, no request: the web page
   (site/privacy.html) is only a link. Back returns to the sheet it came from (ACT.infoBack, 89-help-privacy.js). */
FU_NOS.push('helpMp','privacy','infoBack','infoClose');// they work from the title screen's help and Settings too
const infoHead=(eyebrow,title)=>`<div style="display:flex;align-items:center;gap:8px"><button class="x" data-act="infoBack" aria-label="${tr('common.back')}">‹</button><div class="grow" style="min-width:0"><div class="eyebrow">${eyebrow}</div><h2 style="font-size:24px">${title}</h2></div><button class="x" data-act="infoClose" aria-label="${tr('common.close')}">×</button></div>`;
const infoSecs=s=>s.map(([h,p])=>`<h3 class="sub4">${h}</h3><p>${p}</p>`).join('');
function showMpHelp(){openModal(`<div class="info" data-info="mp">${infoHead(fuIcon()+' '+tr('fedui.multiplayer'),tr('mphelp.how_multiplayer_works'))}
  <p class="tagline">${tr('mphelp.multiplayer_puts_other_people_s')}</p>${infoSecs([
  [tr('mphelp.joining'),tr('mphelp.switch_on_play_with_others')],
  [tr('mphelp.servers_and_operators'),tr('mphelp.servers_are_run_by_players')],
  [tr('mphelp.deals'),tr('mphelp.peer_with_other_players')],
  [tr('mphelp.private_deals'),tr('mphelp.deals_are_sealed_for_the')],
  [tr('fedui.leaderboards'),tr('mphelp.boards_rank_traffic_with_players')],
  [tr('mphelp.newcomers_and_mentors'),tr('mphelp.for_their_first_30_days')],
  [tr('mphelp.muting_reporting_and_exclusion'),tr('mphelp.mute_a_network_and_it')],
  [tr('mphelp.when_a_server_is_down'),tr('mphelp.nothing_breaks_your_game_plays')],
  [tr('fedui.move_to_another_device'),tr('mphelp.your_multiplayer_identity_is_a')]])}
  <div class="btns" style="margin-top:14px">${btn(tr('common.back'),'infoBack',{},'pink')}${btn(tr('fedui.privacy'),'privacy',{from:'mp'},'ghost sm')}</div></div>`);}
function showPrivacy(){openModal(`<div class="info" data-info="privacy">${infoHead('🔒 '+tr('fedui.privacy'),tr('privacy.what_the_game_keeps_and'))}
  <p class="tagline">${tr('privacy.no_account_no_email_no')}</p>${infoSecs([
  [tr('privacy.on_this_device'),tr('privacy.your_saves_settings_and_badges')],
  [tr('privacy.when_you_join_a_server'),tr('privacy.your_game_sends_signed_records')],
  [tr('privacy.while_you_play'),tr('privacy.your_current_numbers_every_10')],
  [tr('privacy.what_servers_keep'),tr('privacy.traffic_numbers_for_72_hours')],
  [tr('privacy.what_servers_never_keep'),tr('privacy.ip_addresses_or_anything_finer')],
  [tr('privacy.the_visit_counter'),tr('privacy.on_seriesoftub_es_the_page')],
  [tr('privacy.leaving'),tr('privacy.leave_a_server_and_your')]])}
  <p class="meta"><a href="/privacy.html" target="_blank" rel="noopener">${tr('privacy.the_same_on_the_web')}</a></p>
  <div class="btns" style="margin-top:14px">${btn(tr('common.back'),'infoBack',{},'pink')}</div></div>`);}
