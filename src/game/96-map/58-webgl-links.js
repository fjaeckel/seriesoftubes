/* The tubes on the card: every tube is one instanced draw per layer (halo, casing, colour, fiber dots, packets), and
   the packets travel their paths in the vertex shader, so a frame costs a few uniforms however many tubes there are.
   The buffers are rebuilt only when the network, the routing or the day change; a selection only rebuilds the halo,
   a buffer of the selected tube's own segments. Depth stands in for
   the 2D painting order: a later tube's casing still covers an earlier tube's colour and packets. */
// The line program's passes: a tube's layers in drawFrame()'s order, and plain lines (coasts, waves, cables).
const LP={halo:0,casing:1,colour:2,dots:3,plain:4};
// A segment's flags: on the selected tube, lit fiber (its dots show), round ends for a plain line.
const LINE_SEL=1,LINE_FIBER=2,LINE_ROUND=4;
/* One segment is 16 floats: x0,y0,x1,y1 (map units) | the length before it, width (CSS px), dash (LDASH), flags |
   a, r,g,b, where a is the depth for a tube and the opacity for a plain line | the directions of the segments before
   and after it on the same line (0,0: none, the line ends here; glJoin() fills them). */
const LINE_STRIDE=16;
function glSegAt(A,i,ax,ay,bx,by,cum,w,dash,fl,a,col){const o=i*LINE_STRIDE;
  A[o]=ax;A[o+1]=ay;A[o+2]=bx;A[o+3]=by;A[o+4]=cum;A[o+5]=w;A[o+6]=dash;A[o+7]=fl;A[o+8]=a;A[o+9]=col[0];A[o+10]=col[1];A[o+11]=col[2];A[o+12]=A[o+13]=A[o+14]=A[o+15]=0;}
function glSeg(A,p,q,cum,w,dash,fl,col){A.push(p[0],p[1],q[0],q[1],cum,w,dash,fl,col[3],col[0],col[1],col[2],0,0,0,0);}
// Segments i0..i1-1 of A are one line: each learns its neighbours' directions (closed: the last meets the first).
function glJoin(A,i0,i1,closed){closed=closed&&i1-i0>2;
  for(let i=i0;i<i1;i++){const o=i*LINE_STRIDE,p=i>i0?i-1:closed?i1-1:-1,n=i+1<i1?i+1:closed?i0:-1;
    if(p>=0){const q=p*LINE_STRIDE;A[o+12]=A[q+2]-A[q];A[o+13]=A[q+3]-A[q+1];}else A[o+12]=A[o+13]=0;
    if(n>=0){const q=n*LINE_STRIDE;A[o+14]=A[q+2]-A[q];A[o+15]=A[q+3]-A[q+1];}else A[o+14]=A[o+15]=0;}}
/* One instance per segment, a quad around it; the fragment keeps what lies within half the line width of the segment
   (or of a dash of it, both with round ends), which also gives round joins and caps. Where two segments of a line
   meet, their round ends overlap: each keeps only its side of the corner's bisector, so a see-through line (the
   halo, the cables, the waves, the fiber's dots) is blended once there, as the 2D canvas strokes a path once. */
