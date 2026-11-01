/* ---------- Pie in the Sky: routing through orbit (rules O2-O4, docs/plans/pie-in-the-sky.md) ----------
   compute() calls pieGraph() once, only when S.pie exists (saves without it pay one falsy check). It adds to the
   routing graph, after the IGP shortest paths are known:
   - a sky node per connected pie dish (a virtual city index past NC), joined to its POP by an uplink edge: the dish's
     antennas (x rain, jamming… from pieDishes()) less what its terminals use; latency one hop up, alt/c + 1 ms;
   - with lasers (a crust >= 60% lasered), a space edge between every two sky nodes at least PIE_MIN_KM apart, priced
     along the great circle at the shell's height at c in vacuum, capacity the crust's (g x coverage) left after terminals.
   Orbit edges have IGP weight Infinity: bulk IP traffic and scenic circuits never see them, only latency-routed
   circuits (lat:true customers, route 'fast') do, and only where the sky is faster. Space edges under 3,000 km do not
   exist, so orbit never beats fiber there (O4). A dish whose POP is not on the backbone's island is flagged (R.pie.isl)
   and gets no sky node: it carries no transit, only its own local terminals (O3). A half-baked crust (< 60%) is not a
   hub and carries nothing (O2).
   Terminal customers (BIZ_T[].orbit: pizza, flywifi, boat, marsorb) sit anywhere a baked crust covers, with no POP of
   theirs; their traffic lands on a ground dish (bent pipe within PIE_BENT km, or lasers to any connected dish) and
   enters the network there as business demand. Spats: pieSpatHome(cc) keeps a country's customers on its own dishes,
   pieAirBlock(a,b) keeps country a's traffic off country b's dishes. */
const PIE_C=300,PIE_RE=6371,PIE_MIN_KM=3000,PIE_BENT=1000,PIE_HOP=1,PIE_FOOT=3,PIE_LAT_PREM=0.5;
const pieKm=(a,b)=>{const A=CITY[a],B=CITY[b];return hav(A.lon,A.lat,B.lon,B.lat);};
// Does crust id cover city c? A shell reaches a few degrees past its inclination; a polar one reaches everywhere.
const pieCovers=(id,c)=>!!CRUSTS[id].polar||Math.abs(CITY[c].lat)<=CRUSTS[id].inc+PIE_FOOT;
const pieLased=id=>pieLiveLas(id)>=CRUSTS[id].full*PIE_BAKED;
// One way through space between two dishes km apart, at shell height alt: up, along the great circle, down.
const pieSkyMs=(km,alt)=>2*(alt/PIE_C+PIE_HOP)+km*(PIE_RE+alt)/PIE_RE/PIE_C;
// May a customer in country ca land on a dish in country dc? (spats)
const pieLandOk=(ca,dc)=>!(pieSpatHome(ca)&&dc!==ca)&&!pieAirBlock(ca,dc);
/* Where a terminal customer in city c lands: {k (index in ds), cr} or null. ds: dishes with .ok (on the backbone).
   The nearest dish with room left that a baked crust over c also covers: within PIE_BENT km (bent pipe, any dish), else with lasers on that
   crust any dish on the backbone. Some customers need lasers (flywifi, marsorb: T.las). */
function pieLand(c,t,ds,hubs){const T=BIZ_T[t],cc=CITY[c].cc;let best=null,bk=Infinity;
  for(const id of hubs){if(!pieCovers(id,c))continue;const las=pieLased(id);if(T.las&&!las)continue;
    for(let k=0;k<ds.length;k++){const d=ds[k];if(!pieCovers(id,d.city)||!pieLandOk(cc,d.cc))continue;const km=c===d.city?0:pieKm(c,d.city);
      if(d.left>0&&(km<=PIE_BENT||(las&&d.ok))){const v=km+(d.ok?0:1);if(v<bk){bk=v;best={k,cr:id,left:d.left};}}}}
  return best;}
