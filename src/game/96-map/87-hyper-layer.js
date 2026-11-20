/* ---------- The Hyperscaler on the map (37-hyper.js, 38-hyper-*.js) ----------
   Only a Hyperscaler has S.hs, so the classic map pays one check per hook (60-draw.js). Four things:
   - under the cities, a ring at each launched country's biggest city, sized by its users and coloured by how well they
     are served (green, amber, red; a red one breathes and its ring is dashed);
   - a soft glow along the tubes that carry traffic between regions (replication and AI training: the paths R.hs.rep
     and R.hs.jobs took tonight), wider with more Gbps, under the tubes; a pair that owes a backlog adds a dashed red
     glow along its paths (or straight between its regions when nothing could carry it);
   - over your POPs, a badge for each region: a little cloud with its load as an arc around it (grey and dashed while it
     is built, red when it is down, orange during a drill);
   - a small ⚡ on a metro whose grid cannot feed its region, and 📣 where a protest holds something up.
   What to draw is worked out once per routing and day (HMAP, kept on R, S, the day and the map's tubes), so a frame
   only projects and stamps. The glow is a few plain lines on the card (one draw per world copy, from a buffer built
   with HMAP) and strokes on the 2D canvas, so it works the same in both. */
const HMAP={R:null,S:null,day:-1,ML:null,cc:[],rg:[],mk:[],glow:[],lag:[],lagG:[],gl:null,glN:0,glFor:null,lv:null,vao:null};
const hmQCol=q=>q>=CX_GOOD?'#22C47A':q>=0.75?'#FFAA1F':'#FF4D5E';
const HM_REP='rgba(150,110,255,.6)',HM_LAG='rgba(255,77,94,.6)';
// The tube (index into the map's groups) that joins two cities, or -1: the busiest of them when there are several.
function hmGroupOf(EI,ML,a,b){const L=EI.get(a<b?a+'|'+b:b+'|'+a);if(!L)return -1;let best=-1,bl=-1;for(const gi of L){const v=ML.looks[gi].load;if(v>bl){bl=v;best=gi;}}return best;}
function hmapGet(ML){if(HMAP.R===R&&HMAP.S===S&&HMAP.day===S.day&&HMAP.ML===ML)return HMAP;
  const H=S.hs,o=R.hs;Object.assign(HMAP,{R,S,day:S.day,ML,cc:[],rg:[],mk:[],glow:[],lag:[],gl:null});
  // Users: a ring per country, biggest first so a small country next to a big one stays on top.
  let top=0;for(const cc in H.cc)top=Math.max(top,H.cc[cc].d);
  for(const cc in H.cc){const I=ccInfo(cc);if(!I||!CITY[I.main])continue;const q=hsQ(R,cc),x=o&&o.cc[cc],bad=q<CX_GOOD||!!(x&&x.short>0.5);
    HMAP.cc.push({c:I.main,r:7+19*Math.sqrt(top>0?H.cc[cc].d/top:0),col:hmQCol(bad?Math.min(q,CX_GOOD-0.01):q),bad});}
  HMAP.cc.sort((a,b)=>b.r-a.r||(a.c<b.c?-1:1));
  // Regions: load as a share of the room tonight, in twentieths.
  for(const c of Object.keys(H.rg).sort()){if(!S.pops[c])continue;const d=H.rg[c],x=o&&o.rg[c];
    const st=d.ready>S.day?'bld':H.dx&&H.dx.c===c?'drill':hsOut(c)?'down':'live';
    HMAP.rg.push({c,st,q:x&&x.g>0?Math.min(20,Math.round(x.load/x.g*20)):0,t:d.t});
    if(hsCut(c)<1)HMAP.mk.push({c,k:'pw'});}
  for(const c of Object.keys(H.prot||{}).sort())if(hsProt(c)&&CITY[c])HMAP.mk.push({c,k:'prot'});
  // Between regions: Gbps per tube from tonight's paths; tubes on the paths of a pair with a backlog.
  const EI=new Map();ML.LG.forEach((g,gi)=>{const k=edgeKey(g[0]);let L=EI.get(k);if(!L)EI.set(k,L=[]);L.push(gi);});
  const G=new Map(),LG=new Set(),walk=(paths,g,f)=>{for(const p of paths||[]){const ns=p.ns||[];for(let i=1;i<ns.length;i++){const gi=hmGroupOf(EI,ML,ns[i-1],ns[i]);if(gi>=0)f(gi,g*(p.share||0));}}};
  if(o&&o.rep)for(const a of Object.keys(o.rep).sort()){const x=o.rep[a];walk(x.paths,x.got,(gi,v)=>G.set(gi,(G.get(gi)||0)+v));
    if((H.lag[hsLk(a,x.b)]||0)>0){let n=0;walk(x.paths,1,gi=>{LG.add(gi);n++;});if(!n&&CITY[a]&&CITY[x.b])HMAP.lag.push([a,x.b]);}}
  if(o&&o.jobs)for(const id of Object.keys(o.jobs).sort()){const x=o.jobs[id];walk(x.paths,x.got,(gi,v)=>G.set(gi,(G.get(gi)||0)+v));}
  for(const [gi,g] of [...G.entries()].sort((a,b)=>a[0]-b[0]))if(g>0.5)HMAP.glow.push({gi,w:16+Math.min(10,2*Math.log2(1+g/100))});
  HMAP.lagG=[...LG].sort((a,b)=>a-b);
  return HMAP;}
