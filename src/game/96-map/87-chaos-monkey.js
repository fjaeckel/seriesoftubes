/* ---------- the chaos monkey, on the map ----------
   It hops from cut to cut, sprays chaos where it snips, and dances where a snip really hurt. It visits normal games
   (85-incidents/40-chaos-monkey.js) and reviews Architect runs. Pure decoration on the animation clock: nothing
   depends on it, and with animations off the monkey just sits at the cut. */
const MK_RUN=0.62; // share of a review step the monkey spends running to the next cut
const MK_COLS=['#FF4F9A','#FFD23F','#22C47A','#2F8CFF','#FF8A3D','#7B61FF'];
// Where a link's middle is, in world coordinates (the shorter way round the date line).
const mkMid=l=>[(CITY[l.a].x+CITY[l.a].x+wrapDx(CITY[l.a].x,CITY[l.b].x))/2,(CITY[l.a].y+CITY[l.b].y)/2];
function mkStart(c){const C=CITY[c];UI.mk={x:C.x,y:C.y,fx:C.x,fy:C.y,tx:C.x,ty:C.y,t0:animT,dur:1,face:1,mood:'run',spray:[],sprayAt:null,bad:false};}
// Off to the next cut: arrive, then spray.
function mkRun(l,dur,bad){const m=UI.mk;if(!m)return;const [x,y]=mkMid(l);m.fx=m.x;m.fy=m.y;m.tx=x;m.ty=y;m.t0=animT;m.dur=Math.max(1,dur*MK_RUN);
  m.face=wrapDx(m.fx,x)<0?-1:1;m.mood='run';m.sprayAt=animT+m.dur;m.bad=!!bad;if(!animOn()){m.x=x;m.y=y;}}
function mkSpray(m){for(let i=0;i<(m.bad?26:16);i++){const a=Math.PI*2*i/(m.bad?26:16)+((i*37)%10)/10,v=0.05+((i*53)%10)/180;
  m.spray.push({x:m.tx,y:m.ty,vx:Math.cos(a)*v,vy:Math.sin(a)*v-0.06,c:m.bad?(i%3?'#FF4D5E':'#FFD23F'):MK_COLS[i%MK_COLS.length],t:animT,s:i%4===0?(m.bad?'💥':'✂️'):null});}}
// It is over: a cheer when everything held, a tantrum where it broke; with bye it then leaves the map.
function mkEnd(ok,bye){const m=UI.mk;if(!m)return;// a pending spray (the review was skipped mid-run) would override the cheer
  m.sprayAt=null;m.mood=ok?'cheer':'dance';m.t0=animT;m.bye=bye?animT:0;}
