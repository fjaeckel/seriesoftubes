/* ================= LOOP ================= */
let last=performance.now(),acc=0,hudT=0,animT=0;
function frame(now){
  // Schedule the next frame first: one bad lookup in a day tick must not freeze the whole game.
  if(!window.__TUBES_TEST__)requestAnimationFrame(frame);
  const dt=Math.min(250,now-last);last=now;
  // A day's steps take half a frame at most before letting one through (rwGo()): 8 ms at 60 Hz, 3 ms on a 240 Hz screen,
  // where 8 ms would be two frames lost. A device that cannot hold 50 frames a second waits a whole slow frame at every
  // rest, so a big day there would crawl: it gets half of its own frame, up to 32 ms. The frame time is followed slowly,
  // a long frame counting as two at most.
  if(dt>0){RW.fms=RW.fms?RW.fms*0.95+Math.min(dt,RW.fms*2)*0.05:dt;RW.budget=RW.fms>RW_SLOW?Math.min(32,RW.fms/2):Math.min(8,Math.max(3,RW.fms/2));}
  if(ANALYTICS.host&&S&&!S.lost&&UI.speed&&document.visibilityState==='visible'){UI.playMs=(UI.playMs||0)+dt;const m=UI.playMs/60000;for(const k of PLAY_MARKS)if(m>=k)track('play_'+k+'m',true);}
  if(S&&UI.started&&!S.lost&&now-(UI.lastSave||0)>5000)save();
  // The panels catch up on the frame after a day, so one frame does not carry both the day's simulation and them.
  if(UI.panelsDue){NOC.dirty=true;UI.panelsDue=false;if(!pressing){renderPanel();renderLeft();if(!$('dash').hidden)renderDash();renderBank();}renderHint();}
  if(NOC.peer)nocPump(now);
  if(S&&!S.lost&&$('modal').hidden&&UI.speed&&!pzOn())runClock(dt);
  if((UI.speed||pzOn())&&!(S&&S.lost))animT+=dt; /* paused = frozen dots, waves and clouds */
  const t=animOn()?animT:0;
  if(!(UI.mapHid=mapHidden())){const st=mapStill(t,now);if(st!==MAP_STILL&&!(st===MAP_AMBIENT&&now-(UI.drawnAt||0)<AMB_MS)){
    const d0=DIAG.on?performance.now():0;try{draw(t);}catch(e){tickErr(e);}UI.drawnAt=now;if(DIAG.on)DIAG.dms=performance.now()-d0;}}
  if(DIAG.on)diagFrame(now);
  // The diverse-paths map and the latency floors new offers ask about, worked out a millisecond a frame ahead.
  if(S&&UI.started){diversityWarm(1);if(!DIVW)latWarm(1);}
  RW.lf=performance.now();
}
// dt of real time at UI.speed: the days it adds up to. The frame calls it; so may a clock that also runs where frames
// do not (src/agent/, a hidden tab), under the frame's own conditions otherwise.
function runClock(dt){acc+=dt*UI.speed;let n=0;
  // One day in flight at a time (its routing in the worker, or resting between steps): time does not pile up behind it.
  // The clock waits for the day, never the other way round: a machine that cannot keep up plays slower, it does not
  // freeze to catch up. (Diagnostic info shows how fast days really come: 15-day-pace.js.)
  if(RW.job){acc=Math.min(acc,DAY_MS);return;}
  if(rwOn()){if(!RW.w)rwStart();if(acc>=DAY_MS){acc=Math.min(acc-DAY_MS,DAY_MS);paceStart(performance.now());try{rwDay();}catch(e){tickErr(e);}}}
  else{while(acc>=DAY_MS&&n<4&&UI.speed){acc-=DAY_MS;try{dayTick();}catch(e){tickErr(e);}n++;}
  if(n){UI.ticking=true;renderHUD();UI.ticking=false;UI.panelsDue=true;}}}
/* On a phone the NOC dashboard (or the bank), scrolled past its top edge, covers the whole map. Drawing the map
   under it is work nobody sees, so it waits until the map shows again (and no payday money piles up meanwhile). */
function mapHidden(){for(const id of ['dashCard','bankCard']){const c=$(id);if(c.parentNode.hidden)continue;
  const r=c.getBoundingClientRect();if(r.top<=1&&r.left<=1&&r.right>=innerWidth-1&&r.bottom>=innerHeight-1)return true;}return false;}
