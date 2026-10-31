/* ---------- hit tests & input ---------- */
function hitCity(x,y,r=28){let best=null,bd=r*iconScale();const KS=visibleKs();const pz=pzOn();for(const C of CITIES){if(C.off&&!cityOn(C.id))continue;if(pz&&!pzKind(C.id))continue;for(const k of KS){const [sx,sy]=toS(C.x,C.y,k);const d=Math.hypot(sx-x,sy+4-y);if(d<bd){bd=d;best={id:C.id,sx,sy};}}}return best;}
// A tap on a city's icon picks the city; in the rest of its (generous) tap circle, a link right under the finger wins,
// or a short link between two close cities could not be picked at all (#126).
function pickCity(x,y){const h=hitCity(x,y);if(!h)return null;if(Math.hypot(h.sx-x,h.sy+4-y)<=16*iconScale())return h;return hitLink(x,y)?null:h;}
function hitLink(x,y){if(!S)return null;let best=null,bd=12;const KS=visibleKs(),PI=pairIdx();for(const grp of linkGroups()){const l=grp[0];const g=linkGeom(l,PI.get(edgeKey(l)));for(const k of KS){let prev=null;for(const p of g.pts){const q=toS(p[0],p[1],k);if(prev){const d=segDist(x,y,prev,q);if(d<bd){bd=d;best=l.id;}}prev=q;}}}return best;}
function wrapCam(){cam.x=((cam.x%W)+W)%W;cam.y=clamp(cam.y,0,H);}
const ptrs=new Map();
cv.addEventListener('pointerdown',e=>{audioInit();cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size>=2){if(!UI.drag||UI.drag.mode!=='pinch'){const [a,b]=[...ptrs.values()];UI.drag={mode:'pinch',d0:Math.hypot(a.x-b.x,a.y-b.y)||1,z0:cam.z};UI.snap=null;cv.classList.remove('linking');}return;}
  const hit=S&&hitCity(e.clientX,e.clientY);
  if(hit&&S.pops[hit.id])UI.drag={mode:'maybeLink',from:hit.id,sx:e.clientX,sy:e.clientY,camx:cam.x,camy:cam.y,moved:false};
  else UI.drag={mode:'pan',sx:e.clientX,sy:e.clientY,camx:cam.x,camy:cam.y,moved:false};
});
cv.addEventListener('pointermove',e=>{
  if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const d=UI.drag;
  if(!d){const h=S&&pickCity(e.clientX,e.clientY);UI.hover=h?h.id:null;cv.style.cursor=h?(S.pops[h.id]?'crosshair':'pointer'):(hitLink(e.clientX,e.clientY)?'pointer':'grab');return;}
  if(d.mode==='pinch'){if(ptrs.size>=2){const [a,b]=[...ptrs.values()];const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;zoomAt(mx,my,clamp(d.z0*Math.hypot(a.x-b.x,a.y-b.y)/d.d0,ZMIN,ZMAX)/cam.z);}return;}
  const dx=e.clientX-d.sx,dy=e.clientY-d.sy;if(Math.hypot(dx,dy)>6)d.moved=true;
  if(d.mode==='maybeLink'&&d.moved){d.mode='link';cv.classList.add('linking');}
  if(d.mode==='link'){d.cx=e.clientX;d.cy=e.clientY;const h=hitCity(e.clientX,e.clientY,40);UI.snap=h&&h.id!==d.from?h:null;renderHint();}
  else if(d.mode==='pan'&&d.moved){cam.x=d.camx-dx/cam.z;cam.y=d.camy-dy/cam.z;wrapCam();cv.style.cursor='grabbing';}
});
function endPtr(e){
  ptrs.delete(e.pointerId);const d=UI.drag;if(!d)return;
  if(d.mode==='pinch'){if(ptrs.size===0){UI.drag=null;UI.snap=null;cv.classList.remove('linking');}return;}
  if(d.mode==='link'){if(UI.snap&&UI.snap.id!==d.from){if(pzOn())pzLinkModal(d.from,UI.snap.id);else openLinkModal(d.from,UI.snap.id);sfx('click');}}
  else if(!d.moved&&S&&mkOn()&&mkHit(e.clientX,e.clientY)){sfx('click');toast(tr('chaos_monkey.tap'),'',[{l:tr('chaos_monkey.banana',{cost:fmt$(mkBananaCost())}),act:'mkBanana',args:{}}]);}
  else if(!d.moved&&S){const h=pickCity(e.clientX,e.clientY);
    if(h){selectCity(h.id);renderLeft();sfx('click');}
    else{const l=hitLink(e.clientX,e.clientY);if(l){selectLink(l);sfx('click');}else{UI.sel=null;renderPanel();renderLeft();}}}
  UI.drag=null;UI.snap=null;cv.classList.remove('linking');cv.style.cursor='grab';renderHint();
}
// A cancelled pointer (scroll takeover, palm rejection, system gesture) is not a tap or a drop.
function cancelPtr(e){ptrs.delete(e.pointerId);if(ptrs.size)return;UI.drag=null;UI.snap=null;cv.classList.remove('linking');cv.style.cursor='grab';renderHint();}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',cancelPtr);
// Dense regions (southern Brazil, the Benelux) need a close look: cities stop growing past 1.35×, so zooming spreads them out (#126).
const ZMIN=0.35,ZMAX=16;
function zoomAt(mx,my,f){const wx=cam.x+(mx-CW/2)/cam.z,wy=cam.y+(my-CH/2)/cam.z;cam.z=clamp(cam.z*f,ZMIN,ZMAX);cam.x=wx-(mx-CW/2)/cam.z;cam.y=wy-(my-CH/2)/cam.z;wrapCam();}
cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*0.0015));},{passive:false});
addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='metIn'){ACT.metricSet({id:e.target.dataset.id});return;}if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Space'&&e.target.closest&&e.target.closest('button,a'))return;if(e.code==='Space'&&(!S||rule('clock'))&&!pzOn()){e.preventDefault();UI.speed=UI.speed?0:1;renderHUD();}if(e.key==='0')ACT.speed({v:0.5});if(e.key==='1')ACT.speed({v:1});if(e.key==='2')ACT.speed({v:2});if(e.key==='3')ACT.speed({v:4});if(e.key==='4')ACT.speed({v:8});if(e.key==='Escape'&&!$('bankBox').hidden){$('bankBox').hidden=true;return;}if(e.key==='Escape'&&!$('dash').hidden){$('dash').hidden=true;return;}if(e.key==='Escape'){if(!$('modal').hidden){if(S&&UI.started&&!S.lost)closeModal();}else{UI.sel=null;renderPanel();}}});

