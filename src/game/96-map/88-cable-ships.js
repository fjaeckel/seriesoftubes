/* Cable ships on the map (85-incidents/50-cable-ships.js): club ships at anchor off their ports, sailing out to a cut,
   splicing on site and sailing home; lay ships along a cable you are building. Where they are comes from S.fleet and
   the clock, so nothing here is saved; their routes are worked out once per voyage and kept in SHIP_PATH. */
const SHIP_PATH=new Map(),SHIP_HITS=[];
// Off the port: the first point of a cable leaving it, so a ship rides at anchor at sea and not in town.
function shipHomePt(s){const k='h:'+s.id;let p=SHIP_PATH.get(k);if(p)return p;const C=CITY[s.home];p=[C.x,C.y];
  for(const cp of CABLE_PAIRS){if(cp.a===s.home){p=cp.pts[1].slice();break;}if(cp.b===s.home){p=cp.pts[cp.pts.length-2].slice();break;}}
  const n=SHIPS.filter(x=>x.home===s.home).indexOf(s);p[0]+=n*7;p[1]+=n*4;SHIP_PATH.set(k,p);return p;}
// Out along the cable routes to the cable's end, then along the cable to the fault.
function shipRoute(s,f){const key=s.id+'|'+f.dep+'|'+f.link+'|'+f.e+'|'+f.t;let r=SHIP_PATH.get(key);if(r)return r;if(SHIP_PATH.size>300)SHIP_PATH.clear();
  const pts=[shipHomePt(s).slice()],push=q=>{const b=pts[pts.length-1];pts.push([q[0]+W*Math.round((b[0]-q[0])/W),q[1]]);},l=S.links.find(x=>x.id===f.link);
  if(l){const end=f.e==='b'?l.b:l.a,D=shipDij({[end]:0});let c=s.home;
    for(let n=0;n<999&&c!==end;n++){const p=D.prev.get(c);if(!p)break;const cp=CABLE_PAIRS[p.e.i],q=cp.a===c?cp.pts:cp.pts.slice().reverse();for(let j=1;j<q.length-1;j++)push(q[j]);c=p.from;}
    const g=linkGeom(l);if(f.e==='a'){for(let j=1;j<g.pts.length-1&&g.cum[j]<f.t;j++)push(g.pts[j]);}else for(let j=g.pts.length-2;j>0&&g.cum[j]>f.t;j--)push(g.pts[j]);
    push(polyAt(g.pts,g.cum,f.t));}
  else push([f.fx,f.fy]);
  const cum=[0];let L=0;for(let j=1;j<pts.length;j++){L+=Math.hypot(pts[j][0]-pts[j-1][0],pts[j][1]-pts[j-1][1]);cum.push(L);}for(let j=0;j<cum.length;j++)cum[j]/=L||1;
  r={pts,cum};SHIP_PATH.set(key,r);return r;}
// Where a ship is at time T (days, with the part of today gone by) and what it is doing.
function shipAt(s,T){const f=S.fleet&&S.fleet[s.id],H=shipHomePt(s);if(!f||T>=f.back)return {x:H[0],y:H[1],m:'port',dx:1};
  const r=shipRoute(s,f),m=f.dep+SHIP_MOB_D;let p,mode;
  if(f.rs!=null&&T>=f.rs){p=f.rt*(1-clamp((T-f.rs)/Math.max(0.01,f.back-f.rs),0,1));mode='back';}
  else if(T<m){p=0;mode='port';}else if(T<f.arr){p=(T-m)/Math.max(0.01,f.arr-m);mode='out';}else if(T<f.done){p=1;mode='work';}
  else{p=1-(T-f.done)/Math.max(0.01,f.back-f.done);mode='back';}
  p=clamp(p,0,1);const [x,y]=polyAt(r.pts,r.cum,p),[x2]=polyAt(r.pts,r.cum,clamp(p+(mode==='back'?-0.01:0.01),0,1));return {x,y,m:mode,dx:x2-x||1};}
