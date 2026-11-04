/* ================= AGENT MODE: the player's switch and clock =================
   In the player's own tab (the development page, served locally), the player can let an agent drive: the page dials
   the agent relay (80-relay.js) and answers tool calls through TUBES.call. While it does, the clock is not the
   player's (UI.clockLocked): either a fixed pace, one simulated day every 30 s to 5 min, that nobody can pause and
   that holds while no tool is connected; or the agent's clock, which stands still until the agent asks for days.
   The game itself knows none of this: it calls HOOKS (50-state.js), which this file fills in, and reads
   UI.clockLocked. Settings of its own, in their own storage key, so the game's preferences stay as they are. */
const API_AGENT_MS=[0,30000,60000,120000,300000],API_AGENT_KEY='sot-agent';
const API_AGENT_PREFS=(()=>{let j={};try{j=JSON.parse(localStorage.getItem(API_AGENT_KEY)||'{}')||{};}catch(e){}
  return {on:j.on===true,ms:API_AGENT_MS.includes(j.ms)?j.ms:60000};})();
/* Only where a relay can be: plain http (an https page cannot open ws://) to an address, never a DNS name, which the
   relay refuses (DNS rebinding). The public site is https and a name, so it never shows the switch. The test
   harness's made-up origin opts in, and a test page loaded from the public address does not. */
const apiAgentLocal=(p,h)=>p==='http:'&&(h==='localhost'||/\.localhost$/.test(h)||/^\[[0-9a-f:.]+\]$/i.test(h)||/^\d{1,3}(\.\d{1,3}){3}$/.test(h));
const API_AGENT_OK=apiAgentLocal(location.protocol,location.hostname)||!!window.__TUBES_TEST__&&location.hostname==='tests.invalid';
const apiAgentMs=()=>API_AGENT_PREFS.ms;
const apiMsLabel=ms=>ms>=60000?tr('settings.n_min',{n:Math.round(ms/60000)}):tr('settings.n_sec',{n:Math.round(ms/1000)});
const apiAgentMsLabel=()=>apiAgentMs()>0?apiMsLabel(apiAgentMs()):tr('settings.agent_s_clock');

/* The speed a locked clock runs at: the pace while a tool is connected, else held (0); always 0 on the agent's clock,
   where only advance moves days; and only in a game with a clock (the rule the pause buttons follow). */
function apiAgentSpeed(){const r=API_RELAY;return r.on&&r.tools>0&&apiAgentMs()>0&&S&&rule('clock')?DAY_MS/apiAgentMs():0;}

// k: 'on' (true/false) or 'ms' (one of API_AGENT_MS). Anything else is ignored, never coerced.
function apiAgentSet(k,v){
  if(k==='on')API_AGENT_PREFS.on=v===true||v==='1'||v===1;
  else if(k==='ms'){if(!API_AGENT_MS.includes(+v))return;API_AGENT_PREFS.ms=+v;}
  else return;
  try{localStorage.setItem(API_AGENT_KEY,JSON.stringify(API_AGENT_PREFS));}catch(e){}
  apiAgentSync();}

/* Locks or frees the clock to match the switch, and keeps the speed where it belongs. Switching on leaves the save's
   speed alone (save() does not overwrite it while the clock is locked), so switching off puts back the one the player
   left the game at. Safe to run any number of times. */
function apiAgentSync(){
  const on=!RW_IN&&API_AGENT_OK&&API_AGENT_PREFS.on;
  if(on!==UI.clockLocked){
    if(on&&S&&[0,0.5,1,2,4,8].includes(UI.speed))S.uiSpeed=UI.speed;
    UI.clockLocked=on;
    if(!on)UI.speed=S&&[0,0.5,1,2,4,8].includes(S.uiSpeed)?S.uiSpeed:(UI.lastSpeed||1);}
  if(on)UI.speed=apiAgentSpeed();
  apiRelaySync();
  apiTickerSync();
  renderHUD();renderTabbar();}

