// Static markup: elements with data-i18n="label" get their text, and data-i18n-aria-label / data-i18n-title
// their attribute, from the dictionary once at boot. The English stays in the markup for search engines.
function i18nDom(){if(LANG==='en')return;for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=tr(el.dataset.i18n);
  for(const a of ['aria-label','title'])for(const el of document.querySelectorAll(`[data-i18n-${a}]`))el.setAttribute(a,tr(el.getAttribute('data-i18n-'+a)));}
// One button per [value,label] option; the current one is highlighted.
function segBtns(act,cur,opts){return opts.map(([v,l])=>btn(l,act,{v},cur===v?'pink sm':'ghost sm')).join('');}
/* Animation setting: auto follows the system's reduced-motion preference, or force it on or off. */
/* Settings are per device (localStorage), not part of the save: they are about how you like to play. */
const PREF_DEF={pauseFurious:true,warnUnhappy:true,pauseIncident:false,quickPni:false,easyMode:false,richStart:false};
let PREFS=(()=>{try{const j=JSON.parse(localStorage.getItem('sot-prefs')||'{}');return j&&typeof j==='object'?j:{};}catch(e){return {};}})();
const pref=k=>typeof PREFS[k]==='boolean'?PREFS[k]:PREF_DEF[k];
function setPref(k,v){if(!own(PREF_DEF,k))return;PREFS[k]=!!v;try{localStorage.setItem('sot-prefs',JSON.stringify(PREFS));}catch(e){}}
// Apply difficulty pref effects at runtime: quickPni clears pending PNIs from order immediately.
function applyDiffPrefs(){if(!S)return;const qp=pref('quickPni');if(qp){for(const p of S.pni){if(p.ready<=S.day+1){p.ready=S.day;}}}const rs=pref('richStart');if(rs&&S.day===0){S.cash+=START_CASH;}}
// Stop the clock for something the player must see. Nothing happens if the game is already paused.
function autoPause(){if(!S||!UI.speed)return false;UI.resumeSpeed=UI.speed;UI.speed=0;renderHUD();return true;}
const resumeAct=()=>({l:tr('common.resume'),act:'speed',args:{v:UI.resumeSpeed||1}});
function settingsHtml(){const seg=(lab,act,cur,opts,note)=>`<div class="setline"><span>${lab}</span><div class="seg">${segBtns(act,cur,opts)}</div></div>${note?`<p class="meta" style="margin:0 0 6px">${note}</p>`:''}`;
  const onoff=k=>[[k+':1',tr('common.on')],[k+':0',tr('common.off')]],cur=k=>k+':'+(pref(k)?1:0);
  return `<div style="display:flex;align-items:center"><h2 style="font-size:26px">⚙️ ${tr('common.settings')}</h2><button class="x" data-act="settingsClose" aria-label="${tr('common.close')}">×</button></div><p class="tagline">${tr('settings.saved_on_this_device')}</p>
  <h3 class="sub4">${tr('settings.customers_and_alerts')}</h3>
  ${seg(tr('settings.pause_when_a_customer_is_furious'),'prefSet',cur('pauseFurious'),onoff('pauseFurious'),tr('settings.the_game_stops_so_you_can'))}
  ${seg(tr('settings.warn_when_a_customer_gets_unhappy'),'prefSet',cur('warnUnhappy'),onoff('warnUnhappy'),tr('settings.an_early_heads_up_below_60'))}
  ${seg(tr('settings.pause_on_outages_that_hurt'),'prefSet',cur('pauseIncident'),onoff('pauseIncident'),tr('settings.stops_the_game_when_a_failure'))}
  <h3 class="sub4">${tr('settings.display_and_sound')}</h3>
  ${seg(tr('common.animations'),'animSet',UI.anim||'auto',[['auto',tr('common.auto')],['on',tr('common.on')],['off',tr('common.off')]],tr('settings.auto_follows_your_device_s_reduce'))}
  ${seg(tr('common.sound'),'soundSet',UI.muted?'off':'on',[['on',tr('common.on')],['off',tr('common.off')]])}
  ${seg(tr('common.language'),'langSet',LANG,Object.entries(LANGS))}
  ${seg(tr('common.viewport_info'),'vpSet',VP_T?'on':'off',[['on',tr('common.on')],['off',tr('common.off')]],tr('settings.for_reporting_layout_bugs_shows_what'))}
  <h3 class="sub4">${tr('settings.difficulty')}</h3>
  ${seg(tr('settings.quick_pni'),'quickPniSet',cur('quickPni'),onoff('quickPni'),tr('settings.quick_pni_help'))}
  ${seg(tr('settings.easy_mode'),'easyModeSet',cur('easyMode'),onoff('easyMode'),tr('settings.easy_mode_help'))}
  ${seg(tr('settings.rich_start'),'richStartSet',cur('richStart'),onoff('richStart'),tr('settings.rich_start_help'))}
  ${installRow()}<div class="btns" style="margin-top:12px">${btn(tr('common.done_8dd3'),'settingsClose',{},'pink')}</div>`;}
const refreshSettings=()=>{if(UI.setOpen)openModal(settingsHtml());};
function animOn(){const m=UI.anim||'auto';if(m==='on')return true;if(m==='off')return false;try{return !matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return true;}}
function applyAnim(){const r=document.documentElement;r.classList.toggle('no-anim',UI.anim==='off');r.classList.toggle('anim-force',UI.anim==='on');if(!animOn())FLOATS.length=0;}
const toS=(wx,wy,k=0)=>[(wx+k*W-cam.x)*cam.z+CW/2,(wy-cam.y)*cam.z+CH/2];
const iconScale=()=>clamp(Math.sqrt(cam.z),0.7,1.35);