const GL_LINE_VS=GL_HEAD+GL_CLIP+`layout(location=0) in vec4 aSeg;layout(location=1) in vec4 aP;layout(location=2) in vec4 aC;layout(location=3) in vec4 aN;
uniform vec2 uView;uniform vec3 uCam;uniform float uWMul,uDpr,uBusy;uniform int uPass;
out vec2 vLoc;out float vLen,vS0,vHalf,vButt;flat out vec4 vCol,vK;flat out vec2 vDash,vEnd;
// The corner's bisector between directions u and v, in the segment's own frame (t along it, n across), and whether there is one.
vec3 cut(vec2 u,vec2 v,vec2 t,vec2 n){vec2 m=u+v;float l=length(m);if(length(u)<.5||length(v)<.5||l<1e-3)return vec3(0.);m/=l;return vec3(dot(t,m),dot(n,m),1.);}
vec2 dashOf(int k){${LDASH.map((d,i)=>d.length?`if(k==${i})return vec2(${d[0]}.,${d[1]}.);`:'').join('')}return vec2(0.);}
void main(){vec2 h=uView*.5,a=(aSeg.xy-uCam.xy)*uCam.z+h,b=(aSeg.zw-uCam.xy)*uCam.z+h;
  float w=aP.y*uWMul,hw=w*.5;int fl=int(aP.w+.5);vec4 col=vec4(aC.yzw,1.);vec2 dash=dashOf(int(aP.z+.5));bool skip=false;
  if(uPass==${LP.halo}){hw=(w+14.)*.5;col=vec4(1.,79./255.,154./255.,.35);dash=vec2(0.);skip=(fl&${LINE_SEL})==0;}
  else if(uPass==${LP.casing}){hw=(w+4.)*.5;col=vec4(30./255.,38./255.,64./255.,1.);}
  else if(uPass==${LP.dots}){hw=max(1.,w*.25)*.5;col=vec4(1.,1.,1.,.75);dash=dashOf(5);skip=(fl&${LINE_FIBER})==0||uBusy>.5;}
  else if(uPass==${LP.plain})col.a=aC.x;
  if(skip){gl_Position=vec4(2.,2.,2.,1.);return;}
  vec2 d=b-a;float L=length(d);vec2 t=L>1e-4?d/L:vec2(1.,0.),n=vec2(-t.y,t.x);float m=hw+1./uDpr;
  float sx=(gl_VertexID&1)==0?-m:L+m,sy=(gl_VertexID&2)==0?-m:m;
  vLoc=vec2(sx,sy);vLen=L;vS0=aP.x*uCam.z;vHalf=hw;vCol=col;vDash=dash;vButt=uPass==${LP.plain}&&(fl&${LINE_ROUND})==0?1.:0.;
  float lp=length(aN.xy),ln=length(aN.zw);vec3 c0=L>1e-4&&lp>1e-9?cut(aN.xy/lp,t,t,n):vec3(0.),c1=L>1e-4&&ln>1e-9?cut(t,aN.zw/ln,t,n):vec3(0.);
  vK=vec4(c0.xy,c1.xy);vEnd=vec2(c0.z,c1.z);
  gl_Position=clip(a+t*sx+n*sy,uView,(uPass==${LP.plain}?.9998:aC.x)*2.-1.);}`;
const GL_LINE_FS=GL_HEAD+`in vec2 vLoc;in float vLen,vS0,vHalf,vButt;flat in vec4 vCol,vK;flat in vec2 vDash,vEnd;uniform float uDpr;out vec4 o;
void main(){float x=vLoc.x,y=vLoc.y,d;
  // A corner: the side of the bisector that belongs to the neighbour is the neighbour's to paint.
  if(vEnd.x>.5&&x*vK.x+y*vK.y<0.)discard;
  if(vEnd.y>.5&&(x-vLen)*vK.z+y*vK.w>0.)discard;
  // Flat ends only where the line really ends; its corners are joined.
  if(vButt>.5&&((vEnd.x<.5&&x<0.)||(vEnd.y<.5&&x>vLen)))discard;
  if(vDash.x<=0.){float c=clamp(x,0.,vLen);d=length(vec2(x-c,y));}
  else{float P=vDash.x+vDash.y,g=vS0+x,k=floor(g/P);d=1e9;
    for(int i=-1;i<=1;i++){float a0=(k+float(i))*P,lo=max(a0,vS0),hi=min(a0+vDash.x,vS0+vLen);if(lo<=hi){float c=clamp(g,lo,hi);d=min(d,length(vec2(g-c,y)));}}}
  float al=clamp((vHalf-d)*uDpr+.5,0.,1.);if(al<=0.)discard;o=vec4(vCol.rgb*vCol.a*al,vCol.a*al);}`;
// Plain lines (coasts, waves, cables): colour and opacity from the data, flat ends unless LINE_ROUND, under the tubes.
function glLines(gl,vao,n,ks){const L=GLX.line;gl.useProgram(L.p);gl.bindVertexArray(vao);gl.uniform1i(L.u.uPass,LP.plain);gl.uniform1f(L.u.uBusy,0);
  for(const k of ks){glSet(gl,L,k,1);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,n);}}
/* Packets: one instance per packet; where it is on its tube comes from the tube's points (a float texture of x, y and
   the share of the length so far, GL_PTS_W texels a row), found by bisection the way polyAtXY() finds it. */
