/* The background on the card, painted first each frame: the sea, the land, the waves, the clouds and the cables, as
   the 2D map paints them (drawFrame(), paintWorld()) and in the same colours. The land and the cables are geometry
   built once, so panning and zooming repaint nothing; only the waves and the clouds move. */
const glPm=s=>{const [r,g,b,a]=glColor(s);return [r*a,g*a,b*a,a];}; // premultiplied, as the card blends
const SEA_TOP=glPm('#62CBEA'),SEA_BOT=glPm('#43AED6'),CLOUD_COL=glPm('rgba(255,255,255,.55)');
const LAND_SHADOW=glPm('rgba(20,90,130,.35)'),LAND_GRASS=glPm('#9BDA6C'),HILL_COL=glPm('#86CB5B'),HILL_SHINE=glPm('rgba(255,255,255,.18)');
// The land's fill: a fan of triangles per coastline, counted in the stencil (how many times the coasts wind round each
// pixel: glLandFill()), then one cover where the count is not zero. uOff shifts it in CSS px (the shadow).
const FAN_VS=GL_HEAD+GL_CLIP+`layout(location=0) in vec2 aV;uniform vec2 uView,uOff;uniform vec3 uCam;
void main(){gl_Position=clip((aV-uCam.xy)*uCam.z+uView*.5+uOff,uView,0.);}`;
const FAN_FS=GL_HEAD+`out vec4 o;void main(){o=vec4(0.);}`;
// Ellipses (the hills and their shine): centre and radii in map units, one premultiplied colour, smooth edges.
const ELL_VS=GL_HEAD+GL_CLIP+`layout(location=0) in vec4 aE;uniform vec2 uView;uniform vec3 uCam;out vec2 vq;flat out vec2 vr;
void main(){vec2 c=(aE.xy-uCam.xy)*uCam.z+uView*.5,r=aE.zw*uCam.z,m=r+1.;vq=vec2((gl_VertexID&1)==0?-m.x:m.x,(gl_VertexID&2)==0?-m.y:m.y);vr=r;gl_Position=clip(c+vq,uView,0.);}`;
const ELL_FS=GL_HEAD+`in vec2 vq;flat in vec2 vr;uniform vec4 uCol;uniform float uDpr;out vec4 o;
void main(){float d=(length(vq/vr)-1.)*min(vr.x,vr.y),a=clamp(.5-d*uDpr,0.,1.);if(a<=0.)discard;o=uCol*a;}`;
// Discs for the stencil only (the clouds' puffs): centre and radius in map units.
const CIRC_VS=GL_HEAD+GL_CLIP+`layout(location=0) in vec4 aC;uniform vec2 uView;uniform vec3 uCam;out vec2 vq;flat out float vr;
void main(){vec2 c=(aC.xy-uCam.xy)*uCam.z+uView*.5;float r=aC.z*uCam.z,m=r+1.;vq=vec2((gl_VertexID&1)==0?-m:m,(gl_VertexID&2)==0?-m:m);vr=r;gl_Position=clip(c+vq,uView,0.);}`;
const CIRC_FS=GL_HEAD+`in vec2 vq;flat in float vr;out vec4 o;void main(){if(length(vq)>vr)discard;o=vec4(1.);}`;
/* The land, built once per level of detail (the far view leaves out the islets as LANDP_FAR does) and per zoom level
   lv (powers of 2): the fan for the fills, the coastlines as line segments (paintWorld()'s curves, four segments each)
   for the sand and the dark edge, and the hills. Zoomed out a coastline has far more points than pixels, and its
   vertices were most of the card's work: at level lv it is simplified so that no point moves more than COAST_TOL px at
   the level's zoom (Douglas-Peucker). Without lv, the whole coastline. COAST and onLand() are not touched.
   Each level stays on the card once built (GLX.land, freed with the card): from 0.4 MB zoomed out to 3 MB at the
   closest zoom, about 15 MB if a game visits every zoom, so zooming back never builds one again mid-gesture. */
const COAST_TOL=0.25,COASTP=[];
// A coastline as paintWorld() draws it (smoothPath(): a quadratic curve from the middle of each side to the next,
// through the corner between them), four segments per curve; the first point is repeated at the end.
function coastPts(ri){let P=COASTP[ri];if(P)return P;const ring=COAST[ri],n=ring.length;P=[];
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];let m=mid(ring[n-1],ring[0]);P.push(m);
  for(let i=0;i<n;i++){const c=ring[i],e=mid(c,ring[(i+1)%n]);for(let j=1;j<=4;j++){const t=j/4,u=1-t;P.push([u*u*m[0]+2*u*t*c[0]+t*t*e[0],u*u*m[1]+2*u*t*c[1]+t*t*e[1]]);}m=e;}
  return COASTP[ri]=P;}
