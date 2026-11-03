/* ---------- cable ships at work (data and real numbers: 20-world/70-cable-ships.js) ----------
   A subsea cut sends a ship from its club's port: it leaves a day after the call, sails the cable routes at about
   500 km a day, may wait for a permit, splices for days, and sails home before it can take the next job. The cut lasts
   until the splice is done. With every ship of the zone's club out, the cut waits; a private charter (any free ship,
   from anywhere) jumps the queue for $1M plus $200 per km it sails. Voyages live in S.fleet so a ship on its way
   home stays busy after the cut is mended; positions are worked out from them, so the map needs no state of its own. */
let SHIP_G=null;
// The cable routes as a graph of landing cities: ships sail where the cables are, which is open sea.
function shipGraph(){if(SHIP_G)return SHIP_G;const g=new Map(),add=(u,e)=>{let L=g.get(u);if(!L)g.set(u,L=[]);L.push(e);};
  CABLE_PAIRS.forEach((p,i)=>{add(p.a,{to:p.b,km:p.km,i});add(p.b,{to:p.a,km:p.km,i});});return SHIP_G=g;}
// Shortest sailing distance from the sources ({city: km already to go}) to every port, with the way back.
function shipDij(src){const G=shipGraph(),dist=new Map(),prev=new Map(),h=[];for(const c in src){dist.set(c,src[c]);h.push([src[c],c]);}
  while(h.length){let b=0;for(let i=1;i<h.length;i++)if(h[i][0]<h[b][0])b=i;const [d,u]=h[b];h[b]=h[h.length-1];h.pop();if(d>dist.get(u))continue;
    for(const e of G.get(u)||[]){const nd=d+e.km;if(nd<(dist.get(e.to)??Infinity)){dist.set(e.to,nd);prev.set(e.to,{from:u,e});h.push([nd,e.to]);}}}
  return {dist,prev};}
const shipFree=s=>{const f=S.fleet[s.id];return !f||S.day>=f.back;};
const shipLink=i=>S.links.find(x=>x.id===i.sl)||S.links.find(x=>(x.trench||x.id)===i.ref);
const shipSea=i=>i.type==='cut'&&(i.ship!=null||!!i.seaq);
// Where on the cable the fault is (share of the way from l.a): mostly in shallow water near a shore, where anchors and
// trawls reach the cable; sometimes out in the deep.
function shipFaultT(l){const near=Math.min(0.45,SHIP_SHALLOW/Math.max(1,l.km||1));
  if(Math.random()<0.75){const d=Math.random()*near;return Math.random()<0.5?0.03+d:0.97-d;}return 0.03+Math.random()*0.94;}
const shipShallow=(l,t)=>Math.min(t,1-t)*(l.km||0)<=SHIP_SHALLOW;
// A fault seen from the sea: sailing distances from it to every port.
const shipFrom=(i,l)=>shipDij({[l.a]:i.st*l.km,[l.b]:(1-i.st)*l.km});
// The club whose zone the fault is in: the one with the nearest port.
function shipZone(D){let best=null,bd=Infinity;for(const s of SHIPS){if(s.club==='prv')continue;const d=D.dist.get(s.home)??Infinity;if(d<bd){bd=d;best=s.club;}}return best;}
// Sailing distance for a ship, and the timetable if it left today.
function shipPlan(s,i,l,D){let km=D.dist.get(s.home);
  if(!(km<Infinity)){const A=CITY[l.a],B=CITY[l.b],H=CITY[s.home];km=Math.round(hav(H.lon,H.lat,A.lon+(B.lon-A.lon)*i.st,A.lat+(B.lat-A.lat)*i.st)*1.4);}
  const sail=Math.max(1,Math.ceil(km/SHIP_KMD)),dep=S.day,arr=dep+SHIP_MOB_D+sail,done=arr+(i.sp||0)+(i.sw||4);return {s,km:Math.round(km),dep,arr,done,back:done+sail};}