/* What the game draws for a locked clock: the badge in the HUD in place of the speed buttons, and on phones the two
   tab bar slots of play and speed, disabled, the second one reading the pace. */
function apiAgentHud(){
  const p=$('spPace');if(!p)return;
  p.hidden=!UI.clockLocked;
  if(UI.clockLocked)p.textContent=apiAgentMs()>0?tr('settings.pace_t_per_day',{t:apiAgentMsLabel()}):apiAgentMsLabel();}
function apiAgentTabbar(){
  return `<button class="play${UI.speed?'':' paused'}" disabled aria-label="${UI.speed?tr('common.pause'):tr('common.play')}"><span class="ic" aria-hidden="true">${UI.speed?'❚❚':'▶'}</span>${UI.speed?tr('common.pause'):tr('common.play')}</button>`+
    `<button class="pace" disabled aria-label="${tr('common.game_speed')}"><span class="ic" aria-hidden="true">${apiAgentMs()>0?apiAgentMsLabel():'🤖'}</span>${tr('common.speed')}</button>`;}

/* The Settings section. Its buttons are the agent's own (data-agent-set, answered below), not game actions, so no
   tool can find them on a screen and switch the agent off, or on. */
function apiAgentSettings(){
  if(!API_AGENT_OK)return '';
  const b=(v,l,on)=>`<button class="b ${on?'pink sm':'ghost sm'}" data-agent-set="${v}">${l}</button>`;
  const line=(lab,btns,note)=>`<div class="setline"><span>${lab}</span><div class="seg">${btns}</div></div><p class="meta" style="margin:0 0 6px">${note}</p>`;
  return `<h3 class="sub4">${tr('settings.agent_api')}</h3>`+
    line(tr('settings.let_an_ai_agent_drive_this_game'),b('on:1',tr('common.on'),API_AGENT_PREFS.on)+b('on:0',tr('common.off'),!API_AGENT_PREFS.on),tr('settings.while_agent_mode_is_on_the'))+
    line(tr('settings.the_clock_while_an_agent_plays'),API_AGENT_MS.map(m=>b('ms:'+m,m?apiMsLabel(m):tr('settings.the_agent_moves_it'),apiAgentMs()===m)).join(''),tr('settings.a_pace_runs_one_simulated_day'));}
function apiAgentClick(e){
  const el=e.target&&e.target.closest&&e.target.closest('[data-agent-set]');if(!el||el.disabled)return;
  const [k,v]=String(el.dataset.agentSet).split(':');
  apiAgentSet(k,k==='on'?v==='1':v);sfx('click');refreshSettings();}

/* Who opened the window on screen: the player (a click, a key, a picker: window.event is the input being handled), or
   the game itself (a day, a tool's call inside a relay message). A tool leaves the player's windows alone. */
const API_MODAL={hand:false};
const apiByHand=()=>{const e=window.event;return !!e&&/^(click|keydown|keyup|pointerup|touchend|change|input|submit)$/.test(e.type);};

// Wires agent mode into the page: the hooks, the badge and its style, the Settings buttons. Once, at load.
function apiAgentStart(){
  if(RW_IN)return;
  Object.assign(HOOKS,{speed:apiAgentSpeed,hud:apiAgentHud,tabbar:apiAgentTabbar,settings:apiAgentSettings,modal:open=>{API_MODAL.hand=open&&apiByHand();}});
  const sp8=$('sp8');
  if(sp8&&!$('spPace')){const p=document.createElement('span');p.id='spPace';p.hidden=true;sp8.after(p);}
  const st=document.createElement('style');
  st.textContent='.speed #spPace[hidden]{display:none}#spPace{border:2.5px solid var(--ink);background:var(--sun);border-radius:9px;height:32px;padding:0 8px;display:flex;align-items:center;font-family:var(--display);font-weight:800;font-size:12.5px;white-space:nowrap}'+
    '#tabbar button.pace .ic{font-size:13px;line-height:1.25}';
  document.head.appendChild(st);
  document.addEventListener('click',apiAgentClick);
  apiAgentSync();}
