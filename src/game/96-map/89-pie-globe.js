/* Pie in the Sky globe (Pie Control panel): an orthographic Earth on a 2D canvas with a sample of your pies in their
   crusts, laser links, pie-dish beams and launches. Never drawn on the world map. It costs nothing until the panel calls
   pieGlobeOpen(canvas,getData): then one rAF loop, at most 30 frames a second, idle while the canvas is hidden; it stops
   by itself (pieGlobeClose()) once the canvas leaves the page. Positions come from the clock, so nothing is saved.
   Traffic (data.flows, from the last compute): a sky circuit is a glowing arc from one dish up to its crust, across and
   down to the other, as wide as its Gbps (log scale, capped), with packets riding it; a terminal customer is a hop from
   its city off the sky to its dish; a cut-off POP's backhaul (k 'b') is drawn like a sky circuit. Each dish has a load ring. data.hi (a flow id) is drawn on top, the rest dimmed. */
const PG_FLOWS=[24,48],PG_ARC=24,PG_D=Math.PI/180,PG_XF=2.6,PG_FPS=30,PG_FULL={short:1584,frozen:520,upper:1200,flaky:2500},PG_CI={short:0,frozen:1,upper:2,flaky:3};
const PG_ST={
  day:{sea:'#57C4E5',sea2:'#3AA6CF',land:'#9BDA6C',ink:'#1E2640',grid:'rgba(255,255,255,.35)',sat:['#FFFFFF','#FFD23F','#FF4F9A','#B9A6FF'],laser:'#FF4F9A',beam:['#FF8A3D','#FFD23F'],dish:'#FF4F9A',off:'#8A91A8',flow:'#FFD23F',fglow:'#1E2640',hi:'#FF4F9A',pkt:'#FFFFFF'},
  night:{bg:'#0B1030',sea:'#14234F',sea2:'#0B1638',land:'#24396F',ink:'#3E5BB0',grid:'rgba(120,150,255,.10)',sat:['#7DF9FF','#FFD23F','#FF7AC0','#C9B8FF'],laser:'rgba(255,79,154,.75)',beam:['rgba(255,210,63,.65)','rgba(255,138,61,.5)'],dish:'#FFD23F',off:'#4A5378',flow:'rgba(255,230,140,.9)',fglow:'rgba(255,210,63,.22)',hi:'#FF7AC0',pkt:'#FFFFFF'}};
// The whole state of the globe. cv is null whenever it is closed, and then nothing below runs.
const PG={cv:null,ctx:null,get:null,raf:0,last:0,t:0,yaw:-20,tilt:18,vy:0,goal:null,zoom:1,ptr:new Map(),pinch:null,drag:null,night:null,anim:true,dirty:true,
  data:null,dAt:-1e9,sig:'',sm:[],dish:[],fl:[],hi:null,pads:[],lch:[],fly:[],on:null,g:null,frames:0,m:new Float64Array(9)};
let PG_LAND=null,PG_LAND_DIR=null,PG_TURN=1,PG_GRID=null,PG_LIGHT=null,PG_STAR=null;
const pgNightPref=()=>{if(PG.night===null){try{PG.night=localStorage.getItem('sot-globe')==='night';}catch(e){PG.night=false;}}return PG.night;};
// Unit vectors for the land rings (LANDS_LL), the graticule, city lights and stars: worked out once, on first open.
function pgUnit(lo,la,a,i){const b=la*PG_D,c=Math.cos(b),o=lo*PG_D;a[i]=c*Math.cos(o);a[i+1]=c*Math.sin(o);a[i+2]=Math.sin(b);}
// One land ring, clipped to the near side (as map libraries clip). The coast runs to where it meets the horizon; from there the
// fill follows the rim, in the ring's own turning direction (PG_LAND_DIR, from its signed area), to the next point where any
// coast comes back. Only real coast goes into the outline. Pushing hidden points onto the rim made coasts on the edge shiver,
// and a ring bigger than half the rim (Eurasia) filled the whole globe from some angles.
const PG_TAU=2*Math.PI,pgAng=a=>a<0?a+PG_TAU:a;
function pgLandRing(ctx,b,n,dir,cx,cy,R,coast){let s=-1;for(let i=0;i<n;i++)if(b[i*3]>=0){s=i;break;}if(s<0)return;
  const X=(h)=>cx+R*h,Y=(v)=>cy-R*v;let all=true;for(let i=0;i<n;i++)if(b[i*3]<0){all=false;break;}
  if(all){for(let i=0;i<n;i++){const j=i*3;if(i){ctx.lineTo(X(b[j+1]),Y(b[j+2]));coast.lineTo(X(b[j+1]),Y(b[j+2]));}else{ctx.moveTo(X(b[j+1]),Y(b[j+2]));coast.moveTo(X(b[j+1]),Y(b[j+2]));}}ctx.closePath();coast.closePath();return;}
  // Visible runs: each from where the coast comes up over the horizon (in) to where it goes under (out), as flat [h,v,...].
  const runs=[];let cur=null,head=[],px=b[s*3],ph=b[s*3+1],pv=b[s*3+2];const pre=[ph,pv];
  const cross=(x,h,v)=>{const u=px/(px-x);let eh=ph+(h-ph)*u,ev=pv+(v-pv)*u;const m=Math.hypot(eh,ev)||1;return [eh/m,ev/m];};
  for(let k=1;k<=n;k++){const j=((s+k)%n)*3,x=b[j],h=b[j+1],v=b[j+2],up=x>=0,was=px>=0;
    if(was&&!up){const e=cross(x,h,v);if(cur){cur.p.push(e[0],e[1]);cur.out=Math.atan2(e[1],e[0]);runs.push(cur);cur=null;}else{head.push(e[0],e[1]);head.outA=Math.atan2(e[1],e[0]);}}
    else if(!was&&up){const e=cross(x,h,v);cur={p:[e[0],e[1],h,v],in:Math.atan2(e[1],e[0])};}
    else if(up){if(cur)cur.p.push(h,v);else head.push(h,v);}
    px=x;ph=h;pv=v;}
  // The walk started at a visible point: the run still open at the end carries on into the first points.
  if(cur){cur.p.push(...pre,...head);cur.out=head.outA;runs.push(cur);}
  else if(head.outA!==undefined)runs.push({p:[...pre,...head],in:NaN,out:head.outA});
  if(!runs.length)return;
  for(const r of runs){coast.moveTo(X(r.p[0]),Y(r.p[1]));for(let i=2;i<r.p.length;i+=2)coast.lineTo(X(r.p[i]),Y(r.p[i+1]));}
  // Link runs along the rim into closed shapes: from each run's way out, turn with the ring to the nearest way in.
  const used=new Set();
  for(let r0=0;r0<runs.length;r0++){if(used.has(r0))continue;let r=r0,first=true;
    while(!used.has(r)){used.add(r);const p=runs[r].p;if(first){ctx.moveTo(X(p[0]),Y(p[1]));first=false;}else ctx.lineTo(X(p[0]),Y(p[1]));
      for(let i=2;i<p.length;i+=2)ctx.lineTo(X(p[i]),Y(p[i+1]));
      let best=-1,bd=1e9;for(let q=0;q<runs.length;q++){const d=pgAng(dir*(runs[q].in-runs[r].out));if(d<bd){bd=d;best=q;}}
      if(best<0)break;const a0=runs[r].out;ctx.arc(cx,cy,R,-a0,-(a0+dir*bd),dir>0);r=best;}
    ctx.closePath();}}
