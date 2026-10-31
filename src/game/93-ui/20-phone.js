/* ================= PHONE ================= */
const isPhone=()=>innerWidth<=760||(innerHeight<=500&&matchMedia('(pointer:coarse)').matches);
const SPEEDS=[0.5,1,2,4,8];
function renderTabbar(){const tb=$('tabbar');if(!tb||(pressing&&UI.ticking))return;if(!isPhone()||!S||!UI.started||pzOn()){tb.hidden=true;document.body.classList.toggle('sheet-open',pzOn()&&isPhone()&&!!UI.sel);return;}tb.hidden=false;
  const open=UI.leftOpen&&!UI.sel,cur=UI.left||'goals',ndone=GOALS.filter(g=>S.done[g.id]!==undefined).length;
  const tab=(k,ic,l,cnt,red)=>`<button class="${open&&cur===k?'on':''}" data-act="phoneTab" data-args='{"t":"${k}"}' aria-label="${esc(l)}"><span class="ic" aria-hidden="true">${ic}</span>${esc(l)}${cnt?(cnt===' '?`<span class="cnt red dot"></span>`:`<span class="cnt${red?' red':''}">${cnt}</span>`):''}</button>`;
  const h=(rule('clock')?`<button class="play${UI.speed?'':' paused'}" data-act="phonePlay" aria-label="${UI.speed?tr('common.pause'):tr('common.play')}"><span class="ic" aria-hidden="true">${UI.speed?'❚❚':'▶'}</span>${UI.speed?tr('common.pause'):tr('common.play')}</button>`+
    `<button data-act="phoneSpeed" aria-label="${tr('common.game_speed')}"><span class="ic" aria-hidden="true">${UI.speed===0.5?'½':(UI.lastSpeed||UI.speed||1)}×</span>${tr('common.speed')}</button>`:'')+
    (()=>{const P=scnProg();return tab('goals','🎯',tr('common.goals'),P&&!S.scn.done&&!S.scn.failed?`${Math.round(P.f*100)}%`:`${ndone}/${GOALS.length}`);})()+(()=>{const u=custStats().unhappy;return u?tab('deals','💼',tr('common.deals'),u,true):tab('deals','💼',tr('common.deals'),S.offers.length||'');})()+tab('noc','🚨','NOC',S.inc.length?' ':'',true)+tab('nets','🌐',tr('common.networks'),'');
  if(h!==UI._tb){UI._tb=h;tb.innerHTML=h;}
  document.body.classList.toggle('sheet-open',!!(UI.sel||UI.leftOpen));}
function haptic(ms){if(UI.muted)return;try{navigator.vibrate&&navigator.vibrate(ms||12);}catch(e){}}
// Bottom sheets: drag the handle up to expand, down to shrink or close; tap it to toggle.
(function(){let g=null;
  document.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-grab]');if(!h||!isPhone())return;const el=h.parentElement;g={el,y:e.clientY,dy:0,id:e.pointerId,full:el.classList.contains('full')};try{h.setPointerCapture(e.pointerId);}catch(_){}el.style.transition='none';});
  document.addEventListener('pointermove',e=>{if(!g||e.pointerId!==g.id)return;g.dy=e.clientY-g.y;if(g.dy>0)g.el.style.transform=`translateY(${g.dy}px)`;});
  const end=e=>{if(!g||e.pointerId!==g.id)return;const {el,dy,full}=g;g=null;el.style.transition='';el.style.transform='';
    if(Math.abs(dy)<6){el.classList.toggle(el.id==='pzBox'?'mini':'full');return;}
    if(el.id==='pzBox'){el.classList.toggle('mini',dy>0);return;}
    if(dy<-40){el.classList.add('full');return;}
    if(dy>40){if(full){el.classList.remove('full');return;}if(el.id==='panel')ACT.closePanel();else{UI.leftOpen=false;renderLeft();}}};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);})();
// Toasts can be tapped away on touch screens.
document.addEventListener('click',e=>{const t=e.target.closest('.toast');if(t&&!e.target.closest('[data-act]')&&isPhone())t.remove();});
