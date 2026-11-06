/* ---------- Pie in the Sky: routing through orbit (rules O2-O4, docs/plans/pie-in-the-sky.md) ----------
   compute() calls pieGraph() once, only when S.pie exists (saves without it pay one falsy check). It adds to the
   routing graph, after the IGP shortest paths are known:
   - a sky node per connected pie dish (a virtual city index past NC), joined to its POP by an uplink edge: the dish's
     antennas (x rain, jamming… from pieDishes()) less what its terminals and backhaul use; latency one hop up, alt/c + 1 ms;
   - with lasers (a crust over 40% lasered), a space edge between every two sky nodes at least PIE_MIN_KM apart, priced
     along the great circle at the shell's height at c in vacuum, capacity the crust's (pieCap(): g x coverage, x the share a half-baked one carries) left after terminals.
   Orbit edges have IGP weight Infinity: bulk IP traffic and scenic circuits never see them, only latency-routed
   circuits (lat:true customers, route 'fast') do, and only where the sky is faster. Space edges under 3,000 km do not
   exist, so orbit never beats fiber there (O4). A dish whose POP is not on the backbone's island is flagged (R.pie.isl)
   and gets no sky node: it carries no transit (O3). A crust carries nothing under 40% and is not a hub; from
   there it carries a share that grows to all of its capacity at 60% (pieCarry(), O2).
   Backhaul (O3): a cut-off dish lifts its own POP's traffic, all of it, to a landing dish on the backbone: one virtual
   edge, POP to landing POP ('pie:bh:'+city, e.bh), through a crust covering both (bent pipe within PIE_BENT km, lasers
   past that). Its capacity is booked after terminals and before sky circuits: min(the dish's room, the landing dish's room,
   the crust's room); its latency is the orbit path (pieSkyMs). Its IGP weight is Infinity like every orbit edge, so no
   POP on the backbone ever routes through it; pieRelink() then reruns the shortest paths of that one POP with the edge at
   PIE_BH_W (its other backhauls stay Infinity), and joins its island to the backbone's in COMP, so its flows see the
   backbone's exits (further than any of its own: local exits first). The backbone's POPs keep their old paths, which do
   not reach the island, so they skip its exits. Nothing of this runs when no dish is cut off, so routing is unchanged.
   Terminal customers (BIZ_T[].orbit: pizza, flywifi, boat, marsorb) sit anywhere a baked crust covers, with no POP of
   theirs; their traffic lands on a ground dish (bent pipe within PIE_BENT km, or lasers to any connected dish) and
   enters the network there as business demand. Spats: pieSpatHome(cc) keeps a country's customers on its own dishes,
   pieAirBlock(a,b) keeps country a's traffic off country b's dishes; both apply to backhaul as to terminals. */
const PIE_C=300,PIE_RE=6371,PIE_MIN_KM=3000,PIE_BENT=1000,PIE_HOP=1,PIE_FOOT=3,PIE_LAT_PREM=0.5,PIE_BH_W=1e5;
const pieKm=(a,b)=>{const A=CITY[a],B=CITY[b];return hav(A.lon,A.lat,B.lon,B.lat);};
// Does crust id cover city c? A shell reaches a few degrees past its inclination; a polar one reaches everywhere.
const pieCovers=(id,c)=>!!CRUSTS[id].polar||Math.abs(CITY[c].lat)<=CRUSTS[id].inc+PIE_FOOT;
const pieLased=id=>pieLiveLas(id)>CRUSTS[id].full*PIE_RAW;
// One way through space between two dishes km apart, at shell height alt: up, along the great circle, down.
const pieSkyMs=(km,alt)=>2*(alt/PIE_C+PIE_HOP)+km*(PIE_RE+alt)/PIE_RE/PIE_C;
// May a customer in country ca land on a dish in country dc? (spats)
const pieLandOk=(ca,dc)=>!(pieSpatHome(ca)&&dc!==ca)&&!pieAirBlock(ca,dc);
/* Where a terminal customer in city c lands: {k (index in ds), cr} or null. ds: dishes with .ok (on the backbone).
   The nearest dish with room left (for all of bw if any has it) that a crust over c also covers: within PIE_BENT km (bent pipe, any dish), else with lasers on that
   crust any dish on the backbone. Some customers need lasers (flywifi, marsorb: T.las). */