function pgVecs(){if(PG_LAND)return;
  PG_LAND=LANDS_LL.map(l=>{const a=new Float32Array(l.ll.length*3);l.ll.forEach((q,i)=>pgUnit(q[0],q[1],a,i*3));return a;});
  PG_LAND_DIR=PG_LAND.map(a=>{const n=a.length/3;let cx=0,cy=0,cz=0,s=0;for(let i=0;i<n*3;i+=3){cx+=a[i];cy+=a[i+1];cz+=a[i+2];}
    for(let i=0;i<n;i++){const p=i*3,q=((i+1)%n)*3;s+=cx*(a[p+1]*a[q+2]-a[p+2]*a[q+1])+cy*(a[p+2]*a[q]-a[p]*a[q+2])+cz*(a[p]*a[q+1]-a[p+1]*a[q]);}return s>=0?PG_TURN:-PG_TURN;});
  PG_GRID=[];for(let lo=-180;lo<180;lo+=30){const a=new Float32Array(31*3);for(let j=0;j<=30;j++)pgUnit(lo,-90+j*6,a,j*3);PG_GRID.push(a);}
  for(let la=-60;la<=60;la+=30){const a=new Float32Array(61*3);for(let j=0;j<=60;j++)pgUnit(-180+j*6,la,a,j*3);PG_GRID.push(a);}
  const cs=CITIES.filter(c=>isFinite(c.lat)&&isFinite(c.lon));PG_LIGHT={v:new Float32Array(cs.length*3),r:cs.map(c=>1.1+Math.min(1.6,(c.P||0)/400))};cs.forEach((c,i)=>pgUnit(c.lon,c.lat,PG_LIGHT.v,i*3));
  let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;PG_STAR=[];for(let i=0;i<140;i++)PG_STAR.push([r(),r(),r()*9]);}
// Camera: yaw about the poles, then tilt towards the viewer. Out: d (towards the viewer), h (right), v (up).
function pgCam(){const m=PG.m,cy=Math.cos(PG.yaw*PG_D),sy=Math.sin(PG.yaw*PG_D),ct=Math.cos(PG.tilt*PG_D),st=Math.sin(PG.tilt*PG_D);
  m[0]=cy*ct;m[1]=-sy*ct;m[2]=st;m[3]=sy;m[4]=cy;m[5]=0;m[6]=-cy*st;m[7]=sy*st;m[8]=ct;}
function pgRot(src,dst,n){const m=PG.m;for(let i=0;i<n*3;i+=3){const x=src[i],y=src[i+1],z=src[i+2];dst[i]=m[0]*x+m[1]*y+m[2]*z;dst[i+1]=m[3]*x+m[4]*y;dst[i+2]=m[6]*x+m[7]*y+m[8]*z;}return dst;}
const pgBuf=n=>(PG.buf&&PG.buf.length>=n*3)?PG.buf:(PG.buf=new Float32Array(Math.max(n*3,4096)));
// Data from the panel, read once a second, never trusted: bad entries are dropped, not drawn.
const pgNum=(x,d)=>typeof x==='number'&&isFinite(x)?x:d,pgArr=x=>Array.isArray(x)?x:[];
// A place is {lat,lon} or a city id in .city (or .pad, as launches name their pad).
function pgPlace(list,cap){const out=[];for(const o of pgArr(list)){if(out.length>=cap)break;if(!o)continue;const id=typeof o.city==='string'?o.city:typeof o.pad==='string'?o.pad:null,C=id&&Object.prototype.hasOwnProperty.call(CITY,id)?CITY[id]:null;
  const lat=pgNum(o.lat,C?C.lat:NaN),lon=pgNum(o.lon,C?C.lon:NaN);if(!isFinite(lat)||!isFinite(lon))continue;const v=new Float32Array(3);pgUnit(lon,lat,v,0);out.push({v,id,up:o.up!==false,ok:o.ok!==false,re:o.rk==='again'||o.rk==='heavy',u:typeof o.u==='number'&&isFinite(o.u)?Math.max(0,Math.min(1,o.u)):null});}return out;}
