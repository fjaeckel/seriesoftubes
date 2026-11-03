/* ---------- Routing & DDoS: one modal for the network-wide settings ----------
   The backbone, Auto-TE and DDoS automation used to sit at the bottom of the NOC tab, below every incident and
   the log, where nobody found them. A button at the top of the NOC tab opens them here. */
// Auto-TE: paused, installed or for sale.
function tePanel(){
  return S.te&&!coreTE()?`<div class="kv"><span>Auto-TE</span><b>${tr('core.paused')}</b></div><p class="why">${tr('core.auto_te_is_paused_it_needs')}</p>`:S.te?`<div class="kv"><span>Auto-TE</span><b>${S.te.on?tr('hud_and_panels.on_moving_g_onto_alternate_paths',{g:fmtG(R.teMoved||0)}):tr('common.off')}</b></div><div class="btns">${btn(S.te.on?tr('hud_and_panels.turn_auto_te_off'):tr('hud_and_panels.turn_auto_te_on'),'teToggle',{},'ghost sm')}${btn(S.te.script?tr('common.edit_routescript'):tr('hud_and_panels.write_a_routescript'),'teEdit',{},'pink sm')}</div>${S.te.script?`<p class="meta" style="margin:2px 0 6px">RouteScript: ${teRules()?tr('hud_and_panels.n_rules_live',{n:teRules().n}):S.te.on?tr('hud_and_panels.has_errors_not_running'):tr('common.controller_off')}${R.teBlack?` · ${tr('hud_and_panels.blackholing_g',{g:fmtG(R.teBlack)})}`:''}</p>`:''}`
      :`<div class="kv"><span>Auto-TE</span><b>${lvl()<3?tr('hud_and_panels.unlocks_at_customer_level_3'):tr('common.not_installed')}</b></div><p class="meta" style="margin:2px 0 6px">${tr('hud_and_panels.traffic_takes_the_shortest_path_even')}</p>${coreTE()?'':`<p class="why">${tr('core.auto_te_needs_an_rsvp_te_or')}</p>`}<div class="btns">${btn(tr('hud_and_panels.install_auto_te_cost_mo_mo',{cost:fmt$(TE_COST),mo:fmt$(TE_MO)}),'buyTE',{},'pink sm',lvl()<3||S.cash<TE_COST||!coreTE())}</div>`;}
// What the modal holds, without its title (scripts/lib/fuzz-page.js reads its buttons too).
function routingBody(){return corePanel()+`<h3 style="font-size:15px;margin:8px 0 4px">${tr('common.traffic_engineering')}</h3>${tePanel()}`
  +`<h3 style="font-size:15px;margin:8px 0 4px">${tr('routing.ddos_defence')}</h3>${ddosSettings()}`;}
function routingModal(){if(!S)return;const card=$('modalCard'),open=!$('modal').hidden&&card.querySelector('[data-routing]'),st=open?card.scrollTop:0;
  let h=`<div data-routing style="display:flex;align-items:center"><div><div class="eyebrow">NOC</div><h2 style="font-size:26px">${tr('routing.routing_and_ddos')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${tr('routing.how_traffic_crosses_your_backbone')}</p>`;
  openModal(h+routingBody());if(open)card.scrollTop=st;}
// Actions taken in the modal re-render the game through after(); this keeps the open modal in step.
function routingRefresh(){if(S&&!$('modal').hidden&&$('modalCard').querySelector('[data-routing]'))routingModal();}