function pieLand(c,t,ds,hubs,bw=0){const T=BIZ_T[t],cc=CITY[c].cc;let best=null,bk=Infinity;
  for(const id of hubs){if(!pieCovers(id,c))continue;const las=pieLased(id);if(T.las&&!las)continue;
    for(let k=0;k<ds.length;k++){const d=ds[k];if(!pieCovers(id,d.city)||!pieLandOk(cc,d.cc))continue;const km=c===d.city?0:pieKm(c,d.city);
      if(d.left>0&&(km<=PIE_BENT||(las&&d.ok))){const v=km+(d.ok?0:1)+(d.left<bw?1e6:0);if(v<bk){bk=v;best={k,cr:id,left:d.left};}}}}
  return best;}
function pieGraph(adj,edges,COMP,pops,NE){const NC=CITIES.length,hubs=pieHubs(),ds=pieDishes();
  const X={hubs,ds,term:{},gs:{},gsBw:{},cr:{},isl:[],l2o:{},l2p:{},up:[],ne:NE,adj,nc:NC,sk:[],bh:[],bhNo:[],res:{},main:-1};
  for(const id of hubs)X.cr[id]=pieCap(id);
  // The backbone: the island with the most POPs (ties: the home city's).
  const cnt=new Map();for(const p of pops){const k=COMP[CIDX[p]];if(k>=0)cnt.set(k,(cnt.get(k)||0)+1);}
  let main=-1,mn=0;const hk=S.home&&S.pops[S.home]?COMP[CIDX[S.home]]:-1;for(const [k,n] of cnt)if(n>mn||(n===mn&&k===hk)){main=k;mn=n;}X.main=main;
  for(const d of ds){const ci=CIDX[d.city];d.ok=COMP[ci]>=0&&COMP[ci]===main;d.left=d.g;if(!d.ok)X.isl.push(d.city);}
  // Terminals first: each takes what its dish and its crust have left, in S.biz order.
  if(hubs.length)for(const b of S.biz){const T=BIZ_T[b.type];if(!T.orbit)continue;const L=pieLand(b.city,b.type,ds,hubs,b.bw);if(!L)continue;const d=ds[L.k];
    const a=Math.max(0,Math.min(b.bw,d.left,X.cr[L.cr]));d.left-=a;X.cr[L.cr]-=a;X.term[b.id]=a;X.gs[b.id]=d.city;X.gsBw[d.city]=(X.gsBw[d.city]||0)+a;}
  // Backhaul for cut-off POPs, after terminals and before sky circuits (see the top).
  if(X.isl.length)for(const d of ds){if(d.ok)continue;const ci=CIDX[d.city];if(!adj[ci]||!pops.includes(d.city))continue;const L=pieBhLand(d,ds,hubs,X.cr);
    if(L.why){X.bhNo.push({city:d.city,why:L.why});continue;}
    const D=ds[L.k],a=Math.min(d.left,D.left,X.cr[L.cr]),li=CIDX[D.city];d.left-=a;D.left-=a;X.cr[L.cr]-=a;X.res[d.city]=(X.res[d.city]||0)+a;X.res[D.city]=(X.res[D.city]||0)+a;
    const e={id:'pie:bh:'+d.city,a:d.city,b:D.city,ai:ci,bi:li,i:X.ne++,km:Math.round(L.km),cap:a,scap:0,w:Infinity,lat:L.ms,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,jk:0,f:1,bh:{city:d.city,ci,land:D.city,cr:L.cr,las:L.las,km:L.km}};
    edges[e.id]=e;adj[ci].push([li,e]);adj[li].push([ci,e]);X.bh.push(e);}
  const las=hubs.filter(pieLased).sort((a,b)=>CRUSTS[a].alt-CRUSTS[b].alt);
  if(las.length){const sky=[];
    for(const d of ds){if(!d.ok||!(d.left>0))continue;const cs=las.filter(id=>pieCovers(id,d.city));if(!cs.length)continue;const ci=CIDX[d.city],n=NC+sky.length;adj[n]=[];
      const e={id:'pie:'+d.city,a:d.city,b:d.city,ai:ci,bi:n,i:X.ne++,km:0,cap:d.left,scap:0,w:Infinity,lat:CRUSTS[cs[0]].alt/PIE_C+PIE_HOP,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,jk:0,f:1,sky:d};
      edges[e.id]=e;adj[ci].push([n,e]);adj[n].push([ci,e]);X.up.push(e);X.sk[n-NC]=d.city;sky.push({d,n,cs});}
    for(let i=0;i<sky.length;i++)for(let j=i+1;j<sky.length;j++){const p=sky[i],q=sky[j],km=pieKm(p.d.city,q.d.city);if(km<PIE_MIN_KM)continue;
      const cs=p.cs.filter(id=>q.cs.includes(id));if(!cs.length)continue;const cap=cs.reduce((a,id)=>a+X.cr[id],0);if(!(cap>0))continue;
      const e={id:'pie:'+p.d.city+'~'+q.d.city,a:p.d.city,b:q.d.city,ai:p.n,bi:q.n,i:X.ne++,km:Math.round(km),cap,scap:0,w:Infinity,lat:km*(PIE_RE+CRUSTS[cs[0]].alt)/PIE_RE/PIE_C,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,jk:0,f:1,sky:'las',cs};
      edges[e.id]=e;adj[p.n].push([q.n,e]);adj[q.n].push([p.n,e]);}
    // Every Gbps through space goes up one dish and down another: the uplinks together carry at most twice what the crusts have left.
    const room=2*las.reduce((a,id)=>a+X.cr[id],0),up=X.up.reduce((a,e)=>a+e.cap,0);if(up>room)for(const e of X.up)e.cap*=room/up;}
  return X;}
