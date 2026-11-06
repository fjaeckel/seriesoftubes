/* A frame. An error from the card itself (glErr()) gives WebGL up for this session and draws the same frame again in
   2D, once; any other error goes on to the loop's tickErr(). Either way the 2D context and the sprite queue are reset. */
function draw(now){for(let pass=0;;pass++){let err=null;DFC=new Map();SPR_F++;
  try{drawFrame(now);}catch(e){err=e;}
  try{glsFrameEnd();}catch(e){if(!err)err=e;}finally{DFC=null;GLS.frame=false;GLS.n=0;ctx=CTX0;sprcTrim();}
  if(!err)return;if(!err.glErr||pass)throw err;glKill(err);}}
// Rectangles on a 64 px grid: a new one is compared only with the few that share its cells (a plain list made the
// label placement quadratic in the number of cities).
class RGrid{constructor(){this.m=new Map();}
  cells(r,f){for(let cx=Math.floor(r.x/64);cx<=Math.floor((r.x+r.w)/64);cx++)for(let cy=Math.floor(r.y/64);cy<=Math.floor((r.y+r.h)/64);cy++)f(cx*100003+cy);}
  push(r){this.cells(r,k=>{const a=this.m.get(k);if(a)a.push(r);else this.m.set(k,[r]);});}
  hits(r){let h=false;this.cells(r,k=>{if(h)return;const a=this.m.get(k);if(a)for(const q of a)if(r.x<q.x+q.w&&q.x<r.x+r.w&&r.y<q.y+q.h&&q.y<r.y+r.h){h=true;return;}});return h;}}