const GL_PTS_W=2048;
const GL_PK_VS=GL_HEAD+GL_CLIP+`layout(location=0) in vec4 aK;layout(location=1) in vec4 aQ;
uniform vec2 uView;uniform vec3 uCam;uniform float uWMul,uDpr,uT,uFar;uniform highp sampler2D uPts;
out vec2 vLoc;flat out float vR,vLw;
vec4 P(int i){return texelFetch(uPts,ivec2(i%${GL_PTS_W},i/${GL_PTS_W}),0);}
void main(){float n=uFar>.5?max(1.,floor(aK.w*.5)):aK.w,i=aQ.x;if(i>=n){gl_Position=vec4(2.,2.,2.,1.);return;}
  float t=fract(uT*90./max(aK.z*uCam.z,40.)+i/n);if(mod(i,2.)>.5)t=1.-t;
  int o=int(aK.x+.5),lo=1,hi=int(aK.y+.5)-1;for(int s=0;s<16&&lo<hi;s++){int md=(lo+hi)/2;if(P(o+md).z<t)lo=md+1;else hi=md;}
  vec4 p0=P(o+lo-1),p1=P(o+lo);float f=p1.z>p0.z?(t-p0.z)/(p1.z-p0.z):0.;vec2 c=(mix(p0.xy,p1.xy,f)-uCam.xy)*uCam.z+uView*.5;
  float w=aQ.y*uWMul,r=uFar>.5?1.6:max(2.2,w*.42),lw=uFar>.5?1.:1.5,m=r+lw*.5+1./uDpr;
  vec2 q=vec2((gl_VertexID&1)==0?-m:m,(gl_VertexID&2)==0?-m:m);vLoc=q;vR=r;vLw=lw;
  gl_Position=clip(c+q,uView,aQ.z*2.-1.);}`;
const GL_PK_FS=GL_HEAD+`in vec2 vLoc;flat in float vR,vLw;uniform float uDpr;out vec4 o;
void main(){float d=length(vLoc),out_=clamp((vR+vLw*.5-d)*uDpr+.5,0.,1.);if(out_<=0.)discard;
  float inn=clamp((vR-vLw*.5-d)*uDpr+.5,0.,1.);vec3 c=mix(vec3(30./255.,38./255.,64./255.),vec3(1.),inn);o=vec4(c*out_,out_);}`;
/* The tubes as instance data: their segments (see LINE_STRIDE; later tubes are nearer), their packets (first point,
   points, length, packets | which, base width, depth, -), and every tube's points in the texture. */
const glDepth=(gi,N)=>1-(gi+1)/(N+2);
function glBuild(LG,GM,looks){const gl=GLX.gl,N=LG.length;let ns=0,np=0,nk=0;
  for(let gi=0;gi<N;gi++){ns+=GM[gi].pts.length-1;np+=GM[gi].pts.length;nk+=looks[gi].pk;}
  const SEG=new Float32Array(ns*LINE_STRIDE),PK=new Float32Array(nk*8),TH=Math.max(1,Math.ceil(np/GL_PTS_W)),PT=new Float32Array(GL_PTS_W*TH*4);
  let si=0,ki=0,pi=0;
  for(let gi=0;gi<N;gi++){const L=looks[gi],{pts,cum,len}=GM[gi],dep=glDepth(gi,N),col=glColor(L.col);
    const fl=L.df&&!L.bld&&!L.dark?LINE_FIBER:0,p0=pi;
    for(let j=0;j<pts.length;j++){PT[pi*4]=pts[j][0];PT[pi*4+1]=pts[j][1];PT[pi*4+2]=cum[j];pi++;}
    const s0=si;for(let j=0;j+1<pts.length;j++)glSegAt(SEG,si++,pts[j][0],pts[j][1],pts[j+1][0],pts[j+1][1],cum[j]*len,L.w0,L.dash,fl,dep,col);
    glJoin(SEG,s0,si,false);
    for(let i=0;i<L.pk;i++){const o=ki*8;PK[o]=p0;PK[o+1]=pts.length;PK[o+2]=len;PK[o+3]=L.pk;PK[o+4]=i;PK[o+5]=L.w0;PK[o+6]=dep;ki++;}}
  gl.bindBuffer(gl.ARRAY_BUFFER,GLX.lv.b);gl.bufferData(gl.ARRAY_BUFFER,SEG,gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,GLX.pv.b);gl.bufferData(gl.ARRAY_BUFFER,PK,gl.DYNAMIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D,GLX.tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,GL_PTS_W,TH,0,gl.RGBA,gl.FLOAT,PT);glMem(gl,'the tubes');
  Object.assign(GLX,{nSeg:ns,nPk:nk});return {SEG,PK,PT};}