// Screen point of a city in world copy k, or null when it is off screen by more than m px.
const hmAt=(c,k,m)=>{const C=CITY[c],sx=(C.x+k*W-cam.x)*cam.z+CW/2,sy=(C.y-cam.y)*cam.z+CH/2;return sx<-m||sx>CW+m||sy<-m||sy>CH+m?null:[sx,sy];};
/* The glow, under the tubes. On the card: plain lines (round ends, joined corners) behind the tubes' own depth, so only
   the part wider than a tube shows; the buffer is built once per HMAP and again after the card's context came back
   (GLX.lv is new then). In 2D: the same lines stroked before the tubes are painted. wm: the tubes' width multiplier. */
function hmGlBuild(M,ML){const A=[],seg=(pts,cum,len,w,dash,a,col)=>{const s0=A.length/LINE_STRIDE;for(let j=0;j+1<pts.length;j++)glSeg(A,pts[j],pts[j+1],cum[j]*len,w,dash,LINE_ROUND,[col[0],col[1],col[2],a]);glJoin(A,s0,A.length/LINE_STRIDE,false);};
  const cr=glColor(HM_REP),cl=glColor(HM_LAG);
  for(const o of M.glow){const gm=ML.GM[o.gi];seg(gm.pts,gm.cum,gm.len,ML.looks[o.gi].w0+o.w,0,cr[3],cr);}
  for(const gi of M.lagG){const gm=ML.GM[gi];seg(gm.pts,gm.cum,gm.len,ML.looks[gi].w0+5,3,cl[3],cl);}
  for(const [a,b] of M.lag){const A0=CITY[a],B=CITY[b],p=[A0.x,A0.y],q=[A0.x+wrapDx(A0.x,B.x),B.y],L=Math.hypot(q[0]-p[0],q[1]-p[1])||1;seg([p,q],[0,1],L,5,3,cl[3],cl);}
  const F=new Float32Array(A),gl=GLX.gl;if(!M.vao||M.lv!==GLX.lv){const v=glVao(gl,[4,4,4,4]);M.vao=v;M.lv=GLX.lv;}
  gl.bindBuffer(gl.ARRAY_BUFFER,M.vao.b);gl.bufferData(gl.ARRAY_BUFFER,F,gl.DYNAMIC_DRAW);M.glN=F.length/LINE_STRIDE;M.gl=M.R;M.glFor=GLX.lv;}
function hsMapGlow(ML,ks,G,sc,far){if(!hyper()||pzOn()||!S.hs||!R.hs)return;const M=hmapGet(ML);if(!M.glow.length&&!M.lagG.length&&!M.lag.length)return;const wm=sc*(far?0.5:1);
  if(G){try{const gl=GLX.gl,L=GLX.line;if(M.gl!==M.R||M.glFor!==GLX.lv)hmGlBuild(M,ML);if(!M.glN)return;
      gl.useProgram(L.p);gl.bindVertexArray(M.vao.v);gl.uniform1i(L.u.uPass,LP.plain);gl.uniform1f(L.u.uBusy,0);
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
      for(const k of ks){glSet(gl,L,k,wm);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,M.glN);}
      gl.depthMask(true);gl.bindVertexArray(null);}catch(e){throw glErr(e);}return;}
  const line=(pts,k,w,col,dash)=>{let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;const P=pts.map(p=>{const x=(p[0]+k*W-cam.x)*cam.z+CW/2,y=(p[1]-cam.y)*cam.z+CH/2;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;return [x,y];});
    if(x1<-40||x0>CW+40||y1<-40||y0>CH+40)return;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(P[0][0],P[0][1]);for(let i=1;i<P.length;i++)ctx.lineTo(P[i][0],P[i][1]);ctx.stroke();};
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const k of ks){for(const o of M.glow)line(ML.GM[o.gi].pts,k,(ML.looks[o.gi].w0+o.w)*wm,HM_REP,[]);
    for(const gi of M.lagG)line(ML.GM[gi].pts,k,(ML.looks[gi].w0+5)*wm,HM_LAG,LDASH[3]);
    for(const [a,b] of M.lag){const A0=CITY[a],B=CITY[b];line([[A0.x,A0.y],[A0.x+wrapDx(A0.x,B.x),B.y]],k,5*wm,HM_LAG,LDASH[3]);}}
  ctx.setLineDash([]);}