function pgRefresh(now){PG.dAt=now;let d=null;try{d=PG.get?PG.get():null;}catch(e){d=null;}d=d&&typeof d==='object'?d:{};
  const cr=pgArr(d.crusts).filter(c=>c&&pgNum(c.n,0)>0).slice(0,8),ph=isPhone(),cap=ph?80:160;
  const sig=ph+'|'+cr.map(c=>[c.id,c.n,c.alt,c.inc,!!c.las].join(':')).join(',');
  if(sig!==PG.sig){PG.sig=sig;PG.sm=cr.map((c,j)=>{const n=Math.floor(pgNum(c.n,0)),full=typeof CRUSTS!=='undefined'&&CRUSTS[c.id]&&CRUSTS[c.id].full||PG_FULL[c.id]||1000,alt=Math.max(200,Math.min(2000,pgNum(c.alt,550)));
      // A sample, not every pie: more dots as the crust fills, up to the cap.
      const cnt=Math.min(n,Math.max(Math.min(n,6),Math.round(cap*Math.min(1,n/full)))),inc=Math.max(0,Math.min(180,pgNum(c.inc,53))),polar=inc>=80;
      const P=Math.max(1,Math.round(polar?Math.sqrt(cnt/2):Math.sqrt(cnt*1.2))),K=Math.ceil(cnt/P),span=polar?Math.PI:2*Math.PI;
      const co=new Float32Array(P),so=new Float32Array(P);for(let p=0;p<P;p++){co[p]=Math.cos(p/P*span);so[p]=Math.sin(p/P*span);}
      return {cnt,P,K,co,so,ci:Math.cos(inc*PG_D),si:Math.sin(inc*PG_D),rr:1+alt/6371*PG_XF,w:0.18*Math.pow(550/alt,1.5),las:!!c.las,col:PG_CI[c.id]!=null?PG_CI[c.id]:j%4,pos:new Float32Array(cnt*3)};});}
  PG.dish=pgPlace(d.dishes,ph?60:150);PG.pops=pgPlace(d.pops,400);PG.noSats=!!d.noSats;PG.focus=typeof d.focus==='string'?d.focus:null;PG.pads=pgPlace(d.pads,24);PG.lch=pgPlace(d.launches,ph?4:8);PG.fly=pgPlace(d.flown,ph?3:6);PG.hi=typeof d.hi==='string'?d.hi:null;
  PG.fl=pgFlows(d.flows,PG_FLOWS[ph?0:1],PG.hi);PG.dirty=true;}
/* Flows as arcs of PG_ARC+1 points in world coordinates, rebuilt once a second. A sky circuit climbs to its crust in the
   first and last 15% and crosses at that height; a terminal bounces off the sky halfway. The highlighted one is always kept. */
function pgFlows(list,cap,hi){const out=[],L=pgArr(list),seen=new Set();let n=0;
  const take=f=>{if(!f||typeof f.id!=='string'||seen.has(f.id))return;const g=pgNum(f.g,0),me=f.id===hi,ids=pgArr(f.pts),pts=pgPlace(ids.map(c=>({city:c})),2);if(!(g>0||me)||pts.length<2)return;
    const a=pts[0].v,b=pts[1].v,dot=Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])),om=Math.max(1e-3,Math.acos(dot));seen.add(f.id);
    const sky=f.k==='c'||f.k==='b',h=(sky?Math.max(200,Math.min(2000,pgNum(f.alt,550))):550)/6371*PG_XF,raw=new Float32Array((PG_ARC+1)*3),so=Math.sin(om);
    for(let i=0;i<=PG_ARC;i++){const s=i/PG_ARC,p=Math.sin((1-s)*om)/so,q=Math.sin(s*om)/so,r=1+h*(sky?Math.min(1,s/0.15,(1-s)/0.15):Math.sin(Math.PI*s));
      raw[i*3]=(p*a[0]+q*b[0])*r;raw[i*3+1]=(p*a[1]+q*b[1])*r;raw[i*3+2]=(p*a[2]+q*b[2])*r;}
    const nm=me?ids.slice(0,2).map(c=>typeof c==='string'&&Object.prototype.hasOwnProperty.call(CITY,c)?CITY[c].name:''):null;
    out.push({id:f.id,sky,w:Math.min(7,1.2+1.5*Math.log10(1+g))+(me?2:0),raw,pos:new Float32Array(raw.length),pk:Math.min(4,1+Math.floor(Math.log10(1+g))),nm});};
  if(hi)take(L.find(f=>f&&f.id===hi));for(const f of L){if(out.length>=cap)break;take(f);}return out;}
const pgLoadCol=u=>u>=0.9?'#FF4D5E':u>=0.6?'#FFAA1F':'#22C47A';
function pgSats(){for(const c of PG.sm){const raw=pgBuf(c.cnt);let i=0;
  for(let p=0;p<c.P&&i<c.cnt;p++)for(let k=0;k<c.K&&i<c.cnt;k++,i++){const u=k/c.K*2*Math.PI+PG.t*c.w+p*0.37,x=Math.cos(u),s=Math.sin(u),y=s*c.ci,z=s*c.si;
    raw[i*3]=c.rr*(x*c.co[p]-y*c.so[p]);raw[i*3+1]=c.rr*(x*c.so[p]+y*c.co[p]);raw[i*3+2]=c.rr*z;}
  pgRot(raw,c.pos,c.cnt);}}
// Behind the Earth: away from the viewer and inside its disc.
const pgHid=(a,i)=>a[i]<0&&a[i+1]*a[i+1]+a[i+2]*a[i+2]<1;
function pgFrame(now,force){
  const cv=PG.cv;if(!cv)return false;
  if(!cv.isConnected){pieGlobeClose();return false;}
  let W=cv.clientWidth,H=cv.clientHeight;if((!W||!H)&&force){W=300;H=300;}
  if(!W||!H||document.hidden)return false;
  if(!force&&now-PG.last<1000/PG_FPS-2)return false;
  const dt=Math.min(0.1,Math.max(0,(now-(PG.last||now))/1000));PG.last=now;
  if(now-PG.dAt>1000)pgRefresh(now);
  if(PG.drag){}else if(PG.goal){const k=1-Math.exp(-5*dt),dy=((PG.goal.yaw-PG.yaw)%360+540)%360-180,dl=PG.goal.tilt-PG.tilt,dz=(PG.goal.z||PG.zoom)-PG.zoom;PG.yaw+=dy*k;PG.tilt+=dl*k;PG.zoom+=dz*k;PG.dirty=true;if(Math.abs(dy)<0.2&&Math.abs(dl)<0.2&&Math.abs(dz)<0.01)PG.goal=null;}
  else if(Math.abs(PG.vy)>0.01){PG.yaw+=PG.vy*dt;PG.vy*=Math.pow(0.04,dt);PG.dirty=true;}else if(PG.anim&&!PG.hi){PG.yaw+=4*dt;}
  if(PG.anim)PG.t+=dt;else if(!PG.dirty&&!force)return false;
  PG.dirty=false;PG.frames++;
  const ctx=PG.ctx,dpr=Math.min(2,window.devicePixelRatio||1),pw=Math.round(W*dpr),ph=Math.round(H*dpr);
  if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph;}
  ctx.setTransform(dpr,0,0,dpr,0,0);pgDraw(ctx,W,H);return true;}