function drawFrame(now){
  if(!ctx)return;
  const ks=visibleKs(),z=cam.z,G=glOn();
  // WebGL on: the sea, land, waves, clouds and cables are on the card (glBegin); the 2D canvas below them stays empty.
  // Off (2D chosen, no game, a puzzle, the card given up), its layers are hidden here, before anything can return early.
  if(G){try{glBegin(now,ks);}catch(e){throw glErr(e);}}
  else{glShow(false);GLX.c0clean=false;const wl=worldLayer(z);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  // sea
  const g=ctx.createLinearGradient(0,0,0,CH);g.addColorStop(0,'#62CBEA');g.addColorStop(1,'#43AED6');ctx.fillStyle=g;ctx.fillRect(0,0,CW,CH);
  for(const k of ks){
    ctx.setTransform(DPR*z,0,0,DPR*z,DPR*((k*W-cam.x)*z+CW/2),DPR*((-cam.y)*z+CH/2));
    // waves: one path, one stroke
    ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=2/z;ctx.lineCap='round';ctx.beginPath();
    const ph0=now/900;for(const [x,y,ph] of WAVES){const o=Math.sin(ph0+ph*6)*3;ctx.moveTo(x-9+o,y);ctx.quadraticCurveTo(x-4.5+o,y-4,x+o,y);ctx.quadraticCurveTo(x+4.5+o,y+4,x+9+o,y);}ctx.stroke();
  }
  for(const k of ks){if(wl)drawWorldLayer(wl,k,z,ks[0]);else{ctx.setTransform(DPR*z,0,0,DPR*z,DPR*((k*W-cam.x)*z+CW/2),DPR*((-cam.y)*z+CH/2));paintWorld(ctx,z,false);}}
  for(const k of ks){
    ctx.setTransform(DPR*z,0,0,DPR*z,DPR*((k*W-cam.x)*z+CW/2),DPR*((-cam.y)*z+CH/2));
    // clouds
    ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();
    for(const c of CLOUDS){const x=((c.x+now/1000*c.v)%(W+200))-100,y=c.y;ctx.moveTo(x+16*c.s,y);ctx.arc(x,y,16*c.s,0,7);ctx.moveTo(x+38*c.s,y-8*c.s);ctx.arc(x+18*c.s,y-8*c.s,20*c.s,0,7);ctx.moveTo(x+55*c.s,y);ctx.arc(x+40*c.s,y,15*c.s,0,7);}ctx.fill();
  }
  }
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if(!S)return;
  const sc=iconScale(),day=S.day;zoomHold(sc,G);
  // cable systems
  drawCables(ks);
  // links
  AR_PILLS.length=0;
  const far=lodFar(),ML=mapLinks(day),LG=ML.LG,GM=ML.GM,PI=ML.PI,busy=linesOnScreen(GM,ks)>MAP_BUSY;
  // WebGL on: the card draws every line and packet now, and the rest (labels, markers, cities…) goes on the overlay.
  if(G)try{glFrame(ML,ks,far,busy,now,sc);}catch(e){throw glErr(e);}
  for(let gi=0;gi<LG.length;gi++){const grp=LG[gi],{l,many,up,cap,load,df,bld,cut,dark,vx,w0,col,dash,pk}=ML.looks[gi],gm=GM[gi];
    const pz=pzOn(),arPz=pz&&!!S.ar,sel=(UI.sel&&UI.sel.type==='link'&&grp.some(x=>x.id===UI.sel.id))||(pz&&pzLinkHot(grp));let lab=null;
    // Only what sits at the middle of a line is still painted here when the card draws the lines.
    if(G&&!(bld||cut&&!vx||sel||z>0.9&&!busy))continue;
    const w=w0*sc*(far?0.5:1),np=gm.pts.length;
    if(SX.length<np){SX=new Float64Array(np*2);SY=new Float64Array(np*2);}
    for(const k of ks){
      // Off screen (with room for the widest line and the markers at its middle): nothing of it would show. The line's
      // box is kept on its cached geometry, so a link off screen is skipped without projecting its points.
      const bb=gm.bb||(gm.bb=(()=>{let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;for(const p of gm.pts){if(p[0]<a)a=p[0];if(p[0]>b)b=p[0];if(p[1]<c)c=p[1];if(p[1]>d)d=p[1];}return [a,b,c,d];})());
      if((bb[1]+k*W-cam.x)*cam.z+CW/2<-40||(bb[0]+k*W-cam.x)*cam.z+CW/2>CW+40||(bb[3]-cam.y)*cam.z+CH/2<-40||(bb[2]-cam.y)*cam.z+CH/2>CH+40)continue;
      let mxx,my;
      if(G){const m=gm.mid||(gm.mid=polyAt(gm.pts,gm.cum,.5));mxx=(m[0]+k*W-cam.x)*cam.z+CW/2;my=(m[1]-cam.y)*cam.z+CH/2;}else{
      // Screen points as toS() gives them, kept in SX/SY.
      for(let i=0;i<np;i++){const p=gm.pts[i];SX[i]=(p[0]+k*W-cam.x)*cam.z+CW/2;SY[i]=(p[1]-cam.y)*cam.z+CH/2;}
      const path=()=>{ctx.beginPath();ctx.moveTo(SX[0],SY[0]);for(let i=1;i<np;i++)ctx.lineTo(SX[i],SY[i]);};
      ctx.lineCap='round';ctx.lineJoin='round';
      if(sel){ctx.strokeStyle='rgba(255,79,154,.35)';ctx.lineWidth=w+14;path();ctx.stroke();}
      ctx.strokeStyle='#1E2640';ctx.lineWidth=w+4;ctx.setLineDash(LDASH[dash]);path();ctx.stroke();
      ctx.strokeStyle=col;ctx.lineWidth=w;ctx.stroke();ctx.setLineDash([]);
      // Architect runs: tubes sharing one trench are drawn as strands of one bundle (one snip takes them all).
      if(pz&&many){ctx.strokeStyle='#1E2640';ctx.lineWidth=1.3;for(let j=1;j<grp.length;j++){const d=w*(j/grp.length-0.5);ctx.beginPath();for(let i=0;i<np;i++){const a=Math.max(0,i-1),b=Math.min(np-1,i+1),dx=SX[b]-SX[a],dy=SY[b]-SY[a],n=Math.hypot(dx,dy)||1,x=SX[i]-dy/n*d,y=SY[i]+dx/n*d;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}path();}
      // Still the same path: strokes keep it, so the dotted fiber line goes on top without building it again.
      if(df&&!bld&&!dark&&!busy){ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=Math.max(1,w*0.25);ctx.setLineDash([1,6]);ctx.stroke();ctx.setLineDash([]);}
      const at=t=>polyAtXY(SX,SY,gm.cum,t);
      if(pk){const n=pk>>(far?1:0)||1,len=gm.len*z,spd=90;
        ctx.fillStyle='#fff';ctx.strokeStyle='#1E2640';ctx.lineWidth=far?1:1.5;
        const rr2=far?1.6:Math.max(2.2,w*.42),base=now/1000*spd/Math.max(len,40);ctx.beginPath();for(let i=0;i<n;i++){let t=(base+i/n)%1;if(i%2)t=1-t;const [px,py]=at(t);ctx.moveTo(px+rr2,py);ctx.arc(px,py,rr2,0,7);}ctx.fill();ctx.stroke();}
      [mxx,my]=at(.5);}
      if(bld){if(far)stamp('bldfar',12,12,6,6,1,mxx,my,g=>{g.fillStyle='#FF8A3D';g.strokeStyle='#1E2640';g.lineWidth=1.5;g.beginPath();g.arc(0,0,4,0,7);g.fill();g.stroke();});else drawCone(mxx,my,now);}
      else if(cut&&!vx){if(far)stamp('cutfar',14,14,7,7,1,mxx,my,g=>{g.fillStyle='#FF4D5E';g.strokeStyle='#1E2640';g.lineWidth=1.5;g.beginPath();g.arc(0,0,5,0,7);g.fill();g.stroke();g.fillStyle='#fff';g.font='900 8px Nunito, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('!',0,0.5);});else if(!arPz)drawBackhoe(mxx,my,now,l.sub);}
      else if(sel||(pz?!S.ar:z>0.9&&!busy)){const t=lab||(lab=pz?pzLinkLab(grp,up||[l],load,cap):many?groupLabel(grp,up):capName(l));ctx.font='800 11px "Baloo 2", sans-serif';let tw=LINKW.get(t);if(tw===undefined)LINKW.set(t,tw=ctx.measureText(t).width+10);pill(t,ctx.font,tw,17,8,'#fff','#1E2640','#1E2640',2,mxx,my-0.5,1.5);}
      // Every puzzle: say whether the tubes between two cities share one trench or take separate paths.
      if(pz&&!cut&&!bld&&(many||arPaths(l)>1)&&(many||lineIdx(l,PI.get(edgeKey(l)))===0))AR_PILLS.push([mxx,my+(sel||!S.ar?19:0),many?tr('architect.n_in_one_trench',{n:grp.length}):'✓ '+tr('architect.n_paths',{n:arPaths(l)}),many]);
    }
  }
  // drag preview
  if(UI.drag&&UI.drag.mode==='link'){
    const A=CITY[UI.drag.from];let tx=UI.drag.cx,ty=UI.drag.cy;
    if(UI.snap){const sv=UI.snap;tx=sv.sx;ty=sv.sy;}
    let [ax,ay]=toS(A.x,A.y,0);if(UI.snap){const B=CITY[UI.snap.id];const bxw=A.x+wrapDx(A.x,B.x);[tx,ty]=toS(bxw,B.y,0);}else{/* nearest copy of origin to cursor */for(const k of [-1,1]){const [px,py]=toS(A.x,A.y,k);if(Math.abs(px-tx)<Math.abs(ax-tx)){ax=px;ay=py;}}}
    if(UI.snap){const B=CITY[UI.snap.id];const wx=A.x+wrapDx(A.x,B.x);for(const k of [-1,1]){const [px,py]=toS(A.x,A.y,k),[qx]=toS(wx,B.y,k);if(Math.abs(qx-CW/2)<Math.abs(tx-CW/2)){ax=px;ay=py;tx=qx;}}}
    // On the card it goes under the cities and their labels, as in 2D (the overlay would put it over them).
    if(G)try{glDrag(ax,ay,tx,ty,now);}catch(e){throw glErr(e);}
    else{ctx.strokeStyle='#1E2640';ctx.lineWidth=7;ctx.lineCap='round';ctx.setLineDash(LDASH[7]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(tx,ty);ctx.stroke();
      ctx.strokeStyle='#FF4F9A';ctx.lineWidth=4;ctx.lineDashOffset=-now/30;ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;}
    if(UI.snap&&UI.snap.id!==UI.drag.from){const b=UI.snap.id,km=kmBetween(UI.drag.from,b),sub=isSub(UI.drag.from,b);
      const t=`${km.toLocaleString()} km${sub?' · '+tr('common.subsea'):''} · ${sub&&!cablesFor(UI.drag.from,b).length?tr('draw.no_cable_lands_here'):tr('draw.from_price_mo',{price:fmt$(waveMo(km,sub,0))})}`;
      ctx.font='800 13px "Baloo 2", sans-serif';const tw=ctx.measureText(t).width+18;const lx=(ax+tx)/2,ly=(ay+ty)/2-22;
      pill(t,ctx.font,tw,24,12,'#1E2640','#fff','#1E2640',1,lx,ly,1);}
  }
  // cities
  UI.feed=null;if(UI.sel&&UI.sel.type==='link'){const sl=S.links.find(x=>x.id===UI.sel.id);const rec=sl&&R.ef[edgeKey(sl)];if(rec){UI.feed=new Set(Object.keys(rec.eg).map(k=>R.egDesc[k].city));UI.dest=new Set(Object.keys(rec.dst));}}
  // Place labels: your POPs and the selected city first, then others; a label that would overlap moves above its city or hides.
  const vis=[];for(const C of CITIES){const sy=(C.y-cam.y)*cam.z+CH/2;if(sy<-60||sy>CH+60)continue;if(C.off&&!cityOn(C.id))continue;if(pzHide(C.id))continue;for(const k of ks){const sx=(C.x+k*W-cam.x)*cam.z+CW/2;if(sx<-60||sx>CW+60)continue;vis.push({C,sx,sy});}}
  const prio=v=>(UI.sel&&UI.sel.type==='city'&&UI.sel.id===v.C.id?0:S.pops[v.C.id]?1:2);vis.sort((a,b)=>prio(a)-prio(b)||b.C.P-a.C.P);
  const rects=new RGrid(),labs=new RGrid(),hit=(r)=>rects.hits(r);
  const farL=lodFar();
  // Which cities show an offer bubble (a big one?) or an incident marker, worked out once for all of them.
  CM.off=new Set();CM.big=new Set();for(const o of S.offers){const big=BIZ_T[o.type].lv>=3||BIZ_T[o.type].event;for(const c of bCities(o)){CM.off.add(c);if(big)CM.big.add(c);}}
  CM.inc=new Set(S.inc.filter(i=>i.type!=='leak').map(i=>i.ref));CM.far=farL;CM.dish=pieDishMap();CM.dl=CM.dish&&R&&R.pie?R.pie.load:null;
  // Zoomed in, crowded small cities give way to bigger ones and become dots (75-city-size.js).
  const csc=cityScale(sc);if(farL)for(const v of vis)v.dem=false;else cityRoom(vis,csc);
  if(pzOn()&&!farL)for(const v of vis)if(pzQuiet(v.C.id))v.dem=true;
  for(const v of vis){if(farL){const r=FAR_R[cTier(v.C.id)]+3;rects.push({x:v.sx-r,y:v.sy-r,w:2*r,h:2*r});continue;}
    if(v.dem){rects.push({x:v.sx-5*csc,y:v.sy-5*csc,w:10*csc,h:10*csc});continue;}const h=cityTop(v.C.id,S.pops[v.C.id])*csc;rects.push({x:v.sx-v.r,y:v.sy-h,w:2*v.r,h:h+10*csc});}
  for(const v of vis){const p=S.pops[v.C.id];ctx.font=`800 ${p?13:12}px "Baloo 2", sans-serif`;const tw=(LBLW[v.C.id+(p?1:0)]||(LBLW[v.C.id+(p?1:0)]=ctx.measureText(v.C.name).width+14));
    if((farL&&prio(v)>1&&UI.hover!==v.C.id)||v.dem){v.ly=null;continue;}
    const h=farL?6:cityTop(v.C.id,p);const below=farL?v.sy+15:v.sy+16*csc+8,above=farL?v.sy-15:v.sy-h*csc-17*csc;let ly=null;
    for(const y of [below,above]){const r={x:v.sx-tw/2-2,y:y-10,w:tw+4,h:21};if(!hit(r)){ly=y;rects.push(r);labs.push(r);break;}}
    // Your POPs may sit over a city icon, but not over another name: that one waits until you zoom in.
    if(ly===null&&prio(v)===1)for(const y of [below,above]){const r={x:v.sx-tw/2,y:y-10,w:tw,h:21};if(!labs.hits(r)){ly=y;rects.push(r);labs.push(r);break;}}
    if(ly===null&&(prio(v)===0||(prio(v)===1&&(v.C.id===S.home||UI.hover===v.C.id)))){ly=below;const r={x:v.sx-tw/2,y:below-10,w:tw,h:21};rects.push(r);labs.push(r);}
    v.ly=ly;}
  if(pzOn()){for(let i=vis.length-1;i>=0;i--)pzDrawCity(vis[i],csc,now);pzDrawMarks(ks,now);}else for(let i=vis.length-1;i>=0;i--){const v=vis[i];drawCity(v.C,v.sx,v.sy,csc,now,v.ly,v.dem);}
  // cable ships at sea (88-cable-ships.js), over the city labels so a ship leaving port stays in sight
  drawShips(ks,now);
  // Architect runs: what the tubes between two cities are (one trench, or separate paths), above the cities.
  for(const [x,y,t,one] of AR_PILLS){ctx.font='800 11px "Baloo 2", sans-serif';const tw=ctx.measureText(t).width+12;ctx.fillStyle=one?'#FFE3C2':'#DDF7E7';ctx.strokeStyle=one?'#FF8A3D':'#16A866';ctx.lineWidth=2;rr(x-tw/2,y-9,tw,17,8);ctx.fill();ctx.stroke();ctx.fillStyle='#1E2640';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x,y+1);}
  // the chaos monkey (woken here after a reload, wherever it last snipped)
  if(UI.mk)mkDraw(ks);else if(mkOn()&&!pzOn()&&CITY[S.monkey.c])mkStart(S.monkey.c);
  // floaters
  for(let i=FLOATS.length-1;i>=0;i--){const f=FLOATS[i],a=(now-f.t)/1600;if(a>1||f.s!==S){FLOATS.splice(i,1);continue;}
    const font='800 17px "Baloo 2", sans-serif';if(f.w===undefined){ctx.font=font;f.w=ctx.measureText(f.text).width;}
    for(const k of ks){const [sx,sy]=toS(f.x,f.y,k);ctx.globalAlpha=1-a*a;textStamp(f.text,font,17,f.w,f.col,'#fff',4,sx,sy-a*40);ctx.globalAlpha=1;}}
}
/* A map with more than MAP_BUSY lines on screen (huge late-game networks) is a tangle where nobody reads thousands of
   overlapping labels or fiber dots, and painting them took about half of every frame. They come back once fewer lines
   show, zooming in for instance; the selected link keeps its label. */
const MAP_BUSY=1000;
// How many lines draw() would paint: one per group and world copy whose box is on screen (the same margin as draw()).
function linesOnScreen(GM,ks){let n=0;for(const gm of GM){const b=gm.box||(gm.box=ptsBox(gm.pts));
  for(const k of ks){const x0=(b[0]+k*W-cam.x)*cam.z+CW/2,x1=(b[2]+k*W-cam.x)*cam.z+CW/2,y0=(b[1]-cam.y)*cam.z+CH/2,y1=(b[3]-cam.y)*cam.z+CH/2;
    if(!(x1<-40||x0>CW+40||y1<-40||y0>CH+40))n++;}}return n;}
function ptsBox(pts){let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const p of pts){if(p[0]<a)a=p[0];if(p[1]<b)b=p[1];if(p[0]>c)c=p[0];if(p[1]>d)d=p[1];}return [a,b,c,d];}
function drawCone(x,y,now){stamp('cone',26,28,13,13,1,x,y-12+Math.sin(now/300)*1.5,()=>{ctx.strokeStyle='#1E2640';ctx.lineWidth=2;ctx.fillStyle='#FF8A3D';ctx.beginPath();ctx.moveTo(-7,9);ctx.lineTo(0,-10);ctx.lineTo(7,9);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.fillRect(-4,-1,8,3);ctx.fillStyle='#1E2640';rr(-10,8,20,4,2);ctx.fill();});}
// Static land + cable map, rendered once per zoom bucket into an offscreen canvas.
function paintWorld(c,z,withCables){const LANDP=lodFar()?LANDP_FAR:LANDP_ALL;
  for(const o of [0,W,-W]){c.save();c.translate(o+5/z,7/z);c.fillStyle='rgba(20,90,130,.35)';for(const p of LANDP)c.fill(p);c.restore();}
  c.strokeStyle='#F8E6A8';c.lineWidth=10/z;c.lineJoin='round';for(const o of [0,W,-W]){c.save();c.translate(o,0);for(const p of LANDP)c.stroke(p);c.restore();}
  c.fillStyle='#9BDA6C';for(const o of [0,W,-W]){c.save();c.translate(o,0);for(const p of LANDP)c.fill(p);c.restore();}
  c.fillStyle='#86CB5B';c.beginPath();for(const [x,y,r] of HILLS){c.moveTo(x+r*1.4,y);c.ellipse(x,y,r*1.4,r*.8,0,0,Math.PI*2);}c.fill();
  c.fillStyle='rgba(255,255,255,.18)';c.beginPath();for(const [x,y,r] of HILLS){c.moveTo(x-r*.3+r*.6,y-r*.25);c.ellipse(x-r*.3,y-r*.25,r*.6,r*.3,0,0,Math.PI*2);}c.fill();
  c.strokeStyle='#1E2640';c.lineWidth=2.5/z;for(const o of [0,W,-W]){c.save();c.translate(o,0);for(const p of LANDP)c.stroke(p);c.restore();}
  if(withCables)for(const off of [0,W,-W]){c.save();c.translate(off,0);for(const cp of CABLE_PAIRS){const C=CAB[cp.cid];c.globalAlpha=0.4;c.strokeStyle=cableCol(C);c.lineWidth=1.6/z;c.lineJoin='round';c.setLineDash(C.age==='old'?[6/z,5/z]:[]);c.beginPath();c.moveTo(cp.pts[0][0],cp.pts[0][1]);for(let i=1;i<cp.pts.length;i++)c.lineTo(cp.pts[i][0],cp.pts[i][1]);c.stroke();}c.restore();}
  c.globalAlpha=1;c.setLineDash([]);
}
const WL={key:null,cv:null,zAt:0,lastZ:0,sc:1,ox:0,oy:0,full:true};const MAXPX=4096;
