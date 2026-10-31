// Label widths by text (city labels by id, link labels and far-view labels by text): measuring text every frame is slow.
const LBLW={},LINKW=new Map(),LBLF=new Map(),CM={off:new Set(),big:new Set(),inc:new Set(),far:false};
try{document.fonts&&document.fonts.ready.then(()=>{for(const k in LBLW)delete LBLW[k];LINKW.clear();LBLF.clear();FRAME.length=0;});}catch(e){}
function drawCityFar(C,sx,sy,sc,now,lyOverride){
  const p=S.pops[C.id],down=p&&p.down>S.day,sel=UI.sel&&UI.sel.type==='city'&&UI.sel.id===C.id,hov=UI.hover===C.id||(UI.snap&&UI.snap.id===C.id);
  ctx.save();ctx.translate(sx,sy);ctx.strokeStyle='#1E2640';
  if(sel){ctx.strokeStyle='#FF4F9A';ctx.lineWidth=2.5;ctx.setLineDash([4,4]);ctx.lineDashOffset=-now/40;ctx.beginPath();ctx.arc(0,0,p?14:9,0,7);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#1E2640';}
  if(p){
    if(!down&&R.cityDem[C.id]>0&&sfOf(R,C.id)<0.9){ctx.fillStyle=`rgba(255,77,94,${.35+.25*Math.sin(now/200)})`;ctx.beginPath();ctx.arc(0,0,12,0,7);ctx.fill();}
    const col=down?'#8A91A8':'#FF4F9A';ctx.lineWidth=1.8;
    if(p.site2){ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(9,6);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=col;rr(5,3,9,7,3);ctx.fill();ctx.stroke();}
    if((p.routers||1)>=2){ctx.fillStyle=down?'#6E7590':'#D63B7F';rr(-6,-7,15,10,4);ctx.fill();ctx.stroke();}
    ctx.fillStyle=col;rr(-8,-5,16,10,4);ctx.fill();ctx.stroke();
  }else{// The dot grows with the city's eyeballs; a megacity glows a little (75-city-size.js).
    const t=cTier(C.id),r=FAR_R[t]*(hov?1.3:1);if(t===4){ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(0,0,r+4.5,0,7);ctx.fill();}
    ctx.fillStyle=hasIxAt(C.id)?'#FFD23F':'#FFFFFF';ctx.lineWidth=t>=3?1.6:1.3;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.stroke();}
  if(CM.off.has(C.id)){ctx.fillStyle='#16A866';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p?9:5,p?-7:-5,3,0,7);ctx.fill();ctx.stroke();}
  if(CM.inc.has(C.id)){ctx.fillStyle='#FF4D5E';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p?-9:-5,p?-7:-5,3.4,0,7);ctx.fill();ctx.stroke();}
  ctx.restore();
  if(lyOverride!==null&&(p||sel||hov)){ctx.font=`800 ${p?12:11}px "Baloo 2", sans-serif`;const t=C.name,wk=C.id+(p?1:0);let tw=LBLF.get(wk);if(tw===undefined)LBLF.set(wk,tw=ctx.measureText(t).width+12);const ly=lyOverride==null?sy+15:lyOverride;
    ctx.fillStyle=p?'#FF4F9A':'#FFFFFF';ctx.strokeStyle='#1E2640';ctx.lineWidth=1.6;rr(sx-tw/2,ly-8,tw,16,8);ctx.fill();ctx.stroke();
    ctx.fillStyle=p?'#FFFFFF':'#1E2640';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,sx,ly+1);}
}
function drawCity(C,sx,sy,sc,now,lyOverride,dem){
  if(CM.far)return drawCityFar(C,sx,sy,sc,now,lyOverride);
  const hot=(UI.hotMap||{})[C.id];
  const p=S.pops[C.id],down=p&&p.down>S.day,sel=UI.sel&&UI.sel.type==='city'&&UI.sel.id===C.id,hov=UI.hover===C.id||(UI.snap&&UI.snap.id===C.id);
  // No room for its skyline here: a quiet dot, a little bigger for bigger cities, until you zoom in (cityRoom).
  if(dem&&!p&&!sel&&!hov){const r=(2.6+cTier(C.id)*0.35)*sc;ctx.fillStyle=hasIxAt(C.id)?'#FFD23F':'#FFFFFF';ctx.strokeStyle='#1E2640';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(sx,sy+2*sc,r,0,7);ctx.fill();ctx.stroke();return;}
  const t=cTier(C.id),cs=p?1:CSC[t];
  const k=sc*(hov?1.15:1);
  ctx.save();ctx.translate(sx,sy);
  if(UI.feed&&UI.feed.has(C.id)){ctx.strokeStyle='#FF8A3D';ctx.lineWidth=4;ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(0,-6*k,36*k,0,7);ctx.stroke();ctx.setLineDash([]);}
  if(sel){ctx.strokeStyle='#FF4F9A';ctx.lineWidth=3;ctx.setLineDash([6,6]);ctx.lineDashOffset=-now/40;ctx.beginPath();ctx.arc(0,-6*k,30*k,0,7);ctx.stroke();ctx.setLineDash([]);}
  // A flood is filling ports here: they pulse until it is over (#242).
  if(p&&R.ddosHot&&R.ddosHot[C.id]){ctx.strokeStyle='#FF4D5E';ctx.lineWidth=3;ctx.setLineDash([4,4]);ctx.lineDashOffset=now/30;ctx.beginPath();ctx.arc(0,-6*k,33*k,0,7);ctx.stroke();ctx.setLineDash([]);}
  if(p&&!down&&R.cityDem[C.id]>0&&sfOf(R,C.id)<0.9){const a=.35+.25*Math.sin(now/200);ctx.fillStyle=`rgba(255,77,94,${a})`;ctx.beginPath();ctx.arc(0,-6*k,26*k,0,7);ctx.fill();}
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
    if(!down&&(R.nodeLoad[C.id]||0)>=(R.nodeCap[C.id]||1e12)*0.95){for(let i=0;i<3;i++){const t=(now/700+i/3)%1;ctx.fillStyle=`rgba(90,98,130,${0.55*(1-t)})`;ctx.beginPath();ctx.arc(6+i*3,-12-t*18,3+t*4,0,7);ctx.fill();}}
    if((p.rgen||0)>0){const G=RG[p.rgen||0];ctx.fillStyle=G.badge?'#7CFFB2':'#FFD23F';ctx.beginPath();ctx.arc(17,-7,6,0,7);ctx.fill();ctx.lineWidth=1.8;ctx.stroke();ctx.fillStyle='#1E2640';ctx.font='900 8px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(G.badge||String(G.cls+1),17,-6.5);ctx.lineWidth=2.2;}
    const sf=sfOf(R,C.id);
    for(let i=0;i<4;i++){const on=down?false:(((now/(160+i*37))|0)+i)%3!==0;ctx.fillStyle=down?'#3B4260':on?(sf<0.9?'#FF4D5E':'#7CFFB2'):'#2A3150';ctx.beginPath();ctx.arc(-10+i*6.6,1,2.1,0,7);ctx.fill();}
    if(down){ctx.fillStyle='#fff';ctx.font='900 14px "Baloo 2", sans-serif';ctx.textAlign='center';ctx.fillText('zzz',20,-14);}
    if(flip)ctx.restore();
    ctx.translate(0,-2);
  }
  const ixn=ixName(C.id);
  // The IX badge sits at the skyline's top right, whatever its width.
  if(ixn&&(ixShown(C.id,p)||(hot&&hot.ix)||sel||hov)){const mine=!!S.myIx[C.id],joined=hasIxAt(C.id),ixHot=hot&&hot.ix,q=!p&&!ixHot&&ixQuiet(C.id),R=q?6.5:8.5,ix=p?19:SKY_W[t]/2+(q?2:4);
    ctx.fillStyle=ixHot?(Math.sin(now/180)>0?'#FF4D5E':'#FF8A3D'):mine?'#FF4F9A':joined?'#FFD23F':'#FFFFFF';ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i+Math.PI/6;ctx.lineTo(ix+R*Math.cos(a),-h+2+R*Math.sin(a));}ctx.closePath();ctx.fill();ctx.lineWidth=q?1.4:2;ctx.stroke();
    ctx.fillStyle=mine||ixHot?'#fff':'#1E2640';ctx.font=`900 ${q?6.5:8}px Nunito, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('IX',ix,-h+2.5);}
  if(hot&&p){let y=-14;const pulse=.75+.25*Math.sin(now/200);for(const k of ['r','t','p','c']){if(!hot[k])continue;ctx.globalAlpha=pulse;ctx.fillStyle='#FF4D5E';ctx.beginPath();ctx.arc(-29,y,6.5,0,7);ctx.fill();ctx.globalAlpha=1;ctx.lineWidth=2;ctx.strokeStyle='#1E2640';ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 8px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(HOTL[k],-29,y+0.5);y+=14;}}
  const off=CM.off.has(C.id);
  if(off){const by=-h-16+Math.sin(now/250)*3;ctx.fillStyle='#fff';ctx.lineWidth=2.2;ctx.beginPath();ctx.ellipse(-2,by,11,9,0,0,7);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-5,by+8);ctx.lineTo(-7,by+14);ctx.lineTo(0,by+8);ctx.fillStyle='#fff';ctx.fill();const big=CM.big.has(C.id);ctx.fillStyle=big?'#FF4F9A':'#16A866';ctx.font='900 13px "Baloo 2", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(big?'$$':'$',-2,by+1);}
  const inc=CM.inc.has(C.id);
  if(inc){ctx.fillStyle='#FF4D5E';ctx.beginPath();ctx.arc(-20,-h+2,7,0,7);ctx.fill();ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 11px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',-20,-h+3);}
  ctx.restore();
  // label
  if((cam.z>=0.62||p||sel||hov)&&(lyOverride!==null||hov)){
    ctx.font=`800 ${p?13:12}px "Baloo 2", sans-serif`;const t=C.name,tw=LBLW[C.id+(p?1:0)]||(LBLW[C.id+(p?1:0)]=ctx.measureText(t).width+14),ly=lyOverride==null?sy+16*sc+8:lyOverride;
    ctx.fillStyle=p?'#FF4F9A':'#FFFFFF';ctx.strokeStyle='#1E2640';ctx.lineWidth=2;rr(sx-tw/2,ly-9,tw,19,9);ctx.fill();ctx.stroke();
    ctx.fillStyle=p?'#FFFFFF':'#1E2640';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,sx,ly+1);
  }
}

