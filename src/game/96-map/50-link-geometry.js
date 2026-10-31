/* Parallel waves on the same cable (or in the same trench) draw as one line with a combined label (#19). */
// Links drawn as one line share a key; the map spaces lines apart by drawn line, not by link (#64).
const gKey=l=>{const pr=l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a;return l.kind==='wave'?pr+'|'+(l.sub?'c:'+(l.cable||''):'t:'+(l.trench||l.id)):l.id;};
const lineIdx=(l,pl)=>{const ks=[];for(const x of pl||pairLinks(l.a,l.b)){const k=gKey(x);if(!ks.includes(k))ks.push(k);}return ks.indexOf(gKey(l));};
// pairLinks() for every pair at once (same links, same order), for code that asks about all of them.
function pairIdx(){const m=new Map();for(const l of S.links){const k=edgeKey(l),a=m.get(k);if(a)a.push(l);else m.set(k,[l]);}return m;}
function linkGroups(){const m=new Map();for(const l of S.links){const key=gKey(l);const g=m.get(key);if(g)g.push(l);else m.set(key,[l]);}return [...m.values()];}
// Mixed sizes are spelled out per size ("2×800G + 400G"): "2 × 1.2T" read like two 1.2T waves (#56).
function groupLabel(grp,up){const n=[];for(const x of grp)n[x.tier]=(n[x.tier]||0)+1;let s='';for(let t=n.length-1;t>=0;t--)if(n[t])s+=(s?' + ':'')+(n[t]>1||n[t]===grp.length?n[t]+'×':'')+LT[t].n;return s+(up.length<grp.length?` · ${up.length}/${grp.length} ${tr('common.up')}`:'');}
function linkGeom(l,pl){const i=lineIdx(l,pl);const key=l.id+'|'+i+'|'+(l.cable||'');const h=GEO.get(key);if(h)return h;
  let pts=l.kind==='df'&&l.own&&l.sub&&Array.isArray(l.seaPath)?seaMapPoints(l.seaPath):null;if(!pts&&l.cable){const cp=cablePair(l.cable,l.a,l.b);if(cp){pts=cp.pts.map(p=>p.slice());const same=pairLinks(l.a,l.b).filter(x=>x.cable===l.cable).indexOf(l);if(same>0)for(let j=1;j<pts.length-1;j++){pts[j][1]+=same*5;}}}
  // Your own subsea cable (#64) follows the shortest commercial cable on the same route, drawn alongside it; with
  // none, a gentle curve. Its shape must not depend on how many waves already run between the two cities.
  if(!pts&&l.kind==='df'&&l.own&&l.sub){const k=pairLinks(l.a,l.b).filter(x=>x.kind==='df'&&x.own&&x.sub).indexOf(l),c0=cablesFor(l.a,l.b).slice().sort((x,y)=>x.km-y.km)[0],cp=c0&&cablePair(c0.cid,l.a,l.b);
    if(cp)pts=besideLine(cp.pts,2+k*1.5);
    else{const g=bezGeom(l,k);pts=[];for(let j=0;j<=20;j++)pts.push(qpt(g,j/20));}}
  if(!pts){const g=bezGeom(l);pts=[];for(let j=0;j<=20;j++)pts.push(qpt(g,j/20));}
  const cum=[0];let L=0;for(let j=1;j<pts.length;j++){L+=Math.hypot(pts[j][0]-pts[j-1][0],pts[j][1]-pts[j-1][1]);cum.push(L);}for(let j=0;j<cum.length;j++)cum[j]/=L||1;
  const g={pts,cum,len:L};GEO.set(key,g);return g;}
// A path running beside another: resampled, pushed sideways by d, easing to zero at both cities so it still lands there.
function besideLine(sp,d){const c=[0];for(let j=1;j<sp.length;j++)c.push(c[j-1]+Math.hypot(sp[j][0]-sp[j-1][0],sp[j][1]-sp[j-1][1]));const L=c[c.length-1]||1,N=24,out=[];
  for(let j=0;j<=N;j++){const t=j/N,q=polyAt(sp,c.map(v=>v/L),t),a=polyAt(sp,c.map(v=>v/L),Math.max(0,t-.02)),b=polyAt(sp,c.map(v=>v/L),Math.min(1,t+.02)),dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy)||1,f=d*Math.sin(Math.PI*t);out.push([q[0]+dy/n*f,q[1]-dx/n*f]);}return out;}
