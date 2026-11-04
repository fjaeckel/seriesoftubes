/* Pictures on the card. Cities, labels, markers and everything that bobs or pulses on them (cones, ships, offer
   bubbles, hot badges, floaters) are painted once with the 2D canvas, packed into one texture (the atlas), and drawn
   as instanced quads, with the small round things (lights, steam, glows) as discs, in one draw per frame after the
   tubes. Without WebGL the same calls draw the pictures with the 2D canvas, so the map's code does not care which. */
const SPR_MAX=1400,SPR_STRIDE=13;
// The card's pictures (SPRS) and the 2D map's (SPRC), by key; both at the screen's pixel density SPR_DPR.
const SPRS=new Map(),SPRC=new Map();let SPR_DPR=0;
/* The 2D map's pictures each keep a canvas, so they are also held to a size: a long zoom on a big network paints every
   city again at each step, and the list (only capped at SPR_MAX) held up to 180 MB of them where a frame shows 2 to
   23 MB. At the end of a frame over SPRC_BUDGET bytes, the pictures it did not use go, those unused the longest first,
   down to 3/4 of the budget (so this happens once in a while, not every frame). The frame's own are always kept: a
   screen that needs more than the budget keeps what it needs. A canvas let go is emptied (0×0) at once, which frees
   its pixels without waiting for the collector. The card's atlas has its own fixed size (GLS.size).
   SPR_F counts frames (draw()); finding or drawing a picture marks it as used in this one (e.f). */
const SPRC_BUDGET=48*1048576;let SPRC_B=0,SPR_F=0;
const sprFree=e=>{if(e.cv){e.cv.width=e.cv.height=0;e.cv=null;}};
function sprcTrim(){if(SPRC_B<=SPRC_BUDGET)return;const old=[];for(const [k,e] of SPRC)if(e.f<SPR_F)old.push([e.f,k,e]);
  old.sort((a,b)=>a[0]-b[0]);const goal=SPRC_BUDGET*0.75;
  for(const [,k,e] of old){if(SPRC_B<=goal)break;SPRC.delete(k);SPRC_B-=e.pw*e.ph*4;sprFree(e);}}
const GLS={prog:null,vao:null,buf:null,tex:null,size:4096,shx:0,shy:0,shh:0,frame:false,data:new Float32Array(SPR_STRIDE*2048),n:0,up:0,upq:false,memT:-1e9};
/* One record is 13 floats: x,y,w,h (CSS px) | u0,v0,u1,v1 (atlas) | r,g,b,a | kind. A picture (kind 0) takes its
   colours from the atlas and a from the record; a disc (kind 1) is centred on x,y with radius w, in colour r,g,b,a. */
const SPR_VS=GL_HEAD+`layout(location=0) in vec4 aP;layout(location=1) in vec4 aUV;layout(location=2) in vec4 aC;layout(location=3) in float aK;
uniform vec2 uDev;uniform float uDpr;out vec2 vUV,vQ;out vec4 vC;flat out float vK,vR;
void main(){vec2 c=vec2((gl_VertexID&1)==0?0.:1.,(gl_VertexID&2)==0?0.:1.),p;
  if(aK>.5){float m=aP.z+1./uDpr;vQ=(c*2.-1.)*m;vR=aP.z;vUV=vec2(0.);p=aP.xy+vQ;}
  else{vQ=vec2(0.);vR=0.;vUV=mix(aUV.xy,aUV.zw,c);p=aP.xy+c*aP.zw;}
  vC=aC;vK=aK;gl_Position=vec4(p.x*uDpr/uDev.x*2.-1.,1.-p.y*uDpr/uDev.y*2.,0.,1.);}`;
const SPR_FS=GL_HEAD+`uniform sampler2D uTex;uniform float uDpr;in vec2 vUV,vQ;in vec4 vC;flat in float vK,vR;out vec4 o;
void main(){if(vK>.5){float a=clamp((vR-length(vQ))*uDpr+.5,0.,1.)*vC.a;if(a<=0.)discard;o=vec4(vC.rgb*a,a);}
  else o=texture(uTex,vUV)*vC.a;}`;
function glsInit(gl){GLS.prog=glProg(gl,SPR_VS,SPR_FS);const {v,b}=glVao(gl,[4,4,4,1]);GLS.vao=v;GLS.buf=b;
  // 4096 px square (64 MB), or what the card allows if that is less (some phones). A card that has not the memory for
  // it gets 2048 (16 MB: more resets of the atlas, the same map); without even that, the map stays 2D (glMem).
  GLS.tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GLS.tex);glMem(gl,'setup');
  for(GLS.size=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096);;GLS.size>>=1){
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,GLS.size,GLS.size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    try{glMem(gl,'the pictures');break;}catch(e){if(GLS.size<=2048)throw e;}}
  for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);
  for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
  GLS.shx=GLS.shy=GLS.shh=0;GLS.memT=-1e9;GLS.upq=false;}
