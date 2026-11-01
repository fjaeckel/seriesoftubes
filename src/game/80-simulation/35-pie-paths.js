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
  const X={hubs,ds,term:{},gs:{},gsBw:{},cr:{},isl:[],l2o:{},l2p:{},up:[],ne:NE,adj,nc:NC,sk:[]};
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
      edges[e.id]=e;adj[ci].push([n,e]);adj[n].push([ci,e]);X.up.push(e);X.sk[n-NC]=d.city;sky.push({d,n,cs});}
    for(let i=0;i<sky.length;i++)for(let j=i+1;j<sky.length;j++){const p=sky[i],q=sky[j],km=pieKm(p.d.city,q.d.city);if(km<PIE_MIN_KM)continue;
      const cs=p.cs.filter(id=>q.cs.includes(id));if(!cs.length)continue;const cap=cs.reduce((a,id)=>a+X.cr[id],0);if(!(cap>0))continue;
      const e={id:'pie:'+p.d.city+'~'+q.d.city,a:p.d.city,b:q.d.city,ai:p.n,bi:q.n,i:X.ne++,km:Math.round(km),cap,scap:0,w:Infinity,lat:km*(PIE_RE+CRUSTS[cs[0]].alt)/PIE_RE/PIE_C,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,f:1,sky:'las',cs};
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
  if(w.path.some(e=>e.sky)){X.l2o[b.id]=1;X.l2p[b.id]={w,A,B};}
  return [{...w,share:1}];}
// After routing: what orbit earns (terminals, and a premium on circuits riding the sky) and what each dish carries.
function pieMoney(X,R2,V){let rev=0;const sf={},flows=[];
  for(const b of S.biz){const T=BIZ_T[b.type];
    if(T.orbit){const a=X.term[b.id]||0,s=b.bw>0?a/b.bw*(X.gs[b.id]?sfOf(R2,X.gs[b.id]):0):0,v=b.bw*b.rate*Math.min(1,s/0.95);sf[b.id]=s;rev+=v;
      flows.push({k:'t',id:b.id,type:b.type,city:b.city,dish:X.gs[b.id]||null,g:s*b.bw,rev:v});}
    else if(X.l2o[b.id]&&T.l2){const g=R2.l2[b.id]||0,v=b.bw*b.rate*PIE_LAT_PREM*clamp(g/b.bw,0,1);rev+=v;flows.push(pieCircuit(X,b,g,v,R2.l2lat[b.id]));}}
  const used={},term={};for(const d of X.ds){used[d.city]=d.g-d.left;term[d.city]=d.g-d.left;}for(const e of X.up)used[e.sky.city]+=e.ld||0;
  V.orbit=rev;R2.pie={rev,sf,gs:X.gs,isl:X.isl,used,term:X.gsBw,hubs:X.hubs,sky:X.up.length,flows,...pieLoads(X,flows,used,term)};
  // For the lazy fiber comparison (pieFiberMs): the graph of this compute, kept out of JSON.
  Object.defineProperty(R2.pie,'_x',{value:{adj:X.adj,fm:{}}});}
// A sky circuit for the Traffic tab and the traceroute: entry and exit, the dishes it lands at, and each hop through space.
// Hops in order from A: 'f' fiber to a city, 'up' to the crust at a dish, 'las' across space, 'down' at a dish; ms one way.
function pieCircuit(X,b,g,v,ms){const {w,A,B}=X.l2p[b.id],path=w.path.slice().reverse(),ni=w.ni.slice().reverse(),hops=[],via=[];let cr=null;
  path.forEach((e,i)=>{const to=ni[i+1];if(e.sky==='las'){if(!cr)cr=e.cs[0];hops.push({k:'las',km:e.km,ms:e.lat,cr:e.cs[0]});}
    else if(e.sky){if(to>=X.nc){via.push(e.sky.city);hops.push({k:'up',city:e.sky.city,ms:e.lat});}else{hops.push({k:'down',city:e.sky.city,ms:e.lat});}}
    else hops.push({k:'f',city:CITIES[to].id,ms:e.lat,id:e.id});});
  for(const h of hops)if(h.k==='down'){via.push(h.city);h.cr=cr;}else if(h.k==='up')h.cr=cr;
  return {k:'c',id:b.id,type:b.type,a:A,b:B,via:[...new Set(via)],hops,cr,g,ms:isFinite(ms)?ms:null,rev:v};}
