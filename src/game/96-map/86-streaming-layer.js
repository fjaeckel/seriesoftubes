/* ---------- The Streaming service on the map (37-streaming.js) ----------
   Only a Streaming service has S.cnt, so the classic map pays one check. Under the cities, a ring at each launched
   country's biggest city, sized by its subscribers and coloured by its picture (green crisp, amber soft, red buffering:
   a red one breathes and its ring is dashed); over your POPs, a badge for an origin (its load as an arc around it) and
   one for Binge Boxes (how full they are, and how many). What to draw is worked out once per routing (CMAP, kept on R
   and S), so a frame only projects and stamps, the same on the card and in 2D. */
const CMAP={R:null,S:null,day:-1,n:-1,cc:[],org:[],box:[]};
const cqCol=q=>q>=0.9?'#22C47A':q>=0.75?'#FFAA1F':'#FF4D5E';
function cmapGet(){const C=S.cnt,n=C.box.length+Object.keys(C.dc).length*4096+Object.keys(C.cc).length*16777216;
  if(CMAP.R===R&&CMAP.S===S&&CMAP.day===S.day&&CMAP.n===n)return CMAP;
  CMAP.R=R;CMAP.S=S;CMAP.day=S.day;CMAP.n=n;CMAP.cc=[];CMAP.org=[];CMAP.box=[];
  let top=0;for(const cc in C.cc)top=Math.max(top,C.cc[cc].d);
  for(const cc in C.cc){const I=ccInfo(cc);if(!I||!CITY[I.main])continue;const q=ccQ(R,cc),o=R.cnt&&R.cnt.cc[cc],bad=q<0.9||!!(o&&o.short>0.5);
    CMAP.cc.push({c:I.main,r:7+19*Math.sqrt(top>0?C.cc[cc].d/top:0),col:cqCol(bad?Math.min(q,0.89):q),bad});}
  // Biggest rings first, so a small country next to a big one stays on top.
  CMAP.cc.sort((a,b)=>b.r-a.r||(a.c<b.c?-1:1));
  for(const c in C.dc){if(!S.pops[c])continue;const live=dcLive(c);CMAP.org.push({c,u:live?((R.cnt&&R.cnt.org[c])||0)/dcG(c):-1});}
  const bx=new Map();for(const b of C.box){if(!S.pops[b.city])continue;const x=bx.get(b.city);if(x){x.n++;x.f+=b.f;}else bx.set(b.city,{c:b.city,n:1,f:b.f});}
  for(const x of bx.values())CMAP.box.push({c:x.c,n:x.n,f:x.f/x.n});
  return CMAP;}
// Screen point of a city in world copy k, or null when it is off screen by more than m px.
const cmapAt=(c,k,m)=>{const C=CITY[c],sx=(C.x+k*W-cam.x)*cam.z+CW/2,sy=(C.y-cam.y)*cam.z+CH/2;return sx<-m||sx>CW+m||sy<-m||sy>CH+m?null:[sx,sy];};
function cntMapRings(ks,now){if(!content()||pzOn())return;const M=cmapGet();if(!M.cc.length)return;
  const zs=clamp(Math.sqrt(cam.z),0.8,1.6),br=animOn()?Math.sin(now/260):0;
  for(const o of M.cc){const r=Math.round(o.r*zs),key='cring|'+o.col+'|'+r+'|'+(o.bad?1:0);
    for(const k of ks){const p=cmapAt(o.c,k,r+4);if(!p)continue;dot(p[0],p[1],r,o.col,o.bad?0.17+0.07*br:0.13);
      stamp(key,2*r+8,2*r+8,r+4,r+4,1,p[0],p[1],g=>{g.lineWidth=2.4;g.strokeStyle='rgba(30,38,64,.35)';g.beginPath();g.arc(0,0,r+0.8,0,7);g.stroke();
        g.strokeStyle=o.col;g.lineWidth=2;if(o.bad)g.setLineDash([5,4]);g.beginPath();g.arc(0,0,r,0,7);g.stroke();g.setLineDash([]);});}}}
// The arc around a badge: u of a full turn, red when nearly full.
function cmapArc(g,u,col){g.lineWidth=2;g.strokeStyle='rgba(30,38,64,.3)';g.beginPath();g.arc(0,0,9,0,7);g.stroke();
  if(u>0.005){g.strokeStyle=col||(u>=0.95?'#FF4D5E':u>=0.65?'#FFAA1F':'#22C47A');g.beginPath();g.arc(0,0,9,-Math.PI/2,-Math.PI/2+Math.min(1,u)*2*Math.PI);g.stroke();}}
// An origin: a purple rack with a play button (grey and dashed while it is built), its load around it.
function cmapOrg(g,q,live){cmapArc(g,live?q/20:0);g.fillStyle=live?'#7A5CFF':'#8A91A8';g.strokeStyle='#1E2640';g.lineWidth=1.5;if(!live)g.setLineDash([2,2]);
  rrOn(g,-5.5,-5.5,11,11,2.5);g.fill();g.stroke();g.setLineDash([]);g.fillStyle='#fff';g.beginPath();g.moveTo(-2,-3);g.lineTo(3.2,0);g.lineTo(-2,3);g.closePath();g.fill();}
// Binge Boxes: an orange box, how full they are around it, and how many when more than one.
function cmapBox(g,q,n){cmapArc(g,q/20,q>=20?'#22C47A':'#FFAA1F');g.fillStyle='#FF8A3D';g.strokeStyle='#1E2640';g.lineWidth=1.5;rrOn(g,-5,-4,10,8,2);g.fill();g.stroke();
  g.beginPath();g.moveTo(-5,-1);g.lineTo(5,-1);g.stroke();
  if(n>1){g.fillStyle='#1E2640';g.beginPath();g.arc(7,-7,4.6,0,7);g.fill();g.fillStyle='#fff';g.font='900 7px Nunito, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(n>9?'9+':String(n),7,-6.6);}}
function rrOn(g,x,y,w,h,r){g.beginPath();if(g.roundRect){g.roundRect(x,y,w,h,r);return;}g.rect(x,y,w,h);}
function cntMapBadges(ks,csc,far){if(!content()||pzOn())return;const M=cmapGet();if(!M.org.length&&!M.box.length)return;
  const s=far?0.85:Math.max(0.85,Math.min(1.4,csc)),dx=(far?11:14)*s,dy=(far?7:9)*s;
  for(const o of M.org){const q=o.u<0?0:Math.min(20,Math.round(o.u*20)),live=o.u>=0,key='corg|'+q+'|'+(live?1:0);
    for(const k of ks){const p=cmapAt(o.c,k,30);if(p)stamp(key,24,24,12,12,s,p[0]-dx,p[1]+dy,g=>cmapOrg(g,q,live));}}
  for(const o of M.box){const q=Math.min(20,Math.round(o.f*20)),n=Math.min(10,o.n),key='cbox|'+q+'|'+n;
    for(const k of ks){const p=cmapAt(o.c,k,30);if(p)stamp(key,28,28,12,14,s,p[0]+dx,p[1]+dy,g=>cmapBox(g,q,n));}}}