// The points of P to keep so that none of the others is further than tol from the line kept (Douglas-Peucker).
function coastSimplify(P,tol){const n=P.length;if(n<4||!(tol>0))return P;const keep=new Uint8Array(n),st=[0,n-1],t2=tol*tol;keep[0]=keep[n-1]=1;
  while(st.length){const b=st.pop(),a=st.pop(),ax=P[a][0],ay=P[a][1],dx=P[b][0]-ax,dy=P[b][1]-ay,L=dx*dx+dy*dy||1e-12;let m=-1,md=t2;
    for(let i=a+1;i<b;i++){let t=((P[i][0]-ax)*dx+(P[i][1]-ay)*dy)/L;t=t<0?0:t>1?1:t;const ex=ax+t*dx-P[i][0],ey=ay+t*dy-P[i][1],d=ex*ex+ey*ey;if(d>md){md=d;m=i;}}
    if(m>=0){keep[m]=1;st.push(a,m,m,b);}}
  const o=[];for(let i=0;i<n;i++)if(keep[i])o.push(P[i]);return o;}
// The zoom level the land is drawn at: 2^lv ≤ zoom < 2^(lv+1). Zooming in takes the finer level at once; zooming out
// keeps the finer one (only more points, never less detail) until the zoom is 10 % under it, so a zoom that hovers
// around a power of 2 does not switch back and forth.
function coastLevel(z){const want=Math.floor(Math.log2(Math.max(z,1/64))),cur=GLX.coastLv;
  if(cur===undefined||want>cur||z<Math.pow(2,cur)/1.1)GLX.coastLv=want;return GLX.coastLv;}
/* A coastline as a fan of triangles from its first point, all turned the same way (anticlockwise on the map): summed
   with their signs, they count how many times the coast winds round each point. Every coast counts +1 inside, so where
   two coasts overlap (Timor is drawn twice) the land is 2, still land, as each coast filled on its own in 2D. */
function coastFan(P,out){let a=0;const n=P.length;for(let i=0;i<n;i++){const p=P[i],q=P[(i+1)%n];a+=p[0]*q[1]-q[0]*p[1];}
  const s=a<0?1:0;for(let i=1;i+1<n;i++){const b=P[i+s],c=P[i+1-s];out.push(P[0][0],P[0][1],b[0],b[1],c[0],c[1]);}return out;}
function glLandGeo(gl,far,lv){const key=(far?'far':'all')+(lv===undefined?'':'@'+lv);let G=GLX.land[key];if(G)return G;
  const keep=far?new Set(LANDP_FAR):null,tol=lv===undefined?0:COAST_TOL/Math.pow(2,lv),fan=[],sand=[],edge=[],SAND=glColor('#F8E6A8'),EDGE=glColor('#1E2640');
  COAST.forEach((ring,ri)=>{if(keep&&!keep.has(LANDP_ALL[ri]))return;if(ring.length<3)return;
    const P=coastSimplify(coastPts(ri),tol);if(P.length<4)return;
    coastFan(P,fan);
    // A closed ring (its first point repeated at the end), joined all round.
    const s0=sand.length/LINE_STRIDE;for(let i=0;i+1<P.length;i++){glSeg(sand,P[i],P[i+1],0,10,0,LINE_ROUND,SAND);glSeg(edge,P[i],P[i+1],0,2.5,0,LINE_ROUND,EDGE);}
    const s1=sand.length/LINE_STRIDE;glJoin(sand,s0,s1,true);glJoin(edge,s0,s1,true);});
  const hills=[],shine=[];for(const [x,y,r] of HILLS){hills.push(x,y,r*1.4,r*.8);shine.push(x-r*.3,y-r*.25,r*.6,r*.3);}
  const F=a=>new Float32Array(a);
  G={fan:glVao(gl,[2],0,F(fan)).v,nFan:fan.length/2,sand:glVao(gl,[4,4,4,4],1,F(sand)).v,edge:glVao(gl,[4,4,4,4],1,F(edge)).v,nSeg:sand.length/LINE_STRIDE,
    hills:glVao(gl,[4],1,F(hills)).v,shine:glVao(gl,[4],1,F(shine)).v,nHill:HILLS.length};
  glMem(gl,'the land');return GLX.land[key]=G;}