function mkStop(){UI.mk=null;}
function mkDraw(ks){const m=UI.mk;if(!m)return;if(m.bye&&animT-m.bye>2600){mkStop();return;}
  if(m.mood==='snip'&&animT-m.t0>1500){m.mood='stand';m.t0=animT;}
  const p=Math.min(1,(animT-m.t0)/m.dur),e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
  if(m.mood==='run'){m.x=m.fx+wrapDx(m.fx,m.tx)*e;m.y=m.fy+(m.ty-m.fy)*e;}
  if(m.sprayAt!=null&&animT>=m.sprayAt){m.sprayAt=null;if(animOn())mkSpray(m);m.mood=m.bad?'dance':'snip';m.t0=animT;}
  const sz=Math.round(36*Math.max(0.85,Math.min(1.4,Math.sqrt(cam.z))));
  // Hops while running, bounces on the spot otherwise.
  const hop=m.mood==='run'&&p<1?Math.abs(Math.sin((animT-m.t0)/70))*sz*0.45:m.mood==='dance'?Math.abs(Math.sin((animT-m.t0)/90))*sz*0.6:m.mood==='cheer'?Math.abs(Math.sin((animT-m.t0)/120))*sz*0.35:0;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=m.spray.length-1;i>=0;i--){const q=m.spray[i],a=(animT-q.t)/900;if(a>1){m.spray.splice(i,1);continue;}
    const dt=animT-q.t,wx=q.x+q.vx*dt/cam.z,wy=q.y+(q.vy*dt+0.00012*dt*dt)/cam.z;
    for(const k of ks){const [sx,sy]=toS(wx,wy,k);ctx.globalAlpha=1-a;if(q.s){ctx.font=`${Math.round(sz*0.7)}px sans-serif`;ctx.fillText(q.s,sx,sy);}else{ctx.fillStyle=q.c;ctx.beginPath();ctx.arc(sx,sy,Math.max(2,sz*0.13*(1-a*0.5)),0,Math.PI*2);ctx.fill();}}}
  ctx.globalAlpha=1;ctx.font=`${sz}px sans-serif`;
  for(const k of ks){const [sx,sy]=toS(m.x,m.y,k);m.sx=sx;m.sy=sy-sz*0.6;m.r=sz*0.8;ctx.save();ctx.translate(sx,sy+sz*0.15);
    ctx.fillStyle='rgba(30,38,64,.18)';ctx.beginPath();ctx.ellipse(0,0,sz*0.38,sz*0.12,0,0,Math.PI*2);ctx.fill();
    ctx.translate(0,-hop);const tilt=m.mood==='snip'?Math.sin((animT-m.t0)/60)*0.25:m.mood==='dance'?Math.sin((animT-m.t0)/80)*0.35:0;ctx.rotate(tilt);ctx.scale(m.face,1);
    mkSprite(sz*1.25,animT-m.t0,m.mood==='run'&&p>=1?'stand':m.mood);
    if(m.mood==='cheer'){ctx.scale(m.face,1);ctx.fillStyle='#000';ctx.fillText('🎉',sz*0.75,-sz*1.1);}ctx.restore();}
  ctx.restore();}