// The way a ship sails to the fault: the cable endpoint it comes in by (following the shortest route back from its port).
function shipEnd(s,l,D){let c=s.home;
  if(!D.dist.has(c)){const H=CITY[c],A=CITY[l.a],B=CITY[l.b];return hav(H.lon,H.lat,A.lon,A.lat)<=hav(H.lon,H.lat,B.lon,B.lat)?'a':'b';}
  for(let n=0;n<999;n++){const p=D.prev.get(c);if(!p)break;c=p.from;}return c===l.b?'b':'a';}
// The cut ends with the splice: every link in the trench follows, as clearInc() works it out.
function shipUntil(i,u){i.until=u;for(const l of S.links)if((l.trench||l.id)===i.ref)l.cut=remainUntil(x=>(LINKCUT_TR.includes(x.type)&&x.ref===(l.trench||l.id))||(LINKCUT_ID.includes(x.type)&&x.ref===l.id));}
function shipSend(i,l,P,D){const g=linkGeom(l),pt=polyAt(g.pts,g.cum,i.st);
  S.fleet[P.s.id]={inc:i.id,link:l.id,t:i.st,e:shipEnd(P.s,l,D),dep:P.dep,arr:P.arr,done:P.done,back:P.back,fx:pt[0],fy:pt[1]};
  i.ship=P.s.id;delete i.seaq;shipUntil(i,P.done);}
// A cut waiting for its club: when the first of the club's ships home again would have it mended.
function shipWait(i,l,D){const z=shipZone(D);let best=Infinity;for(const s of SHIPS)if(s.club===z){const f=S.fleet[s.id];best=Math.min(best,shipPlan(s,i,l,D).done+(f?Math.max(0,f.back-S.day):0));}return best;}
// The quickest free ship from anywhere, if it would finish sooner than the plan (or than waiting): what a private charter offers.
function shipQuote(i,l,D){D=D||shipFrom(i,l);let best=null;const cur=i.ship!=null&&S.fleet[i.ship]?S.fleet[i.ship].done:i.seaq?shipWait(i,l,D):Infinity;
  for(const s of SHIPS)if(shipFree(s)){const P=shipPlan(s,i,l,D);if(!best||P.done<best.done)best=P;}
  if(best&&best.done<cur-1){i.cost=Math.round(SHIP_FIX+best.km*SHIP_FIX_KM);i.fix=tr('cable_ships.charter_ship',{ship:best.s.n});}else{i.cost=0;delete i.fix;}return best;}
// Send the zone's club ship that gets there first; with none free, the cut waits for one.
function shipAssign(i,l){const D=shipFrom(i,l),z=shipZone(D);let best=null;
  for(const s of SHIPS)if(s.club===z&&shipFree(s)){const P=shipPlan(s,i,l,D);if(!best||P.done<best.done)best=P;}
  if(best)shipSend(i,l,best,D);else if(!i.seaq){i.seaq=1;i.ship=null;shipUntil(i,S.day+365);}
  shipQuote(i,l,D);}
// A fresh cut on a subsea cable: roll where it is and how long the work takes, then call the club.
function shipCut(i,l){if(!S.fleet)S.fleet={};i.sl=l.id;i.st=+shipFaultT(l).toFixed(3);i.sw=shipShallow(l,i.st)?rint(3,3):rint(6,7);
  const near=CITY[i.st<0.5?l.a:l.b],pm=shipShallow(l,i.st)&&SHIP_PERMIT[near.cc];i.sp=pm?rint(pm[0],pm[1]-pm[0]+1):0;shipAssign(i,l);}
// A ship whose job went away (the cable was given up, or another ship was chartered) turns round where it is.
function shipRecall(id){const f=S.fleet[id];if(!f||S.day>=f.done)return;const m=f.dep+SHIP_MOB_D;
  if(S.day>=f.arr){const sail=f.back-f.done;f.done=S.day;f.back=S.day+sail;f.inc=null;return;}
  const out=Math.max(0,S.day-m);f.rt=+(out/Math.max(1,f.arr-m)).toFixed(4);f.rs=S.day;f.arr=f.done=S.day;f.back=S.day+out;f.inc=null;}