/* Where cut-off dish d lands its POP's backhaul: {k (index in ds), cr, las, km, ms}, the fastest way down on the backbone, or
   {why}: 'nocrust' (no baked crust over it), 'noland' (no dish on the backbone under that crust), 'nolas' (none within
   PIE_BENT km and no lasers), 'spat' (the spats keep it off every dish in reach), 'full' (every dish or crust in reach is full). */
const PIE_BH_WHY=['noland','nolas','spat','full'];
function pieBhLand(d,ds,hubs,cr){const cs=hubs.filter(id=>pieCovers(id,d.city));if(!cs.length)return {why:'nocrust'};let best=null,bm=Infinity,w=0;
  for(const id of cs){const las=pieLased(id),alt=CRUSTS[id].alt;
    for(let k=0;k<ds.length;k++){const L=ds[k];if(!L.ok||!pieCovers(id,L.city))continue;const km=pieKm(d.city,L.city);
      if(km>PIE_BENT&&!las){w=Math.max(w,1);continue;}if(!pieLandOk(d.cc,L.cc)){w=Math.max(w,2);continue;}
      if(!(L.left>0)||!(cr[id]>0)||!(d.left>0)){w=3;continue;}
      const ms=pieSkyMs(km,alt);if(ms<bm){bm=ms;best={k,cr:id,las:km>PIE_BENT,km,ms};}}}
  return best||{why:PIE_BH_WHY[w]};}
// compute(), only when some POP backhauls: that POP's shortest paths with its own backhaul edge, and its island on the backbone.
function pieRelink(X,SPD,SPP,SDi,SPi,COMP0){const isl=new Set(),COMP=COMP0.slice();
  for(const e of X.bh){const i=e.ai,r=dijkstra(X.adj,i,x=>x.bh?(x===e?PIE_BH_W:Infinity):x.w);SDi[i]=SPD[e.a]=r.D;SPi[i]=SPP[e.a]=r.P;isl.add(COMP[i]);}
  for(let x=0;x<COMP.length;x++)if(isl.has(COMP[x]))COMP[x]=X.main;return COMP;}
