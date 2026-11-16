/* ================= INSTALL (PWA) ================= */
let installEvt=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;});
addEventListener('appinstalled',()=>{installEvt=null;track('pwa_installed',true);if(UI.pendGame){const p=UI.pendGame;UI.pendGame=null;UI.pitched=true;beginGame(...p);}toast(tr('install.installed_open_series_of_tubes_from'),'good');});
const isStandalone=()=>{try{return navigator.standalone===true||!!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);}catch(e){return false;}};
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
/* The title's install card is a pitch for the first visits; after INSTALL_CARD_N of them, or once it is closed (×), it is one
   line with the same button (Settings always has the card). Counted once per page load; 'x' = closed for good. Storage may be off: then it stays a card. */
const INSTALL_CARD_N=3;let installCard=null;
function installCardOn(){if(installCard==null){installCard=true;try{const v=localStorage.getItem('sot-install-card');if(v==='x')installCard=false;else{const n=(parseInt(v,10)||0)+1;installCard=n<=INSTALL_CARD_N;localStorage.setItem('sot-install-card',String(n));}}catch(e){}}return installCard;}
function installRow(title){if(isStandalone())return '';
  if(title&&!installCardOn())return `<p class="iline"><button class="lnk" data-act="install">📲 ${tr('install.best_played_as_an_app')} →</button></p>`;
  return `<div class="row icard"><div class="grow"><div class="nm">📲 ${tr('install.best_played_as_an_app')}</div><div class="meta">${tr('install.full_screen_works_offline_one_tap')}${isIOS()?' '+tr('install.install_it_before_you_start_a'):''}</div></div>${btn(tr('common.install'),'install',{},'pink sm')}${title?`<button class="x ix" data-act="installHide" aria-label="${tr('common.close')}" title="${tr('common.close')}">×</button>`:''}</div>`;}
/* Phones get a real pitch before a new game: an installed app is full screen, works offline, and on iPhone
   keeps its save away from Safari's clean-ups. Storage is separate on iOS, so installing first matters. */
const SHARE_SVG='<svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path d="M8 1v10M4.5 4.5 8 1l3.5 3.5M5 7H2.5v9.5h11V7H11" fill="none" stroke="#1E2640" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const needPitch=()=>isPhone()&&!isStandalone();
function installSteps(){
  if(isIOS())return `<ol class="isteps"><li>${tr('install.tap_share_icon_in_the_browser',{icon:SHARE_SVG})}</li><li>${tr('install.tap_add_to_home_screen_you')}</li><li>${tr('install.open_series_of_tubes_from_your')}</li></ol>`;
  if(installEvt)return '';
  return `<ol class="isteps"><li>${tr('install.open_your_browser_menu')}</li><li>${tr('install.tap_install_app_or_add_to')}</li><li>${tr('install.open_series_of_tubes_from_your_e03f')}</li></ol>`;}
function pitchHtml(starting){const ios=isIOS();
  return `<div style="display:flex;align-items:center"><div>${starting?`<div class="eyebrow">${tr('install.before_you_start')}</div>`:''}<h2 style="font-size:26px">📲 ${tr('install.play_it_as_an_app')}</h2></div><button class="x" data-act="${starting?'pitchSkip':'closeModal'}" aria-label="${tr('common.close')}">×</button></div>
  <p class="lead" style="margin-top:6px">${tr('install.series_of_tubes_is_made_for')}</p>
  <ul class="pitch"><li>🗺️ <b>${tr('common.full_screen')}</b> ${tr('install.no_browser_bars_a_lot_more')}</li><li>📶 <b>${tr('common.works_offline')}</b> ${tr('install.build_your_backbone_on_the_train')}</li>${ios?`<li>💾 <b>${tr('install.your_save_stays_safe')}</b> ${tr('install.safari_can_clear_the_data_of')}</li><li class="warn">⚠️ <b>${tr('common.install_first')}</b> ${tr('install.on_iphone_a_game_started_in')}</li>`:`<li>⚡ <b>${tr('install.one_tap_away')}</b> ${tr('install.it_opens_straight_into_your_network')}</li>`}</ul>
  ${installSteps()}
  <div class="btns cta" style="margin-top:12px">${installEvt?btn(tr('install.install_the_app'),'install',{},'pink big'):''}${starting?btn(tr('install.play_in_the_browser_anyway'),'pitchSkip',{},installEvt?'ghost':'ghost big'):btn(tr('common.got_it'),'closeModal',{},installEvt?'ghost':'pink')}</div>`;}
if('serviceWorker' in navigator&&location.protocol==='https:'&&!IS_DEV)addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});