function pgDraw(ctx,W,H){
  const night=!!PG.night,st=night?PG_ST.night:PG_ST.day,t=PG.t;pgCam();pgSats();
  let mr=1;for(const c of PG.sm)if(c.rr>mr)mr=c.rr;
  const cx=W/2,cy=H/2,R=Math.min(W,H)*0.47/(mr+0.04)*PG.zoom,P=(a,i)=>[cx+R*a[i+1],cy-R*a[i+2]];
  const gk=W+'|'+H+'|'+R+'|'+night;if(!PG.g||PG.g.k!==gk){const sea=ctx.createRadialGradient(cx-R*.35,cy-R*.35,R*.1,cx,cy,R);sea.addColorStop(0,st.sea);sea.addColorStop(1,st.sea2);
    let sh;if(night){sh=ctx.createRadialGradient(cx-R*.7,cy-R*.35,R*.2,cx-R*.7,cy-R*.35,R*2);sh.addColorStop(0,'rgba(0,0,20,0)');sh.addColorStop(.45,'rgba(0,0,20,0)');sh.addColorStop(1,'rgba(0,0,20,.62)');}
    else{sh=ctx.createRadialGradient(cx-R*.45,cy-R*.5,0,cx-R*.45,cy-R*.5,R*.6);sh.addColorStop(0,'rgba(255,255,255,.35)');sh.addColorStop(1,'rgba(255,255,255,0)');}
    PG.g={k:gk,sea,sh};}
  ctx.clearRect(0,0,W,H);
  if(night){ctx.fillStyle=st.bg;ctx.fillRect(0,0,W,H);
    // Twinkling stars, in four brightness steps: four fills instead of one per star.
    for(let b=0;b<4;b++){ctx.beginPath();for(const s of PG_STAR){const a=Math.abs(Math.sin(t*0.7+s[2]));if(Math.min(3,a*4|0)===b)ctx.rect(s[0]*W,s[1]*H,1.4,1.4);}ctx.fillStyle=`rgba(255,255,255,${.25+b*.2})`;ctx.fill();}}
  const dim=PG.hi?0.25:1,sats=(front)=>{for(const c of PG.sm){const a=c.pos,col=st.sat[c.col%4],r=front?3.2:2.2;let any=false;
      if(night){ctx.beginPath();for(let i=0;i<c.cnt*3;i+=3){if((a[i]>=0)!==front||pgHid(a,i))continue;const x=cx+R*a[i+1],y=cy-R*a[i+2];ctx.moveTo(x+r*2.4,y);ctx.arc(x,y,r*2.4,0,7);any=true;}
        if(!any)continue;ctx.fillStyle=col;ctx.globalAlpha=(front?.25:.1)*dim;ctx.fill();
        ctx.beginPath();for(let i=0;i<c.cnt*3;i+=3){if((a[i]>=0)!==front||pgHid(a,i))continue;const x=cx+R*a[i+1],y=cy-R*a[i+2];ctx.moveTo(x+r*.8,y);ctx.arc(x,y,r*.8,0,7);}ctx.globalAlpha=(front?1:.45)*dim;ctx.fill();ctx.globalAlpha=1;}
      else{ctx.beginPath();for(let i=0;i<c.cnt*3;i+=3){if((a[i]>=0)!==front||pgHid(a,i))continue;const x=cx+R*a[i+1],y=cy-R*a[i+2];ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,7);any=true;}
        if(!any)continue;ctx.globalAlpha=(front?1:.45)*dim;ctx.fillStyle=col;ctx.fill();ctx.lineWidth=front?1.4:1;ctx.strokeStyle=st.ink;ctx.stroke();ctx.globalAlpha=1;}}};
  if(!PG.noSats)sats(false);
  // The Earth: offset ink shadow, sea, graticule, land, then light and shade.
  if(!night){ctx.beginPath();ctx.arc(cx+6,cy+6,R,0,7);ctx.fillStyle=st.ink;ctx.fill();}
  ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fillStyle=PG.g.sea;ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.clip();
  const buf=pgBuf(61);ctx.beginPath();for(const g of PG_GRID){const n=g.length/3;pgRot(g,buf,n);let on=false;
    for(let i=0;i<n*3;i+=3){if(buf[i]<0){on=false;continue;}const x=cx+R*buf[i+1],y=cy-R*buf[i+2];if(on)ctx.lineTo(x,y);else ctx.moveTo(x,y);on=true;}}
  ctx.strokeStyle=st.grid;ctx.lineWidth=1;ctx.stroke();
  // Land: every ring in one path, filled and inked once. Points beyond the horizon slide onto the rim.
  const coast=new Path2D();ctx.beginPath();for(let li=0;li<PG_LAND.length;li++){const ring=PG_LAND[li],n=ring.length/3;pgLandRing(ctx,pgRot(ring,pgBuf(n),n),n,PG_LAND_DIR[li],cx,cy,R,coast);}
  ctx.fillStyle=st.land;ctx.fill();ctx.lineJoin='round';ctx.lineWidth=night?1:2;ctx.strokeStyle=st.ink;ctx.stroke(coast);
  ctx.fillStyle=PG.g.sh;ctx.fillRect(cx-R,cy-R,2*R,2*R);
  if(night){// City lights, brighter on the dark side.
    const L=PG_LIGHT,n=L.r.length,b=pgRot(L.v,pgBuf(n),n);ctx.beginPath();for(let i=0,j=0;j<n;i+=3,j++){if(b[i]<0.05)continue;const x=cx+R*b[i+1],y=cy-R*b[i+2],r=L.r[j]*(1+Math.max(0,b[i+1]));ctx.moveTo(x+r*3.5,y);ctx.arc(x,y,r*3.5,0,7);}ctx.fillStyle='rgba(255,210,63,.16)';ctx.fill();
    ctx.beginPath();for(let i=0,j=0;j<n;i+=3,j++){if(b[i]<0.05)continue;const x=cx+R*b[i+1],y=cy-R*b[i+2],r=L.r[j];ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,7);}ctx.fillStyle='#FFE58A';ctx.fill();}
  ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.lineWidth=night?1.5:3;ctx.strokeStyle=st.ink;ctx.stroke();
  if(night){ctx.beginPath();ctx.arc(cx,cy,R+4,0,7);ctx.strokeStyle='rgba(87,196,229,.35)';ctx.lineWidth=6;ctx.stroke();}
  // Pie dishes on the near side, each beaming at the nearest pie above its horizon.
  const ds=[];for(const d of PG.dish){const b=pgRot(d.v,d.s||(d.s=new Float32Array(3)),1);if(b[0]>0.08)ds.push(d);}
  ctx.beginPath();let nb=0;if(!PG.noSats)for(const d of ds){if(!d.up)continue;const g=d.s;let best=-1,bc=null,bd=0.3;
    for(const c of PG.sm){const a=c.pos;for(let i=0;i<c.cnt*3;i+=3){if(a[i]*g[0]+a[i+1]*g[1]+a[i+2]*g[2]<1.02||pgHid(a,i))continue;const x=a[i]-g[0],y=a[i+1]-g[1],z=a[i+2]-g[2],dd=x*x+y*y+z*z;if(dd<bd){bd=dd;best=i;bc=a;}}}
    if(best>=0){ctx.moveTo(cx+R*g[1],cy-R*g[2]);ctx.lineTo(cx+R*bc[best+1],cy-R*bc[best+2]);nb++;}}
  if(nb){ctx.lineWidth=1.6;ctx.setLineDash([3,3]);ctx.lineDashOffset=-t*8;ctx.strokeStyle=st.beam[0];ctx.stroke();ctx.lineDashOffset=-t*8+3;ctx.strokeStyle=st.beam[1];ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;}
  // Laser links between neighbouring pies, along the plane and to the next plane, near side only.
  if(!PG.noSats)for(const c of PG.sm){if(!c.las||c.cnt<2)continue;const a=c.pos,K=c.K,n=c.cnt;ctx.beginPath();
    for(let i=0;i<n;i++){const o=i*3;if(a[o]<0)continue;const p=(i/K)|0,k=i%K,x=cx+R*a[o+1],y=cy-R*a[o+2];
      const j=p*K+(k+1)%K;if(j<n&&j!==i&&a[j*3]>=0){ctx.moveTo(x,y);ctx.lineTo(cx+R*a[j*3+1],cy-R*a[j*3+2]);}
      const q=((p+1)%c.P)*K+k;if(i%2===0&&q<n&&q!==i&&a[q*3]>=0){ctx.moveTo(x,y);ctx.lineTo(cx+R*a[q*3+1],cy-R*a[q*3+2]);}}
    ctx.strokeStyle=st.laser;ctx.lineWidth=1.2;ctx.globalAlpha=.55*dim;ctx.stroke();ctx.globalAlpha=1;}
  if(PG.fl.length)pgDrawFlows(ctx,st,night,cx,cy,R,t);
  for(const up of [true,false]){ctx.beginPath();let any=false;for(const d of ds){if(d.up!==up)continue;const [x,y]=P(d.s,0);ctx.moveTo(x+4.5,y);ctx.arc(x,y,4.5,0,7);any=true;}
    if(any){ctx.fillStyle=up?st.dish:st.off;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=night?'#0B1030':st.ink;ctx.stroke();}}
  // Load rings: a faint full ring, and the used share in green, amber or red; one stroke per colour.
  {const rg=ds.filter(d=>d.u!==null);if(rg.length){ctx.beginPath();for(const d of rg){const [x,y]=P(d.s,0);ctx.moveTo(x+7.5,y);ctx.arc(x,y,7.5,0,7);}ctx.lineWidth=2.5;ctx.strokeStyle=night?'rgba(255,255,255,.18)':'rgba(30,38,64,.25)';ctx.stroke();
    for(const col of ['#22C47A','#FFAA1F','#FF4D5E']){ctx.beginPath();let any=false;for(const d of rg){if(!(d.u>0.005)||pgLoadCol(d.u)!==col)continue;const [x,y]=P(d.s,0),a0=-Math.PI/2;ctx.moveTo(x+7.5*Math.cos(a0),y+7.5*Math.sin(a0));ctx.arc(x,y,7.5,a0,a0+d.u*2*Math.PI);any=true;}
      if(any){ctx.strokeStyle=col;ctx.stroke();}}}}
  // POPs without a dish (the Dishes tab): small hollow marks, so you see where another dish could go.
  {ctx.beginPath();let any=false;for(const d of PG.pops){const b=pgRot(d.v,d.s||(d.s=new Float32Array(3)),1);if(b[0]<0.08)continue;const [x,y]=P(b,0);ctx.moveTo(x+3.5,y);ctx.arc(x,y,3.5,0,7);any=true;}
    if(any){ctx.fillStyle='#FFFFFF';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=st.ink;ctx.stroke();}}
  // The city picked in the Dishes tab: a pulsing ring and its name.
  if(PG.focus&&isCity(PG.focus)){const v=new Float32Array(3);pgUnit(CITY[PG.focus].lon,CITY[PG.focus].lat,v,0);const b=pgRot(v,new Float32Array(3),1);
    if(b[0]>0.05){const [x,y]=P(b,0),r=10+Math.sin(t*4)*2;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.lineWidth=2.5;ctx.strokeStyle=st.hi;ctx.stroke();
      ctx.font='800 12px Nunito,sans-serif';ctx.textBaseline='middle';const nm=CITY[PG.focus].name,w=ctx.measureText(nm).width+10,lx=Math.max(2,Math.min(W-w-2,x-w/2)),ly=y-r-14;
      ctx.fillStyle=night?'rgba(11,16,48,.9)':'rgba(255,255,255,.95)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(lx,ly-10,w,20,8);else ctx.rect(lx,ly-10,w,20);ctx.fill();ctx.strokeStyle=st.hi;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=night?'#FFFFFF':st.ink;ctx.fillText(nm,lx+5,ly);}}
  PG.geo={cx,cy,R};
  if(!PG.noSats)sats(true);
  // Launch pads, and a rocket climbing from each launch every five seconds, staggered.
  ctx.beginPath();let np=0;for(const d of PG.pads){const b=pgRot(d.v,d.s||(d.s=new Float32Array(3)),1);if(b[0]<0.05)continue;const [x,y]=P(b,0);ctx.moveTo(x-4,y+3);ctx.lineTo(x,y-5);ctx.lineTo(x+4,y+3);ctx.closePath();np++;}
  if(np){ctx.fillStyle='#FF8A3D';ctx.fill();ctx.lineWidth=1.3;ctx.strokeStyle=night?'#0B1030':st.ink;ctx.stroke();}
  const tv=new Float32Array(33),tp=new Float32Array(33),ink=night?'#0B1030':st.ink;
  // Climb and lean east from a pad, f of the way up: fills tp with the trail and returns false when the pad faces away.
  const climb=(L,f)=>{const b=pgRot(L.v,tp,1);if(b[0]<0.05)return false;const la=Math.asin(L.v[2])/PG_D,lo=Math.atan2(L.v[1],L.v[0])/PG_D;
    for(let s=0;s<=10;s++){const g=f*s/10,r=1+g*g*0.7;pgUnit(lo+g*g*28,la+g*6,tv,s*3);tv[s*3]*=r;tv[s*3+1]*=r;tv[s*3+2]*=r;}pgRot(tv,tp,11);return true;};
  const trail=(a)=>{ctx.beginPath();for(let s=0;s<=10;s++){const x=cx+R*tp[s*3+1],y=cy-R*tp[s*3+2];if(s)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
    ctx.globalAlpha=a;ctx.lineCap='round';ctx.lineWidth=4;ctx.strokeStyle='rgba(255,138,61,.85)';ctx.stroke();ctx.lineWidth=1.5;ctx.strokeStyle='#FFD23F';ctx.stroke();ctx.lineCap='butt';ctx.globalAlpha=1;};
  const dot=(x,y,r,fill)=>{ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=1.2;ctx.stroke();};
  const tip=()=>[cx+R*tp[31],cy-R*tp[32]];
  PG.lch.forEach((L,li)=>{const ph=((t+li*2.3)%5)/2.6;if(ph>1||!climb(L,ph))return;trail(1);const [x,y]=tip();dot(x,y,3.5,'#FFFFFF');});
  // The last few flights, replayed every six seconds: pies spill out at the top and a reusable booster flies home; or it
  // goes up a third of the way and becomes a fireball with debris raining down.
  PG.fly.forEach((L,li)=>{const ph=((t+li*1.9)%6)/6;
    if(L.ok){const up=Math.min(1,ph/0.5);if(!climb(L,up))return;trail(ph<0.5?1:Math.max(0,1-(ph-0.5)*3));const [x,y]=tip();
      if(ph<0.5)dot(x,y,3.5,'#FFFFFF');else{const k=(ph-0.5)/0.5;ctx.globalAlpha=1-k;
        for(let i=0;i<6;i++){const a=i/6*2*Math.PI+li,d=4+k*16;dot(x+Math.cos(a)*d,y+Math.sin(a)*d*0.6,1.8,'#FFD23F');}ctx.globalAlpha=1;
        if(L.re&&climb(L,1-k)){const [bx,by]=tip();dot(bx,by,2.4,'#E8EDF7');}}}
    else{const bang=0.4,z=R/100;if(!climb(L,Math.min(ph,bang)))return;const [x,y]=tip();
      if(ph<bang){trail(1);dot(x,y,3.5,'#FFFFFF');return;}
      const k=(ph-bang)/(1-bang),e=1-Math.pow(1-Math.min(1,k*2.5),3);trail(Math.max(0,1-k*4));
      // Flash, then a ball of fire that swells and fades, a grey puff left behind, and debris arcing back down.
      ctx.globalAlpha=Math.max(0,1-k*1.2);ctx.beginPath();ctx.arc(x,y,z*(6+e*26),0,7);ctx.fillStyle='rgba(120,128,150,.45)';ctx.fill();
      ctx.globalAlpha=Math.max(0,1-k*1.6);ctx.beginPath();ctx.arc(x,y,z*(5+e*20),0,7);ctx.fillStyle='#FF4D5E';ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=1.5;ctx.stroke();
      ctx.beginPath();ctx.arc(x,y,z*(3+e*13),0,7);ctx.fillStyle='#FFAA1F';ctx.fill();ctx.beginPath();ctx.arc(x,y,z*(1.5+e*6),0,7);ctx.fillStyle='#FFF3B0';ctx.fill();
      ctx.globalAlpha=Math.max(0,1-k);for(let i=0;i<9;i++){const a=i/9*2*Math.PI+0.4,v=z*(18+i%3*9);dot(x+Math.cos(a)*v*e,y+Math.sin(a)*v*e+z*40*k*k,2,i%2?'#55608A':'#FF8A3D');}
      ctx.globalAlpha=1;}});}
// The arcs: near-side pieces only, glow then core, dimmed when another flow is highlighted; that one goes last, in the accent.
function pgDrawFlows(ctx,st,night,cx,cy,R,t){const hi=PG.hi&&PG.fl.some(f=>f.id===PG.hi)?PG.hi:null,n=PG_ARC+1;
  const line=(f)=>{const a=f.pos;let on=false;ctx.beginPath();for(let i=0;i<n*3;i+=3){if(pgHid(a,i)||(a[i]<0&&!f.sky)){on=false;continue;}const x=cx+R*a[i+1],y=cy-R*a[i+2];if(on)ctx.lineTo(x,y);else ctx.moveTo(x,y);on=true;}};
  const one=(f,me)=>{line(f);ctx.globalAlpha=hi&&!me?0.15:1;ctx.lineCap='round';
    if(night){ctx.lineWidth=f.w*3;ctx.strokeStyle=me?'rgba(255,79,154,.35)':st.fglow;ctx.stroke();ctx.lineWidth=f.w;ctx.strokeStyle=me?st.hi:st.flow;ctx.stroke();}
    else{ctx.lineWidth=f.w+3;ctx.strokeStyle=st.fglow;ctx.stroke();ctx.lineWidth=f.w;ctx.strokeStyle=me?st.hi:st.flow;ctx.stroke();}
    if(!f.sky){ctx.setLineDash([2,4]);ctx.lineWidth=Math.max(1,f.w*.4);ctx.strokeStyle=night?'rgba(11,16,48,.7)':'rgba(255,255,255,.8)';ctx.stroke();ctx.setLineDash([]);}
    // Packets: a few dots riding the arc, more for a bigger flow.
    ctx.beginPath();let any=false;for(let k=0;k<f.pk;k++){const s=((t*0.25+k/f.pk)%1)*(n-1),i=Math.floor(s),j=Math.min(n-1,i+1),u=s-i,a=f.pos;
      if(pgHid(a,i*3)||(a[i*3]<0&&!f.sky))continue;const x=cx+R*(a[i*3+1]*(1-u)+a[j*3+1]*u),y=cy-R*(a[i*3+2]*(1-u)+a[j*3+2]*u),r=Math.max(1.6,f.w*.45);ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,7);any=true;}
    if(any){ctx.fillStyle=st.pkt;ctx.fill();if(!night){ctx.lineWidth=1;ctx.strokeStyle=st.ink;ctx.stroke();}}
    ctx.globalAlpha=1;ctx.lineCap='butt';};
  let top=null;for(const f of PG.fl){pgRot(f.raw,f.pos,n);if(f.id===hi)top=f;else one(f,false);}if(top){one(top,true);pgHiMarks(ctx,top,st,night,cx,cy,R,t);}}
/* The highlighted flow: a ringed satellite where it climbs to the crust and where it comes down (a terminal's single bounce
   halfway), and its two ground ends named, so it is clear what is lit and what it joins. */
function pgHiMarks(ctx,f,st,night,cx,cy,R,t){const n=PG_ARC+1,a=f.pos,at=s=>{const i=Math.round(s*(n-1))*3;return pgHid(a,i)||(a[i]<0&&!f.sky)?null:[cx+R*a[i+1],cy-R*a[i+2]];};
  const pulse=3+Math.sin(t*4)*1.5,mid=at(0.5);ctx.font='800 12px Nunito,sans-serif';ctx.textBaseline='middle';
  // Ends first, their names pushed outwards from the middle of the arc so they never sit on the satellites.
  [0,1].forEach(k=>{const p=at(k),nm=f.nm&&f.nm[k];if(!p)return;ctx.beginPath();ctx.arc(p[0],p[1],5,0,7);ctx.fillStyle=st.hi;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#FFFFFF';ctx.stroke();
    if(!nm)return;const q=at(1-k),near=!q||Math.hypot(p[0]-q[0],p[1]-q[1])<90;let dx=mid?p[0]-mid[0]:0,dy=mid?p[1]-mid[1]:(k?1:-1),l=Math.hypot(dx,dy);if(near||l<4){dx=0;dy=k?1:-1;l=1;}
    const w=ctx.measureText(nm).width+10,x=Math.max(2,Math.min(cx*2-w-2,p[0]+dx/l*(w/2+8)-w/2)),y=Math.max(12,Math.min(cy*2-12,p[1]+dy/l*(near?26:20)));
    ctx.fillStyle=night?'rgba(11,16,48,.9)':'rgba(255,255,255,.95)';ctx.strokeStyle=st.hi;ctx.lineWidth=2;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y-10,w,20,8);else ctx.rect(x,y-10,w,20);ctx.fill();ctx.stroke();
    ctx.fillStyle=night?'#FFFFFF':st.ink;ctx.fillText(nm,x+5,y);});
  for(const s of f.sky?[0.15,0.85]:[0.5]){const p=at(s);if(!p)continue;ctx.beginPath();ctx.arc(p[0],p[1],9+pulse,0,7);ctx.lineWidth=2.5;ctx.strokeStyle=st.hi;ctx.stroke();
    ctx.beginPath();ctx.arc(p[0],p[1],5,0,7);ctx.fillStyle='#FFFFFF';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=st.hi;ctx.stroke();}}