// Forgets every picture and starts the atlas again, after the pictures already queued are drawn (they point into it).
function spritesReset(){glsDrawNow();for(const e of SPRC.values())sprFree(e);SPRS.clear();SPRC.clear();SPRC_B=0;GLS.shx=GLS.shy=GLS.shh=0;}
// The card given up: its pictures go (they have no canvas to be drawn from in 2D) and the atlas is forgotten.
function spritesDrop(){GLS.n=GLS.up=0;GLS.upq=false;SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;}
/* The card's pictures are painted on one canvas, reused, and each goes into the atlas as soon as it is painted: a
   canvas kept per picture made the browser hold thousands of them while you zoomed, until it lost the graphics context
   and the map fell back to 2D. The 2D map, and a picture too big for the atlas, keep their own canvas.
   Each picture goes in with a clear border of GLS_GAP px: the card blends the texels around the point it reads, so a
   picture drawn off whole pixels or a little stretched read half a texel past its edge, and showed a thin line of its
   neighbour in the atlas (or of a picture from before the last reset, which leaves the texture as it was). */
const GLS_GAP=1;
const GLS_PAD={cv:null,g:null};
function glsPad(pw,ph){const P=GLS_PAD;if(!P.cv){P.cv=document.createElement('canvas');P.cv.width=P.cv.height=256;}
  if(P.cv.width<pw||P.cv.height<ph){P.cv.width=Math.max(P.cv.width,Math.ceil(pw/64)*64);P.cv.height=Math.max(P.cv.height,Math.ceil(ph/64)*64);P.g=null;}
  if(!P.g)P.g=P.cv.getContext('2d',{willReadFrequently:true});return P;}
// Where this frame's pictures are kept: the card's or the 2D map's. A new pixel density starts both again.
function sprMap(){if(DPR!==SPR_DPR){SPR_DPR=DPR;spritesReset();}return GLS.frame&&!!GLX.gl&&!!GLS.prog?SPRS:SPRC;}
// The picture already painted under key, if any: callers ask first, so a picture drawn every frame costs no closure.
const spriteHas=key=>{const e=sprMap().get(key);if(e)e.f=SPR_F;return e;};
// A picture of w×h CSS px with its anchor at (ax,ay): painted once by paint(g) (the 2D canvas, at the screen's pixel
// density), and kept by key in SPRS (the card's) or SPRC (the 2D map's).
function spriteEntry(key,w,h,ax,ay,paint){const M=sprMap(),gpu=M===SPRS;let e=M.get(key);if(e){e.f=SPR_F;return e;}
  if(SPRS.size+SPRC.size>=SPR_MAX)spritesReset();
  const pw=Math.ceil(w*DPR),ph=Math.ceil(h*DPR),saved=ctx;
  e={cv:null,pw,ph,w,h,ax,ay,up:false,u0:0,v0:0,u1:1,v1:1,f:SPR_F};
  const G=GLS_GAP;
  if(gpu&&pw+2*G<=GLS.size&&ph+2*G<=GLS.size){const P=glsPad(pw+2*G,ph+2*G),g=P.g;
    // Clipped to the picture, as its own canvas would be, so the border stays clear.
    g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,pw+2*G,ph+2*G);g.beginPath();g.rect(G,G,pw,ph);g.clip();ctx=g;
    try{g.setTransform(DPR,0,0,DPR,G,G);sprPen(g);paint(g);}finally{ctx=saved;g.restore();}
    // A full atlas starts again (glsPut), and the picture goes into the empty one at once: the pad is reused next.
    try{if(!glsPut(GLX.gl,e,P.cv))glsPut(GLX.gl,e,P.cv);}catch(x){throw glErr(x);}
  }else{const cv=document.createElement('canvas');cv.width=pw;cv.height=ph;const g=cv.getContext('2d');ctx=g;
    try{g.setTransform(DPR,0,0,DPR,0,0);sprPen(g);paint(g);}finally{ctx=saved;}e.cv=cv;
    if(M===SPRC)SPRC_B+=pw*ph*4;}
  M.set(key,e);return e;}
/* A picture starts with the pen the map's own canvas has when it draws cities and markers: the tubes leave it with
   round line ends and corners, the labels with text centred on its middle. Drawn straight on the map, the dashed rings,
   the cones' tips and a sleeping POP's "zzz" took those, and a new canvas has others (square ends, text on its baseline). */