// The users' rings, under the cities.
function hsMapRings(ks,now){if(!hyper()||pzOn()||!S.hs)return;const M=hmapGet(mapLinks(S.day));if(!M.cc.length)return;
  const zs=clamp(Math.sqrt(cam.z),0.8,1.6),br=animOn()?Math.sin(now/260):0;
  for(const o of M.cc){const r=Math.round(o.r*zs),key='hring|'+o.col+'|'+r+'|'+(o.bad?1:0);
    for(const k of ks){const p=hmAt(o.c,k,r+4);if(!p)continue;dot(p[0],p[1],r,o.col,o.bad?0.17+0.07*br:0.13);
      stamp(key,2*r+8,2*r+8,r+4,r+4,1,p[0],p[1],g=>{g.lineWidth=2.4;g.strokeStyle='rgba(30,38,64,.35)';g.beginPath();g.arc(0,0,r+0.8,0,7);g.stroke();
        g.strokeStyle=o.col;g.lineWidth=2;if(o.bad)g.setLineDash([5,4]);g.beginPath();g.arc(0,0,r,0,7);g.stroke();g.setLineDash([]);});}}}
// A region's badge: its load as an arc (red when nearly full), and a cloud in the colour of its state.
const HM_RGC={live:'#2D9CDB',bld:'#8A91A8',down:'#FF4D5E',drill:'#FF8A3D'};
function hmBadge(g,q,st){const u=q/20;g.lineWidth=2;g.strokeStyle='rgba(30,38,64,.3)';g.beginPath();g.arc(0,0,9,0,7);g.stroke();
  if(st==='live'&&u>0.005){g.strokeStyle=u>=0.95?'#FF4D5E':u>=0.65?'#FFAA1F':'#22C47A';g.beginPath();g.arc(0,0,9,-Math.PI/2,-Math.PI/2+Math.min(1,u)*2*Math.PI);g.stroke();}
  g.fillStyle=HM_RGC[st];g.strokeStyle='#1E2640';g.lineWidth=1.4;if(st==='bld')g.setLineDash([2,2]);
  g.beginPath();g.arc(-2.6,1,3.2,Math.PI*0.5,Math.PI*1.5);g.arc(0.2,-1.6,3.6,Math.PI,Math.PI*1.95);g.arc(3,1,3,Math.PI*1.4,Math.PI*0.5);g.closePath();g.fill();g.stroke();g.setLineDash([]);
  if(st==='down'){g.strokeStyle='#fff';g.lineWidth=1.4;g.beginPath();g.moveTo(-1.6,-0.6);g.lineTo(1.6,2.6);g.moveTo(1.6,-0.6);g.lineTo(-1.6,2.6);g.stroke();}}
// A metro's trouble: ⚡ the grid cannot feed the region, 📣 a protest.
function hmMark(g,k){g.fillStyle=k==='pw'?'#FFD23F':'#FF4D5E';g.strokeStyle='#1E2640';g.lineWidth=1.4;g.beginPath();g.arc(0,0,6.5,0,7);g.fill();g.stroke();
  g.font='9px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#1E2640';g.fillText(k==='pw'?'⚡':'📣',0,0.5);}
function hsMapBadges(ks,csc,far){if(!hyper()||pzOn()||!S.hs)return;const M=hmapGet(mapLinks(S.day));if(!M.rg.length&&!M.mk.length)return;
  const s=far?0.85:Math.max(0.85,Math.min(1.4,csc)),dx=(far?11:14)*s,dy=(far?7:9)*s;
  for(const o of M.rg){const key='hrg|'+o.q+'|'+o.st;for(const k of ks){const p=hmAt(o.c,k,30);if(p)stamp(key,24,24,12,12,s,p[0]-dx,p[1]+dy,g=>hmBadge(g,o.q,o.st));}}
  // Two marks on one metro sit side by side.
  const at=new Map();for(const o of M.mk){const i=at.get(o.c)||0;at.set(o.c,i+1);const key='hmk|'+o.k;
    for(const k of ks){const p=hmAt(o.c,k,30);if(p)stamp(key,16,16,8,8,s,p[0]+dx+i*13*s,p[1]-dy-4*s,g=>hmMark(g,o.k));}}}