// Fills the land's shape (shifted by ox, oy CSS px) with one colour, for every copy of the map.
// The stencil counts the coasts' windings (+1 for a triangle facing one way, -1 the other: coastFan()), as the 2D
// canvas's nonzero rule does; counting only odd or even made two overlapping coasts cancel out into sea.
function glLandFill(gl,G,ks,ox,oy,col){const P=GLX.fan;gl.enable(gl.STENCIL_TEST);
  gl.useProgram(P.p);gl.uniform2f(P.u.uView,CW,CH);gl.uniform2f(P.u.uOff,ox,oy);gl.bindVertexArray(G.fan);
  gl.colorMask(false,false,false,false);gl.stencilFunc(gl.ALWAYS,0,255);gl.stencilMask(255);
  gl.stencilOpSeparate(gl.FRONT,gl.KEEP,gl.KEEP,gl.INCR_WRAP);gl.stencilOpSeparate(gl.BACK,gl.KEEP,gl.KEEP,gl.DECR_WRAP);
  for(const k of ks){gl.uniform3f(P.u.uCam,cam.x-k*W,cam.y,cam.z);gl.drawArrays(gl.TRIANGLES,0,G.nFan);}
  // The cover paints where the count is not zero and sets the stencil back to zero for the next user.
  gl.colorMask(true,true,true,true);gl.stencilFunc(gl.NOTEQUAL,0,255);gl.stencilOp(gl.ZERO,gl.ZERO,gl.ZERO);
  glFill(gl,col);gl.disable(gl.STENCIL_TEST);}
function glEllipses(gl,vao,n,ks,col){const P=GLX.ell;gl.useProgram(P.p);gl.bindVertexArray(vao);gl.uniform2f(P.u.uView,CW,CH);gl.uniform1f(P.u.uDpr,DPR);gl.uniform4fv(P.u.uCol,col);
  for(const k of ks){gl.uniform3f(P.u.uCam,cam.x-k*W,cam.y,cam.z);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,n);}}
// In paintWorld()'s order: the shadow (5, 7 px down and right), the sand, the grass, the hills, the coastline.
function glLand(gl,ks){const G=glLandGeo(gl,lodFar(),coastLevel(cam.z));
  glLandFill(gl,G,ks,5,7,LAND_SHADOW);
  glLines(gl,G.sand,G.nSeg,ks);
  glLandFill(gl,G,ks,0,0,LAND_GRASS);
  glEllipses(gl,G.hills,G.nHill,ks,HILL_COL);glEllipses(gl,G.shine,G.nHill,ks,HILL_SHINE);
  glLines(gl,G.edge,G.nSeg,ks);}
// The waves: each one two quadratic curves of four segments, swaying with the map's clock as in drawFrame(). They are
// written into the same array every frame (no garbage for the collector to pick up while you play).
const WAVE_COL=glColor('rgba(255,255,255,.45)');
function glWaves(gl,now,ks){const A=GLX.wa||(GLX.wa=new Float32Array(WAVES.length*8*LINE_STRIDE)),ph0=now/900;let m=0;
  for(const [x,y,ph] of WAVES){const o=Math.sin(ph0+ph*6)*3,m0=m;
    // Two curves: up from x-9 to x, then down to x+9 (no array literals per wave: they were garbage every frame).
    for(let c=0;c<2;c++){const x0=x+o+(c?0:-9),cx=x0+4.5,cy=y+(c?4:-4),x1=x0+9;let px=x0,py=y;
      for(let j=1;j<=4;j++){const t=j/4,u=1-t,qx=u*u*x0+2*u*t*cx+t*t*x1,qy=u*u*y+2*u*t*cy+t*t*y;glSegAt(A,m++,px,py,qx,qy,0,2,0,0,WAVE_COL[3],WAVE_COL);px=qx;py=qy;}}
    glJoin(A,m0,m,false);}
  gl.bindBuffer(gl.ARRAY_BUFFER,GLX.wv.b);gl.bufferData(gl.ARRAY_BUFFER,A.subarray(0,m*LINE_STRIDE),gl.DYNAMIC_DRAW);glLines(gl,GLX.wv.v,m,ks);}