function sprPen(g){g.lineCap='round';g.lineJoin='round';g.textAlign='center';g.textBaseline='middle';}
// Puts a picture with its own canvas into the atlas (once), shelf by shelf. A full atlas starts again; this picture then waits a frame.
function glsEnsure(e){if(e.up)return true;const gl=GLX.gl,G=GLS_GAP;if(!gl||!GLS.prog||!e.cv)return false;
  if(e.pw+2*G>GLS.size||e.ph+2*G>GLS.size)return false;
  const P=glsPad(e.pw+2*G,e.ph+2*G),g=P.g;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,e.pw+2*G,e.ph+2*G);g.drawImage(e.cv,G,G);
  try{return glsPut(gl,e,P.cv);}catch(x){throw glErr(x);}}
// src holds the picture at (GLS_GAP,GLS_GAP), in a clear border that goes into the atlas with it.
function glsPut(gl,e,src){const G=GLS_GAP,pw=e.pw+2*G,ph=e.ph+2*G,A=GLS.size;if(pw>A||ph>A)return false;
  if(GLS.shx+pw>A){GLS.shx=0;GLS.shy+=GLS.shh;GLS.shh=0;}
  if(GLS.shy+ph>A){spritesReset();return false;}
  const x=GLS.shx,y=GLS.shy;GLS.shx+=pw;GLS.shh=Math.max(GLS.shh,ph);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GLS.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  // Only the picture's corner of the source (with its border): the pad is bigger than most pictures.
  gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,pw,ph,gl.RGBA,gl.UNSIGNED_BYTE,src);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  GLS.up++;Object.assign(e,{up:true,u0:(x+G)/A,v0:(y+G)/A,u1:(x+pw-G)/A,v1:(y+ph-G)/A});return true;}
// The next record in GLS.data, which grows as needed: take it before reading GLS.data, which it may replace.
function glsNext(){if((GLS.n+1)*SPR_STRIDE>GLS.data.length){const nd=new Float32Array(GLS.data.length*2);nd.set(GLS.data);GLS.data=nd;}return GLS.n++*SPR_STRIDE;}
// Draws a picture at (x,y) of w×h CSS px, on the card for a frame drawn there, else with the 2D canvas.
function blit(e,x,y,w,h){if(GLS.frame&&glsEnsure(e)){const o=glsNext(),d=GLS.data;
    d[o]=x;d[o+1]=y;d[o+2]=w;d[o+3]=h;d[o+4]=e.u0;d[o+5]=e.v0;d[o+6]=e.u1;d[o+7]=e.v1;d[o+8]=d[o+9]=d[o+10]=0;d[o+11]=ctx.globalAlpha;d[o+12]=0;}
  else if(e.cv)ctx.drawImage(e.cv,x,y,w,h);}
// A round dot of radius r at (x,y), in colour col (CSS colour string) at opacity a, on the card or the 2D canvas.
function dot(x,y,r,col,a){if(GLS.frame){const c=glColor(col),o=glsNext(),d=GLS.data;
    d[o]=x;d[o+1]=y;d[o+2]=r;d[o+3]=d[o+4]=d[o+5]=d[o+6]=d[o+7]=0;d[o+8]=c[0];d[o+9]=c[1];d[o+10]=c[2];d[o+11]=(a===undefined?ctx.globalAlpha:a)*c[3];d[o+12]=1;}
  else{const sa=ctx.globalAlpha;if(a!==undefined)ctx.globalAlpha=a;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.globalAlpha=sa;}}
/* Pictures that grow with the zoom (cities, ships, badges) are painted at steps of 1/24 of their scale. On the card,
   while the zoom moves, they keep the step of the scale they had when it began, stretched by up to 1.25× either way
   (the card filters them smoothly), and are painted again at the right step once the zoom rests (ZOOM_REST ms): a
   pinch otherwise repainted every city at every step, hundreds of pictures a frame, and filled the atlas over and
   over. ZH.sc is the icon scale held, ZH.f how much a picture is painted smaller (<1) or bigger than it shows. */
const CSPR_STEP=24,ZOOM_REST=250,ZH={z:0,t:-1e9,sc:0,f:1};
function zoomHold(sc,G){const t=performance.now();if(cam.z!==ZH.z){ZH.z=cam.z;ZH.t=t;}
  if(!G||!ZH.sc||t-ZH.t>=ZOOM_REST||sc/ZH.sc>1.25||ZH.sc/sc>1.25)ZH.sc=sc;ZH.f=ZH.sc/sc;}