/* Paused, or with animations off, the map only changes when you move it, point at something or the network changes.
   Until then the last frame is still right, so it is not drawn again (phones keep cool). It is redrawn at least once
   a second anyway, and every frame while the land picture is still catching up with a zoom (the WebGL map has none).
   Playing, when only the animation clock moved (packets, waves, clouds, money floating up), the map is ambient: drawn
   at most 30 times a second, not at the screen's 60 or 120. The animations follow the clock, so they keep their speed
   and only lose frames nobody follows that closely; anything else that moves (the camera, a pointer, the network, a
   selection) gets every frame again at once. */
const FRAME=[],MAP_MOVING=0,MAP_AMBIENT=1,MAP_STILL=2,AMB_MS=29;
function mapStill(t,now){const sl=UI.sel,dr=UI.drag;
  const v=[t,cam.x,cam.y,cam.z,CW,CH,DPR,S,R,S&&S.day,S&&S.links.length,S&&S.offers.length,S&&S.inc.length,sl&&sl.type,sl&&sl.id,UI.hover,UI.snap&&UI.snap.id,dr&&dr.mode,dr&&dr.cx,dr&&dr.cy,FLOATS.length,UI.mk?UI.mk.tx:0,UI.mk?UI.mk.mood:0,zoomMoving()];
  let same=v.length===FRAME.length,clock=same&&FRAME[0]!==v[0];for(let i=0;i<v.length;i++)if(FRAME[i]!==v[i]){if(i)clock=false;same=false;FRAME[i]=v[i];}
  if(!(glOn()||WL.cv&&WL.key===(cam.z*DPR).toFixed(4)&&wlCovers(cam.z)))return MAP_MOVING;
  return same?(now-(UI.drawnAt||0)<1000?MAP_STILL:MAP_MOVING):clock?MAP_AMBIENT:MAP_MOVING;}
function tickErr(e){console.error('[tubes] tick failed',e);if(UI.tickErr)return;UI.tickErr=true;track('tick_error',true);
  toast(tr('loop.something_in_the_noc_glitched_the'),'bad');}
function boot(data){
  i18nDom();
  try{UI.muted=localStorage.getItem('sot-mute')==='1';UI.anim=localStorage.getItem('sot-anim')||'auto';}catch(e){}
  applyAnim();
  if(data&&data.S){S=migrate(data.S);UI.started=true;if(data.cam)Object.assign(cam,data.cam);compute();renderAll();}
  else{const sv=UI.slot?loadSave():null,stamp=sv&&sv.sv;if(sv)delete sv.sv;
    let okSave=false;if(sv){try{S=migrate(sv);compute();okSave=true;}catch(e){console.error('[tubes] loading the network failed',e);S=null;UI.started=false;}}
    if(okSave){slotIn(UI.slot,stamp);UI.started=true;setSpeed([0,0.5,1,2,4,8].includes(S.uiSpeed)?S.uiSpeed:1);
      if(S.cam&&isFinite(S.cam.x))Object.assign(cam,S.cam);else{const h=CITY[S.home];if(h){cam.x=h.x;cam.y=h.y;cam.z=innerWidth<760?1.1:1.4;}}
      renderAll();if(S.grace&&S.grace.until>S.day&&R.graceNets&&!S.grace.told){S.grace.told=1;toast(tr('loop.new_networks_on_the_map_this',{n:S.grace.until-S.day}),'goal',[{l:tr('common.open_noc'),act:'leftTab',args:{t:'noc'}}]);}
      if(S.auNews){delete S.auNews;const c=Object.keys(S.pops).find(x=>CITY[x].au);toast(tr('loop.australia_got_more_australian'),'bad',[{l:tr('common.open'),act:'focusCity',args:{city:c}}],{a:'city',v:c});}
      if(!whatsNew(true))toast(tr('loop.welcome_back_name_your_network_is',{name:esc(S.name),date:dateStr(S.day)}),'good');}
    // A save that cannot be loaded stays where it is, marked damaged: it can still be exported, or deleted.
    else if(UI.slot&&(sv||UI.loadBad))slotBroke(UI.slot);
    else{showTitle();if(UI.bootBusy)slotBusyModal(UI.bootBusy);else whatsNew(false);if(UI.bootBroken)toast(tr('loop.your_saved_game_could_not_be'),'bad');}}
  renderHUD();renderLeft();
  window.claude?.hot?.snapshot?.(()=>({S:S&&JSON.parse(JSON.stringify(S)),cam:{...cam}}));
  if(!window.__TUBES_TEST__){requestAnimationFrame(frame);setTimeout(checkUpdate,4000);setInterval(checkUpdate,10*60*1000);}
}
if(NOC.win)nocWinBoot();else if(!RW_IN)slotBoot(()=>window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {}));