// A backhaul edge as hops, from the cut-off POP (up there, down at the landing dish) or towards it; ms one way, adding to e.lat.
function pieBhHops(e,fromIsl){const b=e.bh,alt=CRUSTS[b.cr].alt,up=alt/PIE_C+PIE_HOP,mid=b.km*(PIE_RE+alt)/PIE_RE/PIE_C,A=fromIsl?b.city:b.land,B=fromIsl?b.land:b.city;
  return b.las?[{k:'up',city:A,ms:up,cr:b.cr},{k:'las',km:b.km,ms:mid,cr:b.cr},{k:'down',city:B,ms:up,cr:b.cr}]:[{k:'up',city:A,ms:up+mid/2,cr:b.cr},{k:'down',city:B,ms:up+mid/2,cr:b.cr}];}
// A latency-routed circuit from A to B (compute()'s l2Routes, mode 'fast'): the fastest path, through the sky where it is
// faster and the spats allow it; uplinks only in the two end countries when either asks to keep traffic home.
// Only latency customers fly, and never between cities under PIE_MIN_KM apart (O4): the rest get the fiber-only answer.
// A backhaul edge is open only to circuits from its own cut-off POP (compute() puts that end first).
function pieFast(X,fastSP,A,B,b,wLat){const Ai=CIDX[A],Bi=CIDX[B],nb=X.bh.length?e=>!!e.bh&&e.bh.ci!==Ai:null;
  if(!BIZ_T[b.type].lat||pieKm(A,B)<PIE_MIN_KM){const k='g:'+A,r=fastSP[k]||(fastSP[k]=dijkstra(X.adj,Ai,wLat,nb?(v,e)=>!!e.sky||nb(e):(v,e)=>!!e.sky));return [{...walkI(r.P,Ai,Bi),share:1}];}
  const r=fastSP[A]||(fastSP[A]=dijkstra(X.adj,Ai,wLat,nb?(v,e)=>nb(e):undefined));let w=walkI(r.P,Ai,Bi);if(!w.path.some(e=>e.sky))return [{...w,share:1}];
  const ca=CITY[A].cc,cb=CITY[B].cc,home=pieSpatHome(ca)||pieSpatHome(cb),bad=e=>e.sky!=='las'&&(pieAirBlock(ca,e.sky.cc)||pieAirBlock(cb,e.sky.cc)||(home&&e.sky.cc!==ca&&e.sky.cc!==cb));
  if(w.path.some(e=>e.sky&&bad(e)))w=walkI(dijkstra(X.adj,Ai,wLat,(v,e)=>!!e.sky&&bad(e)||!!nb&&nb(e),Bi).P,Ai,Bi);
  if(w.path.some(e=>e.sky)){X.l2o[b.id]=1;X.l2p[b.id]={w,A,B};}
  return [{...w,share:1}];}