// The zoom moved a moment ago: the pictures may be stretched, so a still map is drawn again once it rests (mapStill()).
const zoomMoving=()=>performance.now()-ZH.t<ZOOM_REST;
const sprQ=k=>Math.max(1/CSPR_STEP,Math.round(k*ZH.f*CSPR_STEP)/CSPR_STEP);
// A small picture w×h px at scale k with its anchor at (ax,ay), painted once by paint(g) with the origin on the anchor
// (k in steps of 1/24, as the cities; zoomed: k grows with the zoom, and is held while it moves, sprQ()), then drawn with
// the anchor at (x,y). Things that bob or pulse are drawn as these at a moving place, so the overlay above the card
// stays untouched (repainting it costs a whole screen of pixels).
// The full key of a stamp at scale kq, kept per key: it was built again for every stamp on every frame.
const STK=new Map();
function stamp(key,w,h,ax,ay,k,x,y,paint,zoomed){const kq=zoomed?sprQ(k):Math.max(1/CSPR_STEP,Math.round(k*CSPR_STEP)/CSPR_STEP),r=k/kq;
  let m=STK.get(key);if(!m||m.kq!==kq){if(STK.size>4000)STK.clear();STK.set(key,m={kq,k:key+'|'+kq});}
  const e=spriteHas(m.k)||spriteEntry(m.k,Math.ceil(w*kq),Math.ceil(h*kq),ax*kq,ay*kq,g=>{g.translate(ax*kq,ay*kq);g.scale(kq,kq);paint(g);});
  blit(e,x-e.ax*r,y-e.ay*r,e.w*r,e.h*r);}
// Text with an outline, centred on (x,y), as a picture placed on whole device pixels; tw is its width, px its size.
function textStamp(t,font,px,tw,fill,stroke,lw,x,y){const W=Math.ceil(tw+lw+4),H=Math.ceil(px*1.5+lw+2);
  const e=spriteEntry(['txt',t,font,fill,stroke,lw].join('|'),W,H,W/2,H/2,g=>{g.translate(W/2,H/2);g.font=font;g.textAlign='center';g.textBaseline='middle';
    if(lw){g.lineWidth=lw;g.lineJoin='round';g.strokeStyle=stroke;g.strokeText(t,0,0);}g.fillStyle=fill;g.fillText(t,0,0);});
  blit(e,Math.round((x-e.w/2)*DPR)/DPR,Math.round((y-e.h/2)*DPR)/DPR,e.w,e.h);}
// Sends the queued pictures to the card in one draw.
function glsDrawNow(){const gl=GLX.gl,n=GLS.n;GLS.n=0;if(!gl||!GLS.prog||!n)return;
  try{glsDraw(gl,n);}catch(x){throw glErr(x);}}
function glsDraw(gl,n){gl.useProgram(GLS.prog.p);gl.bindVertexArray(GLS.vao);gl.bindBuffer(gl.ARRAY_BUFFER,GLS.buf);
  gl.bufferData(gl.ARRAY_BUFFER,GLS.data.subarray(0,n*SPR_STRIDE),gl.STREAM_DRAW);
  gl.uniform2f(GLS.prog.u.uDev,GLX.c.width,GLX.c.height);gl.uniform1f(GLS.prog.u.uDpr,DPR);gl.uniform1i(GLS.prog.u.uTex,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GLS.tex);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,n);gl.bindVertexArray(null);}
/* The end of a frame on the card: the pictures go up over the tubes. The frame is over even if that draw fails.
   Pictures sent are checked (did the card take them?): a card short of memory may refuse one without throwing, and the
   picture would be kept as sent. It then gives the map to 2D (glMem() throws, draw() draws the frame again there and
   glKill() forgets the card's pictures). Each read waits for the card to finish everything sent so far, so it is done
   at most once every GL_MEM_EVERY ms: the card keeps an error until it is read, so a later read still finds it, and a
   picture refused in between shows at worst as a dark box for that time. The first pictures sent into a new atlas are
   checked at once (a card that allocates it lazily refuses there). A frame that only reuses the atlas asks nothing. */
const GL_MEM_EVERY=1000;
function glsFrameEnd(){if(!GLS.frame)return;GLS.frame=false;if(GLS.up)GLS.upq=true;GLS.up=0;
  if(GLS.upq&&GLX.gl){const t=performance.now();if(t-GLS.memT>=GL_MEM_EVERY){GLS.memT=t;GLS.upq=false;glMem(GLX.gl,'the pictures');}}
  glsDrawNow();}
