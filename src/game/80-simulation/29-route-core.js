/* The routing core: the loops that place every flow on an exit (compute() in 30-compute.js does everything around them).
   They are made once, here, and not inside compute() as they used to be: V8 compiles a function for the objects it
   meets, and every compute() made new copies of these, so each routing threw the optimised code away (a new function
   where it had inlined the old one) and ran a good part of its loops unoptimised until it was compiled again. Made once,
   they stay compiled from one day to the next. compute() hands them the day's state: nodes() what floods and circuits
   carry before routing (nodeTake(), carry()), run() the rest, then run() routes every pass. The code is the same
   code; only where it lives changed (tests/routing-reference.test.js, tests/speed.test.js, scripts/route-fuzz.js). */
function routeCore(){
  // The day's state, set by nodes() and run(). (TR, base and eff, the ranks, are for the reference loop of the tests.)
  let NRES,NSEEN,NORD,NLOAD,EL,NKN,SEN,ACN,NC,SED,ACD,
    E,HAS,PASS,R2,FREM,FNJ,FCI,FCA,FBZ,NF,CNB,NCN,ev,day,SRV,TNS,NN,TNK,TORD,TNA,snd,LATP,FARL,EGT,EGO,NEG,NEO,NEA,FGT,FTI,FGI,FII,FGH,FGP,
    TE,SPILL,TT,teCache,adj,CORE,OUT,REACH,DSEL,PREFC,BRJ,COMP,SDi,SPi,ALONE,TR,base,eff,
    NX=0,USED=null,CAPX=null,CIX=null,HPX=null,DTX=null,VISX=null,TEF=null,EP=0;
  // The flow being routed, and from its POP: distances, arriving edges and the paths walked so far, by city index.
  // F: its index; fci, fnj: its city and network index. BRX: BRJ with each list as a list object of one shape (lx()).
  let F=0,fci=0,fnj=0,Dv=null,Pv=null,PP=null,vis=0,GN=0,walked=[],BRX=[];const G=[],REST=[];
  const wW=e=>e.w;
  // Each network's list at one rank, in an array by network index: BRX[j] are objects of as many shapes as networks have
  // sets of ranks, and reading one per flow made the loop's code give up on them.
  const byRank=rank=>{const B=new Array(BRX.length);for(let j=0;j<BRX.length;j++){const l=BRX[j][rank];B[j]=l===undefined?null:l;}return B;};
  const nodeTake=(i,a)=>{const o=NRES[i];NRES[i]=o-a;if(o>1e-3&&NRES[i]<=1e-3)EP++;if(!NSEEN[i]){NSEEN[i]=1;NORD.push(i);}NLOAD[i]=(NLOAD[i]||0)+a;};
  // t.g gives each egress a slot in t.v, so adding to it allocates nothing (a Map of numbers boxes every new sum).
  const carry=(l,eg,nr,ci,a)=>{let t=l.tr;if(!t){t=l.tr={g:new Map(),v:[],n:[],d:[]};EL.push(l);}const s=t.g.get(eg);if(s===undefined){t.g.set(eg,t.v.length);t.v.push(0+a);}else t.v[s]+=a;
    let k=l.i*NKN+nr;if(!SEN[k]){SEN[k]=1;t.n.push(nr);}ACN[k]=(ACN[k]||0)+a;k=l.i*NC+ci;if(!SED[k]){SED[k]=1;t.d.push(ci);}ACD[k]=(ACD[k]||0)+a;};
  // TEF[src*NC+dst]: 1 once no detour exists for that pair (capacity only shrinks, so there never will be one again).
  // Most calls are those: a byte read, not a Map lookup. The kept path is still valid while every edge and node on it has room.
  const altPath=(src,dst,base)=>{const key=src*NC+dst;if(TEF[key]===1)return null;const c0=teCache.get(key);
    if(c0){let ok=true;const p=c0.path,ni=c0.ni;for(let k=0;k<p.length;k++)if(!(p[k].res>1e-3)){ok=false;break;}
      if(ok)for(let k=0;k<ni.length;k++){const i=ni[k];if(HAS[i]&&!(NRES[i]>1e-3)){ok=false;break;}}
      if(ok)return c0;}
    const d=teSearch(src,dst);
    if(d===Infinity||d>REACH*base+60){teCache.set(key,false);TEF[key]=1;return null;}
    const Q=walkP(DJ.P,src,dst);teCache.set(key,Q);return Q;};
  /* Auto-TE's detour search (the one 10-dijkstra.js does to a stop), step for step: neighbours in the same order, the same heap, written into the
     same DJ (walkP() reads its paths, the reuse above its marks). Only on the graph as flat arrays (TEO offsets by city,
     TEN neighbours, TEE edges, made once per routing in run()) and with the test of an edge written out: no pairs to
     unpack and no call for each edge. On a big network with Auto-TE these searches were most of the routing. */
  /* A search from one POP picks up where the last one from there stopped (LR*), as a search of its own would run: every
     city closer than the last exit is settled and the heap holds the rest, so the next exit has its answer already or
     the search goes on from there, the last exit's neighbours first (it stops before them). One that found nothing has
     walked all src reaches and answers the next ones at once. Only on the same graph: EP counts the edges and routers
     that run out of room (capacity only shrinks while routing, so none comes back), and another search in DJ moves its
     mark. An exit out of the core is let into a graph of its own (OUT[dst]): that search neither resumes nor is resumed.
     On a big network nearly all detours of a flow are found from one search (extreme: 3.6 M heap steps a routing → 0.17 M). */
  let TEO=null,TEN=null,TEE=null,LRs=-1,LRe=-1,LRg=-1,LRD=null,LRu=-1,LRm=0;
  const teSearch=(src,dst)=>{const n=TEO.length-1,core=CORE,cut=!!(core&&OUT[dst]),go=LRs===src&&LRe===EP&&LRg===DJ.g&&LRD===DJ.D&&!cut;
    let g,m=0,u=-1;
    if(go){g=LRg;if(DJ.done[dst]===g)return DJ.D[dst];m=LRm;u=LRu;}
    else{if(DJ.n!==n||DJ.g>2e9){DJ.n=n;DJ.D=new Float64Array(n);DJ.P=new Array(n);DJ.S=new Int32Array(n);DJ.done=new Int32Array(n);DJ.g=0;}g=++DJ.g;}
    const D=DJ.D,P=DJ.P,ST=DJ.S,DN=DJ.done;let hd=DJ.hd,hu=DJ.hu,cap=hd.length;
    if(!go){D[src]=0;ST[src]=g;
      if(m===cap){cap*=2;const a=new Float64Array(cap),b=new Int32Array(cap);a.set(hd);b.set(hu);hd=DJ.hd=a;hu=DJ.hu=b;}
      let i=m++;hd[i]=0;hu[i]=src;while(i>0){const p=(i-1)>>1;if(hd[p]<=hd[i])break;const td=hd[p],tu=hu[p];hd[p]=hd[i];hu[p]=hu[i];hd[i]=td;hu[i]=tu;i=p;}}
    for(;;){
      if(u>=0){const d=D[u];for(let k=TEO[u],K=TEO[u+1];k<K;k++){const v=TEN[k],e=TEE[k];if(e.res<=1e-3||(HAS[v]&&NRES[v]<=1e-3)||(core&&OUT[v]&&v!==dst))continue;
        const nd=d+e.w;if(nd<(ST[v]===g?D[v]:Infinity)){D[v]=nd;ST[v]=g;P[v]=e;
          if(m===cap){cap*=2;const a=new Float64Array(cap),b=new Int32Array(cap);a.set(hd);b.set(hu);hd=DJ.hd=a;hu=DJ.hu=b;}
          let i=m++;hd[i]=nd;hu[i]=v;while(i>0){const p=(i-1)>>1;if(hd[p]<=hd[i])break;const td=hd[p],tu=hu[p];hd[p]=hd[i];hu[p]=hu[i];hd[i]=td;hu[i]=tu;i=p;}}}}
      if(!m){u=-1;break;}
      const d=hd[0];u=hu[0];m--;
      if(m){hd[0]=hd[m];hu[0]=hu[m];let i=0;for(;;){const l=2*i+1,r=l+1;let k=i;if(l<m&&hd[l]<hd[k])k=l;if(r<m&&hd[r]<hd[k])k=r;if(k===i)break;const td=hd[k],tu=hu[k];hd[k]=hd[i];hu[k]=hu[i];hd[i]=td;hu[i]=tu;i=k;}}
      if(DN[u]===g||d>(ST[u]===g?D[u]:Infinity)){u=-1;continue;}DN[u]=g;if(u===dst)break;}
    // An exit out of the core that was found sits in the heap of its own graph; one never found was never let in.
    if(cut&&u>=0)LRs=-1;else{LRs=src;LRe=EP;LRg=g;LRD=D;LRu=u;LRm=m;}
    return ST[dst]===g?D[dst]:Infinity;};
  /* The routing loops work on exits by number (xi, their index in E): what they read for every exit they look at sits in
     columns, USED, CAPX, CIX, HPX, DTX and VISX, and the lists they scan hold numbers (lst.x, lst.xat). Scanning objects of
     thirty fields each read one cache line per exit; the columns keep a list's exits side by side. The objects are only
     read for an exit that takes traffic (push()), and e.used is written back once routing is done (run()). */
  // An exit the flow can still try: not visited yet, not full when the flow started, reachable, and not on a saturated path.
  const usable=x=>VISX[x]!==vis&&USED[x]<CAPX[x]&&Dv[CIX[x]]<Infinity&&!gone(x),byDist=(a,b)=>HPX[a]-HPX[b]||Dv[CIX[a]]-Dv[CIX[b]]+(DTX[a]-DTX[b]);
  // Push up to `want` along one path to exit e; returns what fitted. Index loops: for…of allocates an iterator until optimised. Capacity only shrinks while routing, so a
  // path with one full link or node fits nothing for the rest of this pass: mark it, and later tries cost nothing
  // (most tries are into paths that filled up earlier).
  const push=(x,P,want,keep=0)=>{if(P.dead)return 0;const e=E[x];const path=P.path,ni=P.ni;let amt=want;
    const PN=path.length;for(let k=0;k<PN;k++){const l=path[k],r=l.res;if(r<=1e-6){P.dead=1;return 0;}amt=Math.min(amt,r-l.cap*keep);}
    const last=ni.length-1;
    for(let k=0;k<=last;k++){const i=ni[k];if(!HAS[i])continue;const r=NRES[i];if(r<=1e-6){P.dead=1;return 0;}const w=k&&k<last?PASS[i]:1;amt=Math.min(amt,r/w);}
    if(amt<=1e-6)return 0;
    for(let k=0;k<=last;k++){const i=ni[k];if(HAS[i])nodeTake(i,k&&k<last?amt*PASS[i]:amt);}
    const ek=e.ek,nr=fnj,ci=fci;if(!e.told||e.dup){R2.egDesc[ek]=e.desc||(e.desc={lab:e.lab,city:e.city,k:e.k});e.told=true;}
    for(let k=0;k<PN;k++){const l=path[k],o=l.res;l.res=o-amt;if(o>1e-3&&l.res<=1e-3)EP++;l.ld+=amt;carry(l,ek,nr,ci,amt);}
    USED[x]+=amt;FREM[F]-=amt;
    {let ok=amt;const cf=CNB[ci],ce=e.cn,cn=NCN[nr],bz=FBZ[F]===1;
      if(cf!==ce||(cf&&!cn)||(!cf&&cn&&e.k==='t')){const prem=(e.k==='t'&&e.prem)||(e.k==='p'&&e.pnc)||path.some(x=>x.links&&x.links.some(y=>y.premium));const loss=prem?0.03:(ev.gfw>day?0.35:0.2);R2.gfwLost+=amt*loss;R2.gfwCross+=amt;ok=amt*(1-loss);}
      SRV[ci]+=ok;R2.served+=ok;if(bz)R2.bizSrv[CITIES[ci].id]+=ok;if(e.rank<=2)R2.peered+=ok;if(e.k==='t'){const k=e.ts*NN+nr;if(!TNS[k]){TNS[k]=1;if(!TNK[e.ts]){TNK[e.ts]=[];TORD.push(e);}TNK[e.ts].push(nr);}TNA[k]+=ok;}
        // Backhaul to transit: users notice the round trip to the exit. Up to 20 ms (about 1,500 km) is free, then
        // it gets worse, and past 50 ms broadband and internet services count as bad service (#…). Under sender pays,
        // Korean users notice any exit far away, transit or not, and much sooner.
        if(path.length&&(e.k==='t'||snd&&CITIES[ci].kr)){let ms=P.ms;if(ms<0){ms=0;for(let k=0;k<PN;k++)ms+=path[k].lat;P.ms=ms;}const rtt=2*ms,kl=snd&&CITIES[ci].kr;
          if(rtt>(kl?KR_LAT_OK:LAT_OK)){LATP[ci]+=ok*(kl?krLatLoss(rtt):latLoss(rtt));if(!P.fg){P.fg=0;FARL.push(P,ci,e.ci);}P.fg+=ok;}}const kx=e.kx;if(EGT[kx]===0&&!EGO.includes(kx))EGO.push(kx);EGT[kx]+=ok;if(!NEG[nr]){NEG[nr]=R2.netEg[NET_IDS[nr]]={c:0,p:0,ix:0,t:0};NEO.push(nr);}NEA[nr*4+kx]+=ok;
      // Where each flow left (the PNI list asks what a PNI here would take over, #175).
      if(e.J>0){const m=e.byC||(e.byC=new Map()),v=m.get(ci);if(v){v[0]+=ok;if(bz)v[1]+=ok;}else m.set(ci,[ok,bz?ok:0]);}
      if(e.k==='t'){FGT[F]+=ok;FTI[F]=e.xi;}else if(e.k==='ix'){FGI[F]+=ok;FII[F]=e.xi;}else if(e.k==='p'){if(e.ci===ci&&e.net===NET_IDS[nr])FGH[F]+=ok;else FGP[F]+=ok;}}
    return amt;
  };
  // Shortest path first. With Auto-TE, whatever does not fit spills onto up to two alternate paths
  // with free capacity, as long as they are no more than twice as long.
  const send=(x,want)=>{
    let room=Math.min(want,FREM[F],CAPX[x]-USED[x]);if(room<=1e-6)return;const ci=CIX[x];
    const P=PP[ci]||(PP[ci]=walkP(Pv,fci,ci));if(TT&&ci!==fci){room=tiers(x,P,room,ci);if(room<=1e-6)return;}
    if(!P.dead)room-=push(x,P,room,TE&&SPILL<1?1-SPILL:0);
    if(TE&&room>1e-6&&FREM[F]>1e-6&&USED[x]<CAPX[x]&&ci!==fci)for(let k=0;k<2&&room>1e-6;k++){const P=altPath(fci,ci,Dv[ci]);if(!P)break;const m=push(x,P,Math.min(room,CAPX[x]-USED[x]));if(m<=1e-6)break;room-=m;R2.teMoved+=m;}
  };
  /* Spill tiers (#136, `spill at 80% within 10 ms`): the shortest path fills up to a tier's line, then what does not fit
     takes the fastest detour whose links are all still under that line, if it adds no more than the tier's milliseconds;
     the next tier lets links run hotter and detours longer. After the last tier the usual rules above take over. A detour
     is searched by latency over the links under the line (tierSearch), and kept per pair and tier while it still is:
     links only fill up while routing, so a pair with no detour under a line never gets one. */
  const pathMs=P=>{let ms=P.ms;if(ms<0){ms=0;const p=P.path;for(let k=0;k<p.length;k++)ms+=p[k].lat;P.ms=ms;}return ms;};
  let TC=null,TSD=null,TSP=null,TSS=null,TSG=0,TH=[],THU=[];
  const tierSearch=(src,dst,keep,lim)=>{const n=TEO.length-1,core=CORE;if(!TSD||TSD.length!==n){TSD=new Float64Array(n);TSP=new Array(n);TSS=new Int32Array(n);TSG=0;}
    const g=++TSG,D=TSD,P=TSP,ST=TSS;let m=0;D[src]=0;ST[src]=g;TH[0]=0;THU[0]=src;m=1;
    while(m){let best=0;for(let i=1;i<m;i++)if(TH[i]<TH[best])best=i;const d=TH[best],u=THU[best];m--;TH[best]=TH[m];THU[best]=THU[m];
      if(d>D[u])continue;if(u===dst)break;
      for(let k=TEO[u],K=TEO[u+1];k<K;k++){const v=TEN[k],e=TEE[k];if(!(e.res>e.cap*keep+1e-3)||(HAS[v]&&NRES[v]<=1e-3)||(core&&OUT[v]&&v!==dst))continue;
        const nd=d+e.lat;if(nd>lim||!(nd<(ST[v]===g?D[v]:Infinity)))continue;D[v]=nd;ST[v]=g;P[v]=e;TH[m]=nd;THU[m]=v;m++;}}
    return ST[dst]===g?walkP(P,src,dst):null;};
  const tierPath=(t,keep,src,dst,lim)=>{const key=(src*NC+dst)*TT.length+t,c=TC.get(key);if(c===false)return null;
    if(c){let ok=true;const p=c.path,ni=c.ni;for(let k=0;k<p.length;k++)if(!(p[k].res>p[k].cap*keep+1e-3)){ok=false;break;}
      if(ok)for(let k=0;k<ni.length;k++){const i=ni[k];if(HAS[i]&&!(NRES[i]>1e-3)){ok=false;break;}}
      if(ok)return pathMs(c)<=lim?c:null;}
    const Q=tierSearch(src,dst,keep,Infinity);TC.set(key,Q||false);return Q&&pathMs(Q)<=lim?Q:null;};
  const tiers=(x,P,room,ci)=>{for(let t=0;t<TT.length&&room>1e-6;t++){const T=TT[t],keep=1-T.at;
      room-=push(x,P,room,keep);
      if(room<=1e-6||FREM[F]<=1e-6||!(USED[x]<CAPX[x]))break;
      const Q=tierPath(t,keep,fci,ci,pathMs(P)+T.ms);if(!Q||Q.path===P.path)continue;
      const m=push(x,Q,Math.min(room,CAPX[x]-USED[x]),keep);if(m>1e-6){room-=m;R2.teMoved+=m;}}
    return room;};
  // Exits with the same preference and the same IGP distance form an ECMP group: spread the flow over
  // them by free capacity (like several transits in one city), then top up in order if one fills.
  // The group is g[i0..i1): plain loops and one scratch array, since this runs for most flows (same sums, same order).
  // Without Auto-TE an exit whose path from here is full takes nothing: skip the call (and the numbers it boxes).
  const gone=x=>{if(TE)return false;const P=PP[CIX[x]];return !!P&&P.dead===1;};
  // Every exit of a remembered group still has room (a loop, not every(): no closure per flow). NOG: no group.
  const allRoom=c=>{for(let k=0;k<c.length;k++){const x=c[k];if(!(USED[x]<CAPX[x])||gone(x))return false;}return true;},NOG=[];
  /* dud(x): send() to x would do nothing, its path from here is full and, with Auto-TE, no detour exists (TEF) or the
     exit is here. Both last for the rest of the routing. Most exits a flow tries once its first group is full are such
     (seven in eight sends on a big network): they keep their share of a group's room, but are not called. */
  const dud=x=>{const ci=CIX[x],P=PP[ci];return P!==undefined&&P.dead===1&&(!TE||ci===fci||TEF[fci*NC+ci]===1);};
  const ROOM=[],sendGroup=(g,i0=0,i1=g.length)=>{let live=false;for(let k=i0;k<i1;k++){const x=g[k];VISX[x]=vis;if(!live&&!dud(x))live=true;}
    if(!live)return;
    if(i1-i0>1){let tot=0;for(let k=i0;k<i1;k++){const x=g[k],r=Math.max(0,CAPX[x]-USED[x]);ROOM[k-i0]=r;tot+=r;}const want=FREM[F];if(tot>1e-6)for(let k=i0;k<i1;k++)if(!dud(g[k]))send(g[k],want*ROOM[k-i0]/tot);}
    for(let k=i0;k<i1;k++){if(FREM[F]<=1e-6)break;if(!dud(g[k]))send(g[k],FREM[F]);}};
  // Stable, in place: short lists by insertion (no garbage), long ones by the built-in sort. Both are stable with the
  // same comparison, so the order is the same either way.
  // n: sort only a[0..n) (the group G holds GN exits).
  const sortD=(a,n=a.length)=>{if(n>24){if(n===a.length)a.sort(byDist);else{const t=a.slice(0,n).sort(byDist);for(let i=0;i<n;i++)a[i]=t[i];}return;}for(let i=1;i<n;i++){const x=a[i];let j=i-1;while(j>=0&&byDist(a[j],x)>0){a[j+1]=a[j];j--;}a[j+1]=x;}};
  // The direct ranks (25-direct-egress.js) have short lists, one carrier's ports, so they take the plain way: the usable exits
  // nearest first, tried in groups of equal distance, as the reference loop in the tests does. A direct rank only concerns the
  // networks that have an exit there, and nothing from a POP where Prefer has the say; a port that is not set to carry only takes
  // its own POP's traffic. Kept in a function of its own so the loop below stays as it was: the JIT is sensitive to its shape.
  const directPass=(rank,pass)=>{const DS=DSEL.get(rank),LOC=rank===DIRECT_RANK[1][1]||rank===DIRECT_RANK[2][1],BR=byRank(rank);
    for(F=0;F<NF;F++){fnj=FNJ[F];fci=FCI[F];
      if(FREM[F]<=1e-6||DS[fnj]===0||PREFC[fci]===1||(pass!==0&&FBZ[F]!==(pass===1?1:0)))continue;
      let lst=BR[fnj];if(!lst)continue;if(lst.cs){lst=lst.cs[COMP[fci]];if(!lst)continue;}
      Dv=SDi[fci];Pv=SPi[fci];PP=walked[fci]||(walked[fci]=[]);vis++;
      REST.length=0;
      if(LOC){const here=lst.xat.get(fci);if(!here)continue;for(let h=0;h<here.length;h++)if(usable(here[h]))REST.push(here[h]);}
      else{const L=lst.x;for(let li=0;li<L.length;li++)if(usable(L[li]))REST.push(L[li]);}
      sortD(REST);
      for(let i=0;i<REST.length&&FREM[F]>1e-6;){let j=i+1;while(j<REST.length&&HPX[REST[j]]===HPX[REST[i]]&&Math.abs(Dv[CIX[REST[j]]]-Dv[CIX[REST[i]]]+(DTX[REST[j]]-DTX[REST[i]]))<1e-6)j++;sendGroup(REST,i,j);i=j;}}};
  /* One rank of one pass over every flow. Each hot loop of compute() sits in a function of its own: V8 optimises a small
     function quickly and keeps it, while compute() as a whole is too big to optimise cheaply (it would run unoptimised,
     boxing every number, and be compiled again and again in the background). The tables of a flow's city (distances,
     paths) are set up only once it has an exit list at this rank. */
  const rankPass=(rank,pass)=>{const BR=byRank(rank);
    for(F=0;F<NF;F++){
      if(FREM[F]<=1e-6||(rank===0&&FCA[F]===0)||(pass!==0&&FBZ[F]!==(pass===1?1:0)))continue;
      fnj=FNJ[F];let lst=BR[fnj];if(!lst)continue;fci=FCI[F];if(lst.cs){lst=lst.cs[COMP[fci]];if(!lst)continue;}
      Dv=SDi[fci];Pv=SPi[fci];PP=walked[fci]||(walked[fci]=[]);vis++;
      /* Groups are tried nearest first, preferred exits before the rest, in the order a stable sort of the usable
         exits gives. Exits only fill up once tried, so the usable ones stay the same until then. Nearly every flow
         fits in its first group: find that one with a scan (nothing is visited yet), and sort only what is left
         when it does not fit. Most often the group is the POP's own exits: with no preferred exit on the list
         and no other city at distance 0, the usable ones here are exactly the first group, already in order.
         The group is G[0..GN): emptying an array (length=0) gives back its storage, and the next push allocates it again. */
      GN=0;
      if(!lst.hi&&!lst.mx&&ALONE[fci]){const here=lst.xat.get(fci);if(here)for(let h=0;h<here.length;h++){const x=here[h];if(USED[x]<CAPX[x]&&!gone(x))G[GN++]=x;}}
      if(!GN){
        // One scan: the best (preference, distance) so far and, in list order, the exits within 1e-6 of it. The best
        // distance only goes down, so dropping the ones it leaves behind gives exactly the exits a second scan would.
        // Exits that are full stay full for this pass: when a quarter of a list is, it is rewritten without them.
        /* gc[ci]: the first group this list gave a flow from city ci. Exits only fill up during routing, so while all of
           them still have room no other exit can have become better, and the scan would find the same group (an
           empty one, no usable exit, stays empty). */
        const gc=lst.gc,c=gc[fci];
        if(c!==undefined&&allRoom(c)){if(!c.length)continue;for(let k=0;k<c.length;k++)G[GN++]=c[k];}else{
        if(lst.ord){
        /* The list in this city's order, kept by the route cache (xOrder()): the first group is where it starts, past
           the exits that are full or on a full path. Those stay so for the rest of the routing, so the start (cur) only
           moves on. The group is the next exits of the same preference within 1e-6 of the first one's distance, in the
           order the sort gave them: what the scan below finds. */
        const A=xOrder(lst,fci),N=A.length,cur=lst.cur;let k=cur[fci]|0;while(k<N&&(USED[A[k]]>=CAPX[A[k]]||gone(A[k])))k++;cur[fci]=k;
        if(k===N){gc[fci]=NOG;continue;}
        const bh=HPX[A[k]],bd=Dv[CIX[A[k]]]+DTX[A[k]];
        for(let i=k;i<N;i++){const x=A[i];if(HPX[x]!==bh||Dv[CIX[x]]+DTX[x]-bd>=1e-6)break;if(USED[x]<CAPX[x]&&!gone(x))G[GN++]=x;}
        gc[fci]=G.slice(0,GN);}else{
        let bh=2,bd=Infinity,full=0;const L=lst.x;
        for(let li=0,LN=L.length;li<LN;li++){const e=L[li];if(USED[e]>=CAPX[e]||gone(e)){full++;continue;}const d=Dv[CIX[e]]+DTX[e];if(d===Infinity)continue;const h=HPX[e];
          if(h<bh){bh=h;bd=d;GN=0;G[GN++]=e;}
          else if(h===bh){if(d<bd){bd=d;let k=0;for(let gi=0;gi<GN;gi++){const x=G[gi];if(Dv[CIX[x]]+DTX[x]-d<1e-6)G[k++]=x;}GN=k;G[GN++]=e;}else if(d-bd<1e-6)G[GN++]=e;}}
        if(full*4>=L.length&&full){let k=0;for(let li=0;li<L.length;li++){const e=L[li];if(USED[e]<CAPX[e])L[k++]=e;}L.length=k;}
        if(bh>1){gc[fci]=NOG;continue;}
        if(GN>1)sortD(G,GN);gc[fci]=G.slice(0,GN);}}}
      sendGroup(G,0,GN);
      if(FREM[F]<=1e-6)continue;
      // What is left, nearest first: with a kept order, the usable exits in it (the order sorting them gives).
      REST.length=0;if(lst.ord){const A=xOrder(lst,fci);for(let i=lst.cur[fci]|0;i<A.length;i++)if(usable(A[i]))REST.push(A[i]);}
      else{const L=lst.x;for(let li=0;li<L.length;li++)if(usable(L[li]))REST.push(L[li]);sortD(REST);}
      for(let i=0;i<REST.length&&FREM[F]>1e-6;){
        let j=i+1;while(j<REST.length&&HPX[REST[j]]===HPX[REST[i]]&&Math.abs(Dv[CIX[REST[j]]]-Dv[CIX[REST[i]]]+(DTX[REST[j]]-DTX[REST[i]]))<1e-6)j++;
        sendGroup(REST,i,j);i=j;
      }
    }};
  /* xOrder(lst, ci): the list's exits that city ci reaches, in a stable sort by preference and distance from ci (byDist,
     the comparison the scans sort their finds with). It only follows from the network's shape (distances, the exits and
     how they are preferred), so the route cache keeps it with the list (lst.ord, 29-route-cache.js): made the first time
     a flow from ci uses the list on a day the cache is used, then read every day until the shape changes. A list made
     fresh (the shape just changed) has no lst.ord and is scanned instead: one scan costs less than a sort. */
  const xOrder=(lst,ci)=>{let a=lst.ord[ci];if(a===undefined){const b=[],L=lst.x;
    for(let i=0;i<L.length;i++){const x=L[i];if(Dv[CIX[x]]<Infinity)b.push(x);}b.sort(byDist);a=lst.ord[ci]=Int32Array.from(b);}return a;};
  /* Each exit list once as a list object, all of one shape: x the exits by number in list order, xat by city, hi whether
     one is preferred, gc the first group each city found, ord the orders the route cache keeps (null on a fresh build),
     cur where each city's usable exits start in its order, cs the lists by island. */
  const lx=(A,W)=>{let w=W.get(A);if(w)return w;
    if(A.cs)w={x:null,xat:null,hi:false,mx:false,gc:null,ord:null,cur:null,cs:A.cs.map(s=>s&&lx(s,W))};
    else{const xat=new Map();for(const [c,h] of A.at)xat.set(c,h.map(e=>e.xi));w={x:A.map(e=>e.xi),xat,hi:!!A.hi,mx:!!A.mx,gc:[],ord:A.ord||null,cur:[],cs:null};}
    W.set(A,w);return w;};
  return {nodeTake,carry,
    nodes(o){({NRES,NSEEN,NORD,NLOAD,EL,NKN,SEN,ACN,NC,SED,ACD}=o);},
    run(o,PASSES,RANKS,RSET){({E,HAS,PASS,R2,FREM,FNJ,FCI,FCA,FBZ,NF,CNB,NCN,ev,day,SRV,TNS,NN,TNK,TORD,TNA,snd,LATP,FARL,EGT,EGO,NEG,NEO,NEA,FGT,FTI,FGI,FII,FGH,FGP,
        TE,SPILL,TT,teCache,adj,CORE,OUT,REACH,DSEL,PREFC,BRJ,COMP,SDi,SPi,ALONE,TR,base,eff}=o);
      NX=E.length;USED=new Float64Array(NX);CAPX=new Float64Array(NX);CIX=new Int32Array(NX);HPX=new Uint8Array(NX);DTX=new Float64Array(NX);VISX=new Int32Array(NX);
      for(let x=0;x<NX;x++){const e=E[x];USED[x]=e.used;CAPX[x]=e.cap;CIX[x]=e.ci;HPX[x]=e.hp;DTX[x]=e.dt;}
      F=0;fci=0;fnj=0;Dv=null;Pv=null;PP=null;vis=0;GN=0;walked=[];EP=0;LRs=-1;LRD=null;
      TC=TT?new Map():null;
      if(TE){const n=adj.length;TEO=new Int32Array(n+1);let k=0;for(let u=0;u<n;u++){TEO[u]=k;const a=adj[u];if(a)k+=a.length;}TEO[n]=k;
        TEN=new Int32Array(k);TEE=new Array(k);k=0;for(let u=0;u<n;u++){const a=adj[u];if(a)for(let j=0;j<a.length;j++){TEN[k]=a[j][0];TEE[k]=a[j][1];k++;}}}TEF=TE?new Uint8Array(NC*NC):null;
      const W=new Map();BRX=new Array(BRJ.length);for(let j=0;j<BRJ.length;j++){const m=BRJ[j],b={};for(const r in m)b[r]=lx(m[r],W);BRX[j]=b;}
      for(const pass of PASSES)for(const rank of RANKS){
        if(!RSET.has(rank))continue;
        if(DSEL.has(rank)){directPass(rank,pass);continue;}
        rankPass(rank,pass);
      }
      for(let x=0;x<NX;x++)E[x].used=USED[x];
      // Nothing of this day is kept: the next run() sets its own.
      E=R2=BRJ=BRX=SDi=SPi=teCache=TEF=TEE=TC=null;TSD=TSP=null;walked=[];}};
}
// The core in use (a test can put the plain one in its place: tests/speed.test.js).
let ROUTE=routeCore();