// After routing: what orbit earns (terminals, a premium on circuits riding the sky, patchy-sky customers) and what each dish carries.
function pieMoney(X,R2,V){let rev=0;const sf={},flows=[];
  for(const b of S.biz){const T=BIZ_T[b.type];
    if(T.orbit){const a=X.term[b.id]||0,s=b.bw>0?a/b.bw*(X.gs[b.id]?sfOf(R2,X.gs[b.id]):0):0,v=b.bw*b.rate*Math.min(1,s/0.95);sf[b.id]=s;rev+=v;
      flows.push({k:'t',id:b.id,type:b.type,city:b.city,dish:X.gs[b.id]||null,g:s*b.bw,rev:v});}
    else if(X.l2o[b.id]&&T.l2){const g=R2.l2[b.id]||0,v=b.bw*b.rate*PIE_LAT_PREM*clamp(g/b.bw,0,1);rev+=v;flows.push(pieCircuit(X,b,g,v,R2.l2lat[b.id]));}}
  // A dish's use: its terminals (what they took from d.left, not the backhaul booked there), then what crossed its edges.
  const used={},term={},bhG={};for(const d of X.ds){const t=d.g-d.left-(X.res[d.city]||0);used[d.city]=t;term[d.city]=t;}for(const e of X.up)used[e.sky.city]+=e.ld||0;
  const bh=[];for(const e of X.bh){const g=e.ld||0,b=e.bh;used[e.a]+=g;used[e.b]+=g;bhG[e.a]=(bhG[e.a]||0)+g;bhG[e.b]=(bhG[e.b]||0)+g;
    bh.push({city:e.a,land:e.b,g,cap:e.cap,ms:e.lat,cr:b.cr,las:b.las,km:e.km});flows.push({k:'b',id:'bh:'+e.a,city:e.a,dish:e.b,g,cap:e.cap,ms:e.lat,cr:b.cr,hops:pieBhHops(e,true)});}
  for(const o of X.bhNo)bh.push({city:o.city,land:null,g:0,cap:0,why:o.why});
  // Patchy-sky customers (99-pie-patchy.js): a revenue line before a crust carries anything, handed over as it does.
  const patchy=piePatchy(X.ds);rev+=patchy.mo;
  // The billing database is down (the Founder's antics, 99-pie-jitters.js): the sky carries on, nobody is invoiced.
  const billOff=pieBillOff()?rev:0;if(billOff)rev=0;
  V.orbit=rev;R2.pie={rev,billOff,patchy,sf,gs:X.gs,isl:X.isl,used,term:X.gsBw,hubs:X.hubs,sky:X.up.length,flows,bh,...pieLoads(X,flows,used,term,bhG)};
  // For the lazy fiber comparison (pieFiberMs): the graph of this compute, kept out of JSON.
  Object.defineProperty(R2.pie,'_x',{value:{adj:X.adj,fm:{}}});}
// A sky circuit for the Traffic tab and the traceroute: entry and exit, the dishes it lands at, and each hop through space.
// Hops in order from A: 'f' fiber to a city, 'up' to the crust at a dish, 'las' across space, 'down' at a dish; ms one way.
function pieCircuit(X,b,g,v,ms){const {w,A,B}=X.l2p[b.id],path=w.path.slice().reverse(),ni=w.ni.slice().reverse(),hops=[],via=[];let cr=null;
  path.forEach((e,i)=>{const to=ni[i+1];if(e.bh){for(const h of pieBhHops(e,CITIES[to].id===e.bh.land))hops.push(h);}else if(e.sky==='las'){if(!cr)cr=e.cs[0];hops.push({k:'las',km:e.km,ms:e.lat,cr:e.cs[0]});}
    else if(e.sky){if(to>=X.nc){hops.push({k:'up',city:e.sky.city,ms:e.lat});}else{hops.push({k:'down',city:e.sky.city,ms:e.lat});}}
    else hops.push({k:'f',city:CITIES[to].id,ms:e.lat,id:e.id});});
  for(const h of hops)if(h.k==='down'||h.k==='up'){via.push(h.city);h.cr=h.cr||cr;}
  return {k:'c',id:b.id,type:b.type,a:A,b:B,via:[...new Set(via)],hops,cr,g,ms:isFinite(ms)?ms:null,rev:v};}
