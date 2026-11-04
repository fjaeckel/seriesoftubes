/* The map on the graphics card (WebGL2), wherever the browser can; Settings › Map drawing › Always 2D keeps the 2D
   canvas instead (a choice per device). A late-game map sends the 2D canvas several strokes per tube every frame (thousands on a
   big network) and repaints the land whenever you pan; here the card draws it all from buffers that change only with
   the network, so a frame costs the processor a few draws and uniforms.
   Two canvases sit over #map, which stays empty: #mapgl, where the card draws the background (57), the tubes and
   packets (58) and the pictures of cities, labels and markers (59); and #mapfx, a transparent 2D canvas over it for
   the few things still painted shape by shape (the drag preview, the chaos monkey), cleared only after it was used.
   Puzzles, and any browser without WebGL2 or whose context fails or is lost, keep the 2D map. So does WebGL drawn by
   the processor (no usable graphics card: a blocked driver, a virtual machine): there every instance of a line costs
   microseconds, and a big map took a second and a half a frame where the 2D canvas takes 50 ms. */
const GLX={want:true,dead:false,gl:null,c:null,f:null,fx:null,key:[],nSeg:0,nPk:0,nHalo:0,shown:false,gpu:''};
try{GLX.want=localStorage.getItem('sot-map')!=='2d';}catch(e){}
// Renderers that are the processor pretending to be a graphics card (GLX.soft: use them anyway, for the GPU benchmark).
const GL_SOFT=/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i;
const glOn=()=>GLX.want&&!GLX.dead&&!!S&&!pzOn()&&glInit();
// Switches the WebGL map on or off: the setting keeps the choice in this browser (keep), the GPU benchmark does not.
function mapGl(on,keep=true){GLX.want=!!on;if(keep)try{on?localStorage.removeItem('sot-map'):localStorage.setItem('sot-map','2d');}catch(e){}
  if(!on)glShow(false);GLX.key=[];UI.drawnAt=0;return on&&!GLX.dead;}
function glShow(on){on=!!on;if(GLX.shown===on)return;GLX.shown=on;const e=document.getElementById('mapgl'),fx=document.getElementById('mapfx');if(e)e.hidden=!on;if(fx)fx.hidden=!on;}
// Marks an error as the card's own, so draw() falls back to 2D instead of trying WebGL again every frame.
function glErr(e){const x=e instanceof Error?e:new Error(String(e));x.glErr=true;return x;}
function glKill(why){console.warn('[tubes] the map stays 2D:',why&&why.message||why);GLX.dead=true;GLX.gl=null;spritesDrop();glShow(false);}
/* A card short of memory may refuse a texture or a buffer without throwing: it only leaves OUT_OF_MEMORY for
   getError(), and the texture then draws black (every picture a black box) or the buffer draws nothing. So the big
   uploads (the atlas, the land, the tubes, the cables) read it, and give the card up like any of its errors. Never
   every frame: each read waits for the card. Up to four flags are read, as one call returns only one. */
function glMem(gl,what){for(let i=0;i<4;i++){const e=gl.getError();if(!e||e===gl.CONTEXT_LOST_WEBGL)return;
  if(e===gl.OUT_OF_MEMORY)throw glErr(new Error('the graphics card is out of memory ('+what+')'));}}
const GL_HEAD='#version 300 es\nprecision highp float;precision highp int;\n';
// Clip space from CSS px (the shaders work in CSS px, as the 2D map does, and use uDpr only for anti-aliasing).
const GL_CLIP='vec4 clip(vec2 p,vec2 v,float z){return vec4(p.x/v.x*2.-1.,1.-p.y/v.y*2.,z,1.);}\n';
function glProg(gl,vs,fs){const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error('shader: '+gl.getShaderInfoLog(x));return x;};
  const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('link: '+gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name);}return {p,u};}
// A vertex array and its buffer: attributes of the given sizes (in floats), interleaved, one record per instance
// (div 1) or per vertex (div 0), filled with data if given.
function glVao(gl,sizes,div=1,data=null){const v=gl.createVertexArray(),b=gl.createBuffer(),stride=sizes.reduce((a,x)=>a+x,0)*4;
  gl.bindVertexArray(v);gl.bindBuffer(gl.ARRAY_BUFFER,b);if(data)gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  let off=0;sizes.forEach((n,i)=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,stride,off);gl.vertexAttribDivisor(i,div);off+=n*4;});
  gl.bindVertexArray(null);return {v,b};}
