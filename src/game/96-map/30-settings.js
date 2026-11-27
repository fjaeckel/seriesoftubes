// Static markup: elements with data-i18n="label" get their text, and data-i18n-aria-label / data-i18n-title
// their attribute, from the dictionary once at boot. The English stays in the markup for search engines.
function i18nDom(){if(LANG==='en')return;for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=tr(el.dataset.i18n);
  // The top bar's date shows under the title and install screens before a game starts: day 0, in the player's language.
  const d=document.getElementById('hDate');if(d)d.textContent=dateStr(0);
  for(const a of ['aria-label','title'])for(const el of document.querySelectorAll(`[data-i18n-${a}]`))el.setAttribute(a,tr(el.getAttribute('data-i18n-'+a)));}
// One button per [value,label] option; the current one is highlighted.
// One dropdown instead of a button per language: the list keeps growing, and on phones the system picker opens.
// Each language is named in itself (lang= lets screen readers say it right).
const langPick=id=>`<select class="pick" id="${id}" data-chg="langSet" aria-label="${tr('common.language')}">${Object.entries(LANGS).map(([v,l])=>`<option value="${v}" lang="${v}"${v===LANG?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
function segBtns(act,cur,opts){return opts.map(([v,l])=>segB(l,act,{v},cur===v)).join('');}
/* Animation setting: auto follows the system's reduced-motion preference, or force it on or off. */
/* Settings are per device (localStorage), not part of the save: they are about how you like to play. */
const PREF_DEF={warnUnhappy:true};
let PREFS=(()=>{try{const j=JSON.parse(localStorage.getItem('sot-prefs')||'{}');return j&&typeof j==='object'?j:{};}catch(e){return {};}})();
const pref=k=>typeof PREFS[k]==='boolean'?PREFS[k]:PREF_DEF[k];
const prefSave=()=>{try{localStorage.setItem('sot-prefs',JSON.stringify(PREFS));}catch(e){}};
function setPref(k,v){if(!own(PREF_DEF,k))return;PREFS[k]=!!v;prefSave();}
/* Notifications (#498, #443): what the day announces has a topic (NCATS), and each topic pops up all of it (2), only
   trouble and milestones (1), or nothing (0: the NOC log keeps it anyway). A preset sets every topic at once; a topic
   chosen by hand overrides it (PREFS.nc). Trouble in a topic can also stop the clock (PREFS.npz). Replies to what the
   player just did always pop up. Everything here is per device and read from localStorage, so it is checked on use. */
const NCATS=['inc','cust','money','build','peer','deals','world','conf','staff','goal','other'];
const NC_PRE={all:{},quiet:{inc:1,cust:1,money:1,build:1,peer:1,deals:2,world:1,conf:0,staff:1,goal:2,other:1}};
// Settings from before topics: quiet notifications became the Quiet preset, the two pause switches pause topics.
{let ch=0;if(typeof PREFS.quiet==='boolean'){if(!PREFS.np)PREFS.np=PREFS.quiet?'quiet':'all';delete PREFS.quiet;ch=1;}
  for(const [k,c] of [['pauseFurious','cust'],['pauseIncident','inc']])if(own(PREFS,k)){if(typeof PREFS[k]==='boolean')(PREFS.npz=PREFS.npz&&typeof PREFS.npz==='object'?PREFS.npz:{})[c]=PREFS[k];delete PREFS[k];ch=1;}
  if(ch)prefSave();}
// The preset: the player's choice once made, until then Quiet in Best Effort only.
const ncPreset=()=>PREFS.np==='all'||PREFS.np==='quiet'?PREFS.np:rulePreset()==='soft'?'quiet':'all';
const quietOn=()=>ncPreset()==='quiet';
const ncOwn=c=>{const o=PREFS.nc&&typeof PREFS.nc==='object'?PREFS.nc[c]:undefined;return o===0||o===1||o===2?o:null;};
const ncLevel=c=>{const o=ncOwn(c);return o!==null?o:NC_PRE[ncPreset()][c]??2;};
const ncPause=c=>{const p=PREFS.npz&&typeof PREFS.npz==='object'?PREFS.npz[c]:undefined;return typeof p==='boolean'?p:c==='cust';};
const ncCustom=()=>NCATS.some(c=>ncOwn(c)!==null&&ncOwn(c)!==(NC_PRE[ncPreset()][c]??2));
const ncName=c=>tr({inc:N_('settings.nc_c_inc'),cust:N_('settings.nc_c_cust'),money:N_('settings.nc_c_money'),build:N_('settings.nc_c_build'),peer:N_('settings.nc_c_peer'),deals:N_('settings.nc_c_deals'),
  world:N_('settings.nc_c_world'),conf:N_('settings.nc_c_conf'),staff:N_('settings.nc_c_staff'),goal:N_('settings.nc_c_goal'),other:N_('settings.nc_c_other')}[c]||N_('settings.nc_c_other'));
function ncSetLevel(c,v){if(!NCATS.includes(c)||![0,1,2].includes(v))return;PREFS.nc=PREFS.nc&&typeof PREFS.nc==='object'?PREFS.nc:{};PREFS.nc[c]=v;prefSave();}
// The topic the day is announcing right now (NCAT), set around each part of the day (10-day-tick.js) or for one notice.
let NCAT=null;
const catDo=(c,f)=>{const w=NCAT;NCAT=c;try{return f();}finally{NCAT=w;}};
function* catRun(c,g){const w=NCAT;NCAT=c;try{return yield* g;}finally{NCAT=w;}}
const ntc=(c,...a)=>catDo(c,()=>toast(...a));
// The notifications section: the preset, and each topic on its own line once unfolded.
function ncHtml(seg){const p=ncPreset(),cu=ncCustom(),lv=[[2,tr('settings.nc_lv_2')],[1,tr('settings.nc_lv_1')],[0,tr('settings.nc_lv_0')]];
  let h=seg(tr('settings.nc_popups'),'ncSet',cu?'':'p:'+p,[['p:all',tr('settings.nc_all')],['p:quiet',tr('settings.nc_quiet')]],cu?tr('settings.nc_custom_note'):tr('settings.nc_note'));
  h+=`<div class="setline"><div class="setl"><span>${tr('settings.nc_per_topic')}</span><small>${UI.ncOpen?tr('settings.nc_topic_note'):tr('settings.nc_per_topic_note')}</small></div>${btn(UI.ncOpen?tr('common.show_fewer'):tr('settings.nc_choose'),'ncSet',{v:'f'},'ghost sm')}</div>`;
  if(!UI.ncOpen)return h;
  return h+NCATS.map(c=>{const z=ncPause(c);return `<div class="setline nct"><div class="setl"><span>${esc(ncName(c))}</span></div><div class="seg">${lv.map(([v,l])=>segB(l,'ncSet',{v:'c:'+c+':'+v},ncLevel(c)===v)).join('')}<button class="b sm${z?' pink':' ghost'}" data-act="ncSet" data-args='${JSON.stringify({v:'z:'+c})}' aria-pressed="${z}" title="${tr('settings.nc_pause')}" aria-label="${esc(tr('settings.nc_pause_topic',{topic:ncName(c)}))}">⏸️</button></div></div>`;}).join('');}
// Stop the clock for something the player must see. Nothing happens if the game is already paused, or not the player's.
function autoPause(){if(!S||!UI.speed||UI.clockLocked)return false;UI.resumeSpeed=UI.lastSpeed=UI.speed;UI.speed=0;renderHUD();return true;}
// Space and the phone's play button: pause, or play again at the speed it ran before (#299).
function playPause(){if(pzOn()||UI.clockLocked||(S&&!rule('clock')))return false;if(UI.speed){UI.lastSpeed=UI.speed;UI.speed=0;}else UI.speed=UI.lastSpeed||1;renderHUD();return true;}
// Put the clock back at a speed (a new game, a loaded or resumed one): unless it is locked, then it runs as the lock says.
function setSpeed(v){UI.speed=UI.clockLocked&&HOOKS.speed?HOOKS.speed():v;}
const resumeAct=()=>({l:tr('common.resume'),act:'speed',args:{v:UI.resumeSpeed||1}});
// Settings in sections, one line each: what it is (and a short note under it) on the left, its control on the right.
function settingsHtml(){const seg=(lab,act,cur,opts,note)=>`<div class="setline"><div class="setl"><span>${lab}</span>${note?`<small>${note}</small>`:''}</div><div class="seg">${segBtns(act,cur,opts)}</div></div>`;
  const onoff=k=>[[k+':1',tr('common.on')],[k+':0',tr('common.off')]],cur=k=>k+':'+(pref(k)?1:0),sec=t=>`<h3 class="sub4 sets">${t}</h3>`;
  return `<div style="display:flex;align-items:center"><h2 style="font-size:26px">⚙️ ${tr('common.settings')}</h2><button class="x" data-act="settingsClose" aria-label="${tr('common.close')}">×</button></div><p class="tagline">${tr('settings.saved_on_this_device')}</p><div class="setsb">
  <div class="setline"><div class="setl"><label for="langSel">${tr('common.language')}</label></div>${langPick('langSel')}</div>
  ${sec(tr('settings.display_and_sound'))}
  ${seg(tr('common.sound'),'soundSet',UI.muted?'off':'on',[['on',tr('common.on')],['off',tr('common.off')]])}
  ${seg(tr('settings.theme'),'themeSet',UI.theme||'light',[['light',tr('settings.theme_light')],['dark',tr('settings.theme_dark')],['auto',tr('common.auto')]],tr('settings.theme_auto_follows'))}
  ${seg(tr('common.animations'),'animSet',UI.anim||'auto',[['auto',tr('common.auto')],['on',tr('common.on')],['off',tr('common.off')]],tr('settings.anim_auto_follows'))}
  ${seg(tr('settings.map_drawing'),'mapSet',GLX.want?'auto':'2d',[['auto',tr('common.auto')],['2d',tr('settings.always_2d')]],tr('settings.map_auto_uses_gpu')+(GLX.want&&!glCan()?' '+tr('settings.this_browser_cannot_so_the_map'):''))}
  ${sec(tr('common.notifications'))}${ncHtml(seg)}
  ${seg(tr('settings.warn_when_a_customer_gets_unhappy'),'prefSet',cur('warnUnhappy'),onoff('warnUnhappy'),tr('settings.an_early_heads_up_below_60'))}
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