function pgLoop(now){PG.raf=0;if(!PG.cv)return;pgFrame(now,false);if(PG.cv)PG.raf=requestAnimationFrame(pgLoop);}
// Drag to turn the Earth; it keeps turning a little after you let go.
// Turn the globe to face the middle of these cities: yaw −lon, tilt the latitude (clamped like a drag). One city zooms all
// the way in; a flow as far as its length allows.
function pieGlobeLook(cs){const v=[0,0,0];for(const c of cs){if(!isCity(c))continue;const C=CITY[c],b=C.lat*PG_D,o=C.lon*PG_D;v[0]+=Math.cos(b)*Math.cos(o);v[1]+=Math.cos(b)*Math.sin(o);v[2]+=Math.sin(b);}
  const n=Math.hypot(v[0],v[1],v[2]);if(!(n>1e-6))return;let sp=0;for(const c of cs){if(!isCity(c))continue;const C=CITY[c],b=C.lat*PG_D,o=C.lon*PG_D;sp=Math.max(sp,Math.acos(Math.max(-1,Math.min(1,(Math.cos(b)*Math.cos(o)*v[0]+Math.cos(b)*Math.sin(o)*v[1]+Math.sin(b)*v[2])/n))));}
  PG.goal={yaw:-Math.atan2(v[1],v[0])/PG_D,tilt:Math.max(-60,Math.min(60,Math.asin(v[2]/n)/PG_D)),z:sp<1e-6?PG_ZMAX:Math.max(1,Math.min(PG_ZMAX,1/(sp*1.3+0.28)))};PG.vy=0;PG.dirty=true;}
