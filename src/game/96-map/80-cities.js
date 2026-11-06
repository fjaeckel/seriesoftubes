// Label widths by text (city labels by id, link labels and far-view labels by text): measuring text every frame is slow.
const LBLW={},LINKW=new Map(),LBLF=new Map(),FKEY=new Map(),QKEY=new Map(),CM={off:new Set(),big:new Set(),inc:new Set(),far:false,dish:null};
// Pie dishes (Pie in the Sky): city -> up?, or null without any, so most maps pay one null check per city.
function pieDishMap(){const d=S.pie&&S.pie.dishes;if(!Array.isArray(d)||!d.length)return null;const m=new Map();for(const x of d)if(x&&x.city)m.set(x.city,m.get(x.city)||!(x.down>S.day));return m;}
// Painted once per look (the load in 5% steps) and drawn as a sprite, so it shows on the graphics-card map as well.
function dishBadge(x,y,up,u,k=1){const q=u>0.005?Math.min(20,Math.round(u*20)):0;stamp('dish|'+(up?1:0)+'|'+q,20,20,10,10,k,x,y,()=>dishPaint(0,0,up,q/20));}
function dishPaint(x,y,up,u){if(u>0.005){ctx.lineWidth=1.8;ctx.strokeStyle='rgba(30,38,64,.3)';ctx.beginPath();ctx.arc(x,y,8,0,7);ctx.stroke();ctx.strokeStyle=u>=0.9?'#FF4D5E':u>=0.6?'#FFAA1F':'#22C47A';ctx.beginPath();ctx.arc(x,y,8,-Math.PI/2,-Math.PI/2+Math.min(1,u)*2*Math.PI);ctx.stroke();}
  ctx.fillStyle=up?'#FF4F9A':'#8A91A8';ctx.strokeStyle='#1E2640';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(x,y,5.5,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y-1,3,0.15*Math.PI,0.85*Math.PI);ctx.moveTo(x,y+2);ctx.lineTo(x+2.6,y-2.6);ctx.stroke();ctx.strokeStyle='#1E2640';}
try{document.fonts&&document.fonts.ready.then(()=>{for(const k in LBLW)delete LBLW[k];LINKW.clear();LBLF.clear();FRAME.length=0;spritesReset();});}catch(e){}
// A label on a pill: its text and look never change, so it is painted once (spriteEntry) and drawn as a picture. The
// centre is x, y; the text sits at y+ty. The pill's box is w×h with corners r; the picture also takes the outline.
// Keys are kept by text (PILLK), one per look: joining them for every label on every frame was most of the map's garbage.
const PILLK=new Map();
function pill(t,font,w,h,r,fill,ink,stroke,lw,x,y,ty){
  const pad=lw+2,W=Math.ceil(w+pad*2),H=Math.ceil(h+pad*2);let L=PILLK.get(t),m=null;
  if(L)for(let i=0;i<L.length;i++){const q=L[i];if(q.font===font&&q.w===w&&q.h===h&&q.r===r&&q.fill===fill&&q.ink===ink&&q.stroke===stroke&&q.lw===lw&&q.ty===ty){m=q;break;}}
  if(!m){if(!L){if(PILLK.size>4000)PILLK.clear();PILLK.set(t,L=[]);}L.push(m={font,w,h,r,fill,ink,stroke,lw,ty,k:['pill',t,font,w,h,r,fill,ink,stroke,lw,ty].join('|')});}
  const e=spriteHas(m.k)||spriteEntry(m.k,W,H,W/2,H/2,g=>{g.translate(W/2,H/2);g.fillStyle=fill;g.strokeStyle=stroke;g.lineWidth=lw;
    rr(-w/2,-h/2,w,h,r);g.fill();g.stroke();g.fillStyle=ink;g.font=font;g.textAlign='center';g.textBaseline='middle';g.fillText(t,0,ty);});
  // Whole device pixels, so the text stays as sharp as before.
  blit(e,Math.round((x-e.w/2)*DPR)/DPR,Math.round((y-e.h/2)*DPR)/DPR,e.w,e.h);}
