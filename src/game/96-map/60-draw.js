function draw(now){
  if(!ctx)return;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  // sea
  const g=ctx.createLinearGradient(0,0,0,CH);g.addColorStop(0,PREFS.darkMode?'#1A3A5A':'#62CBEA');g.addColorStop(1,PREFS.darkMode?'#0E2A4A':'#43AED6');ctx.fillStyle=g;ctx.fillRect(0,0,CW,CH);
  const ks=visibleKs(),z=cam.z;
  const wl=worldLayer(z);
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
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if(!S)return;
  const sc=iconScale(),day=S.day;
  // cable systems
  drawCables(ks);
  // links
  const far=lodFar(),PI=pairIdx();
  for(const grp of linkGroups()){const l=grp[0],many=grp.length>1,up=many?grp.filter(x=>!linkDown(x)):null;
    const gm=linkGeom(l,PI.get(edgeKey(l))),cap=many?up.reduce((a,x)=>a+capOf(x),0):capOf(l),load=many?grp.reduce((a,x)=>a+(R.load[x.id]||0),0):(R.load[l.id]||0),u=cap?load/cap:0,df=l.kind==='df',bld=df&&l.ready>day,cut=!bld&&(many?!up.length:linkDown(l))&&!(df&&!(l.ch||[]).length),dark=df&&!bld&&!(l.ch||[]).length,vx=l.kind==='vxc';
    const sel=UI.sel&&UI.sel.type==='link'&&grp.some(x=>x.id===UI.sel.id);
    const w=(vx?2.2:(2.5+Math.max(...grp.map(tierW))*1.8+(many?Math.min(1.5,(grp.length-1)*0.5):0)))*sc*(far?0.5:1),np=gm.pts.length;
    if(SX.length<np){SX=new Float64Array(np*2);SY=new Float64Array(np*2);}
    for(const k of ks){
      // Screen points as toS() gives them, kept in SX/SY.
      let mn=Infinity,mx=-Infinity;for(let i=0;i<np;i++){const p=gm.pts[i],x=(p[0]+k*W-cam.x)*cam.z+CW/2;SX[i]=x;SY[i]=(p[1]-cam.y)*cam.z+CH/2;if(x<mn)mn=x;if(x>mx)mx=x;}
      if(mx<-40||mn>CW+40)continue;
      const path=()=>{ctx.beginPath();ctx.moveTo(SX[0],SY[0]);for(let i=1;i<np;i++)ctx.lineTo(SX[i],SY[i]);};
      ctx.lineCap='round';ctx.lineJoin='round';
      if(sel){ctx.strokeStyle='rgba(255,79,154,.35)';ctx.lineWidth=w+14;path();ctx.stroke();}
      ctx.strokeStyle='#1E2640';ctx.lineWidth=w+4;ctx.setLineDash(cut?[8,8]:vx?[2,7]:bld?[10,8]:[]);path();ctx.stroke();
      ctx.strokeStyle=bld?'#C9B27C':dark?'#5D6788':cut?'#FF4D5E':vx?FAB[l.prov].col:l.sub?(u>0.001?utilCol(u):'#7FD8EE'):utilCol(u);ctx.lineWidth=w;ctx.stroke();ctx.setLineDash([]);
      // Still the same path: strokes keep it, so the dotted fiber line goes on top without building it again.
      if(df&&!bld&&!dark){ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=Math.max(1,w*0.25);ctx.setLineDash([1,6]);ctx.stroke();ctx.setLineDash([]);}
      const at=t=>polyAtXY(SX,SY,gm.cum,t);
      if(!cut&&load>0.01){const n=clamp(Math.round(2+u*10),2,12)>>(far?1:0)||1,len=gm.len*z,spd=90;
        ctx.fillStyle='#fff';ctx.strokeStyle='#1E2640';ctx.lineWidth=far?1:1.5;
        const rr2=far?1.6:Math.max(2.2,w*.42),base=now/1000*spd/Math.max(len,40);ctx.beginPath();for(let i=0;i<n;i++){let t=(base+i/n)%1;if(i%2)t=1-t;const [px,py]=at(t);ctx.moveTo(px+rr2,py);ctx.arc(px,py,rr2,0,7);}ctx.fill();ctx.stroke();}
      const [mx2,my]=at(.5);const mxx=mx2;
      if(bld){if(far){ctx.fillStyle='#FF8A3D';ctx.strokeStyle='#1E2640';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(mxx,my,4,0,7);ctx.fill();ctx.stroke();}else drawCone(mxx,my,now);}
      else if(cut&&!vx){if(far){ctx.fillStyle='#FF4D5E';ctx.strokeStyle='#1E2640';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(mxx,my,5,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 8px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',mxx,my+0.5);}else drawBackhoe(mxx,my,now,l.sub);}
      else if(z>0.9||sel){const t=many?groupLabel(grp,up):capName(l);ctx.font='800 11px "Baloo 2", sans-serif';let tw=LINKW.get(t);if(tw===undefined)LINKW.set(t,tw=ctx.measureText(t).width+10);ctx.fillStyle='#fff';ctx.strokeStyle='#1E2640';ctx.lineWidth=2;rr(mxx-tw/2,my-9,tw,17,8);ctx.fill();ctx.stroke();ctx.fillStyle='#1E2640';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,mxx,my+1);}
    }
  }
  // drag preview
  if(UI.drag&&UI.drag.mode==='link'){
    const A=CITY[UI.drag.from];let tx=UI.drag.cx,ty=UI.drag.cy;
    if(UI.snap){const sv=UI.snap;tx=sv.sx;ty=sv.sy;}
    let [ax,ay]=toS(A.x,A.y,0);if(UI.snap){const B=CITY[UI.snap.id];const bxw=A.x+wrapDx(A.x,B.x);[tx,ty]=toS(bxw,B.y,0);}else{/* nearest copy of origin to cursor */for(const k of [-1,1]){const [px,py]=toS(A.x,A.y,k);if(Math.abs(px-tx)<Math.abs(ax-tx)){ax=px;ay=py;}}}
    if(UI.snap){const B=CITY[UI.snap.id];const wx=A.x+wrapDx(A.x,B.x);for(const k of [-1,1]){const [px,py]=toS(A.x,A.y,k),[qx]=toS(wx,B.y,k);if(Math.abs(qx-CW/2)<Math.abs(tx-CW/2)){ax=px;ay=py;tx=qx;}}}
    ctx.strokeStyle='#1E2640';ctx.lineWidth=7;ctx.lineCap='round';ctx.setLineDash([2,12]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(tx,ty);ctx.stroke();
    ctx.strokeStyle='#FF4F9A';ctx.lineWidth=4;ctx.lineDashOffset=-now/30;ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;
    if(UI.snap&&UI.snap.id!==UI.drag.from){const b=UI.snap.id,km=kmBetween(UI.drag.from,b),sub=isSub(UI.drag.from,b);
      const t=`${km.toLocaleString()} km${sub?' · '+tr('common.subsea'):''} · ${sub&&!cablesFor(UI.drag.from,b).length?tr('draw.no_cable_lands_here'):tr('draw.from_price_mo',{price:fmt$(waveMo(km,sub,0))})}`;
      ctx.font='800 13px "Baloo 2", sans-serif';const tw=ctx.measureText(t).width+18;const lx=(ax+tx)/2,ly=(ay+ty)/2-22;
      ctx.fillStyle='#1E2640';rr(lx-tw/2,ly-12,tw,24,12);ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,lx,ly+1);}
  }
  // cities
  UI.feed=null;if(UI.sel&&UI.sel.type==='link'){const sl=S.links.find(x=>x.id===UI.sel.id);const rec=sl&&R.ef[edgeKey(sl)];if(rec){UI.feed=new Set(Object.keys(rec.eg).map(k=>R.egDesc[k].city));UI.dest=new Set(Object.keys(rec.dst));}}
  // Place labels: your POPs and the selected city first, then others; a label that would overlap moves above its city or hides.
  const vis=[];for(const C of CITIES){if(C.off&&!cityOn(C.id))continue;for(const k of ks){const [sx,sy]=toS(C.x,C.y,k);if(sx<-60||sx>CW+60||sy<-60||sy>CH+60)continue;vis.push({C,sx,sy});}}
  const prio=v=>(UI.sel&&UI.sel.type==='city'&&UI.sel.id===v.C.id?0:S.pops[v.C.id]?1:2);vis.sort((a,b)=>prio(a)-prio(b)||b.C.P-a.C.P);
  const rects=[],labs=[],hit=(r)=>rects.some(q=>r.x<q.x+q.w&&q.x<r.x+r.w&&r.y<q.y+q.h&&q.y<r.y+r.h);
  const farL=lodFar();
  for(const v of vis){if(farL){rects.push({x:v.sx-7,y:v.sy-7,w:14,h:14});continue;}const h=(12+Math.sqrt(v.C.P)*0.75)*sc;rects.push({x:v.sx-18*sc,y:v.sy-h-4*sc,w:40*sc,h:h+14*sc});}
  for(const v of vis){const p=S.pops[v.C.id];ctx.font=`800 ${p?13:12}px "Baloo 2", sans-serif`;const tw=(LBLW[v.C.id+(p?1:0)]||(LBLW[v.C.id+(p?1:0)]=ctx.measureText(v.C.name).width+14));
    if(farL&&prio(v)>1&&UI.hover!==v.C.id){v.ly=null;continue;}
    const h=farL?6:12+Math.sqrt(v.C.P)*0.75;const below=farL?v.sy+15:v.sy+16*sc+8,above=farL?v.sy-15:v.sy-h*sc-17*sc;let ly=null;
    for(const y of [below,above]){const r={x:v.sx-tw/2-2,y:y-10,w:tw+4,h:21};if(!hit(r)){ly=y;rects.push(r);labs.push(r);break;}}
    // Your POPs may sit over a city icon, but not over another name: that one waits until you zoom in.
    if(ly===null&&prio(v)===1)for(const y of [below,above]){const r={x:v.sx-tw/2,y:y-10,w:tw,h:21};if(!labs.some(q=>r.x<q.x+q.w&&q.x<r.x+r.w&&r.y<q.y+q.h&&q.y<r.y+r.h)){ly=y;rects.push(r);labs.push(r);break;}}
    if(ly===null&&(prio(v)===0||(prio(v)===1&&(v.C.id===S.home||UI.hover===v.C.id)))){ly=below;const r={x:v.sx-tw/2,y:below-10,w:tw,h:21};rects.push(r);labs.push(r);}
    v.ly=ly;}
  // Which cities show an offer bubble (a big one?) or an incident marker, worked out once for all of them.
  CM.off=new Set();CM.big=new Set();for(const o of S.offers){const big=BIZ_T[o.type].lv>=3||BIZ_T[o.type].event;for(const c of bCities(o)){CM.off.add(c);if(big)CM.big.add(c);}}
  CM.inc=new Set(S.inc.filter(i=>i.type!=='leak').map(i=>i.ref));CM.far=farL;
  for(const v of vis.slice().reverse())drawCity(v.C,v.sx,v.sy,sc,now,v.ly);
  // floaters
  for(let i=FLOATS.length-1;i>=0;i--){const f=FLOATS[i],a=(now-f.t)/1600;if(a>1){FLOATS.splice(i,1);continue;}
    for(const k of ks){const [sx,sy]=toS(f.x,f.y,k);ctx.globalAlpha=1-a*a;ctx.font='800 17px "Baloo 2", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.strokeText(f.text,sx,sy-a*40);ctx.fillStyle=f.col;ctx.fillText(f.text,sx,sy-a*40);ctx.globalAlpha=1;}}
}
function drawCone(x,y,now){const b=Math.sin(now/300)*1.5;ctx.save();ctx.translate(x,y-12+b);ctx.strokeStyle='#1E2640';ctx.lineWidth=2;ctx.fillStyle='#FF8A3D';ctx.beginPath();ctx.moveTo(-7,9);ctx.lineTo(0,-10);ctx.lineTo(7,9);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.fillRect(-4,-1,8,3);ctx.fillStyle='#1E2640';rr(-10,8,20,4,2);ctx.fill();ctx.restore();}
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