function pieGraph(adj,edges,COMP,pops,NE){const NC=CITIES.length,hubs=pieHubs(),ds=pieDishes();
  const X={hubs,ds,term:{},gs:{},gsBw:{},cr:{},isl:[],l2o:{},up:[],ne:NE,adj};
  for(const id of hubs)X.cr[id]=CRUSTS[id].g*pieCov(id);
  // The backbone: the island with the most POPs (ties: the home city's).
  const cnt=new Map();for(const p of pops){const k=COMP[CIDX[p]];if(k>=0)cnt.set(k,(cnt.get(k)||0)+1);}
  let main=-1,mn=0;const hk=S.home&&S.pops[S.home]?COMP[CIDX[S.home]]:-1;for(const [k,n] of cnt)if(n>mn||(n===mn&&k===hk)){main=k;mn=n;}
  for(const d of ds){const ci=CIDX[d.city];d.ok=COMP[ci]>=0&&COMP[ci]===main;d.left=d.g;if(!d.ok)X.isl.push(d.city);}
  // Terminals first: each takes what its dish and its crust have left, in S.biz order.
  if(hubs.length)for(const b of S.biz){const T=BIZ_T[b.type];if(!T.orbit)continue;const L=pieLand(b.city,b.type,ds,hubs);if(!L)continue;const d=ds[L.k];
    const a=Math.max(0,Math.min(b.bw,d.left,X.cr[L.cr]));d.left-=a;X.cr[L.cr]-=a;X.term[b.id]=a;X.gs[b.id]=d.city;X.gsBw[d.city]=(X.gsBw[d.city]||0)+a;}
  const las=hubs.filter(pieLased).sort((a,b)=>CRUSTS[a].alt-CRUSTS[b].alt);
  if(las.length){const sky=[];
    for(const d of ds){if(!d.ok||!(d.left>0))continue;const cs=las.filter(id=>pieCovers(id,d.city));if(!cs.length)continue;const ci=CIDX[d.city],n=NC+sky.length;adj[n]=[];
      const e={id:'pie:'+d.city,a:d.city,b:d.city,ai:ci,bi:n,i:X.ne++,km:0,cap:d.left,scap:0,w:Infinity,lat:CRUSTS[cs[0]].alt/PIE_C+PIE_HOP,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,f:1,sky:d};
      edges[e.id]=e;adj[ci].push([n,e]);adj[n].push([ci,e]);X.up.push(e);sky.push({d,n,cs});}
    for(let i=0;i<sky.length;i++)for(let j=i+1;j<sky.length;j++){const p=sky[i],q=sky[j],km=pieKm(p.d.city,q.d.city);if(km<PIE_MIN_KM)continue;
      const cs=p.cs.filter(id=>q.cs.includes(id));if(!cs.length)continue;const cap=cs.reduce((a,id)=>a+X.cr[id],0);if(!(cap>0))continue;
      const e={id:'pie:'+p.d.city+'~'+q.d.city,a:p.d.city,b:q.d.city,ai:p.n,bi:q.n,i:X.ne++,km:Math.round(km),cap,scap:0,w:Infinity,lat:km*(PIE_RE+CRUSTS[cs[0]].alt)/PIE_RE/PIE_C,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,f:1,sky:'las'};
      edges[e.id]=e;adj[p.n].push([q.n,e]);adj[q.n].push([p.n,e]);}
    // Every Gbps through space goes up one dish and down another: the uplinks together carry at most twice what the crusts have left.
    const room=2*las.reduce((a,id)=>a+X.cr[id],0),up=X.up.reduce((a,e)=>a+e.cap,0);if(up>room)for(const e of X.up)e.cap*=room/up;}
  return X;}
// A latency-routed circuit from A to B (compute()'s l2Routes, mode 'fast'): the fastest path, through the sky where it is
// faster and the spats allow it; uplinks only in the two end countries when either asks to keep traffic home.
// Only latency customers fly, and never between cities under PIE_MIN_KM apart (O4): the rest get the fiber-only answer.
function pieFast(X,fastSP,A,B,b,wLat){const Ai=CIDX[A],Bi=CIDX[B];
  if(!BIZ_T[b.type].lat||pieKm(A,B)<PIE_MIN_KM){const k='g:'+A,r=fastSP[k]||(fastSP[k]=dijkstra(X.adj,Ai,wLat,(v,e)=>!!e.sky));return [{...walkI(r.P,Ai,Bi),share:1}];}
  const r=fastSP[A]||(fastSP[A]=dijkstra(X.adj,Ai,wLat));let w=walkI(r.P,Ai,Bi);if(!w.path.some(e=>e.sky))return [{...w,share:1}];
  const ca=CITY[A].cc,cb=CITY[B].cc,home=pieSpatHome(ca)||pieSpatHome(cb),bad=e=>e.sky!=='las'&&(pieAirBlock(ca,e.sky.cc)||pieAirBlock(cb,e.sky.cc)||(home&&e.sky.cc!==ca&&e.sky.cc!==cb));
  if(w.path.some(e=>e.sky&&bad(e)))w=walkI(dijkstra(X.adj,Ai,wLat,(v,e)=>!!e.sky&&bad(e),Bi).P,Ai,Bi);
  if(w.path.some(e=>e.sky))X.l2o[b.id]=1;
  return [{...w,share:1}];}
// After routing: what orbit earns (terminals, and a premium on circuits riding the sky) and what each dish carries.
function pieMoney(X,R2,V){let rev=0;const sf={};
  for(const b of S.biz){const T=BIZ_T[b.type];
    if(T.orbit){const a=X.term[b.id]||0,s=b.bw>0?a/b.bw*(X.gs[b.id]?sfOf(R2,X.gs[b.id]):0):0;sf[b.id]=s;rev+=b.bw*b.rate*Math.min(1,s/0.95);}
    else if(X.l2o[b.id]&&T.l2)rev+=b.bw*b.rate*PIE_LAT_PREM*clamp((R2.l2[b.id]||0)/b.bw,0,1);}
  const used={};for(const d of X.ds)used[d.city]=d.g-d.left;for(const e of X.up)used[e.sky.city]+=e.ld||0;
  V.orbit=rev;R2.pie={rev,sf,gs:X.gs,isl:X.isl,used,term:X.gsBw,hubs:X.hubs,sky:X.up.length};}
// What the network could sell from orbit today (offers, F3 spirit): a city a baked crust covers and a dish with room left
// can land; read from the last compute (R.pie), never computed here.
function pieServe(c,t){if(!S.pie||!R||!R.pie)return null;const ds=pieDishes();if(!ds.length)return null;const isl=new Set(R.pie.isl);for(const d of ds){d.ok=!isl.has(d.city);d.left=d.g-(R.pie.term[d.city]||0);}return pieLand(c,t,ds,R.pie.hubs.filter(pieUp));}
// Book what orbit earned, day by day.
PIE_ON.day.push(()=>{if(R&&R.pie&&R.pie.rev>0)S.pie.book.earned+=R.pie.rev/30;});
