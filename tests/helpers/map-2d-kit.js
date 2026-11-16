// The 2D map's test kit (tests/map-2d.test.js, and tests/route-fuzz.test.js, which draws the map between the moves of
// its random games): KIT, run in a page, records frames and checks kept pictures against fresh ones and each tube's
// look against main's formulas; problems() turns what a check returned into a list of problems.
const { lit } = require('../../scripts/lib/js-literal');

/* In the page: every canvas made from now on records what is drawn on it, and the map's own context records the
   frame. A picture is known by what was painted on it (a hash of its calls), so a frame's calls say which picture went
   where. WebGL is not there (getContext gives null for it), and every request for it is counted. */
const KIT = `window.__M2D=(()=>{
  const N=v=>typeof v==='number'?String(Math.round(v*1000)/1000):v==null?String(v):typeof v==='function'?'fn':
    v instanceof HTMLCanvasElement?v.__cid():Array.isArray(v)?'['+v.map(N).join(',')+']':typeof v==='object'?'obj':String(v);
  const M=['arc','arcTo','beginPath','bezierCurveTo','clearRect','clip','closePath','drawImage','ellipse','fill','fillRect','fillText',
    'lineTo','moveTo','quadraticCurveTo','rect','resetTransform','restore','rotate','roundRect','save','scale','setLineDash','setTransform',
    'stroke','strokeRect','strokeText','transform','translate'];
  // With each call that paints, the state of the context it uses (a picture does not care about the font, say).
  const IMG=['globalAlpha','globalCompositeOperation'],FILL=[...IMG,'fillStyle'],LINE=[...IMG,'strokeStyle','lineWidth','lineDashOffset','lineJoin','lineCap'],
    TXT=['font','textAlign','textBaseline'];
  const PAINT={drawImage:IMG,clearRect:[],fill:FILL,fillRect:FILL,stroke:LINE,strokeRect:LINE,fillText:[...FILL,...TXT],strokeText:[...LINE,...TXT]};
  const DEF={globalAlpha:1,fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,font:'10px sans-serif',lineDashOffset:0,lineJoin:'miter',lineCap:'butt',
    textAlign:'start',textBaseline:'alphabetic',globalCompositeOperation:'source-over'};
  function rec(c,keep){const Q={h:2166136261,n:0,log:keep?[]:null};
    const add=s=>{for(let i=0;i<s.length;i++)Q.h=Math.imul(Q.h^s.charCodeAt(i),16777619)>>>0;Q.n++;if(Q.log)Q.log.push(s);};
    for(const m of M)c[m]=function(...a){let s=m+'('+a.map(N).join(',')+')';for(const k of PAINT[m]||[])s+=' '+N(this[k]);add(s);};
    Object.assign(c,DEF);c.__Q=Q;return c;}
  const blank=()=>new Proxy({},{get(t,k){if(k in t)return t[k];if(k==='measureText')return s=>({width:String(s).length*7});
    if(k==='createLinearGradient'||k==='createRadialGradient'||k==='createPattern')return ()=>({addColorStop(){}});
    if(k==='getImageData')return ()=>({data:new Uint8ClampedArray(4)});if(k==='canvas')return null;return ()=>{};},set(t,k,v){t[k]=v;return true;}});
  const asked=[];
  HTMLCanvasElement.prototype.getContext=function(type){asked.push(type);if(type!=='2d')return null;return this.__ctx||(this.__ctx=rec(blank(),false));};
  HTMLCanvasElement.prototype.__cid=function(){const q=this.__ctx&&this.__ctx.__Q;return q?'cv:'+q.h.toString(36)+'.'+q.n:'cv:?';};
  rec(CTX0,true);
  // A picture drawn in a 2D frame without a canvas of its own would simply not show.
  let lost=0;const blit0=blit;blit=function(e,...a){if(!GLS.frame&&!e.cv)lost++;return blit0(e,...a);};
  // One frame's calls on the map's canvas, from a known state of the context.
  function frame(t){const Q=CTX0.__Q;Q.log.length=0;Q.h=2166136261;Q.n=0;Object.assign(CTX0,DEF);draw(t);return Q.log.slice();}
  function inv(){let dup=0,bad=0;const seen=new Set();
    for(const e of SPRC.values()){if(!e.cv){bad++;continue;}if(seen.has(e.cv))dup++;seen.add(e.cv);if(e.cv.width!==e.pw||e.cv.height!==e.ph)bad++;}
    return {webgl:asked.filter(x=>x!=='2d').length,sprs:SPRS.size,glsFrame:GLS.frame,ctx0:ctx===CTX0,glShown:!document.getElementById('mapgl').hidden,
      pad:!!GLS_PAD.cv,shared:dup,badCanvas:bad,lost};}
  // Without the cache: every picture is painted again for every call, as if nothing were kept, even within a frame.
  let nocache=false;const none={get(){},set(){},has:()=>false,size:0},sprMap0=sprMap;sprMap=function(){const m=sprMap0();return nocache?none:m;};
  /* The same state drawn twice: with the pictures kept from every state before (kept), then painting every picture
     again (fresh). The land picture is settled first, so both frames find it as it is. */
  function pair(t){__T+=1000;if(S)worldLayer(cam.z);lost=0;
    const kept=frame(t),had=SPRC.size;nocache=true;let fresh;try{fresh=frame(t);}finally{nocache=false;}
    let d=-1;for(let i=0,n=Math.max(kept.length,fresh.length);i<n;i++)if(kept[i]!==fresh[i]){d=i;break;}
    return {calls:fresh.length,had,diff:d<0?null:{at:d,kept:kept.slice(Math.max(0,d-2),d+2),fresh:fresh.slice(Math.max(0,d-2),d+2)},...inv()};}
  // How main's 2D map worked out a tube's look, frame by frame (its drawFrame() before this change), word for word.
  function ref(grp,day){const l=grp[0],many=grp.length>1,up=many?grp.filter(x=>!linkDown(x)):null;
    const cap=many?up.reduce((a,x)=>a+capOf(x),0):capOf(l),load=many?grp.reduce((a,x)=>a+(R.load[x.id]||0),0):(R.load[l.id]||0),u=cap?load/cap:0,df=l.kind==='df',bld=df&&l.ready>day,cut=!bld&&(many?!up.length:linkDown(l))&&!(df&&!(l.ch||[]).length),dark=df&&!bld&&!(l.ch||[]).length,vx=l.kind==='vxc',idle=!cut&&!bld&&load<1e-3&&(many?up.length>0&&up.every(x=>x.standby):!!l.standby);
    const w=(vx?2.2:(2.5+Math.max(...grp.map(tierW))*1.8+(many?Math.min(1.5,(grp.length-1)*0.5):0)));
    return {w,dash:cut?[8,8]:vx?[2,7]:bld?[10,8]:idle?[4,6]:[],col:bld?'#C9B27C':dark?'#5D6788':cut?'#FF4D5E':idle?'#9AA3BE':vx?FAB[l.prov].col:l.sub?(u>0.001?utilCol(u):'#7FD8EE'):utilCol(u),
      pk:!cut&&load>0.01?clamp(Math.round(2+u*10),2,12):0,cut,bld,dark,vx,cap,load,up:up&&up.map(x=>x.id)};}
  // The kept looks (mapLinks) against groups, geometry and looks worked out again now, the way main did.
  function looks(){if(!S||!R)return [];const ML=mapLinks(S.day),PI=pairIdx(),LG=linkGroups(),bad=[];
    if(JSON.stringify(ML.LG.map(g=>g.map(l=>l.id)))!==JSON.stringify(LG.map(g=>g.map(l=>l.id))))return ['the tubes are not grouped as now'];
    LG.forEach((g,i)=>{const gm=linkGeom(g[0],PI.get(edgeKey(g[0])));if(JSON.stringify(gm.pts)!==JSON.stringify(ML.GM[i].pts))bad.push('geometry of '+g[0].id);
      const n=ML.looks[i],o=JSON.stringify(ref(g,S.day)),m=JSON.stringify({w:n.w0,dash:LDASH[n.dash],col:n.col,pk:n.pk,cut:n.cut,bld:n.bld,dark:n.dark,vx:n.vx,cap:n.cap,load:n.load,up:n.up&&n.up.map(x=>x.id)});
      if(o!==m)bad.push(g[0].id+': main '+o+' kept '+m);});
    return bad.slice(0,3);}
  /* A view of the map: the camera on a city at a zoom, maybe a city or a tube selected, maybe a city under the
     pointer, at clock t. u: numbers in [0,1) from the test's own seeded generator. */
  function view(u){if(!S)return null;const pops=Object.keys(S.pops),at=pops.length&&u[0]<.7?pops[Math.floor(u[1]*pops.length)]:CITIES[Math.floor(u[1]*CITIES.length)].id,C=CITY[at];
    cam.x=C.x+(u[2]-.5)*80;cam.y=C.y+(u[3]-.5)*60;cam.z=[.45,.7,1,1.6,3.2][Math.floor(u[4]*5)];
    UI.sel=u[5]<.35?null:u[5]<.6?{type:'city',id:at}:S.links.length?{type:'link',id:S.links[Math.floor(u[6]*S.links.length)].id}:null;
    UI.hover=u[7]<.3?at:null;return Math.floor(u[8]*20000);}
  function check(u){const keep={x:cam.x,y:cam.y,z:cam.z,sel:UI.sel,hov:UI.hover};
    try{const t=view(u);if(t===null)return null;const r=pair(t);r.looks=looks();r.view={at:UI.sel,z:cam.z,t};return r;}
    finally{cam.x=keep.x;cam.y=keep.y;cam.z=keep.z;UI.sel=keep.sel;UI.hover=keep.hov;}}
  return {frame,pair,inv,looks,check,view,asked};})();0`;

// What a check returned, as the problems it shows (none: an empty list).
function problems(r, where) {
  if (!r) return [];
  const out = [];
  if (r.diff) out.push(`${where}: a kept picture differs from a fresh one at call ${r.diff.at}\n  kept:  ${r.diff.kept.join('\n         ')}\n  fresh: ${r.diff.fresh.join('\n         ')}`);
  for (const l of r.looks || []) out.push(`${where}: ${l}`);
  if (r.webgl) out.push(`${where}: WebGL asked for ${r.webgl} times`);
  if (r.lost) out.push(`${where}: ${r.lost} pictures drawn without a canvas`);
  if (r.shared || r.badCanvas) out.push(`${where}: ${r.shared} pictures share a canvas, ${r.badCanvas} have none or one of the wrong size`);
  if (r.pad) out.push(`${where}: the card's shared canvas was made`);
  if (r.sprs || r.glsFrame || !r.ctx0 || r.glShown) out.push(`${where}: card state leaked into 2D ${lit({ sprs: r.sprs, glsFrame: r.glsFrame, ctx0: r.ctx0, glShown: r.glShown })}`);
  return out;
}

module.exports = { KIT, problems };