// The clouds: their puffs are stencilled as one shape, then filled once, so overlapping puffs do not stack.
function glClouds(gl,now,ks){const need=ks.length*CLOUDS.length*12;if(!need)return;
  // Written into one array kept from frame to frame, grown when more copies of the map show.
  if(!GLX.ca||GLX.ca.length<need)GLX.ca=new Float32Array(need);const A=GLX.ca;let n=0;
  for(const k of ks)for(const c of CLOUDS){const x=((c.x+now/1000*c.v)%(W+200))-100+k*W,y=c.y,s=c.s;
    A[n++]=x;A[n++]=y;A[n++]=16*s;A[n++]=0;A[n++]=x+18*s;A[n++]=y-8*s;A[n++]=20*s;A[n++]=0;A[n++]=x+40*s;A[n++]=y;A[n++]=15*s;A[n++]=0;}
  const F=A.subarray(0,n),P=GLX.circ;gl.bindBuffer(gl.ARRAY_BUFFER,GLX.cl.b);gl.bufferData(gl.ARRAY_BUFFER,F,gl.DYNAMIC_DRAW);
  gl.enable(gl.STENCIL_TEST);gl.stencilFunc(gl.ALWAYS,1,255);gl.stencilOp(gl.KEEP,gl.KEEP,gl.REPLACE);gl.colorMask(false,false,false,false);
  gl.useProgram(P.p);gl.bindVertexArray(GLX.cl.v);gl.uniform2f(P.u.uView,CW,CH);gl.uniform3f(P.u.uCam,cam.x,cam.y,cam.z);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,F.length/4);
  gl.colorMask(true,true,true,true);gl.stencilFunc(gl.EQUAL,1,255);gl.stencilOp(gl.KEEP,gl.KEEP,gl.KEEP);glFill(gl,CLOUD_COL);gl.disable(gl.STENCIL_TEST);}
// The cables, as drawCables() strokes them: rebuilt only when the highlighted city or the architect view changes.
function glCables(gl,ks,selC,ar){const key=[selC,ar];
  if(!GLX.ckey||key.some((v,i)=>v!==GLX.ckey[i])){const A=[];
    for(const cp of CABLE_PAIRS){const hot=!!selC&&(cp.a===selC||cp.b===selC);if(ar&&!hot&&!(arKind(cp.a)&&arKind(cp.b)))continue;
      const C=CAB[cp.cid],[r,g,b]=glColor(cableCol(C)),col=[r,g,b,hot?.95:.4],s0=A.length/LINE_STRIDE;let cum=0;
      for(let j=0;j+1<cp.pts.length;j++){const p=cp.pts[j],q=cp.pts[j+1];glSeg(A,p,q,cum,hot?3:1.6,C.age==='old'?6:0,0,col);cum+=Math.hypot(q[0]-p[0],q[1]-p[1]);}
      glJoin(A,s0,A.length/LINE_STRIDE,false);}
    const F=new Float32Array(A);gl.bindBuffer(gl.ARRAY_BUFFER,GLX.cb.b);gl.bufferData(gl.ARRAY_BUFFER,F,gl.STATIC_DRAW);glMem(gl,'the cables');GLX.cn=F.length/LINE_STRIDE;GLX.ckey=key;}
  if(GLX.cn)glLines(gl,GLX.cb.v,GLX.cn,ks);}
// Starts a frame on the card: clears it and paints the background. The tubes come next (glFrame()), then the pictures
// (glsFrameEnd()); draw() paints anything else on the overlay, which becomes ctx until the frame ends.
function glBegin(now,ks){const gl=GLX.gl,c=GLX.c,f=GLX.f;glShow(true);GLS.frame=true;
  if(c.width!==cv.width||c.height!==cv.height){c.width=f.width=cv.width;c.height=f.height=cv.height;}
  // The 2D map under the card stays empty: it is cleared once, not every frame.
  if(!GLX.c0clean){CTX0.setTransform(1,0,0,1,0,0);CTX0.clearRect(0,0,cv.width,cv.height);GLX.c0clean=true;}
  gl.viewport(0,0,c.width,c.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clearStencil(0);gl.colorMask(true,true,true,true);gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.disable(gl.STENCIL_TEST);
  glFill(gl,SEA_TOP,SEA_BOT);
  glLand(gl,ks);
  glWaves(gl,now,ks);
  glClouds(gl,now,ks);
  const selC=UI.drag&&UI.drag.mode==='link'?UI.drag.from:(UI.sel&&UI.sel.type==='city'?UI.sel.id:null);
  glCables(gl,ks,selC,arOn());
  const fx=GLX.fx;if(GLX.fxUsed){fx.setTransform(1,0,0,1,0,0);fx.clearRect(0,0,f.width,f.height);GLX.fxUsed=false;}
  ctx=fx;ctx.setTransform(DPR,0,0,DPR,0,0);}