function polyAt(sp,cum,t){let i=1;while(i<cum.length-1&&cum[i]<t)i++;const t0=cum[i-1],t1=cum[i],f=t1>t0?(t-t0)/(t1-t0):0;return [sp[i-1][0]+(sp[i][0]-sp[i-1][0])*f,sp[i-1][1]+(sp[i][1]-sp[i-1][1])*f];}
// polyAt() on screen points kept in two arrays (draw() reuses them for every link instead of making new points).
function polyAtXY(X,Y,cum,t){let i=1;while(i<cum.length-1&&cum[i]<t)i++;const t0=cum[i-1],t1=cum[i],f=t1>t0?(t-t0)/(t1-t0):0;return [X[i-1]+(X[i]-X[i-1])*f,Y[i-1]+(Y[i]-Y[i-1])*f];}
let SX=new Float64Array(64),SY=new Float64Array(64);
function segDist(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy||1;const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/L,0,1);return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
// `cached`: the cables are already painted into the world layer. Zoomed in, the layer is painted without
// them (#49), so they are drawn here every frame instead.
function drawCables(ks){const z=cam.z,selC=UI.drag&&UI.drag.mode==='link'?UI.drag.from:(UI.sel&&UI.sel.type==='city'?UI.sel.id:null),cached=!!(WL.cv&&WL.key&&WL.cab);
  if(!selC&&z<1.7&&cached)return;
  ctx.font='800 10px Nunito, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  const ar=arOn();for(const cp of CABLE_PAIRS){const C=CAB[cp.cid],hot=!!selC&&(cp.a===selC||cp.b===selC);if(!hot&&cached&&z<1.7)continue;if(ar&&!hot&&!(arKind(cp.a)&&arKind(cp.b)))continue;const col=cableCol(C);
    for(const k of ks){const sp=cp.pts.map(p=>toS(p[0],p[1],k));let mn=Infinity,mx=-Infinity;for(const q of sp){if(q[0]<mn)mn=q[0];if(q[0]>mx)mx=q[0];}if(mx<-20||mn>CW+20)continue;
      if(hot||!cached){ctx.globalAlpha=hot?0.95:0.4;ctx.strokeStyle=col;ctx.lineWidth=hot?3:1.6;ctx.lineJoin='round';ctx.setLineDash(C.age==='old'?[6,5]:[]);ctx.beginPath();ctx.moveTo(sp[0][0],sp[0][1]);for(let i=1;i<sp.length;i++)ctx.lineTo(sp[i][0],sp[i][1]);ctx.stroke();ctx.setLineDash([]);}
      if(hot||(z>=1.7&&!ar)){const m=sp[Math.floor(sp.length/2)];ctx.globalAlpha=hot?1:0.75;ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.strokeText(C.name,m[0],m[1]-8);ctx.fillStyle=col;ctx.fillText(C.name,m[0],m[1]-8);}
      ctx.globalAlpha=1;}}}
function bezGeom(l,at){const A=CITY[l.a],B=CITY[l.b];const i=at!==undefined?at:lineIdx(l);const key=l.id+'|b'+i;const hit=GEO.get(key);if(hit)return hit;
  const bx=A.x+wrapDx(A.x,B.x),by=B.y;const dx=bx-A.x,dy=by-A.y,len=Math.hypot(dx,dy)||1;let nx=-dy/len,ny=dx/len;if(ny>0){nx=-nx;ny=-ny;}
  // Puzzles bow diverse paths well apart, so two routes never read as one.
  const wide=!!S&&pzOn(),base=Math.max(4,Math.min(len*0.1,90)),step=wide?Math.min(30,len*.14):Math.min(16,len*.06),off0=i<=0?base:(i%2?-1:1)*(base*(i%2?(wide?0.9:0.2):1)+Math.ceil(i/2)*step);
  const mx=(A.x+bx)/2,my=(A.y+by)/2;
  const sg=Math.sign(off0)||1,mag=Math.abs(off0);
  // Bend around cities in the way, but gently: short links need less room, no curve bows out more than about a
  // third of its length, and when nothing clears, a modest curve beats a giant loop around the neighbourhood.
  const need=Math.min(24,Math.max(7,len*0.2)),cap=Math.max(mag,len*0.32),lim=o=>Math.sign(o)*Math.min(Math.abs(o),cap);
  const cand=[1,1.5,2.1,2.9,3.8].map(k=>lim(sg*mag*k)).concat([1,1.5,2.1,2.9,3.8].map(k=>lim(-sg*Math.max(mag,base)*k)));
  /* Only cities that could come within `need` of a candidate curve count: a curve stays inside the box of its end and
     control points, so a city further than `need` outside the box of all of them only ever measures as clear, and
     min(clearance, need) comes out the same without it (the map's first frame did this for every city and link). */
  let x0=Math.min(A.x,bx),x1=Math.max(A.x,bx),y0=Math.min(A.y,by),y1=Math.max(A.y,by);
  for(const off of cand){const cx=mx+nx*off,cy=my+ny*off;if(cx<x0)x0=cx;if(cx>x1)x1=cx;if(cy<y0)y0=cy;if(cy>y1)y1=cy;}
  const obs=[];for(const c of CITIES){if(c.id===l.a||c.id===l.b)continue;const ox=mx+wrapDx(mx,c.x),oy=c.y;if(ox>=x0-need&&ox<=x1+need&&oy>=y0-need&&oy<=y1+need)obs.push([ox,oy]);}
  const clear=(cx,cy)=>{let m=Infinity;const g={ax:A.x,ay:A.y,bx,by,cx,cy};for(let t=0.08;t<0.93;t+=0.06){const [px,py]=qpt(g,t);for(const [ox,oy] of obs){const d=Math.hypot(px-ox,py-oy);if(d<m)m=d;}}return m;};
  let best=null,bs=-Infinity;
  for(const off of cand){const cx=mx+nx*off,cy=my+ny*off,c=clear(cx,cy);if(c>=need){best=[cx,cy];break;}const sc=Math.min(c,need)-Math.abs(off)*0.35;if(sc>bs){bs=sc;best=[cx,cy];}}
  const g={ax:A.x,ay:A.y,bx,by,cx:best[0],cy:best[1],len};GEO.set(key,g);return g;}
const qpt=(g,t)=>[(1-t)*(1-t)*g.ax+2*(1-t)*t*g.cx+t*t*g.bx,(1-t)*(1-t)*g.ay+2*(1-t)*t*g.cy+t*t*g.by];
const utilCol=u=>u<=0.001?'#AFC0D6':u<0.65?'#22C47A':u<0.9?'#FFAA1F':'#FF4D5E';
// How many separate paths (trenches or cables) join this tube's two cities.
const arPaths=l=>new Set(pairLinks(l.a,l.b).map(gKey)).size;
const AR_PILLS=[]; // filled while the links are drawn, painted after the cities
