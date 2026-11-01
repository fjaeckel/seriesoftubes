/* At 4x and 8x a day lasts well under a second, and on a big network routing is nearly all of it. There, a day may
   reuse the last routing, scaled to today's demand (each city keeps the share of its demand it was served), as long
   as nothing that routing reads has changed. Routing runs in full at least every ROUTE_EVERY days, after any action
   (after() calls compute(), which this then sees as a new result) and on any day something routable changed.
   At 0.5x, 1x and 2x (and in tests, at speed 0) every day routes in full, exactly as before. */
let ROUTE_EVERY=2;
// A city whose demand moved more than this since (an event starting, a big customer leaving) routes again: on a full
// network the new traffic does not simply get the same share served.
let ROUTE_DRIFT=0.1;
/* What the daily tick changes without changing routing: money, history, moods, offers, demand (scaled instead).
   Everything else in S counts, and each whole number in it is compared with today (before, today, later), so an
   event, incident, delay or port that starts or ends on a day it is read against S.day routes again. */
const ROUTE_VOL=new Set(['cash','day','hist','stats','offers','mood','pm','warned','warn60','bb','neg','usedNames','nextFail','nextEvent','uiSpeed','cam','lvl','next','log','pdesk','pdeskRep','srv','srvDays','rate']);
let RB=null;
// Customers come and go with the day (events, cancellations): what plain IP customers ask for is demand, scaled like
// the rest; circuits (L2, SD-WAN, fiber) take paths of their own, so those count in full.
function routeKey(){const d=S.day,top=S;return JSON.stringify(S,function(k,v){return ROUTE_VOL.has(k)||(this===top&&k==='biz')?undefined:typeof v==='number'&&Number.isInteger(v)?(v>d?'+'+v:v===d?'='+v:v):v;})
  +JSON.stringify(S.biz.filter(b=>BIZ_T[b.type].l2||BIZ_T[b.type].fiber).map(b=>[b.id,b.bw,b.route,b.sites,b.city,b.city2]));}
// Each city's demand before traffic shares, as compute() starts from it.
function routeD0(){const ev=S.ev,day=S.day,viral=(ev.viral>day?1.25:1)*(ev.php&&ev.php>day?0.7:1),biz={},o={};
  for(const b of S.biz){const T=BIZ_T[b.type];if(!T.l2&&!T.fiber&&(!T.event||eventLive(b)))biz[b.city]=(biz[b.city]||0)+b.bw;}
  for(const c in S.pops){const p=S.pops[c];o[c]=(p.bb?p.bb.d:0)*viral*(cnCity(c)&&ev.golden>day?1.4:1)+(biz[c]||0);}return o;}
function routeBb(){const o={};for(const c in S.pops){const p=S.pops[c];o[c]=p.bb?p.bb.d:0;}return o;}
function dayRoute(){
  // UI.routeWhy: why today routed in full (for the benchmark and the tests).
  // The key is worked out once a day: compute() reads S without changing it, so it still holds afterwards.
  if(UI.speed<4){UI.routeWhy='speed';RB=null;compute();return;}
  let k=null;UI.routeWhy=!RB||RB.cur!==R?'new':S.day-RB.day>=ROUTE_EVERY?'due':(k=routeKey())!==RB.key?'changed':reuseRoute()?'':'demand';if(!UI.routeWhy)return;
  compute();RB={R,cur:R,day:S.day,key:k??routeKey(),d0:routeD0(),bbd:routeBb()};
}
// Today's result from the base one: per city its demand ratio, and the network's served ratio for loads and ports.
function reuseRoute(){const B=RB.R,d0=routeD0(),N={...B};let dem=0,srv=0;
  const cd={},cs={},bd={},bs={},eye={};
  for(const c in S.pops){const b=RB.d0[c],n=d0[c];if(b===undefined||(!(b>0)&&n>0))return false;const r=b>0?n/b:1;if(Math.abs(r-1)>ROUTE_DRIFT)return false;
    cd[c]=(B.cityDem[c]||0)*r;cs[c]=(B.citySrv[c]||0)*r;dem+=cd[c];srv+=cs[c];
    if(B.bizDem[c]!==undefined){bd[c]=B.bizDem[c]*r;bs[c]=B.bizSrv[c]*r;}}
  // The eyeballs of each city: today's users times the base's multiplier (viral, golden week), as compute() would.
  for(const c in S.pops){const p=S.pops[c],b=RB.bbd[c];eye[c]=b>0?B.cityEye[c]*((p.bb?p.bb.d:0)/b):B.cityEye[c];}
  const g=B.served>0?srv/B.served:1,sc=m=>{const o={};for(const k in m)o[k]=m[k]*g;return o;};
  N.cityEye=eye;N.cityDem=cd;N.citySrv=cs;N.bizDem=bd;N.bizSrv=bs;N.demand=dem;N.served=srv;
  N.peered=B.peered*g;N.peerShare=srv>0?N.peered/srv:0;N.gfwLost=B.gfwLost*g;N.gfwCross=B.gfwCross*g;
  N.egT=sc(B.egT);N.useT=sc(B.useT);N.useIx=sc(B.useIx);N.usePni=sc(B.usePni);N.useCache=sc(B.useCache);N.nodeLoad=sc(B.nodeLoad);
  const ld={};for(const l of S.links){const v=B.load[l.id];if(v!==undefined)ld[l.id]=Math.min(v*g,Math.max(v,capOf(l)));}N.load=ld;
  N.cost={};N.rev={};N.p95={};
  Object.defineProperty(N,'fl',{value:B.fl});Object.defineProperty(N,'efg',{value:B.efg});
  routeMoney(N);R=N;RB.cur=N;UI.hotMap=hotByCity();return true;}