// The selected tube's halo: its segments again, at its own depth (so later tubes still cover it), and nothing else.
function glHalo(LG,GM,looks,selId){const gl=GLX.gl,N=LG.length,A=[];
  if(selId)for(let gi=0;gi<N;gi++){if(!LG[gi].some(x=>x.id===selId))continue;const L=looks[gi],{pts,cum,len}=GM[gi],dep=glDepth(gi,N),col=glColor(L.col);
    const s0=A.length/LINE_STRIDE;for(let j=0;j+1<pts.length;j++)A.push(pts[j][0],pts[j][1],pts[j+1][0],pts[j+1][1],cum[j]*len,L.w0,L.dash,LINE_SEL,dep,col[0],col[1],col[2],0,0,0,0);
    glJoin(A,s0,A.length/LINE_STRIDE,false);}
  const F=new Float32Array(A);if(F.length){gl.bindBuffer(gl.ARRAY_BUFFER,GLX.hv.b);gl.bufferData(gl.ARRAY_BUFFER,F,gl.DYNAMIC_DRAW);}
  GLX.nHalo=F.length/LINE_STRIDE;return F;}
// Draws the tubes and their packets over the background glBegin() painted (ML: mapLinks(), sc: the icon scale).
function glFrame(ML,ks,far,busy,now,sc){const gl=GLX.gl;
  const selId=UI.sel&&UI.sel.type==='link'?UI.sel.id:'',net=GLX.key[0]!==ML;
  if(net)glBuild(ML.LG,ML.GM,ML.looks);
  if(net||GLX.key[1]!==selId){glHalo(ML.LG,ML.GM,ML.looks,selId);GLX.key=[ML,selId];}
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
  const L=GLX.line,K=GLX.pk,wm=sc*(far?0.5:1),lines=(pass,v=GLX.lv.v,n=GLX.nSeg)=>{gl.useProgram(L.p);gl.bindVertexArray(v);gl.uniform1f(L.u.uBusy,busy?1:0);gl.uniform1i(L.u.uPass,pass);
    for(const k of ks){glSet(gl,L,k,wm);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,n);}};
  if(GLX.nSeg)for(const pass of [LP.casing,LP.colour,LP.dots])lines(pass);
  if(GLX.nPk){gl.useProgram(K.p);gl.bindVertexArray(GLX.pv.v);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GLX.tex);gl.uniform1i(K.u.uPts,0);
    gl.uniform1f(K.u.uT,now/1000);gl.uniform1f(K.u.uFar,far?1:0);for(const k of ks){glSet(gl,K,k,wm);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,GLX.nPk);}}
  // The selection's halo goes over earlier tubes but under its own line and later ones, as in 2D.
  if(GLX.nHalo){gl.depthFunc(gl.LESS);gl.depthMask(false);lines(LP.halo,GLX.hv.v,GLX.nHalo);gl.depthMask(true);}
  gl.bindVertexArray(null);}
// The link being dragged out (x,y in CSS px): the dark dotted line, then the pink one running along it, over the tubes
// and, since the pictures are drawn after it, under the cities, as in 2D.
const DRAG_INK=glColor('#1E2640'),DRAG_PINK=glColor('#FF4F9A');
function glDrag(ax,ay,tx,ty,now){const gl=GLX.gl,A=GLX.da||(GLX.da=new Float32Array(2*LINE_STRIDE)),z=cam.z,mx=x=>(x-CW/2)/z+cam.x,my=y=>(y-CH/2)/z+cam.y;
  glSegAt(A,0,mx(ax),my(ay),mx(tx),my(ty),0,7,7,LINE_ROUND,1,DRAG_INK);
  glSegAt(A,1,mx(ax),my(ay),mx(tx),my(ty),-now/30/z,4,7,LINE_ROUND,1,DRAG_PINK);
  gl.bindBuffer(gl.ARRAY_BUFFER,GLX.dv.b);gl.bufferData(gl.ARRAY_BUFFER,A,gl.DYNAMIC_DRAW);
  gl.disable(gl.DEPTH_TEST);glLines(gl,GLX.dv.v,2,[0]);gl.bindVertexArray(null);}