// Zoom: the wheel, a pinch, the ± buttons; dragging turns the globe more finely when zoomed in.
const PG_ZMAX=12;
function pieGlobeZoom(z){PG.zoom=Math.max(1,Math.min(PG_ZMAX,z));if(PG.goal)PG.goal.z=PG.zoom;PG.dirty=true;return PG.zoom;}
function pgWheel(e){if(!PG.cv)return;e.preventDefault();pieGlobeZoom(PG.zoom*Math.exp(-e.deltaY*0.0015));}
// The dish or POP under a tap, within 14 px on the near side, handed to pieGlobePick (the panel decides what to show).
function pgPick(e){const cv=PG.cv,g=PG.geo;if(!cv||!g||typeof pieGlobePick!=='function')return;const r=cv.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;let best=null,bd=14*14;
  for(const d of [...PG.dish,...PG.pops]){if(!d.id||!d.s||d.s[0]<0.08)continue;const x=g.cx+g.R*d.s[1],y=g.cy-g.R*d.s[2],dd=(x-px)**2+(y-py)**2;if(dd<bd){bd=dd;best=d.id;}}
  if(best)pieGlobePick(best);}
function pgDown(e){const cv=PG.cv;if(!cv)return;PG.goal=null;PG.tap={x:e.clientX,y:e.clientY,t:performance.now()};PG.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(PG.ptr.size===2){const [a,b]=[...PG.ptr.values()];PG.pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,z:PG.zoom};PG.drag=null;try{cv.setPointerCapture(e.pointerId);}catch(_){}return;}
  if(PG.ptr.size>2)return;PG.drag={x:e.clientX,y:e.clientY,yaw:PG.yaw,tilt:PG.tilt,lx:e.clientX,lt:performance.now(),v:0};PG.vy=0;try{cv.setPointerCapture(e.pointerId);}catch(_){}cv.style.cursor='grabbing';}