// A cartoon cable ship: red hull, white bridge, the yellow bow sheave cable ships are known by; a wake when under way.
function shipSprite(x,y,face,sc,col,now,mode){const c=ctx;c.save();c.translate(x,y+Math.sin(now/420+x*0.05)*1.2*sc);c.scale(face*sc,sc);
  if(mode!=='port'&&mode!=='work'){c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=1.6;c.beginPath();c.moveTo(-10,3);c.quadraticCurveTo(-16,1,-22,4);c.moveTo(-10,5);c.quadraticCurveTo(-15,8,-21,9);c.stroke();}
  c.fillStyle=col;c.strokeStyle='#1E2640';c.lineWidth=1.6;c.lineJoin='round';c.beginPath();c.moveTo(-11,0);c.lineTo(11,0);c.lineTo(8,6);c.lineTo(-9,6);c.closePath();c.fill();c.stroke();
  c.fillStyle='#fff';c.beginPath();c.rect(-7,-7,8,7);c.fill();c.stroke();c.fillStyle='#1E2640';c.fillRect(-5,-5,4,2);
  c.beginPath();c.arc(9,-2,2.6,0,7);c.fillStyle='#FFD23F';c.fill();c.stroke();
  if(mode==='work'&&Math.floor(now/350)%2){c.fillStyle='#FFD23F';c.font='900 11px sans-serif';c.textAlign='center';c.fillText('✦',12,-8);}
  c.restore();}
function drawShips(ks,now){SHIP_HITS.length=0;if(!S||pzOn()||!S.fleet)return;
  const T=S.day+(UI.speed?clamp(acc/DAY_MS,0,0.999):0),z=cam.z,sc=Math.max(0.85,Math.min(1.5,Math.sqrt(z)))*(lodFar()?0.9:1.05),list=[];
  for(const s of SHIPS){const p=shipAt(s,T);if(p.m==='port'&&z<1.1)continue;list.push({p,s,col:s.club==='prv'?'#7A5CFF':'#FF4D5E'});}
  for(const l of S.links)if(layOwn(l)&&l.ready>S.day&&T>=layStart(l)){const g=linkGeom(l),q=layDone(l,T),two=!!l.ship2;
    const put=(t,k,dir)=>{const [x,y]=polyAt(g.pts,g.cum,clamp(t,0,1)),[x2]=polyAt(g.pts,g.cum,clamp(t+dir*0.01,0,1));list.push({p:{x,y,m:'lay',dx:x2-x||dir},lay:l,k,col:'#16A866'});};
    if(two){put(q/2,0,1);put(1-q/2,1,-1);}else put(q,0,1);}
  for(const it of list)for(const k of ks){const [sx,sy]=toS(it.p.x,it.p.y,k);if(sx<-30||sx>CW+30||sy<-30||sy>CH+30)continue;
    const oy=it.p.m==='work'?-18*sc:0;shipSprite(sx,sy+oy,it.p.dx<0?-1:1,sc,it.col,now,it.p.m);SHIP_HITS.push({x:sx,y:sy+oy,r:14*sc,it});}}
function shipHit(cx,cy){const r=cv.getBoundingClientRect(),x=cx-r.left,y=cy-r.top;let best=null,bd=Infinity;
  for(const h of SHIP_HITS){const d=Math.hypot(h.x-x,h.y-y);if(d<=h.r+6&&d<bd){bd=d;best=h.it;}}return best;}
// Tapping a ship says who it is and what it is doing, with a way to the cable it works on.
function shipTap(it){if(it.lay){const l=it.lay;sfx('click');toast(tr('cable_ships.lay_ship_tap',{ship:esc(layName(l,it.k)),a:esc(CITY[l.a].name),b:esc(CITY[l.b].name),km:Math.round(layDone(l,S.day)*l.km).toLocaleString(),of:Math.round(l.km).toLocaleString()}),'',[{l:tr('common.open'),act:'selLink',args:{id:l.id}}]);return;}
  const s=it.s,f=S.fleet[s.id],club=s.club==='prv'?tr('cable_ships.private_operator'):SHIP_CLUBS[s.club].n,home=esc(CITY[s.home].name);sfx('click');
  const i=f&&f.inc&&S.inc.find(x=>x.id===f.inc&&x.ship===s.id),l=f&&S.links.find(x=>x.id===f.link);
  const what=!f||S.day>=f.back?(s.club==='prv'?tr('cable_ships.private_at_anchor',{home}):tr('cable_ships.at_anchor_off_home',{home})):i?esc(shipStatus(i)):trn('cable_ships.sailing_home_to_home',Math.max(1,f.back-S.day),{home});
  toast(`<b>${esc(s.n)}</b><br>${esc(club)} · ${what}`,'',l&&i?[{l:tr('common.open'),act:'selLink',args:{id:l.id}}]:[]);}