// Zoomed out a city is a small picture (a dot, or your POP's box), kept as a sprite; a POP in trouble glows under it.
function drawCityFar(C,sx,sy,sc,now,lyOverride){
  const p=S.pops[C.id],down=p&&p.down>S.day,sel=UI.sel&&UI.sel.type==='city'&&UI.sel.id===C.id,hov=UI.hover===C.id||(UI.snap&&UI.snap.id===C.id);
  if(p&&!down&&R.cityDem[C.id]>0&&sfOf(R,C.id)<0.9)dot(sx,sy,12,'rgba(255,77,94,1)',.35+.25*Math.sin(now/200));
  const t=cTier(C.id),ph=sel?Math.floor(now/40)%8:-1,f=(p?1:0)|(down?2:0)|(p&&p.site2?4:0)|(p&&(p.routers||1)>=2?8:0)|(hov?16:0)|(hasIxAt(C.id)?32:0)|(CM.off.has(C.id)?64:0)|(CM.inc.has(C.id)?128:0);
  // The key, kept per city and built again only when the picture changes.
  let m=FKEY.get(C.id);if(!m||m.f!==f||m.t!==t||m.ph!==ph)FKEY.set(C.id,m={f,t,ph,k:'far|'+t+'|'+f+'|'+ph});
  stamp(m.k,36,36,18,18,1,sx,sy,()=>cityFarStatic(C,p,down,sel,hov,ph));
  if(CM.dish&&CM.dish.has(C.id))dishBadge(sx+(p?10:6),sy+(p?6:5),CM.dish.get(C.id),CM.dl&&CM.dl[C.id]);
  if(lyOverride!==null&&(p||sel||hov)){ctx.font=`800 ${p?12:11}px "Baloo 2", sans-serif`;const t=C.name,wk=C.id+(p?1:0);let tw=LBLF.get(wk);if(tw===undefined)LBLF.set(wk,tw=ctx.measureText(t).width+12);const ly=lyOverride==null?sy+15:lyOverride;
    pill(t,ctx.font,tw,16,8,p?'#FF4F9A':'#FFFFFF',p?'#FFFFFF':'#1E2640','#1E2640',1.6,sx,ly,1);}
}
function cityFarStatic(C,p,down,sel,hov,ph){ctx.strokeStyle='#1E2640';
  if(sel){ctx.strokeStyle='#FF4F9A';ctx.lineWidth=2.5;ctx.setLineDash([4,4]);ctx.lineDashOffset=-ph;ctx.beginPath();ctx.arc(0,0,p?14:9,0,7);ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.strokeStyle='#1E2640';}
  if(p){
    const col=down?'#8A91A8':'#FF4F9A';ctx.lineWidth=1.8;
    if(p.site2){ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(9,6);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=col;rr(5,3,9,7,3);ctx.fill();ctx.stroke();}
    if((p.routers||1)>=2){ctx.fillStyle=down?'#6E7590':'#D63B7F';rr(-6,-7,15,10,4);ctx.fill();ctx.stroke();}
    ctx.fillStyle=col;rr(-8,-5,16,10,4);ctx.fill();ctx.stroke();
  }else{// The dot grows with the city's eyeballs; a megacity glows a little (75-city-size.js).
    const t=cTier(C.id),r=FAR_R[t]*(hov?1.3:1);if(t===4){ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(0,0,r+4.5,0,7);ctx.fill();}
    ctx.fillStyle=hasIxAt(C.id)?'#FFD23F':'#FFFFFF';ctx.lineWidth=t>=3?1.6:1.3;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.stroke();}
  if(CM.off.has(C.id)){ctx.fillStyle='#16A866';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p?9:5,p?-7:-5,3,0,7);ctx.fill();ctx.stroke();}
  if(CM.inc.has(C.id)){ctx.fillStyle='#FF4D5E';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p?-9:-5,p?-7:-5,3.4,0,7);ctx.fill();ctx.stroke();}}