// Load per crust and per dish, and why a dish carries nothing. Crust use: terminals took theirs from X.cr; each sky circuit
// is counted once, on the crusts of its first laser hop, never past what they hold.
function pieLoads(X,flows,used,term){const P=S.pie,cu={},crust=[],dish=[],load={};
  for(const f of flows)if(f.k==='c'&&f.g>0){let r=f.g;const e=X.l2p[f.id].w.path.find(x=>x.sky==='las');for(const id of e?e.cs:[]){const t=Math.min(r,Math.max(0,X.cr[id]-(cu[id]||0)));cu[id]=(cu[id]||0)+t;r-=t;}}
  for(const id in CRUSTS){if(!(pieLive(id)>0))continue;const cv=pieCov(id),pot=CRUSTS[id].g*cv,hub=X.hubs.includes(id);
    crust.push({id,cov:cv,pot,cap:hub?pot:0,used:hub?Math.min(pot,pot-X.cr[id]+(cu[id]||0)):0,las:hub&&pieLased(id),st:hub?'ok':!pieBaked(id)?'half':P.safe?'safe':'down'});}
  const ok=new Map(X.ds.map(d=>[d.city,d])),isl=new Set(X.isl),las=X.hubs.filter(pieLased);
  for(const x of P.dishes){const c=x.city,d=ok.get(c),tm=d?term[c]:0,u0=d?used[c]:0,cap=d?d.g:0,cc=CITY[c].cc,l=P.lic[cc];let st;
    if(!S.pops[c])st='nopop';else if(x.down>S.day)st='down';else if(!d)st=l&&l.until>S.day&&l.state==='sus'?'spat':l&&l.until>S.day&&l.state==='refused'?'ref':'lic';
    else if(!X.hubs.some(id=>pieCovers(id,c)))st='nocrust';else if(u0>1e-9)st='ok';else if(isl.has(c))st='isl';
    else if(pieIncOf('pierain',c))st='rain';else if(P.spat.jam&&(P.spat.jam.cc===cc||P.spat.jam.cc2===cc))st='jam';
    else st=las.some(id=>pieCovers(id,c))?'idle':'nolas';
    const u=cap>0?Math.min(1,u0/cap):0;load[c]=u;dish.push({city:c,cap,term:tm,transit:Math.max(0,u0-tm),used:u0,u,st});}
  return {crust,dish,load};}
// Fiber-only latency of a sky circuit, for "orbit 26 ms vs fiber 29 ms": worked out only when asked (the Traffic tab), once
// per compute. Infinity when no fiber path exists.
function pieFiberMs(f){const P=R&&R.pie,x=P&&P._x;if(!x||!f||f.k!=='c')return Infinity;if(f.id in x.fm)return x.fm[f.id];
  const Ai=CIDX[f.a],Bi=CIDX[f.b],r=dijkstra(x.adj,Ai,e=>e.lat+0.05,(v,e)=>!!e.sky,Bi);let ms=Infinity;
  if(r.D[Bi]<Infinity){const w=walkI(r.P,Ai,Bi);ms=w.path.reduce((a,e)=>a+e.lat,0)+w.path.length*0.05;}return x.fm[f.id]=ms;}
// What the network could sell from orbit today (offers, F3 spirit): a city a baked crust covers and a dish with room left
// can land; read from the last compute (R.pie), never computed here.
function pieServe(c,t){if(!S.pie||!R||!R.pie)return null;const ds=pieDishes();if(!ds.length)return null;const isl=new Set(R.pie.isl);for(const d of ds){d.ok=!isl.has(d.city);d.left=d.g-(R.pie.term[d.city]||0);}return pieLand(c,t,ds,R.pie.hubs.filter(pieUp));}
// Book what orbit earned, day by day.
PIE_ON.day.push(()=>{if(R&&R.pie&&R.pie.rev>0)S.pie.book.earned+=R.pie.rev/30;});