// Load per crust and per dish, and why a dish carries nothing. Crust use: terminals took theirs from X.cr; each sky circuit
// is counted once, on the crusts of its first laser hop, never past what they hold.
function pieLoads(X,flows,used,term,bhG){const P=S.pie,cu={},crust=[],dish=[],load={};
  // Backhaul booked its capacity from X.cr; count what it carried instead.
  const bx={};for(const e of X.bh){const id=e.bh.cr;bx[id]=(bx[id]||0)+Math.min(e.cap,e.ld||0)-e.cap;}
  for(const f of flows)if(f.k==='c'&&f.g>0){let r=f.g;const e=X.l2p[f.id].w.path.find(x=>x.sky==='las');for(const id of e?e.cs:[]){const t=Math.min(r,Math.max(0,X.cr[id]-(cu[id]||0)));cu[id]=(cu[id]||0)+t;r-=t;}}
  for(const id in CRUSTS){if(!(pieLive(id)>0))continue;const cv=pieCov(id),hub=X.hubs.includes(id),pot=hub?pieCap(id):CRUSTS[id].g*cv;
    crust.push({id,cov:cv,pot,cap:hub?pot:0,used:hub?Math.min(pot,pot-X.cr[id]+(cu[id]||0)+(bx[id]||0)):0,las:hub&&pieLased(id),st:hub?(pieBaked(id)?'ok':'part'):!(pieCarry(id)>0)?'half':P.safe?'safe':'down'});}
  const ok=new Map(X.ds.map(d=>[d.city,d])),isl=new Set(X.isl),las=X.hubs.filter(pieLased),bh=new Set(X.bh.map(e=>e.a));
  for(const x of P.dishes){const c=x.city,d=ok.get(c),tm=d?term[c]:0,u0=d?used[c]:0,cap=d?d.g:0,cc=CITY[c].cc,l=P.lic[cc];let st;
    if(!S.pops[c])st='nopop';else if(x.down>S.day)st='down';else if(!d)st=l&&l.until>S.day&&l.state==='sus'?'spat':l&&l.until>S.day&&l.state==='refused'?'ref':'lic';
    else if(!X.hubs.some(id=>pieCovers(id,c)))st='nocrust';else if(isl.has(c))st=bh.has(c)?'backhaul':'isl';else if(u0>1e-9)st='ok';
    else if(pieIncOf('pierain',c))st='rain';else if(P.spat.jam&&(P.spat.jam.cc===cc||P.spat.jam.cc2===cc))st='jam';
    else st=las.some(id=>pieCovers(id,c))?'idle':'nolas';
    const u=cap>0?Math.min(1,u0/cap):0;load[c]=u;const b=d?bhG[c]||0:0;dish.push({city:c,cap,term:tm,bh:b,transit:Math.max(0,u0-tm-b),used:u0,u,st});}
  return {crust,dish,load};}
// Fiber-only latency of a sky circuit, for "orbit 26 ms vs fiber 29 ms": worked out only when asked (the Traffic tab), once
// per compute. Infinity when no fiber path exists.
function pieFiberMs(f){const P=R&&R.pie,x=P&&P._x;if(!x||!f||f.k!=='c')return Infinity;if(f.id in x.fm)return x.fm[f.id];
  const Ai=CIDX[f.a],Bi=CIDX[f.b],r=dijkstra(x.adj,Ai,e=>e.lat+0.05,(v,e)=>!!e.sky||!!e.bh,Bi);let ms=Infinity;
  if(r.D[Bi]<Infinity){const w=walkI(r.P,Ai,Bi);ms=w.path.reduce((a,e)=>a+e.lat,0)+w.path.length*0.05;}return x.fm[f.id]=ms;}
// What the network could sell from orbit today (offers, F3 spirit): a city a baked crust covers and a dish with room left
// can land; read from the last compute (R.pie), never computed here.
function pieServe(c,t){if(!S.pie||!R||!R.pie)return null;const ds=pieDishes();if(!ds.length)return null;const isl=new Set(R.pie.isl);for(const d of ds){d.ok=!isl.has(d.city);d.left=d.g-(R.pie.term[d.city]||0);}return pieLand(c,t,ds,R.pie.hubs.filter(pieUp));}
// Book what orbit earned, day by day.
PIE_ON.day.push(()=>{if(R&&R.pie&&R.pie.rev>0)S.pie.book.earned+=R.pie.rev/30;});