function pgMove(e){if(PG.ptr.has(e.pointerId))PG.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(PG.pinch&&PG.ptr.size>=2){const [a,b]=[...PG.ptr.values()];pieGlobeZoom(PG.pinch.z*Math.hypot(a.x-b.x,a.y-b.y)/PG.pinch.d);return;}
  const d=PG.drag;if(!d)return;const f=0.4/PG.zoom;PG.yaw=d.yaw+(e.clientX-d.x)*f;PG.tilt=Math.max(-60,Math.min(60,d.tilt+(e.clientY-d.y)*0.3/PG.zoom));
  const now=performance.now(),dt=(now-d.lt)/1000;if(dt>0.008){d.v=(e.clientX-d.lx)*f/dt;d.lx=e.clientX;d.lt=now;}PG.dirty=true;}
function pgUp(e){if(e&&e.pointerId!==undefined)PG.ptr.delete(e.pointerId);if(e&&e.type==='pointerup'&&PG.tap&&Math.hypot(e.clientX-PG.tap.x,e.clientY-PG.tap.y)<6&&performance.now()-PG.tap.t<500)pgPick(e);PG.tap=null;if(PG.ptr.size<2)PG.pinch=null;const d=PG.drag;if(!d)return;PG.drag=null;PG.vy=performance.now()-d.lt<120?Math.max(-240,Math.min(240,d.v)):0;if(PG.cv)PG.cv.style.cursor='grab';}
function pieGlobeOpen(canvas,getData){
  if(!canvas||!canvas.getContext)return false;
  if(PG.cv===canvas){PG.get=getData||null;return true;}
  // A panel redraw swaps the canvas: the camera keeps turning to where it was going.
  const keep=PG.cv?PG.goal:null;if(PG.cv)pieGlobeClose();
  const ctx=canvas.getContext('2d');if(!ctx)return false;
  pgVecs();pgNightPref();
  Object.assign(PG,{cv:canvas,ctx,get:getData||null,last:0,dAt:-1e9,sig:'',sm:[],dish:[],fl:[],hi:null,pads:[],lch:[],g:null,dirty:true,drag:null,vy:0,goal:keep,anim:animOn()});
  PG.ptr=new Map();PG.pinch=null;PG.on=[['pointerdown',pgDown],['pointermove',pgMove],['pointerup',pgUp],['pointercancel',pgUp],['lostpointercapture',pgUp],['wheel',pgWheel]];
  for(const [k,f] of PG.on)canvas.addEventListener(k,f,k==='wheel'?{passive:false}:undefined);
  canvas.style.touchAction='none';canvas.style.cursor='grab';
  PG.raf=requestAnimationFrame(pgLoop);return true;}