// Pay for the charter: the quickest free ship goes, whichever club or company it sails for.
function shipRush(i){const l=shipLink(i);if(!l||!shipSea(i))return false;const D=shipFrom(i,l),P=shipQuote(i,l,D);if(!P||!i.cost)return false;
  if(!spend(i.cost))return false;if(i.ship!=null)shipRecall(i.ship);shipSend(i,l,P,D);i.cost=0;delete i.fix;i.rushed=true;return true;}
// Every day: ships home from a voyage are free again, waiting cuts get one, charter prices follow the fleet.
function shipDay(){if(!S.fleet)S.fleet={};
  for(const id in S.fleet){const f=S.fleet[id];if(S.day>=f.back){delete S.fleet[id];continue;}if(f.inc&&S.day<f.done&&!S.inc.some(i=>i.id===f.inc&&i.ship===id))shipRecall(id);}
  for(const i of S.inc.filter(shipSea).sort((a,b)=>(a.start||0)-(b.start||0))){const l=shipLink(i);if(!l)continue;if(i.seaq)shipAssign(i,l);else if(!i.rushed)shipQuote(i,l);}}
// What the ship on a cut is doing, for the panels and the NOC.
function shipStatus(i){if(!shipSea(i))return '';const l=shipLink(i);if(!l)return '';
  if(i.seaq){const D=shipFrom(i,l),z=shipZone(D);return tr('cable_ships.every_club_ship_is_out',{club:SHIP_CLUBS[z]?SHIP_CLUBS[z].n:''});}
  const s=SHIP[i.ship],f=S.fleet[i.ship];if(!s||!f)return '';const d=S.day,home=CITY[s.home].name,end=Math.max(1,f.done-d);
  if(d<f.arr)return tr('cable_ships.ship_sails_from_home',{ship:s.n,home,n:f.arr-d,m:end});
  if(d<f.arr+(i.sp||0))return tr('cable_ships.ship_waits_for_a_permit',{ship:s.n,n:f.arr+(i.sp||0)-d,m:end});
  return trn('cable_ships.ship_is_splicing',end,{ship:s.n});}
/* Laying your own subsea cable: the last part of the build is a lay ship at sea, about 150 km a day. A second ship,
   booked before laying starts, works from the other end and halves that part; nothing at sea speeds up the survey,
   the permits or the cable factory. */
const layDays=l=>Math.max(1,Math.ceil((l.km||0)/LAY_KMD)),layLen=l=>l.ship2?Math.ceil(layDays(l)/2):layDays(l),layStart=l=>l.ready-layLen(l);
const layOwn=l=>l.kind==='df'&&l.own&&l.sub;
const layName=(l,k=0)=>{let h=0;for(const ch of String(l.id))h=(h*31+ch.charCodeAt(0))>>>0;return LAY_SHIPS[(h+k)%LAY_SHIPS.length];};
function layQuote(l){if(!layOwn(l)||l.ship2||S.day>=layStart(l)||l.ready<=S.day+1)return null;const save=Math.floor(layDays(l)/2);if(save<1)return null;return {save,cost:SHIP_MOB+save*LAY_DAY};}
// How much of the cable is on the seabed, 0 to 1.
/* Money hurries the survey, the permits and the factory (#258), 30 days a step, but only so far: the cable still has to
   be made, about two months plus a day for every 80 km of it, before the ships can sail and lay it. */
const PREP_STEP=30,prepMin=l=>leadDays(Math.round(60+(l.km||0)*0.012)),prepCost=l=>Math.round((500000+(l.km||0)*60)*hwMul('build')),
  prepFloor=l=>Math.max(S.day+1,(l.day||0)+prepMin(l))+layLen(l),
  prepSteps=l=>layOwn(l)&&l.ready>S.day&&S.day<layStart(l)?Math.max(0,Math.ceil((l.ready-prepFloor(l))/PREP_STEP)):0;
const layDone=(l,T)=>clamp((T-layStart(l))/layLen(l),0,1);