// Our own monkey, drawn in the map's outline style, facing right with its feet at (0,0); s is its height.
// Shades on, spray can in hand: the arms and legs move with its mood.
function mkSprite(s,t,mood){const u=s/40,O='#1E2640',B='#A0673A',T='#F4CFA0',lw=Math.max(1.4,2*u),k=Math.sin(t/70);
  ctx.lineJoin=ctx.lineCap='round';ctx.strokeStyle=O;ctx.lineWidth=lw;
  const dot=(x,y,r,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(x*u,y*u,r*u,0,Math.PI*2);ctx.fill();ctx.stroke();};
  const limb=(x1,y1,x2,y2,w)=>{ctx.beginPath();ctx.moveTo(x1*u,y1*u);ctx.lineTo(x2*u,y2*u);ctx.lineWidth=w*u+2*lw;ctx.strokeStyle=O;ctx.stroke();ctx.lineWidth=w*u;ctx.strokeStyle=B;ctx.stroke();ctx.lineWidth=lw;ctx.strokeStyle=O;};
  const run=mood==='run',up=mood==='cheer',wave=mood==='snip'||mood==='dance';
  // tail: a curl that sways
  const sw=Math.sin(t/160)*3;ctx.beginPath();ctx.moveTo(-6*u,-9*u);ctx.bezierCurveTo(-19*u,-8*u,(-21+sw)*u,-26*u,(-13+sw)*u,-29*u);ctx.bezierCurveTo((-7+sw)*u,-31*u,(-6+sw)*u,-24*u,(-10+sw)*u,-24*u);
  ctx.lineWidth=3*u+2*lw;ctx.stroke();ctx.lineWidth=3*u;ctx.strokeStyle=B;ctx.stroke();ctx.lineWidth=lw;ctx.strokeStyle=O;
  // legs and feet
  const g=run?5*k:mood==='dance'?3*k:0;limb(-3,-10,-4-g,-1.5,3.6);limb(4,-10,5+g,-1.5,3.6);
  ctx.fillStyle=T;for(const x of [-4-g,5+g]){ctx.beginPath();ctx.ellipse((x+1)*u,-1*u,3*u,1.8*u,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
  // back arm, body, belly
  const ba=up?[-10,-33]:wave?[-11,-25+2*k]:run?[-10,-14-3*k]:[-9,-13];limb(-4,-20,ba[0],ba[1],3.2);dot(ba[0],ba[1],2.2,T);
  ctx.fillStyle=B;ctx.beginPath();ctx.ellipse(0,-15*u,9*u,10*u,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=T;ctx.beginPath();ctx.ellipse(1.5*u,-14*u,5.5*u,7*u,0,0,Math.PI*2);ctx.fill();
  // head: ears, skull, face
  dot(-6,-32,3.6,B);dot(10,-32,3.6,B);ctx.fillStyle=T;for(const x of [-6,10]){ctx.beginPath();ctx.arc(x*u,-32*u,1.9*u,0,Math.PI*2);ctx.fill();}
  dot(2,-31,9,B);ctx.fillStyle=T;ctx.beginPath();ctx.arc(-1*u,-31.5*u,4*u,0,Math.PI*2);ctx.arc(5*u,-31.5*u,4*u,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(2*u,-27.5*u,6.5*u,4.6*u,0,0,Math.PI*2);ctx.fill();
  // shades: two dark lenses on a bridge, with a glint
  ctx.fillStyle=O;ctx.beginPath();ctx.ellipse(-1.2*u,-32.5*u,3.3*u,2.6*u,0,0,Math.PI*2);ctx.ellipse(5.4*u,-32.5*u,3.3*u,2.6*u,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(1.5*u,-33.5*u);ctx.lineTo(2.7*u,-33.5*u);ctx.moveTo(-4.4*u,-33*u);ctx.lineTo(-7*u,-33.5*u);ctx.stroke();
  ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,0.9*u);ctx.beginPath();ctx.moveTo(-2.6*u,-33.6*u);ctx.lineTo(-1.2*u,-34.3*u);ctx.moveTo(4*u,-33.6*u);ctx.lineTo(5.4*u,-34.3*u);ctx.stroke();ctx.strokeStyle=O;ctx.lineWidth=lw;
  // mouth: a smirk, or a laugh when it breaks something
  ctx.beginPath();if(mood==='dance'||up){ctx.fillStyle='#7A2633';ctx.ellipse(2.5*u,-26.5*u,2.6*u,2*u,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
  else{ctx.moveTo(-0.5*u,-27*u);ctx.quadraticCurveTo(3*u,-25*u,6*u,-28*u);ctx.stroke();}
  // front arm with the spray can
  const fa=up?[11,-34]:wave?[13,-27-2*k]:run?[11,-17+3*k]:[10,-14];limb(5,-20,fa[0],fa[1],3.2);
  ctx.save();ctx.translate(fa[0]*u,fa[1]*u);ctx.rotate(wave?0.5:0);
  ctx.fillStyle='#FF4F9A';ctx.beginPath();ctx.roundRect(-2.6*u,-8*u,5.2*u,9*u,1.2*u);ctx.fill();ctx.stroke();
  ctx.fillStyle='#FFD23F';ctx.fillRect(-2.6*u,-5*u,5.2*u,2*u);ctx.fillStyle='#C9D1E6';ctx.beginPath();ctx.roundRect(-1.6*u,-10.5*u,3.2*u,2.6*u,0.8*u);ctx.fill();ctx.stroke();
  if(wave){ctx.fillStyle='rgba(255,79,154,.45)';for(let i=0;i<4;i++){ctx.beginPath();ctx.arc((4+i*2.2)*u,(-11-i*1.4+Math.sin(t/40+i))*u,(0.9+i*0.4)*u,0,Math.PI*2);ctx.fill();}}
  ctx.restore();dot(fa[0],fa[1],2.2,T);}
// Did a tap land on the monkey? (Where it was last drawn.)
const mkHit=(x,y)=>!!(UI.mk&&UI.mk.sx!=null&&Math.hypot(x-UI.mk.sx,y-UI.mk.sy)<UI.mk.r);