function glInit(){if(GLX.gl)return true;if(GLX.dead)return false;
  try{const c=document.getElementById('mapgl'),f=document.getElementById('mapfx');if(!c||!f||!c.getContext)throw new Error('no map layers');
    const gl=c.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:true,stencil:true,powerPreference:'high-performance'});
    if(!gl||typeof gl.createShader!=='function')throw new Error('no WebGL2');
    try{const x=gl.getExtension('WEBGL_debug_renderer_info');GLX.gpu=String(x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));}catch(e){}
    if(!GLX.soft&&GL_SOFT.test(GLX.gpu))throw new Error('no graphics card, only '+GLX.gpu);
    const P=(vs,fs)=>glProg(gl,vs,fs),progs={line:P(GL_LINE_VS,GL_LINE_FS),pk:P(GL_PK_VS,GL_PK_FS),fill:P(FILL_VS,FILL_FS),fan:P(FAN_VS,FAN_FS),ell:P(ELL_VS,ELL_FS),circ:P(CIRC_VS,CIRC_FS)};
    // The tubes' points for the packets: floats read with texelFetch, never filtered.
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);
    c.addEventListener('webglcontextlost',e=>{e.preventDefault();glKill('the graphics context was lost');UI.drawnAt=0;});
    glsInit(gl);
    // The overlay is cleared only after something was painted on it: clearing a whole screen of empty canvas every
    // frame makes the browser send the layer to the screen again, which on a 4K screen cost more than the map itself.
    const fx=f.getContext('2d'),CP=CanvasRenderingContext2D.prototype;
    for(const m of ['fill','stroke','fillRect','strokeRect','fillText','strokeText','drawImage','putImageData']){const fn=CP[m];fx[m]=function(){GLX.fxUsed=true;return fn.apply(this,arguments);};}
    const V=s=>glVao(gl,s);
    Object.assign(GLX,progs,{gl,c,f,fx,fxUsed:true,tex,land:{},lv:V([4,4,4]),hv:V([4,4,4]),pv:V([4,4]),cb:V([4,4,4]),wv:V([4,4,4]),cl:V([4]),empty:gl.createVertexArray()});return true;}
  catch(e){glKill(e);return false;}}
// Colours as [r,g,b,a] from '#rrggbb', '#rgb' or 'rgba(r,g,b,a)', kept by string.
const GLCOL=new Map();
function glColor(s){let v=GLCOL.get(s);if(v)return v;let r=0,g=0,b=0,a=1;
  if(s[0]==='#'){let h=s.slice(1);if(h.length===3)h=h.replace(/./g,x=>x+x);r=parseInt(h.slice(0,2),16)/255;g=parseInt(h.slice(2,4),16)/255;b=parseInt(h.slice(4,6),16)/255;}
  else{const m=/rgba?\(([^)]*)\)/.exec(s);if(m){const p=m[1].split(',').map(x=>parseFloat(x));r=p[0]/255;g=p[1]/255;b=p[2]/255;a=p.length>3?p[3]:1;}}
  v=[r,g,b,a];GLCOL.set(s,v);return v;}
// Sets a line or a point program's view for copy k of the map (wm: the line width multiplier).
function glSet(gl,P,k,wm){gl.uniform2f(P.u.uView,CW,CH);gl.uniform3f(P.u.uCam,cam.x-k*W,cam.y,cam.z);gl.uniform1f(P.u.uWMul,wm);gl.uniform1f(P.u.uDpr,DPR);}
// A full-screen fill, from one premultiplied colour at the bottom to another at the top (the sea), or of one colour
// (the land and the clouds, through the stencil).
const FILL_VS=GL_HEAD+`void main(){vec2 p=vec2((gl_VertexID&1)==0?-1.:1.,(gl_VertexID&2)==0?-1.:1.);gl_Position=vec4(p,0.,1.);}`;
const FILL_FS=GL_HEAD+`uniform vec4 uTop,uBot;uniform float uH;out vec4 o;void main(){o=mix(uBot,uTop,gl_FragCoord.y/uH);}`;
function glFill(gl,top,bot=top){const P=GLX.fill;gl.useProgram(P.p);gl.uniform4fv(P.u.uTop,top);gl.uniform4fv(P.u.uBot,bot);gl.uniform1f(P.u.uH,GLX.c.height);gl.bindVertexArray(GLX.empty);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
