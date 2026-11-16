// Static markup: elements with data-i18n="label" get their text, and data-i18n-aria-label / data-i18n-title
// their attribute, from the dictionary once at boot. The English stays in the markup for search engines.
function i18nDom(){if(LANG==='en')return;for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=tr(el.dataset.i18n);
  for(const a of ['aria-label','title'])for(const el of document.querySelectorAll(`[data-i18n-${a}]`))el.setAttribute(a,tr(el.getAttribute('data-i18n-'+a)));}
// One button per [value,label] option; the current one is highlighted.
// One dropdown instead of a button per language: the list keeps growing, and on phones the system picker opens.
// Each language is named in itself (lang= lets screen readers say it right).
const langPick=id=>`<select class="pick" id="${id}" data-chg="langSet" aria-label="${tr('common.language')}">${Object.entries(LANGS).map(([v,l])=>`<option value="${v}" lang="${v}"${v===LANG?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
function segBtns(act,cur,opts){return opts.map(([v,l])=>segB(l,act,{v},cur===v)).join('');}
/* Animation setting: auto follows the system's reduced-motion preference, or force it on or off. */
/* Settings are per device (localStorage), not part of the save: they are about how you like to play. */
const PREF_DEF={pauseFurious:true,warnUnhappy:true,pauseIncident:false,quiet:false};
let PREFS=(()=>{try{const j=JSON.parse(localStorage.getItem('sot-prefs')||'{}');return j&&typeof j==='object'?j:{};}catch(e){return {};}})();
const pref=k=>typeof PREFS[k]==='boolean'?PREFS[k]:PREF_DEF[k];
// Quiet notifications: the player's choice once made, until then on in Best Effort only.
const quietOn=()=>typeof PREFS.quiet==='boolean'?PREFS.quiet:rulePreset()==='soft';
function setPref(k,v){if(!own(PREF_DEF,k))return;PREFS[k]=!!v;try{localStorage.setItem('sot-prefs',JSON.stringify(PREFS));}catch(e){}}
// Stop the clock for something the player must see. Nothing happens if the game is already paused, or not the player's.
function autoPause(){if(!S||!UI.speed||UI.clockLocked)return false;UI.resumeSpeed=UI.lastSpeed=UI.speed;UI.speed=0;renderHUD();return true;}
// Space and the phone's play button: pause, or play again at the speed it ran before (#299).
function playPause(){if(pzOn()||UI.clockLocked||(S&&!rule('clock')))return false;if(UI.speed){UI.lastSpeed=UI.speed;UI.speed=0;}else UI.speed=UI.lastSpeed||1;renderHUD();return true;}
// Put the clock back at a speed (a new game, a loaded or resumed one): unless it is locked, then it runs as the lock says.
function setSpeed(v){UI.speed=UI.clockLocked&&HOOKS.speed?HOOKS.speed():v;}
const resumeAct=()=>({l:tr('common.resume'),act:'speed',args:{v:UI.resumeSpeed||1}});
// Settings in sections, one line each: what it is (and a short note under it) on the left, its control on the right.
function settingsHtml(){const seg=(lab,act,cur,opts,note)=>`<div class="setline"><div class="setl"><span>${lab}</span>${note?`<small>${note}</small>`:''}</div><div class="seg">${segBtns(act,cur,opts)}</div></div>`;
  const onoff=k=>[[k+':1',tr('common.on')],[k+':0',tr('common.off')]],cur=k=>k+':'+((k==='quiet'?quietOn():pref(k))?1:0),sec=t=>`<h3 class="sub4 sets">${t}</h3>`;
  return `<div style="display:flex;align-items:center"><h2 style="font-size:26px">⚙️ ${tr('common.settings')}</h2><button class="x" data-act="settingsClose" aria-label="${tr('common.close')}">×</button></div><p class="tagline">${tr('settings.saved_on_this_device')}</p><div class="setsb">
  <div class="setline"><div class="setl"><label for="langSel">${tr('common.language')}</label></div>${langPick('langSel')}</div>
  ${sec(tr('settings.display_and_sound'))}
  ${seg(tr('common.sound'),'soundSet',UI.muted?'off':'on',[['on',tr('common.on')],['off',tr('common.off')]])}
  ${seg(tr('settings.theme'),'themeSet',UI.theme||'light',[['light',tr('settings.theme_light')],['dark',tr('settings.theme_dark')],['auto',tr('common.auto')]],tr('settings.theme_auto_follows'))}
  ${seg(tr('common.animations'),'animSet',UI.anim||'auto',[['auto',tr('common.auto')],['on',tr('common.on')],['off',tr('common.off')]],tr('settings.anim_auto_follows'))}
  ${seg(tr('settings.map_drawing'),'mapSet',GLX.want?'auto':'2d',[['auto',tr('common.auto')],['2d',tr('settings.always_2d')]],tr('settings.map_auto_uses_gpu')+(GLX.want&&!glCan()?' '+tr('settings.this_browser_cannot_so_the_map'):''))}
  ${sec(tr('settings.customers_and_alerts'))}
  ${seg(tr('settings.pause_when_a_customer_is_furious'),'prefSet',cur('pauseFurious'),onoff('pauseFurious'),tr('settings.the_game_stops_so_you_can'))}
  ${seg(tr('settings.warn_when_a_customer_gets_unhappy'),'prefSet',cur('warnUnhappy'),onoff('warnUnhappy'),tr('settings.an_early_heads_up_below_60'))}
  ${seg(tr('settings.pause_on_outages_that_hurt'),'prefSet',cur('pauseIncident'),onoff('pauseIncident'),tr('settings.stops_the_game_when_a_failure'))}
  ${seg(tr('settings.quiet_notifications'),'prefSet',cur('quiet'),onoff('quiet'),tr('settings.only_trouble_and_milestones_pop_up'))}
  ${fuSettingsRow()}
  ${sec(tr('settings.data_and_saves'))}<div class="setline"><div class="setl"><span>🔒 ${tr('fedui.privacy')}</span></div>${btn(tr('privacy.what_the_game_keeps'),'privacy',{from:'settings'},'ghost sm')}</div>${installRow()}
  ${sec(tr('settings.advanced'))}
  ${seg(tr('settings.diagnostic_info'),'vpSet',DIAG.on?'on':'off',[['on',tr('common.on')],['off',tr('common.off')]],tr('settings.diag_for_bug_reports'))}
  ${HOOKS.settings?HOOKS.settings():''}</div><div class="btns" style="margin-top:12px">${btn(tr('common.done_8dd3'),'settingsClose',{},'pink')}</div>`;}
const refreshSettings=()=>{if(UI.setOpen)openModal(settingsHtml());};
function animOn(){const m=UI.anim||'auto';if(m==='on')return true;if(m==='off')return false;try{return !matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return true;}}
function applyAnim(){const r=document.documentElement;r.classList.toggle('no-anim',UI.anim==='off');r.classList.toggle('anim-force',UI.anim==='on');if(!animOn())FLOATS.length=0;}
const toS=(wx,wy,k=0)=>[(wx+k*W-cam.x)*cam.z+CW/2,(wy-cam.y)*cam.z+CH/2];
const iconScale=()=>clamp(Math.sqrt(cam.z),0.7,1.35);