// A city's picture is painted once per state and kept as a sprite (citySprite). What moves every frame is painted on top
// (cityMoving): the lights, the steam, a flashing IX, the hot badges and the offer bubble. The rings and the glow move too,
// but in steps (cityPhase), so their sprite changes only at a step; so does its scale (sprQ(), 59-gl-sprites.js).
// dd is -1 without an attack: the attack's ring at step 0 must not share a sprite with no ring at all.
function cityPhase(C,p,sel,now){const ph={sel:0,dd:-1,gl:-1};
  if(sel)ph.sel=Math.floor(now/40)%12;                       // dash period 12 px, lineDashOffset -now/40
  if(p&&R.ddosHot&&R.ddosHot[C.id])ph.dd=Math.floor(now/30)%8; // dash period 8 px, lineDashOffset now/30
  if(p&&!(p.down>S.day)&&R.cityDem[C.id]>0&&sfOf(R,C.id)<0.9)ph.gl=Math.round((Math.sin(now/200)+1)*3.5); // 8 levels of .35+.25·sin
  return ph;}
// The IX badge. Hot (a flood or a fault) it flashes: cityMoving() then draws it from two pictures, one per colour.
function cityIX(C,p,t,h,hot,now){const mine=!!S.myIx[C.id],joined=hasIxAt(C.id),q=!p&&!hot&&ixQuiet(C.id),Rr=q?6.5:8.5,ix=p?19:SKY_W[t]/2+(q?2:4);
  ctx.fillStyle=hot?(Math.sin(now/180)>0?'#FF4D5E':'#FF8A3D'):mine?'#FF4F9A':joined?'#FFD23F':'#FFFFFF';ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i+Math.PI/6;ctx.lineTo(ix+Rr*Math.cos(a),-h+2+Rr*Math.sin(a));}ctx.closePath();ctx.fill();ctx.lineWidth=q?1.4:2;ctx.stroke();
  ctx.fillStyle=mine||hot?'#fff':'#1E2640';ctx.font=`900 ${q?6.5:8}px Nunito, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('IX',ix,-h+2.5);}
// Everything about the city that does not move, in the city's own frame (origin on the city). Drawn into a sprite, so
// it reads only what citySprite() puts in the key.
function cityStatic(C,p,t,cs,k,ph,st){const down=st.down;
  if(st.feed){ctx.strokeStyle='#FF8A3D';ctx.lineWidth=4;ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(0,-6*k,36*k,0,7);ctx.stroke();ctx.setLineDash([]);}
  if(st.sel){ctx.strokeStyle='#FF4F9A';ctx.lineWidth=3;ctx.setLineDash([6,6]);ctx.lineDashOffset=-ph.sel;ctx.beginPath();ctx.arc(0,-6*k,30*k,0,7);ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;}
  if(ph.dd>=0){ctx.strokeStyle='#FF4D5E';ctx.lineWidth=3;ctx.setLineDash([4,4]);ctx.lineDashOffset=ph.dd;ctx.beginPath();ctx.arc(0,-6*k,33*k,0,7);ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;}
  ctx.scale(k*cs,k*cs);
  ctx.fillStyle='rgba(30,38,64,.2)';ctx.beginPath();ctx.ellipse(0,9,p?20:SKY_W[t]/2+5,5,0,0,7);ctx.fill();
  const h=p?18:SKY_H[t];
  ctx.strokeStyle='#1E2640';ctx.lineWidth=2.2;
  // The skyline says how big the city is: a hut for an outpost, up to five towers for a megacity.
  if(!p){const bl=SKY[t];
    if(t===4){ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,8-h);ctx.lineTo(0,1-h);ctx.stroke();ctx.fillStyle='#FF4D5E';ctx.beginPath();ctx.arc(0,-h,2.2,0,7);ctx.fill();ctx.stroke();ctx.lineWidth=2.2;}
    for(const [x,hh,col] of bl){ctx.fillStyle=col;rr(x,8-hh,10,hh,2);ctx.fill();ctx.stroke();}
    ctx.fillStyle='rgba(30,38,64,.35)';ctx.beginPath();for(const [x,hh] of bl)for(let yy=8-hh+4;yy<5;yy+=5){ctx.rect(x+2.5,yy,2,2);ctx.rect(x+5.5,yy,2,2);}ctx.fill();}
  if(p){
    // Second building: a small router B on the metro ring, so dual-site POPs stand out.
    if(p.site2){const dB=siteDown(C.id,'b'),cut=p.ringcut>S.day;ctx.save();ctx.lineWidth=2.2;ctx.setLineDash(cut?[3,4]:[]);ctx.strokeStyle=cut?'#FF4D5E':'#1E2640';ctx.beginPath();ctx.moveTo(10,6);ctx.quadraticCurveTo(22,14,26,7);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#1E2640';
      ctx.fillStyle=dB?'#8A91A8':'#FF4F9A';rr(20,-1,18,12,4);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 8px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('B',29,5.5);ctx.restore();}
    ctx.translate(0,2);
    // Down Under the routers are mounted the other way up. The packets don't seem to mind.
    const flip=!!C.au;if(flip){ctx.save();ctx.translate(0,-4);ctx.rotate(Math.PI);}
    ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(-10,-6);ctx.lineTo(-13,-17);ctx.moveTo(10,-6);ctx.lineTo(13,-17);ctx.stroke();
    ctx.fillStyle=down?'#FF4D5E':'#FFD23F';ctx.beginPath();ctx.arc(-13,-18,2.6,0,7);ctx.arc(13,-18,2.6,0,7);ctx.fill();ctx.stroke();
    if((p.routers||1)>=2){ctx.fillStyle=down?'#6E7590':'#D63B7F';rr(-13,-13,34,16,6);ctx.fill();ctx.stroke();}
    if(p.gen){ctx.fillStyle='#FFD23F';rr(-27,-1,9,11,2);ctx.fill();ctx.stroke();}
    ctx.fillStyle=down?'#8A91A8':'#FF4F9A';rr(-17,-7,34,16,6);ctx.fill();ctx.stroke();
    if((p.rgen||0)>0){const G=RG[p.rgen||0];ctx.fillStyle=G.badge?'#7CFFB2':'#FFD23F';ctx.beginPath();ctx.arc(17,-7,6,0,7);ctx.fill();ctx.lineWidth=1.8;ctx.stroke();ctx.fillStyle='#1E2640';ctx.font='900 8px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(G.badge||String(G.cls+1),17,-6.5);ctx.lineWidth=2.2;}
    if(down){ctx.fillStyle='#fff';ctx.font='900 14px "Baloo 2", sans-serif';ctx.textAlign='center';ctx.fillText('zzz',20,-14);}
    if(flip)ctx.restore();
    ctx.translate(0,-2);
  }
  if(st.ixDraw&&!st.ixHot)cityIX(C,p,t,h,false,0);
  if(st.inc){ctx.fillStyle='#FF4D5E';ctx.beginPath();ctx.arc(-20,-h+2,7,0,7);ctx.fill();ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 11px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',-20,-h+3);}
}
// The picture of a city in a given state, at the quantised scale kq: painted once and kept until it is not needed.
// Its key is kept per city (CKEY) and joined again only when one of its parts changes: the yes/no parts are bits of f.
const CKEY=new Map();
function citySprite(C,p,t,cs,kq,ph,st){const id=C.id,
    f=(st.down?1:0)|(p?2:0)|(p&&p.site2?4:0)|(p&&p.site2&&siteDown(id,'b')?8:0)|(p&&p.ringcut>S.day?16:0)|(p&&p.gen?32:0)|(C.au?64:0)|(st.ixDraw?128:0)|
      (st.ixHot?256:0)|(S.myIx[id]?512:0)|(hasIxAt(id)?1024:0)|(!p&&ixQuiet(id)?2048:0)|(st.feed?4096:0)|(st.inc?8192:0),
    ro=p?(p.routers||1):0,rg=p?(p.rgen||0):0,ix=ixName(id)||'',sp=st.sel?ph.sel:-1,dd=ph.dd;
  let m=CKEY.get(id);
  if(!m||m.t!==t||m.kq!==kq||m.f!==f||m.ro!==ro||m.rg!==rg||m.ix!==ix||m.sp!==sp||m.dd!==dd)CKEY.set(id,m={t,kq,f,ro,rg,ix,sp,dd,k:['city',id,t,kq,f,ro,rg,ix,sp,dd].join('|')});
  const e=spriteHas(m.k);if(e)return e;
  const W=Math.ceil(92*kq),H=Math.ceil(84*kq),ax=45*kq,ay=46*kq;
  return spriteEntry(m.k,W,H,ax,ay,g=>{g.translate(ax,ay);cityStatic(C,p,t,cs,kq,ph,st);});}
// The parts that move, in the city's frame at the true scale k.
function cityMoving(C,p,t,cs,k,sx,sy,now,h,st,hot){const down=st.down,K=k*cs;
  if(p){// The POP's own frame is shifted 2 down, and mirrored Down Under (C.au): mp() takes a point of that frame to the city's.
    // A point (x,y) of that frame is at sx+(fl?-x:x)*K, sy+(fl?-y-2:y+2)*K (written out: no array per light per frame).
    const fl=!!C.au,sf=sfOf(R,C.id);
    if(!down&&(R.nodeLoad[C.id]||0)>=(R.nodeCap[C.id]||1e12)*0.95){for(let i=0;i<3;i++){const tt=(now/700+i/3)%1,x=6+i*3,y=-12-tt*18;dot(sx+(fl?-x:x)*K,sy+(fl?-y-2:y+2)*K,(3+tt*4)*K,'rgba(90,98,130,1)',0.55*(1-tt));}}
    // The four lights: a disc each, lit or not.
    for(let i=0;i<4;i++){const lit=down?false:(((now/(160+i*37))|0)+i)%3!==0,x=-10+i*6.6,col=down?'#3B4260':lit?(sf<0.9?'#FF4D5E':'#7CFFB2'):'#2A3150';dot(sx+(fl?-x:x)*K,sy+(fl?-3:3)*K,2.1*K,col,1);}
  }
  // A flashing IX: two pictures, one per colour.
  if(st.ixDraw&&st.ixHot){const on=Math.sin(now/180)>0,ix=p?19:SKY_W[t]/2+4;stamp('ixhot'+(on?1:0),22,22,11,11,K,sx+ix*K,sy+(2-h)*K,()=>{ctx.translate(-ix,h-2);ctx.strokeStyle='#1E2640';cityIX(C,p,t,h,true,on?1:-1);},true);}
  // Hot badges: the red disc pulses, the ring and the letter over it stay.
  if(hot&&p){let y=-14;const pulse=.75+.25*Math.sin(now/200);for(const kk of ['r','t','p','c']){if(!hot[kk])continue;const bx=sx-29*K,by=sy+y*K;dot(bx,by,6.5*K,'#FF4D5E',pulse);
    stamp('hotb|'+HOTL[kk],18,18,9,9,K,bx,by,g=>{g.lineWidth=2;g.strokeStyle='#1E2640';g.beginPath();g.arc(0,0,6.5,0,7);g.stroke();g.fillStyle='#fff';g.font='900 8px Nunito, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(HOTL[kk],0,0.5);},true);y+=14;}}
  // The offer bubble bobs over the city.
  if(st.off)stamp('offer|'+(st.big?2:1),30,28,15,12,K,sx-2*K,sy+(-h-16+Math.sin(now/250)*3)*K,g=>{g.fillStyle='#fff';g.strokeStyle='#1E2640';g.lineWidth=2.2;g.beginPath();g.ellipse(0,0,11,9,0,0,7);g.fill();g.stroke();
    g.beginPath();g.moveTo(-3,8);g.lineTo(-5,14);g.lineTo(2,8);g.fill();g.fillStyle=st.big?'#FF4F9A':'#16A866';g.font='900 13px "Baloo 2", sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(st.big?'$$':'$',0,1);},true);}
function drawCity(C,sx,sy,sc,now,lyOverride,dem){
  if(CM.far)return drawCityFar(C,sx,sy,sc,now,lyOverride);
  const hot=(UI.hotMap||{})[C.id];
  const p=S.pops[C.id],down=p&&p.down>S.day,sel=UI.sel&&UI.sel.type==='city'&&UI.sel.id===C.id,hov=UI.hover===C.id||(UI.snap&&UI.snap.id===C.id);
  // No room for its skyline here: a quiet dot, a little bigger for bigger cities, until you zoom in (cityRoom).
  if(dem&&!p&&!sel&&!hov){const r=(2.6+cTier(C.id)*0.35)*sc,rq=Math.round(r*4)/4,fill=hasIxAt(C.id)?'#FFD23F':'#FFFFFF',S2=Math.ceil(rq*2+4);
    const qk=rq*8+(fill==='#FFFFFF'?0:1);let key=QKEY.get(qk);if(!key)QKEY.set(qk,key=['quiet',rq,fill].join('|'));
    const e=spriteHas(key)||spriteEntry(key,S2,S2,S2/2,S2/2,g=>{g.translate(S2/2,S2/2);g.fillStyle=fill;g.strokeStyle='#1E2640';g.lineWidth=1.6;g.beginPath();g.arc(0,0,rq,0,7);g.fill();g.stroke();});
    blit(e,sx-e.ax,sy+2*sc-e.ay,e.w,e.h);return;}
  const t=cTier(C.id),cs=p?1:CSC[t],k=sc*(hov?1.15:1),kq=sprQ(k);
  const ixn=ixName(C.id),ixDraw=!!ixn&&(ixShown(C.id,p)||(hot&&hot.ix)||sel||hov),ixHot=!!(ixDraw&&hot&&hot.ix);
  const st={down:!!down,feed:!!(UI.feed&&UI.feed.has(C.id)),sel:!!sel,inc:CM.inc.has(C.id),ixDraw,ixHot,off:CM.off.has(C.id),big:CM.big.has(C.id)};
  const ph=cityPhase(C,p,sel,now),spr=citySprite(C,p,t,cs,kq,ph,st),r=k/kq;
  // The glow of a city in trouble pulses: a disc each frame, under the picture (as it was under the skyline).
  if(ph.gl>=0)dot(sx,sy-6*k,26*k,'rgba(255,77,94,1)',.35+.25*(2*ph.gl/7-1));
  blit(spr,sx-spr.ax*r,sy-spr.ay*r,spr.w*r,spr.h*r);
  cityMoving(C,p,t,cs,k,sx,sy,now,p?18:SKY_H[t],st,hot);
  if(CM.dish&&p&&CM.dish.has(C.id))dishBadge(sx,sy-13*k,CM.dish.get(C.id),CM.dl&&CM.dl[C.id],k); // between the antennas: the corners are taken
  // label
  if((cam.z>=0.62||p||sel||hov)&&(lyOverride!==null||hov)){
    ctx.font=`800 ${p?13:12}px "Baloo 2", sans-serif`;const t=C.name,tw=LBLW[C.id+(p?1:0)]||(LBLW[C.id+(p?1:0)]=ctx.measureText(t).width+14),ly=lyOverride==null?sy+16*sc+8:lyOverride;
    pill(t,ctx.font,tw,19,9,p?'#FF4F9A':'#FFFFFF',p?'#FFFFFF':'#1E2640','#1E2640',2,sx,ly+0.5,0.5);
  }
}

