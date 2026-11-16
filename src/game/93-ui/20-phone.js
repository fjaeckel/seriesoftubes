/* ================= PHONE ================= */
const isPhone=()=>innerWidth<=760||(innerHeight<=500&&matchMedia('(pointer:coarse)').matches);
const SPEEDS=[0.5,1,2,4,8];
function renderTabbar(){const tb=$('tabbar');if(!tb||(pressing&&UI.ticking))return;if(!isPhone()||!S||!UI.started||pzOn()){tb.hidden=true;document.body.classList.remove('tb-on');document.body.classList.toggle('sheet-open',pzOn()&&isPhone()&&!!UI.sel);return;}tb.hidden=false;document.body.classList.add('tb-on');
  const open=UI.leftOpen&&!UI.sel,cur=UI.left||'goals',G=goals(),ndone=G.filter(g=>S.done[g.id]!==undefined).length;
  const tab=(k,ic,l,cnt,red)=>`<button class="${open&&cur===k?'on':''}" data-act="phoneTab" data-args='{"t":"${k}"}' aria-label="${esc(l)}" aria-pressed="${open&&cur===k}"><span class="ic" aria-hidden="true">${ic}</span>${esc(l)}${cnt?(cnt===' '?`<span class="cnt red dot"></span>`:`<span class="cnt${red?' red':''}">${cnt}</span>`):''}</button>`;
  // A locked clock's two buttons come from whatever locked it (HOOKS.tabbar), in the same two slots, so the tabs stay put.
  const h=(rule('clock')?UI.clockLocked&&HOOKS.tabbar?HOOKS.tabbar():`<button class="play${UI.speed?'':' paused'}" data-act="phonePlay" aria-label="${UI.speed?tr('common.pause'):tr('common.play')}"><span class="ic" aria-hidden="true">${UI.speed?'❚❚':'▶'}</span>${UI.speed?tr('common.pause'):tr('common.play')}</button>`+
    `<button data-act="phoneSpeed" aria-label="${tr('common.game_speed')}"><span class="ic" aria-hidden="true">${UI.speed===0.5?'½':(UI.lastSpeed||UI.speed||1)}×</span>${tr('common.speed')}</button>`:'')+
    (()=>{const P=scnProg();return tab('goals','🎯',tr('common.goals'),P&&!S.scn.done&&!S.scn.failed?`${Math.round(P.f*100)}%`:`${ndone}/${G.length}`);})()+(()=>{const d=dealsBadge();return tab('deals','💼',tr('common.deals'),d.c||(d.red?' ':''),d.red);})()+tab('noc','🚨','NOC',S.inc.length?' ':'',true)+tab('nets','🌐',tr('common.networks'),'');
  if(h!==UI._tb){UI._tb=h;tb.innerHTML=h;}
  document.body.classList.toggle('sheet-open',!!(UI.sel||UI.leftOpen));}
function haptic(ms){if(UI.muted)return;try{navigator.vibrate&&navigator.vibrate(ms||12);}catch(e){}}
// On its side a phone's sheets stand on the right (60-phone.css): the handle hangs off their left edge and works sideways.
const sideSheets=()=>isPhone()&&innerHeight<=500&&innerWidth>=innerHeight;
// Bottom sheets: drag the handle up to expand, down to shrink or close; tap it to toggle. Side sheets: tap the handle to
// put the sheet away, drag it right to narrow or close, left to widen.
(function(){let g=null;
  const shut=el=>{if(el.id==='panel')ACT.closePanel();else{UI.leftOpen=false;renderLeft();}};
  document.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-grab]');if(!h||!isPhone()||e.target.closest('button,select,input'))return;const el=h.parentElement;g={el,x:e.clientX,y:e.clientY,d:0,id:e.pointerId,side:sideSheets()&&(el.id==='left'||el.id==='panel'),full:el.classList.contains('full')};try{h.setPointerCapture(e.pointerId);}catch(_){}el.style.transition='none';});
  document.addEventListener('pointermove',e=>{if(!g||e.pointerId!==g.id)return;g.d=g.side?e.clientX-g.x:e.clientY-g.y;if(g.d>0)g.el.style.transform=g.side?`translateX(${g.d}px)`:`translateY(${g.d}px)`;});
  const end=e=>{if(!g||e.pointerId!==g.id)return;const {el,d,full,side}=g;g=null;el.style.transition='';el.style.transform='';
    if(Math.abs(d)<6){if(side){el.classList.remove('full');shut(el);}else el.classList.toggle('full');return;}
    if(d<-40){el.classList.add('full');return;}
    if(d>40){if(full){el.classList.remove('full');return;}shut(el);}};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);})();
// Turning the phone moves a sheet from the bottom to the side (or back), and the browser can drop its scroll position on
// the way: remember where each sheet was and put it back once, after the turn.
(function(){const pos=new WeakMap();let land=innerWidth>innerHeight;
  document.addEventListener('scroll',e=>{const t=e.target;if(t.classList&&t.classList.contains('scroll'))pos.set(t,t.scrollTop);},{capture:true,passive:true});
  addEventListener('resize',()=>{const l=innerWidth>innerHeight;if(l===land)return;land=l;requestAnimationFrame(()=>{for(const t of document.querySelectorAll('#left>.scroll,#panel .scroll')){const y=pos.get(t);if(y&&!t.scrollTop)t.scrollTop=y;}});});})();
// Toasts can be tapped away on touch screens.
document.addEventListener('click',e=>{const t=e.target.closest('.toast');if(t&&!e.target.closest('[data-act]')&&isPhone())t.remove();});
