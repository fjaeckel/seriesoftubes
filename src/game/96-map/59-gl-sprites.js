/* Pictures on the card. Cities, labels, markers and everything that bobs or pulses on them (cones, ships, offer
   bubbles, hot badges, floaters) are painted once with the 2D canvas, packed into one texture (the atlas), and drawn
   as instanced quads, with the small round things (lights, steam, glows) as discs, in one draw per frame after the
   tubes. Without WebGL the same calls draw the pictures with the 2D canvas, so the map's code does not care which. */
const SPR_MAX=1400,SPR_STRIDE=13;
const SPRS=new Map();
const GLS={prog:null,vao:null,buf:null,tex:null,size:4096,shx:0,shy:0,shh:0,frame:false,data:new Float32Array(SPR_STRIDE*2048),n:0};
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
  // 4096 px square (64 MB), or what the card allows if that is less (some phones).
  GLS.size=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096);
  GLS.tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GLS.tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,GLS.size,GLS.size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);
  for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
  GLS.shx=GLS.shy=GLS.shh=0;}
// Forgets every picture and starts the atlas again, after the pictures already queued are drawn (they point into it).
function spritesReset(){glsDrawNow();SPRS.clear();GLS.shx=GLS.shy=GLS.shh=0;}
// A picture of w×h CSS px with its anchor at (ax,ay): painted once by paint(g) (the 2D canvas, at the screen's pixel
// density, which is part of the key), and kept in SPRS.
function spriteEntry(key,w,h,ax,ay,paint){key=DPR+'|'+key;let e=SPRS.get(key);if(e)return e;
  if(SPRS.size>=SPR_MAX)spritesReset();
  const cv=document.createElement('canvas');cv.width=Math.ceil(w*DPR);cv.height=Math.ceil(h*DPR);
  const g=cv.getContext('2d'),saved=ctx;ctx=g;
  try{g.setTransform(DPR,0,0,DPR,0,0);paint(g);}finally{ctx=saved;}
  e={cv,w,h,ax,ay,up:false,u0:0,v0:0,u1:1,v1:1};SPRS.set(key,e);return e;}
// Puts a picture into the atlas (once), shelf by shelf. A full atlas starts again; this picture then waits a frame.
function glsEnsure(e){if(e.up)return true;const gl=GLX.gl;if(!gl||!GLS.prog)return false;
  const pw=e.cv.width,ph=e.cv.height,A=GLS.size;if(pw>A||ph>A)return false;
  if(GLS.shx+pw>A){GLS.shx=0;GLS.shy+=GLS.shh;GLS.shh=0;}
  if(GLS.shy+ph>A){spritesReset();return false;}
  const x=GLS.shx,y=GLS.shy;GLS.shx+=pw;GLS.shh=Math.max(GLS.shh,ph);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GLS.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,e.cv);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  Object.assign(e,{up:true,u0:x/A,v0:y/A,u1:(x+pw)/A,v1:(y+ph)/A});return true;}
// The next record in GLS.data, which grows as needed.
function glsNext(){if((GLS.n+1)*SPR_STRIDE>GLS.data.length){const nd=new Float32Array(GLS.data.length*2);nd.set(GLS.data);GLS.data=nd;}return GLS.n++*SPR_STRIDE;}
// Draws a picture at (x,y) of w×h CSS px, on the card for a frame drawn there, else with the 2D canvas.
function blit(e,x,y,w,h){if(GLS.frame&&glsEnsure(e)){const d=GLS.data,o=glsNext();
    d[o]=x;d[o+1]=y;d[o+2]=w;d[o+3]=h;d[o+4]=e.u0;d[o+5]=e.v0;d[o+6]=e.u1;d[o+7]=e.v1;d[o+8]=d[o+9]=d[o+10]=0;d[o+11]=ctx.globalAlpha;d[o+12]=0;}
  else ctx.drawImage(e.cv,x,y,w,h);}
// A round dot of radius r at (x,y), in colour col (CSS colour string) at opacity a, on the card or the 2D canvas.
function dot(x,y,r,col,a){if(GLS.frame){const c=glColor(col),d=GLS.data,o=glsNext();
    d[o]=x;d[o+1]=y;d[o+2]=r;d[o+3]=d[o+4]=d[o+5]=d[o+6]=d[o+7]=0;d[o+8]=c[0];d[o+9]=c[1];d[o+10]=c[2];d[o+11]=(a===undefined?ctx.globalAlpha:a)*c[3];d[o+12]=1;}
  else{const sa=ctx.globalAlpha;if(a!==undefined)ctx.globalAlpha=a;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.globalAlpha=sa;}}
// A small picture w×h px at scale k with its anchor at (ax,ay), painted once by paint(g) with the origin on the anchor
// (k in steps of 1/24, as the cities), then drawn with the anchor at (x,y). Things that bob or pulse are drawn as these
// at a moving place, so the overlay above the card stays untouched (repainting it costs a whole screen of pixels).
function stamp(key,w,h,ax,ay,k,x,y,paint){const kq=Math.max(1/24,Math.round(k*24)/24),r=k/kq;
  const e=spriteEntry(key+'|'+kq,Math.ceil(w*kq),Math.ceil(h*kq),ax*kq,ay*kq,g=>{g.translate(ax*kq,ay*kq);g.scale(kq,kq);paint(g);});
  blit(e,x-e.ax*r,y-e.ay*r,e.w*r,e.h*r);}
// Text with an outline, centred on (x,y), as a picture placed on whole device pixels; tw is its width, px its size.
function textStamp(t,font,px,tw,fill,stroke,lw,x,y){const W=Math.ceil(tw+lw+4),H=Math.ceil(px*1.5+lw+2);
  const e=spriteEntry(['txt',t,font,fill,stroke,lw].join('|'),W,H,W/2,H/2,g=>{g.translate(W/2,H/2);g.font=font;g.textAlign='center';g.textBaseline='middle';
    if(lw){g.lineWidth=lw;g.lineJoin='round';g.strokeStyle=stroke;g.strokeText(t,0,0);}g.fillStyle=fill;g.fillText(t,0,0);});
  blit(e,Math.round((x-e.w/2)*DPR)/DPR,Math.round((y-e.h/2)*DPR)/DPR,e.w,e.h);}
// Sends the queued pictures to the card in one draw.
function glsDrawNow(){const gl=GLX.gl;if(!gl||!GLS.prog||!GLS.n){GLS.n=0;return;}
  gl.useProgram(GLS.prog.p);gl.bindVertexArray(GLS.vao);gl.bindBuffer(gl.ARRAY_BUFFER,GLS.buf);
  gl.bufferData(gl.ARRAY_BUFFER,GLS.data.subarray(0,GLS.n*SPR_STRIDE),gl.STREAM_DRAW);
  gl.uniform2f(GLS.prog.u.uDev,GLX.c.width,GLX.c.height);gl.uniform1f(GLS.prog.u.uDpr,DPR);gl.uniform1i(GLS.prog.u.uTex,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GLS.tex);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,GLS.n);gl.bindVertexArray(null);GLS.n=0;}
// The end of a frame on the card: the pictures go up over the tubes.
function glsFrameEnd(){if(GLS.frame){glsDrawNow();GLS.frame=false;}}