function pieGlobeClose(){
  if(PG.raf)cancelAnimationFrame(PG.raf);PG.raf=0;
  const cv=PG.cv;if(cv&&PG.on)for(const [k,f] of PG.on)cv.removeEventListener(k,f);
  Object.assign(PG,{cv:null,ctx:null,get:null,on:null,drag:null,goal:null,sm:[],dish:[],fl:[],hi:null,pads:[],lch:[],g:null,sig:'',buf:null});}
// Night view: a per-device preference, like the other display settings.
function pieGlobeNight(on){PG.night=!!on;PG.g=null;PG.dirty=true;try{localStorage.setItem('sot-globe',PG.night?'night':'day');}catch(e){}
  for(const b of document.querySelectorAll('.pgnight')){b.setAttribute('aria-pressed',String(PG.night));b.setAttribute('aria-label',pgNightLbl());b.textContent=PG.night?'☀️':'🌙';}
  return PG.night;}
const pgNightLbl=()=>pgNightPref()?tr('pie_globe.switch_to_day_view'):tr('pie_globe.switch_to_night_view');
const pieGlobeBtn=()=>`<button class="b sm ghost pgnight" data-act="pieGlobeNight" aria-pressed="${pgNightPref()}" aria-label="${esc(pgNightLbl())}">${PG.night?'☀️':'🌙'}</button>`;
// What the panel puts where the globe goes; then it calls pieGlobeOpen(that canvas, pieGlobeData).
const pieGlobeHtml=()=>`<div class="pglobe"><canvas class="pgcv" role="img" aria-label="${esc(tr('pie_globe.your_pies_in_orbit'))}"></canvas>${pieGlobeBtn()}<div class="pgzoom"><button class="b sm ghost" data-act="pieGlobeZoom" data-args='{"d":1}' aria-label="${esc(tr('pie_globe.zoom_in'))}">+</button><button class="b sm ghost" data-act="pieGlobeZoom" data-args='{"d":-1}' aria-label="${esc(tr('pie_globe.zoom_out'))}">−</button></div></div>`;
